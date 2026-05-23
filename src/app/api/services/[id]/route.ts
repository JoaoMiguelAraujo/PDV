import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, badRequest, notFound } from '@/lib/api-utils';
import { notifyByMerchant } from '@/lib/catalog-notify';
import {
    STATUS_VALUES,
    normalizeServiceHours,
    normalizeServiceArea,
    normalizeServiceTiming,
    type StatusValue,
} from '@/lib/service-fields';

export const dynamic = 'force-dynamic';

interface RouteCtx { params: Promise<{ id: string }> }

export const PATCH = withAuth(async (req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) return badRequest('id inválido');
    const current = await prisma.merchantService.findUnique({ where: { id } });
    if (!current) return notFound('service não existe');

    let body: any;
    try { body = await req.json(); } catch { return badRequest('JSON inválido'); }

    const data: any = {};
    if (body.status !== undefined) {
        if (!(STATUS_VALUES as readonly string[]).includes(body.status)) return badRequest('status inválido');
        data.status = body.status as StatusValue;
    }
    if (body.ativo !== undefined) data.ativo = !!body.ativo;
    if (body.serviceHours !== undefined) {
        const h = normalizeServiceHours(body.serviceHours);
        if (!h.ok) return badRequest(h.error);
        data.serviceHoursJson = JSON.stringify(h.value);
    }
    if (body.serviceArea !== undefined) {
        const a = normalizeServiceArea(body.serviceArea);
        if (!a.ok) return badRequest(a.error);
        data.serviceAreaJson = a.value ? JSON.stringify(a.value) : null;
    }
    if (body.serviceTiming !== undefined) {
        const t = normalizeServiceTiming(body.serviceTiming);
        if (!t.ok) return badRequest(t.error);
        data.serviceTimingJson = t.value ? JSON.stringify(t.value) : null;
    }
    // Validação coerência: se ficar DELIVERY sem area, rejeita.
    const serviceType = current.serviceType;
    const willHaveArea = data.serviceAreaJson !== undefined ? data.serviceAreaJson !== null : !!current.serviceAreaJson;
    if (serviceType === 'DELIVERY' && !willHaveArea) {
        return badRequest('serviceArea obrigatório quando serviceType=DELIVERY');
    }

    await prisma.merchantService.update({ where: { id }, data });
    notifyByMerchant(current.merchantId);
    return NextResponse.json({ ok: true });
});

export const DELETE = withAuth(async (_req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) return badRequest('id inválido');
    const current = await prisma.merchantService.findUnique({ where: { id } });
    if (!current) return notFound('service não existe');
    await prisma.merchantService.delete({ where: { id } });
    notifyByMerchant(current.merchantId);
    return NextResponse.json({ ok: true });
});
