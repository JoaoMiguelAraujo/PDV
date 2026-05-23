# Integração PDV — Open Delivery v1.7.0

## Status
Adapter Open Delivery oficial implementado. Papel do menuGo: **Ordering Application** (cliente). Para homologação/teste end-to-end usamos um **PDV externo** independente (Software Service real), deployado separado em Coolify. O antigo mock embutido (`/od-mock`) foi removido.

---

## 1. Papel do menuGo na spec

`menuGo` = **Ordering Application** (coleta pedidos do cliente final e os envia ao PDV).
`PDV` = **Software Service** (recebe, confirma, prepara).

Fluxo de eventos:

```
Garçom confirma pedido
    → criarEnvio() [comanda.service.ts]
    → integrarEnvio(envioId) [pdv.service.ts] (fire-and-forget)
    → buildAdapterConfig + OpenDeliveryAdapter.enviarPedido()
    → POST {baseURL}/v1/newEvent  (HMAC-SHA256)
    → registrarLog() → pdv_integracao_logs

PDV recebe Event envelope → fetch(orderURL)
    → GET /api/v1/orders/{orderId} (no menuGo)
    → menuGo reconstrói a Order a partir de live_envios

PDV processa o pedido e devolve callbacks ao menuGo (OAuth2 Bearer):
    → POST /v1/oauth/token (client_credentials)  → access_token
    → POST /v1/orders/{orderId}/confirm           → live_envios.status='confirmado'
                                                    + live_pagamentos (se PREPAID)
    → POST /v1/orders/{orderId}/preparing         → live_envios.status='preparando'
    → POST /v1/orders/{orderId}/delivered         → live_envios.status='entregue'
    (alternativa: /requestCancellation → status='cancelado')
```

---

## 2. Adapters disponíveis

| Código | Descrição |
|---|---|
| `opendelivery` | **Open Delivery v1.7.0 oficial.** Envia `POST /v1/newEvent` com headers `X-App-Id`, `X-App-MerchantId`, `X-App-Signature` (HMAC-SHA256). |
| `mock` | No-op, para testes locais sem rede. |

> O antigo adapter `webhook` (POST genérico com `X-MenuGo-Secret`) foi removido — não cumpria a spec OD e era redundante com o `opendelivery` apontado para qualquer URL.

---

## 3. Autenticação Open Delivery (POST /v1/newEvent)

`POST /v1/newEvent` **não usa OAuth Bearer**. A spec (linha 2595 do `docs/openapi.yaml`) define autenticação por 3 headers:

| Header | Conteúdo |
|---|---|
| `X-App-Id` | UUID v4 do menuGo (Ordering Application) — fixo para todos os PDVs |
| `X-App-MerchantId` | merchantId no PDV (formato CNPJ-UUID, ≥36 chars) |
| `X-App-Signature` | HMAC-SHA256 do body, usando `clientSecret` como chave (hex lowercase) |

Body: schema `Event` (envelope leve com `orderURL` apontando para o GET do menuGo).

---

## 4. Estrutura de arquivos

```
src/lib/integrations/
├── opendelivery/
│   ├── types.ts          — Event, Order, ODConfig, ODPaymentMethod
│   ├── mapper.ts         — envio interno → Order OD (UUIDs determinísticos)
│   ├── signature.ts      — HMAC-SHA256 sign/verify
│   ├── oauth.ts          — emissão/validação de access_token + requireODBearer
│   └── status.service.ts — máquina de status do envio + applyPDVPayments
└── pdv/
    ├── pdv.interface.ts
    ├── pdv.factory.ts    — getPDVAdapter + buildAdapterConfig
    └── adapters/
        ├── opendelivery.adapter.ts   — POST /v1/newEvent
        └── mock.adapter.ts

src/app/api/
└── v1/
    ├── oauth/token/route.ts                       — POST /v1/oauth/token (OA)
    └── orders/[orderId]/
        ├── route.ts                               — GET Order completa
        ├── confirm/route.ts                       — POST (OrderConfirmed)
        ├── preparing/route.ts                     — POST
        ├── delivered/route.ts                     — POST
        ├── requestCancellation/route.ts           — POST (RequestCancelled)
        ├── acceptCancellation/route.ts            — POST
        └── denyCancellation/route.ts              — POST (RequestDenied)
```

---

## 5. Variáveis de ambiente

### Produção (mínimo)

```dotenv
# Já existentes — manter
AUTH_SECRET=<≥32 chars, NUNCA mudar>      # chave de cifragem dos secrets em repouso

# Única nova obrigatória para Open Delivery
OPENDELIVERY_APP_ID=<UUID v4 fixo>        # gere uma vez, mantenha para sempre
```

**Apenas 1 variável nova** em produção. Toda configuração OD vai no **Hub → Empresas (ou Unidades) → Editar → Integração PDV**, salva cifrada no banco — incluindo:

- `baseURL` do PDV (destino do POST)
- `merchantId` no PDV
- `clientSecret` (HMAC)
- **`URL pública do menuGo`** (apresentada ao PDV no `orderURL`) — útil em white-label onde cada empresa tem domínio próprio

Resolução em cascata da URL pública (primeiro vence):
1. `config.publicBaseURL` configurado no Hub
2. `OPENDELIVERY_PUBLIC_BASE_URL` (env override)
3. `APP_URL` (fallback)

### Opcionais (raras)

| Variável | Quando usar |
|---|---|
| `OPENDELIVERY_PUBLIC_BASE_URL` | Override do `APP_URL` para o `orderURL` no Event. Útil só se o menuGo for exposto ao PDV num host diferente do `APP_URL` (proxy/CDN). Senão deixe vazio — cascata cai automaticamente em `APP_URL`. |
| `OPENDELIVERY_DEFAULT_*` | Fallbacks globais (`BASE_URL`, `MERCHANT_ID`, `CLIENT_SECRET`). Em produção, prefira configurar por unidade no Hub e deixe vazios. |
| `OD_OAUTH_TOKEN_TTL_SECONDS` | TTL do `access_token` emitido por `POST /v1/oauth/token` (default `3600`). |

---

## 6. Tabelas de log e auth

### 6.1. `od_access_tokens` — tokens OAuth2 emitidos pelo menuGo

Cada linha = um `access_token` opaco entregue ao PDV via `POST /v1/oauth/token`. Validação é por SHA-256 do token contra `token_hash` (não JWT). Resolução do contexto (`empresa_id`, `unidade_id`) é direta da linha.

```sql
CREATE TABLE od_access_tokens (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    token_hash CHAR(64) NOT NULL,           -- SHA-256(token_plain) em hex
    empresa_id INT NOT NULL,
    unidade_id INT NULL,
    empresa_pdv_id INT NOT NULL,
    client_id VARCHAR(64) NOT NULL,         -- = config.appId
    scope VARCHAR(64) NOT NULL DEFAULT 'od.all',
    expires_at DATETIME NOT NULL,
    revoked TINYINT(1) NOT NULL DEFAULT 0,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_token_hash (token_hash),
    KEY idx_empresa_unidade (empresa_id, unidade_id),
    KEY idx_expires (expires_at)
);
```

### 6.2. Colunas adicionadas em `live_envios`

```sql
ALTER TABLE live_envios
    ADD COLUMN pdv_reference VARCHAR(100) NULL,
    ADD COLUMN confirmado_em DATETIME NULL,
    ADD COLUMN entregue_em DATETIME NULL,
    ADD COLUMN cancelado_em DATETIME NULL,
    ADD COLUMN cancelamento_motivo TEXT NULL;
```

`pdv_reference` recebe `orderExternalCode` devolvido pelo PDV no `/confirm`. Os timestamps marcam transições do ciclo de vida.

### 6.3. Drop das tabelas legacy do mock

As tabelas `od_mock_events` e `od_mock_callbacks` foram usadas pelo mock embutido (`/od-mock`), removido nesta versão. Para limpar do banco:

```bash
mysql -u admin -p<senha> livego < docs/sql/drop-od-mock.sql
```

Os endpoints do menuGo que o PDV externo continua chamando (`/v1/oauth/token`, `/v1/orders/{id}/*`) **não dependem dessas tabelas**.

---

## 6.5. Códigos externos (empresa / unidade / produto)

Para integração com PDV real, três tabelas têm coluna `codigo_externo` (`VARCHAR(100) NULL`):

| Tabela | Onde aparece no payload OD | Configurado em |
|---|---|---|
| `live_empresas.codigo_externo` | `Order.virtualBrand` (alternative id p/ dark kitchens/chains) | Hub → Empresas → Editar → campo "Código externo" |
| `live_unidades.codigo_externo` | `Order.merchant.id` (substitui `empresa_pdv.config.merchantId` quando preenchido) | Hub → Unidades → Editar → campo "Código externo" |
| `live_produtos.codigo_externo` | `Order.items[].externalCode` (SKU no PDV) | Central → Produtos → Editar → campo "Código externo (SKU PDV)" |

**Prioridade do `merchant.id`:**
1. `unidade.codigo_externo` (se preenchido)
2. `empresa_pdv.config.merchantId` (configuração PDV da unidade)
3. fallback gerado

**Prioridade do `items[].externalCode`:**
1. `produto.codigo_externo` (se preenchido)
2. `produto.id` como string

---

## 7. Configuração na Central

**Central → Unidades → Editar unidade → Integração PDV**

Adapter `Open Delivery v1.7 (HMAC)` → campos:

| Campo | Conteúdo |
|---|---|
| **baseURL do PDV** | URL pública do PDV homologado (ex.: `https://pdv.seudominio.com`) |
| **AppId (UUID)** | UUID v4 do menuGo |
| **merchantId no PDV** | fornecido pelo PDV |
| **clientSecret (HMAC)** | secret para assinar o body |

O PDV externo (Software Service) cadastra **o mesmo trio** (`appId`, `merchantId`, `clientSecret`) na sua tela de Merchants. Os dois lados precisam bater para o HMAC validar.

---

## 8. Endpoints OD que o menuGo (Ordering Application) hospeda

Todos exigem `Authorization: Bearer <access_token>` obtido em `POST /v1/oauth/token`.

| Método | Rota | Body | Efeito no envio |
|---|---|---|---|
| `POST` | `/api/v1/oauth/token` | `grant_type=client_credentials&client_id=&client_secret=` | Emite `access_token` (Bearer, TTL `OD_OAUTH_TOKEN_TTL_SECONDS`) |
| `GET`  | `/api/v1/orders/{orderId}` | — | Devolve a Order completa (consultada pelo PDV após receber CREATED) |
| `POST` | `/api/v1/orders/{orderId}/confirm` | `OrderConfirmed` | `live_envios.status = 'confirmado'` + `pdv_reference` + `confirmado_em`; se `X-Mock-Payments: PREPAID` ou body.payments[], cria `live_pagamentos` + `pago=1` |
| `POST` | `/api/v1/orders/{orderId}/preparing` | — | `status = 'preparando'` |
| `POST` | `/api/v1/orders/{orderId}/delivered` | — | `status = 'entregue'` + `entregue_em` |
| `POST` | `/api/v1/orders/{orderId}/requestCancellation` | `RequestCancelled` (reason, code, mode) | `status = 'cancelado'` + `cancelado_em` + `cancelamento_motivo` |
| `POST` | `/api/v1/orders/{orderId}/acceptCancellation` | — | `status = 'cancelado'` (PDV aceita pedido de cancelamento da OA) |
| `POST` | `/api/v1/orders/{orderId}/denyCancellation` | `RequestDenied` (reason, code) | Grava motivo em `cancelamento_motivo`, mantém status |

---

## 9. Playbook de homologação com o PDV externo

1. Deploy o PDV (projeto `/home/joao/Documentos/Projetos/Pessoais/PDV`) no Coolify — porta `4003`, com MySQL próprio e variáveis `DATABASE_URL`, `AUTH_SECRET`, `ADMIN_PASSWORD`, `APP_URL`.
2. No menuGo, gere uma vez `OPENDELIVERY_APP_ID` (UUID v4) e o `clientSecret` que será usado para o HMAC. Anote.
3. No PDV: login → **Merchants → Cadastrar** com `appId`, `merchantId`, `clientSecret`, `menugoBaseURL`, `menugoClientId` (= appId), `menugoClientSecret` (= clientSecret).
4. No menuGo: **Hub → Unidade → Integração PDV** → adapter `Open Delivery v1.7`, `baseURL = https://pdv.seudominio.com`, mesmo `appId`/`merchantId`/`clientSecret`.
5. Pelo app do garçom, confirme um pedido.
6. No PDV: o card aparece no KDS — clique **Confirmar → Em preparo → Entregue** (ou ligue **Modo automático** em Settings).
7. No menuGo: `SELECT id, status, pdv_reference, confirmado_em, entregue_em FROM live_envios ORDER BY id DESC LIMIT 1\G` deve mostrar `status='entregue'`.

---

## 9.1. Exemplo de payload Event enviado

`POST {baseURL}/v1/newEvent`

```http
Content-Type: application/json
X-App-Id: 0d549e3d-e562-4ec0-b421-e7b19fb933ff
X-App-MerchantId: 11111111111111-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
X-App-Signature: 3f5b9c2d…(SHA256 hex 64 chars)…

{
  "eventId": "c3a4b5d6-e7f8-1234-5678-90abcdef0001",
  "eventType": "CREATED",
  "orderId": "e0e0e0e0-0000-4000-8000-00000000002a",
  "orderURL": "https://app.menugo.com/api/v1/orders/e0e0e0e0-0000-4000-8000-00000000002a",
  "createdAt": "2026-05-17T12:00:00.000Z",
  "sourceAppId": "0d549e3d-e562-4ec0-b421-e7b19fb933ff"
}
```

## 9.2. Exemplo de Order retornada pelo GET

```json
{
  "id": "e0e0e0e0-0000-4000-8000-00000000002a",
  "type": "INDOOR",
  "displayId": "101",
  "sourceAppId": "0d549e3d-e562-4ec0-b421-e7b19fb933ff",
  "createdAt": "2026-05-17T12:00:00.000Z",
  "orderTiming": "INSTANT",
  "preparationStartDateTime": "2026-05-17T12:00:00.000Z",
  "merchant": {
    "id": "11111111111111-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "name": "Loja Teste"
  },
  "items": [
    {
      "id": "a1a1a1a1-0000-4000-8000-000000000001",
      "externalCode": "1",
      "name": "X-Burger",
      "unit": "UN",
      "quantity": 2,
      "index": 0,
      "unitPrice": { "value": 25.50, "currency": "BRL" },
      "totalPrice": { "value": 51.00, "currency": "BRL" },
      "specialInstructions": "sem cebola"
    },
    {
      "id": "a1a1a1a1-0000-4000-8000-000000000002",
      "externalCode": "2",
      "name": "Refri",
      "unit": "UN",
      "quantity": 1,
      "index": 1,
      "unitPrice": { "value": 8.00, "currency": "BRL" },
      "totalPrice": { "value": 8.00, "currency": "BRL" }
    }
  ],
  "total": {
    "itemsPrice": { "value": 59.00, "currency": "BRL" },
    "otherFees":  { "value": 0,     "currency": "BRL" },
    "discount":   { "value": 0,     "currency": "BRL" },
    "orderAmount":{ "value": 59.00, "currency": "BRL" }
  },
  "payments": {
    "prepaid": 0,
    "pending": 59.00,
    "methods": [
      { "value": 59.00, "currency": "BRL", "type": "PENDING", "method": "OTHER" }
    ]
  },
  "indoor": { "mode": "TABLE", "table": "5" },
  "extraInfo": "João"
}
```

---

## 10. Como gerar a assinatura HMAC manualmente

```bash
# Bash + OpenSSL
SECRET="meu-secret"
BODY='{"eventId":"…","eventType":"CREATED", … }'
printf "%s" "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $2}'
```

```javascript
// Node
const { createHmac } = require('crypto');
createHmac('sha256', secret).update(body).digest('hex');
```

```python
# Python
import hmac, hashlib
hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()
```

**Importante:** o body precisa ser **exatamente** os mesmos bytes que vão no `Content-Length`. Não pretty-print, não modifique espaços. JSON com `\n` ou sem, **mas igual em ambos lados**.

---

## 11. UUIDs determinísticos

| Entidade | UUID gerado | Reverso |
|---|---|---|
| `envio.id = 42` | `e0e0e0e0-0000-4000-8000-00000000002a` | `orderUuidToEnvioId()` |
| `pedido.id = 7` | `a1a1a1a1-0000-4000-8000-000000000007` | — (não reversado, só usado p/ exibição) |

Função em [src/lib/integrations/opendelivery/mapper.ts](../src/lib/integrations/opendelivery/mapper.ts).

---

## 12. Troubleshooting

### `403 — Assinatura HMAC inválida`
- Confirme que o `clientSecret` no Hub do menuGo é **idêntico** ao cadastrado no PDV.
- Cheque o log `pdv_integracao_logs.response` para ver o que o PDV retornou.
- Cheque se o body foi alterado em trânsito (proxy reescrevendo JSON, BOM UTF-8, etc.).

### `400 — Headers obrigatórios ausentes`
- Algum dos 3 headers `X-App-Id`, `X-App-MerchantId`, `X-App-Signature` está faltando.

### `404 — orderId inválido` no GET
- Ou o UUID não bate com o padrão `e0e0e0e0-0000-4000-8000-…`, ou o `envio.id` reverso não existe na tabela.
- Confirme `SELECT id FROM live_envios WHERE id = <reverso>`.

### Adapter dispara mas log fica vazio
- A integração roda fire-and-forget; cheque `pdv_integracao_logs` em vez de aguardar resposta na criação do envio.
- `SELECT * FROM pdv_integracao_logs ORDER BY id DESC LIMIT 5` mostra request/response/erro.

### Callbacks chegam com `401 Unauthorized`
- Token expirado (TTL default 1h). Reobter via `/v1/oauth/token`. O PDV cacheia em memória até T-30s para evitar isso.
- `Authorization` header sem prefixo `Bearer ` ou token truncado.
- Token revogado (`od_access_tokens.revoked=1`).

### Callbacks chegam com `404 NotFound`
- O `orderId` não bate com nenhum envio da empresa/unidade do token.
- O middleware aplica filtro `c.empresa_id = ? AND c.unidade_id = ?` — token escopado por unidade não acessa envios de outra unidade. Esperado.

### `pago=1` não foi gravado após `/confirm`
- Confira que `X-Mock-Payments: PREPAID` foi enviado pelo PDV (em Settings do PDV: toggle "Pay on confirm").
- O log do confirm mostra `payments: N` — se for `0`, header faltou ou body.payments[] vazio.
- `applyPDVPayments` é idempotente por `asaas_id = transaction.authorizationCode`. Re-tentativas com mesmo código não duplicam.

---

## 13. Criptografia de segredos em repouso

Campos sensíveis no banco são cifrados com **AES-256-GCM** (autenticado), usando chave derivada de `AUTH_SECRET` via HKDF-SHA256. Implementação: [src/lib/crypto-secrets.ts](../src/lib/crypto-secrets.ts).

| Coluna | Tabela | Onde |
|---|---|---|
| `config.clientSecret` (JSON) | `empresa_pdv` | HMAC do Open Delivery |
| `config.api_key` (JSON, futuro) | `empresa_pdv` | Adapters futuros |
| `asaas_api_key` | `live_unidades` | API key do provedor de pagamento Asaas |

**Formato gravado:** `enc:v1:{base64(iv)}.{base64(ciphertext+authTag)}`

**Compatibilidade com texto cru:** valores sem o prefixo `enc:v1:` são tratados como legacy plain — funcionam normalmente. Na próxima reedição/save pela UI, são re-cifrados automaticamente.

**Comportamento da UI:**
- GET mascara o campo para `••••••••••••` (Open Delivery) ou `********` (Asaas).
- POST detecta a máscara e preserva o valor cifrado atual no banco.
- Para trocar o segredo, apagar o campo e digitar o novo valor.

**Rotação de `AUTH_SECRET`:** invalida todos os segredos cifrados — necessário re-cadastrar as integrações ou rodar script de re-encrypt (não incluído).

---

## 14. Limitações conhecidas

- `GET /v1/orders/{orderId}` ainda está sem auth (qualquer um com o UUID acessa) — os demais endpoints `/v1/orders/{id}/*` já exigem Bearer.
- UUIDs determinísticos previsíveis. Não é crítico em homologação, mas para alta sensibilidade trocar por UUIDv4 + tabela de mapeamento.
- O sandbox `developer.opendelivery.com.br` **não testa este fluxo** (ele simula a OA, não o SS). Use o PDV externo deste projeto.
- Sem retry automático ainda. Logs com erro precisam ser reprocessados manualmente.
- Endpoints OD não implementados (fora do MVP atual):
  `/v1/orders/{id}/readyForPickup`, `/pickedUp`, `/dispatch`, `/validateCode`, `/tracking`, `/details` — fluxo TAKEOUT/DELIVERY.
  `/v1/menuUpdated`, `/v1/events:polling`, `/v1/events/acknowledgment` — sincronização de catálogo e polling.
- Tokens emitidos por `/oauth/token` não são revogados ao reconfigurar `empresa_pdv` — re-cadastrar o secret invalida login futuro, mas tokens já emitidos seguem válidos até `expires_at`. Para revogação imediata, `UPDATE od_access_tokens SET revoked=1 WHERE empresa_pdv_id=?`.

---

## 15. Próximos passos

- [ ] Retry automático de logs com erro (hoje só manual pelo Hub)
- [ ] Auth de Bearer no `GET /v1/orders/{orderId}` para produção (manter compatível com lookup do PDV)
- [ ] Endpoints OD do fluxo TAKEOUT/DELIVERY: `readyForPickup`, `pickedUp`, `dispatch`
- [ ] OA → SS: emissão de `ORDER_CANCELLATION_REQUEST` via `cancelarPedido()` do adapter
- [ ] `/v1/menuUpdated` para sincronização de catálogo
- [ ] Polling endpoints (`/v1/events:polling` + `/v1/events/acknowledgment`) para PDVs sem webhook
- [ ] Testar contra um PDV de mercado real (Saipos, Linx, Cardapioweb) quando disponível
