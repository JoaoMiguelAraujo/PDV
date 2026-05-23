import 'server-only';
import { prisma } from './db';
import { logger } from './logger';

/**
 * Estoque — entradas/saídas e baixa automática por ficha técnica.
 *
 * Toda mutação passa por funções aqui, que registram MovimentoEstoque e
 * atualizam Insumo.qtdAtual (e custoMedio em ENTRADAs) em uma única transação.
 */

export interface MovEntrada {
    insumoId: number;
    quantidade: number;
    custoUnitario?: number;
    observacao?: string;
}

/**
 * Registra ENTRADA — recalcula custoMedio ponderado.
 * fórmula: novoCM = (qtdAtual*cm + qtdEntrada*custoEntrada) / (qtdAtual + qtdEntrada)
 * Se custoUnitario não vier, mantém custoMedio atual.
 */
export async function registrarEntrada(input: MovEntrada): Promise<void> {
    if (input.quantidade <= 0) throw new Error('quantidade deve ser > 0');
    await prisma.$transaction(async (tx) => {
        const ins = await tx.insumo.findUnique({ where: { id: input.insumoId } });
        if (!ins) throw new Error('insumo não existe');

        const qtdAntes = Number(ins.qtdAtual);
        const qtdDepois = +(qtdAntes + input.quantidade).toFixed(3);
        let novoCM = Number(ins.custoMedio);
        if (input.custoUnitario != null && input.custoUnitario >= 0) {
            const denom = qtdAntes + input.quantidade;
            if (denom > 0) {
                novoCM = +((qtdAntes * novoCM + input.quantidade * input.custoUnitario) / denom).toFixed(4);
            }
        }
        await tx.movimentoEstoque.create({
            data: {
                insumoId: input.insumoId,
                tipo: 'ENTRADA',
                quantidade: input.quantidade,
                custoUnitario: input.custoUnitario ?? null,
                qtdAntes,
                qtdDepois,
                observacao: input.observacao ?? null,
            },
        });
        await tx.insumo.update({
            where: { id: input.insumoId },
            data: { qtdAtual: qtdDepois, custoMedio: novoCM },
        });
    });
}

export type MovTipoSaida = 'SAIDA' | 'PERDA' | 'AJUSTE';

/**
 * Registra SAIDA/PERDA/AJUSTE. AJUSTE pode ter quantidade negativa? Não — o
 * operador insere a diferença positiva e escolhe SAIDA ou AJUSTE no UI. Para
 * "AJUSTE positivo" (sobra), usa ENTRADA sem custoUnitario.
 */
export async function registrarSaida(
    tipo: MovTipoSaida,
    input: { insumoId: number; quantidade: number; observacao?: string },
): Promise<void> {
    if (input.quantidade <= 0) throw new Error('quantidade deve ser > 0');
    await prisma.$transaction(async (tx) => {
        const ins = await tx.insumo.findUnique({ where: { id: input.insumoId } });
        if (!ins) throw new Error('insumo não existe');
        const qtdAntes = Number(ins.qtdAtual);
        const qtdDepois = +(qtdAntes - input.quantidade).toFixed(3);
        await tx.movimentoEstoque.create({
            data: {
                insumoId: input.insumoId,
                tipo,
                quantidade: input.quantidade,
                qtdAntes,
                qtdDepois,
                observacao: input.observacao ?? null,
            },
        });
        await tx.insumo.update({ where: { id: input.insumoId }, data: { qtdAtual: qtdDepois } });
    });
}

/**
 * Hook: chamado quando um ItemComanda transiciona PARA PREPARANDO. Baixa
 * insumos da ficha técnica × quantidade do item. Se o produto não tem ficha,
 * é no-op. Fire-and-forget — falha vai pro log mas não bloqueia a transição
 * (o sentido é não impedir o garçom de marcar "preparando" por causa de
 * cadastro de ficha incompleto).
 */
export async function baixarEstoqueDoItem(itemComandaId: number): Promise<void> {
    try {
        const item = await prisma.itemComanda.findUnique({
            where: { id: itemComandaId },
            include: {
                produto: { include: { ficha: { include: { insumo: true } } } },
            },
        });
        if (!item || !item.produto) return;
        const ficha = item.produto.ficha;
        if (ficha.length === 0) return;

        const qtdProduto = Number(item.quantidade);
        for (const f of ficha) {
            const consumo = +(Number(f.quantidade) * qtdProduto).toFixed(3);
            if (consumo <= 0) continue;
            await prisma.$transaction(async (tx) => {
                const ins = await tx.insumo.findUnique({ where: { id: f.insumoId } });
                if (!ins) return;
                const qtdAntes = Number(ins.qtdAtual);
                const qtdDepois = +(qtdAntes - consumo).toFixed(3);
                await tx.movimentoEstoque.create({
                    data: {
                        insumoId: f.insumoId,
                        tipo: 'VENDA',
                        quantidade: consumo,
                        qtdAntes,
                        qtdDepois,
                        itemComandaId,
                        observacao: `Venda item #${itemComandaId} (${item.nomeSnapshot})`,
                    },
                });
                await tx.insumo.update({ where: { id: f.insumoId }, data: { qtdAtual: qtdDepois } });
            });
        }
    } catch (err: any) {
        logger.error('estoque/baixarEstoqueDoItem crash', { itemComandaId, message: err?.message });
    }
}

/** CMV teórico de um produto: soma de (quantidade × custoMedio) por insumo da ficha. */
export async function cmvProduto(produtoId: number): Promise<number> {
    const ficha = await prisma.produtoInsumo.findMany({
        where: { produtoId },
        include: { insumo: true },
    });
    let cmv = 0;
    for (const f of ficha) cmv += Number(f.quantidade) * Number(f.insumo.custoMedio);
    return +cmv.toFixed(4);
}
