import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, badRequest, notFound } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

interface RouteCtx { params: Promise<{ id: string }> }

const UNIDADES = ['UN', 'KG', 'G', 'L', 'ML', 'CX', 'PCT'] as const;

export const GET = withAuth(async (_req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) return badRequest('id inválido');
    const i = await prisma.insumo.findUnique({
        where: { id },
        include: {
            ficha: { include: { produto: { select: { id: true, nome: true } } } },
            movimentos: { orderBy: { id: 'desc' }, take: 50 },
        },
    });
    if (!i) return notFound('insumo não existe');
    return NextResponse.json(i);
});

export const PATCH = withAuth(async (req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) return badRequest('id inválido');

    let body: any;
    try { body = await req.json(); } catch { return badRequest('JSON inválido'); }

    const data: any = {};
    if (body.nome !== undefined) data.nome = String(body.nome).trim();
    if (body.unidade !== undefined) {
        if (!(UNIDADES as readonly string[]).includes(body.unidade)) return badRequest('unidade inválida');
        data.unidade = body.unidade;
    }
    if (body.qtdMinima !== undefined) data.qtdMinima = Number(body.qtdMinima) || 0;
    if (body.sku !== undefined) data.sku = body.sku || null;
    if (body.ativo !== undefined) data.ativo = !!body.ativo;
    if (body.observacao !== undefined) data.observacao = body.observacao || null;
    // qtdAtual e custoMedio só mudam por meio de MovimentoEstoque.

    try {
        await prisma.insumo.update({ where: { id }, data });
        return NextResponse.json({ ok: true });
    } catch (err: any) {
        if (err?.code === 'P2025') return notFound('insumo não existe');
        throw err;
    }
});

export const DELETE = withAuth(async (_req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) return badRequest('id inválido');
    try {
        await prisma.insumo.delete({ where: { id } });
        return NextResponse.json({ ok: true });
    } catch (err: any) {
        if (err?.code === 'P2025') return notFound('insumo não existe');
        throw err;
    }
});
