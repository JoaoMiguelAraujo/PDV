import 'server-only';
import { prisma } from './db';
import type { Prisma } from '@prisma/client';

/**
 * Lógica de comanda: geração de código curto, recálculo de subtotal/total a
 * partir dos itens, tratamento de pagamentos. Centralizado aqui para os
 * handlers HTTP ficarem finos.
 */

/**
 * Gera um código curto ABxxxx único (4 dígitos). Tenta até 5 vezes em caso de
 * colisão (improvável com poucos pedidos abertos por dia).
 */
export async function gerarCodigoComanda(): Promise<string> {
    for (let i = 0; i < 5; i++) {
        const letras = String.fromCharCode(65 + Math.floor(Math.random() * 26)) +
                        String.fromCharCode(65 + Math.floor(Math.random() * 26));
        const num = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
        const code = `${letras}${num}`;
        const existing = await prisma.comanda.findUnique({ where: { codigo: code } });
        if (!existing) return code;
    }
    // Fallback determinístico pra evitar deadlock se hash do RNG dá colisão.
    return `Z${Date.now().toString(36).toUpperCase().slice(-7)}`;
}

/**
 * Recalcula subtotal/total/totalPago de uma Comanda a partir dos itens e
 * pagamentos no banco. Idempotente.
 */
export async function recalcularComanda(comandaId: number): Promise<void> {
    const c = await prisma.comanda.findUnique({
        where: { id: comandaId },
        include: { itens: true, pagamentos: true },
    });
    if (!c) return;

    let subtotal = 0;
    for (const it of c.itens) {
        if (it.status === 'CANCELADO') continue;
        subtotal += Number(it.total);
    }
    const total = subtotal + Number(c.taxaServico) - Number(c.desconto);
    const totalPago = c.pagamentos.reduce((s, p) => s + Number(p.valor), 0);

    await prisma.comanda.update({
        where: { id: comandaId },
        data: {
            subtotal,
            total: Math.max(0, total),
            totalPago,
        },
    });
}

/**
 * Calcula o total de um item dado quantidade, preço base e opções escolhidas.
 * Soma `precoAdicional` de cada opção (linear, sem priceMethod AVG/MAX —
 * priceMethod só se aplica em exportação para o menuGo, na operação local
 * tratamos como SUM).
 */
export function totalItem(precoBase: number, acrescimoOpcoes: number, quantidade: number): number {
    const unit = Number(precoBase) + Number(acrescimoOpcoes);
    return Math.max(0, +(unit * Number(quantidade)).toFixed(2));
}

export type OpcaoEscolhida = {
    grupoId: number;
    opcaoId: number;
    nome: string;
    preco: number;
};

/** Valida opções escolhidas contra os grupos do produto. Retorna erro ou null. */
export async function validarOpcoes(
    produtoId: number,
    escolhidas: OpcaoEscolhida[],
): Promise<{ ok: true; acrescimo: number; resolved: OpcaoEscolhida[] } | { ok: false; error: string }> {
    const produto = await prisma.produto.findUnique({
        where: { id: produtoId },
        include: { grupos: { include: { opcoes: true } } },
    });
    if (!produto) return { ok: false, error: 'produto não existe' };

    // Conta opções por grupo
    const porGrupo: Record<number, OpcaoEscolhida[]> = {};
    for (const e of escolhidas) {
        const grupo = produto.grupos.find(g => g.id === e.grupoId);
        if (!grupo) return { ok: false, error: `grupoId ${e.grupoId} não pertence ao produto` };
        const opcao = grupo.opcoes.find(o => o.id === e.opcaoId);
        if (!opcao || !opcao.ativo) return { ok: false, error: `opcaoId ${e.opcaoId} inválida ou inativa` };
        if (!porGrupo[grupo.id]) porGrupo[grupo.id] = [];
        porGrupo[grupo.id].push({
            grupoId: grupo.id,
            opcaoId: opcao.id,
            nome: opcao.nome,
            preco: Number(opcao.precoAdicional),
        });
    }
    // Valida min/max por grupo
    for (const g of produto.grupos) {
        const count = porGrupo[g.id]?.length ?? 0;
        if (count < g.min) return { ok: false, error: `grupo "${g.nome}" requer ao menos ${g.min} opção(ões)` };
        if (count > g.max) return { ok: false, error: `grupo "${g.nome}" permite no máximo ${g.max} opção(ões)` };
    }

    const resolved: OpcaoEscolhida[] = [];
    for (const arr of Object.values(porGrupo)) resolved.push(...arr);
    const acrescimo = resolved.reduce((s, o) => s + o.preco, 0);
    return { ok: true, acrescimo: +acrescimo.toFixed(2), resolved };
}
