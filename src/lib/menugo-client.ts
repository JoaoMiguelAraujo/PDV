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
    const url = joinUrl(merchant.menugoBaseURL, `/api/v1/orders/${orderId}/${action}`);
    const bodyStr = body !== undefined ? JSON.stringify(body) : undefined;

    // 1ª tentativa: usa token cacheado se houver.
    // Em caso de 401 (token revogado/expirado no menuGo mas ainda no cache),
    // invalida cache e tenta novamente uma única vez com token fresh.
    let attempt = 0;
    let lastResult: CallResult = { ok: false, httpStatus: 0, responseBody: '', erro: null };
    while (attempt < 2) {
        const token = await getToken(merchant);
        if (!token) {
            return { ok: false, httpStatus: 0, responseBody: '', erro: 'Falha ao obter access_token OAuth2' };
        }
        const headers: Record<string, string> = {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...extraHeaders,
        };
        try {
            const res = await fetch(url, { method: 'POST', headers, body: bodyStr });
            const text = await res.text().catch(() => '');
            lastResult = {
                ok: res.ok,
                httpStatus: res.status,
                responseBody: text,
                erro: res.ok ? null : `HTTP ${res.status}`,
            };
            if (res.status === 401 && attempt === 0) {
                // Token rejeitado pelo menuGo — invalida cache e tenta de novo.
                logger.warn('menugo/callback 401 — invalidando token cache', {
                    merchantId: merchant.id, action,
                });
                invalidateMerchantToken(merchant.id);
                attempt++;
                continue;
            }
            return lastResult;
        } catch (err: any) {
            return { ok: false, httpStatus: 0, responseBody: '', erro: err?.message || 'erro de rede' };
        }
    }
    return lastResult;
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

// ============================================================================
// Extensões do adapter `menugo` (fork OD + Saipos)
// — só fazem sentido quando merchant.adapterType === 'menugo'.
// ============================================================================

/**
 * POST /v1/orders/{orderId}/setWaiter — atribui um garçom à mesa do pedido.
 * O menuGo grava em live_mesas.garcom_id.
 */
export function callSetWaiter(
    merchant: Merchant,
    orderId: string,
    body: { id: number | null; name?: string },
): Promise<CallResult> {
    return postCallback(merchant, orderId, 'setWaiter', body);
}

/**
 * POST /v1/orders/{orderId}/setOrderPad — define o número da comanda física.
 * Após gravar, o menuGo libera envios "segurados" da sessão (modo
 * mesa_com_comanda).
 */
export function callSetOrderPad(
    merchant: Merchant,
    orderId: string,
    body: { orderPad: string | null },
): Promise<CallResult> {
    return postCallback(merchant, orderId, 'setOrderPad', body);
}

/**
 * POST /v1/orders/{orderId}/closeSale — solicita fechamento da mesa.
 * Equivalente ao PUT /close-sale do Saipos. O menuGo bloqueia novos envios
 * dessa sessão até o operador cancelar a solicitação.
 */
export function callCloseSale(
    merchant: Merchant,
    orderId: string,
): Promise<CallResult> {
    return postCallback(merchant, orderId, 'closeSale', undefined);
}

/**
 * GET /v1/products — lista produtos da unidade (versão lite, sem variações
 * nem grupos de adicionais). Use `fetchProductDetail(id)` pra detalhe completo.
 */
export async function fetchProducts(
    merchant: Merchant,
): Promise<{ ok: boolean; products: any[]; categories: any[]; erro: string | null }> {
    const token = await getToken(merchant);
    if (!token) {
        return { ok: false, products: [], categories: [], erro: 'Falha ao obter access_token OAuth2' };
    }
    const url = joinUrl(merchant.menugoBaseURL, '/api/v1/products');
    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });
        if (!res.ok) {
            return { ok: false, products: [], categories: [], erro: `HTTP ${res.status}` };
        }
        const json = await res.json().catch(() => null) as { products?: any[]; categories?: any[] } | null;
        return {
            ok: true,
            products: json?.products ?? [],
            categories: json?.categories ?? [],
            erro: null,
        };
    } catch (err: any) {
        return { ok: false, products: [], categories: [], erro: err?.message || 'erro de rede' };
    }
}

/**
 * GET /v1/products/{id} — detalhe completo do produto com variações e
 * grupos de opções aninhados (incluindo `variationId` e `externalCode`).
 */
export async function fetchProductDetail(
    merchant: Merchant,
    productId: number,
): Promise<{ ok: boolean; product: any | null; erro: string | null }> {
    const token = await getToken(merchant);
    if (!token) {
        return { ok: false, product: null, erro: 'Falha ao obter access_token OAuth2' };
    }
    const url = joinUrl(merchant.menugoBaseURL, `/api/v1/products/${productId}`);
    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });
        if (!res.ok) {
            return { ok: false, product: null, erro: `HTTP ${res.status}` };
        }
        const json = await res.json().catch(() => null) as { product?: any } | null;
        return { ok: true, product: json?.product ?? null, erro: null };
    } catch (err: any) {
        return { ok: false, product: null, erro: err?.message || 'erro de rede' };
    }
}

/**
 * GET /v1/merchants/{merchantId}/waiters — lista os garçons disponíveis no
 * tenant do merchant. Usa o mesmo Bearer OAuth do callback.
 */
export async function fetchWaiters(
    merchant: Merchant,
): Promise<{ ok: boolean; waiters: Array<{ id: number; name: string; externalCode: string | null }>; erro: string | null }> {
    const token = await getToken(merchant);
    if (!token) {
        return { ok: false, waiters: [], erro: 'Falha ao obter access_token OAuth2' };
    }
    const url = joinUrl(merchant.menugoBaseURL, `/api/v1/merchants/${encodeURIComponent(merchant.merchantId)}/waiters`);
    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });
        if (!res.ok) {
            return { ok: false, waiters: [], erro: `HTTP ${res.status}` };
        }
        const json = await res.json().catch(() => null) as { waiters?: any[] } | null;
        return { ok: true, waiters: json?.waiters ?? [], erro: null };
    } catch (err: any) {
        return { ok: false, waiters: [], erro: err?.message || 'erro de rede' };
    }
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

/**
 * Open Delivery v1.7 — POST /v1/menuUpdated (docs/openapi.yaml linha 2532).
 *
 * HOST: ORDERING APPLICATION. DIRECTION: SS → OA.
 *
 * Notifica o menuGo que o catálogo do merchant mudou. Por padrão envia body
 * vazio — a spec define que isso força a OA a refazer GET /v1/merchant para
 * pegar o estado completo (modo "1 - Sent with an empty body").
 *
 * Fire-and-forget: não bloqueia o CRUD do PDV. Erros vão para o log e ficam
 * disponíveis para retry manual.
 */
export async function notifyMenuUpdated(merchantId: number): Promise<void> {
    try {
        const merchant = await (await import('./db')).prisma.merchant.findUnique({ where: { id: merchantId } });
        if (!merchant || !merchant.ativo) return;
        const url = joinUrl(merchant.menugoBaseURL, '/api/v1/menuUpdated');
        const token = await getToken(merchant);
        if (!token) {
            logger.warn('menugo/menuUpdated sem token', { merchantId });
            return;
        }
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            // Body vazio = força a OA a fazer um novo GET /v1/merchant.
            body: '{}',
        });
        if (!res.ok && res.status !== 204) {
            const text = await res.text().catch(() => '');
            logger.warn('menugo/menuUpdated nao ok', { merchantId, status: res.status, body: text.slice(0, 200) });
        }
    } catch (err: any) {
        logger.error('menugo/menuUpdated crash', { merchantId, message: err?.message });
    }
}

/** Dispara notifyMenuUpdated em background, sem bloquear o caller. */
export function notifyMenuUpdatedAsync(merchantId: number): void {
    notifyMenuUpdated(merchantId).catch(err => {
        logger.error('menugo/menuUpdated background fail', { merchantId, message: err?.message });
    });
}
