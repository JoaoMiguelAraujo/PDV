# Integração PDV ↔ menuGo — Passo a passo

Guia operacional para conectar **este PDV** (Software Service) ao **menuGo**
(Ordering Application) seguindo a spec **Open Delivery v1.7** (Abrasel).

> Toda a integração é fiel a `docs/openapi.yaml`. Nenhum endpoint ou campo é
> proprietário — qualquer Ordering Application da spec pode conversar com este
> PDV sem código adaptador.

---

## 1. Conceitos rápidos

| Papel | Quem | Função |
|---|---|---|
| **Software Service (SS)** | Este PDV | Recebe pedidos via webhook HMAC, gerencia ciclo de vida no KDS, expõe catálogo |
| **Ordering Application (OA)** | menuGo | Captura pedido do cliente final, dispara CREATED ao SS, recebe callbacks de status |

Fluxo:
```
Cliente final → menuGo (OA)
    ↓ POST /api/v1/newEvent (HMAC-SHA256)
PDV (SS) recebe Event
    ↓ GET orderURL no menuGo (Bearer OAuth2)
PDV ingere Order → KDS mostra card NEW
    ↓ operador confirma → POST {menuGo}/api/v1/orders/{id}/confirm (Bearer)
    ↓ idem para preparing, delivered, etc.
```

---

## URLs — configuração definitiva (cola direto, sem chutar)

Use os valores das duas tabelas abaixo **literalmente** nos campos dos dois
sistemas. Substitua só os domínios em `<…>`.

### Domínios neste deploy

| Apelido | Domínio |
|---|---|
| `<PDV_HOST>` | `n6amytlutkgwd31uc6wgxjvt.207.180.29.31.sslip.io` |
| `<MENUGO_HOST>` | `app.menugo.com` (ou domínio público que você definiu no `APP_URL` do menuGo) |

### URLs a configurar no **menuGo** (Hub → Integrações → Configurações)

| Campo na UI | Cole exatamente | URL efetiva resultante |
|---|---|---|
| **baseURL do PDV** | `http://<PDV_HOST>/api` | `http://<PDV_HOST>/api/v1/newEvent` (adapter concatena `/v1/newEvent`) |
| **AppId (UUID)** | `<APP_ID>` | — |
| **merchantId no PDV** | `<MERCHANT_ID>` | — |
| **clientSecret (HMAC)** | `<CLIENT_SECRET>` | — |
| **URL pública do menuGo** | `https://<MENUGO_HOST>` (sem `/api`) | Aparece no `orderURL` do Event: `https://<MENUGO_HOST>/api/v1/orders/{orderId}` (adapter monta) |

### URLs a configurar no **PDV** (Estabelecimentos → Credenciais OD)

| Campo na UI | Cole exatamente | URL efetiva resultante |
|---|---|---|
| **X-App-MerchantId** | `<MERCHANT_ID>` | — |
| **X-App-Id** | `<APP_ID>` | — |
| **clientSecret (HMAC)** | `<CLIENT_SECRET>` | — |
| **URL base do menuGo** | `https://<MENUGO_HOST>` (sem `/api`) | `menugo-client.ts` concatena `/api/v1/oauth/token`, `/api/v1/orders/{id}/confirm`, etc. → URL final: `https://<MENUGO_HOST>/api/v1/oauth/token` |
| **OAuth2 client_id** | `<APP_ID>` | — |
| **OAuth2 client_secret** | `<CLIENT_SECRET>` | — |

### Resumão das URLs efetivas (o que vai voar de um sistema pro outro)

| Quem chama | Quem responde | URL completa | Auth |
|---|---|---|---|
| menuGo → PDV | `POST /api/v1/newEvent` | `http://<PDV_HOST>/api/v1/newEvent` | Headers HMAC (X-App-Id, X-App-MerchantId, X-App-Signature) |
| menuGo → PDV | `GET /api/v1/merchant` | `http://<PDV_HOST>/api/v1/merchant?merchantId=<MERCHANT_ID>` | Sem auth (ou apiKey opcional) |
| PDV → menuGo | `GET orderURL` | `https://<MENUGO_HOST>/api/v1/orders/{orderId}` | Sem auth (compat — PDV não envia Bearer aqui) |
| PDV → menuGo | `POST oauth/token` | `https://<MENUGO_HOST>/api/v1/oauth/token` | form-urlencoded (client_credentials) |
| PDV → menuGo | `POST confirm` | `https://<MENUGO_HOST>/api/v1/orders/{orderId}/confirm` | `Authorization: Bearer <token>` |
| PDV → menuGo | `POST preparing` | `https://<MENUGO_HOST>/api/v1/orders/{orderId}/preparing` | Bearer |
| PDV → menuGo | `POST delivered` | `https://<MENUGO_HOST>/api/v1/orders/{orderId}/delivered` | Bearer |
| PDV → menuGo | `POST requestCancellation` | `https://<MENUGO_HOST>/api/v1/orders/{orderId}/requestCancellation` | Bearer |
| PDV → menuGo | `POST acceptCancellation` | `https://<MENUGO_HOST>/api/v1/orders/{orderId}/acceptCancellation` | Bearer |
| PDV → menuGo | `POST denyCancellation` | `https://<MENUGO_HOST>/api/v1/orders/{orderId}/denyCancellation` | Bearer |
| PDV → menuGo | `POST menuUpdated` | `https://<MENUGO_HOST>/api/v1/menuUpdated` | Bearer |

### Erros típicos por URL mal configurada

| Sintoma | Quase certo que é |
|---|---|
| `404 Not Found` ao disparar pedido | `baseURL do PDV` no menuGo **sem `/api`** → vira `http://pdv/v1/newEvent` (404) |
| `404` em todos os callbacks | `URL base do menuGo` no PDV **com `/api`** → vira `https://menugo/api/api/v1/oauth/token` (404) |
| Cards no KDS sem detalhes (Aguardando…) | `URL pública do menuGo` apontando pra IP interno / `localhost:3000` → PDV não alcança via internet |
| `ECONNREFUSED` nos logs | Firewall ou hostname não resolve. Testa de uma máquina externa: `curl -v https://<MENUGO_HOST>/api/health` |

---

## 2. Gerar credenciais (uma vez)

Em qualquer terminal Linux:

```bash
APP_ID=$(uuidgen | tr 'A-Z' 'a-z')
MERCHANT_ID="22815773000169-$(uuidgen | tr 'A-Z' 'a-z')"
CLIENT_SECRET=$(openssl rand -hex 32)
echo "appId=$APP_ID"
echo "merchantId=$MERCHANT_ID"
echo "clientSecret=$CLIENT_SECRET"
```

Anote os 3 valores. Você vai colar **idêntico** nos dois sistemas — 1 caractere
diferente quebra HMAC.

> **Formato do `merchantId`**: a spec exige ≥36 chars. Recomendação Abrasel é
> `CNPJ-UUID` (linha 3121 do openapi.yaml). Se você não tem CNPJ pra teste, use
> 14 dígitos fictícios (ex.: `22815773000169`).

---

## 3. Configurar no menuGo (Hub admin)

Acesse a rota `/hub` do menuGo com usuário **super_admin** → aba **Integrações**
→ subaba **Configurações**.

1. **Empresa**: selecione (ex.: `Burguer & Grill`)
2. **Unidade**: deixe em branco (fallback para nível empresa) ou selecione uma específica
3. **Liga o toggle** `INTEGRAÇÃO PDV — OPEN DELIVERY → ATIVO`
4. **Tipo de integração**: `Open Delivery v1.7 (HMAC)`
5. **baseURL do PDV**: `http://n6amytlutkgwd31uc6wgxjvt.207.180.29.31.sslip.io/api`
   > ⚠️ **com `/api` no fim**. O adapter do menuGo concatena `/v1/newEvent` direto. Sem `/api`, vira `/v1/newEvent` (404 no PDV).
6. **AppId (UUID)**: cole o `$APP_ID` que você gerou
7. **merchantId no PDV**: cole o `$MERCHANT_ID`
8. **clientSecret (HMAC)**: cole o `$CLIENT_SECRET`. Será cifrado AES-256-GCM no banco.
9. **URL pública do menuGo (apresentada ao PDV)**: deixe vazio para usar `APP_URL` do `.env` do menuGo, ou cole o domínio público do menuGo (ex.: `https://app.menugo.com`). Esse valor vai no `orderURL` do Event — precisa ser acessível pelo PDV.
10. Clica **Salvar Configuração PDV**. Deve aparecer modal "Configuração Salva".

> **Se nada acontece ao clicar**: agora há erro inline vermelho exibido no
> próprio card. Antes os erros (sessão expirada, campos obrigatórios) ficavam
> silenciosos.

---

## 4. Configurar no PDV (Estabelecimentos)

Acesse `http://<seu-pdv>/login` → senha do operador (do `ADMIN_PASSWORD`) →
**Estabelecimentos → Cadastrar estabelecimento**.

### Aba "Credenciais OD"
| Campo | Valor |
|---|---|
| Nome amigável | qualquer (ex.: `Burguer & Grill`) |
| X-App-MerchantId | mesmo `$MERCHANT_ID` |
| X-App-Id | mesmo `$APP_ID` |
| clientSecret (HMAC) | mesmo `$CLIENT_SECRET` |
| URL base do menuGo | URL pública do menuGo **sem `/api`** (ex.: `https://app.menugo.com`) |
| OAuth2 client_id | mesmo `$APP_ID` |
| OAuth2 client_secret | mesmo `$CLIENT_SECRET` |

> ⚠️ **Assimetria intencional de URLs**:
> - No **menuGo**, `baseURL` inclui `/api`.
> - No **PDV**, `menugoBaseURL` **não** inclui `/api` — o `menugo-client.ts` adiciona automaticamente.

### Aba "BasicInfo"
Todos os campos abaixo são **obrigatórios** pela spec OD (`BasicInfo`,
openapi.yaml linha 3346). Sem isso, `GET /api/v1/merchant` retorna **503** e o
menuGo não consegue importar o catálogo.

- CNPJ (14 dígitos só números)
- Razão social
- Descrição
- Preparo médio (min)
- Pedido mínimo (R$)
- Categorias do merchant (selecione 1+ do enum: PIZZA, BURGERS, BRAZILIAN, etc.)

### Aba "Endereço"
Todos os campos obrigatórios (`Address`, openapi.yaml linha 5949), inclusive
**latitude/longitude**. Use o [Google Maps](https://maps.google.com) para
pegar as coordenadas exatas.

### Aba "Contatos"
- Telefone comercial (obrigatório)
- ≥1 e-mail de contato

### Aba "Imagens"
- Logo URL (a spec **exige HTTPS** + JPEG/PNG/GIF/WEBP + 320–1144px)

### Aba "Services"
Adicione ≥1 service (`INDOOR`, `TAKEOUT` ou `DELIVERY`):
- Selecione dias da semana + horário (start/end)
- Para `DELIVERY`, adicione `geoRadius` (latitude/longitude/raio em metros)

### Salvar
O card do merchant na listagem **não deve mais ter o aviso amarelo** "BasicInfo
incompleto".

---

## 5. Cadastrar catálogo no PDV

### Opção A — manual

`/catalog` → cria categorias e produtos. Adicione modificadores se for o caso
(tamanho, adicionais). Para cada produto: nome, preço, SKU, código externo.

### Opção B — seed automático (1 merchant + 10 produtos)

```bash
curl -X POST 'http://<seu-pdv>/api/admin/seed' \
  -H "X-Seed-Token: $AUTH_SECRET"
```

Cria "Pizzaria Belíssima" com BasicInfo completo, 3 services, 4 categorias,
10 produtos com fotos, modificadores, 10 mesas, 10 insumos e fichas técnicas.
Idempotente — segunda execução retorna `{ created: false }`. Para recriar do
zero: `?force=1`.

---

## 6. Validar antes do primeiro pedido real

### a) menuGo consegue puxar o catálogo do PDV?

```bash
curl 'http://<seu-pdv>/api/v1/merchant?merchantId=<MERCHANT_ID>' | jq
```

Tem que retornar:
```json
{
  "lastUpdate": "2026-...",
  "TTL": 600,
  "id": "<MERCHANT_ID>",
  "status": "AVAILABLE",
  "basicInfo": { ... },
  "services": [ ... ],
  "menus": [ ... ],
  "categories": [ ... ],
  "items": [ ... ],
  "itemOffers": [ ... ],
  "optionGroups": [ ... ]
}
```

Se vier **503**: faltam campos do BasicInfo. O JSON de erro lista quais.

### b) HMAC bate dos dois lados?

Disparar um pedido de teste:
- Pelo menuGo, criar uma comanda + envio (rodízio, checkout setor, ou via app do garçom). Quando o garçom confirma o envio, o `comanda.service.ts:148` chama `integrarEnvio()`, que dispara o webhook HMAC ao PDV.

No PDV: `/logs` → aba **Eventos recebidos** → o badge `HMAC` deve estar **verde**.
- Vermelho = `clientSecret` divergente, ou body alterado em trânsito.

### c) PDV consegue obter access_token e fazer callbacks?

No KDS do PDV, com pedido aparecido como NEW, clicar **Confirmar**. Em `/logs`
→ aba **Callbacks ao menuGo** → deve aparecer o callback `confirm` com HTTP
202/204.
- HTTP 401 = `client_id`/`secret` divergem entre os dois lados.
- HTTP 0 / timeout = PDV não alcança a URL do menuGo (firewall, DNS, hostname).

---

## 7. Fluxo end-to-end de demonstração

1. **menuGo (lado do garçom)**: cria envio na comanda → adapter dispara CREATED
2. **PDV (KDS)**: pedido aparece como `NEW` em segundos (com beep, se ligado)
3. **PDV (KDS)**: operador clica **Confirmar** → `POST /v1/orders/{id}/confirm` no menuGo
4. **menuGo**: `live_envios.status` vai para `confirmado`
5. **PDV**: clica **Em preparo** → status `preparando`
6. **PDV**: clica **Entregue** → status `entregue`
7. **menuGo**: pedido finalizado no lado da OA

Cancelamento iniciado pela OA:
1. **menuGo**: dispara evento `ORDER_CANCELLATION_REQUEST` para o PDV
2. **PDV**: marca `Order.cancelRequested = true` no banco
3. **PDV**: operador resolve via `POST /api/orders/{id}/acceptCancellation` ou `denyCancellation`
4. **menuGo**: recebe callback, atualiza status

---

## 8. Endpoints expostos pelo PDV

### Públicos (sem cookie de operador)
| Método | Rota | Função | Auth |
|---|---|---|---|
| `POST` | `/api/v1/newEvent` | Recebe Events da OA | Headers HMAC obrigatórios |
| `GET` | `/api/v1/merchant?merchantId=X` | Exporta Merchant da spec OD | `[]` ou apiKey opcional |
| `POST` | `/api/admin/seed` | Popula base fake | Header `X-Seed-Token: $AUTH_SECRET` |
| `GET` | `/api/health` | Healthcheck | sem auth |

### Painel (cookie httpOnly + HMAC-SHA256)
- `/api/merchants/*` — CRUD estabelecimentos
- `/api/categorias/*`, `/api/produtos/*`, `/api/grupos/*`, `/api/opcoes/*` — catálogo
- `/api/produtos/[id]/ficha` — ficha técnica
- `/api/mesas/*`, `/api/comandas/*` — operação local
- `/api/caixa/*` — turno de caixa
- `/api/insumos/*` — estoque
- `/api/orders/*` — pedidos OD recebidos
- `/api/reports/summary` — relatórios
- `/api/callbacks/[id]/retry` — reenvio de callbacks falhos

---

## 9. Endpoints esperados no menuGo (Ordering Application)

| Método | Rota | Função |
|---|---|---|
| `POST` | `/api/v1/oauth/token` | OAuth2 client_credentials → access_token |
| `GET` | `/api/v1/orders/{orderId}` | Devolve Order completa (chamado pelo PDV após CREATED) |
| `POST` | `/api/v1/orders/{id}/confirm` | PDV avisa que aceitou |
| `POST` | `/api/v1/orders/{id}/preparing` | PDV avisa que está preparando |
| `POST` | `/api/v1/orders/{id}/delivered` | PDV avisa que entregou |
| `POST` | `/api/v1/orders/{id}/requestCancellation` | PDV pede cancelamento |
| `POST` | `/api/v1/orders/{id}/acceptCancellation` | PDV aceita cancelamento da OA |
| `POST` | `/api/v1/orders/{id}/denyCancellation` | PDV nega cancelamento da OA |
| `POST` | `/api/v1/menuUpdated` | OA recebe notificação que catálogo mudou |

---

## 10. Troubleshooting

| Sintoma no PDV | Causa provável no menuGo |
|---|---|
| `403 Assinatura HMAC inválida` em `/logs` | `clientSecret` divergente entre os dois lados, ou proxy alterando body |
| `400 Headers obrigatórios ausentes` | Falta `X-App-Id`, `X-App-MerchantId` ou `X-App-Signature` |
| `400 eventType '...' fora do enum` | Enviou eventType inválido (veja enum em openapi.yaml linha 4400+) |
| `404 NotFound` no newEvent | `merchantId` enviado não cadastrado no PDV |
| Event chega OK mas KDS não mostra card | PDV não consegue alcançar `orderURL` (DNS, firewall, `APP_URL` errado no menuGo) |
| Callback falha "Falha ao obter access_token" | `/v1/oauth/token` do menuGo offline, ou credenciais OAuth divergem |
| Callback 401 com token OK | Token escopado em outra empresa/unidade |
| Botão "Salvar Configuração PDV" não dá feedback | Agora há erro inline em vermelho — checa sessão (precisa super_admin) ou campos obrigatórios |

---

## 11. Configuração mínima de produção

### PDV (Coolify env)
```dotenv
DATABASE_URL=mysql://...
AUTH_SECRET=<≥32 chars, NUNCA mudar>
ADMIN_PASSWORD=<senha do operador>
APP_URL=http://n6amytlutkgwd31uc6wgxjvt.207.180.29.31.sslip.io
```

### MenuGo (`.env`)
```dotenv
APP_URL=https://<dominio-publico-do-menugo>   # acessível pelo PDV!
OPENDELIVERY_APP_ID=<UUID v4 fixo>             # opcional: default global
OD_OAUTH_TOKEN_TTL_SECONDS=3600                # default
```

---

## 12. Referências

- [docs/openapi.yaml](docs/openapi.yaml) — spec oficial Open Delivery v1.7 (Abrasel)
- [docs/pdv-integracao.md](docs/pdv-integracao.md) — playbook do projeto, com detalhes de HMAC manual, cifragem AES-256-GCM e fluxos completos
- Adapter do menuGo: `src/lib/integrations/pdv/adapters/opendelivery.adapter.ts` (no repo `menugo`)
- Cliente OAuth do PDV: [src/lib/menugo-client.ts](src/lib/menugo-client.ts)
- Tradutor de catálogo: [src/lib/merchant-export.ts](src/lib/merchant-export.ts)
