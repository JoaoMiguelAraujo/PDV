import 'server-only';
import { prisma } from './db';
import { logger } from './logger';
import { getSettings } from './settings';
import { doConfirm, doPreparing, doDelivered } from './orders';
import type { Merchant } from '@prisma/client';

/**
 * Auto-runner opcional — replica o comportamento do mock antigo do menuGo:
 * ao receber CREATED, agenda confirm → preparing → delivered com delays
 * configuráveis em Settings. Só roda se Settings.auto_mode estiver ON.
 *
 * IMPORTANTE: setTimeout em processo Node — se o container reiniciar entre
 * etapas, a timeline NÃO é retomada. Aceitável: o operador pode finalizar
 * manualmente no KDS.
 */

export async function scheduleAutoTimeline(opts: {
    orderRowId: number;
    merchant: Merchant;
}): Promise<void> {
    const settings = await getSettings();
    if (!settings.autoMode) return;

    const { orderRowId, merchant } = opts;

    setTimeout(async () => {
        try {
            const o = await prisma.order.findUnique({ where: { id: orderRowId } });
            if (!o || o.status !== 'NEW') return;
            await doConfirm(o, merchant, 'AUTO');
        } catch (err: any) {
            logger.error('auto/confirm crash', { orderRowId, message: err?.message });
        }
    }, Math.max(0, settings.autoConfirmDelayMs));

    setTimeout(async () => {
        try {
            const o = await prisma.order.findUnique({ where: { id: orderRowId } });
            if (!o || o.status !== 'CONFIRMED') return;
            await doPreparing(o, merchant, 'AUTO');
        } catch (err: any) {
            logger.error('auto/preparing crash', { orderRowId, message: err?.message });
        }
    }, Math.max(0, settings.autoPreparingDelayMs));

    setTimeout(async () => {
        try {
            const o = await prisma.order.findUnique({ where: { id: orderRowId } });
            if (!o) return;
            if (o.status !== 'PREPARING' && o.status !== 'CONFIRMED') return;
            await doDelivered(o, merchant, 'AUTO');
        } catch (err: any) {
            logger.error('auto/delivered crash', { orderRowId, message: err?.message });
        }
    }, Math.max(0, settings.autoDeliveredDelayMs));
}
