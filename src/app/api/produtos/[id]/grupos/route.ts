import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, badRequest, notFound } from '@/lib/api-utils';
import { notifyByMerchant } from '@/lib/catalog-notify';

export const dynamic = 'force-dynamic';

interface RouteCtx { params: Promise<{ id: string }> }

/**
 * POST /api/produtos/{id}/grupos
 * Body: { nome, min?, max?, obrigatorio?, ordem? }
 * Cria um GrupoModificador atrelado ao produto.
 */
export const POST = withAuth(async (req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const produtoId = parseInt(idStr, 10);
    if (!Number.isFinite(produtoId)) return badRequest('id inválido');

    const produto = await prisma.produto.findUnique({ where: { id: produtoId } });
    if (!produto) return notFound('produto não existe');

    let body: any;
    try { body = await req.json(); } catch { return badRequest('JSON inválido'); }
    if (!body.nome || String(body.nome).trim() === '') return badRequest('nome obrigatório');

    const min = Number.isFinite(Number(body.min)) ? Number(body.min) : 0;
    const max = Number.isFinite(Number(body.max)) ? Number(body.max) : 1;
    if (min < 0 || max < min) return badRequest('min/max inválidos (max ≥ min ≥ 0)');

    const g = await prisma.grupoModificador.create({
        data: {
            produtoId,
            nome: String(body.nome).trim(),
            min,
            max,
            obrigatorio: !!body.obrigatorio || min >= 1,
            ordem: Number.isFinite(Number(body.ordem)) ? Number(body.ordem) : 0,
        },
    });
    notifyByMerchant(produto.merchantId);
    return NextResponse.json({ id: g.id, ok: true });
});
