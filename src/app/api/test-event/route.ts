import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/db';
import { decryptSecret } from '@/lib/crypto-secrets';
import { signBody } from '@/lib/signature';
import { env } from '@/lib/env';
import { withAuth, badRequest, notFound } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

/**
 * Dispara um Event sintético contra o próprio /v1/newEvent.
 * Útil para validar a cadeia HMAC sem precisar do menuGo.
 *
 * Body: { merchantId: number }  — id local do merchant cadastrado.
 */
export const POST = withAuth(async (req: Request) => {
    let body: any = {};
    try { body = await req.json(); } catch { /* sem body, usa primeiro merchant */ }

    let merchant: any;
    if (body.merchantId) {
        merchant = await prisma.merchant.findUnique({ where: { id: Number(body.merchantId) } });
        if (!merchant) return notFound('merchant não existe');
    } else {
        merchant = await prisma.merchant.findFirst({ where: { ativo: true }, orderBy: { id: 'asc' } });
        if (!merchant) return badRequest('nenhum merchant ativo cadastrado');
    }

    const secret = decryptSecret(merchant.clientSecretEnc);
    const orderId = randomUUID();
    const eventBody = JSON.stringify({
        eventId: randomUUID(),
        eventType: 'CREATED',
        orderId,
        // orderURL é fictício — o PDV vai tentar GET, vai falhar e logar.
        // Suficiente para validar o caminho HMAC + persistência.
        orderURL: `${merchant.menugoBaseURL}/api/v1/orders/${orderId}`,
        createdAt: new Date().toISOString(),
        sourceAppId: merchant.appId,
    });

    const signature = signBody(eventBody, secret);

    const target = `${env.APP_URL()}/api/v1/newEvent`;
    try {
        const res = await fetch(target, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-App-Id': merchant.appId,
                'X-App-MerchantId': merchant.merchantId,
                'X-App-Signature': signature,
            },
            body: eventBody,
        });
        return NextResponse.json({
            ok: res.status === 204,
            httpStatus: res.status,
            target,
            sentEventId: JSON.parse(eventBody).eventId,
        });
    } catch (err: any) {
        return NextResponse.json(
            { ok: false, error: err?.message || String(err), target },
            { status: 502 },
        );
    }
});
