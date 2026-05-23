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
