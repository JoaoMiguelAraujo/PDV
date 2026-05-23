import 'server-only';
import { NextResponse } from 'next/server';
import { requireAuth } from './auth';

/**
 * Wrapper que aplica requireAuth() e trata erros padronizados.
 * Uso: `export const GET = withAuth(async () => {...})`
 */
export function withAuth<T extends (...args: any[]) => Promise<Response>>(handler: T): T {
    return (async (...args: Parameters<T>) => {
        try {
            await requireAuth();
        } catch (err: any) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        try {
            return await handler(...args);
        } catch (err: any) {
            return NextResponse.json(
                { error: 'Internal', message: err?.message || String(err) },
                { status: 500 },
            );
        }
    }) as T;
}

export function badRequest(message: string) {
    return NextResponse.json({ error: 'BadRequest', message }, { status: 400 });
}

export function notFound(message: string = 'NotFound') {
    return NextResponse.json({ error: 'NotFound', message }, { status: 404 });
}
