import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, badRequest, notFound } from '@/lib/api-utils';
import { callCloseSale } from '@/lib/menugo-client';

export const dynamic = 'force-dynamic';

interface RouteCtx { params: Promise<{ id: string }> }

/**
 * POST /api/orders/{id}/closeSale — extensão menuGo.
 *
 * Sem body. Solicita o fechamento da sessão de mesa (`live_clientes_mesa.
 * fechamento_solicitado_em = NOW()` no menuGo). Local marca o flag pra UI.
 */
export const POST = withAuth(async (_req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) return badRequest('id inválido');

    const order = await prisma.order.findUnique({ where: { id }, include: { merchant: true } });
    if (!order) return notFound('pedido não existe');
    if (order.merchant.adapterType !== 'menugo') {
        return badRequest('Extensão closeSale só disponível em merchants do tipo `menugo`');
    }

    const result = await callCloseSale(order.merchant, order.orderId);
    if (result.ok) {
        await prisma.order.update({
            where: { id },
            data: { closeSaleRequested: true, closeSaleRequestedAt: new Date() },
        });
    }
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
});
