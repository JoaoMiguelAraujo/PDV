import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, badRequest } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/produtos?merchantId=&categoriaId=&ativo=&q=
 * `q` faz busca por nome/SKU (LIKE).
 */
export const GET = withAuth(async (req: Request) => {
    const url = new URL(req.url);
    const merchantIdParam = url.searchParams.get('merchantId');
    const categoriaIdParam = url.searchParams.get('categoriaId');
    const ativoParam = url.searchParams.get('ativo');
    const q = url.searchParams.get('q');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '500', 10), 1000);

    const where: any = {};
    if (merchantIdParam) where.merchantId = parseInt(merchantIdParam, 10);
    if (categoriaIdParam) where.categoriaId = parseInt(categoriaIdParam, 10);
    if (ativoParam !== null) where.ativo = ativoParam === '1' || ativoParam === 'true';
    if (q && q.trim()) {
        where.OR = [
            { nome: { contains: q.trim() } },
            { sku: { contains: q.trim() } },
            { codigoExterno: { contains: q.trim() } },
        ];
    }

    const produtos = await prisma.produto.findMany({
        where,
        orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
        take: limit,
        include: {
            categoria: { select: { id: true, nome: true } },
            merchant: { select: { id: true, name: true } },
            _count: { select: { grupos: true } },
        },
    });
    return NextResponse.json({ produtos });
});

/**
 * POST /api/produtos
 * Body: { merchantId, categoriaId?, nome, descricao?, preco, sku?, codigoExterno?,
 *         unidade?, fotoUrl?, preparoMin?, ordem?, ativo? }
 */
export const POST = withAuth(async (req: Request) => {
    let body: any;
    try { body = await req.json(); } catch { return badRequest('JSON inválido'); }

    if (!body.merchantId || !Number.isFinite(Number(body.merchantId))) {
        return badRequest('merchantId obrigatório');
    }
    if (!body.nome || String(body.nome).trim() === '') return badRequest('nome obrigatório');
    if (body.preco === undefined || body.preco === null) return badRequest('preco obrigatório');
    const precoNum = Number(body.preco);
    if (!Number.isFinite(precoNum) || precoNum < 0) return badRequest('preco inválido');

    const merchantExists = await prisma.merchant.findUnique({ where: { id: Number(body.merchantId) } });
    if (!merchantExists) return badRequest('merchant não existe');

    if (body.categoriaId) {
        const cat = await prisma.categoria.findUnique({ where: { id: Number(body.categoriaId) } });
        if (!cat || cat.merchantId !== Number(body.merchantId)) {
            return badRequest('categoriaId inválido para este merchant');
        }
    }

    const p = await prisma.produto.create({
        data: {
            merchantId: Number(body.merchantId),
            categoriaId: body.categoriaId ? Number(body.categoriaId) : null,
            nome: String(body.nome).trim(),
            descricao: body.descricao || null,
            preco: precoNum,
            sku: body.sku ? String(body.sku).trim() : null,
            codigoExterno: body.codigoExterno ? String(body.codigoExterno).trim() : null,
            unidade: body.unidade || 'UN',
            fotoUrl: body.fotoUrl || null,
            preparoMin: Number.isFinite(Number(body.preparoMin)) ? Number(body.preparoMin) : null,
            ordem: Number.isFinite(Number(body.ordem)) ? Number(body.ordem) : 0,
            ativo: body.ativo !== false,
        },
    });
    return NextResponse.json({ id: p.id, ok: true });
});
