# PDV — Software Service Open Delivery v1.7

PDV (Software Service) compatível com a spec Open Delivery v1.7 (Abrasel).
Recebe pedidos do Ordering Application (menuGo) via webhook HMAC, exibe
no KDS para o operador gerenciar e devolve callbacks OAuth2 ao OA.

## Stack

- Next.js 16 (App Router, standalone)
- React 19, Tailwind v4
- Prisma + MySQL 8
- bcrypt (login do operador)

## Estrutura

```
src/
├── app/
│   ├── api/v1/newEvent/route.ts         # webhook OD oficial (HMAC)
│   ├── api/auth/{login,logout}/route.ts
│   ├── api/merchants/                   # CRUD merchants (admin)
│   ├── api/settings/route.ts            # auto-mode, delays, pay_on_confirm
│   ├── api/orders/                      # listagem + ações no KDS
│   ├── api/events/route.ts              # audit OdEvent
│   ├── api/callbacks/route.ts           # audit Callback
│   ├── api/test-event/route.ts          # dispara Event sintético
│   ├── api/health/route.ts              # healthcheck
│   ├── login/                           # tela de login
│   ├── kds/                             # tela principal
│   ├── merchants/
│   ├── settings/
│   └── logs/
├── components/Navbar.tsx
├── lib/
│   ├── env.ts                           # validação central de envs
│   ├── db.ts                            # Prisma singleton
│   ├── logger.ts
│   ├── auth.ts                          # bcrypt + cookie HMAC
│   ├── auth-shared.ts                   # cookie helpers (Edge-safe)
│   ├── signature.ts                     # HMAC-SHA256 sign/verify
│   ├── crypto-secrets.ts                # AES-256-GCM (segredos em repouso)
│   ├── od-types.ts                      # tipos fiéis à spec OD v1.7
│   ├── settings.ts                      # cache de Settings
│   ├── menugo-client.ts                 # cliente OAuth2 + callbacks ao OA
│   ├── orders.ts                        # lógica de domínio (confirm/preparing/…)
│   └── auto-runner.ts                   # timeline automática opcional
├── middleware.ts
prisma/schema.prisma
Dockerfile
docker-entrypoint.sh
```

## Mapeamento OD → endpoints

### Recebido pelo PDV
| Spec OD | Implementação |
|---|---|
| `POST /v1/newEvent` | `src/app/api/v1/newEvent/route.ts` — valida HMAC, persiste, ingere Order, agenda timeline automática se ligada. |

### Disparado pelo PDV ao menuGo
| Spec OD | Função |
|---|---|
| `POST /oauth/token` | `menugo-client.ts → getToken()` (client_credentials, cache em memória) |
| `POST /v1/orders/{id}/confirm` | `callConfirm()` |
| `POST /v1/orders/{id}/preparing` | `callPreparing()` |
| `POST /v1/orders/{id}/delivered` | `callDelivered()` |
| `POST /v1/orders/{id}/requestCancellation` | `callRequestCancellation()` |
| `POST /v1/orders/{id}/acceptCancellation` | `callAcceptCancellation()` |
| `POST /v1/orders/{id}/denyCancellation` | `callDenyCancellation()` |
| `GET  /v1/orders/{id}` (via orderURL) | `fetchOrderFromURL()` |

## Dev local

1. Suba um MySQL local (`docker run -p 3306:3306 -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=pdv mysql:8`).
2. Copie `.env.example` para `.env` e ajuste.
3. Instale e migre:
   ```bash
   npm install
   npx prisma migrate dev --name init
   npm run dev
   ```
4. Abra `http://localhost:4003`, faça login com `ADMIN_PASSWORD`.
5. Cadastre um merchant em **Merchants** (use os mesmos `appId` + `merchantId` + `clientSecret` cadastrados na Central do menuGo).
6. Use **Event de teste** no KDS para validar a cadeia HMAC.

## Deploy Coolify

1. Crie um serviço **MySQL 8** no Coolify (nome do banco: `pdv`).
2. Crie uma aplicação **Dockerfile**, apontando para este repo.
3. Configure envs obrigatórias:
   - `DATABASE_URL` (vem do MySQL do passo 1)
   - `AUTH_SECRET` (≥32 chars, gere com `openssl rand -hex 32`)
   - `ADMIN_PASSWORD` (sua senha de operador)
   - `APP_URL` (`https://pdv.seudominio.com`)
4. Porta: `4003`.
5. Healthcheck: `GET /api/health` (status 200 quando o banco responde).
6. Deploy. O entrypoint roda `prisma migrate deploy` automaticamente.

## Configuração no menuGo

Em cada **Central → Unidades → Integração PDV**:
- Adapter: `Open Delivery v1.7 (HMAC)`
- baseURL do PDV: `https://pdv.seudominio.com` (sem `/api/v1/newEvent` — o adapter monta)
- AppId, merchantId, clientSecret: idênticos ao cadastrado no PDV.

## Modelo de segurança

| Endpoint | Auth |
|---|---|
| `POST /api/v1/newEvent` | HMAC-SHA256 (header `X-App-Signature`) |
| `POST /api/auth/login` | público (rate-limited por delay artificial) |
| `GET /api/health` | público |
| Todas as outras `/api/*` | cookie de sessão (HMAC do AUTH_SECRET) |
| Páginas (`/kds`, `/merchants`, …) | mesmo cookie — middleware redireciona pra `/login` |

`clientSecret` (HMAC) e `menugoClientSecret` (OAuth2) são cifrados em repouso
com AES-256-GCM. Chave derivada de `AUTH_SECRET` via HKDF-SHA256 — rotacionar
`AUTH_SECRET` invalida todos os secrets cifrados.
