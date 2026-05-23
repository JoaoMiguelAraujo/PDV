import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, badRequest, notFound } from '@/lib/api-utils';
import { recalcularComanda, totalItem } from '@/lib/comanda';

export const dynamic = 'force-dynamic';

interface RouteCtx { params: Promise<{ id: string; itemId: string }> }

const VALID_STATUS = ['PENDENTE', 'PREPARANDO', 'PRONTO', 'ENTREGUE', 'CANCELADO'] as const;

export const PATCH = withAuth(async (req: Request, ctx: RouteCtx) => {
    const { id: idStr, itemId: itemIdStr } = await ctx.params;
    const comandaId = parseInt(idStr, 10);
    const itemId = parseInt(itemIdStr, 10);
    if (!Number.isFinite(comandaId) || !Number.isFinite(itemId)) return badRequest('id inválido');

    let body: any;
    try { body = await req.json(); } catch { return badRequest('JSON inválido'); }

    const item = await prisma.itemComanda.findUnique({ where: { id: itemId } });
    if (!item || item.comandaId !== comandaId) return notFound('item não existe nesta comanda');

    const data: any = {};
    let recompute = false;
    if (body.quantidade !== undefined) {
        const q = Number(body.quantidade);
        if (!Number.isFinite(q) || q <= 0) return badRequest('quantidade inválida');
        data.quantidade = q;
        data.total = totalItem(Number(item.precoSnapshot), Number(item.acrescimoOpcoes), q);
        recompute = true;
    }
    if (body.observacao !== undefined) data.observacao = body.observacao || null;
    if (body.status !== undefined) {
        if (!(VALID_STATUS as readonly string[]).includes(body.status)) return badRequest('status inválido');
        data.status = body.status;
        if (body.status === 'CANCELADO') recompute = true;
    }

    await prisma.itemComanda.update({ where: { id: itemId }, data });
    if (recompute) await recalcularComanda(comandaId);
    return NextResponse.json({ ok: true });
});

export const DELETE = withAuth(async (_req: Request, ctx: RouteCtx) => {
    const { id: idStr, itemId: itemIdStr } = await ctx.params;
    const comandaId = parseInt(idStr, 10);
    const itemId = parseInt(itemIdStr, 10);
    if (!Number.isFinite(comandaId) || !Number.isFinite(itemId)) return badRequest('id inválido');

    const item = await prisma.itemComanda.findUnique({ where: { id: itemId } });
    if (!item || item.comandaId !== comandaId) return notFound('item não existe nesta comanda');

    const comanda = await prisma.comanda.findUnique({ where: { id: comandaId } });
    if (!comanda) return notFound('comanda não existe');
    if (comanda.status !== 'ABERTA') return badRequest('comanda não está ABERTA');

    await prisma.itemComanda.delete({ where: { id: itemId } });
    await recalcularComanda(comandaId);
    return NextResponse.json({ ok: true });
});
