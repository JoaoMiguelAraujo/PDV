import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, badRequest, notFound } from '@/lib/api-utils';
import { recalcularComanda } from '@/lib/comanda';

export const dynamic = 'force-dynamic';

interface RouteCtx { params: Promise<{ id: string }> }

export const GET = withAuth(async (_req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) return badRequest('id inválido');

    const c = await prisma.comanda.findUnique({
        where: { id },
        include: {
            mesa: { select: { id: true, numero: true } },
            merchant: { select: { id: true, name: true } },
            itens: {
                orderBy: { id: 'asc' },
                include: { produto: { select: { id: true, nome: true, fotoUrl: true } } },
            },
            pagamentos: { orderBy: { id: 'asc' } },
        },
    });
    if (!c) return notFound('comanda não existe');
    // Devolve opcoesJson parseado para conforto.
    const itens = c.itens.map(it => ({
        ...it,
        opcoes: it.opcoesJson ? safeParse(it.opcoesJson) : [],
    }));
    return NextResponse.json({ ...c, itens });
});

/**
 * PATCH /api/comandas/{id}
 * Body suporta:
 *  - status: 'FECHADA' | 'CANCELADA' (transições válidas)
 *  - cancelMotivo (se status=CANCELADA)
 *  - taxaServico, desconto (recalcula)
 *  - clienteNome / clienteTelefone / clienteDocumento / observacao / mesaId
 */
export const PATCH = withAuth(async (req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) return badRequest('id inválido');

    let body: any;
    try { body = await req.json(); } catch { return badRequest('JSON inválido'); }

    const current = await prisma.comanda.findUnique({ where: { id } });
    if (!current) return notFound('comanda não existe');

    const data: any = {};
    let recompute = false;
    if (body.taxaServico !== undefined) {
        const n = Number(body.taxaServico);
        if (!Number.isFinite(n) || n < 0) return badRequest('taxaServico inválido');
        data.taxaServico = n; recompute = true;
    }
    if (body.desconto !== undefined) {
        const n = Number(body.desconto);
        if (!Number.isFinite(n) || n < 0) return badRequest('desconto inválido');
        data.desconto = n; recompute = true;
    }
    if (body.clienteNome !== undefined) data.clienteNome = body.clienteNome || null;
    if (body.clienteTelefone !== undefined) data.clienteTelefone = body.clienteTelefone || null;
    if (body.clienteDocumento !== undefined) data.clienteDocumento = body.clienteDocumento || null;
    if (body.observacao !== undefined) data.observacao = body.observacao || null;
    if (body.mesaId !== undefined) {
        if (body.mesaId === null) {
            data.mesaId = null;
        } else {
            const mesa = await prisma.mesa.findUnique({ where: { id: Number(body.mesaId) } });
            if (!mesa) return badRequest('mesaId inválido');
            if (mesa.merchantId !== current.merchantId) return badRequest('mesa de outro merchant');
            data.mesaId = mesa.id;
        }
    }

    if (body.status !== undefined) {
        const next = body.status;
        if (!['ABERTA', 'FECHADA', 'CANCELADA'].includes(next)) return badRequest('status inválido');
        if (current.status !== 'ABERTA' && next !== current.status) {
            return badRequest(`comanda já está em ${current.status} — transição bloqueada`);
        }
        if (next === 'FECHADA') {
            // Exige pagamento >= total. (Se quiser permitir fechar com saldo
            // devedor, mude aqui.)
            const totalEsperado = Number(current.total);
            const totalPago = Number(current.totalPago);
            if (totalPago + 0.001 < totalEsperado) {
                return badRequest(`falta R$ ${(totalEsperado - totalPago).toFixed(2)} de pagamento`);
            }
            data.status = 'FECHADA';
            data.fechadaEm = new Date();
        } else if (next === 'CANCELADA') {
            data.status = 'CANCELADA';
            data.fechadaEm = new Date();
            data.cancelMotivo = body.cancelMotivo || null;
        }
    }

    await prisma.comanda.update({ where: { id }, data });
    if (recompute) await recalcularComanda(id);
    return NextResponse.json({ ok: true });
});

export const DELETE = withAuth(async (_req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) return badRequest('id inválido');
    const c = await prisma.comanda.findUnique({ where: { id } });
    if (!c) return notFound('comanda não existe');
    if (c.status === 'FECHADA') {
        return badRequest('comanda FECHADA não pode ser removida (audit trail). Mantenha-a.');
    }
    await prisma.comanda.delete({ where: { id } });
    return NextResponse.json({ ok: true });
});

function safeParse(s: string): unknown {
    try { return JSON.parse(s); } catch { return null; }
}
