/**
 * Next.js Instrumentation Hook — roda uma vez no boot do servidor.
 *
 * Disparado pelo Next ANTES do primeiro request ser processado, no runtime
 * Node.js (não em edge). Usamos pra:
 *
 *   1. Rodar o seed de demonstração se o banco estiver vazio (controlado
 *      por env AUTO_SEED — default `true` em dev/staging, `false` em prod).
 *
 *   2. Garantir que as tabelas já existam (idempotente — o entrypoint já
 *      faz `prisma db push`, mas se alguém rodar `next start` direto, isso
 *      assegura o seed só rode quando faz sentido).
 *
 * Erros aqui são logados mas NUNCA derrubam o servidor — o app sobe e
 * atende mesmo se o seed falhar (ex.: schema desatualizado em pre-deploy).
 */
export async function register() {
    // Só roda no runtime Node — pula edge/middleware bundling.
    if (process.env.NEXT_RUNTIME !== 'nodejs') return;

    // Toggle por env. Default = roda automático (idempotente, então é seguro).
    //   AUTO_SEED=false  → desliga
    //   AUTO_SEED=true   → liga (default)
    //   AUTO_SEED=force  → re-cria mesmo que merchant já exista (DESTRUTIVO)
    const flag = (process.env.AUTO_SEED || 'true').toLowerCase();
    if (flag === 'false' || flag === '0' || flag === 'off') {
        console.log('[instrumentation] AUTO_SEED desabilitado — pulando seed.');
        return;
    }
    const force = flag === 'force';

    try {
        const { runSeed } = await import('@/lib/seed-data');
        const result = await runSeed({ force });
        if (result.created) {
            console.log('[instrumentation] Seed inicial criado:', result.counts);
        } else {
            console.log('[instrumentation] Seed pulado:', result.skippedReason);
        }
    } catch (err: any) {
        console.error('[instrumentation] Seed falhou (servidor continua subindo):', err?.message || err);
    }
}
