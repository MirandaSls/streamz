# Bots compatíveis com o Discord

Arquitetura e plano por fases para um bot escrito com discord.js / discord.py /
Lavalink rodar contra o Streamz trocando **só a URL da API e o token**.

Escrito em 2026-09-08 contra o `main` em `8d2ba0f`. Tudo que está aqui foi
conferido no código do repositório ou na documentação oficial do Discord (links
no §16); onde não deu para confirmar, está escrito "não confirmado".

---

## 1. Resumo: as decisões

| # | Assunto | Decisão |
|---|---|---|
| **D1** | IDs | Coluna `snowflake BIGINT UNIQUE` nas 9 tabelas que o bot enxerga, gerada por `DEFAULT streamz_snowflake()` no Postgres, com **epoch do Discord** (1420070400000) para que o `createdAt` que as libs derivam do id bata com o real. Não migramos os cuid; não criamos tabela de mapeamento. |
| **D2** | REST | Módulo novo `modules/discord-compat/` montado **ao lado** do REST atual, em `/api/v10/**` (e `/api/v9/**` como alias), com tradutores camelCase→snake_case. Nada do REST existente muda. |
| **D3** | Token | `base64url(id decimal).base64url(unix hex).base64url(32 bytes aleatórios)` — três partes, como o do Discord. Guardado como **SHA-256** (não argon2: é lido a cada requisição). `Authorization: Bot <token>`. |
| **D4** | Gateway | WebSocket **cru** (`ws`), no mesmo processo da API, em `/gateway`. Convive com o Socket.IO (`/socket.io`), que não muda. **Sem compressão** na F1 — mas com uma ressalva de armadilha real (§7). |
| **D5** | Voz | Serviço novo em **Go** (`apps/ponte-voz`), com `server-sdk-go`, que fala o protocolo de voz do Discord (WS + UDP + AEAD) e **repassa os quadros Opus para o LiveKit sem transcodificar** (`NewLocalSampleTrack` + `WriteSample`). Sem libwebrtc, sem libopus, sem decodificar nada. |
| **D6** | Interactions | Pelo **gateway** (`INTERACTION_CREATE`), nunca por webhook HTTP. O `/` do composer já existe e só precisa de mais uma fonte de sugestões. |
| **D7** | Diretório e portal | "Descobrir aplicativos" como vista própria (a de servidores foi removida de propósito e fica removida). Portal do dev = uma aba nova em `components/settings/tabs.tsx`. |
| **D8** | Permissões | Tabela de tradução bidirecional entre os 19 bits do `Permission` e o bitfield de 64 do Discord. As 19 mapeiam; 35 do Discord não têm par e são **concedidas por padrão** ou ignoradas conforme o §6. |

E a ordem, porque a prioridade é **bot de música tocando**:

```
F0 fundação → F1 identidade+REST+gateway → F2 VOZ → F3 interactions → F4 diretório+portal → F5 o resto
   3-5 d          8-12 d                     10-15 d      6-8 d            6-9 d
```

---

## 2. Escopo: o que entra e o que não entra

### Entra
Bots que **o dono hospeda**: um processo dele, com o código dele, apontando para
a nossa URL. discord.js v14, discord.py, e principalmente os de música
(Lavalink v4, discord-player, `@discordjs/voice`).

### Não entra — e isto é definitivo
**Bots públicos de terceiros (MEE6, Dyno, Carl-bot, Groovy, Rythm…) nunca vão
funcionar.** Não é limitação nossa: esses bots são processos rodando na
infraestrutura de quem os fez, conectados a `gateway.discord.gg` com o token
*deles*. Não há nada que o Streamz possa expor que faça o servidor da MEE6
abrir uma segunda conexão para `api.streamz.chat`. A única forma seria a MEE6
publicar o código e o usuário hospedar — e aí ele vira um bot auto-hospedado,
que é o caso de cima.

Consequência prática: o "Descobrir aplicativos" (§11) lista **os bots
registrados no Streamz**, não um catálogo do Discord. Quem quiser um bot de
música tem que subir um (o Lavalink + um bot de 200 linhas é o caminho normal).

---

## 3. O terreno: o que existe hoje

| Peça | Estado | Onde |
|---|---|---|
| IDs | `cuid()` em **todas** as tabelas. Nada numérico. | `apps/api/prisma/schema.prisma` |
| REST | `setGlobalPrefix("api")`, **sem versionamento**, sem Swagger. `ValidationPipe({whitelist:true,transform:true})` global. | `apps/api/src/main.ts` |
| Auth | `JwtGuard` manual (não passport), `Authorization: Bearer`, HS256, `{sub,username,sid}`, 15 min. **Não existe API key nem token de longa duração.** | `apps/api/src/common/jwt.guard.ts` |
| Tempo real | Socket.IO em `/socket.io`, JWT no handshake, salas `user:`/`channel:`/`guild:`, adapter Redis opcional. | `modules/gateway/chat.gateway.ts` |
| Publicação interna | `RealtimeService` (`emitToUser/Channel/Guild`, `join/leaveChannelRooms`). Sem pub/sub próprio — o fan-out é do adapter. | `modules/realtime/realtime.service.ts` |
| Mensagens | **Criadas por WS**, nunca por REST. O REST é leitura e estrutura. | `CLAUDE.md`, `modules/messages/` |
| Voz | Estado **efêmero** em `VoiceStateStore` (Redis ou memória), sala LiveKit `voice:<channelId>` / `dm:<channelId>`, token do `livekit-server-sdk`. Sem webhook do LiveKit. | `modules/voice/` |
| Permissões | Bitfield de 19 bits, `computePermissions` puro em `@streamz/shared`. | `packages/shared/src/permissoes.ts` |
| Descobrir servidores | API viva (`GET /api/discover`), **UI removida de propósito** (`GuildRail.tsx:407`). | `modules/discovery/` |
| `/` no composer | **Já existe e é testado**: `detectarGatilho` → `montarSugestoes` → `Autocomplete` → `interpretarComando`. | `apps/web/lib/composer-autocomplete.ts`, `lib/comandos-barra.ts` |
| Bot / application / webhook | **Não existe nada.** | — |
| LiveKit | Self-hosted, mux numa porta só: **7882/udp**, 7881/tcp, signaling 7880 atrás do Traefik. A faixa 50000-60000 está livre. | `livekit.yaml`, `docker-compose*.yml` |

Duas consequências que moldam o desenho inteiro:

1. **O cliente web não vai perceber diferença.** Um bot é um `User` com
   `isBot = true`; mensagem de bot é `Message`; bot na call é um participante
   do LiveKit. Nenhuma store, nenhum evento `WS_EVENTS`, nenhuma rota do web
   muda de forma — só ganham um campo `bot`.
2. **A compatibilidade é uma casca.** Nada em `modules/discord-compat/` implementa
   regra de negócio: ela chama `MessagesService`, `GuildsService`,
   `RolesService`, `VoiceService` como o gateway atual chama, e traduz a
   entrada e a saída. Se um dia a casca sair, o Streamz continua inteiro.

---

## 4. D1 — IDs: snowflake numérico

### O problema
As libs do Discord tratam todo id como **snowflake**: `u64` serializado em
string decimal. Elas não só comparam — elas **calculam**:

- `discord.js`: `SnowflakeUtil.timestampFrom(id)` alimenta `message.createdAt`,
  `channel.createdAt`, `user.createdAt`. Um cuid vira `NaN` e a data da
  mensagem some da UI de qualquer bot que a mostre.
- `discord.py`: `discord.utils.snowflake_time()`, e `Object(id=int(...))` —
  `int("clx3k9...")` levanta `ValueError` **antes** de qualquer requisição.
- Lavalink: `guildId` é chave de `Map<Long, Player>` — cuid não parseia.

Ou seja: não dá para "mandar cuid e torcer".

### As três saídas, com custo

| Opção | Custo | Veredito |
|---|---|---|
| **A. Migrar os ids para snowflake** | 31 modelos, ~60 chaves estrangeiras, todo `stores/*` do web, todo link `/app/channels/...` já compartilhado, todo `sessionStorage` de retomada de call, os `pairKey` ("a:b" de ids ordenados). Migration irreversível de horas com o app fora. | **Não.** Risco enorme por benefício estético. |
| **B. Tabela de mapeamento** `SnowflakeMap(tipo, idInterno, snowflake)` | Zero mudança no schema atual. Mas **dois lookups por id em todo request e em todo evento** — uma mensagem traduzida tem 6 ids (message, channel, guild, author, reply, attachment), e um `GUILD_CREATE` tem centenas. Cache obrigatório, invalidação obrigatória, contenção numa tabela só. | **Não.** Paga-se o preço no caminho quente para sempre. |
| **C. Coluna `snowflake` na própria tabela** | 9 colunas novas + 9 índices únicos + um backfill. Tradução vira `WHERE snowflake = $1` (índice) ou nem isso (o registro já veio do `SELECT`). | **Sim.** |

### A decisão (C), em detalhe

**Epoch: o do Discord, 1420070400000.** Não um epoch nosso. Motivo: o
`createdAt` que as libs derivam do snowflake tem que bater com o `createdAt`
real da linha, senão toda mensagem do Streamz aparece datada de 2015 no log de
qualquer bot. Com 42 bits de milissegundos desde 2015, o esquema vai até 2154.

**Layout** (idêntico ao do Discord):

```
 63                    22 21   17 16   12 11         0
+------------------------+-------+-------+------------+
|  ms desde 2015-01-01   | worker| proc  | incremento |
|        42 bits         | 5 bits| 5 bits|  12 bits   |
+------------------------+-------+-------+------------+
```

**Gerado no banco, não na aplicação.** Uma função `DEFAULT` garante que
*qualquer* inserção — inclusive as que alguém esquecer de atualizar — tenha
snowflake, e o `UNIQUE` é do Postgres, não da nossa disciplina. Worker e
processo ficam em 0 porque a fonte é única (um banco) e a sequência já garante
4096 ids distintos por milissegundo.

```sql
-- prisma/migrations/20260908130000_snowflakes/migration.sql  (escrito na F0)
CREATE SEQUENCE "streamz_snowflake_seq" CYCLE MAXVALUE 4095;

CREATE FUNCTION streamz_snowflake() RETURNS bigint
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  ms bigint;
BEGIN
  ms := floor(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint - 1420070400000;
  RETURN (ms << 22) | nextval('streamz_snowflake_seq');
END;
$$;

ALTER TABLE "Message" ADD COLUMN "snowflake" BIGINT;
-- backfill: o timestamp vem do createdAt real; o incremento desempata a mesma ms
UPDATE "Message" AS alvo SET "snowflake" = calc."sf"
FROM (
  SELECT "id",
         (((EXTRACT(EPOCH FROM "createdAt") * 1000)::bigint - 1420070400000) << 22)
         | (ROW_NUMBER() OVER (PARTITION BY date_trunc('milliseconds', "createdAt")
                               ORDER BY "id") - 1) AS "sf"
  FROM "Message"
) AS calc
WHERE alvo."id" = calc."id";
ALTER TABLE "Message" ALTER COLUMN "snowflake" SET NOT NULL,
                      ALTER COLUMN "snowflake" SET DEFAULT streamz_snowflake();
CREATE UNIQUE INDEX "Message_snowflake_key" ON "Message"("snowflake");
-- idem para as outras oito tabelas
```

Três coisas que o rascunho deste § tinha errado e a F0 corrigiu contra um
Postgres 16 de verdade:

1. **A janela não cabe no `UPDATE ... SET`.** O Postgres recusa
   `ROW_NUMBER() OVER (…)` numa cláusula `SET` (*"window functions are not
   allowed in UPDATE"*); ela precisa de uma subconsulta com `FROM`, como acima.
2. **`::bigint` arredonda, e o certo é `floor`.** O cast de `numeric` para
   `bigint` no Postgres arredonda para o mais próximo, então meio milissegundo
   para cima faria a data derivada do id ficar *à frente* do `createdAt`. No
   backfill dá na mesma (a coluna é `TIMESTAMP(3)`, o produto é inteiro), mas na
   função vale a diferença. A função também virou PL/pgSQL, só para o `floor` e
   o comentário caberem.
3. **Linha nova nasce com ~2 ms a mais que o `createdAt`.** `createdAt` é
   `CURRENT_TIMESTAMP`, que no Postgres é o instante do **início da transação**;
   `clock_timestamp()` é o de **agora**. Medido: 2 ms de diferença numa
   inserção comum. Não trocamos por `now()` de propósito — com `now()` todas as
   linhas de uma transação longa cairiam no mesmo milissegundo e passariam a
   depender só dos 4095 do incremento. **No backfill a data é exata**, porque
   ali o milissegundo vem do próprio `createdAt`.

**O teto de 4095 por milissegundo é também o limite da monotonicidade.** A
sequência cicla; passar de 4095 inserções dentro do mesmo milissegundo faria um
snowflake sair menor que o anterior. São 4 milhões de linhas por segundo — não
é o regime deste banco, e está escrito na migration para quem for mexer.

**Tabelas que ganham a coluna** (as que aparecem num payload do Discord):

| Tabela | Vira, no Discord | Observação |
|---|---|---|
| `User` | user / member.user | |
| `Guild` | guild | |
| `Channel` | channel (tipos 0,1,2,3,5) | |
| **`Category`** | **channel tipo 4** | Categoria no Discord *é canal*. `GET /channels/:id` precisa resolver os dois; o `parent_id` de um canal aponta para o snowflake da categoria. Fácil de esquecer. |
| `Message` | message | |
| `Role` | role | O `@everyone` do Discord tem `id == guild.id`; o nosso é uma linha própria. Traduzimos o `isDefault` para o snowflake da guild. |
| `CustomEmoji` | emoji | |
| `Attachment` | attachment | |
| `Sticker` | sticker | |

Mais as tabelas novas do §10 (`Application`, `ApplicationCommand`, `Interaction`),
que já nascem com a coluna.

**No Prisma:**

```prisma
model Message {
  id        String @id @default(cuid())
  snowflake BigInt @unique @default(dbgenerated("streamz_snowflake()"))
  // ...
}
```

`BigInt` do Prisma vira `bigint` do JS — **nunca** `Number`. Toda serialização
passa por `String(snowflake)`; um `JSON.stringify` de `bigint` lança
`TypeError`, o que é bom: quebra alto em vez de truncar em silêncio.

Cuidado prático que a F0 já custou uma correção: **linha crua dessas tabelas
não pode chegar a uma resposta HTTP nem a um `emit`.** `InvitesService.redeem`
devolvia `invite.guild` direto (o `emit` do mesmo método já usava
`toGuildDTO`); com a coluna nova isso vira `TypeError` no
`JSON.stringify` do Nest. Uma varredura dos 30 módulos não achou outro caso —
todo o resto passa pelos conversores de `src/common/dto.ts`.

**Helpers**, em `packages/shared/src/snowflake.ts` (novo, puro, testável):

```ts
export const EPOCH_DISCORD = 1420070400000n;
export const DESLOCAMENTO_TIMESTAMP = 22n;
export function snowflakeParaData(s: bigint): Date;
export function dataParaSnowflake(d: Date): bigint;   // para paginação before/after
export function ehSnowflake(v: string): boolean;      // /^\d{17,20}$/
```

**Custo real, medido** (Postgres 16 descartável, neste servidor, com
`prisma migrate deploy` das migrations todas):

| Volume de `Message` | Tempo |
|---|---|
| 119 (o de produção em 2026-09-08) | 1,98 s de ponta a ponta, quase todo boot do Prisma |
| 2 000 000 (pior caso inventado) | 45,5 s de ponta a ponta — 46 s no `UPDATE`, 1,1 s no índice único |

Ou seja: em produção a migration é instantânea. O `CREATE INDEX CONCURRENTLY`
só passa a valer a pena na casa do milhão.

---

## 5. D2 — A superfície REST no formato do Discord

### Montagem
Módulo novo, `apps/api/src/modules/discord-compat/`, com controllers cujo path
começa em `v10/…` — o `setGlobalPrefix("api")` faz o resto:

```
apps/api/src/modules/discord-compat/
  discord-compat.module.ts
  bot-token.guard.ts          # Authorization: Bot <token>
  rate-limit.interceptor.ts   # X-RateLimit-*
  erros.ts                    # { code, message, errors } no formato do Discord
  traducao/
    snowflakes.ts             # cuid <-> snowflake
    usuario.ts  canal.ts  servidor.ts  mensagem.ts  cargo.ts  permissoes.ts
  rest/
    gateway.controller.ts     applications.controller.ts
    users.controller.ts       guilds.controller.ts
    channels.controller.ts    messages.controller.ts
    interactions.controller.ts
```

Alias v9: um segundo `@Controller("v9/…")` que estende o de v10 sem mudar nada
(as diferenças reais entre v9 e v10 não tocam nada do que implementamos).

**Cuidado com o `ValidationPipe` global** (`whitelist: true`): ele *apaga*
campos não declarados no DTO. Um `POST /channels/:id/messages` do discord.js
manda `embeds`, `components`, `flags`, `allowed_mentions`, `message_reference`,
`tts`, `nonce`. Com whitelist, tudo isso some antes do handler e a gente nunca
descobre por quê. **Os controllers de compat usam `@Body()` cru + zod**, como já
fazem as rotas de conta (`common/zod.pipe.ts`).

### Autenticação

```
Authorization: Bot MTM4MjkxNTc3MDA1NzI0OTQ3Mg.aGVjNzUx.j3lQ_9d…
```

`BotTokenGuard`: separa o prefixo `Bot ` (obrigatório; sem ele → 401 `{"code":
0, "message": "401: Unauthorized"}`), calcula `sha256` e busca em `BotToken`.
Acha → carrega `Application` + o `User` do bot, põe em `req.bot`. Não acha →
401. Token revogado → 401.

**O guard atual (`JwtGuard`) não é tocado** e continua exigindo `Bearer`. Os
dois esquemas convivem porque o prefixo é diferente.

### Formato do token (D3)

Três partes separadas por ponto, como o do Discord:

| Parte | Conteúdo | Tamanho | Ex. |
|---|---|---|---|
| 1 | `base64url(ascii do id decimal do usuário-bot)` | 24 ou 26 | `MTM4MjkxNTc3MDA1NzI0OTQ3Mg` |
| 2 | `base64url(4 bytes BE do unix time da emissão)` | 6 | `aGVjNzU` |
| 3 | `base64url(32 bytes de crypto.randomBytes)` | 43 | — |

> O tamanho da parte 1 não é escolha: é `ceil(dígitos × 4 / 3)`. Um snowflake
> de 18 dígitos dá 24 caracteres (é o do exemplo acima, e o número que se lê
> nos fóruns); os nossos, gerados hoje, têm 19 dígitos e dão **26**. Como o
> Discord também já emite ids de 19 dígitos, é o mesmo que acontece lá.

Os tamanhos vieram de tokens reais nos doctests da lib Nostrum
(`OTY4NTU2MzQ4MzkwMzkxODU5.G49NjP.pD8PLpKp-Xx8sr-8m1DCxSPTJZdcpcJZOExc1c`):
24/6/38 hoje, 24/6/27 nos antigos — a parte 1 tem 24 caracteres porque um
snowflake de 18 dígitos em base64 dá exatamente isso, o que a nossa geração
reproduz sozinha. A parte 3 do Discord é um HMAC; a nossa é aleatória pura, e
43 caracteres (32 bytes) é mais forte que os 38 deles. **O deslocamento exato do
timestamp na parte 2 não é documentado em lugar nenhum** — é folclore de fórum —
então usamos unix cru; ninguém lê.

Por que imitar o formato, se ninguém valida? Porque **algumas ferramentas
leem**: o `_censoredToken` do discord.js corta em `.` para censurar; a Nostrum
tem um caminho rápido que casa `<<id::24, ".", ts::6, ".", hmac::binary>>`;
scanners de segredo (o TruffleHog usa
`[\w-]{24}\.[\w-]{6}\.[\w-]{27}`) e alguns forks extraem o id da parte 1 para
saber quem é o bot sem chamar a API. Manter o formato é grátis e evita uma
classe inteira de surpresa.

**Verificado no código e num teste real (§7)**: nem discord.js nem discord.py
validam o formato. O discord.js loga com `login('abc')`. Ainda assim, seguimos
o formato.

**Guardado como SHA-256, não argon2.** O token é 256 bits de aleatório puro:
não há dicionário para atacar, e argon2 a cada requisição REST de um bot de
música (que faz dezenas por minuto) seria um desastre de CPU. `@@unique` no
hash, índice usado direto.

### Endpoints por fase

**F1 — o mínimo para `client.login()` chegar em READY e responder `!ping`:**

| Método | Rota | Notas |
|---|---|---|
| GET | `/api/v10/gateway` | `{"url": "wss://api.streamz.chat/gateway"}` |
| GET | `/api/v10/gateway/bot` | `{url, shards: 1, session_start_limit:{total:1000,remaining:1000,reset_after:0,max_concurrency:1}}` |
| GET | `/api/v10/users/@me` | o usuário-bot |
| GET | `/api/v10/users/:id` | |
| GET | `/api/v10/applications/@me` | id, name, description, flags, bot, owner |
| GET | `/api/v10/oauth2/applications/@me` | **a rota que o discord.py chama no login** (§14); mesmo payload |
| GET | `/api/v10/guilds/:id` | |
| GET | `/api/v10/guilds/:id/channels` | inclui as categorias como tipo 4 |
| GET | `/api/v10/guilds/:id/members/:uid` | |
| GET | `/api/v10/guilds/:id/roles` | |
| GET | `/api/v10/channels/:id` | resolve `Channel` **ou** `Category` |
| POST | `/api/v10/channels/:id/messages` | → `MessagesService.create` + `emitToChannel` |
| GET | `/api/v10/channels/:id/messages` | `?limit&before&after&around` (cursor por snowflake) |
| GET | `/api/v10/channels/:id/messages/:mid` | |
| PATCH | `/api/v10/channels/:id/messages/:mid` | |
| DELETE | `/api/v10/channels/:id/messages/:mid` | |
| POST | `/api/v10/channels/:id/typing` | 204 |

**F2 — voz** (o bot entra em canal por gateway op 4, então o REST muda pouco):

| Método | Rota |
|---|---|
| GET | `/api/v10/guilds/:id/voice-states/:uid` |
| PATCH | `/api/v10/guilds/:id/voice-states/@me` (`self_mute`, `self_deaf`) |

**F3 — interactions:**

| Método | Rota |
|---|---|
| GET/PUT/POST/PATCH/DELETE | `/api/v10/applications/:app/commands[/:cmd]` |
| GET/PUT/POST/PATCH/DELETE | `/api/v10/applications/:app/guilds/:gid/commands[/:cmd]` |
| POST | `/api/v10/interactions/:id/:token/callback` |
| POST | `/api/v10/webhooks/:app/:token` (followup) |
| GET/PATCH/DELETE | `/api/v10/webhooks/:app/:token/messages/@original` e `/:mid` |

**F5 — o resto** (reações, membros, cargos, permissões de canal, bulk delete):

| Método | Rota |
|---|---|
| PUT/DELETE | `/api/v10/channels/:id/messages/:mid/reactions/:emoji/@me` |
| DELETE | `.../reactions/:emoji/:uid`, `.../reactions/:emoji`, `.../reactions` |
| GET | `.../reactions/:emoji` (quem reagiu) |
| GET | `/api/v10/guilds/:id/members?limit&after` |
| PATCH/PUT/DELETE | `/api/v10/guilds/:id/members/:uid[/roles/:rid]` |
| DELETE | `/api/v10/guilds/:id/members/:uid` (kick) |
| PUT/DELETE | `/api/v10/guilds/:id/bans/:uid` |
| POST/PATCH/DELETE | `/api/v10/guilds/:id/roles[/:rid]` |
| PUT/DELETE | `/api/v10/channels/:id/permissions/:oid` |
| POST | `/api/v10/channels/:id/messages/bulk-delete` |
| POST | `/api/v10/users/@me/channels` (abrir DM) |

### Rate limit — o que as libs exigem

O `@discordjs/rest` monta um bucket por rota a partir dos cabeçalhos. Se eles
não vierem, ele **não quebra** (trata como sem limite), mas perde o
enfileiramento e, num 429 sem `retry_after`, entra em retry cego. Então
mandamos os cabeçalhos, sempre, num interceptor:

```
X-RateLimit-Limit: 50
X-RateLimit-Remaining: 47
X-RateLimit-Reset: 1789045123.482      # epoch em segundos, com fração
X-RateLimit-Reset-After: 0.518          # segundos
X-RateLimit-Bucket: canal:msg:1234…     # string opaca e estável por rota+recurso
```

E no 429:

```
HTTP/1.1 429
Retry-After: 1
X-RateLimit-Scope: user        # user | global | shared
X-RateLimit-Global: false      # só quando for global
Content-Type: application/json

{"message": "You are being rate limited.", "retry_after": 0.734, "global": false}
```

`retry_after` é **float em segundos** (não milissegundos — errar isso faz o bot
dormir 700 segundos). O teto global do Discord é 50 req/s por bot; adotamos o
mesmo, reaproveitando o `@nestjs/throttler` já configurado com storage Redis,
com um `Throttler` nomeado e chave `bot:<applicationId>`.

### `Content-Type`, e por que ele é `application/json` pelado

Descoberto na prova 4 da F1, e não é preciosismo: o `json_or_text` do discord.py
compara o cabeçalho por **igualdade exata** com `application/json`. O Express
manda `application/json; charset=utf-8` — e aí **todo** corpo chega ao bot como
string, com o `login()` morrendo em `discord/user.py` com `TypeError: string
indices must be integers`, três camadas longe da causa. As rotas de compat
gravam o cabeçalho sem o parâmetro. (Não basta pôr antes do corpo: o `res.send`
do Express o reescreve com o charset depois.)

### Erros
Formato do Discord, para as libs conseguirem classificar:

```json
{ "code": 50013, "message": "Missing Permissions" }
{ "code": 10008, "message": "Unknown Message" }
{ "code": 50035, "message": "Invalid Form Body",
  "errors": { "content": { "_errors": [ { "code": "BASE_TYPE_MAX_LENGTH", "message": "…" } ] } } }
```

Um `erros.ts` com o punhado que importa: 10003 canal, 10004 guild, 10008
mensagem, 10013 usuário, 10062 interação desconhecida, 40060 interação já
respondida, 50001 sem acesso, 50013 sem permissão, 50035 corpo inválido.

### Tradução de tipos

| Nosso `ChannelType` | Discord |
|---|---|
| `TEXT` | 0 `GUILD_TEXT` |
| `DM` | 1 `DM` |
| `VOICE` | 2 `GUILD_VOICE` |
| `GROUP` | 3 `GROUP_DM` |
| `Category` (tabela) | 4 `GUILD_CATEGORY` |
| `ANNOUNCEMENT` | 5 `GUILD_ANNOUNCEMENT` |

Mensagem: `MessageType.DEFAULT` → 0; toda `SYSTEM_*` → 0 também, com o texto já
achatado (as libs não sabem renderizar nossos tipos de sistema, e mandar um
`type` que elas não conhecem faz `MessageType[x]` virar `undefined` em algumas).

Avatar: as libs montam `https://cdn.discordapp.com/avatars/{id}/{hash}.png` a
partir do campo `avatar`. O nosso avatar é uma rota (`GET /api/users/:id/avatar`).
Decisão: devolvemos `"avatar": null` e o `rest.cdn` fica documentado como
configurável (`cdn: 'https://api.streamz.chat/cdn'`) para quem quiser; a fase 1
não implementa o CDN. Para bot de música é irrelevante.

---

## 6. D8 — Permissões

As do Streamz mapeiam, uma a uma. **Eram 19 quando este documento foi
escrito; hoje são 21** — `MOVE_MEMBERS` (1<<19) e `STREAM` (1<<20) foram
acrescentadas depois, têm par no Discord (1<<24 e 1<<9) e por isso **saem da
lista de "sempre apagadas"** mais abaixo, onde ainda constavam:

| Streamz (`1 << n`) | n | Discord | bit |
|---|---|---|---|
| `VIEW_CHANNEL` | 0 | `VIEW_CHANNEL` | 1<<10 |
| `SEND_MESSAGES` | 1 | `SEND_MESSAGES` | 1<<11 |
| `MANAGE_MESSAGES` | 2 | `MANAGE_MESSAGES` | 1<<13 |
| `MANAGE_CHANNELS` | 3 | `MANAGE_CHANNELS` | 1<<4 |
| `MANAGE_ROLES` | 4 | `MANAGE_ROLES` | 1<<28 |
| `KICK_MEMBERS` | 5 | `KICK_MEMBERS` | 1<<1 |
| `BAN_MEMBERS` | 6 | `BAN_MEMBERS` | 1<<2 |
| `MANAGE_GUILD` | 7 | `MANAGE_GUILD` | 1<<5 |
| `CREATE_INVITE` | 8 | `CREATE_INSTANT_INVITE` | 1<<0 |
| `ATTACH_FILES` | 9 | `ATTACH_FILES` | 1<<15 |
| `ADD_REACTIONS` | 10 | `ADD_REACTIONS` | 1<<6 |
| `MENTION_EVERYONE` | 11 | `MENTION_EVERYONE` | 1<<17 |
| `CONNECT` | 12 | `CONNECT` | 1<<20 |
| `SPEAK` | 13 | `SPEAK` | 1<<21 |
| `MUTE_MEMBERS` | 14 | `MUTE_MEMBERS` | 1<<22 |
| `MODERATE_MEMBERS` | 15 | `MODERATE_MEMBERS` | 1<<40 |
| `MANAGE_EMOJIS` | 16 | `MANAGE_GUILD_EXPRESSIONS` | 1<<30 |
| `VIEW_AUDIT_LOG` | 17 | `VIEW_AUDIT_LOG` | 1<<7 |
| `ADMINISTRATOR` | 18 | `ADMINISTRATOR` | 1<<3 |
| `MOVE_MEMBERS` | 19 | `MOVE_MEMBERS` | 1<<24 |
| `STREAM` | 20 | `STREAM` | 1<<9 |

### O que o Discord tem e nós não

Um bot que lê `permissions` e vê o bit apagado **desiste antes de tentar** —
o `@discordjs/voice` checa `CONNECT`/`SPEAK`, e vários bots de música checam
`READ_MESSAGE_HISTORY` e `EMBED_LINKS` antes de responder. Por isso a saída
não é "zerar o que não existe":

**Sempre ligadas na tradução Streamz→Discord** (comportamento real do Streamz:
essas coisas simplesmente são permitidas):

`READ_MESSAGE_HISTORY` (1<<16) · `EMBED_LINKS` (1<<14) ·
`USE_EXTERNAL_EMOJIS` (1<<18) · `USE_EXTERNAL_STICKERS` (1<<37) ·
`USE_APPLICATION_COMMANDS` (1<<31) · `USE_VAD` (1<<25) ·
`CHANGE_NICKNAME` (1<<26) · `SEND_POLLS` (1<<49) — derivada de `SEND_MESSAGES` ·
`USE_SOUNDBOARD` (1<<42) — temos soundboard.

**Sempre apagadas** (a funcionalidade não existe; um bot que a peça vai receber
501 do REST, e é melhor que ele saiba antes):

`PRIORITY_SPEAKER` · `DEAFEN_MEMBERS` · `MANAGE_NICKNAMES` · `MANAGE_WEBHOOKS` (até F5) · `VIEW_GUILD_INSIGHTS` ·
`REQUEST_TO_SPEAK` · `MANAGE_EVENTS` / `CREATE_EVENTS` · `MANAGE_THREADS` ·
`CREATE_PUBLIC_THREADS` / `CREATE_PRIVATE_THREADS` / `SEND_MESSAGES_IN_THREADS` ·
`USE_EMBEDDED_ACTIVITIES` · `VIEW_CREATOR_MONETIZATION_ANALYTICS` ·
`CREATE_GUILD_EXPRESSIONS` · `USE_EXTERNAL_SOUNDS` · `SEND_VOICE_MESSAGES` ·
`SET_VOICE_CHANNEL_STATUS` · `USE_EXTERNAL_APPS` · `PIN_MESSAGES` ·
`BYPASS_SLOWMODE` · `SEND_TTS_MESSAGES` · `AUTO_MODERATION_*`.

**Na direção Discord→Streamz** (a UI de "Adicionar ao servidor" e o
`PATCH /roles`): só os 21 bits com par são considerados; o resto é descartado em
silêncio, e o `MANAGE_THREADS` etc. nunca vira nada.

`packages/shared/src/permissoes-discord.ts` (novo, puro, testável):

```ts
export function paraBitfieldDoDiscord(bits: number): bigint;
export function doBitfieldDoDiscord(bits: bigint): number;
```

Serializado sempre como **string decimal** (`"137411140374081"`), nunca number.

---

## 7. D4 — O gateway compatível

### Onde vive
`ws` (dependência nova de `apps/api`) com `noServer: true`, plugado no
`'upgrade'` do mesmo servidor HTTP do Nest, filtrando `pathname === '/gateway'`.
O Socket.IO continua em `/socket.io` sem saber que existe outro.

Traefik roteia por `Host` apenas (`Host(api.streamz.chat)` → `api:3333`), então
**nenhuma mudança em `/opt/stack/traefik` é necessária** — que é bom, porque
mexer lá é bloqueado.

> Atenção conhecida: o engine.io registra o próprio `'upgrade'` e, com
> `destroyUpgrade` (padrão), fecha depois de ~1 s um socket que ninguém
> assumiu. Como assumimos na hora, não há corrida. Se aparecer, a saída é
> `destroyUpgrade: false` no `IoAdapter` — e a saída de emergência é o gateway
> compat num processo próprio, com um router Traefik nosso por `Host`.

`GET /api/v10/gateway/bot` devolve `wss://api.streamz.chat/gateway`. As libs
acrescentam a query (`?v=10&encoding=json[&compress=…]`) sozinhas.

### Opcodes (nós só implementamos o que importa)

| Op | Nome | Direção | Nós |
|---|---|---|---|
| 0 | Dispatch | ← | sim |
| 1 | Heartbeat | ↔ | sim (aceita e pode pedir) |
| 2 | Identify | → | sim |
| 3 | Presence Update | → | aceita e ignora |
| 4 | **Voice State Update** | → | **sim — é a porta de entrada da voz** |
| 6 | Resume | → | sim |
| 7 | Reconnect | ← | sim |
| 8 | Request Guild Members | → | F5 |
| 9 | Invalid Session | ← | sim |
| 10 | Hello | ← | sim |
| 11 | Heartbeat ACK | ← | sim |

### O aperto de mão

```
bot                                    streamz
 │  GET /api/v10/gateway/bot  (Bot <token>)     │
 │ ────────────────────────────────────────────►│
 │ ◄──────── {url:"wss://api.streamz.chat/gateway", shards:1, …}
 │                                              │
 │  WS CONNECT /gateway?v=10&encoding=json      │
 │ ────────────────────────────────────────────►│
 │ ◄────────── op 10 HELLO {heartbeat_interval:41250}
 │                                              │
 │  op 2 IDENTIFY {token,intents,properties,shard:[0,1]}
 │ ────────────────────────────────────────────►│
 │ ◄────────── op 11 HEARTBEAT_ACK (a cada op 1)
 │ ◄────────── op 0 READY  {v,user,guilds:[{id,unavailable:true}…],
 │                          session_id, resume_gateway_url, shard, application}
 │ ◄────────── op 0 GUILD_CREATE (um por servidor, completo)
```

**READY**: `guilds` sai com `unavailable: true` e o `GUILD_CREATE` completo vem
logo atrás — é o que o discord.js espera para resolver a promessa de
`client.once('ready')`. Se mandarmos as guilds completas no READY sem
`GUILD_CREATE`, o `WebSocketShard` fica preso esperando (`waitForGuilds`).

**GUILD_CREATE** precisa ser gordo, porque é dele que o cache do bot nasce:
`id, name, icon:null, owner_id, roles[], channels[]` (com as categorias como
tipo 4), `members[]` (nosso servidor é pequeno; mandamos todos),
`voice_states[]` (essencial para o bot de música saber quem está no canal),
`member_count`, `unavailable:false`, `emojis[]`, `features:[]`,
`premium_tier:0`, `nsfw_level:0`, `system_channel_id`, `rules_channel_id`,
`afk_channel_id:null`, `afk_timeout:300`, `verification_level:0`,
`default_message_notifications:0`, `explicit_content_filter:0`, `mfa_level:0`,
`stickers:[]`, `guild_scheduled_events:[]`, `threads:[]`, `stage_instances:[]`.
Campo obrigatório faltando quebra libs tipadas — e **aconteceu**: canal de
voz sem `bitrate` e `user_limit` faz o `VocalGuildChannel._update` do
discord.py levantar `KeyError`, o que derruba o `GUILD_CREATE` inteiro. O bot
conecta, não dá erro, e o `ready` nunca dispara. Os obrigatórios que a F1
mediu, lendo a lib: canal de texto e categoria precisam de `name` e `position`;
canal de voz, também de `bitrate` e `user_limit`; membro, de `user`, `roles`,
`nick`, `pending` e `flags`; usuário, de `id`, `username`, `discriminator` e
`avatar`.

**RESUME**: `{token, session_id, seq}` → replay do buffer da sessão (últimos
~500 dispatches em memória, TTL 3 min) e `RESUMED`. Se a sessão não existe mais
→ op 9 `INVALID_SESSION` com `d: false` (não resumível), e a lib reidentifica.

**Sharding**: sempre `shards: 1`. Se o `IDENTIFY` vier com `shard: [n, m]` e
`m > 1`, respondemos `4010 Invalid shard` — melhor um erro claro que um bot
metade conectado.

### Compressão — dá para não suportar, com uma armadilha

| Lib | Pede compressão? | Se mandarmos texto puro? |
|---|---|---|
| discord.js / `@discordjs/ws` | **Depende do que está instalado.** `WebSocketManager.js` faz `try { zlib = require('zlib-sync') } catch {}` e define `compression: zlib ? ZlibStream : null`. O `zlib-sync` **não** é dependência (nem opcional) do discord.js 14.27.0, então o padrão de uma instalação limpa é **sem compressão**. | funciona |
| discord.py | **Sim**, `compress=True` é o padrão e ele acrescenta `compress=zlib-stream` (ou `zstd-stream` se tiver `zstandard`) | **funciona mesmo assim**: em `DiscordWebSocket.received_message` a descompressão só acontece `if type(msg) is bytes`. Quadro de texto vai direto para `json.loads`. |

**A armadilha, e ela é real:** se o bot tiver `zlib-sync` instalado (vários
projetos põem "para performance"), o `@discordjs/ws` **1.x** não só pede
`compress=zlib-stream` na query como, se a biblioteca sumir depois, cai para
`"compress": true` **dentro do IDENTIFY** — que é compressão *por payload*, e
quebra um servidor que só sabe texto. (No `@discordjs/ws` 2.x ele faz
`params.delete('compress')` e desliga de verdade.)

Decisão: **na F1 ignoramos o parâmetro `compress` e mandamos sempre quadro de
texto**, e o `zlib-stream` (deflate com `Z_SYNC_FLUSH`, ~20 linhas em Node)
entra **na F2**, não na F5 — é barato e tira um "por que não conecta" da mesa.
Se o `IDENTIFY` vier com `compress: true`, respondemos texto assim mesmo e
registramos um aviso: o cliente aceita, porque a compressão por payload é
opcional por mensagem no protocolo. `zstd-stream` e `encoding=etf`: **nunca** —
quem pedir `etf` leva close 4000 com a razão.

### Prova de que a casca é fina o bastante

Rodamos `discord.js@14.27.0` em `node:22` contra um servidor HTTP+WS de ~80
linhas (nada além de `GET /myapi/v10/gateway/bot`, `HELLO`, `HEARTBEAT_ACK` e um
`READY` de mentira), com `login('abc')` — um token de três letras:

```
[srv] HTTP GET /myapi/v10/gateway/bot   auth="Bot abc"
[djs] [WS => Shard 0] Connecting to ws://127.0.0.1:8787?v=10&encoding=json
[djs] [WS => Shard 0] Identifying ... compression: none
[srv] WS recv op=2 {"token":"abc","properties":{...},"intents":1,
                    "compress":false,"shard":[0,1],"large_threshold":50}
=== RESULT (ready): LOGGED IN with fake token. user=fakebot
```

Isto é o valor da F1 medido: **o `client.login()` chega a `ready` sem nada além
de uma rota e quatro opcodes.** O `TokenInvalid` do discord.js só é lançado em
três lugares — token falsy ou não-string em `login()`, e **HTTP 401** em
`fetchGatewayInformation()` e em `Util.fetchRecommendedShardCount()`. Nunca por
formato.

Detalhes que decorrem disso e viram requisito:

- O handler de READY acessa `d.user`, `d.guilds` (itera) e `d.application`
  (`new ClientApplication(client, data.application)`). **Os três precisam
  existir** ou o login estoura com `TypeError` dentro da lib.
- Temos orçamento de tempo: `handshakeTimeout: 30_000`, `helloTimeout: 60_000`,
  `readyTimeout: 15_000`. O `GUILD_CREATE` de todos os servidores tem que caber
  em 15 s depois do READY.
- Close codes que a lib trata como irrecuperáveis (não reconecta):
  **4004** (token inválido), **4010–4014** (shard/intent inválidos). Use-os com
  precisão — um 4004 acidental faz o bot desistir de vez.
- **Uma URL escapa do `rest.api`**: `Util.fetchRecommendedShardCount()` usa
  `RouteBases.api` do `discord-api-types`, congelado em `https://discord.com/api/v10`.
  Ela só é chamada pelo `ShardingManager#spawn` com `totalShards: 'auto'`. Não
  está no caminho de `client.login()`, mas **quem usa `ShardingManager` não vai
  funcionar** — mais um motivo para o §13 dizer "1 shard, ponto".

### Intents

Aceitamos o valor, guardamos na sessão, e **filtramos o dispatch por ele** —
não porque precisamos economizar, mas porque um bot que não pediu
`GUILD_MESSAGES` e recebe `MESSAGE_CREATE` acaba processando comando que não
deveria. Nenhum intent é privilegiado aqui: não há portal de aprovação, e o
`MESSAGE_CONTENT` (1<<15) é **sempre concedido** — sem ele nenhum bot de
prefixo (`!play`) funciona, e a razão da restrição no Discord (escala,
privacidade de milhões) não existe numa instância própria. Isso é uma diferença
declarada: no Streamz, `content` vem preenchido mesmo sem o intent, e o bot que
o pediu recebe igual.

| Intent | Bit | Eventos que liberamos |
|---|---|---|
| `GUILDS` | 1<<0 | `GUILD_CREATE/UPDATE/DELETE`, `CHANNEL_*`, `GUILD_ROLE_*` |
| `GUILD_MEMBERS` | 1<<1 | `GUILD_MEMBER_ADD/UPDATE/REMOVE` |
| `GUILD_MODERATION` | 1<<2 | `GUILD_BAN_ADD/REMOVE` |
| `GUILD_EXPRESSIONS` | 1<<3 | `GUILD_EMOJIS_UPDATE`, `GUILD_STICKERS_UPDATE` |
| `GUILD_VOICE_STATES` | 1<<7 | `VOICE_STATE_UPDATE` |
| `GUILD_PRESENCES` | 1<<8 | `PRESENCE_UPDATE` |
| `GUILD_MESSAGES` | 1<<9 | `MESSAGE_CREATE/UPDATE/DELETE/DELETE_BULK` em canal |
| `GUILD_MESSAGE_REACTIONS` | 1<<10 | `MESSAGE_REACTION_ADD/REMOVE` |
| `GUILD_MESSAGE_TYPING` | 1<<11 | `TYPING_START` |
| `DIRECT_MESSAGES` | 1<<12 | os mesmos, em DM |
| `MESSAGE_CONTENT` | 1<<15 | (concedido sempre) |

`VOICE_SERVER_UPDATE` e `INTERACTION_CREATE` **não são filtrados por intent**
no Discord, e aqui também não.

### Como isso se liga ao tempo real de hoje

A regra é: **o gateway compat não inventa evento — ele assina os mesmos que o
web recebe e traduz.** O caminho mais barato e o menos acoplado é entrar como
mais um cliente do Socket.IO, do lado de dentro:

> **Correção da F1:** o diagrama abaixo dizia `MessagesService.create()` no
> topo. **Ele não emite.** Quem emitia era o handler do `ChatGateway`, direto no
> `this.server` do Socket.IO, sem passar pelo `RealtimeService` — e por isso a
> mensagem escrita no navegador não chegava ao bot. A F1 passou as seis
> emissões de mensagem do `ChatGateway` para o `RealtimeService`; o `typing`
> continua em `client.to` (quem digita não pode receber o próprio "está
> digitando") e avisa a ponte por `notificarOuvintes`.

```
ChatGateway.onMessage() / a casca REST de compat
        │
        ├─► RealtimeService.emitToChannel("channel:<id>", "message.new", MessageDTO)
        │        │
        │        ├─► Socket.IO ──► navegador (nada muda)
        │        │
        │        └─► CompatBridgeListener ──► para cada sessão de bot com acesso ao canal:
        │                                     op 0 MESSAGE_CREATE (payload traduzido)
```

Duas implementações possíveis para o `CompatBridgeListener`:

- **(a) Um `Server.of("/").adapter` sniffando** — frágil.
- **(b) `RealtimeService` ganha `onEvent(cb)`**, um único método novo que
  registra ouvintes locais chamados junto com o `emit`. ~15 linhas, sem
  dependência circular, funciona com e sem Redis, e é testável. **É esta.**

```ts
// realtime.service.ts — acréscimo
private readonly ouvintes: Array<(alvo: Alvo, evento: string, dado: unknown) => void> = [];
onEvent(cb: (alvo: Alvo, evento: string, dado: unknown) => void) { this.ouvintes.push(cb); }
```

> **Ressalva de multi-instância, honesta:** os ouvintes locais só veem o que
> *aquela* instância emitiu. Hoje a API roda em um contêiner só, então não é um
> problema. Com N instâncias, uma sessão de bot na instância A não veria a
> mensagem criada na instância B. A saída, quando chegar a hora, é o
> `CompatBridgeListener` também escutar um canal Redis pub/sub próprio
> (`streamz:compat`) publicado no mesmo `emit`. Está fora de escopo agora e
> registrado como dívida.

### Dispatches, por fase

| Fase | Evento | Fonte interna |
|---|---|---|
| F1 | `READY`, `GUILD_CREATE`, `RESUMED` | montado do banco |
| F1 | `MESSAGE_CREATE` / `_UPDATE` / `_DELETE` | `message.new` / `.updated` / `.deleted` |
| F1 | `TYPING_START` | `typing` |
| F1 | `CHANNEL_CREATE/UPDATE/DELETE` | `channel.*` |
| F1 | `GUILD_ROLE_CREATE/UPDATE/DELETE` | `role.*` |
| F1 | `GUILD_MEMBER_ADD/REMOVE/UPDATE` | `member.joined/left/updated` |
| **F2** | **`VOICE_STATE_UPDATE`** | `voice.state` + a resposta ao op 4 do próprio bot |
| **F2** | **`VOICE_SERVER_UPDATE`** | emitido por nós logo após o op 4 |
| F3 | `INTERACTION_CREATE` | `InteractionsService` |
| F5 | `MESSAGE_REACTION_ADD/REMOVE` | derivado de `message.updated` (ver abaixo) |
| F5 | `PRESENCE_UPDATE`, `GUILD_BAN_*`, `MESSAGE_DELETE_BULK`, `GUILD_EMOJIS_UPDATE` | `presence.update`, `messages.bulkDeleted`, `emoji.updated` |

> **Reação é o ponto feio.** Hoje o Streamz não tem evento granular de reação:
> `reaction.add` no WS resulta em **`message.updated` com a mensagem inteira**.
> Para emitir `MESSAGE_REACTION_ADD` (que carrega `user_id` e `emoji`)
> precisamos ou (i) diferenciar o estado anterior do novo dentro do
> `CompatBridgeListener` — caro e sujeito a corrida — ou (ii) acrescentar um
> evento interno `reaction.added`/`reaction.removed` no `MessagesService`, que
> o web pode ignorar. **(ii)**, na F5, e é a única mudança no contrato existente
> que este plano propõe.

---

## 8. D5 — Voz: a ponte (o núcleo do pedido)

### O que um bot de música realmente faz

```
1. bot → gateway principal: op 4 UPDATE_VOICE_STATE {guild_id, channel_id, self_mute:false, self_deaf:true}
2. gateway → bot: VOICE_STATE_UPDATE  (do próprio bot; dá o session_id)
3. gateway → bot: VOICE_SERVER_UPDATE {token, guild_id, endpoint}
4. bot (ou o Lavalink, a quem ele repassa os três valores) conecta em
   wss://<endpoint>/?v=8
5. ← op 8 HELLO {heartbeat_interval}
   → op 0 IDENTIFY {server_id, user_id, session_id, token}
   ← op 2 READY {ssrc, ip, port, modes}
   → UDP: pacote de descoberta de IP (74 bytes) para ip:port
   ← UDP: resposta com o IP/porta públicos do bot
   → op 1 SELECT_PROTOCOL {protocol:"udp", data:{address, port, mode}}
   ← op 4 SESSION_DESCRIPTION {mode, secret_key:[32 bytes]}
   → op 5 SPEAKING {speaking:1, delay:0, ssrc}
6. bot → UDP: RTP a cada 20 ms, payload Opus cifrado com a secret_key
```

O bot **nunca decodifica** o áudio: o Lavalink/lavaplayer já entrega quadros
Opus de 20 ms a 48 kHz estéreo, que é exatamente o que o WebRTC quer. Isso é o
que torna a ponte viável sem transcodificar.

> **Correção da F2 — o `exp` de 60 s do desenho abaixo era curto demais.** O
> `@discordjs/voice` **reusa o mesmo token** quando reconecta o WS de voz
> (queda de rede, close 4015, a ponte reiniciando) sem pedir um
> `VOICE_SERVER_UPDATE` novo. Com 60 s, a primeira reconexão depois de um
> minuto de música morre com 4004 e o bot desiste de vez. O JWT vale **15
> minutos**, e o token do LiveKit lá dentro tem `ttl: "6h"` — o TTL do LiveKit
> vale na **entrada** na sala, e uma reconexão duas horas depois do `!play`
> precisa entrar de novo.

### O desenho

```
┌─────────────┐  op 4 UPDATE_VOICE_STATE        ┌──────────────────────────────┐
│ bot         │────────────────────────────────►│ API NestJS (api.streamz.chat)│
│ (discord.js)│                                  │  gateway compat  /gateway    │
│             │◄── VOICE_STATE_UPDATE ───────────│  • checa CONNECT/SPEAK       │
│             │◄── VOICE_SERVER_UPDATE ──────────│  • VoiceStateStore.join(bot) │
└──────┬──────┘    {endpoint:"voz.streamz.chat", │  • assina o token (JWT HS256)│
       │            token:"<JWT>", guild_id}     │    {sala, canal, guild, bot, │
       │                                          │     tokenLiveKit, exp:15min} │
       │ repassa endpoint/token/session_id       └──────────────┬───────────────┘
       ▼                                                        │ (nada mais)
┌─────────────┐                                                 │
│  Lavalink   │  wss://voz.streamz.chat/?v=8   ┌────────────────▼────────────┐
│  (ou o bot) │───────────────────────────────►│ ponte-voz (Go)              │
│             │                                 │  • voice gateway WS (op0-9) │
│             │  UDP → 143.95.161.17:7883      │  • UDP :7883, sessões por   │
│             │  RTP + Opus + AEAD             │    SSRC                      │
└─────────────┘                                 │  • decifra AEAD             │
                                                │  • WriteSample(opus) ───────┼──► LiveKit
                                                └─────────────────────────────┘    voice:<canal>
                                                                                     │
                                                             ┌───────────────────────┘
                                                             ▼
                                                  navegador / desktop já ouvem
                                                  (AudioRemotoHost, sem mudança)
```

### D5.1 — A linguagem: **Go**

A pergunta é "em que SDK dá para publicar Opus no LiveKit **sem transcodificar**".

| Candidato | Publica mídia? | Aceita Opus pronto? | Veredito |
|---|---|---|---|
| `livekit-server-sdk` (Node) | **não** — só assina token e chama a API do servidor | — | fora |
| `livekit` (Rust, crate 0.8) | sim, via libwebrtc | **não**: `NativeAudioSource::capture_frame` recebe `AudioFrame` de **PCM i16**. Teríamos que decodificar Opus e a libwebrtc reencodaria. | 2º lugar |
| `livekit-rtc` (Python) | sim | não — mesma `AudioSource` de PCM, mesmo binding do Rust | fora (e traz um runtime Python que o repo não tem) |
| **`server-sdk-go/v2` (Go)** | **sim, via pion** | **sim**: `lksdk.NewLocalSampleTrack(webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeOpus, ClockRate: 48000, Channels: 2})` + `WriteSample(media.Sample{Data: quadroOpus, Duration: 20ms})` — o payloader de Opus só empacota em RTP. | **escolhido** |
| LiveKit **Ingress/WHIP** | sim, e sem transcodificar (`enable_transcoding:false` é o padrão do WHIP) | sim | fora: exige subir e operar o serviço `ingress` (mais Redis, mais config) **e** a ponte ainda teria que falar WebRTC/ICE/DTLS para o WHIP — que é justamente o que o `server-sdk-go` já faz por nós. |

**Por que Go, em uma linha cada:**
1. É o único caminho onde o quadro Opus que saiu do Lavalink chega ao navegador
   **bit a bit igual** — zero perda de qualidade, zero CPU de codec.
2. Não precisamos de libopus, nem de libwebrtc, nem de clang 21: binário
   estático, imagem pequena, build de segundos.
   > **Duas correções da F2.** A imagem de build é **`golang:1.26`**, não a
   > `1.23` que este documento dizia: o `server-sdk-go/v2@v2.18.1` e o
   > `x/crypto@v0.57.0` exigem `go >= 1.26`, e com a 1.23 o `go get` recusa
   > antes de compilar qualquer coisa. E a imagem final é **alpine, não
   > `scratch`** (43,6 MB, não ~20 MB): a ponte abre **WSS** contra o LiveKit e
   > sem `ca-certificates` isso morre com `x509: certificate signed by unknown
   > authority`; o `HEALTHCHECK` também precisa de algum binário que fale HTTP.
3. A criptografia é biblioteca padrão: `crypto/aes` + `cipher.NewGCM` e
   `golang.org/x/crypto/chacha20poly1305.NewX`.
4. É um contêiner isolado: não entra no `pnpm`, não entra no typecheck, não
   entra no build do desktop, não conflita com nenhuma sessão paralela.

**O contra**, dito com todas as letras: é uma **quarta linguagem** no repo (TS,
Rust, SQL, agora Go), com CI próprio (`go vet`, `go test`, `golangci-lint`) e
uma pessoa a menos que sabe mexer. A alternativa (Rust, reaproveitando a imagem
`rust-lk` que já existe no servidor) custa um decode+encode de Opus por bot em
call — algo como 1–3% de um núcleo, e perda de qualidade real mas pequena a
128 kbps. **Se a equipe preferir uma linguagem a menos, o plano B é Rust e a
única coisa que muda é este §, não o resto do documento.**

### D5.2 — Voice Gateway (o WS)

Versão **8** (é a que o Discord recomenda e a que `@discordjs/voice` usa), mas
tolerante: o Lavalink/koe ainda fala v4 em algumas versões, e a única diferença
que nos atinge é o formato do heartbeat.

| Op | Nome | Nós |
|---|---|---|
| 0 | Identify | → recebe `{server_id, user_id, session_id, token}`; valida o JWT |
| 1 | Select Protocol | → recebe `{protocol:"udp", data:{address, port, mode}}` |
| 2 | Ready | ← `{ssrc, ip, port, modes, heartbeat_interval}` |
| 3 | Heartbeat | → aceita `d` como **int** (v4) **ou** `{t, seq_ack}` (v8) |
| 4 | Session Description | ← `{mode, secret_key:[32], dave_protocol_version:0}` |
| 5 | Speaking | → aceita e ignora (o LiveKit calcula por nível de áudio) |
| 6 | Heartbeat ACK | ← ecoa no mesmo formato que recebeu |
| 7 | Resume | → aceita; se não conhecer a sessão, fecha com 4006 |
| 8 | Hello | ← `{heartbeat_interval: 13750}` |
| 9 | Resumed | ← |
| 21–31 | DAVE / MLS (E2EE) | **não implementamos.** Anunciamos
`dave_protocol_version: 0` no `SESSION_DESCRIPTION`; o cliente que suporta DAVE
negocia para baixo e usa o transporte normal. |

`endpoint` = `voz.streamz.chat` (as libs montam `wss://<endpoint>/?v=8`, sem
caminho — por isso um host próprio, e não um path da API).

> **O que a F2 descobriu e este § não dizia: o `wss://` é fixo no código do
> cliente.** No `@discordjs/voice@0.19.2` (`dist/index.js:1424`) a URL é
> montada como `` `wss://${endpoint}?v=8` `` — o esquema **não** vem do
> `endpoint`, e o koe do Lavalink faz o mesmo. Consequências práticas: (i) a
> ponte **não** precisa falar TLS (quem termina é o Traefik, como no §D5.5), e
> (ii) **não existe apontar um bot para uma ponte em `ws://`** — qualquer
> prova local precisa de um terminador TLS com uma CA em que o cliente confie
> (`NODE_EXTRA_CA_CERTS` no Node; um truststore no Lavalink, porque a JVM não
> tem "confie em tudo"). É a primeira parede em que qualquer um esbarra, e é o
> que o `apps/api/test/discord-compat/prova-voz.sh` monta.

### D5.3 — Criptografia: os dois modos AEAD, e só eles

Os `xsalsa20_poly1305*` foram **desligados pelo Discord em 18/11/2024**. Hoje
existem dois, e a doc é explícita: *"voice gateway compatible modes will always
include `aead_xchacha20_poly1305_rtpsize`"* e *"you should prefer
`aead_aes256_gcm_rtpsize` when it is available"*.

**Anunciamos os dois** no `READY.modes`, nesta ordem:

```json
"modes": ["aead_aes256_gcm_rtpsize", "aead_xchacha20_poly1305_rtpsize"]
```

e implementamos **os dois** na ponte (é uma dúzia de linhas cada em Go). Motivo:
`@discordjs/voice` escolhe AES-GCM quando disponível; alguns bots Python só têm
xchacha (o PyNaCl não expõe AES-GCM); o Lavalink varia por versão. Anunciar só
xchacha "porque é obrigatório" funcionaria, mas obrigaria o discord.js ao
caminho mais lento sem ganho nenhum.

**Layout `_rtpsize`** (o mesmo para os dois modos):

```
 ┌───────────── 12 bytes ──────────────┐┌──── n ────┐┌─ 16 ─┐┌─ 4 ─┐
 │ 0x80 0x78 seq(2) timestamp(4) ssrc(4)││ Opus cifr.││ tag  ││nonce│
 └─────────────────────────────────────┘└───────────┘└──────┘└─────┘
   ▲ AAD = este cabeçalho em claro          ▲ ciphertext        ▲ contador
     (mais CSRCs e o preâmbulo de              + tag Poly1305/    de 32 bits
      extensão, se houver — regra do SRTP)     GCM                big-endian
```

- `secret_key`: 32 bytes, gerados por nós (`crypto/rand`) e enviados no
  `SESSION_DESCRIPTION`.
- O **nonce de 4 bytes é o sufixo do pacote** e tem que ser **removido antes de
  decifrar**. Para AES-GCM, o IV de 12 bytes é esses 4 bytes seguidos de 8 zeros
  (posicionamento: os 4 bytes primeiro, resto zero). Para XChaCha20-Poly1305, o
  nonce de 24 bytes é os 4 bytes seguidos de 20 zeros. Errar isso dá "áudio que
  não descriptografa" sem nenhuma mensagem útil — é o defeito mais provável da
  F2, e o teste unitário do §12 (F2) existe por causa dele.
- Não é preciso reordenar por `seq`: entregamos ao `WriteSample` na ordem de
  chegada e o `LocalSampleTrack` gera a própria numeração RTP.
- **O `tamanho` do preâmbulo de extensão conta palavras de 32 bits, não bytes**
  (RFC 3550 §5.3.1). Este § não dizia, e quem implementar lendo só o documento
  erra por um fator de 4 — o corpo da extensão tem `4 × tamanho` bytes.

> **O que a F2 mediu do `_rtpsize`, e o que continua aberto.** Os vetores
> gravados do lote A1 batem **byte a byte com duas implementações
> independentes**: OpenSSL (`createCipheriv('aes-256-gcm')` do Node 22, que é o
> caminho do `@discordjs/voice`) e libsodium
> (`crypto_aead_xchacha20poly1305_ietf_encrypt` do PyNaCl, o caminho do
> discord.py). Nonce de 4 bytes no sufixo, zero-padding até 12/24, tag colada no
> ciphertext e AAD = cabeçalho estão **confirmados**.
>
> O que **continua sem medição contra cliente real** é uma coisa só: **onde o
> cabeçalho termina quando há extensão** (`0x90`) — se o corpo da extensão entra
> no AAD ou vai cifrado. A ponte implementa a leitura deste § (só o preâmbulo no
> AAD) como primeira aposta e, se ela falhar num pacote com o bit X, **tenta a
> outra e anota no log qual venceu**. É o degrau 4 que responde, e a resposta
> tem que voltar para cá.

### D5.4 — UDP e descoberta de IP

Uma porta só, **7883/udp**, para todas as sessões — como o Discord faz. A
multiplexação é por **SSRC**, que **nós atribuímos** no `READY` (um contador por
processo). O primeiro pacote de uma sessão é o de descoberta:

```
offset  0-1   tipo    uint16 BE   0x0001 pedido / 0x0002 resposta
offset  2-3   tamanho uint16 BE   70
offset  4-7   ssrc    uint32 BE
offset  8-71  endereço            string terminada em NUL, 64 bytes (só na resposta)
offset 72-73  porta   uint16 BE
                                  total: 74 bytes
```

Respondemos com o IP e a porta de origem **como vistos por nós** (`ReadFromUDP`),
que é o que o NAT do bot precisa saber. A partir daí, amarramos
`ssrc → (endereço de origem, sessão)` e todo RTP daquele endereço com aquele
SSRC vai para a sala certa. Pacote com SSRC desconhecido: descartado em
silêncio (é a superfície de ataque óbvia — um `sync.Map` com teto e expiração,
mais um limite de pacotes/s por origem).

`READY.ip` é o **IP público do servidor**, não um hostname:
`PONTE_VOZ_IP_PUBLICO=143.95.161.17`. Cloudflare não entra na história — é UDP.

### D5.5 — Deploy

O Traefik **não faz UDP**, e `/opt/stack/traefik` é território bloqueado. Não
precisamos dele: publicamos a porta direto no nosso próprio compose.

`docker-compose.yml` (nosso repo):

```yaml
  ponte-voz:
    build: { context: ., dockerfile: apps/ponte-voz/Dockerfile }
    restart: unless-stopped
    environment:
      PONTE_VOZ_PORTA_WS: 8080
      PONTE_VOZ_PORTA_UDP: 7883
      PONTE_VOZ_IP_PUBLICO: ${PONTE_VOZ_IP_PUBLICO}
      PONTE_VOZ_SEGREDO: ${PONTE_VOZ_SEGREDO}     # valida o JWT do VOICE_SERVER_UPDATE
      LIVEKIT_URL: ${LIVEKIT_URL}
      API_INTERNA_URL: http://api:3333
    ports:
      - "7883:7883/udp"        # mídia do bot — direto, sem Traefik
    depends_on: [livekit]
```

`docker-compose.traefik.yml` (também nosso; só o WS passa por aqui):

```yaml
  ponte-voz:
    networks: [default, proxy]
    labels:
      - traefik.enable=true
      - traefik.http.routers.voz.rule=Host(`${VOZ_DOMAIN}`)
      - traefik.http.routers.voz.entrypoints=websecure
      - traefik.http.routers.voz.tls.certresolver=le
      - traefik.http.services.voz.loadbalancer.server.port=8080
    ports: !override
      - "7883:7883/udp"
```

> O `!override` não é opcional: sem ele o Compose **concatena** a lista de
> `ports` com a do arquivo base. É a mesma pegadinha já documentada no serviço
> do LiveKit.

**Portas — o que já está ocupado**: 80/443 (traefik), 7880/7881 TCP e **7882/udp**
(LiveKit, modo mux — a faixa 50000-60000 **não** é usada aqui e está livre),
22022 (ssh), e 3000/3333/5432/6379 só em loopback. **7883/udp está livre.**

**Ação para o usuário** (não dá para fazer daqui): registro DNS
`voz.streamz.chat` → 143.95.161.17, e abrir **7883/udp** no firewall do
sistema **e** no do provedor — exatamente como foi feito para o 7882.
Cloudflare: proxied funciona para o WSS; **cinza (DNS only) é mais seguro**,
pelo mesmo motivo do LiveKit (timeout de ocioso do proxy num WS que fica em
silêncio entre faixas).

### D5.6 — Entrar na sala do LiveKit

O bot entra como participante de identidade `bot:<snowflake>`, nome = nome da
application. O token do LiveKit é assinado **pela API** (que já tem
`LIVEKIT_API_KEY`/`SECRET` e o `VoiceService.assinarToken`) e viaja **dentro**
do JWT do `VOICE_SERVER_UPDATE.token` — assim a ponte não precisa das
credenciais do LiveKit. Grants: `roomJoin`, `canPublish: true`,
`canSubscribe: false` (bot de música não escuta), `canPublishData: false`.

Publicação, com as opções que importam para **música** (o padrão é ajustado para
fala e estraga música):

```go
track, _ := lksdk.NewLocalSampleTrack(webrtc.RTPCodecCapability{
    MimeType: webrtc.MimeTypeOpus, ClockRate: 48000, Channels: 2,
})
room.LocalParticipant.PublishTrack(track, &lksdk.TrackPublicationOptions{
    Name: "musica", Source: livekit.TrackSource_MICROPHONE,
    DisableDTX: true,   // silêncio entre faixas não pode virar buraco
    Stereo:     true,   // o Lavalink entrega 48 kHz estéreo
})
// por quadro recebido do UDP:
track.WriteSample(media.Sample{Data: opus, Duration: 20 * time.Millisecond}, nil)
```

> **Correção da F2, medida contra `server-sdk-go/v2@v2.18.1`:** o
> `lksdk.TrackPublicationOptions` **não tem o campo `Red`** que este § mandava
> usar — o código não compila com ele. Tem `Stereo`, que o documento não citava
> e que importa mais aqui. Entrar na sala é
> `room.JoinWithToken(url, token, ...ConnectOption)`. O resto do trecho (o
> `NewLocalSampleTrack` com `MimeTypeOpus` e o `WriteSample` com `Duration`)
> está certo e compila — o risco nº 2 do §15 deixou de ser "confirmado só no
> papel" no nível da API.

O `AudioSourceOptions` com cancelamento de eco / supressão de ruído / AGC
**não existe neste caminho** — mais uma vantagem do repasse: nenhum
processamento de fala toca a música.

### D5.7 — Estado de voz e a lista de membros

Quem grava é a API, no momento do op 4, usando o que já existe:

```ts
await this.voice.join(botUserId, channelId, { muted:false, deafened:true, video:false, screen:false });
```

Isso dispara `voice.state` para `guild:<id>`, e o bot aparece na coluna e no
palco do web sem uma linha de UI nova (a tag "BOT" é o §11). Sair: op 4 com
`channel_id: null` → `voice.leave`. Queda da ponte: ela avisa a API por
`POST /api/interno/ponte-voz/estado` (autenticada por `X-Ponte-Segredo`), que
chama `voice.leave`. A carência de 45 s (`VOICE_RECONNECT_GRACE_MS`) do gateway
**não se aplica ao bot** — bot que caiu, caiu.

### D5.8 — Lavalink: o que muda (nada) e o que pode dar errado

Do lado do Lavalink, **nada muda**: o bot recebe `endpoint`/`token`/`session_id`
do nosso gateway e os repassa por REST:

```http
PATCH /v4/sessions/{sessionId}/players/{guildId}
{ "voice": { "token": "<nosso JWT>", "endpoint": "voz.streamz.chat", "sessionId": "<session_id>" } }
```

O Lavalink então abre o WS de voz e o UDP sozinho, contra a nossa ponte. Ele não
valida domínio nem certificado do Discord.

Riscos concretos, na ordem de probabilidade:

1. **Tamanho do `token`.** Um JWT com token do LiveKit dentro pode passar de
   1 KB. Se alguma implementação truncar, a saída é o token virar um
   **ticket opaco de 32 bytes** e a ponte buscar os dados na API
   (`GET /api/interno/ponte-voz/ticket/:t`). Barato e à prova.
   > **Medido na F2: 1029 bytes**, e isso já com um token de LiveKit de
   > brinquedo (o de produção é maior). O `@discordjs/voice` engoliu sem
   > reclamar. **Passa de 1 KB, então este risco continua de pé para o
   > Lavalink** — e o ticket opaco fica como a primeira dívida da fase, a ser
   > paga no dia em que alguém vir o token truncado.
2. **Versão do voice gateway.** Alguma versão do koe/udpqueue conecta em `v=4`
   e manda heartbeat como int. Já previsto (aceitar as duas formas).
3. **`endpoint` com porta.** Algumas libs cortam `:80`/`:443` do endpoint;
   mandamos sem porta.
4. **Modo de criptografia.** Se a versão do Lavalink em uso só souber
   `xsalsa20_poly1305` (desligado pelo Discord há dois anos), ele nem conecta ao
   Discord hoje — então é problema dele, e a mensagem de erro precisa ser clara
   no nosso log: "modo não suportado: X; atualize o Lavalink".

---

## 9. D6 — Interactions (slash commands)

**Pelo gateway, nunca por webhook.** O modo webhook exige que o Streamz faça uma
requisição HTTP *para o bot*, com assinatura Ed25519 e um endpoint público — mais
peças, mais coisa para configurar, e o dono do bot passaria a precisar de uma URL
acessível. Pelo gateway o bot já está conectado.

### Registro

```
PUT /api/v10/applications/{app}/commands                    (global)
PUT /api/v10/applications/{app}/guilds/{gid}/commands       (por servidor)
```

Sobrescrita em bloco (é o que o `deploy-commands.js` de todo tutorial faz).
Guardamos em `ApplicationCommand`. Suportamos `type: 1` (CHAT_INPUT) e as
opções de tipo 3 (string), 4 (integer), 5 (boolean), 6 (user), 7 (channel),
8 (role), 10 (number). Subcomandos (1 e 2): F5. Autocomplete de opção
(`type: 8` de callback): F5.

### Execução

```
usuário digita "/play never gonna give you up" no composer
        │
        ▼  POST /api/interactions  (rota interna, JwtGuard — não é a compat)
   InteractionsService
     • acha o ApplicationCommand pelo (guild, nome)
     • checa se a application está instalada no servidor (GuildApplication)
     • cria Interaction { snowflake, token(random 64), expiraEm: agora+15min }
     • dispatch INTERACTION_CREATE na sessão de gateway do bot
        │
        ▼
   bot responde em até 3 s:
   POST /api/v10/interactions/{id}/{token}/callback
     { "type": 4, "data": { "content": "Tocando **Never Gonna…**" } }
        │
        ▼  MessagesService.create(autor = usuário-bot) → message.new → todo mundo vê
```

Tipos de callback que implementamos na F3: **4** `CHANNEL_MESSAGE_WITH_SOURCE`
e **5** `DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE` (o "pensando…", indispensável
para bot de música, que leva mais de 3 s para resolver um link). Tipos 6/7
(update de componente), 8 (autocomplete) e 9 (modal): F5.

Followups, na mesma fase:

```
POST   /api/v10/webhooks/{app}/{token}                    → mensagem nova
PATCH  /api/v10/webhooks/{app}/{token}/messages/@original  → edita o "pensando…"
DELETE /api/v10/webhooks/{app}/{token}/messages/@original
```

O `token` da interação é o **único** credencial dessas rotas (é assim no
Discord): 64 bytes aleatórios, válido 15 minutos, ligado a uma linha
`Interaction`. Depois disso → 404 `10062 Unknown interaction`.

Mensagem efêmera (`flags: 64`): a F3 **aceita a flag e entrega a mensagem
normal**, com um aviso no log. Efêmera de verdade exigiria "mensagem que só uma
pessoa vê", que não existe no Streamz e é uma feature de produto, não de
compatibilidade — fica para quando alguém pedir.

### O `/` no cliente

Já está pronto (`lib/composer-autocomplete.ts` detecta `/` na posição 0;
`Composer.tsx:997` chama `buscarComandos`). O que falta:

1. `stores/comandos-de-app.ts` — carrega `GET /api/guilds/:id/application-commands`
   ao trocar de servidor e escuta um evento novo `application.commandsUpdated`.
2. Em `Composer.tsx:997-1005`, concatenar esses comandos aos de
   `COMANDOS_BARRA`, com `icone` = avatar do bot e `detalhe` = descrição.
3. Em `lib/comandos-barra.ts`, um `ResultadoComando` novo — `{ tipo: "interacao",
   commandId, opcoes }` — e o ramo correspondente em `Composer.tsx:315-333`.
4. `MessageItem` mostra "usou /play" acima da resposta do bot
   (`interaction` no DTO da mensagem). Opcional; fica bonito.

Nada disso mexe em `detectarGatilho` nem em `Autocomplete.tsx`.

---

## 10. Modelo de dados

```prisma
// ── j-bots ───────────────────────────────────────────────────

/// Uma "application" do portal: o registro do bot, dono e identidade.
model Application {
  id          String   @id @default(cuid())
  snowflake   BigInt   @unique @default(dbgenerated("streamz_snowflake()"))
  ownerId     String
  name        String
  description String?
  /// chave do ícone no storage; a URL é derivada na hora (padrão do repo)
  iconKey     String?
  /// aparece em "Descobrir aplicativos". Opt-in do dono, como o `discoverable`.
  publico     Boolean  @default(false)
  /// bitfield de `Permission` que a tela de instalação sugere por padrão
  permissoesPadrao Int @default(0)
  /// o usuário-bot: um User com isBot = true, criado junto e sem senha utilizável
  botUserId   String   @unique
  createdAt   DateTime @default(now())

  owner    User        @relation("AppOwner", fields: [ownerId], references: [id], onDelete: Cascade)
  botUser  User        @relation("AppBot",   fields: [botUserId], references: [id], onDelete: Cascade)
  tokens   BotToken[]
  commands ApplicationCommand[]
  installs GuildApplication[]
  interactions Interaction[]

  @@index([ownerId])
  @@index([publico])
}

/// Token do bot. Guardamos só o SHA-256 — quem lê o banco não vira o bot.
/// Regenerar cria uma linha nova e revoga a antiga (nunca apaga: auditoria).
model BotToken {
  id            String    @id @default(cuid())
  applicationId String
  /// sha256 do token em hex. Não é argon2 de propósito: é lido a cada request.
  tokenHash     String    @unique
  /// os 8 primeiros caracteres do token, para a UI dizer "token MTU0Njkz…"
  ///
  /// Atenção ao que este prefixo é e ao que não é: os 8 primeiros caracteres
  /// caem todos dentro da parte 1, que é o id do usuário-bot — ou seja, ele
  /// identifica **o bot**, não o token, e não muda quando se regenera. Serve
  /// para o dono reconhecer de quem é um token achado num arquivo de
  /// configuração. Quem distingue um token do outro na tela é o `createdAt`.
  prefixo       String
  createdAt     DateTime  @default(now())
  lastUsedAt    DateTime?
  revokedAt     DateTime?

  application Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)

  @@index([applicationId])
}

/// Instalação de uma application num servidor: é o que autoriza o bot ali.
/// Apagar = "remover o app do servidor" (o membro-bot sai junto).
model GuildApplication {
  id            String   @id @default(cuid())
  guildId       String
  applicationId String
  /// quem instalou (precisou de MANAGE_GUILD)
  installedById String
  /// bitfield de `Permission` concedido na instalação; vira o cargo gerenciado
  permissions   Int      @default(0)
  /// o cargo criado para o bot (apagado com a instalação)
  roleId        String?
  createdAt     DateTime @default(now())

  guild       Guild       @relation(fields: [guildId], references: [id], onDelete: Cascade)
  application Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)

  @@unique([guildId, applicationId])
  @@index([applicationId])
}

/// Comando de barra. `guildId` null = global (vale em todo servidor instalado).
model ApplicationCommand {
  id            String   @id @default(cuid())
  snowflake     BigInt   @unique @default(dbgenerated("streamz_snowflake()"))
  applicationId String
  guildId       String?
  name          String
  description   String
  /// 1 CHAT_INPUT (só este na F3), 2 USER, 3 MESSAGE
  type          Int      @default(1)
  /// array de opções no formato do Discord, como veio no PUT
  options       Json     @default("[]")
  /// bitfield do Discord exigido de quem usa; null = todo mundo
  defaultMemberPermissions String?
  createdAt     DateTime @default(now())

  application Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)

  @@unique([applicationId, guildId, name])
  @@index([guildId])
}

/// Uma interação em voo. Some depois de expirar (faxina do MaintenanceService).
model Interaction {
  id            String   @id @default(cuid())
  snowflake     BigInt   @unique @default(dbgenerated("streamz_snowflake()"))
  applicationId String
  /// 64 bytes em base64url; é o único credencial do callback e dos followups
  token         String   @unique
  userId        String
  channelId     String
  guildId       String?
  commandId     String?
  /// o `data` do INTERACTION_CREATE, como foi enviado
  data          Json
  /// mensagem criada pelo callback tipo 4/5 — alvo do @original
  responseMessageId String?
  respondedAt   DateTime?
  createdAt     DateTime @default(now())
  /// createdAt + 15 min
  expiresAt     DateTime

  application Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)

  @@index([expiresAt])
  @@index([applicationId, createdAt])
}
```

E, no `User`:

```prisma
model User {
  // ...
  /// Conta de bot: não faz login, não recebe e-mail, aparece com a tag BOT.
  isBot         Boolean @default(false)
  /// a application de que este usuário é o bot (só quando isBot)
  botApplication Application? @relation("AppBot")
  ownedApps      Application[] @relation("AppOwner")
}
```

**Migrations, na ordem:**

| # | Nome | Conteúdo |
|---|---|---|
| 1 | `..._snowflakes` | função + sequence + coluna/backfill/índice nas 9 tabelas (§4) |
| 2 | `..._bots_identidade` | `User.isBot`, `Application`, `BotToken` |
| 3 | `..._bots_instalacao` | `GuildApplication` |
| 4 | `..._bots_comandos` | `ApplicationCommand`, `Interaction` |

Separadas de propósito: a 1 é a arriscada (backfill) e roda sozinha; as outras
são aditivas puras e voltam com um `DROP`.

`packages/shared/src/aplicativos.ts` (novo) leva os tipos do contrato:
`AppView`, `AppDetalhe`, `AppCriado`, `TokenCriado` e o schema zod de criação
na F0; `AppInstalacao` e `ComandoDeApp` entram junto com as tabelas deles
(migrations 3 e 4), para o contrato não descrever o que o banco não tem. E
`PublicUser` ganha `bot?: boolean` — **é a única mudança em contrato existente
nesta parte do plano** (entrou já na F0, com o `PublicUser` da API sempre
preenchendo `bot: false` por padrão), e como o `dist` é o que a api/web
consomem, lembre do `pnpm --filter @streamz/shared build` antes do typecheck.

---

## 11. D7 — Descobrir aplicativos e portal do desenvolvedor

### Descobrir aplicativos

O "Descobrir servidores" foi **removido de propósito** e continua removido — o
comentário em `GuildRail.tsx:407` diz que este é um produto onde se entra por
convite. Aplicativos são outra coisa: um catálogo do que roda **nesta**
instância. Então: **vista própria, não uma aba da descoberta de servidores.**

- **Entrada**: um `RailItem` fixo logo abaixo da divisória da rail, ícone de
  robô/peça, tooltip "Descobrir aplicativos". Um estado novo na store de UI
  (`vista: "apps"`), como Amigos já faz — não é rota (o app é uma tela só).
- **Tela**: grade de cards (ícone 80, nome, descrição de uma linha, botão
  "Adicionar ao servidor"), busca no topo, exatamente o padrão do
  `DiscoverableGuild`. `GET /api/applications/publicas?q=`.
- **"Adicionar ao servidor"**: modal com (i) `<select>` dos servidores em que
  eu tenho `MANAGE_GUILD` — a lista sai de `useCan`, e a API repete a checagem
  com `assertCanModerate(actor, guild, Permission.MANAGE_GUILD)`; (ii) a lista de
  permissões com checkbox, pré-marcada com `permissoesPadrao`, usando o
  `PERMISSION_INFO`/`PERMISSION_ORDER` que a tela de cargos já usa;
  (iii) "Autorizar". Efeito: `POST /api/applications/:id/instalar {guildId,
  permissions}` → cria `GuildApplication`, cria um `Role` gerenciado com o nome
  da app e aquelas permissões, cria o `GuildMember` do usuário-bot com esse
  cargo, emite `member.joined` e `role.created`, entra nas salas
  (`joinGuildRoom` + `joinChannelRooms`) e — se o bot estiver conectado —
  manda `GUILD_CREATE` na sessão dele.

### Portal do desenvolvedor

Uma aba nova em `components/settings/tabs.tsx` (`id: "aplicativos"`, grupo
`usuario`) — o próprio arquivo diz que aba nova é uma linha. Mais o componente
`components/settings/AplicativosTab.tsx`, a chave `"aba.aplicativos"` nos dois
dicionários de `lib/i18n.ts` e o ícone em `components/ui/icones.tsx`.

Telas:

1. **Lista** — meus aplicativos, com ícone, nome e "publicado / privado".
2. **Criar** — nome (obrigatório). Ao salvar, criamos a `Application`, o
   usuário-bot (`isBot: true`, username derivado, sem senha utilizável) e o
   primeiro `BotToken`, **mostrado uma vez** num painel de "copie agora; não
   mostramos de novo" com botão de copiar. Fechou, perdeu.
3. **Editar** — nome, descrição, ícone (mesma rota de upload do avatar,
   `UPLOAD_THROTTLE`), permissões sugeridas, e o interruptor
   **"Publicar no diretório"**.
4. **Token** — "Regenerar" com confirmação dupla ("o bot atual vai parar de
   funcionar na hora"), mostra o novo uma vez, revoga o anterior.
5. **Servidores** — onde está instalado, com "Remover".

**Nunca**, em nenhuma tela ou log: o token inteiro depois da criação. A UI
mostra `prefixo` (8 caracteres). O `StructuredLogger` da API precisa de um
redator para `Authorization` — hoje ele não loga cabeçalho, mas a rota de
criação vai devolver o token no corpo e um log de erro genérico poderia
carregá-lo.

### O membro-bot na interface

`PublicUser.bot?: boolean` no contrato, e a pílula "BOT" onde o Discord põe:

| Arquivo | Onde |
|---|---|
| `components/MemberList.tsx` | dentro de `renderMember`, no `<span>` das linhas 252-277, irmã dos selos de `OWNER`/`ADMIN`/castigo |
| `components/MessageItem.tsx` | ao lado do nome do autor |
| `components/ui/ProfilePopover.tsx`, `components/modals/UserProfileModal.tsx` | ao lado do nome |
| `components/chat/DMMemberList.tsx`, `components/voice/VoiceGrid.tsx` | idem |

Uma `<TagDeBot />` em `components/ui/` para não repetir o estilo em seis lugares.
Regras de produto que caem de graça: bot não recebe pedido de amizade, não
aparece na busca de usuários, não abre DM (F5, se pedirem).

---

## 12. Fases

Regras que valem para todas: worktree própria por fase (`git worktree add`,
nunca `checkout` no clone), verificação completa no docker antes do PR,
commits em português, PR com "como testar", ninguém mergeia sem o usuário.

### F0 — Fundação (sequencial, bloqueia tudo) — **feita**
**Entrega:** snowflakes no banco, identidade de bot, e um token que dá para
usar com `curl`. Sem UI.

| Item | Arquivos |
|---|---|
| Snowflakes | `prisma/schema.prisma`, `migrations/20260908130000_snowflakes`, `packages/shared/src/snowflake.ts` (+ `applications/snowflake.test.ts`) |
| Identidade | `migrations/20260908130100_bots_identidade`, `modules/applications/` (service + controller REST interno: criar, listar, regenerar token; `token.ts` puro) |
| Contrato | `packages/shared/src/aplicativos.ts`, `PublicUser.bot` (preenchido em `common/dto.ts`) |
| Consequência | `invites.service.ts` passou a devolver `toGuildDTO` em vez da linha crua (§4) |

**Prova:** `POST /api/applications {name:"Teste"}` devolve um token de três
partes (26/6/43); `SELECT snowflake FROM "Message" ORDER BY "createdAt" DESC
LIMIT 1` convertido com `snowflakeParaData` bate com o `createdAt` da linha —
exato nas 119 linhas do backfill, +2 ms nas inseridas pelo `DEFAULT` (o motivo
está no §4); 4095 snowflakes gerados na mesma transação saem estritamente
crescentes; typecheck e testes verdes nos três pacotes.

**Paralelizável:** não. É a fase A do modelo do §6.4 do processo — fecha o
vocabulário antes de qualquer consumo.

**Riscos:** o backfill em `Message`. Mitigação: rodar em janela, medir antes com
`SELECT count(*)`, e ter o `DROP COLUMN` pronto. Medido: 119 mensagens em
produção, e a migration inteira em 1,98 s num Postgres 16 descartável (§4).

**Esforço:** 3–5 dias.

---

### F1 — Identidade + REST mínimo + gateway mínimo
**Entrega:** um bot discord.js conecta, cacheia o servidor e responde a `!ping`.

| Lote | Arquivos | Agente |
|---|---|---|
| **A. REST compat** | `modules/discord-compat/{bot-token.guard,rate-limit.interceptor,erros}.ts`, `rest/*.controller.ts` | 1 |
| **B. Gateway compat** | `modules/discord-compat/gateway/{servidor,sessao,identify,dispatch}.ts`, `ws` no `package.json`, `main.ts` (upgrade) | 2 |
| **C. Tradução** | `modules/discord-compat/traducao/*.ts`, `packages/shared/src/permissoes-discord.ts` (+ testes) | 3 |
| **D. Ponte de eventos** | `modules/realtime/realtime.service.ts` (o `onEvent`) | 3, depois de C |

Os lotes são **disjuntos por arquivo**. O único ponto compartilhado é
`app.module.ts` (uma linha) e `main.ts` (o handler de upgrade) — o coordenador
faz esses dois no fim, e roda a verificação uma vez só, como manda o §6.4 do
processo.

**Prova, em ordem:**
1. `curl -H "Authorization: Bot <t>" https://api.streamz.chat/api/v10/users/@me` → o bot.
2. Um `Client({intents:[Guilds,GuildMessages,MessageContent], rest:{api:'https://api.streamz.chat/api',version:'10'}})`
   emite `ready` com `client.guilds.cache.size >= 1`.
3. Mandar `!ping` num canal do web → o bot responde `pong` e a resposta aparece
   no navegador **sem F5**.
4. O mesmo com discord.py (`Route.BASE`) — prova a tolerância a `compress=zlib-stream`.

**Riscos:** (a) `GUILD_CREATE` incompleto travando o `ready` — sintoma é o bot
ficar mudo sem erro; depurar com `client.on('debug')`. (b) O `ValidationPipe`
comendo campos; já previsto. (c) O `destroyUpgrade` do engine.io.

**O que os três riscos deram, na prática** (a fase foi feita; isto é o
resultado medido, não previsão):

- **(a) aconteceu**, e do jeito pior: canal de voz sem `bitrate`/`user_limit`
  fazia o `GUILD_CREATE` inteiro levantar `KeyError` dentro do discord.py. O
  bot conectava, nada no log, e o `ready` nunca vinha. Só a prova 4 pegou —
  nenhum teste unitário pegaria, porque o payload estava "certo" para o nosso
  próprio tipo.
- **(b) aconteceu como previsto** e a saída prevista funcionou (`@Body()` cru +
  zod). Há um teste de integração, com o `ValidationPipe` global ligado, que
  confere os sete campos que o discord.js manda.
- **(c) não aconteceu.** O engine.io só destrói um upgrade órfão `if
  (socket.writable && socket.bytesWritten <= 0)`, e o nosso handshake responde
  na hora. Há um teste que espera 3 s (3× o `destroyUpgradeTimeout`) e confirma
  o socket vivo. **Requisito que nasceu daí:** o handler de `'upgrade'` tem que
  ser síncrono até o `handleUpgrade` — uma consulta ao banco antes dele faria a
  conexão cair sozinha depois de um segundo, sem erro nenhum.
- **Dois riscos que não estavam na lista** e custaram mais que os três acima: o
  `Content-Type` com charset (§5) e a `DEFAULT_GATEWAY` do discord.py (§14).
  Os dois só aparecem com uma lib de verdade do outro lado — o que é o
  argumento para as quatro provas serem obrigatórias e automatizadas
  (`apps/api/test/discord-compat/prova.sh`).

**Esforço:** 8–12 dias com 3 agentes em paralelo.

---

### F2 — Voz e a ponte  ← **a fase que o usuário quer cedo**
**Entrega:** bot de música entra no canal e o som sai no navegador.

| Lote | Arquivos | Agente |
|---|---|---|
| **A. Ponte (Go)** | `apps/ponte-voz/` inteiro: `main.go`, `gateway.go` (WS op 0-9), `udp.go` (descoberta + RTP), `cripto.go` (os dois AEAD), `livekit.go`, `Dockerfile`, testes | 1 e 2 (A pode virar dois: cripto+UDP / WS+LiveKit) |
| **B. Op 4 e VOICE_SERVER_UPDATE** | `modules/discord-compat/gateway/voz.ts`, `modules/voice/voice.service.ts` (assinar o JWT da ponte) | 3 |
| **C. Deploy + `zlib-stream`** | `docker-compose.yml`, `docker-compose.traefik.yml`, `.env.example`, `gateway/compressao.ts` | 3 |

Zero sobreposição de arquivo entre A e B/C — A é um diretório novo em outra
linguagem.

**Prova, em degraus (cada um é um dia de trabalho salvo se falhar):**
1. **Unitário, primeiro:** um teste em Go que cifra um quadro conhecido com
   `aead_xchacha20_poly1305_rtpsize` e decifra de volta, e o mesmo com AES-GCM,
   com vetor gravado. **Se este teste não passar, nada adiante funciona** — e é
   o defeito mais provável da fase inteira.
2. `nc -u` manda um pacote de descoberta de 74 bytes e volta a resposta com o IP
   certo.
3. Um script Node com `@discordjs/voice` sozinho (sem bot) apontado para a ponte
   toca um `.ogg` → aparece um participante `bot:` no LiveKit
   (`lk room participants list <sala>` — o `livekit-cli list-participants` que
   este § dizia **não existe** no `livekit/livekit-cli` v2.18.6, e o nome da
   sala é **posicional**: `--room` responde "flag provided but not defined").
4. **A prova de verdade:** Lavalink v4 + um bot de ~200 linhas, `/play <link do
   YouTube>`, e **o som sai no navegador de duas pessoas na mesma call**, sem
   picote por 3 minutos. Com link do Spotify (que o discord-player converte em
   busca) para fechar o caso do usuário.

**Riscos, do pior para o menos ruim:**
- **O `_rtpsize` errado.** Nonce no lugar errado, AAD com tamanho errado,
  extensão RTP não considerada → silêncio absoluto sem log útil. Mitigado pelo
  degrau 1 e por um modo `--dump-pacote` que grava os primeiros 10 pacotes.
- **Extensão de cabeçalho RTP.** Alguns clientes mandam `0x90` em vez de `0x80`
  e um preâmbulo de extensão que **entra no AAD**. Tem que ser tratado, não
  ignorado.
- **Jitter.** `WriteSample` com `Duration: 20ms` deixa o pion cuidar do relógio;
  se o UDP chegar em rajada, a mídia acumula. Uma fila com teto (~200 ms) e
  descarte do mais antigo é a rede de segurança.
- **Firewall.** 7883/udp fechado no provedor = descoberta de IP sem resposta =
  o bot conecta o WS e nunca fala. Verificar com `nc -u` **antes** de culpar o
  código.

**Esforço:** 10–15 dias. É a maior e a mais incerta.

---

### F3 — Interactions
**Entrega:** `/play` no composer aciona o bot; ele responde.

| Lote | Arquivos |
|---|---|
| A | `modules/interactions/` (service, controller interno), migration 4 |
| B | `modules/discord-compat/rest/{applications,interactions}.controller.ts` |
| C | web: `stores/comandos-de-app.ts`, `Composer.tsx` (2 pontos), `lib/comandos-barra.ts` |

**Prova:** o `deploy-commands.js` padrão do guia do discord.js roda sem erro
contra a nossa API; `/play` aparece no autocomplete do composer com o avatar do
bot; o bot responde com `deferReply()` e depois `editReply()`, e as duas
aparecem no navegador.

**Esforço:** 6–8 dias.

---

### F4 — Diretório e portal
**Entrega:** o dono cria o app pela UI; qualquer um o adiciona ao servidor.

| Lote | Arquivos |
|---|---|
| A | `components/settings/{tabs.tsx,AplicativosTab.tsx}`, `lib/i18n.ts`, `icones.tsx` |
| B | `components/apps/{DiretorioDeApps,CardDeApp,AdicionarAoServidor}.tsx`, `GuildRail.tsx`, `stores/ui.ts` |
| C | `components/ui/TagDeBot.tsx` + os 6 pontos de render do §11 |

A e B tocam arquivos diferentes; C é mecânico e cabe num agente sozinho. O
`GuildRail.tsx` é o único disputado — quem mexe nele avisa (§2.4 do processo).

**Prova:** criar app, copiar token, apontar um bot, adicionar ao servidor,
ver a tag BOT na lista de membros. E **prints**, porque §3.3 do processo:
typecheck não pega tag torta.

**Esforço:** 6–9 dias.

---

### F5 — O resto
Reações granulares (com o evento interno novo), membros/cargos/bans/permissões
de canal no REST, `MESSAGE_REACTION_*`, `PRESENCE_UPDATE`, componentes (botões e
selects), modais, webhooks de entrada, embeds ricos, CDN de avatar no formato
do Discord, DM com bot, `Request Guild Members`, mensagem efêmera de verdade.
Sem estimativa — é uma fila, não uma fase.

---

## 13. O que não vai funcionar, e o que não vale a pena

| Item | Por quê |
|---|---|
| **Bots públicos de terceiros** (MEE6, Dyno, Carl-bot, Groovy) | Rodam na infra de quem os fez, contra `gateway.discord.gg`. Impossível, não difícil. |
| **OAuth2 do Discord** (`/oauth2/authorize`, `identify`, `guilds`, bearer de usuário) | O fluxo "Adicionar ao servidor" do Discord é uma página no `discord.com`. O nosso equivalente é a nossa própria tela (§11). Implementar `/oauth2/*` compat não serve a ninguém. |
| **Nitro, boosts, entitlements, SKUs, monetização** | Não existe e não vai existir (§6.6 do processo: "Nitro, Loja, Missões: não criar"). |
| **Threads e fóruns do Discord** (canais tipo 10, 11, 12, 15) | O nosso `Thread` é o *nome* de uma raiz de respostas dentro de um canal, não um canal. Bot que criar thread leva 501. Fórum não existe. |
| **Canais de palco** (tipo 13), eventos agendados, automod, integrações | Não existem no produto. |
| **Recepção de áudio** (sala → bot: gravar, transcrever, "ouvir") | Fora da F2 por escolha: exige o caminho inverso (subscrever no LiveKit, reencapsular em RTP, cifrar e mandar para o bot) e **bot de música só transmite**. Tecnicamente possível depois, com o mesmo processo. |
| **DAVE / E2EE** (opcodes 21-31) | Anunciamos `dave_protocol_version: 0` e os clientes negociam para baixo. Implementar MLS para uma instância própria é desproporcional. |
| **Sharding real** (>1 shard) e o `ShardingManager` | `GET /gateway/bot` sempre devolve `shards: 1`; um `IDENTIFY` com `shard:[n,m>1]` é recusado com 4010. E o `ShardingManager` do discord.js com `totalShards:'auto'` chama `Util.fetchRecommendedShardCount()`, que usa `RouteBases.api` congelado em `discord.com` e **ignora o `rest.api`** — não há como redirecionar. Bot com sharding não roda aqui, ponto. |
| **`encoding=etf`** | Só `json`. Quem pedir etf leva 4000 com a razão. |
| **`zstd-stream`** | Nunca. `zlib-stream` talvez, na F5. |
| **CDN no formato do Discord** (`cdn.discordapp.com/avatars/{id}/{hash}.png`) | O nosso avatar é uma rota autenticável, não um hash imutável. Devolvemos `avatar: null`; quem quiser configura `rest.cdn`. Irrelevante para bot de música. |
| **Stickers e emojis do Discord** | Temos os nossos; o formato de resposta é traduzido, mas emoji do Discord de outro servidor não resolve. |
| **Mensagem efêmera** (`flags: 64`) | Aceita e entregue como mensagem normal. "Só uma pessoa vê" é feature de produto. |
| **Webhooks de entrada** (`POST /webhooks/{id}/{token}` de fora) | F5. Útil para CI/alertas, não para bot. |
| **Presence rica / RPC / atividades** | Aceitamos o op 3 e ignoramos. |
| **Verificação de bot, badges, "app verificado"** | Não faz sentido numa instância própria. |

---

## 14. Como o dono aponta o bot para o Streamz

### discord.js v14

```js
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,   // obrigatório para música
  ],
  rest: {
    api: 'https://api.streamz.chat/api',   // sem /v10: a lib acrescenta
    version: '10',
    cdn: 'https://api.streamz.chat/cdn',   // opcional; F5
  },
});

client.on('messageCreate', (m) => { if (m.content === '!ping') m.reply('pong'); });
client.login(process.env.STREAMZ_BOT_TOKEN);
```

Conferido no código da lib:
- `DefaultRestOptions` tem exatamente `api: 'https://discord.com/api'`,
  `version: APIVersion`, `authPrefix: 'Bot'`, `cdn`. O `RequestManager` monta
  `${api}/v${version}${rota}` → `https://api.streamz.chat/api/v10/users/@me`.
- **A URL do gateway não se configura, e é bom**: o `WebSocketManager` chama
  `fetchGatewayInformation()`, que é um `GET /gateway/bot` pelo **mesmo** `REST`.
  Trocar `rest.api` já redireciona o gateway. Não existe (nem é preciso) opção
  `ws.gateway`.
- `encoding` é `'json'` e `version` `'10'` por padrão; a compressão sai de
  `require('zlib-sync')` — ausente numa instalação limpa, então **não pede**
  (ver a armadilha no §7 para quando o bot tem `zlib-sync`).
- `Client#login` faz `token.replace(/^bot\s*/i,'')`, `rest.setToken`,
  `ws.setToken` — **não decodifica nem valida o token**. O `_censoredToken` só
  corta em `.` para o log de debug. `TokenInvalid` vem de token falsy ou de um
  **401** nosso, nunca de formato.
- `userAgentAppendix` é o único `RESTOptions` que a lib sobrescreve à força
  (prefixa `discord.js/14.27.0`). `setAgent(dispatcher)` e `makeRequest(url,
  init)` existem em `@discordjs/rest` 2.6.3 e são ganchos ainda mais fortes se
  alguém precisar reescrever o transporte.
- **Não use `ShardingManager` com `totalShards: 'auto'`**: ele chama
  `Util.fetchRecommendedShardCount()`, que usa uma URL congelada
  (`https://discord.com/api/v10`) e ignora `rest.api`.

### discord.py

```python
import discord, yarl
from discord.ext import commands
from discord.gateway import DiscordWebSocket

# São DUAS linhas, não uma — ver a correção abaixo.
discord.http.Route.BASE = 'https://api.streamz.chat/api/v10'          # com a versão
DiscordWebSocket.DEFAULT_GATEWAY = yarl.URL('wss://api.streamz.chat/gateway')

bot = commands.Bot(command_prefix='!', intents=discord.Intents.all())

@bot.command()
async def ping(ctx): await ctx.send('pong')

bot.run(os.environ['STREAMZ_BOT_TOKEN'])
```

Conferido:
- `class Route: BASE: ClassVar[str] = 'https://discord.com/api/v10'` — tem que
  **incluir a versão** (ao contrário do discord.js).
- O cabeçalho é `headers['Authorization'] = 'Bot ' + self.token`, sem validação.
- **Correção da F1 (medida no discord.py 2.7.1):** este § dizia que "a URL do
  gateway vem de `get_bot_gateway()` (nossa rota)". **Não vem mais.**
  `Client.connect` não chama `get_bot_gateway()`, e `DiscordWebSocket.from_client`
  cai em `DEFAULT_GATEWAY`, que é a constante `wss://gateway.discord.gg/`. Sem a
  segunda linha o bot faz o REST inteiro contra o Streamz e abre o WebSocket **no
  Discord de verdade**, que recusa o nosso token com close 4004 — um erro que
  parece nosso e não é. Foi a prova 4 da F1 que achou isto.
- O `from_client` acrescenta `?v=10&encoding=json&compress=zlib-stream`, com
  `compress=True` por padrão. **Nós ignoramos e mandamos texto** —
  `received_message` só descomprime `if type(msg) is bytes`. Confirmado no ar.
- **`GET /oauth2/applications/@me`** é chamada no login pelo `commands.Bot` (é
  como `is_owner()` funciona) e **não estava no §5**. Entrou na F1. O `AppInfo`
  lê `description`, `owner` e `verify_key` sem `.get`.
- **`Content-Type: application/json` sem `; charset=utf-8`.** O `json_or_text`
  compara o cabeçalho por igualdade exata; com o charset que o Express põe,
  **todo** corpo chega como string e o `login()` morre com `TypeError: string
  indices must be integers`, três camadas longe da causa.
- Para o CDN de avatar: `discord.Asset.BASE` (fora de escopo).

### Lavalink

**Nada muda no Lavalink.** Ele nem sabe que existe Discord — recebe
`endpoint`, `token` e `sessionId` do bot e conecta. O `application.yml`
continua igual. O que muda é só o bot, que já está apontado pelos passos acima.
O repasse é o de sempre:

```
PATCH http://lavalink:2333/v4/sessions/{sessionId}/players/{guildId}
{ "voice": { "token": "...", "endpoint": "voz.streamz.chat", "sessionId": "..." } }
```

Com `lavalink-client`/`shoukaku`/`erela.js`, isso é automático: eles escutam
`VOICE_STATE_UPDATE`/`VOICE_SERVER_UPDATE` do bot e mandam o `PATCH`. O bot só
precisa dos intents `GuildVoiceStates`.

### Spotify

Link do Spotify não é áudio: o `discord-player` (ou o `LavaSrc` do Lavalink) lê
os metadados e **busca no YouTube**. Isso acontece inteiramente do lado do bot e
**não nos toca em nada** — se o bot já fazia contra o Discord, faz igual aqui.

---

## 15. Os riscos que podem inviabilizar

Em ordem de "quanto do plano cai junto":

1. **A criptografia `_rtpsize` da voz.** É onde a F2 vive ou morre. Um nonce
   fora de lugar dá silêncio sem log. **Mitigação: o teste de vetor conhecido é
   o primeiro commit da F2, antes de qualquer socket.** Se em 3 dias o áudio não
   decifrar, o plano B é ligar o modo de captura de pacote e comparar byte a
   byte com uma captura do `@discordjs/voice` contra o Discord real.
2. **Publicar Opus no LiveKit sem transcodificar.** Confirmado no papel
   (`NewLocalSampleTrack` + `MimeTypeOpus` + `WriteSample`) mas **não medido por
   nós**. Se o payloader de Opus do pion se recusar (foi o caso do AV1, no
   issue #778 do SDK), o plano B é decodificar e reencodificar — custa CPU e um
   pouco de qualidade, mas **não muda o desenho**, só o `livekit.go` e a
   escolha da linguagem.
3. **O `GUILD_CREATE` incompleto.** Sintoma horrível: o bot conecta, não dá
   erro, e o `ready` nunca dispara. Mitigação: `client.on('debug')` ligado desde
   o primeiro teste e um teste de contrato que compara o payload com o schema
   do `discord-api-types`.
4. **Firewall/DNS do `voz.streamz.chat` e do 7883/udp.** Não dá para fazer daqui
   (§D5.5); é uma ação do usuário, e se não acontecer a F2 fica bloqueada
   inteira.
5. **Multi-instância.** O `onEvent` local (§7) e os relógios em memória do
   gateway atual já são dívida conhecida. Enquanto for um contêiner só, não
   morde. Quando escalar, morde tudo de uma vez.
6. **Manutenção.** O Discord muda o protocolo (foi o que aconteceu com a
   criptografia em 2024). Uma casca de compatibilidade é uma dívida permanente:
   quando as libs se moverem, temos que nos mover junto ou os bots param. Vale
   ter no PR de F1 um teste de fumaça que roda um discord.js real contra um
   Streamz de dev.

---

## 16. Referências conferidas

- Discord — Voice Connections: opcodes 0-13, modos de criptografia, descoberta
  de IP (74 bytes), RTP: <https://docs.discord.com/developers/topics/voice-connections>
- Discord — Gateway: parâmetros `v`/`encoding`/`compress` (compressão
  **opcional**), opcodes, Identify, Hello, Ready, Resume, `GET /gateway/bot`,
  intents: <https://docs.discord.com/developers/events/gateway>
- Discord — Permissions (tabela completa de bits até 1<<52):
  <https://docs.discord.com/developers/topics/permissions>
- Discord — Rate Limits (cabeçalhos `X-RateLimit-*`, corpo do 429):
  <https://docs.discord.com/developers/topics/rate-limits>
- discord.js — `Client#login` (não valida token):
  `packages/discord.js/src/client/Client.js`
- `@discordjs/rest` — `DefaultRestOptions` (`api`, `version`, `authPrefix`,
  `cdn`): `packages/rest/src/lib/utils/constants.ts`
- `@discordjs/ws` — `WebSocketManager` (gateway vindo de `/gateway/bot`,
  `compression: null`): `packages/ws/src/ws/WebSocketManager.ts`
- discord.py — `Route.BASE` e `'Bot ' + token`: `discord/http.py`;
  compressão pedida por padrão e descompressão só em `bytes`: `discord/gateway.py`
- Formato real do token (24/6/27-38, base64url): doctests de
  `Nostrum.Token` (`lib/nostrum/token.ex`) e o regex do TruffleHog. O
  deslocamento do timestamp da parte 2 **não** está documentado.
- Teste empírico próprio (2026-09-08): `discord.js@14.27.0` em `node:22`
  chegando a `ready` contra um servidor caseiro de 80 linhas com o token `abc`
  — ver §7.
- LiveKit — Go SDK, `NewLocalSampleTrack` / `WriteSample` com `MimeTypeOpus`:
  <https://pkg.go.dev/github.com/livekit/server-sdk-go/v2>
- LiveKit — Ingress/WHIP e `enable_transcoding`:
  <https://docs.livekit.io/transport/media/ingress-egress/ingress/transcode/>
- LiveKit Rust — `NativeAudioSource::capture_frame` recebe PCM:
  <https://docs.rs/livekit/latest/livekit/webrtc/audio_source/native/struct.NativeAudioSource.html>

E, do repositório: `CLAUDE.md`, `docs/PROCESSO-DE-DESENVOLVIMENTO.md`,
`docs/adr/0001` (DM é canal), `0002` (cargos e permissões), `0005` (self-host do
LiveKit), `0008` (admin da instância), `apps/api/prisma/schema.prisma`,
`packages/shared/src/{permissoes,eventos,internos}.ts`,
`apps/api/src/modules/{gateway,realtime,voice,discovery}/`,
`apps/web/{components/layout/GuildRail.tsx,components/settings/tabs.tsx,components/chat/Composer.tsx,lib/composer-autocomplete.ts}`,
`docker-compose{,.traefik,.ghcr}.yml`, `livekit.yaml`.
