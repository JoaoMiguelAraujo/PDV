import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, badRequest, notFound } from '@/lib/api-utils';
import { recalcularComanda, totalItem, validarOpcoes, type OpcaoEscolhida } from '@/lib/comanda';

export const dynamic = 'force-dynamic';

interface RouteCtx { params: Promise<{ id: string }> }

/**
 * POST /api/comandas/{id}/itens
 * Body: { produtoId, quantidade?, observacao?, opcoes?: [{ grupoId, opcaoId }] }
 *
 * - Resolve preço do produto e opções (snapshot — preserva preço da venda
 *   mesmo se catálogo mudar).
 * - Valida regras min/max de cada grupo do produto.
 * - Recalcula totais da comanda no fim.
 */
export const POST = withAuth(async (req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const comandaId = parseInt(idStr, 10);
    if (!Number.isFinite(comandaId)) return badRequest('id inválido');

    const comanda = await prisma.comanda.findUnique({ where: { id: comandaId } });
    if (!comanda) return notFound('comanda não existe');
    if (comanda.status !== 'ABERTA') return badRequest(`comanda em ${comanda.status} — não aceita itens`);

    let body: any;
    try { body = await req.json(); } catch { return badRequest('JSON inválido'); }

    if (!body.produtoId) return badRequest('produtoId obrigatório');
    const produto = await prisma.produto.findUnique({ where: { id: Number(body.produtoId) } });
    if (!produto) return badRequest('produto não existe');
    if (produto.merchantId !== comanda.merchantId) return badRequest('produto pertence a outro merchant');
    if (!produto.ativo) return badRequest('produto inativo');

    const qty = body.quantidade !== undefined ? Number(body.quantidade) : 1;
    if (!Number.isFinite(qty) || qty <= 0) return badRequest('quantidade inválida');

    // Valida opções (se vieram).
    const opcoesIn: Array<{ grupoId: number; opcaoId: number }> = Array.isArray(body.opcoes) ? body.opcoes : [];
    const resolved = await validarOpcoes(produto.id, opcoesIn.map(o => ({
        grupoId: Number(o.grupoId),
        opcaoId: Number(o.opcaoId),
        nome: '',
        preco: 0,
    })));
    if (!resolved.ok) return badRequest(resolved.error);

    const precoBase = Number(produto.preco);
    const tot = totalItem(precoBase, resolved.acrescimo, qty);

    const item = await prisma.itemComanda.create({
        data: {
            comandaId,
            produtoId: produto.id,
            nomeSnapshot: produto.nome,
            precoSnapshot: precoBase,
            quantidade: qty,
            acrescimoOpcoes: resolved.acrescimo,
            total: tot,
            observacao: body.observacao || null,
            opcoesJson: resolved.resolved.length ? JSON.stringify(resolved.resolved) : null,
        },
    });
    await recalcularComanda(comandaId);
    return NextResponse.json({ id: item.id, ok: true });
});
