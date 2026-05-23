# Debug do 401 no callback requestCancellation

Quando o operador cancela um pedido pelo PDV, o callback `POST /api/v1/orders/{id}/requestCancellation` no menuGo está respondendo `401 Unauthorized` com mensagem `Bearer token inválido ou expirado`.

Diagnóstico em 2 passos para isolar **se o bug é no PDV ou no menuGo**.

---

## Pré-requisitos

- `clientSecret` cadastrado no Hub do menuGo (mesmo que está no PDV/Merchants).
  Pegue em: Hub → Empresa → Integração PDV → campo `clientSecret`.
- Um `orderId` que esteja com status `NEW` ou `CONFIRMED` ou `PREPARING` no menuGo (não funciona em DELIVERED/CANCELLED).
  O exemplo abaixo usa `e0e0e0e0-0000-4000-8000-00000000003f` — troque se já não existir.

---

## Passo 1 — Obter access_token via OAuth2

```bash
curl -s -X POST https://menugo.ddns.net/api/v1/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=0d549e3d-e562-4ec0-b421-e7b19fb933ff" \
  -d "client_secret=COLE_O_CLIENT_SECRET_AQUI"
```

### Saída esperada (sucesso)

```json
{
  "access_token": "AbCdEf...base64url...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "od.all"
}
```

### Se vier `invalid_client` (HTTP 401)

```json
{ "error": "invalid_client", "error_description": "Credenciais inválidas" }
```

→ O `clientSecret` cadastrado no Hub do menuGo **não bate** com o que o PDV está enviando. Diagnóstico encerrado aqui — regenere e sincronize os dois lados (Hub do menuGo + Merchants do PDV).

---

## Passo 2 — Chamar requestCancellation com o token recebido

Cole o `access_token` do passo 1 em `TOKEN` e rode:

```bash
TOKEN="cole_o_access_token_aqui"

curl -s -i -X POST \
  "https://menugo.ddns.net/api/v1/orders/e0e0e0e0-0000-4000-8000-00000000003f/requestCancellation" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "teste manual curl",
    "code": "INTERNAL_DIFFICULTIES_OF_THE_RESTAURANT",
    "mode": "MANUAL"
  }'
```

`-i` mostra os headers da resposta — útil pra ver o status code.

### Saída esperada (sucesso)

```
HTTP/2 202
...
```
(Body vazio — 202 Accepted = cancelado.)

### Se vier 401

```
HTTP/2 401
{"error":"Unauthorized","message":"Bearer token inválido ou expirado"}
```

→ **Bug no menuGo** (validateBearer). Reporte que mesmo um token fresh do `/oauth/token` é rejeitado e vamos debugar a fundo (provavelmente lookup pelo hash falhando ou comparação errada).

### Se vier 404

```
HTTP/2 404
{"error":"NotFound","message":"Order não encontrada para este merchant"}
```

→ Esse `orderId` não está no banco do menuGo (ou está, mas pertence a outro merchant). Use um `orderId` real de um envio recente.

### Se vier 422 / 409

→ A Order está num status que não permite cancelar (já entregue/cancelada). Use uma Order ativa.

---

## Interpretação dos resultados

| Passo 1 | Passo 2 | Diagnóstico |
|---|---|---|
| ✅ token | ✅ 202 | menuGo OK. **Bug é no PDV** (provavelmente cache de token não foi limpo no deploy, ou o getToken devolveu token diferente do que foi armazenado). |
| ✅ token | ❌ 401 | **Bug no menuGo** (validateBearer rejeita token recém-emitido). Vou debugar o hash/lookup. |
| ❌ 401 | — | Secret do Hub ≠ secret do PDV. Sincronizar credenciais. |

---

## Comandos auxiliares no MariaDB do menuGo

Ver últimos 5 tokens emitidos com tempo restante:

```sql
SELECT id, client_id,
       expires_at,
       NOW() AS agora,
       TIMESTAMPDIFF(SECOND, NOW(), expires_at) AS segundos_restantes,
       revoked
  FROM od_access_tokens
  ORDER BY id DESC LIMIT 10;
```

Revogar todos os tokens (forçar PDV a pedir tokens novos):

```sql
UPDATE od_access_tokens SET revoked = 1;
```

Limpar tokens expirados:

```sql
DELETE FROM od_access_tokens WHERE expires_at < NOW();
```
