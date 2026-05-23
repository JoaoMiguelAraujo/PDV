import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, badRequest } from '@/lib/api-utils';
import { notifyByMerchant } from '@/lib/catalog-notify';

export const dynamic = 'force-dynamic';

/**
 * GET /api/categorias?merchantId=&ativo=
 * Lista categorias. Sem merchantId, devolve todas.
 */
export const GET = withAuth(async (req: Request) => {
    const url = new URL(req.url);
    const merchantIdParam = url.searchParams.get('merchantId');
    const ativoParam = url.searchParams.get('ativo');

    const where: any = {};
    if (merchantIdParam) where.merchantId = parseInt(merchantIdParam, 10);
    if (ativoParam !== null) where.ativo = ativoParam === '1' || ativoParam === 'true';

    const categorias = await prisma.categoria.findMany({
        where,
        orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
        include: {
            merchant: { select: { id: true, name: true } },
            _count: { select: { produtos: true } },
        },
    });
    return NextResponse.json({ categorias });
});

/**
 * POST /api/categorias
 * Body: { merchantId, nome, descricao?, ordem?, ativo? }
 */
export const POST = withAuth(async (req: Request) => {
    let body: any;
    try { body = await req.json(); } catch { return badRequest('JSON inválido'); }

    if (!body.merchantId || !Number.isFinite(Number(body.merchantId))) {
        return badRequest('merchantId obrigatório');
    }
    if (!body.nome || String(body.nome).trim() === '') return badRequest('nome obrigatório');

    const merchantExists = await prisma.merchant.findUnique({ where: { id: Number(body.merchantId) } });
    if (!merchantExists) return badRequest('merchant não existe');

    const c = await prisma.categoria.create({
        data: {
            merchantId: Number(body.merchantId),
            nome: String(body.nome).trim(),
            descricao: body.descricao || null,
            ordem: Number.isFinite(Number(body.ordem)) ? Number(body.ordem) : 0,
            ativo: body.ativo !== false,
        },
    });
    notifyByMerchant(c.merchantId);
    return NextResponse.json({ id: c.id, ok: true });
});
