import 'server-only';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Open Delivery v1.7 — POST /v1/newEvent.
 *
 * Header X-App-Signature: "SHA256 hash of the request body, using the client
 * secret as the key" (openapi.yaml linha 2617). Retornado em hex lowercase.
 *
 * O body precisa ser EXATAMENTE os mesmos bytes recebidos — não pretty-print,
 * não normalizar JSON. Por isso lemos `req.text()` antes de qualquer parse.
 */
export function signBody(body: string, clientSecret: string): string {
    return createHmac('sha256', clientSecret).update(body).digest('hex');
}

/** Comparação em tempo constante para evitar timing attacks. */
export function verifySignature(body: string, clientSecret: string, signature: string): boolean {
    const expected = signBody(body, clientSecret);
    if (signature.length !== expected.length) return false;
    try {
        return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
    } catch {
        return false;
    }
}
