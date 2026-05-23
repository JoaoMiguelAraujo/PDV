import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth } from '@/lib/api-utils';
import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (req: Request) => {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const merchantId = url.searchParams.get('merchantId');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);

    const where: Prisma.OrderWhereInput = {};
    if (status) where.status = status as any;
    if (merchantId) where.merchantId = parseInt(merchantId, 10);

    const orders = await prisma.order.findMany({
        where,
        orderBy: { recebidoEm: 'desc' },
        take: limit,
        include: {
            merchant: { select: { id: true, name: true, merchantId: true } },
            callbacks: { orderBy: { id: 'asc' } },
        },
    });
    return NextResponse.json({ orders });
});
