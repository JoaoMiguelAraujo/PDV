import 'server-only';
import { prisma } from './db';
import { logger } from './logger';
import {
    fetchOrderFromURL,
    callConfirm,
    callPreparing,
    callDelivered,
    callRequestCancellation,
    callAcceptCancellation,
    callDenyCancellation,
    type CallResult,
} from './menugo-client';
import type { ODOrder, ODRequestCancelled, ODRequestDenied } from './od-types';
import type { Merchant, Order } from '@prisma/client';
import { getSettings } from './settings';

/**
 * Lógica de negócio do PDV: cria/atualiza Order a partir do GET orderURL,
 * aplica callbacks ao menuGo e atualiza o estado local.
 */

/**
 * Faz GET orderURL, persiste raw na OdEvent e cria/atualiza a Order local.
 * Retorna o status HTTP do GET.
 */
export async function ingestOrderFromURL(
    odEventId: number,
    merchant: Merchant,
    orderId: string,
    orderURL: string,
): Promise<number> {
    const { status, body } = await fetchOrderFromURL(orderURL);

    await prisma.odEvent.update({
        where: { id: odEventId },
        data: { orderDetail: body || null, orderDetailStatus: status || null },
    });

    if (status !== 200) {
        logger.warn('ingest/order GET nao 200', { orderId, status });
        return status;
    }

    let parsed: ODOrder;
    try {
        parsed = JSON.parse(body);
    } catch {
        logger.warn('ingest/order JSON invalido', { orderId });
        return status;
    }
    if (!parsed || !Array.isArray(parsed.items)) {
        logger.warn('ingest/order body sem items', { orderId });
        return status;
    }

    const total = parsed.total?.orderAmount?.value ?? null;
    const mesa = parsed.indoor?.table ?? null;
    const cliente = parsed.customer?.name ?? parsed.extraInfo ?? null;

    await prisma.order.upsert({
        where: { orderId: parsed.id },
        create: {
            merchantId: merchant.id,
            orderId: parsed.id,
            displayId: parsed.displayId ?? null,
            orderType: parsed.type ?? null,
            rawOrder: body,
            totalValor: total !== null ? (total as any) : null,
            mesa: mesa,
            cliente: cliente,
        },
        update: {
            // Atualiza só campos da snapshot — preserva status do PDV.
            displayId: parsed.displayId ?? null,
            orderType: parsed.type ?? null,
            rawOrder: body,
            totalValor: total !== null ? (total as any) : null,
            mesa: mesa,
            cliente: cliente,
        },
    });
    return status;
}

/**
 * Calcula preparationTime (minutos) a partir da Order parseada e do merchant:
 *  - se pelo menos um item tem produto.preparoMin, retorna o MAX
 *  - senão, retorna merchant.averagePreparationTime se setado
 *  - senão, null (não envia o campo)
 */
async function calcularPreparationTime(order: Order, merchant: Merchant): Promise<number | null> {
    try {
        const parsed = JSON.parse(order.rawOrder);
        const externalCodes: string[] = Array.isArray(parsed?.items)
            ? parsed.items.map((i: any) => i?.externalCode).filter(Boolean)
            : [];
        if (externalCodes.length > 0) {
            // Resolve produtos por codigoExterno OU sku interno (snapshot externalCode pode ser qualquer dos dois).
            const produtos = await prisma.produto.findMany({
                where: {
                    merchantId: merchant.id,
                    OR: [
                        { codigoExterno: { in: externalCodes } },
                        { sku: { in: externalCodes } },
                    ],
                },
                select: { preparoMin: true },
            });
            const minutosMax = produtos.reduce((max, p) => p.preparoMin != null && p.preparoMin > max ? p.preparoMin : max, 0);
            if (minutosMax > 0) return minutosMax;
        }
    } catch {
        // ignora — caímos no fallback
    }
    return merchant.averagePreparationTime ?? null;
}

/** Gera orderExternalCode para o /confirm (sequencial por merchant + sufixo aleatório curto). */
async function generateExternalCode(merchantId: number): Promise<string> {
    const count = await prisma.order.count({
        where: { merchantId, NOT: { externalCode: null } },
    });
    const seq = String(count + 1).padStart(5, '0');
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `PDV-${seq}-${suffix}`;
}

async function recordCallback(
    orderRowId: number,
    type: string,
    triggeredBy: 'MANUAL' | 'AUTO',
    requestBody: any,
    result: CallResult,
): Promise<void> {
    await prisma.callback.create({
        data: {
            orderId: orderRowId,
            type,
            triggeredBy,
            requestBody: requestBody !== undefined ? JSON.stringify(requestBody) : null,
            httpStatus: result.httpStatus || null,
            responseBody: result.responseBody || null,
            erro: result.erro,
        },
    });
}

export interface CallbackOutcome {
    ok: boolean;
    httpStatus: number;
    erro: string | null;
}

export async function doConfirm(
    order: Order,
    merchant: Merchant,
    triggeredBy: 'MANUAL' | 'AUTO',
    options?: { preparationTime?: number; reason?: string },
): Promise<CallbackOutcome> {
    if (order.status !== 'NEW') {
        return { ok: false, httpStatus: 0, erro: `Status atual ${order.status} não permite confirm` };
    }
    const settings = await getSettings();
    const externalCode = order.externalCode ?? (await generateExternalCode(merchant.id));
    // preparationTime (em minutos) — preferência:
    //   1. options explícito (UI/API)
    //   2. max(preparoMin) dos produtos do pedido (via externalCode → Produto)
    //   3. merchant.averagePreparationTime (BasicInfo OD)
    let preparationTime = options?.preparationTime;
    if (!preparationTime) {
        preparationTime = (await calcularPreparationTime(order, merchant)) ?? undefined;
    }
    const body = {
        createdAt: new Date().toISOString(),
        orderExternalCode: externalCode,
        ...(preparationTime ? { preparationTime } : {}),
        ...(options?.reason ? { reason: options.reason } : {}),
    };
    const result = await callConfirm(merchant, order.orderId, body, settings.payOnConfirm);
    await recordCallback(order.id, 'confirm', triggeredBy, body, result);
    if (result.ok) {
        await prisma.order.update({
            where: { id: order.id },
            data: { status: 'CONFIRMED', confirmadoEm: new Date(), externalCode },
        });
    }
    return { ok: result.ok, httpStatus: result.httpStatus, erro: result.erro };
}

export async function doPreparing(
    order: Order,
    merchant: Merchant,
    triggeredBy: 'MANUAL' | 'AUTO',
): Promise<CallbackOutcome> {
    if (order.status !== 'CONFIRMED') {
        return { ok: false, httpStatus: 0, erro: `Status atual ${order.status} não permite preparing` };
    }
    const result = await callPreparing(merchant, order.orderId);
    await recordCallback(order.id, 'preparing', triggeredBy, undefined, result);
    if (result.ok) {
        await prisma.order.update({
            where: { id: order.id },
            data: { status: 'PREPARING', preparandoEm: new Date() },
        });
    }
    return { ok: result.ok, httpStatus: result.httpStatus, erro: result.erro };
}

export async function doDelivered(
    order: Order,
    merchant: Merchant,
    triggeredBy: 'MANUAL' | 'AUTO',
): Promise<CallbackOutcome> {
    if (order.status !== 'CONFIRMED' && order.status !== 'PREPARING') {
        return { ok: false, httpStatus: 0, erro: `Status atual ${order.status} não permite delivered` };
    }
    const result = await callDelivered(merchant, order.orderId);
    await recordCallback(order.id, 'delivered', triggeredBy, undefined, result);
    if (result.ok) {
        await prisma.order.update({
            where: { id: order.id },
            data: { status: 'DELIVERED', entregueEm: new Date() },
        });
    }
    return { ok: result.ok, httpStatus: result.httpStatus, erro: result.erro };
}

export async function doCancel(
    order: Order,
    merchant: Merchant,
    triggeredBy: 'MANUAL' | 'AUTO',
    body: ODRequestCancelled,
): Promise<CallbackOutcome> {
    if (order.status === 'DELIVERED' || order.status === 'CANCELLED') {
        return { ok: false, httpStatus: 0, erro: `Pedido já está em ${order.status}` };
    }
    const result = await callRequestCancellation(merchant, order.orderId, body);
    await recordCallback(order.id, 'requestCancellation', triggeredBy, body, result);
    if (result.ok) {
        await prisma.order.update({
            where: { id: order.id },
            data: {
                status: 'CANCELLED',
                canceladoEm: new Date(),
                cancelMotivo: body.reason,
                cancelCode: body.code,
                cancelRequested: false,
            },
        });
    }
    return { ok: result.ok, httpStatus: result.httpStatus, erro: result.erro };
}

/**
 * PDV aceita um ORDER_CANCELLATION_REQUEST disparado pela OA.
 * → POST /v1/orders/{orderId}/acceptCancellation (spec OD v1.7)
 * Em caso de sucesso, status local vai para CANCELLED e a flag é limpa.
 */
export async function doAcceptCancellation(
    order: Order,
    merchant: Merchant,
    triggeredBy: 'MANUAL' | 'AUTO',
): Promise<CallbackOutcome> {
    if (!order.cancelRequested) {
        return { ok: false, httpStatus: 0, erro: 'Sem ORDER_CANCELLATION_REQUEST pendente para este pedido' };
    }
    if (order.status === 'DELIVERED' || order.status === 'CANCELLED') {
        return { ok: false, httpStatus: 0, erro: `Pedido já está em ${order.status}` };
    }
    const result = await callAcceptCancellation(merchant, order.orderId);
    await recordCallback(order.id, 'acceptCancellation', triggeredBy, undefined, result);
    if (result.ok) {
        await prisma.order.update({
            where: { id: order.id },
            data: {
                status: 'CANCELLED',
                canceladoEm: new Date(),
                cancelRequested: false,
            },
        });
    }
    return { ok: result.ok, httpStatus: result.httpStatus, erro: result.erro };
}

/**
 * PDV nega um ORDER_CANCELLATION_REQUEST disparado pela OA.
 * → POST /v1/orders/{orderId}/denyCancellation (spec OD v1.7)
 * Apenas dois códigos da spec são aceitos: DISH_ALREADY_DONE | OUT_FOR_DELIVERY.
 * Em caso de sucesso, mantém o status atual, limpa a flag e grava o motivo.
 */
export async function doDenyCancellation(
    order: Order,
    merchant: Merchant,
    triggeredBy: 'MANUAL' | 'AUTO',
    body: ODRequestDenied,
): Promise<CallbackOutcome> {
    if (!order.cancelRequested) {
        return { ok: false, httpStatus: 0, erro: 'Sem ORDER_CANCELLATION_REQUEST pendente para este pedido' };
    }
    const result = await callDenyCancellation(merchant, order.orderId, body);
    await recordCallback(order.id, 'denyCancellation', triggeredBy, body, result);
    if (result.ok) {
        await prisma.order.update({
            where: { id: order.id },
            data: {
                cancelRequested: false,
                cancelMotivo: body.reason,
                cancelCode: body.code,
            },
        });
    }
    return { ok: result.ok, httpStatus: result.httpStatus, erro: result.erro };
}
