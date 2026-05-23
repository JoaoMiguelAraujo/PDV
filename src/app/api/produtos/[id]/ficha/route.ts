import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, badRequest, notFound } from '@/lib/api-utils';
import { cmvProduto } from '@/lib/estoque';

export const dynamic = 'force-dynamic';

interface RouteCtx { params: Promise<{ id: string }> }

/**
 * GET /api/produtos/{id}/ficha
 * Retorna ficha técnica + CMV calculado.
 */
export const GET = withAuth(async (_req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const produtoId = parseInt(idStr, 10);
    if (!Number.isFinite(produtoId)) return badRequest('id inválido');
    const produto = await prisma.produto.findUnique({ where: { id: produtoId } });
    if (!produto) return notFound('produto não existe');

    const ficha = await prisma.produtoInsumo.findMany({
        where: { produtoId },
        include: { insumo: true },
        orderBy: { id: 'asc' },
    });
    const cmv = await cmvProduto(produtoId);
    return NextResponse.json({ ficha, cmv, preco: produto.preco });
});

/**
 * PUT /api/produtos/{id}/ficha
 * Substitui a ficha inteira (apaga existentes e cria as novas).
 * Body: { itens: [{ insumoId, quantidade, observacao? }] }
 */
export const PUT = withAuth(async (req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const produtoId = parseInt(idStr, 10);
    if (!Number.isFinite(produtoId)) return badRequest('id inválido');
    const produto = await prisma.produto.findUnique({ where: { id: produtoId } });
    if (!produto) return notFound('produto não existe');

    let body: any;
    try { body = await req.json(); } catch { return badRequest('JSON inválido'); }
    if (!Array.isArray(body.itens)) return badRequest('itens deve ser array');

    // Valida tudo antes (todos os insumos do mesmo merchant, quantidades positivas).
    const seen = new Set<number>();
    for (const it of body.itens) {
        const insId = Number(it.insumoId);
        const qty = Number(it.quantidade);
        if (!Number.isFinite(insId) || !Number.isFinite(qty) || qty <= 0) return badRequest('item inválido');
        if (seen.has(insId)) return badRequest(`insumoId ${insId} duplicado na ficha`);
        seen.add(insId);
        const ins = await prisma.insumo.findUnique({ where: { id: insId } });
        if (!ins) return badRequest(`insumoId ${insId} não existe`);
        if (ins.merchantId !== produto.merchantId) return badRequest(`insumoId ${insId} pertence a outro merchant`);
    }

    await prisma.$transaction([
        prisma.produtoInsumo.deleteMany({ where: { produtoId } }),
        ...body.itens.map((it: any) =>
            prisma.produtoInsumo.create({
                data: {
                    produtoId,
                    insumoId: Number(it.insumoId),
                    quantidade: Number(it.quantidade),
                    observacao: it.observacao || null,
                },
            }),
        ),
    ]);
    return NextResponse.json({ ok: true });
});
