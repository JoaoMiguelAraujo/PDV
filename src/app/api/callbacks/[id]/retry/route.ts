import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, badRequest, notFound } from '@/lib/api-utils';
import {
    doConfirm,
    doPreparing,
    doDelivered,
    doCancel,
    doAcceptCancellation,
    doDenyCancellation,
} from '@/lib/orders';

export const dynamic = 'force-dynamic';

interface RouteCtx { params: Promise<{ id: string }> }

/**
 * POST /api/callbacks/{id}/retry
 *
 * Re-executa o callback original. Se o pedido já avançou de status (ex.
 * confirm falhou, mas operador confirmou manualmente depois), a função
 * correspondente retorna erro de transição inválida — comportamento esperado.
 *
 * Não cria novo Callback row aqui — a função do/X já grava o novo.
 */
export const POST = withAuth(async (_req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) return badRequest('id inválido');

    const cb = await prisma.callback.findUnique({
        where: { id },
        include: { order: { include: { merchant: true } } },
    });
    if (!cb) return notFound('callback não existe');
    const order = cb.order;
    if (!order) return notFound('pedido vinculado não existe');

    let result;
    let body: any = null;
    if (cb.requestBody) { try { body = JSON.parse(cb.requestBody); } catch {} }

    switch (cb.type) {
        case 'confirm':
            result = await doConfirm(order, order.merchant, 'MANUAL', {
                preparationTime: body?.preparationTime,
                reason: body?.reason,
            });
            break;
        case 'preparing':
            result = await doPreparing(order, order.merchant, 'MANUAL');
            break;
        case 'delivered':
            result = await doDelivered(order, order.merchant, 'MANUAL');
            break;
        case 'requestCancellation':
            if (!body || !body.reason || !body.code) return badRequest('callback original sem body reason/code — não dá pra retry');
            result = await doCancel(order, order.merchant, 'MANUAL', body);
            break;
        case 'acceptCancellation':
            result = await doAcceptCancellation(order, order.merchant, 'MANUAL');
            break;
        case 'denyCancellation':
            if (!body || !body.reason || !body.code) return badRequest('callback original sem body reason/code — não dá pra retry');
            result = await doDenyCancellation(order, order.merchant, 'MANUAL', body);
            break;
        default:
            return badRequest(`tipo "${cb.type}" não é re-tentável`);
    }

    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
});
