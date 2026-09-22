# CORS do bucket R2 (anexos)

Por que "Copiar imagem" e "Salvar imagem" precisavam de CORS, o que foi posto
no bucket, e o que **não** muda.

> **Já aplicado em 2026-09-21.** A política está no bucket de produção e foi
> conferida sondando o R2 com `Origin`: `https://streamz.chat`,
> `http://tauri.localhost` e `tauri://localhost` respondem `204` com
> `Access-Control-Allow-Origin`; uma origem não listada não recebe o cabeçalho.
> O resto deste documento descreve por que foi preciso e como repetir o ajuste
> noutro bucket — **não** descreve o estado atual do nosso.
>
> **CORS não era a única causa.** Continua valendo que a URL do anexo é
> assinada e expira em 1 h (`ATTACHMENT_URL_TTL_SECONDS`): numa janela aberta
> há mais tempo, o `<img>` segue mostrando o que já carregou, mas um `fetch`
> novo leva `403` do bucket — sem relação com CORS. O caminho imune às duas
> coisas é o proxy autenticado da API (`GET /uploads/file/:id`), que exige o id
> do anexo.

## Medido em produção: o token da API não alcança CORS

Rodar `scripts/r2-cors.mjs --ver` contra o bucket de produção deu isto:

- `ListObjectsV2` (nível objeto) → **OK**
- `GetBucketCors` (nível bucket) → **AccessDenied**

O token `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` que a API usa é do escopo
**"Object Read & Write"**: lê e grava arquivo, e por isso mesmo não lê nem
grava a configuração de CORS do bucket — isso exige um token **"Admin Read &
Write"**. É o comportamento certo do ponto de vista de segurança (menor
privilégio para a aplicação em produção), não um defeito a corrigir na
permissão do token. O que muda é como se aplica CORS uma vez, sem promover
esse token. Dois caminhos, e nenhum passa por dar mais permissão ao token da
aplicação:

| Caminho | Como | Quando compensa |
|---|---|---|
| **Painel** (mais rápido) | `node scripts/r2-cors.mjs --json` imprime a política pronta — cole em Cloudflare → R2 → bucket → *Settings* → *CORS Policy* | Ajuste único, sem gerar token nenhum |
| **Script com token admin temporário** | Crie um token "Admin Read & Write" em Cloudflare → R2 → *Manage API Tokens*, exporte `R2_ADMIN_ACCESS_KEY_ID`/`R2_ADMIN_SECRET_ACCESS_KEY` (o script os usa com precedência sobre os da aplicação) e rode `--ver`/`--aplicar --sim` normalmente; revogue o token depois | Quer a conferência automática (relê e compara após gravar) ou vai repetir o ajuste mais de uma vez |

Sem token admin nem `--json`, o script agora explica isso na tela em vez de só
devolver `AccessDenied` seco.

## O problema, em três frases

`StorageService.attachmentUrl` (`apps/api/src/modules/storage/storage.service.ts`)
devolve uma **URL assinada do R2** sempre que as credenciais `R2_*` existem e
`R2_PUBLIC_BASE_URL` está vazia — exatamente o caso da produção. A assinatura
resolve *autorização* (quem tem a URL pode baixar, até ela vencer), mas não
resolve *CORS*: o bucket não devolve `Access-Control-Allow-Origin`, e sem esse
cabeçalho o navegador se recusa a entregar os bytes a um script da nossa página.

Daí a assimetria que confunde: **mostrar funciona, ler não.** Um `<img src>`
desenha a imagem sem CORS nenhum (o navegador busca os bytes, pinta e não deixa
ninguém tocar neles). `fetch`, `canvas.toBlob` e o `ClipboardItem` precisam
*ler* — e é isso que "Copiar imagem" e "Salvar imagem" fazem
(`apps/web/lib/imagem-arquivo.ts`). Sem política de CORS no bucket, nenhum
código do cliente consegue esses bytes; o máximo honesto que a web faz hoje é
abrir a imagem fora do app e avisar.

## O que CORS **não** é

- **Não é permissão de leitura.** O bucket continua privado; ninguém passa a
  baixar anexo sem a URL assinada.
- **Não muda a expiração.** A URL continua valendo `ATTACHMENT_URL_TTL_SECONDS`
  (1 h) e continua sendo um *bearer token* de curta duração.
- **Não libera escrita.** A política gravada aqui permite só `GET` e `HEAD`: o
  upload não passa pelo navegador, quem escreve no bucket é a API (`POST /uploads`)
  com credencial de servidor.

CORS é a permissão que o **navegador** exige antes de entregar uma resposta de
outra origem ao JavaScript da nossa. É uma regra de cliente, não de servidor de
arquivos.

## As origens, e a que todo mundo esquece

| Origem | Quem é |
|---|---|
| `https://streamz.chat` | o site |
| `http://tauri.localhost` | o app de desktop no **Windows** (WebView2) e no Android |
| `tauri://localhost` | o app de desktop no **macOS**, iOS e Linux (WebKit) |
| `http://localhost:3000` | só o `pnpm dev`, e só quando você passar `--dev` |

As duas do meio são a pegadinha. No Tauri 2 o app não é servido de
`https://streamz.chat`: o webview serve o export estático de um esquema interno
e **manda o header `Origin`** com esses valores. Liberar apenas
`https://streamz.chat` conserta o site e deixa todo mundo que instalou o app com
exatamente o mesmo defeito. É a mesma lista que a API já usa em
`apps/api/src/common/cors.ts`, pelo mesmo motivo.

O script lê as origens, nesta ordem: `--origens=a,b` → `R2_CORS_ORIGINS` →
`CORS_ORIGIN` (a mesma variável que a API usa) → o padrão embutido
`https://streamz.chat`. As duas do desktop entram sempre.

## Como rodar

O script não acrescenta dependência: usa o `@aws-sdk/client-s3` que
`apps/api` já declara, resolvido a partir de `apps/api/node_modules` (mesmo
truque do `scripts/e2e-emojis-midia.mjs` com o Prisma). Basta ter rodado
`pnpm install` na raiz. As credenciais saem do ambiente ou do `.env` da raiz:
`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` — mas
elas **não bastam** para `--ver`/`--aplicar` (ver seção acima): use
`R2_ADMIN_ACCESS_KEY_ID`/`R2_ADMIN_SECRET_ACCESS_KEY` para isso, ou pule a
chamada inteira com `--json`.

```bash
# caminho sem token nenhum: só monta a política, não chama a Cloudflare
node scripts/r2-cors.mjs --json

# 1. ver o que está lá hoje (não muda nada — é o modo padrão; precisa de
#    R2_ADMIN_ACCESS_KEY_ID/R2_ADMIN_SECRET_ACCESS_KEY em produção)
node scripts/r2-cors.mjs --ver

# 2. ver a diferença entre o que está e o que ficaria; ainda não grava
node scripts/r2-cors.mjs --aplicar

# 3. gravar de verdade
node scripts/r2-cors.mjs --aplicar --sim
```

Se o `node` da sua máquina não achar o pacote, chame por dentro do workspace da
api, que é onde a dependência está declarada:

```bash
pnpm --filter @streamz/api exec node "$PWD/scripts/r2-cors.mjs" --ver
```

Outras flags: `--dev` (soma `http://localhost:3000`), `--origens=a,b`,
`--bucket=nome` (para ensaiar noutro bucket antes do de produção), `--json`
(imprime a política e sai, sem chamada nenhuma — ver seção do topo), `--ajuda`.

**`PutBucketCors` substitui a configuração inteira** — não acrescenta regra. Por
isso o `--aplicar` imprime a política atual, a nova, e lista nominalmente as
regras que vão sumir; sem `--sim` ele para aí e sai com código 2. Se alguma
regra existente servir outro app, junte as origens dela ao `--origens` antes de
gravar.

O script recusa rodar com credencial faltando, dizendo **qual nome** falta, e
sai com código 1. Nenhum valor de credencial vai para a tela; o id da conta
aparece mascarado.

## A política gravada

```json
[
  {
    "AllowedOrigins": ["https://streamz.chat", "http://tauri.localhost", "tauri://localhost"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["Range", "Authorization", "Content-Type"],
    "ExposeHeaders": ["Content-Length", "Content-Type", "ETag", "Content-Range", "Accept-Ranges"],
    "MaxAgeSeconds": 3600
  }
]
```

- **`AllowedHeaders`**: `Range` **não** está na safelist de requisição do CORS,
  então sem ele o *preflight* de um `fetch` com faixa (vídeo ou áudio buscando
  um pedaço) é barrado. `Authorization` e `Content-Type` entram porque um
  cliente pode mandá-los — para a URL assinada o `Authorization` é inútil (a
  assinatura vai na query, e mandar o cabeçalho junto quebraria a requisição),
  mas listá-lo não custa nada e evita um preflight recusado por engano.
- **`ExposeHeaders`**: sem isto o JavaScript recebe a resposta mas só enxerga os
  cabeçalhos da safelist. `Content-Length` e `Content-Type` já estão nela (vão
  listados por clareza — é de `Content-Type` que sai a decisão de converter a
  imagem para PNG ao copiar); quem precisa mesmo da lista são `ETag`,
  `Content-Range` e `Accept-Ranges`.
- **`MaxAgeSeconds: 3600`**: o preflight deixa de repetir a cada leitura, e uma
  correção de política ainda chega ao usuário no mesmo dia.

## Como conferir que funcionou

Pegue uma URL assinada recente (o `src` de um anexo no app, com todos os
`X-Amz-*`) e peça só os cabeçalhos, **com `Origin`** — sem esse header o R2 não
responde nada de CORS e você vai concluir errado:

```bash
curl -H "Origin: https://streamz.chat" -I "<url assinada>"
```

Procure na resposta:

```
HTTP/2 200
access-control-allow-origin: https://streamz.chat
access-control-expose-headers: Content-Length, Content-Type, ETag, Content-Range, Accept-Ranges
```

Se `access-control-allow-origin` não aparecer, a política não pegou (ou você
esqueceu o `-H "Origin: …"`). Repita com `-H "Origin: http://tauri.localhost"`
para confirmar o caminho do app de desktop. A propagação da regra pode levar
até uns 30 s.

Duas armadilhas na conferência:

- **URL vencida não tem CORS.** Um presign expirado responde `403 ExpiredRequest`
  **sem** cabeçalhos de CORS — de propósito, do lado do R2. Então uma falha de
  "Copiar imagem" numa mensagem velha pode ser expiração, não CORS. Teste
  sempre com uma URL recém-gerada.
- **`-I` manda `HEAD`.** Está na política, mas se quiser reproduzir o que o app
  faz, use `curl -H "Origin: …" -D - -o /dev/null "<url>"` (um `GET`).

No app, o teste real é o de sempre: clique com o botão direito numa imagem →
"Copiar imagem" e "Salvar imagem", no navegador **e** no app de desktop.

## A alternativa: servir pelo proxy da API

Existe um caminho que resolve o mesmo problema **sem tocar no bucket**: fazer
`attachmentUrl` devolver o proxy autenticado que já existe
(`GET /api/uploads/file/:id?t=…`) em vez do presign. Esse endpoint é nosso, já
responde CORS para as nossas origens, já reavalia a permissão pelo canal da
mensagem e já aceita `Authorization: Bearer` quando o token curto venceu — é
justamente por isso que o `baixar` de `imagem-arquivo.ts` consegue repetir a
busca ali e não no bucket.

O custo: **a API passa a servir os bytes de todos os anexos**. Toda imagem de
todo canal aberto vira tráfego e tempo de processo da API, que hoje só assina
uma URL e sai do caminho. Some a isso perder o cache de borda do R2 e ganhar um
gargalo que escala com o número de pessoas olhando fotos.

**Recomendação: aplicar o CORS no bucket.** É uma mudança de configuração, de
uma linha de efeito, que não altera código nem o modelo de segurança — o bucket
continua privado, a URL continua assinada e expirando. O proxy continua onde
está, como fallback autenticado, que é o papel dele. Trocar o padrão para o
proxy seria pagar banda e latência permanentes para evitar uma configuração que
leva um comando.

## Arquivos

- `scripts/r2-cors.mjs` — lê (`--ver`) e aplica (`--aplicar --sim`) a política.
- `apps/api/src/modules/storage/storage.service.ts` — `attachmentUrl`, onde o
  presign é escolhido.
- `apps/api/src/common/cors.ts` — a lista de origens da API, a mesma ideia.
- `apps/web/lib/imagem-arquivo.ts` — o lado do cliente que precisa dos bytes.
