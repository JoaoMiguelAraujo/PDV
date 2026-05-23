# syntax=docker/dockerfile:1.7

# =============================================================================
# Stage 1 — deps: instala dependências (bcrypt nativo precisa de build-tools)
# =============================================================================
FROM node:24-alpine AS deps
RUN apk add --no-cache libc6-compat python3 make g++ openssl
WORKDIR /app

COPY package.json package-lock.json* ./
# Sem lockfile no boot inicial — `npm install` resolve. Quando houver lockfile
# committado, use `npm ci` para builds reprodutíveis.
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Prisma generate precisa do schema antes do build do Next.
COPY prisma ./prisma
RUN npx prisma generate

# =============================================================================
# Stage 2 — builder: compila Next.js em modo standalone
# =============================================================================
FROM node:24-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=2048

# `prisma generate` é idempotente — rerun aqui garante client compatível.
RUN npx prisma generate && npm run build

# =============================================================================
# Stage 3 — runner: imagem final mínima
# =============================================================================
FROM node:24-alpine AS runner
RUN apk add --no-cache libc6-compat tini openssl
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=4003
ENV HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs \
 && adduser -S -u 1001 -G nodejs nextjs

# Standalone output do Next inclui server.js + node_modules minimizado.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma — engine + schema precisam estar disponíveis em runtime para `migrate deploy`.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER nextjs

EXPOSE 4003

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.js"]
