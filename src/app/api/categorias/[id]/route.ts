import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, badRequest, notFound } from '@/lib/api-utils';
import { notifyByCategoria, notifyByMerchant } from '@/lib/catalog-notify';

export const dynamic = 'force-dynamic';

interface RouteCtx { params: Promise<{ id: string }> }

export const GET = withAuth(async (_req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) return badRequest('id inválido');
    const c = await prisma.categoria.findUnique({
        where: { id },
        include: {
            merchant: { select: { id: true, name: true } },
            produtos: { orderBy: { ordem: 'asc' }, select: { id: true, nome: true, preco: true, ativo: true } },
        },
    });
    if (!c) return notFound('categoria não existe');
    return NextResponse.json(c);
});

export const PATCH = withAuth(async (req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) return badRequest('id inválido');

    let body: any;
    try { body = await req.json(); } catch { return badRequest('JSON inválido'); }

    const data: any = {};
    if (body.nome !== undefined) {
        if (String(body.nome).trim() === '') return badRequest('nome não pode ser vazio');
        data.nome = String(body.nome).trim();
    }
    if (body.descricao !== undefined) data.descricao = body.descricao || null;
    if (body.ordem !== undefined && Number.isFinite(Number(body.ordem))) data.ordem = Number(body.ordem);
    if (body.ativo !== undefined) data.ativo = !!body.ativo;

    try {
        await prisma.categoria.update({ where: { id }, data });
        notifyByCategoria(id);
        return NextResponse.json({ ok: true });
    } catch (err: any) {
        if (err?.code === 'P2025') return notFound('categoria não existe');
        throw err;
    }
});

export const DELETE = withAuth(async (_req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) return badRequest('id inválido');
    const current = await prisma.categoria.findUnique({ where: { id }, select: { merchantId: true } });
    if (!current) return notFound('categoria não existe');
    try {
        await prisma.categoria.delete({ where: { id } });
        notifyByMerchant(current.merchantId);
        return NextResponse.json({ ok: true });
    } catch (err: any) {
        if (err?.code === 'P2025') return notFound('categoria não existe');
        throw err;
    }
});
