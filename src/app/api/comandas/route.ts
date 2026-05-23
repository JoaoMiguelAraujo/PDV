import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, badRequest, notFound } from '@/lib/api-utils';
import { gerarCodigoComanda } from '@/lib/comanda';

export const dynamic = 'force-dynamic';

/**
 * GET /api/comandas?merchantId=&mesaId=&status=&limit=
 */
export const GET = withAuth(async (req: Request) => {
    const url = new URL(req.url);
    const merchantIdParam = url.searchParams.get('merchantId');
    const mesaIdParam = url.searchParams.get('mesaId');
    const statusParam = url.searchParams.get('status');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);

    const where: any = {};
    if (merchantIdParam) where.merchantId = parseInt(merchantIdParam, 10);
    if (mesaIdParam) where.mesaId = parseInt(mesaIdParam, 10);
    if (statusParam) where.status = statusParam;

    const comandas = await prisma.comanda.findMany({
        where,
        orderBy: [{ status: 'asc' }, { abertaEm: 'desc' }],
        take: limit,
        include: {
            mesa: { select: { id: true, numero: true } },
            _count: { select: { itens: true } },
        },
    });
    return NextResponse.json({ comandas });
});

/**
 * POST /api/comandas
 * Abre uma nova comanda.
 * Body: { merchantId, mesaId?, clienteNome?, clienteTelefone?, clienteDocumento?, observacao? }
 */
export const POST = withAuth(async (req: Request) => {
    let body: any;
    try { body = await req.json(); } catch { return badRequest('JSON inválido'); }

    if (!body.merchantId || !Number.isFinite(Number(body.merchantId))) return badRequest('merchantId obrigatório');
    const merchantId = Number(body.merchantId);

    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) return notFound('merchant não existe');

    if (body.mesaId) {
        const mesa = await prisma.mesa.findUnique({ where: { id: Number(body.mesaId) } });
        if (!mesa) return badRequest('mesaId não existe');
        if (mesa.merchantId !== merchantId) return badRequest('mesa pertence a outro merchant');
        // Permite múltiplas comandas abertas na mesma mesa? Operacionalmente sim
        // (mesa grande pode ter mais de uma conta). Não bloqueamos.
    }

    const codigo = await gerarCodigoComanda();
    const c = await prisma.comanda.create({
        data: {
            codigo,
            merchantId,
            mesaId: body.mesaId ? Number(body.mesaId) : null,
            clienteNome: body.clienteNome || null,
            clienteTelefone: body.clienteTelefone || null,
            clienteDocumento: body.clienteDocumento || null,
            observacao: body.observacao || null,
        },
    });
    return NextResponse.json({ id: c.id, codigo: c.codigo, ok: true });
});
