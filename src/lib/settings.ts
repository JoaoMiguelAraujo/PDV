import 'server-only';
import { prisma } from './db';
import { env } from './env';

/**
 * Settings = chave/valor persistente sobrescrevendo os defaults vindos do env.
 * Cache em memória de 5s para não bater no banco a cada request.
 */

export type SettingsSnapshot = {
    autoMode: boolean;
    autoConfirmDelayMs: number;
    autoPreparingDelayMs: number;
    autoDeliveredDelayMs: number;
    payOnConfirm: boolean;
};

const CACHE_TTL_MS = 5000;
let cached: { at: number; data: SettingsSnapshot } | null = null;

async function readAll(): Promise<Record<string, string>> {
    const rows = await prisma.setting.findMany();
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

function toBool(v: string | undefined, fallback: boolean): boolean {
    if (v === undefined) return fallback;
    return v === '1' || v.toLowerCase() === 'true';
}

function toInt(v: string | undefined, fallback: number): number {
    if (v === undefined) return fallback;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
}

export async function getSettings(): Promise<SettingsSnapshot> {
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;
    const map = await readAll();
    const data: SettingsSnapshot = {
        autoMode: toBool(map['auto_mode'], env.AUTO_MODE_DEFAULT()),
        autoConfirmDelayMs: toInt(map['auto_confirm_delay_ms'], env.AUTO_CONFIRM_DELAY_MS()),
        autoPreparingDelayMs: toInt(map['auto_preparing_delay_ms'], env.AUTO_PREPARING_DELAY_MS()),
        autoDeliveredDelayMs: toInt(map['auto_delivered_delay_ms'], env.AUTO_DELIVERED_DELAY_MS()),
        payOnConfirm: toBool(map['pay_on_confirm'], env.PAY_ON_CONFIRM_DEFAULT()),
    };
    cached = { at: Date.now(), data };
    return data;
}

export async function setSetting(key: string, value: string): Promise<void> {
    await prisma.setting.upsert({
        where: { key },
        create: { key, value },
        update: { value },
    });
    cached = null;
}

export const SETTING_KEYS = {
    AUTO_MODE: 'auto_mode',
    AUTO_CONFIRM_DELAY_MS: 'auto_confirm_delay_ms',
    AUTO_PREPARING_DELAY_MS: 'auto_preparing_delay_ms',
    AUTO_DELIVERED_DELAY_MS: 'auto_delivered_delay_ms',
    PAY_ON_CONFIRM: 'pay_on_confirm',
} as const;
