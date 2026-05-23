import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, badRequest, notFound } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

interface RouteCtx { params: Promise<{ id: string }> }

// Tipos manuais — VENDA_DINHEIRO/RETIRADA_TROCO são criados automaticamente
// pelo hook do pagamento, não via API direta.
const TIPOS_MANUAIS = ['SUPRIMENTO', 'SANGRIA', 'AJUSTE'] as const;

/**
 * POST /api/caixa/{id}/movimentos
 * Body: { tipo, valor, observacao? }
 */
export const POST = withAuth(async (req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const caixaId = parseInt(idStr, 10);
    if (!Number.isFinite(caixaId)) return badRequest('id inválido');

    const caixa = await prisma.caixa.findUnique({ where: { id: caixaId } });
    if (!caixa) return notFound('caixa não existe');
    if (caixa.status !== 'ABERTO') return badRequest('caixa não está ABERTO');

    let body: any;
    try { body = await req.json(); } catch { return badRequest('JSON inválido'); }
    if (!(TIPOS_MANUAIS as readonly string[]).includes(body.tipo)) {
        return badRequest(`tipo deve ser: ${TIPOS_MANUAIS.join(', ')}`);
    }
    const valor = Number(body.valor);
    if (!Number.isFinite(valor) || valor <= 0) return badRequest('valor inválido (> 0)');

    const m = await prisma.movimentoCaixa.create({
        data: {
            caixaId,
            tipo: body.tipo,
            valor,
            observacao: body.observacao || null,
        },
    });
    return NextResponse.json({ id: m.id, ok: true });
});

export const GET = withAuth(async (_req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const caixaId = parseInt(idStr, 10);
    if (!Number.isFinite(caixaId)) return badRequest('id inválido');
    const movimentos = await prisma.movimentoCaixa.findMany({
        where: { caixaId },
        orderBy: { id: 'asc' },
    });
    return NextResponse.json({ movimentos });
});
