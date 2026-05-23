import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { decryptSecret } from '@/lib/crypto-secrets';
import { env } from '@/lib/env';
import { withAuth, badRequest, notFound } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

interface RouteCtx { params: Promise<{ id: string }> }

interface CheckResult {
    step: string;
    ok: boolean;
    detail: string;
}

/**
 * POST /api/merchants/{id}/test
 *
 * Executa uma bateria de checks bilaterais para o merchant configurado:
 *  1. Self-check: GET /api/v1/merchant retorna 200 (BasicInfo completo)?
 *  2. menuGo alcançável: HEAD/GET na URL base responde?
 *  3. OAuth2: POST /oauth/token devolve access_token válido?
 *
 * Não dispara webhook real — só valida pré-requisitos. O fluxo CREATED real
 * só roda quando o garçom confirma um envio no menuGo.
 */
export const POST = withAuth(async (_req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) return badRequest('id inválido');

    const merchant = await prisma.merchant.findUnique({ where: { id } });
    if (!merchant) return notFound('estabelecimento não existe');

    const results: CheckResult[] = [];

    // ===== 1. Self-check: GET /api/v1/merchant funciona? =====
    try {
        const selfUrl = `${env.APP_URL()}/api/v1/merchant?merchantId=${encodeURIComponent(merchant.merchantId)}`;
        const res = await fetch(selfUrl, { method: 'GET' });
        const status = res.status;
        if (status === 200) {
            results.push({
                step: 'Exportação do Merchant (GET /v1/merchant)',
                ok: true,
                detail: 'BasicInfo completo — o menuGo conseguirá importar o catálogo.',
            });
        } else if (status === 503) {
            const body = await res.json().catch(() => ({}));
            results.push({
                step: 'Exportação do Merchant (GET /v1/merchant)',
                ok: false,
                detail: body?.detail || 'BasicInfo incompleto. Preencha os campos obrigatórios nas abas BasicInfo/Endereço/Contatos/Imagens.',
            });
        } else {
            results.push({
                step: 'Exportação do Merchant (GET /v1/merchant)',
                ok: false,
                detail: `HTTP ${status}`,
            });
        }
    } catch (err: any) {
        results.push({
            step: 'Exportação do Merchant (GET /v1/merchant)',
            ok: false,
            detail: err?.message || 'erro inesperado',
        });
    }

    // ===== 2. menuGo alcançável? =====
    try {
        const baseURL = (merchant.menugoBaseURL || '').replace(/\/$/, '');
        if (!baseURL) {
            results.push({ step: 'Conectividade menuGo', ok: false, detail: 'menugoBaseURL não configurado' });
        } else {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 5000);
            try {
                // HEAD pode não ser suportado por todos os servidores; fallback GET no /api/health.
                let res = await fetch(`${baseURL}/api/health`, { signal: ctrl.signal });
                if (res.status === 404) {
                    res = await fetch(baseURL, { signal: ctrl.signal });
                }
                results.push({
                    step: 'Conectividade menuGo',
                    ok: res.status < 500,
                    detail: `HTTP ${res.status} de ${baseURL}`,
                });
            } finally {
                clearTimeout(timer);
            }
        }
    } catch (err: any) {
        results.push({
            step: 'Conectividade menuGo',
            ok: false,
            detail: err?.name === 'AbortError'
                ? 'Timeout após 5s — DNS, firewall ou hostname errado'
                : (err?.message || 'erro inesperado'),
        });
    }

    // ===== 3. OAuth2 token funciona? =====
    try {
        const baseURL = (merchant.menugoBaseURL || '').replace(/\/$/, '');
        const clientId = merchant.menugoClientId;
        let clientSecret = '';
        try {
            clientSecret = decryptSecret(merchant.menugoClientSecretEnc);
        } catch {
            results.push({ step: 'OAuth2 access_token', ok: false, detail: 'Falha ao decifrar OAuth2 client_secret — re-cadastre' });
            return NextResponse.json({ ok: false, results });
        }
        if (!baseURL || !clientId || !clientSecret) {
            results.push({ step: 'OAuth2 access_token', ok: false, detail: 'menugoBaseURL/clientId/clientSecret não configurados' });
        } else {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 8000);
            try {
                const tokenRes = await fetch(`${baseURL}/api/v1/oauth/token`, {
                    method: 'POST',
                    signal: ctrl.signal,
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        grant_type: 'client_credentials',
                        client_id: clientId,
                        client_secret: clientSecret,
                    }).toString(),
                });
                if (tokenRes.ok) {
                    const json = await tokenRes.json().catch(() => ({}));
                    if (json?.access_token) {
                        results.push({
                            step: 'OAuth2 access_token',
                            ok: true,
                            detail: `Token obtido (${json.token_type || 'Bearer'}, expires_in=${json.expires_in || '?'}s)`,
                        });
                    } else {
                        results.push({
                            step: 'OAuth2 access_token',
                            ok: false,
                            detail: 'Resposta 200 mas sem access_token no JSON',
                        });
                    }
                } else {
                    const txt = await tokenRes.text().catch(() => '');
                    results.push({
                        step: 'OAuth2 access_token',
                        ok: false,
                        detail: `HTTP ${tokenRes.status}: ${txt.slice(0, 200)}`,
                    });
                }
            } finally {
                clearTimeout(timer);
            }
        }
    } catch (err: any) {
        results.push({
            step: 'OAuth2 access_token',
            ok: false,
            detail: err?.name === 'AbortError'
                ? 'Timeout após 8s'
                : (err?.message || 'erro inesperado'),
        });
    }

    const allOk = results.every(r => r.ok);
    return NextResponse.json({ ok: allOk, results });
});
