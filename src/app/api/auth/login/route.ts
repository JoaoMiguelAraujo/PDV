import { NextResponse } from 'next/server';
import { verifyPassword, createSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    let body: { password?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'BadRequest' }, { status: 400 });
    }
    if (!body.password) {
        return NextResponse.json({ error: 'BadRequest', message: 'senha obrigatória' }, { status: 400 });
    }
    const ok = await verifyPassword(body.password);
    if (!ok) {
        // Pequeno delay para frear brute-force.
        await new Promise(r => setTimeout(r, 500));
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await createSession();
    return NextResponse.json({ ok: true });
}
