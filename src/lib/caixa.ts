import 'server-only';
import { prisma } from './db';
import { logger } from './logger';

/**
 * Lógica de Caixa. As entradas automáticas (VENDA_DINHEIRO, RETIRADA_TROCO)
 * são disparadas pelos handlers de pagamento — toda lógica de cálculo de
 * saldo esperado fica aqui.
 */

const SIGN: Record<string, 1 | -1> = {
    SUPRIMENTO: 1,
    SANGRIA: -1,
    VENDA_DINHEIRO: 1,
    RETIRADA_TROCO: -1,
    AJUSTE: 1, // o ajuste pode ser positivo ou negativo; tratamos como positivo
                // e o operador usa SUPRIMENTO/SANGRIA para somar/subtrair claro.
};

/**
 * Calcula valorEsperado do caixa: valorInicial + Σ(entradas) - Σ(saídas).
 */
export async function calcularSaldoEsperado(caixaId: number): Promise<number> {
    const caixa = await prisma.caixa.findUnique({
        where: { id: caixaId },
        include: { movimentos: true },
    });
    if (!caixa) return 0;
    let total = Number(caixa.valorInicial);
    for (const m of caixa.movimentos) {
        total += SIGN[m.tipo] * Number(m.valor);
    }
    return +total.toFixed(2);
}

/**
 * Retorna o caixa ABERTO do merchant (no máximo 1).
 */
export async function caixaAbertoDe(merchantId: number) {
    return prisma.caixa.findFirst({
        where: { merchantId, status: 'ABERTO' },
    });
}

/**
 * Hook: chamado após registrar um Pagamento. Se o método for DINHEIRO e
 * existir caixa aberto do merchant da comanda, cria os movimentos
 * VENDA_DINHEIRO (entrada do valor recebido) e RETIRADA_TROCO (se houver
 * troco). Fire-and-forget — falha não bloqueia o pagamento.
 */
export async function hookPagamentoCaixa(pagamentoId: number): Promise<void> {
    try {
        const pag = await prisma.pagamento.findUnique({
            where: { id: pagamentoId },
            include: { comanda: { select: { merchantId: true } } },
        });
        if (!pag || pag.metodo !== 'DINHEIRO') return;
        const caixa = await caixaAbertoDe(pag.comanda.merchantId);
        if (!caixa) return; // sem caixa aberto = só registra pagamento na comanda
        await prisma.movimentoCaixa.create({
            data: {
                caixaId: caixa.id,
                tipo: 'VENDA_DINHEIRO',
                valor: Number(pag.valor),
                pagamentoId: pag.id,
                observacao: `Pagamento DINHEIRO comanda #${pag.comandaId}`,
            },
        });
        if (Number(pag.troco) > 0) {
            await prisma.movimentoCaixa.create({
                data: {
                    caixaId: caixa.id,
                    tipo: 'RETIRADA_TROCO',
                    valor: Number(pag.troco),
                    pagamentoId: pag.id,
                    observacao: `Troco comanda #${pag.comandaId}`,
                },
            });
        }
    } catch (err: any) {
        logger.error('caixa/hookPagamento crash', { pagamentoId, message: err?.message });
    }
}
