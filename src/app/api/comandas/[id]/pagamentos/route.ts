import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, badRequest, notFound } from '@/lib/api-utils';
import { recalcularComanda } from '@/lib/comanda';
import { hookPagamentoCaixa } from '@/lib/caixa';

export const dynamic = 'force-dynamic';

interface RouteCtx { params: Promise<{ id: string }> }

const VALID_METODOS = ['DINHEIRO', 'PIX', 'CREDITO', 'DEBITO', 'VOUCHER', 'OUTRO'] as const;

/**
 * POST /api/comandas/{id}/pagamentos
 * Body: { metodo, valor, troco?, transactionId?, observacao? }
 *
 * Múltiplos pagamentos são permitidos (divisão de conta = N pagamentos para
 * a mesma comanda).
 */
export const POST = withAuth(async (req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const comandaId = parseInt(idStr, 10);
    if (!Number.isFinite(comandaId)) return badRequest('id inválido');

    const comanda = await prisma.comanda.findUnique({ where: { id: comandaId } });
    if (!comanda) return notFound('comanda não existe');
    if (comanda.status !== 'ABERTA') return badRequest(`comanda em ${comanda.status} — não aceita pagamentos`);

    let body: any;
    try { body = await req.json(); } catch { return badRequest('JSON inválido'); }

    if (!(VALID_METODOS as readonly string[]).includes(body.metodo)) {
        return badRequest(`metodo inválido. Use: ${VALID_METODOS.join(', ')}`);
    }
    const valor = Number(body.valor);
    if (!Number.isFinite(valor) || valor <= 0) return badRequest('valor inválido (> 0)');
    const troco = Number(body.troco ?? 0);
    if (!Number.isFinite(troco) || troco < 0) return badRequest('troco inválido');
    if (body.metodo !== 'DINHEIRO' && troco > 0) return badRequest('troco só faz sentido em DINHEIRO');

    const p = await prisma.pagamento.create({
        data: {
            comandaId,
            metodo: body.metodo,
            valor,
            troco,
            transactionId: body.transactionId || null,
            observacao: body.observacao || null,
        },
    });
    await recalcularComanda(comandaId);
    // Hook do caixa — fire-and-forget; falha não bloqueia o pagamento.
    hookPagamentoCaixa(p.id).catch(() => {});
    return NextResponse.json({ id: p.id, ok: true });
});

/**
 * GET /api/comandas/{id}/pagamentos — lista de uma comanda
 */
export const GET = withAuth(async (_req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const comandaId = parseInt(idStr, 10);
    if (!Number.isFinite(comandaId)) return badRequest('id inválido');
    const pagamentos = await prisma.pagamento.findMany({
        where: { comandaId },
        orderBy: { id: 'asc' },
    });
    return NextResponse.json({ pagamentos });
});
