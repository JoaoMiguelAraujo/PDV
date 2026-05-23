import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { preserveOrEncrypt } from '@/lib/crypto-secrets';
import { invalidateMerchantToken } from '@/lib/menugo-client';
import { withAuth, badRequest, notFound } from '@/lib/api-utils';
import { applyBasicInfoFields } from '@/lib/merchant-fields';

export const dynamic = 'force-dynamic';

interface RouteCtx {
    params: Promise<{ id: string }>;
}

export const PATCH = withAuth(async (req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) return badRequest('id inválido');

    let body: any;
    try { body = await req.json(); } catch { return badRequest('JSON inválido'); }

    const current = await prisma.merchant.findUnique({ where: { id } });
    if (!current) return notFound('merchant não existe');

    const data: any = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.merchantId !== undefined) {
        if (String(body.merchantId).length < 36) return badRequest('merchantId deve ter no mínimo 36 caracteres');
        data.merchantId = body.merchantId;
    }
    if (body.appId !== undefined) data.appId = body.appId;
    if (body.menugoBaseURL !== undefined) data.menugoBaseURL = String(body.menugoBaseURL).replace(/\/$/, '');
    if (body.menugoClientId !== undefined) data.menugoClientId = body.menugoClientId;
    if (body.ativo !== undefined) data.ativo = !!body.ativo;
    if (body.observacao !== undefined) data.observacao = body.observacao || null;

    // Secrets — só sobrescreve se o usuário trocou o valor (não veio mascarado).
    if (body.clientSecret !== undefined) {
        const next = preserveOrEncrypt(body.clientSecret, current.clientSecretEnc);
        if (next !== null) data.clientSecretEnc = next;
    }
    if (body.menugoClientSecret !== undefined) {
        const next = preserveOrEncrypt(body.menugoClientSecret, current.menugoClientSecretEnc);
        if (next !== null) data.menugoClientSecretEnc = next;
    }

    // Campos BasicInfo da spec OD.
    const basicErr = applyBasicInfoFields(body, data);
    if (basicErr) return badRequest(basicErr);

    try {
        await prisma.merchant.update({ where: { id }, data });
        invalidateMerchantToken(id);
        return NextResponse.json({ ok: true });
    } catch (err: any) {
        if (err?.code === 'P2002') {
            return NextResponse.json({ error: 'Conflict', message: 'merchantId já existe' }, { status: 409 });
        }
        throw err;
    }
});

export const DELETE = withAuth(async (_req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) return badRequest('id inválido');
    try {
        await prisma.merchant.delete({ where: { id } });
        invalidateMerchantToken(id);
        return NextResponse.json({ ok: true });
    } catch (err: any) {
        if (err?.code === 'P2025') return notFound('merchant não existe');
        // Restrição de FK (orders associadas) — usuário deve desativar em vez de deletar.
        return NextResponse.json(
            { error: 'Conflict', message: 'Não é possível remover: há pedidos vinculados. Desative o merchant.' },
            { status: 409 },
        );
    }
});
