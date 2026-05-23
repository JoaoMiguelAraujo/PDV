import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { doCancel } from '@/lib/orders';
import { withAuth, badRequest, notFound } from '@/lib/api-utils';
import type { ODCancelCode } from '@/lib/od-types';

export const dynamic = 'force-dynamic';

const VALID_CODES: ODCancelCode[] = [
    'SYSTEMIC_ISSUES',
    'DUPLICATE_APPLICATION',
    'UNAVAILABLE_ITEM',
    'RESTAURANT_WITHOUT_DELIVERY_PERSON',
    'OUTDATED_MENU',
    'ORDER_OUTSIDE_THE_DELIVERY_AREA',
    'BLOCKED_CUSTOMER',
    'OUTSIDE_DELIVERY_HOURS',
    'INTERNAL_DIFFICULTIES_OF_THE_RESTAURANT',
    'RISK_AREA',
    'DELIVERY_PROBLEM',
];

interface RouteCtx { params: Promise<{ id: string }> }

/**
 * POST /api/orders/{id}/cancel
 * Body: { reason: string, code: ODCancelCode, mode?: 'AUTO'|'MANUAL' }
 *
 * Chama POST {menuGo}/v1/orders/{orderId}/requestCancellation (spec OD v1.7).
 */
export const POST = withAuth(async (req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) return badRequest('id inválido');

    let body: any;
    try { body = await req.json(); } catch { return badRequest('JSON inválido'); }
    if (!body.reason || typeof body.reason !== 'string') return badRequest('reason obrigatório');
    if (!body.code || !VALID_CODES.includes(body.code)) {
        return badRequest(`code inválido. Valores aceitos: ${VALID_CODES.join(', ')}`);
    }
    const mode = body.mode === 'AUTO' ? 'AUTO' : 'MANUAL';

    const order = await prisma.order.findUnique({ where: { id }, include: { merchant: true } });
    if (!order) return notFound('pedido não existe');

    const result = await doCancel(order, order.merchant, 'MANUAL', {
        reason: body.reason,
        code: body.code,
        mode,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
});
