import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, badRequest, notFound } from '@/lib/api-utils';
import { registrarEntrada, registrarSaida } from '@/lib/estoque';

export const dynamic = 'force-dynamic';

interface RouteCtx { params: Promise<{ id: string }> }

const TIPOS_MANUAIS = ['ENTRADA', 'SAIDA', 'PERDA', 'AJUSTE'] as const;

/**
 * POST /api/insumos/{id}/movimentos
 * Body: { tipo, quantidade, custoUnitario? (só ENTRADA), observacao? }
 */
export const POST = withAuth(async (req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const insumoId = parseInt(idStr, 10);
    if (!Number.isFinite(insumoId)) return badRequest('id inválido');
    const ins = await prisma.insumo.findUnique({ where: { id: insumoId } });
    if (!ins) return notFound('insumo não existe');

    let body: any;
    try { body = await req.json(); } catch { return badRequest('JSON inválido'); }
    if (!(TIPOS_MANUAIS as readonly string[]).includes(body.tipo)) {
        return badRequest(`tipo: ${TIPOS_MANUAIS.join(', ')}`);
    }
    const quantidade = Number(body.quantidade);
    if (!Number.isFinite(quantidade) || quantidade <= 0) return badRequest('quantidade > 0');

    try {
        if (body.tipo === 'ENTRADA') {
            const custoUnitario = body.custoUnitario != null ? Number(body.custoUnitario) : undefined;
            if (custoUnitario != null && (!Number.isFinite(custoUnitario) || custoUnitario < 0)) {
                return badRequest('custoUnitario inválido');
            }
            await registrarEntrada({ insumoId, quantidade, custoUnitario, observacao: body.observacao });
        } else {
            await registrarSaida(body.tipo, { insumoId, quantidade, observacao: body.observacao });
        }
        return NextResponse.json({ ok: true });
    } catch (err: any) {
        return badRequest(err?.message || 'erro');
    }
});

export const GET = withAuth(async (_req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const insumoId = parseInt(idStr, 10);
    if (!Number.isFinite(insumoId)) return badRequest('id inválido');
    const movimentos = await prisma.movimentoEstoque.findMany({
        where: { insumoId },
        orderBy: { id: 'desc' },
        take: 200,
    });
    return NextResponse.json({ movimentos });
});
