import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, badRequest, notFound } from '@/lib/api-utils';
import { callSetWaiter } from '@/lib/menugo-client';

export const dynamic = 'force-dynamic';

interface RouteCtx { params: Promise<{ id: string }> }

/**
 * POST /api/orders/{id}/setWaiter — extensão menuGo.
 *
 * Body: { id: number | null; name?: string }
 *
 * 1. Resolve order + merchant.
 * 2. Valida que merchant.adapterType === 'menugo' (a extensão só faz sentido
 *    nesse adapter; OD puro não tem o endpoint).
 * 3. Chama callSetWaiter (POST {menugo}/v1/orders/{orderId}/setWaiter).
 * 4. Em sucesso, atualiza Order.waiterId/waiterName localmente.
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
        return badRequest('Extensão setWaiter só disponível em merchants do tipo `menugo`');
    }

    const waiterId: number | null =
        body?.id === null ? null
        : Number.isFinite(Number(body?.id)) ? Number(body.id)
        : null;
    const waiterName: string = typeof body?.name === 'string' ? body.name : '';

    const result = await callSetWaiter(order.merchant, order.orderId, { id: waiterId, name: waiterName });
    if (result.ok) {
        await prisma.order.update({
            where: { id },
            data: {
                waiterId: waiterId,
                waiterName: waiterId !== null ? (waiterName || null) : null,
            },
        });
    }
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
});
