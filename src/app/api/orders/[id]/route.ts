import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, badRequest, notFound } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

interface RouteCtx { params: Promise<{ id: string }> }

export const GET = withAuth(async (_req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) return badRequest('id inválido');
    const order = await prisma.order.findUnique({
        where: { id },
        include: {
            merchant: { select: { id: true, name: true, merchantId: true } },
            callbacks: { orderBy: { id: 'asc' } },
        },
    });
    if (!order) return notFound('pedido não existe');
    return NextResponse.json({ order });
});

/**
 * DELETE /api/orders/{id} — apaga o pedido localmente.
 *
 * IMPORTANTE: é uma operação LOCAL, sem integração com o menuGo. Serve pra
 * limpar pedidos de teste/lixo durante homologação. Não emite eventos OD
 * pro menuGo. Em ambiente de produção use `/cancel` (que dispara
 * requestCancellation no menuGo via OD).
 */
export const DELETE = withAuth(async (_req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) return badRequest('id inválido');
    try {
        await prisma.order.delete({ where: { id } });
        return NextResponse.json({ ok: true });
    } catch (err: any) {
        if (err?.code === 'P2025') return notFound('pedido não existe');
        throw err;
    }
});
