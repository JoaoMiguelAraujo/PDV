import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import bcrypt from 'bcrypt';
import { cookies, headers } from 'next/headers';
import { env } from './env';
import { AUTH_COOKIE, isCookieValid } from './auth-shared';

export { AUTH_COOKIE, isCookieValid };

/**
 * Detecta se a request atual veio via HTTPS (direto ou via proxy reverso).
 * Necessário porque o Coolify (e qualquer reverse-proxy) termina TLS antes de
 * chegar no app — process.env.NODE_ENV='production' não diz nada sobre o
 * scheme real. Setar `secure: true` num cookie HTTP-only faz o browser rejeitar
 * silenciosamente.
 */
async function isHttpsRequest(): Promise<boolean> {
    try {
        const h = await headers();
        const forwarded = h.get('x-forwarded-proto');
        if (forwarded) return forwarded.split(',')[0].trim().toLowerCase() === 'https';
        const host = h.get('host') || '';
        // Fallback: assume HTTPS se host parece domínio público sem porta dev.
        return false;
    } catch {
        return false;
    }
}

/**
 * Auth do operador admin do PDV.
 *
 * Modelo simples: 1 senha em env (ADMIN_PASSWORD). Login confere com bcrypt
 * (hash gerado em memória no boot), seta cookie httpOnly `pdv_session` cujo
 * valor é HMAC-SHA256 de "OK|<expira_em_ms>" usando AUTH_SECRET.
 *
 * Sem store de sessão — a validação é puramente cripto. Para revogar TODAS
 * as sessões, basta rotacionar AUTH_SECRET (também invalida secrets cifrados,
 * então só faça em rotação coordenada).
 */

const COOKIE_NAME = AUTH_COOKIE;
const TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 dias

let cachedHash: string | null = null;
async function getAdminHash(): Promise<string> {
    if (cachedHash) return cachedHash;
    cachedHash = await bcrypt.hash(env.ADMIN_PASSWORD(), 10);
    return cachedHash;
}

export async function verifyPassword(input: string): Promise<boolean> {
    if (!input) return false;
    const hash = await getAdminHash();
    return bcrypt.compare(input, hash);
}

function sign(payload: string): string {
    return createHmac('sha256', env.AUTH_SECRET()).update(payload).digest('hex');
}

function buildCookieValue(expiresAt: number): string {
    const payload = `OK|${expiresAt}`;
    const sig = sign(payload);
    return `${payload}|${sig}`;
}

function parseCookieValue(value: string): { ok: boolean; expiresAt?: number } {
    const parts = value.split('|');
    if (parts.length !== 3) return { ok: false };
    const [marker, exp, sig] = parts;
    if (marker !== 'OK') return { ok: false };
    const expected = sign(`${marker}|${exp}`);
    if (sig.length !== expected.length) return { ok: false };
    let same = false;
    try {
        same = timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
    } catch {
        return { ok: false };
    }
    if (!same) return { ok: false };
    const expiresAt = parseInt(exp, 10);
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return { ok: false };
    return { ok: true, expiresAt };
}

export async function createSession(): Promise<void> {
    const expiresAt = Date.now() + TTL_MS;
    const value = buildCookieValue(expiresAt);
    const jar = await cookies();
    const secure = await isHttpsRequest();
    jar.set(COOKIE_NAME, value, {
        httpOnly: true,
        sameSite: 'lax',
        secure,
        path: '/',
        expires: new Date(expiresAt),
    });
}

export async function destroySession(): Promise<void> {
    const jar = await cookies();
    const secure = await isHttpsRequest();
    jar.set(COOKIE_NAME, '', {
        httpOnly: true,
        sameSite: 'lax',
        secure,
        path: '/',
        maxAge: 0,
    });
}

export async function isAuthenticated(): Promise<boolean> {
    const jar = await cookies();
    const raw = jar.get(COOKIE_NAME)?.value;
    if (!raw) return false;
    return parseCookieValue(raw).ok;
}

/** Lança 401 se não autenticado — para API handlers. */
export async function requireAuth(): Promise<void> {
    const ok = await isAuthenticated();
    if (!ok) {
        const err: any = new Error('Não autenticado');
        err.status = 401;
        throw err;
    }
}

export function generateRandomToken(bytes = 32): string {
    return randomBytes(bytes).toString('hex');
}
