import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Helpers de cookie usados também pelo middleware (Edge runtime).
 * NÃO importar nada que toque o filesystem ou bcrypt aqui.
 */

export const AUTH_COOKIE = 'pdv_session';

export function isCookieValid(value: string | undefined, secret: string): boolean {
    if (!value) return false;
    const parts = value.split('|');
    if (parts.length !== 3) return false;
    const [marker, exp, sig] = parts;
    if (marker !== 'OK') return false;
    const expected = createHmac('sha256', secret).update(`${marker}|${exp}`).digest('hex');
    if (sig.length !== expected.length) return false;
    try {
        const same = timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
        if (!same) return false;
    } catch {
        return false;
    }
    const expiresAt = parseInt(exp, 10);
    return Number.isFinite(expiresAt) && expiresAt > Date.now();
}
