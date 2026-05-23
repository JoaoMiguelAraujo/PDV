import 'server-only';
import { prisma } from './db';
import { notifyMenuUpdatedAsync } from './menugo-client';
import { logger } from './logger';

/**
 * Dispara `POST /v1/menuUpdated` ao menuGo (Ordering Application) após qualquer
 * mutação em catálogo do PDV. Resolve `merchantId` a partir de
 * categoria/produto/grupo/opcao quando o caller não tem direto.
 *
 * Sempre fire-and-forget — não bloqueia o handler HTTP do PDV.
 */

export function notifyByMerchant(merchantId: number) {
    if (Number.isFinite(merchantId)) notifyMenuUpdatedAsync(merchantId);
}

export async function notifyByCategoria(categoriaId: number) {
    try {
        const c = await prisma.categoria.findUnique({ where: { id: categoriaId }, select: { merchantId: true } });
        if (c?.merchantId) notifyMenuUpdatedAsync(c.merchantId);
    } catch (err: any) {
        logger.warn('notifyByCategoria falhou', { categoriaId, message: err?.message });
    }
}

export async function notifyByProduto(produtoId: number) {
    try {
        const p = await prisma.produto.findUnique({ where: { id: produtoId }, select: { merchantId: true } });
        if (p?.merchantId) notifyMenuUpdatedAsync(p.merchantId);
    } catch (err: any) {
        logger.warn('notifyByProduto falhou', { produtoId, message: err?.message });
    }
}

export async function notifyByGrupo(grupoId: number) {
    try {
        const g = await prisma.grupoModificador.findUnique({
            where: { id: grupoId },
            select: { produto: { select: { merchantId: true } } },
        });
        if (g?.produto?.merchantId) notifyMenuUpdatedAsync(g.produto.merchantId);
    } catch (err: any) {
        logger.warn('notifyByGrupo falhou', { grupoId, message: err?.message });
    }
}

export async function notifyByOpcao(opcaoId: number) {
    try {
        const o = await prisma.opcaoModificador.findUnique({
            where: { id: opcaoId },
            select: { grupo: { select: { produto: { select: { merchantId: true } } } } },
        });
        const mid = o?.grupo?.produto?.merchantId;
        if (mid) notifyMenuUpdatedAsync(mid);
    } catch (err: any) {
        logger.warn('notifyByOpcao falhou', { opcaoId, message: err?.message });
    }
}
