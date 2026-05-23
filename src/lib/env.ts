/**
 * Acesso central às variáveis de ambiente.
 * Valida o que é obrigatório no boot — falha cedo em vez de runtime obscuro.
 */
import 'server-only';

function required(name: string): string {
    const v = process.env[name];
    if (!v || v.trim() === '') {
        throw new Error(`[env] variável obrigatória ausente: ${name}`);
    }
    return v;
}

function optional(name: string, fallback: string): string {
    const v = process.env[name];
    return v && v.trim() !== '' ? v : fallback;
}

function optionalInt(name: string, fallback: number): number {
    const v = process.env[name];
    if (!v) return fallback;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
}

function optionalBool(name: string, fallback: boolean): boolean {
    const v = process.env[name];
    if (v === undefined || v === '') return fallback;
    return v === '1' || v.toLowerCase() === 'true';
}

export const env = {
    DATABASE_URL: () => required('DATABASE_URL'),
    AUTH_SECRET: () => {
        const v = required('AUTH_SECRET');
        if (v.length < 32) {
            throw new Error('[env] AUTH_SECRET deve ter no mínimo 32 caracteres');
        }
        return v;
    },
    ADMIN_PASSWORD: () => required('ADMIN_PASSWORD'),
    APP_URL: () => optional('APP_URL', 'http://localhost:4003').replace(/\/$/, ''),

    AUTO_MODE_DEFAULT: () => optionalBool('AUTO_MODE_DEFAULT', false),
    AUTO_CONFIRM_DELAY_MS: () => optionalInt('AUTO_CONFIRM_DELAY_MS', 2000),
    AUTO_PREPARING_DELAY_MS: () => optionalInt('AUTO_PREPARING_DELAY_MS', 5000),
    AUTO_DELIVERED_DELAY_MS: () => optionalInt('AUTO_DELIVERED_DELAY_MS', 10000),
    PAY_ON_CONFIRM_DEFAULT: () => optionalBool('PAY_ON_CONFIRM_DEFAULT', true),
    OAUTH_TOKEN_CACHE_MARGIN_MS: () => optionalInt('OAUTH_TOKEN_CACHE_MARGIN_MS', 30000),
};
