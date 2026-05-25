#!/bin/sh
set -e

# =============================================================================
# Entrypoint do container PDV.
#
# 1. Verifica DATABASE_URL.
# 2. Aguarda o banco aceitar conexões (até 60s) — evita race em deploys
#    onde o MySQL ainda está subindo em paralelo.
# 3. Roda `prisma db push --accept-data-loss` que cria/atualiza as tabelas
#    a partir do schema.prisma. Idempotente — só faz diff em deploys
#    subsequentes.
# 4. (Opcional) Se AUTO_SEED=1 e o banco estiver vazio, dispara o seed
#    de demonstração na primeira inicialização.
# 5. Exec do comando original (default: `node server.js`).
# =============================================================================

echo "[entrypoint] Verificando DATABASE_URL..."
if [ -z "$DATABASE_URL" ]; then
    echo "[entrypoint] ERRO: DATABASE_URL não está definido"
    exit 1
fi

# -----------------------------------------------------------------------------
# Wait for DB — tenta `prisma db execute` num SELECT 1 até o banco responder.
# Usa o próprio cliente Prisma pra evitar instalar mysql-client/postgresql-client
# na imagem final. Máximo de 30 tentativas × 2s = 60s.
# -----------------------------------------------------------------------------
echo "[entrypoint] Aguardando banco ficar disponível..."
i=0
until node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.\$queryRaw\`SELECT 1\`.then(()=>{p.\$disconnect();process.exit(0)}).catch(()=>process.exit(1))" 2>/dev/null; do
    i=$((i + 1))
    if [ "$i" -ge 30 ]; then
        echo "[entrypoint] ERRO: banco não respondeu em 60s. Verifique DATABASE_URL e se o serviço de banco está pronto."
        exit 1
    fi
    echo "[entrypoint]   tentativa $i/30 — banco ainda não respondeu, aguardando 2s..."
    sleep 2
done
echo "[entrypoint] Banco conectado."

# -----------------------------------------------------------------------------
# Sincroniza schema → cria todas as tabelas se for boot inicial; aplica
# alterações em deploys subsequentes. Sem necessidade de migrations files.
# -----------------------------------------------------------------------------
echo "[entrypoint] Sincronizando schema Prisma com o banco (db push)..."
node ./node_modules/prisma/build/index.js db push --skip-generate --accept-data-loss

echo "[entrypoint] Schema sincronizado. Tabelas criadas/atualizadas conforme schema.prisma."
echo "[entrypoint] Iniciando aplicação: $@"
exec "$@"
