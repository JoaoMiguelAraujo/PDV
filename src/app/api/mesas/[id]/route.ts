import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, badRequest, notFound } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

interface RouteCtx { params: Promise<{ id: string }> }

export const PATCH = withAuth(async (req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) return badRequest('id inválido');

    let body: any;
    try { body = await req.json(); } catch { return badRequest('JSON inválido'); }

    const data: any = {};
    if (body.numero !== undefined) {
        if (String(body.numero).trim() === '') return badRequest('numero não pode ser vazio');
        data.numero = String(body.numero).trim();
    }
    if (body.capacidade !== undefined) data.capacidade = Number.isFinite(Number(body.capacidade)) ? Number(body.capacidade) : null;
    if (body.observacao !== undefined) data.observacao = body.observacao || null;
    if (body.ativo !== undefined) data.ativo = !!body.ativo;

    try {
        await prisma.mesa.update({ where: { id }, data });
        return NextResponse.json({ ok: true });
    } catch (err: any) {
        if (err?.code === 'P2025') return notFound('mesa não existe');
        if (err?.code === 'P2002') return NextResponse.json({ error: 'Conflict', message: 'já existe mesa com este número' }, { status: 409 });
        throw err;
    }
});

export const DELETE = withAuth(async (_req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) return badRequest('id inválido');
    const abertas = await prisma.comanda.count({ where: { mesaId: id, status: 'ABERTA' } });
    if (abertas > 0) {
        return NextResponse.json({ error: 'Conflict', message: 'mesa tem comandas abertas — feche/cancele primeiro ou desative a mesa' }, { status: 409 });
    }
    try {
        await prisma.mesa.delete({ where: { id } });
        return NextResponse.json({ ok: true });
    } catch (err: any) {
        if (err?.code === 'P2025') return notFound('mesa não existe');
        throw err;
    }
});
