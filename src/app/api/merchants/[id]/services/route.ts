import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { prisma } from '@/lib/db';
import { withAuth, badRequest, notFound } from '@/lib/api-utils';
import { notifyByMerchant } from '@/lib/catalog-notify';
import {
    SERVICE_TYPES,
    STATUS_VALUES,
    normalizeServiceHours,
    normalizeServiceArea,
    normalizeServiceTiming,
    type ServiceType,
    type StatusValue,
} from '@/lib/service-fields';

export const dynamic = 'force-dynamic';

interface RouteCtx { params: Promise<{ id: string }> }

function menuUuidFor(merchantId: number): string {
    // Espelha lib/merchant-export uuidFromSeed('menu:<id>') para o menuUuid do
    // Service apontar para o Menu sintético exportado.
    const hex = createHash('sha256').update(`menu:${merchantId}`).digest('hex').slice(0, 32);
    return [hex.slice(0, 8), hex.slice(8, 12), '5' + hex.slice(13, 16), '8' + hex.slice(17, 20), hex.slice(20, 32)].join('-');
}

/**
 * GET /api/merchants/{id}/services
 * Lista services do merchant.
 */
export const GET = withAuth(async (_req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const merchantId = parseInt(idStr, 10);
    if (!Number.isFinite(merchantId)) return badRequest('id inválido');
    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) return notFound('merchant não existe');

    const services = await prisma.merchantService.findMany({
        where: { merchantId },
        orderBy: { id: 'asc' },
    });
    const out = services.map(s => ({
        id: s.id,
        uuid: s.uuid,
        serviceType: s.serviceType,
        status: s.status,
        ativo: s.ativo,
        menuUuid: s.menuUuid,
        serviceHours: s.serviceHoursJson ? safeParse(s.serviceHoursJson) : null,
        serviceArea: s.serviceAreaJson ? safeParse(s.serviceAreaJson) : null,
        serviceTiming: s.serviceTimingJson ? safeParse(s.serviceTimingJson) : null,
        criadoEm: s.criadoEm,
        atualizadoEm: s.atualizadoEm,
    }));
    return NextResponse.json({ services: out });
});

/**
 * POST /api/merchants/{id}/services
 * Body: { serviceType, status?, serviceHours, serviceArea?, serviceTiming?, ativo? }
 */
export const POST = withAuth(async (req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const merchantId = parseInt(idStr, 10);
    if (!Number.isFinite(merchantId)) return badRequest('id inválido');
    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) return notFound('merchant não existe');

    let body: any;
    try { body = await req.json(); } catch { return badRequest('JSON inválido'); }

    if (!body.serviceType || !(SERVICE_TYPES as readonly string[]).includes(body.serviceType)) {
        return badRequest(`serviceType inválido. Use: ${SERVICE_TYPES.join(', ')}`);
    }
    const status: StatusValue = body.status && (STATUS_VALUES as readonly string[]).includes(body.status)
        ? body.status as StatusValue
        : 'AVAILABLE';

    const hours = normalizeServiceHours(body.serviceHours);
    if (!hours.ok) return badRequest(hours.error);
    const area = normalizeServiceArea(body.serviceArea);
    if (!area.ok) return badRequest(area.error);
    if (body.serviceType === 'DELIVERY' && !area.value) {
        return badRequest('serviceArea obrigatório quando serviceType=DELIVERY (spec OD 3646)');
    }
    const timing = normalizeServiceTiming(body.serviceTiming);
    if (!timing.ok) return badRequest(timing.error);

    try {
        const s = await prisma.merchantService.create({
            data: {
                merchantId,
                serviceType: body.serviceType as ServiceType,
                status,
                serviceHoursJson: JSON.stringify(hours.value),
                serviceAreaJson: area.value ? JSON.stringify(area.value) : null,
                serviceTimingJson: timing.value ? JSON.stringify(timing.value) : null,
                menuUuid: menuUuidFor(merchantId),
                ativo: body.ativo !== false,
            },
        });
        notifyByMerchant(merchantId);
        return NextResponse.json({ id: s.id, uuid: s.uuid, ok: true });
    } catch (err: any) {
        if (err?.code === 'P2002') {
            return NextResponse.json({ error: 'Conflict', message: `Já existe um service ${body.serviceType} para este merchant` }, { status: 409 });
        }
        throw err;
    }
});

function safeParse(s: string): unknown {
    try { return JSON.parse(s); } catch { return null; }
}
