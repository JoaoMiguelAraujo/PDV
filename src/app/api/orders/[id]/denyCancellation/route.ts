import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { doDenyCancellation } from '@/lib/orders';
import { withAuth, badRequest, notFound } from '@/lib/api-utils';
import type { ODRequestDenied } from '@/lib/od-types';

export const dynamic = 'force-dynamic';

const VALID_DENY_CODES: Array<ODRequestDenied['code']> = ['DISH_ALREADY_DONE', 'OUT_FOR_DELIVERY'];

interface RouteCtx { params: Promise<{ id: string }> }

/**
 * POST /api/orders/{id}/denyCancellation
 * Body: { reason: string, code: 'DISH_ALREADY_DONE' | 'OUT_FOR_DELIVERY' }
 *
 * Operador do PDV nega um ORDER_CANCELLATION_REQUEST disparado pela OA.
 * → POST {menuGo}/v1/orders/{orderId}/denyCancellation (spec OD v1.7).
 */
export const POST = withAuth(async (req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) return badRequest('id inválido');

    let body: any;
    try { body = await req.json(); } catch { return badRequest('JSON inválido'); }
    if (!body.reason || typeof body.reason !== 'string') return badRequest('reason obrigatório');
    if (!body.code || !VALID_DENY_CODES.includes(body.code)) {
        return badRequest(`code inválido. Valores aceitos: ${VALID_DENY_CODES.join(', ')}`);
    }

    const order = await prisma.order.findUnique({ where: { id }, include: { merchant: true } });
    if (!order) return notFound('pedido não existe');

    const result = await doDenyCancellation(order, order.merchant, 'MANUAL', {
        reason: body.reason,
        code: body.code,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
});
