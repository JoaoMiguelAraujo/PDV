import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, badRequest } from '@/lib/api-utils';
import { cmvProduto } from '@/lib/estoque';

export const dynamic = 'force-dynamic';

/**
 * GET /api/reports/summary?merchantId=&from=&to=
 *
 * Resumo de vendas no período. Trabalha em cima de Comandas FECHADAS no
 * intervalo [from..to] (fechadaEm). Devolve:
 *  - count, total bruto, total líquido (taxa + desconto), ticket médio
 *  - quebra por método de pagamento
 *  - top 10 produtos (por quantidade e por valor)
 *  - CMV total e margem bruta
 *  - caixas fechados no período (count + Σ diferenças)
 *  - callbacks com erro no período (do PDV pro menuGo)
 *
 * Datas: ISO ou YYYY-MM-DD. Default = hoje.
 */
export const GET = withAuth(async (req: Request) => {
    const url = new URL(req.url);
    const merchantIdParam = url.searchParams.get('merchantId');
    const fromParam = url.searchParams.get('from');
    const toParam = url.searchParams.get('to');

    if (!merchantIdParam) return badRequest('merchantId obrigatório');
    const merchantId = parseInt(merchantIdParam, 10);
    if (!Number.isFinite(merchantId)) return badRequest('merchantId inválido');

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    const from = fromParam ? new Date(fromParam) : today;
    const to = toParam ? new Date(toParam) : tomorrow;
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return badRequest('from/to inválidos');

    // Comandas fechadas no período (inclusive)
    const comandas = await prisma.comanda.findMany({
        where: {
            merchantId,
            status: 'FECHADA',
            fechadaEm: { gte: from, lt: to },
        },
        include: {
            itens: true,
            pagamentos: true,
        },
    });

    const count = comandas.length;
    let totalBruto = 0, taxaServico = 0, desconto = 0, totalLiquido = 0;
    const porMetodo: Record<string, { count: number; valor: number }> = {};
    const porProduto: Record<number, { nome: string; qtd: number; valor: number }> = {};
    const itensVendidos: Array<{ produtoId: number | null; qtd: number }> = [];

    for (const c of comandas) {
        totalBruto += Number(c.subtotal);
        taxaServico += Number(c.taxaServico);
        desconto += Number(c.desconto);
        totalLiquido += Number(c.total);
        for (const p of c.pagamentos) {
            if (!porMetodo[p.metodo]) porMetodo[p.metodo] = { count: 0, valor: 0 };
            porMetodo[p.metodo].count += 1;
            porMetodo[p.metodo].valor += Number(p.valor);
        }
        for (const it of c.itens) {
            if (it.status === 'CANCELADO') continue;
            if (it.produtoId == null) continue;
            const key = it.produtoId;
            if (!porProduto[key]) porProduto[key] = { nome: it.nomeSnapshot, qtd: 0, valor: 0 };
            porProduto[key].qtd += Number(it.quantidade);
            porProduto[key].valor += Number(it.total);
            itensVendidos.push({ produtoId: it.produtoId, qtd: Number(it.quantidade) });
        }
    }

    // CMV: soma de (cmvProduto × quantidade vendida).
    const cmvCache = new Map<number, number>();
    let cmvTotal = 0;
    for (const iv of itensVendidos) {
        if (iv.produtoId == null) continue;
        if (!cmvCache.has(iv.produtoId)) cmvCache.set(iv.produtoId, await cmvProduto(iv.produtoId));
        cmvTotal += (cmvCache.get(iv.produtoId) ?? 0) * iv.qtd;
    }
    cmvTotal = +cmvTotal.toFixed(4);

    const margemBruta = totalLiquido > 0 ? +((totalLiquido - cmvTotal) / totalLiquido * 100).toFixed(2) : 0;
    const ticketMedio = count > 0 ? +(totalLiquido / count).toFixed(2) : 0;

    const topProdutos = Object.entries(porProduto)
        .map(([id, v]) => ({ produtoId: parseInt(id, 10), nome: v.nome, qtd: +v.qtd.toFixed(3), valor: +v.valor.toFixed(2) }))
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 10);

    const caixas = await prisma.caixa.findMany({
        where: { merchantId, status: 'FECHADO', fechadoEm: { gte: from, lt: to } },
        select: { id: true, diferenca: true, valorContado: true, valorInicial: true },
    });
    const caixaResumo = {
        count: caixas.length,
        diferencaTotal: +caixas.reduce((s, c) => s + Number(c.diferenca ?? 0), 0).toFixed(2),
    };

    const callbacksErro = await prisma.callback.count({
        where: {
            criadoEm: { gte: from, lt: to },
            OR: [{ erro: { not: null } }, { httpStatus: { gte: 400 } }],
            order: { merchantId },
        },
    });

    return NextResponse.json({
        merchantId,
        from: from.toISOString(),
        to: to.toISOString(),
        vendas: {
            count,
            totalBruto: +totalBruto.toFixed(2),
            taxaServico: +taxaServico.toFixed(2),
            desconto: +desconto.toFixed(2),
            totalLiquido: +totalLiquido.toFixed(2),
            ticketMedio,
            cmvTotal,
            margemBruta,
        },
        porMetodo: Object.entries(porMetodo).map(([m, v]) => ({ metodo: m, count: v.count, valor: +v.valor.toFixed(2) })),
        topProdutos,
        caixas: caixaResumo,
        callbacksErro,
    });
});
