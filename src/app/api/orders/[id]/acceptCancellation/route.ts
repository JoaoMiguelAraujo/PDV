import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { doAcceptCancellation } from '@/lib/orders';
import { withAuth, badRequest, notFound } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

interface RouteCtx { params: Promise<{ id: string }> }

/**
 * POST /api/orders/{id}/acceptCancellation
 * Operador do PDV aceita um ORDER_CANCELLATION_REQUEST disparado pela OA.
 * → POST {menuGo}/v1/orders/{orderId}/acceptCancellation (spec OD v1.7).
 */
export const POST = withAuth(async (_req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) return badRequest('id inválido');
    const order = await prisma.order.findUnique({ where: { id }, include: { merchant: true } });
    if (!order) return notFound('pedido não existe');
    const result = await doAcceptCancellation(order, order.merchant, 'MANUAL');
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
});
