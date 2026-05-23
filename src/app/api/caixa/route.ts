import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, badRequest, notFound } from '@/lib/api-utils';
import { caixaAbertoDe } from '@/lib/caixa';

export const dynamic = 'force-dynamic';

/**
 * GET /api/caixa?merchantId=&status=&limit=
 * Lista caixas do merchant.
 */
export const GET = withAuth(async (req: Request) => {
    const url = new URL(req.url);
    const merchantIdParam = url.searchParams.get('merchantId');
    const statusParam = url.searchParams.get('status');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);

    const where: any = {};
    if (merchantIdParam) where.merchantId = parseInt(merchantIdParam, 10);
    if (statusParam) where.status = statusParam;

    const caixas = await prisma.caixa.findMany({
        where,
        orderBy: { abertoEm: 'desc' },
        take: limit,
        include: { _count: { select: { movimentos: true } } },
    });
    return NextResponse.json({ caixas });
});

/**
 * POST /api/caixa
 * Abre um caixa. Bloqueia se já houver um aberto para o mesmo merchant.
 * Body: { merchantId, valorInicial?, operadorNome?, observacao? }
 */
export const POST = withAuth(async (req: Request) => {
    let body: any;
    try { body = await req.json(); } catch { return badRequest('JSON inválido'); }
    if (!body.merchantId || !Number.isFinite(Number(body.merchantId))) return badRequest('merchantId obrigatório');
    const merchantId = Number(body.merchantId);
    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) return notFound('merchant não existe');

    const aberto = await caixaAbertoDe(merchantId);
    if (aberto) {
        return NextResponse.json({ error: 'Conflict', message: `Já existe caixa aberto (#${aberto.id}). Feche antes de abrir outro.` }, { status: 409 });
    }

    const valorInicial = Number(body.valorInicial ?? 0);
    if (!Number.isFinite(valorInicial) || valorInicial < 0) return badRequest('valorInicial inválido');

    const c = await prisma.caixa.create({
        data: {
            merchantId,
            valorInicial,
            operadorNome: body.operadorNome || null,
            observacao: body.observacao || null,
        },
    });
    return NextResponse.json({ id: c.id, ok: true });
});
