# Contrato da F1 — o que cada lote pode tocar e o que ele promete

Escrito pelo coordenador **antes** de os lotes começarem, na branch de
integração `feat/bots-f1`. Serve para os quatro lotes trabalharem em worktrees
separadas sem se falarem e sem colidirem.

Fonte da verdade do *conteúdo*: `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md`
(§5 REST, §6 permissões, §7 gateway, §12 F1). Fonte da verdade do *processo*:
`docs/PROCESSO-DE-DESENVOLVIMENTO.md` (§2 convivência, §3 verificação, §6.4
paralelizar sem colidir).

> **A F0 já está na `main`** (PR #168). Use o que ela deixou pronto; não
> reinvente: `packages/shared/src/snowflake.ts`,
> `packages/shared/src/aplicativos.ts`, `modules/applications/token.ts`
> (`gerarToken`, `hashDoToken`, `snowflakeDoToken`, `tokenDoCabecalho`),
> `ApplicationsService.verificarToken`, `User.isBot`, `PublicUser.bot`, e a
> coluna `snowflake` nas nove tabelas.

---

## 1. Quem escreve o quê

O esqueleto inteiro **já existe nesta branch**, com as assinaturas fechadas e
os corpos lançando `Error("F1 lote X: … não implementado")`. Cada lote preenche
os corpos dos seus arquivos e não toca nos dos outros. Assim os quatro
compilam desde o primeiro minuto e o merge não tem conflito.

| Lote | Arquivos que ele preenche |
|---|---|
| **A — REST compat** | `bot-token.guard.ts`, `rate-limit.interceptor.ts`, `dados.service.ts`, `rest/*.controller.ts` (6 arquivos) |
| **B — Gateway compat** | `gateway/servidor.ts`, `gateway/sessao.ts`, `gateway/identify.ts`, `ws` + `@types/ws` no `apps/api/package.json` |
| **C — Tradução** | `traducao/*.ts` (6 arquivos), `packages/shared/src/permissoes-discord.ts` + testes |
| **D — Ponte de eventos** (o mesmo agente do C, depois) | `gateway/dispatch.ts`, `modules/realtime/realtime.service.ts` (o `onEvent`) |

**Arquivos do coordenador — ninguém mais os edita:**
`discord-compat.module.ts`, `tipos.ts`, `erros.ts`, `ids.service.ts`,
`app.module.ts`, `main.ts`, este `CONTRATO-F1.md`.

Precisou de um provider novo, de um campo novo em `tipos.ts`, de um código de
erro novo? **Relate no PR** e siga com o que tem. Quem acha uma peça faltando
relata, não cria (§6.4 do processo).

Testes ficam ao lado do código, `*.spec.ts`/`*.test.ts` — é o que o
`vitest.config.ts` da API coleta (`src/**/*.{test,spec}.ts`). Os scripts de
prova de ponta a ponta vão para `apps/api/test/discord-compat/` (a F2 reusa).

---

## 2. As peças que já estão prontas e que todos usam

### `tipos.ts` — o vocabulário

Duas famílias:

- **`LinhaDe*`** — o que sai do banco **com o `snowflake` junto**
  (`LinhaDeUsuario`, `LinhaDeCanal`, `LinhaDeCategoria`, `LinhaDeCargo`,
  `LinhaDeMembro`, `LinhaDeMensagem`, `LinhaDeAnexo`, `LinhaDeReacao`,
  `LinhaDeServidor`). **Não são** os DTOs de `@streamz/shared`: aqueles têm
  `id` cuid e nenhum snowflake, e a tradução precisa do número.
- **`*DoDiscord`** — o JSON de saída (`UsuarioDoDiscord`, `CanalDoDiscord`,
  `CargoDoDiscord`, `MembroDoDiscord`, `MensagemDoDiscord`, e `JsonDoDiscord`
  para o resto). Todo id é **string decimal**; `JSON.stringify` de um `bigint`
  lança `TypeError` — o que é bom, quebra alto em vez de truncar em silêncio.

Mais `BotAutenticado` (o que o guard põe em `req.bot`), `OPCODE`, `INTENT`,
`FECHAMENTO`, `VERSAO_DO_GATEWAY` e `INTERVALO_DE_HEARTBEAT_MS`.

### `erros.ts` — os erros no formato do Discord

`ErroDoDiscord`, os atalhos (`canalDesconhecido()`, `semPermissao()`,
`corpoInvalido()`, `naoAutenticado()`, `naoImplementado()`), o mapa `CODIGO` e
o **`FiltroDeErrosDoDiscord`**.

O filtro é indispensável e todo controller de compat já o declara: a casca
chama os services internos, e eles lançam `ForbiddenException` /
`NotFoundException` do Nest, cujo corpo (`{statusCode, message}`) chega na lib
do bot como `code: 0`. O filtro traduz. **Aplicado só nos controllers de
compat** — o REST interno e a web continuam com o formato deles.

### `ids.service.ts` — snowflake ↔ cuid

```ts
cuidDeUsuario(sf) / cuidDeServidor(sf) / cuidDeMensagem(sf) / cuidDeCargo(sf)
cuidDeCanalOuCategoria(sf) -> { id, tipo: "canal" | "categoria" } | null
snowflakeDeUsuario(id) / …DeServidor / …DeCanal / …DeCategoria / …DeMensagem / …DeCargo
snowflakesEmLote(tabela, ids) -> Map<cuid, bigint>
```

Com cache nos dois sentidos (o par cuid↔snowflake é imutável por construção).
Use-o para (i) traduzir o `:id` de rota antes de chamar um service do Streamz e
(ii) recuperar o snowflake quando só se tem um DTO — o retorno de
`MessagesService.create` e os payloads que chegam pelo `onEvent`.

---

## 3. As fronteiras entre os lotes, uma a uma

### A → C: a tradução

O lote A monta `LinhaDe*` (em `dados.service.ts`) e chama:

```ts
usuarioParaDiscord(u: LinhaDeUsuario): UsuarioDoDiscord
tipoDeCanalParaDiscord(t: ChannelType): number
canalParaDiscord(c: LinhaDeCanal): CanalDoDiscord
categoriaParaDiscord(c: LinhaDeCategoria): CanalDoDiscord      // tipo 4
cargoParaDiscord(r: LinhaDeCargo): CargoDoDiscord
corParaInteiro(cor: string | null): number
membroParaDiscord(m: LinhaDeMembro, comUsuario = true): MembroDoDiscord
mensagemParaDiscord(m: LinhaDeMensagem): MensagemDoDiscord
servidorParaDiscord(g: LinhaDeServidor, completo = true): JsonDoDiscord
```

E, de `@streamz/shared`:

```ts
paraBitfieldDoDiscord(bits: number): bigint     // serialize com String(...)
doBitfieldDoDiscord(bits: bigint): number
```

Tudo puro: sem Prisma, sem Nest, sem `async`. É o que torna o lote C testável
sem banco.

### A → B e A → D: os dados

`DadosDeCompatService` (lote A) é a **única** porta de leitura com snowflake.
Assinaturas fechadas em `dados.service.ts`; as que B e D usam:

```ts
servidoresDoBot(botUserId): { id, snowflake }[]     // B: a lista do READY
servidorCompleto(guildId): LinhaDeServidor | null   // D: o GUILD_CREATE
usuarioPorCuid(id) / canalPorCuid(id) / mensagemPorCuid(id, paraBotUserId)
membroDoServidor(guildId, userId) / membrosDoServidor(guildId)
estruturaDoServidor(guildId) / cargosDoServidor(guildId)
mensagensDoCanal(channelId, { limit, before, after, around, paraBotUserId })
```

### B → D: as sessões

`RegistroDeSessoes` (lote B) é onde as conexões vivas moram; `SessaoDoBot` é a
interface que o lote D usa para o fan-out:

```ts
interface SessaoDoBot {
  readonly id: string;             // session_id
  readonly botUserId: string;      // cuid do User do bot
  readonly applicationId: string;
  readonly intents: number;        // bitfield; filtre por ele
  despachar(evento: string, dados: unknown): void;   // op 0, incrementa o `s`
  fechar(codigo: number, razao: string): void;
}

class RegistroDeSessoes {
  registrar(s) / remover(sessionId) / todas() / porBot(botUserId) / porId(sessionId)
}
```

### D → B: o `GUILD_CREATE`

O lote B, no fim do IDENTIFY, manda o READY e logo atrás um `GUILD_CREATE` por
servidor, chamando:

```ts
PonteDeEventos.montarGuildCreate(guildId: string, botUserId: string): Promise<JsonDoDiscord>
```

### D → o tempo real: o `onEvent`

A **única** mudança em arquivo fora de `discord-compat/`. Quinze linhas em
`modules/realtime/realtime.service.ts`, exatamente esta forma (§7 do documento):

```ts
/** Onde um evento foi parar: a sala do Socket.IO que o recebeu. */
export type AlvoDoEvento =
  | { tipo: "todos" }
  | { tipo: "usuario"; id: string }
  | { tipo: "usuarios"; ids: string[] }
  | { tipo: "canal"; id: string }
  | { tipo: "servidor"; id: string };

type OuvinteLocal = (alvo: AlvoDoEvento, evento: string, dado: unknown) => void;

/**
 * Ouvinte local, chamado junto com o `emit`. É o gancho da casca de
 * compatibilidade (a alternativa era sniffar o adapter do Socket.IO, que é
 * frágil). Funciona com e sem Redis.
 *
 * Ressalva registrada: os ouvintes veem só o que **esta instância** emitiu.
 * Hoje a API roda num contêiner só. Com N instâncias, é preciso um canal
 * Redis pub/sub próprio — está fora de escopo e é dívida conhecida (§7).
 */
onEvent(cb: OuvinteLocal): void;
```

Cada `emitAll/emitToUser/emitToUsers/emitToChannel/emitToGuild` chama os
ouvintes **depois** de emitir no Socket.IO, dentro de um `try/catch` por
ouvinte: um bot com defeito não pode derrubar o `emit` que o navegador espera.
Os métodos de `join`/`leave` de sala **não** notificam (não são eventos).

---

## 4. Regras que valem para os quatro lotes

1. **Nunca `git checkout`/`git switch` em `/opt/stack/streamz`** (há outros
   agentes em `mobile`, `foto-no-palco`, `seg-*`). Worktree própria;
   **nunca `worktree remove`**.
2. Cada lote parte de **`origin/feat/bots-f1`**, não de `main`, e abre PR
   **contra `feat/bots-f1`**. Ninguém mergeia — só o coordenador, e só nessa
   branch.
3. **Nomes em português no código novo.** O JSON de saída é o do Discord, em
   inglês e em snake_case, obviamente.
4. **Mudança mínima fora do escopo. Não refatore ao redor.**
5. **Os controllers de compat não passam pelo `ValidationPipe` global com
   whitelist** (§5 do documento): `@Body()` cru + zod (`common/zod.pipe.ts`),
   como as rotas de conta. Isto é o risco (b) do §12 — o `whitelist: true`
   apaga `embeds`, `components`, `flags`, `allowed_mentions`,
   `message_reference`, `tts` e `nonce` antes de o handler ver, e ninguém
   descobre por quê.
6. **Nada de `bigint` num `JSON.stringify`.** Linha crua dessas tabelas não
   chega a uma resposta HTTP nem a um `emit` — foi o que a F0 já custou uma
   correção (`InvitesService.redeem`).
7. Commits em português, cada um terminando com:

   ```
   Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
   Claude-Session: https://claude.ai/code/session_01PT5Ze54BcXtgjyMfWgWvYy
   ```

8. PR com descrição em português (o que muda, arquivos, o que ficou inerte, o
   que **não** foi verificado, e "como testar" com passos), terminada em:

   ```
   🤖 Generated with [Claude Code](https://claude.com/claude-code)

   https://claude.ai/code/session_01PT5Ze54BcXtgjyMfWgWvYy
   ```

9. **Sem node no host.** Tudo em `docker run --rm node:22`. A verificação
   completa (shared build → prisma generate → tsc dos três → testes → lint →
   build da web) roda **uma vez, no fim, pelo coordenador** — agente rodando
   verificação sobre a árvore parcial dos outros dá falso vermelho (§6.4).
   Cada lote roda o que cobre o **seu** lote: `pnpm --filter @streamz/shared
   build`, `prisma generate`, `tsc --noEmit` da API e os testes dela.
10. **Se o documento estiver errado, relate no PR.** O coordenador corrige o
    documento no PR final.

---

## 5. Divergências do documento já conhecidas

- **§6 diz "19 permissões"; são 21.** `packages/shared/src/permissoes.ts` ganhou
  `MOVE_MEMBERS = 1 << 19` e `STREAM = 1 << 20` depois de o documento ser
  escrito. As duas **mapeiam** (`MOVE_MEMBERS` = 1<<24 e `STREAM` = 1<<9 no
  Discord) e saem da lista de "sempre apagadas" do §6.
- **§5 lista `GET /api/v10/users/:id`** e o §12 não; entra, é uma linha.
- **Reações granulares não existem no tempo real de hoje**: `reaction.add`
  resulta em `message.updated` com a mensagem inteira, sem `user_id`. O
  `MESSAGE_REACTION_ADD` de verdade é F5, com um evento interno novo. Na F1 o
  que sai é `MESSAGE_UPDATE`, e o PR diz isso em vez de fingir.
- **Instalar o bot num servidor é F4** (`GuildApplication`, migration 3, tela de
  "Adicionar ao servidor"). Na F1, "o bot está no servidor" quer dizer que
  existe uma linha de `GuildMember` para o usuário-bot — é o que os scripts de
  prova criam.
