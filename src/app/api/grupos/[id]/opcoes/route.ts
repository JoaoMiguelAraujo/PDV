import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, badRequest, notFound } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

interface RouteCtx { params: Promise<{ id: string }> }

/**
 * POST /api/grupos/{id}/opcoes
 * Body: { nome, precoAdicional?, sku?, codigoExterno?, ativo?, ordem? }
 */
export const POST = withAuth(async (req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const grupoId = parseInt(idStr, 10);
    if (!Number.isFinite(grupoId)) return badRequest('id inválido');

    const grupo = await prisma.grupoModificador.findUnique({ where: { id: grupoId } });
    if (!grupo) return notFound('grupo não existe');

    let body: any;
    try { body = await req.json(); } catch { return badRequest('JSON inválido'); }
    if (!body.nome || String(body.nome).trim() === '') return badRequest('nome obrigatório');

    const preco = body.precoAdicional !== undefined ? Number(body.precoAdicional) : 0;
    if (!Number.isFinite(preco)) return badRequest('precoAdicional inválido');

    const o = await prisma.opcaoModificador.create({
        data: {
            grupoId,
            nome: String(body.nome).trim(),
            precoAdicional: preco,
            sku: body.sku ? String(body.sku).trim() : null,
            codigoExterno: body.codigoExterno ? String(body.codigoExterno).trim() : null,
            ativo: body.ativo !== false,
            ordem: Number.isFinite(Number(body.ordem)) ? Number(body.ordem) : 0,
        },
    });
    return NextResponse.json({ id: o.id, ok: true });
});
