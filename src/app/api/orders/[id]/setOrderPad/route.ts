import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, badRequest, notFound } from '@/lib/api-utils';
import { callSetOrderPad } from '@/lib/menugo-client';

export const dynamic = 'force-dynamic';

interface RouteCtx { params: Promise<{ id: string }> }

/**
 * POST /api/orders/{id}/setOrderPad — extensão menuGo.
 *
 * Body: { orderPad: string | null }
 *
 * Encaminha ao menuGo e, em sucesso, sincroniza Order.orderPad local.
 * Body do menuGo libera envios "segurados" da sessão (modo mesa_com_comanda).
 */
export const POST = withAuth(async (req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) return badRequest('id inválido');

    let body: any;
    try { body = await req.json(); } catch { return badRequest('JSON inválido'); }

    const order = await prisma.order.findUnique({ where: { id }, include: { merchant: true } });
    if (!order) return notFound('pedido não existe');
    if (order.merchant.adapterType !== 'menugo') {
        return badRequest('Extensão setOrderPad só disponível em merchants do tipo `menugo`');
    }

    let orderPad: string | null = null;
    if (typeof body?.orderPad === 'string') {
        const trimmed = body.orderPad.trim();
        orderPad = trimmed ? trimmed.slice(0, 50) : null;
    }

    const result = await callSetOrderPad(order.merchant, order.orderId, { orderPad });
    if (result.ok) {
        await prisma.order.update({ where: { id }, data: { orderPad } });
    }
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
});
