import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { verifySignature } from '@/lib/signature';
import { decryptSecret } from '@/lib/crypto-secrets';
import { ingestOrderFromURL } from '@/lib/orders';
import { scheduleAutoTimeline } from '@/lib/auto-runner';
import type { ODEvent, ODEventType } from '@/lib/od-types';

// Spec OD v1.7 (eventType): qualquer valor fora deste set é bug do remetente.
const VALID_EVENT_TYPES: ReadonlySet<ODEventType> = new Set([
    'CREATED',
    'CONFIRMED',
    'PREPARATION_REQUESTED',
    'PREPARING',
    'DISPATCHED',
    'READY_FOR_PICKUP',
    'PICKUP_AREA_ASSIGNED',
    'PICKED_UP',
    'DELIVERED',
    'CONCLUDED',
    'CANCELLATION_REQUESTED',
    'CANCELLATION_REQUEST_DENIED',
    'CANCELLED',
    'ORDER_CANCELLATION_REQUEST',
    'CANCELLED_DENIED',
]);

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Open Delivery v1.7 — webhook oficial do Software Service.
 *   POST /v1/newEvent
 *
 * Spec (docs/openapi.yaml linha 2592):
 *  - 3 headers obrigatórios: X-App-Id, X-App-MerchantId, X-App-Signature
 *  - body: schema Event { eventId, eventType, orderId, orderURL, createdAt, sourceAppId?, virtualBrand? }
 *  - resposta: 204 No Content (200 aceito por compatibilidade, mas use 204)
 *
 * Comportamento do PDV:
 *  1. Valida que os 3 headers chegaram → 400 senão.
 *  2. Resolve o Merchant pelo header X-App-MerchantId → 404 se não cadastrado.
 *  3. Valida HMAC-SHA256(body, merchant.clientSecret) === X-App-Signature → 403 senão.
 *  4. Persiste o evento bruto em OdEvent (audit trail) — mesmo se HMAC inválido.
 *  5. Se eventType=CREATED: faz GET orderURL → cria/atualiza Order (status=NEW).
 *  6. Se eventType=CREATED + Settings.auto_mode: agenda timeline auto.
 *  7. Retorna 204.
 */
export async function POST(req: Request) {
    const appId = req.headers.get('x-app-id');
    const merchantIdHeader = req.headers.get('x-app-merchantid');
    const signature = req.headers.get('x-app-signature');
    const bodyText = await req.text();

    const missing: string[] = [];
    if (!appId) missing.push('X-App-Id');
    if (!merchantIdHeader) missing.push('X-App-MerchantId');
    if (!signature) missing.push('X-App-Signature');
    if (missing.length) {
        return NextResponse.json(
            { error: 'BadRequest', message: `Headers obrigatórios ausentes: ${missing.join(', ')}` },
            { status: 400 },
        );
    }

    // Resolução de merchant (= identidade do remetente).
    const merchant = await prisma.merchant.findUnique({
        where: { merchantId: merchantIdHeader! },
    });

    if (!merchant) {
        // Persiste o evento mesmo sem merchant resolvido — útil pra debug
        // ("alguém está mandando pro PDV com merchantId X que eu nem conheço").
        await persistEvent({
            merchantId: null,
            appIdHeader: appId!,
            merchantIdHeader: merchantIdHeader!,
            signature: signature!,
            body: bodyText,
            valid: false,
            erro: 'merchant não cadastrado',
        });
        return NextResponse.json(
            { error: 'NotFound', message: 'Merchant não encontrado' },
            { status: 404 },
        );
    }

    if (!merchant.ativo) {
        await persistEvent({
            merchantId: merchant.id,
            appIdHeader: appId!,
            merchantIdHeader: merchantIdHeader!,
            signature: signature!,
            body: bodyText,
            valid: false,
            erro: 'merchant desativado',
        });
        return NextResponse.json(
            { error: 'AccessDenied', message: 'Merchant desativado' },
            { status: 403 },
        );
    }

    // Verifica HMAC.
    let secret: string;
    try {
        secret = decryptSecret(merchant.clientSecretEnc);
    } catch (err: any) {
        logger.error('newEvent/decrypt erro', { merchantId: merchant.id, message: err?.message });
        return NextResponse.json({ error: 'ServiceUnavailable' }, { status: 503 });
    }
    if (!secret) {
        logger.error('newEvent/sem clientSecret', { merchantId: merchant.id });
        return NextResponse.json({ error: 'ServiceUnavailable' }, { status: 503 });
    }

    const validHmac = verifySignature(bodyText, secret, signature!);
    if (!validHmac) {
        await persistEvent({
            merchantId: merchant.id,
            appIdHeader: appId!,
            merchantIdHeader: merchantIdHeader!,
            signature: signature!,
            body: bodyText,
            valid: false,
            erro: 'assinatura HMAC inválida',
        });
        return NextResponse.json(
            { error: 'AccessDenied', message: 'Assinatura HMAC inválida' },
            { status: 403 },
        );
    }

    // Parse body.
    let event: ODEvent | null = null;
    try {
        event = JSON.parse(bodyText);
    } catch {
        await persistEvent({
            merchantId: merchant.id,
            appIdHeader: appId!,
            merchantIdHeader: merchantIdHeader!,
            signature: signature!,
            body: bodyText,
            valid: true,
            erro: 'JSON inválido',
        });
        return NextResponse.json({ error: 'BadRequest', message: 'JSON inválido' }, { status: 400 });
    }

    // Valida eventType contra enum da spec. Persiste audit trail mesmo se inválido.
    const eventTypeKnown = !!event?.eventType && VALID_EVENT_TYPES.has(event.eventType as ODEventType);

    const eventDb = await persistEvent({
        merchantId: merchant.id,
        appIdHeader: appId!,
        merchantIdHeader: merchantIdHeader!,
        signature: signature!,
        body: bodyText,
        valid: true,
        erro: eventTypeKnown ? null : `eventType desconhecido: ${event?.eventType ?? '<vazio>'}`,
        event,
    });

    if (!eventTypeKnown) {
        return NextResponse.json(
            { error: 'BadRequest', message: `eventType '${event?.eventType ?? ''}' fora do enum da spec OD v1.7` },
            { status: 400 },
        );
    }

    // Processamento por eventType.
    // O PDV (Software Service) é o autor da maioria dos eventos pós-CREATED;
    // o que esperamos REALMENTE receber é CREATED (e meta-eventos de cancelamento
    // iniciados pela OA, como ORDER_CANCELLATION_REQUEST).
    if (event?.eventType === 'CREATED' && event.orderId && event.orderURL && eventDb) {
        // Em background — não bloqueia o ACK 204 ao menuGo.
        (async () => {
            try {
                const status = await ingestOrderFromURL(eventDb.id, merchant, event!.orderId, event!.orderURL);
                if (status === 200) {
                    const order = await prisma.order.findUnique({
                        where: { orderId: event!.orderId },
                    });
                    if (order) {
                        await scheduleAutoTimeline({ orderRowId: order.id, merchant });
                    }
                }
            } catch (err: any) {
                logger.error('newEvent/ingest crash', { orderId: event!.orderId, message: err?.message });
            }
        })();
    } else if (
        (event?.eventType === 'ORDER_CANCELLATION_REQUEST' || event?.eventType === 'CANCELLATION_REQUESTED')
        && event.orderId
    ) {
        // OA pediu cancelamento — marca a flag no Order para o KDS exibir botões
        // "Aceitar" / "Negar". O operador resolve via /acceptCancellation ou
        // /denyCancellation, que chamam o menuGo de volta.
        // Aceitamos ambos eventTypes (são aliases na spec, ambos válidos).
        try {
            await prisma.order.updateMany({
                where: { orderId: event.orderId, merchantId: merchant.id },
                data: { cancelRequested: true, cancelRequestedAt: new Date() },
            });
        } catch (err: any) {
            logger.error('newEvent/cancelRequest update falhou', {
                orderId: event.orderId,
                message: err?.message,
            });
        }
    } else if (event?.orderId && ['PREPARING', 'READY_FOR_PICKUP', 'DELIVERED', 'CONCLUDED'].includes(event.eventType)) {
        // Eventos de progresso emitidos pela OA (menuGo) quando o status do
        // pedido avança no salão (em preparo, pronto, entregue, pago/concluído).
        // Spec OD v1.7 não tem READY_FOR_PICKUP/CONCLUDED no nosso enum interno —
        // mapeamos pro status mais próximo. CONCLUDED preenche entregueEm como
        // sinal de "fechou o ciclo".
        try {
            const statusMap: Record<string, 'PREPARING' | 'DELIVERED'> = {
                PREPARING: 'PREPARING',
                READY_FOR_PICKUP: 'PREPARING', // não temos READY_FOR_PICKUP no enum interno
                DELIVERED: 'DELIVERED',
                CONCLUDED: 'DELIVERED',
            };
            const novoStatus = statusMap[event.eventType];
            const timestampField =
                event.eventType === 'PREPARING' ? { preparandoEm: new Date() } :
                event.eventType === 'DELIVERED' || event.eventType === 'CONCLUDED' ? { entregueEm: new Date() } :
                {};
            await prisma.order.updateMany({
                where: { orderId: event.orderId, merchantId: merchant.id },
                data: { status: novoStatus, ...timestampField },
            });
            logger.info('newEvent/status update from OA', {
                orderId: event.orderId,
                eventType: event.eventType,
                novoStatus,
            });
        } catch (err: any) {
            logger.error('newEvent/status update falhou', {
                orderId: event.orderId,
                eventType: event.eventType,
                message: err?.message,
            });
        }
    }

    // Spec OD: 204 No Content é a resposta canônica.
    return new Response(null, { status: 204 });
}

interface PersistInput {
    merchantId: number | null;
    appIdHeader: string;
    merchantIdHeader: string;
    signature: string;
    body: string;
    valid: boolean;
    erro: string | null;
    event?: ODEvent | null;
}

async function persistEvent(input: PersistInput) {
    try {
        return await prisma.odEvent.create({
            data: {
                merchantId: input.merchantId,
                appIdHeader: input.appIdHeader,
                merchantIdHeader: input.merchantIdHeader,
                signature: input.signature,
                eventId: input.event?.eventId ?? null,
                eventType: input.event?.eventType ?? null,
                orderId: input.event?.orderId ?? null,
                orderURL: input.event?.orderURL ?? null,
                body: input.body,
                signatureValid: input.valid,
                erro: input.erro,
            },
        });
    } catch (err: any) {
        logger.error('newEvent/persist erro', { message: err?.message });
        return null;
    }
}
