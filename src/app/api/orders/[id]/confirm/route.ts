import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { doConfirm } from '@/lib/orders';
import { withAuth, badRequest, notFound } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

interface RouteCtx { params: Promise<{ id: string }> }

export const POST = withAuth(async (req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) return badRequest('id inválido');
    const order = await prisma.order.findUnique({ where: { id }, include: { merchant: true } });
    if (!order) return notFound('pedido não existe');

    let body: any = {};
    try { body = await req.json(); } catch { /* sem body é OK */ }

    const result = await doConfirm(order, order.merchant, 'MANUAL', {
        preparationTime: body.preparationTime,
        reason: body.reason,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
});
