import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { encryptSecret, SECRET_MASK } from '@/lib/crypto-secrets';
import { withAuth, badRequest } from '@/lib/api-utils';
import { applyBasicInfoFields } from '@/lib/merchant-fields';
import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

function publicMerchant(m: any) {
    return {
        id: m.id,
        name: m.name,
        merchantId: m.merchantId,
        appId: m.appId,
        clientSecretEnc: m.clientSecretEnc ? SECRET_MASK : '',
        menugoBaseURL: m.menugoBaseURL,
        menugoClientId: m.menugoClientId,
        menugoClientSecretEnc: m.menugoClientSecretEnc ? SECRET_MASK : '',
        adapterType: m.adapterType || 'opendelivery',
        ativo: m.ativo,
        observacao: m.observacao,
        criadoEm: m.criadoEm,
        atualizadoEm: m.atualizadoEm,
        // BasicInfo OD
        document: m.document,
        corporateName: m.corporateName,
        description: m.description,
        averageTicket: m.averageTicket,
        averagePreparationTime: m.averagePreparationTime,
        minOrderValue: m.minOrderValue,
        merchantCategories: m.merchantCategoriesJson ? JSON.parse(m.merchantCategoriesJson) : [],
        acceptedCards: m.acceptedCardsJson ? JSON.parse(m.acceptedCardsJson) : [],
        contactEmails: m.contactEmailsJson ? JSON.parse(m.contactEmailsJson) : [],
        address: {
            country: m.addressCountry,
            state: m.addressState,
            city: m.addressCity,
            district: m.addressDistrict,
            street: m.addressStreet,
            number: m.addressNumber,
            postalCode: m.addressPostalCode,
            complement: m.addressComplement,
            reference: m.addressReference,
            latitude: m.addressLatitude,
            longitude: m.addressLongitude,
        },
        contactPhones: {
            commercialNumber: m.contactCommercialNumber,
            whatsappNumber: m.contactWhatsappNumber,
        },
        logoImageUrl: m.logoImageUrl,
        bannerImageUrl: m.bannerImageUrl,
        odTtl: m.odTtl,
    };
}

export const GET = withAuth(async () => {
    const merchants = await prisma.merchant.findMany({ orderBy: { id: 'desc' } });
    return NextResponse.json({ merchants: merchants.map(publicMerchant) });
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

    const adapterType: 'opendelivery' | 'menugo' =
        body.adapterType === 'menugo' ? 'menugo' : 'opendelivery';
    const data: Prisma.MerchantCreateInput = {
        name: body.name,
        merchantId: body.merchantId,
        appId: body.appId,
        clientSecretEnc: encryptSecret(body.clientSecret),
        menugoBaseURL: String(body.menugoBaseURL).replace(/\/$/, ''),
        menugoClientId: body.menugoClientId,
        menugoClientSecretEnc: encryptSecret(body.menugoClientSecret),
        adapterType,
        ativo: body.ativo !== false,
        observacao: body.observacao || null,
    };
    const err = applyBasicInfoFields(body, data);
    if (err) return badRequest(err);

    try {
        const m = await prisma.merchant.create({ data });
        return NextResponse.json({ id: m.id, ok: true });
    } catch (err: any) {
        if (err?.code === 'P2002') {
            return NextResponse.json({ error: 'Conflict', message: 'merchantId já existe' }, { status: 409 });
        }
        throw err;
    }
});
