import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { runSeed } from '@/lib/seed-data';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/seed?force=1
 *
 * Popula o banco com um Merchant fake completo (Pizzaria Belíssima) +
 * BasicInfo + 3 Services + Catálogo + Modificadores + Mesas + Insumos +
 * Fichas técnicas + Caixa de exemplo.
 *
 * Auth: header `X-Seed-Token` deve bater com `AUTH_SECRET` (comparação
 * constante). Não é o cookie de operador — é uma chave master para evitar
 * que o endpoint seja chamado sem querer em produção.
 *
 * Idempotente: se o merchant já existe, retorna { created: false } sem
 * mudar nada. Para recriar do zero, use ?force=1 (APAGA o merchant e tudo
 * em cascata — não use em produção sem backup).
 */
export async function POST(req: Request) {
    const provided = req.headers.get('x-seed-token') || '';
    const expected = env.AUTH_SECRET();
    if (!safeEqual(provided, expected)) {
        return NextResponse.json({ error: 'Unauthorized', message: 'X-Seed-Token inválido' }, { status: 401 });
    }

    const url = new URL(req.url);
    const force = url.searchParams.get('force') === '1';

    try {
        const result = await runSeed({ force });
        logger.info('seed/runSeed', { result });
        return NextResponse.json(result);
    } catch (err: any) {
        logger.error('seed/runSeed crash', { message: err?.message });
        return NextResponse.json({ error: 'Internal', message: err?.message || 'erro' }, { status: 500 });
    }
}

function safeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) {
        // Comparação fake do mesmo tamanho pra ter timing parecido — mesmo assim
        // negamos o resultado.
        try {
            timingSafeEqual(Buffer.from(a.padEnd(b.length, '\0')), Buffer.from(b));
        } catch {}
        return false;
    }
    try {
        return timingSafeEqual(Buffer.from(a), Buffer.from(b));
    } catch {
        return false;
    }
}
