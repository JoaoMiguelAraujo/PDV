import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, badRequest } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/mesas?merchantId=&ativo=
 * Inclui contagem de comandas abertas por mesa (para o grid de status).
 */
export const GET = withAuth(async (req: Request) => {
    const url = new URL(req.url);
    const merchantIdParam = url.searchParams.get('merchantId');
    const ativoParam = url.searchParams.get('ativo');

    const where: any = {};
    if (merchantIdParam) where.merchantId = parseInt(merchantIdParam, 10);
    if (ativoParam !== null) where.ativo = ativoParam === '1' || ativoParam === 'true';

    const mesas = await prisma.mesa.findMany({
        where,
        orderBy: [{ merchantId: 'asc' }, { numero: 'asc' }],
        include: {
            comandas: {
                where: { status: 'ABERTA' },
                select: { id: true, codigo: true, total: true, totalPago: true, abertaEm: true },
            },
        },
    });
    return NextResponse.json({ mesas });
});

/**
 * POST /api/mesas
 * Body: { merchantId, numero, capacidade?, observacao? }
 */
export const POST = withAuth(async (req: Request) => {
    let body: any;
    try { body = await req.json(); } catch { return badRequest('JSON inválido'); }

    if (!body.merchantId || !Number.isFinite(Number(body.merchantId))) return badRequest('merchantId obrigatório');
    if (!body.numero || String(body.numero).trim() === '') return badRequest('numero obrigatório');

    try {
        const m = await prisma.mesa.create({
            data: {
                merchantId: Number(body.merchantId),
                numero: String(body.numero).trim(),
                capacidade: Number.isFinite(Number(body.capacidade)) ? Number(body.capacidade) : null,
                observacao: body.observacao || null,
                ativo: body.ativo !== false,
            },
        });
        return NextResponse.json({ id: m.id, ok: true });
    } catch (err: any) {
        if (err?.code === 'P2002') return NextResponse.json({ error: 'Conflict', message: 'já existe mesa com este número neste merchant' }, { status: 409 });
        throw err;
    }
});
