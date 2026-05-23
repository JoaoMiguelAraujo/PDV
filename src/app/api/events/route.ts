import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

/**
 * Lista OdEvent (audit trail dos webhooks recebidos).
 * Query: ?merchantId=&signatureValid=0|1&limit=
 */
export const GET = withAuth(async (req: Request) => {
    const url = new URL(req.url);
    const merchantId = url.searchParams.get('merchantId');
    const sigValid = url.searchParams.get('signatureValid');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);

    const where: any = {};
    if (merchantId) where.merchantId = parseInt(merchantId, 10);
    if (sigValid === '1') where.signatureValid = true;
    if (sigValid === '0') where.signatureValid = false;

    const events = await prisma.odEvent.findMany({
        where,
        orderBy: { id: 'desc' },
        take: limit,
        include: { merchant: { select: { id: true, name: true, merchantId: true } } },
    });
    return NextResponse.json({ events });
});
