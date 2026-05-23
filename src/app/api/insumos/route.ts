import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, badRequest, notFound } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

const UNIDADES = ['UN', 'KG', 'G', 'L', 'ML', 'CX', 'PCT'] as const;

/**
 * GET /api/insumos?merchantId=&ativo=&alerta=
 * alerta=1 retorna apenas insumos com qtdAtual<=qtdMinima (alerta de mínimo).
 */
export const GET = withAuth(async (req: Request) => {
    const url = new URL(req.url);
    const merchantIdParam = url.searchParams.get('merchantId');
    const ativoParam = url.searchParams.get('ativo');
    const alerta = url.searchParams.get('alerta') === '1';

    const where: any = {};
    if (merchantIdParam) where.merchantId = parseInt(merchantIdParam, 10);
    if (ativoParam !== null) where.ativo = ativoParam === '1' || ativoParam === 'true';

    let insumos = await prisma.insumo.findMany({
        where,
        orderBy: { nome: 'asc' },
    });
    if (alerta) insumos = insumos.filter(i => Number(i.qtdAtual) <= Number(i.qtdMinima));
    return NextResponse.json({ insumos });
});

export const POST = withAuth(async (req: Request) => {
    let body: any;
    try { body = await req.json(); } catch { return badRequest('JSON inválido'); }
    if (!body.merchantId || !Number.isFinite(Number(body.merchantId))) return badRequest('merchantId obrigatório');
    if (!body.nome || String(body.nome).trim() === '') return badRequest('nome obrigatório');
    if (body.unidade && !(UNIDADES as readonly string[]).includes(body.unidade)) return badRequest(`unidade: ${UNIDADES.join(', ')}`);

    const merchant = await prisma.merchant.findUnique({ where: { id: Number(body.merchantId) } });
    if (!merchant) return notFound('merchant não existe');

    try {
        const i = await prisma.insumo.create({
            data: {
                merchantId: Number(body.merchantId),
                nome: String(body.nome).trim(),
                unidade: body.unidade || 'UN',
                qtdAtual: Number(body.qtdAtual) || 0,
                qtdMinima: Number(body.qtdMinima) || 0,
                custoMedio: Number(body.custoMedio) || 0,
                sku: body.sku || null,
                ativo: body.ativo !== false,
                observacao: body.observacao || null,
            },
        });
        return NextResponse.json({ id: i.id, ok: true });
    } catch (err: any) {
        if (err?.code === 'P2002') return NextResponse.json({ error: 'Conflict', message: 'sku já existe' }, { status: 409 });
        throw err;
    }
});
