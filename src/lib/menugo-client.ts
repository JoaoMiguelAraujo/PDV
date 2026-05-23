import 'server-only';
import { logger } from './logger';
import { decryptSecret } from './crypto-secrets';
import { env } from './env';
import type { Merchant } from '@prisma/client';
import type {
    ODOrderConfirmed,
    ODRequestCancelled,
    ODRequestDenied,
    ODTokenResponse,
} from './od-types';

/**
 * Cliente HTTP para chamar o menuGo (Ordering Application) como Software Service.
 *
 * Implementa, fiel à spec OD v1.7:
 *  - POST {base}/api/v1/oauth/token (client_credentials)
 *  - POST {base}/api/v1/orders/{orderId}/confirm
 *  - POST {base}/api/v1/orders/{orderId}/preparing
 *  - POST {base}/api/v1/orders/{orderId}/delivered
 *  - POST {base}/api/v1/orders/{orderId}/requestCancellation
 *  - POST {base}/api/v1/orders/{orderId}/acceptCancellation
 *  - POST {base}/api/v1/orders/{orderId}/denyCancellation
 *
 * Cache de access_token em memória por merchant.id, com margem de refresh.
 */

interface CachedToken {
    token: string;
    expiresAt: number;       // epoch ms
}
const tokenCache = new Map<number, CachedToken>();

export interface CallResult {
    ok: boolean;
    httpStatus: number;
    responseBody: string;
    erro: string | null;
}

function joinUrl(base: string, path: string): string {
    return `${base.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

async function getToken(merchant: Merchant): Promise<string | null> {
    const cached = tokenCache.get(merchant.id);
    const marginMs = env.OAUTH_TOKEN_CACHE_MARGIN_MS();
    if (cached && cached.expiresAt - marginMs > Date.now()) return cached.token;

    let secret: string;
    try {
        secret = decryptSecret(merchant.menugoClientSecretEnc);
    } catch (err: any) {
        logger.error('menugo/token decrypt falhou', { merchantId: merchant.id, message: err?.message });
        return null;
    }
    if (!secret) {
        logger.error('menugo/token sem secret', { merchantId: merchant.id });
        return null;
    }

    // Spec OD v1.7 (/oauth/token):
    //   application/x-www-form-urlencoded
    //   grant_type=client_credentials&client_id=<id>&client_secret=<secret>
    const url = joinUrl(merchant.menugoBaseURL, '/api/v1/oauth/token');
    let res: Response;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: merchant.menugoClientId,
                client_secret: secret,
            }).toString(),
        });
    } catch (err: any) {
        logger.error('menugo/token fetch falhou', { url, message: err?.message });
        return null;
    }

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        logger.error('menugo/token status nao ok', { url, status: res.status, body: text.slice(0, 300) });
        return null;
    }
    const json = (await res.json().catch(() => null)) as ODTokenResponse | null;
    if (!json?.access_token) {
        logger.error('menugo/token sem access_token', { url });
        return null;
    }
    const expiresAt = Date.now() + Math.max(60, (json.expires_in || 3600)) * 1000;
    tokenCache.set(merchant.id, { token: json.access_token, expiresAt });
    return json.access_token;
}

/**
 * Limpa o cache de token (uso quando merchant é atualizado/desativado).
 */
export function invalidateMerchantToken(merchantId: number): void {
    tokenCache.delete(merchantId);
}

async function postCallback(
    merchant: Merchant,
    orderId: string,
    action: string,
    body: any | undefined,
    extraHeaders: Record<string, string> = {},
): Promise<CallResult> {
    const token = await getToken(merchant);
    if (!token) {
        return { ok: false, httpStatus: 0, responseBody: '', erro: 'Falha ao obter access_token OAuth2' };
    }

    const url = joinUrl(merchant.menugoBaseURL, `/api/v1/orders/${orderId}/${action}`);
    const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...extraHeaders,
    };
    const bodyStr = body !== undefined ? JSON.stringify(body) : undefined;

    try {
        const res = await fetch(url, { method: 'POST', headers, body: bodyStr });
        const text = await res.text().catch(() => '');
        return {
            ok: res.ok,
            httpStatus: res.status,
            responseBody: text,
            erro: res.ok ? null : `HTTP ${res.status}`,
        };
    } catch (err: any) {
        return { ok: false, httpStatus: 0, responseBody: '', erro: err?.message || 'erro de rede' };
    }
}

// ============================================================================
// Métodos públicos — fiéis à spec OD v1.7
// ============================================================================

export function callConfirm(
    merchant: Merchant,
    orderId: string,
    body: ODOrderConfirmed,
    payOnConfirm: boolean,
): Promise<CallResult> {
    return postCallback(
        merchant,
        orderId,
        'confirm',
        body,
        // X-Mock-Payments é uma extensão do menuGo para simular pagamento PREPAID.
        // Não está na spec OD — é um hook proprietário de homologação. Só envia
        // quando o operador/setting pede explicitamente.
        payOnConfirm ? { 'X-Mock-Payments': 'PREPAID' } : {},
    );
}

export function callPreparing(merchant: Merchant, orderId: string): Promise<CallResult> {
    return postCallback(merchant, orderId, 'preparing', undefined);
}

export function callDelivered(merchant: Merchant, orderId: string): Promise<CallResult> {
    return postCallback(merchant, orderId, 'delivered', undefined);
}

export function callRequestCancellation(
    merchant: Merchant,
    orderId: string,
    body: ODRequestCancelled,
): Promise<CallResult> {
    return postCallback(merchant, orderId, 'requestCancellation', body);
}

export function callAcceptCancellation(merchant: Merchant, orderId: string): Promise<CallResult> {
    return postCallback(merchant, orderId, 'acceptCancellation', undefined);
}

export function callDenyCancellation(
    merchant: Merchant,
    orderId: string,
    body: ODRequestDenied,
): Promise<CallResult> {
    return postCallback(merchant, orderId, 'denyCancellation', body);
}

/** Busca a Order completa via GET orderURL. Usado pelo /v1/newEvent. */
export async function fetchOrderFromURL(orderURL: string): Promise<{ status: number; body: string }> {
    try {
        const res = await fetch(orderURL, { method: 'GET' });
        const body = await res.text().catch(() => '');
        return { status: res.status, body };
    } catch (err: any) {
        logger.error('menugo/fetchOrder erro', { orderURL, message: err?.message });
        return { status: 0, body: '' };
    }
}
