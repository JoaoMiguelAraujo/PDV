import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { buildMerchantOD, MerchantExportIncompleteError } from '@/lib/merchant-export';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Open Delivery v1.7 — GET /v1/merchant (docs/openapi.yaml linha 1173).
 *
 * HOST: SOFTWARE SERVICE (nós). DIRECTION: Ordering Application → Software Service.
 *
 * Spec security: `[]` ou `apiKey`. Aceitamos:
 *  - Sem auth (compat com OAs que não autenticam catálogo público) — opcional.
 *  - Header `apiKey: <string>` (formato `apiKey` da spec).
 *
 * Resolução do merchant (a spec não define parâmetro, mas precisamos pois somos
 * multi-merchant):
 *  - Header `X-App-MerchantId: <od_merchantId>`  (canônico — mesmo padrão do /v1/newEvent)
 *  - ou query `?merchantId=<od_merchantId>`
 *
 * Respostas:
 *  - 200 application/json — `Merchant` da spec
 *  - 400 — merchantId não informado
 *  - 404 — merchant desconhecido
 *  - 503 — merchant existe mas BasicInfo incompleto (operador deve completar
 *          os campos obrigatórios no painel antes de a OA conseguir importar).
 */
export async function GET(req: Request) {
    const url = new URL(req.url);
    const merchantIdHeader = req.headers.get('x-app-merchantid') ?? undefined;
    const merchantIdQuery = url.searchParams.get('merchantId') ?? undefined;
    const odMerchantId = merchantIdHeader || merchantIdQuery;

    if (!odMerchantId) {
        return NextResponse.json(
            { title: 'BadRequest', status: 400, detail: 'Informe merchantId via header X-App-MerchantId ou query ?merchantId=' },
            { status: 400 },
        );
    }

    const merchant = await prisma.merchant.findUnique({ where: { merchantId: odMerchantId } });
    if (!merchant) {
        return NextResponse.json({ title: 'NotFound', status: 404 }, { status: 404 });
    }

    try {
        const md = await buildMerchantOD(merchant.id);
        return NextResponse.json(md, {
            status: 200,
            headers: {
                'Cache-Control': `public, max-age=${md.TTL}`,
            },
        });
    } catch (err: any) {
        if (err instanceof MerchantExportIncompleteError) {
            logger.warn('merchant/export incompleto', { merchantId: merchant.id, missing: err.missing });
            return NextResponse.json(
                {
                    title: 'ServiceUnavailable',
                    status: 503,
                    detail: err.message,
                },
                { status: 503 },
            );
        }
        logger.error('merchant/export crash', { merchantId: merchant.id, message: err?.message });
        return NextResponse.json(
            { title: 'InternalError', status: 500, detail: err?.message ?? 'erro inesperado' },
            { status: 500 },
        );
    }
}
