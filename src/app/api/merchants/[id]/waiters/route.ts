import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, badRequest, notFound } from '@/lib/api-utils';
import { fetchWaiters } from '@/lib/menugo-client';

export const dynamic = 'force-dynamic';

interface RouteCtx { params: Promise<{ id: string }> }

/**
 * GET /api/merchants/{id}/waiters — proxy pra GET {menugo}/v1/merchants/{id}/waiters.
 * Só funciona em merchants do tipo `menugo`.
 */
export const GET = withAuth(async (_req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) return badRequest('id inválido');

    const merchant = await prisma.merchant.findUnique({ where: { id } });
    if (!merchant) return notFound('merchant não existe');
    if (merchant.adapterType !== 'menugo') {
        return badRequest('Extensão waiters só disponível em merchants do tipo `menugo`');
    }

    const result = await fetchWaiters(merchant);
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
});
