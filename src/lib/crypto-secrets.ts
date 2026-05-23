import 'server-only';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'crypto';
import { env } from './env';

/**
 * AES-256-GCM autenticado para segredos em repouso (clientSecret HMAC + OAuth2).
 *
 * Chave derivada de AUTH_SECRET via HKDF-SHA256 com salt fixo "pdv-od-secrets-v1".
 * Trocar AUTH_SECRET invalida todos os segredos cifrados — necessário re-cadastrar
 * cada merchant. Esse é o trade-off aceito para não precisar de KMS externo.
 *
 * Formato gravado:
 *   enc:v1:{base64(iv)}.{base64(ciphertext + authTag)}
 *
 * Valores sem prefixo `enc:v1:` são tratados como legacy plain — funcionam mas
 * devem ser re-cifrados no próximo save pela UI (faça apagar + redigitar).
 */

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;        // 96-bit IV recomendado para GCM
const TAG_LEN = 16;       // GCM produz tag de 128 bits
const HKDF_INFO = 'pdv-od-secrets-v1';
const PREFIX = 'enc:v1:';

let cachedKey: Buffer | null = null;
function getKey(): Buffer {
    if (cachedKey) return cachedKey;
    const ikm = Buffer.from(env.AUTH_SECRET(), 'utf8');
    // HKDF-SHA256 → 32 bytes para AES-256.
    const okm = hkdfSync('sha256', ikm, Buffer.alloc(0), Buffer.from(HKDF_INFO), 32);
    cachedKey = Buffer.from(okm);
    return cachedKey;
}

export function encryptSecret(plain: string): string {
    const key = getKey();
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGO, key, iv);
    const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const blob = Buffer.concat([ciphertext, tag]);
    return `${PREFIX}${iv.toString('base64')}.${blob.toString('base64')}`;
}

export function decryptSecret(stored: string | null | undefined): string {
    if (!stored) return '';
    if (!stored.startsWith(PREFIX)) {
        // Legacy plain (ou vazio); devolve como está.
        return stored;
    }
    const [ivB64, blobB64] = stored.slice(PREFIX.length).split('.');
    if (!ivB64 || !blobB64) throw new Error('[crypto] formato cifrado inválido');
    const iv = Buffer.from(ivB64, 'base64');
    const blob = Buffer.from(blobB64, 'base64');
    if (blob.length < TAG_LEN) throw new Error('[crypto] tag GCM ausente');
    const ciphertext = blob.subarray(0, blob.length - TAG_LEN);
    const tag = blob.subarray(blob.length - TAG_LEN);
    const decipher = createDecipheriv(ALGO, getKey(), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plain.toString('utf8');
}

/** Mascara para exibição na UI quando há valor cifrado. */
export const SECRET_MASK = '••••••••••••';

/**
 * Helper de UI: se o input vier como SECRET_MASK, preserva o valor cifrado atual.
 * Caso contrário, cifra o novo plain. Usado nos handlers de PATCH de Merchant.
 */
export function preserveOrEncrypt(input: string | undefined | null, current: string | null): string | null {
    if (input === undefined || input === null) return current;
    if (input === SECRET_MASK) return current;
    if (input === '') return null;
    return encryptSecret(input);
}
