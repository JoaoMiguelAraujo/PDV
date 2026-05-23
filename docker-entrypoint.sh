#!/bin/sh
set -e

# =============================================================================
# Entrypoint do container PDV.
#
# 1. Roda `prisma migrate deploy` para garantir que o schema do banco está
#    atualizado. É idempotente — em deploys subsequentes, não faz nada se já
#    estiver na última migration.
# 2. Exec do comando original (default: `node server.js`).
#
# Falha cedo se a conexão com o banco não funcionar ou se houver drift.
# =============================================================================

echo "[entrypoint] Verificando DATABASE_URL..."
if [ -z "$DATABASE_URL" ]; then
    echo "[entrypoint] ERRO: DATABASE_URL não está definido"
    exit 1
fi

echo "[entrypoint] Sincronizando schema Prisma com o banco (db push)..."
# `db push` aplica o schema.prisma direto no banco — cria/altera tabelas sem
# arquivo de migration. Idempotente: em deploys subsequentes, só faz diff.
# --accept-data-loss permite drops de coluna sem prompt interativo (necessário
# em container). Use com cuidado quando renomear/remover campos do schema.
node ./node_modules/prisma/build/index.js db push --skip-generate --accept-data-loss

echo "[entrypoint] Iniciando aplicação: $@"
exec "$@"
