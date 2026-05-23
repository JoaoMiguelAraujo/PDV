import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Healthcheck para Coolify/load balancer — testa conexão MySQL. */
export async function GET() {
    try {
        await prisma.$queryRaw`SELECT 1`;
        return NextResponse.json({ status: 'ok' });
    } catch (err: any) {
        return NextResponse.json(
            { status: 'error', message: err?.message || String(err) },
            { status: 503 },
        );
    }
}
