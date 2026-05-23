import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { encryptSecret, SECRET_MASK } from '@/lib/crypto-secrets';
import { withAuth, badRequest } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async () => {
    const merchants = await prisma.merchant.findMany({ orderBy: { id: 'desc' } });
    // Mascara secrets na listagem.
    const safe = merchants.map(m => ({
        id: m.id,
        name: m.name,
        merchantId: m.merchantId,
        appId: m.appId,
        clientSecretEnc: m.clientSecretEnc ? SECRET_MASK : '',
        menugoBaseURL: m.menugoBaseURL,
        menugoClientId: m.menugoClientId,
        menugoClientSecretEnc: m.menugoClientSecretEnc ? SECRET_MASK : '',
        ativo: m.ativo,
        observacao: m.observacao,
        criadoEm: m.criadoEm,
        atualizadoEm: m.atualizadoEm,
    }));
    return NextResponse.json({ merchants: safe });
});

export const POST = withAuth(async (req: Request) => {
    let body: any;
    try { body = await req.json(); } catch { return badRequest('JSON inválido'); }

    const required = ['name', 'merchantId', 'appId', 'clientSecret', 'menugoBaseURL', 'menugoClientId', 'menugoClientSecret'];
    for (const f of required) {
        if (!body[f] || String(body[f]).trim() === '') return badRequest(`campo obrigatório: ${f}`);
    }
    if (String(body.merchantId).length < 36) {
        return badRequest('merchantId deve ter no mínimo 36 caracteres (formato CNPJ-UUID recomendado pela spec OD)');
    }

    try {
        const m = await prisma.merchant.create({
            data: {
                name: body.name,
                merchantId: body.merchantId,
                appId: body.appId,
                clientSecretEnc: encryptSecret(body.clientSecret),
                menugoBaseURL: String(body.menugoBaseURL).replace(/\/$/, ''),
                menugoClientId: body.menugoClientId,
                menugoClientSecretEnc: encryptSecret(body.menugoClientSecret),
                ativo: body.ativo !== false,
                observacao: body.observacao || null,
            },
        });
        return NextResponse.json({ id: m.id, ok: true });
    } catch (err: any) {
        if (err?.code === 'P2002') {
            return NextResponse.json({ error: 'Conflict', message: 'merchantId já existe' }, { status: 409 });
        }
        throw err;
    }
});
