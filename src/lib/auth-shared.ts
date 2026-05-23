/**
 * Helpers de cookie usados também pelo middleware (Edge runtime).
 * Usa Web Crypto API — disponível em Edge e Node 20+.
 * NÃO importar nada que toque o filesystem ou bcrypt aqui.
 */

export const AUTH_COOKIE = 'pdv_session';

const encoder = new TextEncoder();

function hexToBytes(hex: string): Uint8Array | null {
    if (hex.length % 2 !== 0) return null;
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) {
        const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
        if (Number.isNaN(byte)) return null;
        out[i] = byte;
    }
    return out;
}

function bytesToHex(bytes: ArrayBuffer): string {
    const view = new Uint8Array(bytes);
    let hex = '';
    for (let i = 0; i < view.length; i++) {
        hex += view[i].toString(16).padStart(2, '0');
    }
    return hex;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
}

export async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    return bytesToHex(sig);
}

export async function isCookieValid(value: string | undefined, secret: string): Promise<boolean> {
    if (!value) return false;
    const parts = value.split('|');
    if (parts.length !== 3) return false;
    const [marker, exp, sig] = parts;
    if (marker !== 'OK') return false;

    const expected = await hmacSha256Hex(secret, `${marker}|${exp}`);
    const sigBytes = hexToBytes(sig);
    const expectedBytes = hexToBytes(expected);
    if (!sigBytes || !expectedBytes) return false;
    if (!constantTimeEqual(sigBytes, expectedBytes)) return false;

    const expiresAt = parseInt(exp, 10);
    return Number.isFinite(expiresAt) && expiresAt > Date.now();
}
