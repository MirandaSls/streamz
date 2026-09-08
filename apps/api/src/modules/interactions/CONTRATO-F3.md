# Contrato da F3 — Interactions (slash commands)

Escrito pelo coordenador **antes** de os lotes começarem, na branch de
integração `feat/bots-f3`. Serve para os três lotes trabalharem em worktrees
separadas, sem se falarem e sem colidirem.

Fonte da verdade do *conteúdo*: `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` — §9
(D6, o desenho inteiro), §10 (as tabelas), §5 (a superfície REST e o guard de
token da F1), §12 "F3" (os lotes e a prova). Fonte da verdade do *processo*:
`docs/PROCESSO-DE-DESENVOLVIMENTO.md` (§2 convivência, §3 verificação, §6.4
paralelizar sem colidir).

**Entrega da fase:** `/play` digitado no composer do Streamz aciona o bot; o bot
responde e a resposta aparece no chat, sem F5.

> **A F0 e a F1 já estão na `main`** (PRs #168 e #179). Use o que elas deixaram
> pronto e **não reinvente**: `IdsService` (snowflake ↔ cuid, com cache),
> `DadosDeCompatService`, `erros.ts` (incluindo `10062` e `40060`, que já estão
> no mapa `CODIGO`), `FiltroDeErrosDoDiscord`, `RateLimitDoDiscordInterceptor`,
> `BotTokenGuard`, `RegistroDeSessoes`/`SessaoDoBot`, `traducao/*`,
> `content-type.ts`, e `apps/api/test/discord-compat/{ambiente,prova,semear}` —
> que a F3 **estende**, não reescreve.

---

## 1. Quem escreve o quê

O esqueleto **já existe nesta branch**, com as assinaturas fechadas e os corpos
lançando `Error("F3 lote A: … não implementado")`. Cada lote preenche os seus
arquivos e não toca nos dos outros. Assim os três compilam desde o primeiro
minuto e o merge não tem conflito — é o que funcionou na F1.

| Lote | Arquivos que ele preenche ou cria |
|---|---|
| **A — Domínio** | `modules/interactions/{interactions.service,interactions.controller,dto}.ts` + `*.spec.ts`; `prisma/schema.prisma` (**só** o bloco `── j-bots ──` e as back-relations); `prisma/migrations/20260908140000_bots_comandos/`; `modules/messages/messages.service.ts` (**só** o `include` e o campo do DTO — duas adições, nada mais) |
| **B — REST compat** | `modules/discord-compat/rest/{application-commands,interactions,webhooks}.controller.ts` + `*.spec.ts`; `modules/discord-compat/rest/corpos-f3.ts` (os schemas zod dos corpos) |
| **C — Web** | `apps/web/stores/comandos-de-app.ts` (+ teste); `apps/web/lib/comandos-barra.ts`; `apps/web/lib/api.ts` (duas linhas); `apps/web/components/chat/Composer.tsx` (**2 pontos, e só**); `apps/web/stores/guilds.ts` (uma linha); `apps/web/hooks/useRealtime.ts` (um listener + uma linha no `onReconnect`); `apps/web/lib/__tests__/*` |

**Arquivos do coordenador — ninguém mais os edita:**
`modules/interactions/{tipos.ts, interactions.module.ts}`, este `CONTRATO-F3.md`,
`app.module.ts`, `modules/discord-compat/discord-compat.module.ts`,
`packages/shared/src/{aplicativos.ts, midia.ts, eventos.ts}` (o contrato já está
escrito — ver §2), e o `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md`.

Precisou de um campo novo no contrato, de um código de erro novo, de um provider
novo? **Relate no PR** e siga com o que tem. Quem acha uma peça faltando relata,
não cria (§6.4 do processo).

Testes ao lado do código, `*.spec.ts` na API (é o que o `vitest.config.ts` dela
coleta em `src/**/*.{test,spec}.ts`). **No web o vitest roda com
`environment: "node"` e `include: ["**/*.test.ts"]` — só `.ts`, nunca `.tsx`, e
não há `@testing-library` no repo.** Logo: toda a lógica testável do lote C tem
que morar em módulo puro de `lib/` ou `stores/`, nunca dentro do componente.

---

## 2. As peças que já estão prontas e que todos usam

### `packages/shared` — o contrato (escrito, não mexer)

Em `aplicativos.ts`:

```ts
TIPOS_DE_OPCAO_ACEITOS = [3, 4, 5, 6, 7, 8, 10]   // TipoDeOpcao
interface OpcaoDeComando  { name, description, type, required, choices? }
interface ComandoDeApp    { id, snowflake, name, description, options,
                            applicationId, applicationName, botUser }
opcaoDeInteracaoSchema    // { name, type, value }  → OpcaoDeInteracao
interacaoCriarSchema      // { commandId, options }  → InteracaoCriarInput
interface InteracaoCriada { id, snowflake, name, expiresAt }
interface InteracaoDaMensagem { id, name, user }
TEXTO_PENSANDO = "pensando…"
```

Em `midia.ts`, o `Message` ganhou **um** campo: `interacao?: InteracaoDaMensagem
| null`. É a única mudança em contrato existente da fase.

Em `eventos.ts`: `WS_EVENTS.APPLICATION_COMMANDS_UPDATED =
"application.commandsUpdated"`, payload `{ guildId: string }`.

> `pnpm --filter @streamz/shared build` **antes** de qualquer typecheck: o que a
> api e a web consomem é o `dist`.

### `modules/interactions/tipos.ts` — o vocabulário da API

`VALIDADE_DA_INTERACAO_MS`, `BYTES_DO_TOKEN_DE_INTERACAO`, `TIPO_DE_INTERACAO`,
`TIPO_DE_CALLBACK`, `FLAG_EFEMERA`, e as formas `OpcaoPreenchida`,
`EntradaDeInteracao`, `InteracaoEmVoo`, `CorpoDeResposta`,
`InteracaoAutenticada`. Ver o arquivo: cada campo tem o porquê ao lado.

### `modules/interactions/interactions.service.ts` — a fronteira A ↔ B

**As assinaturas são contrato e não mudam.** O lote A preenche os corpos; o lote
B só chama.

```ts
criarInteracao(entrada: EntradaDeInteracao): Promise<InteracaoEmVoo>
comandosDoServidor(guildId: string, usuarioId: string): Promise<ComandoDeApp[]>

porToken(token: string): Promise<InteracaoAutenticada>          // o "guard" das rotas de compat
responder(i: InteracaoAutenticada, tipo: number, dados?: CorpoDeResposta): Promise<void>
editarOriginal(i: InteracaoAutenticada, dados: CorpoDeResposta): Promise<MessageDTO>
lerOriginal(i: InteracaoAutenticada): Promise<MessageDTO>
apagarOriginal(i: InteracaoAutenticada): Promise<void>
followup(i: InteracaoAutenticada, dados: CorpoDeResposta): Promise<MessageDTO>
```

E, em `./dto.ts` (puro, sem Nest, para o `MessagesService` importar sem criar
ciclo de módulo): `INTERACAO_DA_MENSAGEM_INCLUDE` e `toInteracaoDaMensagem`.

### O que a F1 deixou e a F3 usa direto

- **`RegistroDeSessoes.porBot(botUserId): SessaoDoBot[]`** e
  `sessao.despachar(evento, dados)`. O `INTERACTION_CREATE` sai **por aqui**,
  direto — não pelo `RealtimeService.onEvent` nem pelo `dispatch.ts`. Uma
  interação não é um evento do tempo real do Streamz: ela nasce para o bot.
  *(É também o que mantém a F3 fora do `dispatch.ts`, que a F2 está editando.)*
- `IdsService.snowflakeDeUsuario/Canal/Servidor/Cargo` e
  `cuidDeUsuario/cuidDeCanalOuCategoria` — para o `resolved` do payload e para os
  `:id` de rota.
- `DadosDeCompatService.canalPorCuid`, `membroDoServidor`, `usuarioPorCuid`.
- `traducao/{usuario,canal,membro,mensagem}.ts` — o `INTERACTION_CREATE` reusa
  `usuarioParaDiscord`, `canalParaDiscord` e `membroParaDiscord`.
- `erros.ts` — `CODIGO.INTERACAO_DESCONHECIDA` (10062) e
  `CODIGO.INTERACAO_JA_RESPONDIDA` (40060) **já existem**. Faltam dois atalhos;
  quem precisar os escreve no próprio `erros.ts` (é a única exceção à regra de
  "arquivo do coordenador", e o lote B é o único que mexe lá):
  `interacaoDesconhecida()` → 404/10062, `interacaoJaRespondida()` → 400/40060.

---

## 3. As fronteiras, uma a uma

### 3.1 Web → A: disparar o comando

```
POST /api/channels/:id/interactions        JwtGuard, Bearer
corpo:  { commandId: string, options: OpcaoDeInteracao[] }   (interacaoCriarSchema)
200:    InteracaoCriada { id, snowflake, name, expiresAt }
```

```
GET /api/guilds/:id/comandos-de-app        JwtGuard, Bearer
200: ComandoDeApp[]
```

**Divergência do documento, deliberada e registrada.** O §9 desenhou
`POST /api/interactions` (canal no corpo) e
`GET /api/guilds/:id/application-commands`. Ficam as rotas de cima: o canal é o
recurso, e o REST interno é em português. O documento é corrigido no PR final.

O `POST` **não espera o bot.** Ele devolve assim que a interação está gravada e
despachada; a resposta do bot chega pelo socket, como `message.new`. Um bot que
leve 8 s para resolver um link do YouTube não pode segurar o `fetch` do composer
— e é exatamente por isso que o `deferReply()` existe.

### 3.2 A: as recusas de `criarInteracao`, todas antes de gravar

| Situação | Resposta |
|---|---|
| `commandId` inexistente, ou de outro servidor que não o do canal | 404 |
| o usuário-bot não é membro do servidor | 404 — para quem digitou, comando de bot que saiu é comando que não existe |
| quem digitou não pode escrever no canal | 403 (`GuildsService.assertCanPostChannel`) |
| opção obrigatória faltando, ou de tipo errado | 400 |
| o bot não tem sessão de gateway aberta | **200 mesmo assim** |

A última linha é a que mais surpreende e é a certa: a interação existe, expira em
15 minutos e ninguém responde — é o que o Discord faz com um bot offline. O
despacho é melhor esforço.

**Na F3, "o bot está no servidor" quer dizer que existe uma linha de
`GuildMember` para o usuário-bot.** O §9 fala em checar `GuildApplication`; essa
tabela é a **migration 3, da F4**, e não existe. Quando ela existir, a checagem
passa a ser a instalação; até lá é a associação. Registrado como divergência.

### 3.3 A → B: as rotas de compat não têm `Authorization`

**Isto é o detalhe que mais custa caro se passar batido.** O `@discordjs/rest`
manda o callback e os followups com `auth: false` — **sem cabeçalho
`Authorization` nenhum** —, e o discord.py faz o mesmo. Um `BotTokenGuard`
nessas rotas daria 401 em todo `reply()`, `deferReply()` e `editReply()` do
planeta, e o sintoma no bot seria um `DiscordAPIError[0]: 401: Unauthorized`
vindo de dentro da lib.

Logo:

- `POST /interactions/:id/:token/callback` — **sem guard**.
- `POST|GET|PATCH|DELETE /webhooks/:app/:token[...]` — **sem guard**.
- `GET|PUT|POST|DELETE /applications/:app/[guilds/:gid/]commands[...]` —
  **com** `BotTokenGuard` (essas o `deploy-commands.js` manda autenticadas).

O credencial das duas primeiras famílias é o `:token` do caminho, e quem o
resolve é `InteractionsService.porToken`. Ele já devolve 404 `10062` para token
inexistente **ou vencido**; o controller ainda confere que o `:id` (ou o `:app`)
do caminho bate com a linha e, não batendo, devolve **o mesmo 404 `10062`** — e
não 403: para quem não tem o token, a interação não existe.

Todos os controllers de compat continuam com `@SkipThrottle()`,
`@UseFilters(FiltroDeErrosDoDiscord)`, `@UseInterceptors(RateLimitDoDiscordInterceptor)`
e `@Body()` cru + zod, como na F1 (§5 do documento: o `ValidationPipe` global com
`whitelist: true` apagaria `data.embeds`, `data.components` e `data.flags`).

### 3.4 Os quatro erros que a prova 4 da fase exige

| Caso | Status | `code` | Onde |
|---|---|---|---|
| interação expirada (> 15 min) | 404 | 10062 | `porToken` |
| callback duplicado | 400 | 40060 | `responder` |
| bot responde em canal que não vê | 403 | 50013 | cai de `MessagesService.create` pelo `FiltroDeErrosDoDiscord` |
| tipo de callback 6/7/8/9 | 501 | 20012 | `naoImplementado("callback type N")` |

O **callback duplicado tem que ser uma escrita condicional**, não um `if` depois
de um `findUnique`: `updateMany({ where: { id, respondedAt: null }, data: … })`
e, se `count === 0`, 40060. Dois callbacks quase simultâneos — que é o que um bot
com defeito faz — passariam pelos dois `if` e criariam duas mensagens.

### 3.5 A → C: o que a web mostra

O `Message.interacao` chega no `message.new` e no histórico REST igualmente
(vem do `include`, não do payload do socket) — é o que faz a faixa sobreviver a
um F5.

---

## 4. O `INTERACTION_CREATE` — o payload, campo por campo

**É o payload mais perigoso da fase**, pelo mesmo motivo que o `GUILD_CREATE`
foi o da F1: campo faltando levanta `KeyError`/`TypeError` **dentro** da lib, o
`interactionCreate` nunca dispara, e o log não diz nada. O risco (a) do §12
aconteceu na F1 exatamente assim.

```jsonc
{
  "id":             "<snowflake da Interaction>",   // string decimal
  "application_id": "<snowflake da Application>",
  "type":           2,                              // APPLICATION_COMMAND
  "token":          "<o token de 86 caracteres>",
  "version":        1,
  "guild_id":       "<snowflake do servidor>",
  "channel_id":     "<snowflake do canal>",
  "channel":        { /* CanalDoDiscord, de canalParaDiscord() */ },
  "member": {
    /* MembroDoDiscord de membroParaDiscord(linha, true) — COM o `user` dentro:
       é de lá que o discord.py tira o autor da interação em servidor */
  },
  "user":           { /* UsuarioDoDiscord de quem digitou */ },
  "app_permissions": "<bitfield de 64 bits, string decimal>",
  "locale":         "pt-BR",
  "guild_locale":   "pt-BR",
  "entitlements":   [],
  "authorizing_integration_owners": {},
  "context":        0,
  "data": {
    "id":       "<snowflake do ApplicationCommand>",
    "name":     "play",
    "type":     1,                                  // CHAT_INPUT
    "guild_id": "<snowflake do servidor>",          // só em comando por servidor
    "options": [
      { "name": "url", "type": 3, "value": "https://…" }
    ],
    "resolved": { "users": {}, "members": {}, "channels": {}, "roles": {} }
  }
}
```

Regras que valem para ele:

1. **Todo id é string decimal.** Um `bigint` num `JSON.stringify` lança
   `TypeError` — o que é bom, quebra alto em vez de truncar em silêncio
   (regra da F1, mantida).
2. **`member` traz o `user` dentro** e `user` também vem no topo. O Discord
   manda `member` em servidor e `user` em DM; mandar os dois é inofensivo e
   cobre as duas libs sem depender de qual delas lê qual.
3. **`resolved` é obrigatório quando há opção de tipo 6, 7 ou 8.** O
   `_get_namespace` do discord.py resolve o alvo pelo `resolved` e levanta se
   não achar; o discord.js devolve `null` no `getUser()`, o que o bot lê como
   "não veio". Opção desses tipos → a entrada correspondente **tem** que estar
   em `resolved.users` / `resolved.channels` / `resolved.roles` (e
   `resolved.members` junto de `users`, em servidor).
4. **`app_permissions` é string, não número.** O `memberPermissions` do
   discord.js faz `new PermissionsBitField(BigInt(d.app_permissions))`.
   Use `paraBitfieldDoDiscord` de `@streamz/shared` e serialize com `String(...)`.
5. **Confira contra as libs de verdade, não contra este documento.** A lição da
   F1 é literal: "nenhum teste unitário pegaria, porque o payload estava
   'certo' para o nosso próprio tipo". A prova 3 (discord.js) e a prova 3b
   (discord.py) do `prova.sh` são a única verificação que vale. Achou campo a
   mais que a lib exige, ou campo daqui que ela ignora? **Relate no PR e
   corrija o payload** — este trecho do contrato é o desenho, não a lei.

O despacho é filtrado por sessão do bot dono do comando
(`RegistroDeSessoes.porBot(botUserId)`) e **não por intent**: `INTERACTION_CREATE`
não tem intent no Discord (é justamente a saída que eles deram para bot sem
`MESSAGE_CONTENT`). Não filtre por `INTENT.GUILD_MESSAGES` — um bot só de
slash commands não pede esse intent e ficaria mudo.

---

## 5. O token da interação

```ts
crypto.randomBytes(BYTES_DO_TOKEN_DE_INTERACAO).toString("base64url")   // 64 bytes → 86 caracteres
```

- **base64url, não base64 nem hex.** O token viaja no *caminho* da URL
  (`/webhooks/:app/:token`): `+`, `/` e `=` quebrariam a rota.
- Vale `VALIDADE_DA_INTERACAO_MS` (15 min) a partir do `createdAt`. Depois
  disso, 404 `10062` — e a faxina do `MaintenanceService` apaga a linha depois
  (fora do escopo da F3; a expiração é conferida na leitura, não pelo sumiço da
  linha).
- **Nunca sai para o web.** O `InteracaoCriada` que o composer recebe não tem o
  campo. Quem tem o token pode escrever no canal como o bot.
- `@@unique` na coluna: a busca por token é o caminho quente das três rotas.

O §10 do documento diz "64 bytes em base64url", e é isso: 64 bytes **de
entropia**, 86 caracteres de texto. A linha do §9 que diz "token(random 64)" quer
dizer o mesmo.

---

## 6. A migration 4

`prisma/migrations/20260908140000_bots_comandos/migration.sql`, com
`ApplicationCommand` e `Interaction` exatamente como o §10 do documento os
desenha — mais três coisas que o §10 não previu:

1. **`Interaction.commandName String`** — o nome do comando, copiado na hora.
   Sem ele, a faixa "usou /play" some quando o bot re-registra os comandos
   (o `PUT` é sobrescrita em bloco: a linha antiga é apagada). Uma mensagem
   antiga do chat não pode perder a legenda porque o dono do bot rodou o
   `deploy-commands.js` de novo.
2. **`Interaction.responseMessageId String? @unique`** + a relação para
   `Message`. É `@unique` porque é o que transforma a back-relation em
   `Interaction?` (e não `Interaction[]`) do lado da mensagem — é o que o
   `include` do `MessagesService` espera.
3. **`Interaction.user`** — relação para `User` (`onDelete: Cascade`), para a
   faixa sair no mesmo `include`.

**Nenhum `ALTER TABLE "Message"`.** A `Message` é a maior tabela do banco e a
migration 4 tem que ser aditiva pura, com `DROP` de volta — a coluna da ligação
mora do lado da `Interaction`, e a `Message` só ganha uma back-relation, que é
virtual no Prisma e não existe no SQL. As back-relations em `Application`,
`Guild`, `User`, `Channel` e `Message` entram no `schema.prisma` sem tocar em
coluna nenhuma.

`ApplicationCommand.@@unique([applicationId, guildId, name])`: cuidado, o
Postgres trata `NULL` como distinto num índice único, então **dois comandos
globais com o mesmo nome passariam pelo índice**. A unicidade do comando global
é do `PUT` (sobrescrita em bloco, dentro de uma transação), e o índice fica
como está — é o que o §10 desenha, e a redundância não faz mal.

Validação: `prisma migrate deploy` num Postgres 16 **descartável**
(`test/discord-compat/ambiente.sh` já sobe um), e `prisma migrate diff` contra o
schema para provar que não sobra deriva. **Nunca contra produção.**

---

## 7. O lote C, ponto a ponto

O `Composer.tsx` é sensível, tem 1000 linhas e o autocomplete dele já é testado.
**São dois pontos, e só.**

### Ponto 1 — a fonte de sugestões (`Composer.tsx:997-1004`)

Hoje o ramo `/` é o fallback de `montarSugestoes` e devolve
`buscarComandos(gatilho.termo)`. Concatene os comandos de app **depois** dos
nativos, com:

```tsx
{ chave: `app:${c.id}`, valor: `/${c.name}`, rotulo: `/${c.name}`,
  detalhe: c.description, icone: <Avatar user={c.botUser} size="sm" /> }
```

`size="sm"` é 24px e casa exatamente com a caixa `h-6 w-6` do
`Autocomplete.tsx:93` — é o mesmo padrão do ramo `@` (`Composer.tsx:980`).
O `ComandoDeApp` entra como uma **quinta fonte** no objeto `fontes` da assinatura
de `montarSugestoes` (`Composer.tsx:898-909`).

**Não mexa em `buscarComandos`.** O teste
`apps/web/lib/__tests__/composer-autocomplete.test.ts:120` espera
`buscarComandos("s") === ["shrug", "spoiler"]`; misturar comandos de app ali o
quebraria — e o teste está certo, a função é do contrato de `@streamz/shared`.

### Ponto 2 — o envio (`Composer.tsx:315-333`)

Hoje, `interpretarComando(draft.trim())` devolve `{ tipo: "desconhecido" }` para
qualquer `/palavra` que não esteja na lista nativa, e o `submit()` mostra
"Não conheço o comando /x" e para. **Um `/play` cairia aí.** Então:

- `interpretarComando` ganha um segundo parâmetro **opcional**
  (`comandosDeApp: ComandoDeApp[] = []`), para os testes existentes seguirem
  compilando e passando sem tocar em nenhum deles;
- `ResultadoComando` ganha duas variantes:
  ```ts
  | { tipo: "interacao"; commandId: string; opcoes: OpcaoDeInteracao[] }
  | { tipo: "faltaOpcao"; comando: string; opcao: string }
  ```
- o ramo novo no `submit()` entra **antes** do `if (comando.tipo ===
  "desconhecido")` e chama `api.criarInteracao(channelId, { commandId, options })`,
  limpando o rascunho. Nada é escrito no canal pelo usuário: **uma interação não
  é uma mensagem.**

### A parte pura, testada: o parse de `/play url:…`

Em `lib/comandos-barra.ts` (é `.ts`, é puro, e o vitest do web o coleta):

- `/comando nome:valor nome2:"valor com espaço"` → opções nomeadas;
- `/comando resto livre`, quando o comando declara **exatamente uma** opção →
  o resto inteiro é o valor dela (é o caso do `/play <link>`, e é o que faz o
  comando ser usável sem chip de UI);
- o valor é convertido pelo `type` da opção: 4 e 10 viram `number`, 5 vira
  `boolean` (`true`/`sim`/`1`), o resto fica `string`;
- opção `required` faltando → `{ tipo: "faltaOpcao" }` (a tela mostra o toast
  em vez de mandar um 400 e volta).

Teste este parse: pelo menos os casos do `/play` com link, do nomeado com aspas,
do número, do booleano, do obrigatório faltando, e do comando de app que colide
com um comando nativo (**o nativo ganha** — `/me` é `/me`).

### O resto do lote C

- `stores/comandos-de-app.ts`: siga `stores/categories.ts` — campo
  `guildId: string | null` no estado, `loadForGuild(guildId)` e a guarda de
  corrida `let loadSeq = 0` fora do `create`, para o composer nunca mostrar os
  comandos do servidor anterior. Mais o `clear()` de praxe.
- `stores/guilds.ts:147` — uma linha em `select`, junto das outras cargas por
  servidor.
- `hooks/useRealtime.ts` — um `on(WS_EVENTS.APPLICATION_COMMANDS_UPDATED, …)`
  no array de listeners, e uma recarga no bloco `onReconnect` (linhas 420-448),
  pelo `activeGuildId`, como `usePermissions` e `useCategories` já fazem.
- `lib/api.ts` — duas entradas, no formato das vizinhas:
  `comandosDeApp(guildId)` e `criarInteracao(channelId, body)`.
- **A faixa "usou /play"** (`MessageItem`, o `Message.interacao`): entra, é o que
  faz a resposta do bot não parecer um monólogo. Uma linha discreta acima da
  mensagem, com o avatar pequeno de quem digitou e "usou **/play**" — o padrão
  do Discord.

---

## 8. Regras que valem para os três lotes

1. **Nunca `git checkout`/`git switch` em `/opt/stack/streamz`** (há outros
   agentes em `mobile`, `bots-f2` e nos outros lotes desta fase). Worktree
   própria; **nunca `worktree remove`**.
2. Cada lote parte de **`origin/feat/bots-f3`**, não de `main`, em branch e
   worktree próprias (`feat/bots-f3-a`, `-b`, `-c`), e abre PR **contra
   `feat/bots-f3`**. **Ninguém mergeia — só o coordenador, e só nessa branch.
   Ninguém mergeia em `main`.**
3. **Nomes em português no código novo.** O JSON de saída é o do Discord, em
   inglês e em snake_case, obviamente.
4. **Mudança mínima fora do escopo. Não refatore ao redor.** Vale em dobro para
   o `Composer.tsx`.
5. **Os controllers de compat não passam pelo `ValidationPipe` global**
   (§5 do documento): `@Body()` cru + zod (`common/zod.pipe.ts`).
6. **Nada de `bigint` num `JSON.stringify`.**
7. **Sem node no host.** Tudo em `docker run --rm node:22`, conforme o §3.2 do
   processo. A verificação **completa** (shared build → prisma generate → tsc
   dos três → testes api/web → lint/build da web) roda **uma vez, no fim, pelo
   coordenador**: agente rodando verificação sobre a árvore parcial dos outros
   dá falso vermelho (§6.4). Cada lote roda o que cobre o **seu** lote.
8. **Migration validada num Postgres descartável. Nunca contra produção.**
9. Commits em português, cada um terminando com:

   ```
   Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
   Claude-Session: https://claude.ai/code/session_01PT5Ze54BcXtgjyMfWgWvYy
   ```

10. PR com descrição em português (o que muda, arquivos, o que ficou inerte, o
    que **não** foi verificado, e "como testar" com passos), terminada em:

    ```
    🤖 Generated with [Claude Code](https://claude.com/claude-code)

    https://claude.ai/code/session_01PT5Ze54BcXtgjyMfWgWvYy
    ```

11. **Se o documento estiver errado, relate no PR.** O coordenador corrige o
    documento no PR final.

---

## 9. A F2 está rodando em paralelo

A F2 (voz) mexe em `gateway/voz.ts` (novo), `gateway/compressao.ts` (novo) e
`gateway/dispatch.ts` (acrescenta dispatches de voz). **A F3 não toca em nenhum
dos três** — e é de propósito: o `INTERACTION_CREATE` sai direto pelo
`RegistroDeSessoes`, sem passar pela ponte de eventos.

O único arquivo que as duas fases podem disputar é
`discord-compat/discord-compat.module.ts` (a F2 registra os providers de voz).
O coordenador da F3 já fez ali a **única** edição da fase — uma linha, no
`exports`. Nenhum lote da F3 pode tocar nesse arquivo; achou que precisa,
relate.

---

## 10. Divergências do documento já conhecidas

Todas entram no PR final, corrigindo o `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md`.

- **§9, as rotas internas.** O documento diz `POST /api/interactions` e
  `GET /api/guilds/:id/application-commands`; ficaram
  `POST /api/channels/:id/interactions` e `GET /api/guilds/:id/comandos-de-app`.
- **§9, a checagem de instalação.** "checa se a application está instalada no
  servidor (`GuildApplication`)" — a tabela é a migration 3, da **F4**. Na F3 a
  checagem é a linha de `GuildMember` do usuário-bot.
- **§9, "O `/` no cliente", item 3.** Diz que o ramo novo vai em
  `Composer.tsx:315-333`; a numeração está certa, mas falta dizer que o ramo tem
  que vir **antes** do `if (comando.tipo === "desconhecido")` — senão o toast de
  "não conheço o comando" come o `/play` antes.
- **§9, callback sem `Authorization`.** O documento não diz que o
  `@discordjs/rest` manda o callback e os followups com `auth: false`. É a
  informação mais cara da fase e tem que estar escrita.
- **§10, `Interaction`.** Faltam `commandName` (a legenda tem que sobreviver ao
  `PUT` que apaga o comando) e a relação com `User`; e o `responseMessageId`
  precisa ser `@unique` para virar back-relation `Interaction?` na `Message`.
- **§12, F3.** A tabela de lotes não cita `webhooks.controller.ts` (os
  followups), que o §9 pede — o lote B faz os dois.
