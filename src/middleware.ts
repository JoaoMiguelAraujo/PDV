import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AUTH_COOKIE, isCookieValid } from '@/lib/auth-shared';

/**
 * Bloqueia tudo exceto:
 *  - /login (página)
 *  - /api/auth/* (login/logout)
 *  - /api/v1/newEvent (endpoint público OD — protegido por HMAC)
 *  - /api/health (healthcheck Coolify)
 *  - Assets internos do Next (/_next/*, /favicon.ico)
 *
 * NÃO usa bcrypt aqui — middleware roda em Edge runtime.
 * Validação é feita com HMAC do cookie (puro crypto-only).
 */
export async function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;

    // Allow-list explícito.
    if (
        pathname.startsWith('/api/v1/newEvent') ||
        pathname.startsWith('/api/health') ||
        pathname.startsWith('/api/auth/') ||
        pathname === '/login' ||
        pathname.startsWith('/_next/') ||
        pathname === '/favicon.ico'
    ) {
        return NextResponse.next();
    }

    const cookie = req.cookies.get(AUTH_COOKIE)?.value;
    const secret = process.env.AUTH_SECRET || '';
    if (!secret) {
        // Sem secret configurado, todo acesso protegido falha — exceto o allow-list acima.
        return new NextResponse('AUTH_SECRET não configurado', { status: 503 });
    }

    if (await isCookieValid(cookie, secret)) {
        return NextResponse.next();
    }

    if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
}

export const config = {
    matcher: [
        // Tudo exceto _next/static, _next/image e arquivos com extensão (imagens, fontes).
        '/((?!_next/static|_next/image|.*\\..*).*)',
    ],
};
