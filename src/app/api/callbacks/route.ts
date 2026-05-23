import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

/**
 * Lista de callbacks emitidos pelo PDV ao menuGo.
 * Query: ?orderId=<localId>&limit=
 */
export const GET = withAuth(async (req: Request) => {
    const url = new URL(req.url);
    const orderIdParam = url.searchParams.get('orderId');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10), 500);

    const where: any = {};
    if (orderIdParam) where.orderId = parseInt(orderIdParam, 10);

    const callbacks = await prisma.callback.findMany({
        where,
        orderBy: { id: 'desc' },
        take: limit,
        include: { order: { select: { orderId: true, displayId: true, merchantId: true } } },
    });
    return NextResponse.json({ callbacks });
});
