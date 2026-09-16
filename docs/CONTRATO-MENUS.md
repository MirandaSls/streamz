# Contrato — menus de clique direito idênticos ao Discord

Escrito pelo cartão **CONTRATO** (2026-09-16), antes dos cartões de API e web.
**É a única fonte que eles leem.** Espec visual: `ESPEC.md` + prints p1–p9 (ver
`REGRAS.md` da entrega). Este documento é contrato de **dados**. A ordem dos
itens, os ícones e os textos dos menus ficam na ESPEC.

Cartões que implementam:

| Cartão | Itens |
|---|---|
| `api-dm-fixar` | 1 |
| `api-relacoes` | 2, 3, 4 |
| `api-servidor` | 5, 6 |
| `api-comandos` | 7 |
| cartões web | consomem tudo, e o item 8 |

Regras comuns a todos os cartões de API:

- Corpo validado com o **schema zod do shared** via `zodBody` de
  `apps/api/src/common/zod.pipe.ts`, não com `class-validator`.
- Toda rota usa `@UseGuards(JwtGuard)`, e `eu` é o `user.sub`.
- Todo evento novo vai **só** para `user:<eu>` com
  `RealtimeService.emitToUser(eu, WS_EVENTS.X, payload)`. Nada disto vaza
  para o outro lado: nota, apelido de amigo, ignorar e fixar são privados.
- A resposta REST e o payload do evento são **o mesmo objeto**. A aba que fez
  a ação aplica a resposta, e as outras aplicam o evento. Aplicar os dois tem
  de ser idempotente.
- Alvo inexistente dá 404 `"Usuário não encontrado"` / `"Conversa não
  encontrada"`, e alvo = eu dá 400 (salvo onde está dito o contrário).

---

## 0. O que já está pronto (o diff deste cartão)

| Onde | O quê |
|---|---|
| `apps/api/prisma/schema.prisma` | modelos `DMPin`, `UserNote`, `FriendNickname`, `UserIgnore`; `GuildMember.nickname` e `.permitirDmsDoServidor`; `Interaction.targetId`; `@@unique` de `ApplicationCommand` passa a `[applicationId, guildId, type, name]` |
| `apps/api/prisma/migrations/20260916120000_menus_de_contexto/migration.sql` | gerada com `prisma migrate diff`. Só aditiva, exceto `DROP INDEX ApplicationCommand_applicationId_guildId_name_key` + `CREATE UNIQUE INDEX …_type_name_key`, que só afrouxa a unicidade |
| `packages/shared/src/menus.ts` (novo, exportado pelo `index.ts`) | tipos, schemas, constantes e funções puras abaixo |
| `packages/shared/src/midia.ts` | `DMChannelView.fixadaEm?`, `GuildMemberView.nickname?` |
| `packages/shared/src/social.ts` | `FriendLists.apelidos?`, `.ignored?`; `UserProfile.nota?`, `.apelidoDeAmigo?`, `.ignorado?`, `.nicknameNoServidor?` |
| `packages/shared/src/comunidade.ts` | `GuildMembership.nickname?`, `.permitirDmsDoServidor?` |
| `packages/shared/src/eventos.ts` | `WS_EVENTS.DM_PIN_UPDATED`, `USER_NOTE_UPDATED`, `FRIEND_NICKNAME_UPDATED`, `USER_IGNORED`; `MemberUpdatedEvent.nickname?` |
| `packages/shared/src/aplicativos.ts` | `ComandoDeApp.tipo?`, `interacaoCriarSchema.targetId?`, `InteracaoDaMensagem.tipo?` |
| `packages/shared/src/conta.ts` | `MUTE_PRESETS_MINUTES = [15, 60, 180, 480, 1440]` |
| `apps/web/lib/api.ts` | helper `put()` e as funções da seção "menus de contexto" (nomes nas tabelas) |

Os campos novos em tipos que já existiam são **opcionais** (`?`) só para
payload antigo em cache e para o typecheck continuar verde até a API
implementar. **A API sempre os preenche.** Na web, `undefined` vale como
`null` / `false` / `{}` / `[]`.

Verificado: `prisma generate`, `pnpm --filter @streamz/shared build` e
`tsc --noEmit` de api e web, todos limpos.

---

## 1. Fixar conversa de DM (`api-dm-fixar`)

| | |
|---|---|
| Modelo | `DMPin { userId, channelId, pinnedAt @default(now()) }`, `@@id([userId, channelId])`, cascade nos dois lados |
| DTO | `DMChannelView.fixadaEm?: string \| null` (ISO de `pinnedAt`; `null` = não fixada) |
| Resposta/evento | `ConversaFixadaEvent { channelId: string; fixadaEm: string \| null }` |
| Ordem | `compararConversas(a, b, criadaEm?)` (shared). Primeiro as fixadas, por `fixadaEm` **crescente** (ordem de fixação: a recém-fixada entra no fim do bloco). Depois as demais por `lastMessageAt ?? criadaEm`, da mais recente para a mais antiga |
| Evento WS | `WS_EVENTS.DM_PIN_UPDATED` = `"dm.pinUpdated"` → `user:<eu>`, payload `ConversaFixadaEvent` |

| Método | Path | Corpo | Resposta | Cliente web |
|---|---|---|---|---|
| PUT | `/dms/:id/pin` | nenhum | `ConversaFixadaEvent` (fixadaEm preenchido) | `api.fixarDM(channelId)` |
| DELETE | `/dms/:id/pin` | nenhum | `ConversaFixadaEvent` (`fixadaEm: null`) | `api.desafixarDM(channelId)` |

Regras para a API:
- A conversa precisa ser DM ou GROUP da qual eu participo. Senão, 404
  `"Conversa não encontrada"`. Canal de servidor também dá 404.
- As duas rotas são idempotentes: `PUT` numa conversa já fixada devolve o
  `pinnedAt` existente sem mudá-lo (upsert com `update: {}`), e `DELETE` numa
  não fixada devolve `null`. O evento sai nos dois casos.
- `DMsService.list`, `get`, `toView`/`comResumo` e todo lugar que monta
  `DMChannelView` preenchem `fixadaEm`. `list` ordena com `compararConversas`
  passando `criadaEm` (substitui o `.sort` atual por atividade).
- **Fechar a conversa** (`POST /dms/:id/hide`) apaga o `DMPin` e emite
  `dm.pinUpdated` com `null`, porque conversa fechada sai da lista. Sair do
  grupo (`leave`) e ser removido dele **não** apagam o pin por cascade (a FK
  é com `User`/`Channel`, não com `ChannelMember`). Apague o `DMPin`
  explicitamente na mesma transação que remove o `ChannelMember`.
- Sem teto de quantidade.

Web: a linha fixada mostra o alfinete. O menu mostra "Desafixar" (com ícone de
alfinete) quando `fixadaEm`, e "Fixar" quando não.

---

## 2. Nota de usuário (`api-relacoes`)

| | |
|---|---|
| Modelo | `UserNote { ownerId, targetId, text, updatedAt @updatedAt }`, `@@id([ownerId, targetId])` |
| Limite | `MAX_NOTA_DE_USUARIO = 256` |
| Schema de entrada | `notaDeUsuarioSchema = { nota: string }` (trim, máx. 256; **vazio apaga**) → `NotaDeUsuarioInput` |
| DTO | `NotaDeUsuario { userId: string; nota: string \| null }`; `NotasDeUsuario = Record<userId, string>` |
| Também em | `UserProfile.nota` (null quando `relationship === "self"`) |
| Evento WS | `WS_EVENTS.USER_NOTE_UPDATED` = `"user.noteUpdated"` → `user:<eu>`, payload `NotaDeUsuario` |

| Método | Path | Corpo | Resposta | Cliente web |
|---|---|---|---|---|
| GET | `/users/me/notes` | — | `NotasDeUsuario` (só as não vazias) | `api.minhasNotas()` |
| GET | `/users/:id/note` | — | `NotaDeUsuario` (`nota: null` se não há) | `api.notaDeUsuario(userId)` |
| PUT | `/users/:id/note` | `NotaDeUsuarioInput` | `NotaDeUsuario` | `api.salvarNotaDeUsuario(userId, nota)` |

Regras para a API:
- `PUT` com `nota` vazia (depois do trim) faz `deleteMany` e responde
  `nota: null`. Com texto, faz upsert.
- Nota sobre mim mesmo: 400 `"Não é possível anotar sobre si mesmo"`.
- Alvo inexistente: 404. Não é preciso ser amigo nem ter servidor em comum
  (como no Discord).
- **Ordem das rotas no Nest:** `GET me/notes` tem de ser declarado **antes**
  de qualquer `:id/...` de dois segmentos do mesmo controller. `me/notes` e
  `:id/note` não colidem (segmentos diferentes), mas mantenha a ordem.
- Mora no `UsersController`/`UsersService` ou num controller novo
  `notes.controller.ts` com `@Controller("users")`. A escolha é do cartão.

Web: carregar `minhasNotas()` no boot junto de `friends()`. "Adicionar nota" /
"Nota" com descrição "Visível apenas para você" abre a edição.

---

## 3. Apelido de amigo (`api-relacoes`)

| | |
|---|---|
| Modelo | `FriendNickname { ownerId, targetId, nickname, updatedAt @updatedAt }`, `@@id([ownerId, targetId])` |
| Limite | `MAX_APELIDO_DE_AMIGO = 32` |
| Schema de entrada | `apelidoDeAmigoSchema = { apelido: string }` (trim, 1–32) → `ApelidoDeAmigoInput` |
| DTO | `FriendLists.apelidos?: Record<userId, string>` (entregue em `GET /friends`); `UserProfile.apelidoDeAmigo` |
| Resposta/evento | `ApelidoDeAmigoEvent { userId: string; apelido: string \| null }` |
| Evento WS | `WS_EVENTS.FRIEND_NICKNAME_UPDATED` = `"friend.nicknameUpdated"` → `user:<eu>` |
| Nome na tela | `nomeParaMim(user, { apelidoDeAmigo, apelidoNoServidor })`: apelido de amigo > apelido no servidor > displayName > username |

| Método | Path | Corpo | Resposta | Cliente web |
|---|---|---|---|---|
| PUT | `/friends/:userId/nickname` | `ApelidoDeAmigoInput` | `ApelidoDeAmigoEvent` | `api.definirApelidoDeAmigo(userId, apelido)` |
| DELETE | `/friends/:userId/nickname` | — | `ApelidoDeAmigoEvent` (`apelido: null`) | `api.removerApelidoDeAmigo(userId)` |

Regras para a API:
- Só com amizade `ACCEPTED`. Sem ela: 400 `"Só é possível dar apelido a amigos"`.
- `DELETE` é idempotente.
- **Quando a amizade acaba** (`removeFriend`, `block`, de qualquer um dos dois
  lados), apague os `FriendNickname` **dos dois sentidos** e emita
  `friend.nicknameUpdated` com `null` para cada dono que tinha apelido.
- `FriendsService.lists` preenche `apelidos` só com os apelidos de quem ainda
  é amigo.
- Rotas no `FriendsController` existente. `:userId/nickname` não colide com
  `@Delete(":userId")` (segmentos diferentes).

---

## 4. Ignorar usuário (`api-relacoes`)

| | |
|---|---|
| Modelo | `UserIgnore { ignorerId, ignoredId, createdAt }`, `@@id([ignorerId, ignoredId])` |
| Schema de entrada | `ignorarUsuarioSchema = { userId: id }` → `IgnorarUsuarioInput` |
| DTO | `FriendLists.ignored?: PublicUser[]`; `UserProfile.ignorado?: boolean` |
| Resposta/evento | `UsuarioIgnoradoEvent { userId: string; ignorado: boolean; user: PublicUser }` |
| Evento WS | `WS_EVENTS.USER_IGNORED` = `"user.ignored"` → `user:<eu>` |
| Texto | `TEXTO_MENSAGEM_IGNORADA = "Mensagem ignorada"` |

| Método | Path | Corpo | Resposta | Cliente web |
|---|---|---|---|---|
| POST | `/friends/ignores` | `IgnorarUsuarioInput` | `UsuarioIgnoradoEvent` (`ignorado: true`) | `api.ignorarUsuario(userId)` |
| DELETE | `/friends/ignores/:userId` | — | `UsuarioIgnoradoEvent` (`ignorado: false`) | `api.deixarDeIgnorarUsuario(userId)` |

Semântica (Discord):
- **É diferente de bloquear.** O ignorado não fica sabendo, e nada muda para
  ele: continua mandando mensagem, DM e pedido de amizade. A amizade **não** é
  desfeita. Pode-se ignorar e bloquear a mesma pessoa, e as duas listas são
  independentes.
- O efeito é todo do lado de quem ignora, **e é a web que aplica**: mensagens
  do ignorado aparecem recolhidas atrás de "Mensagem ignorada" (clicar
  revela), não notificam, não tocam som e não contam em menção. A API não
  filtra histórico nem eventos.
- Ignorar a si mesmo dá 400. Alvo inexistente dá 404. As duas rotas são
  idempotentes.
- `FriendsService.lists` preenche `ignored` (ordem: `createdAt` desc).

Web: o menu mostra "Ignorar" / "Deixar de ignorar" conforme `ignored`.

---

## 5. Apelido por servidor (`api-servidor`)

| | |
|---|---|
| Modelo | `GuildMember.nickname String?` |
| Limite | `MAX_APELIDO_NO_SERVIDOR = 32`; `normalizarApelido()` (trim, vazio vira null) |
| Schema de entrada | `minhaAssociacaoEditarSchema` (ver §6, é a mesma rota) |
| DTO | `GuildMemberView.nickname?: string \| null`; `GuildMembership.nickname?: string \| null`; `UserProfile.nicknameNoServidor?` (com `?guildId=`) |
| Evento WS | **já existente** `WS_EVENTS.MEMBER_UPDATED` (`"member.updated"`) → `guild:<id>`, `MemberUpdatedEvent { guildId, userId, role, nickname }`. `role` = papel atual, `nickname` = valor novo (`null` = removido) |
| Mensagem | `Message` **não** ganha campo de membro. A web resolve o apelido do autor pela lista de membros do servidor (`GuildMemberView.nickname`) |

| Método | Path | Corpo | Resposta | Cliente web |
|---|---|---|---|---|
| PATCH | `/guilds/:guildId/membership` | `MinhaAssociacaoEditarInput` | `GuildMembership` (inteira, já atualizada) | `api.editarMinhaAssociacao(guildId, { nickname })` |

Regras para a API:
- Só o próprio membro edita, e qualquer membro pode (o bitfield do Streamz não
  tem `CHANGE_NICKNAME`, e esta entrega não cria bit). Quem não é membro leva
  o 403/404 de `assertMember`.
- Grava `normalizarApelido(nickname)`. Se o valor mudou, emite
  `member.updated` para `guild:<id>`.
- `GuildsService.listMembers`, o `MemberJoinedEvent.member` e todo lugar que
  monta `GuildMemberView` preenchem `nickname`. `OnboardingService.membership`
  preenche `nickname` e `permitirDmsDoServidor`.
- `UsersService` (perfil com `?guildId=`) preenche `nicknameNoServidor`. Se o
  arquivo for de outro cartão, `api-relacoes` preenche `nota`,
  `apelidoDeAmigo` e `ignorado`, e `api-servidor` preenche
  `nicknameNoServidor`. Combinem a ordem das edições no mesmo `toProfile`.
- Compat do Discord (opcional, mesmo cartão):
  `discord-compat/traducao/membro.ts` passa a mandar `nick: nickname` em vez
  de `null`. O `PATCH` de membro da compat **continua** recusando `nick` com
  texto (50013). Isso fica fora de escopo.
- A rota `/nick` do composer (`mensagens.ts`, `tipo: "apelido"`) pode passar
  a chamar `api.editarMinhaAssociacao`. Isso é trabalho da web.

Web: "Editar perfil por servidor" edita o apelido. A lista de membros e o
autor da mensagem usam `nomeParaMim`.

---

## 6. Privacidade por servidor (`api-servidor`)

| | |
|---|---|
| Modelo | `GuildMember.permitirDmsDoServidor Boolean @default(true)` |
| Schema de entrada | `minhaAssociacaoEditarSchema = { nickname?: string \| null; permitirDmsDoServidor?: boolean }` (parcial; objeto vazio → 400 `"Nada para editar"`) |
| DTO | `GuildMembership.permitirDmsDoServidor?: boolean` |
| Regra | `aceitaDmDeMembro({ amigos, permissoesNosServidoresEmComum })` (shared) |
| Erro | `ERRO_DM_NAO_PERMITIDA` (403) |
| Evento WS | **já existente** `WS_EVENTS.GUILD_SETTINGS_UPDATED` → `user:<eu>`, payload `{ guildId }` sem `onboarding`, que é o "releia sua associação" que a web já trata |

| Método | Path | Corpo | Resposta | Cliente web |
|---|---|---|---|---|
| PATCH | `/guilds/:guildId/membership` | `{ permitirDmsDoServidor: boolean }` | `GuildMembership` | `api.editarMinhaAssociacao(guildId, { permitirDmsDoServidor })` |
| GET (existente) | `/guilds/:guildId/membership` | — | `GuildMembership` (agora com os dois campos) | `api.membership(guildId)` |

Aplicação da regra (API, `DMsService.openWith`, só quando **não** é
`ignorarBloqueio`/admin e a DM ainda **não existe**):
1. Se `eu` e o destinatário são amigos (`ACCEPTED`), pode.
2. Senão, busque os servidores em comum e o `permitirDmsDoServidor` **do
   destinatário** em cada um.
3. Se `aceitaDmDeMembro(...)` for falso, 403 `ERRO_DM_NAO_PERMITIDA`.

Conversa que já existe continua abrindo e recebendo mensagem. Esta entrega não
filtra `message.create` em DM existente, e isso fica registrado como
divergência do Discord. Grupo de DM não é afetado. Um `PATCH` que envia os dois
campos grava os dois e emite os dois eventos cabíveis.

Web: "Config. de privacidade" no menu do servidor abre um modal com o
interruptor "Permitir mensagens diretas de membros do servidor".

---

## 7. Comandos de app de contexto (`api-comandos`)

| | |
|---|---|
| Modelo | `ApplicationCommand.type` (já existia, 1/2/3), com unicidade agora `[applicationId, guildId, type, name]`; `Interaction.targetId String?` (cuid do alvo, sem FK) |
| Constantes | `TIPO_DE_COMANDO_DE_APP = { CHAT_INPUT: 1, USER: 2, MESSAGE: 3 }`, `TipoDeComandoDeApp`, `ehComandoDeContexto(c)`, `NOME_DE_COMANDO_DE_CONTEXTO` (regex 1–32, sem quebra de linha/tab; aceita maiúscula e espaço) |
| DTO | `ComandoDeApp.tipo?: TipoDeComandoDeApp` (ausente = 1). Comando 2/3: `options: []`, `description: ""`. `InteracaoDaMensagem.tipo?` (a faixa "usou **Nome**" sem barra quando 2/3) |
| Schema de entrada | `interacaoCriarSchema` ganha `targetId?: id` |
| Evento WS | nenhum novo. `application.commandsUpdated` já cobre, e a resposta do bot sai como hoje (`message.new`, `interaction.*`) |

| Método | Path | Corpo | Resposta | Cliente web |
|---|---|---|---|---|
| GET | `/guilds/:id/comandos-de-app` | — | `ComandoDeApp[]` **só tipo 1** (inalterado, para o cliente antigo não pôr comando de contexto no composer) | `api.comandosDeApp(guildId)` |
| GET | `/guilds/:id/comandos-de-app?tipos=2,3` | — | `ComandoDeApp[]` dos tipos pedidos (lista separada por vírgula de 1/2/3; valor inválido → 400). Ordem: `name` asc | `api.comandosDeContexto(guildId)` |
| POST | `/channels/:id/interactions` | `{ commandId, targetId, options: [], nonce? }` | `InteracaoCriada` (inalterada) | `api.usarComandoDeContexto(channelId, { commandId, targetId, nonce })` |

Regras para a API (`interactions.service.ts` / controller):
- `comandosDoServidor` aceita o filtro de tipos (padrão `[1]`) e preenche
  `tipo` em todos.
- `criarInteracao`:
  - comando 1 com `targetId` → 400 `"Comando de barra não tem alvo"`;
  - comando 2/3 sem `targetId` → 400 `"Comando de contexto sem alvo"`;
  - comando 2/3 com `options` não vazio → 400.
  - Tipo 3: `targetId` é uma `Message` **do mesmo canal** da rota e visível
    para quem usa. Senão, 404 `"Mensagem não encontrada"`. Efêmera não é alvo.
  - Tipo 2: `targetId` é um `User` membro do servidor do canal. Senão, 404
    `"Usuário não encontrado"`.
  - Grava `targetId` e `commandName`. `type` da `Interaction` continua 2
    (APPLICATION_COMMAND).
  - Em DM continua 404, como o comando de barra (F5).
  - Faixa: `InteracaoDaMensagem.tipo` sai de `data.type` guardado.
- **Payload que o bot recebe** (`INTERACTION_CREATE`, `type: 2`), no padrão
  do Discord, com todos os ids em snowflake:

```jsonc
// comando de mensagem (tipo 3)
"data": {
  "id": "<snowflake do comando>", "name": "Traduzir mensagem", "type": 3,
  "guild_id": "<snowflake>",
  "target_id": "<snowflake da mensagem>",
  "resolved": { "messages": { "<snowflake da mensagem>": { /* objeto Message do Discord: mensagemParaDiscord(...) */ } } }
}
// comando de usuário (tipo 2)
"data": {
  "id": "…", "name": "Ver avatar", "type": 2, "guild_id": "…",
  "target_id": "<snowflake do usuário>",
  "resolved": {
    "users":   { "<sf>": { /* User do Discord */ } },
    "members": { "<sf>": { /* GuildMember do Discord SEM o campo user */ } }
  }
}
```

  Sem `options` em nenhum dos dois. O `member`/`user` de quem usou, o
  `channel`, o `token` etc. seguem como no comando de barra. A mensagem
  resolvida usa `traducao/mensagem.ts`, e usuário/membro usam
  `traducao/usuario.ts` / `traducao/membro.ts`, os mesmos do `resolved` da
  onda 3.
- **Registro pelo bot** (`discord-compat/rest/corpos-f3.ts`):
  - aceitar `type` 2 e 3 (hoje recusa com 50035);
  - para 2/3: `name` casa `NOME_DE_COMANDO_DE_CONTEXTO` (em vez da regra do
    comando de barra), `description` precisa ser `""` ou ausente (grava `""`),
    `options` precisa ser ausente ou vazio (senão 50035);
  - `normalizarComando` passa a guardar o `type` que veio (padrão 1), não
    mais `TIPO_CHAT_INPUT` fixo;
  - a checagem de nome repetido do `PUT` em bloco passa a ser por
    `(type, name)`;
  - o `GET/POST/PATCH applications/:app/…/commands` da compat devolve `type`
    guardado.
- Autocomplete (`pedirAutocompleteDeComando`) continua só para tipo 1:
  comando 2/3 dá 404.

Web: "Apps >" no menu de mensagem lista `tipo === 3`, e no menu de usuário
(DM, membro) lista `tipo === 2`. Em DM não há comandos (a API responde 404),
então o submenu mostra um item desabilitado. Ao escolher, chama
`usarComandoDeContexto` com um `nonce` da store `interacoes-de-bot` (o
fluxo de modal/falha é o mesmo do comando de barra).

---

## 8. Silenciar por 3 h (web)

`MUTE_PRESETS_MINUTES` é agora `[15, 60, 180, 480, 1440]` (ordem mantida), e a
API não valida contra a lista. O rótulo é da web:
`apps/web/lib/notification-menu.tsx` não tinha chave para `180`. Um cartão web
já pôs um rótulo de reserva ("Por 3 horas"). Se alguém mexer em
`apps/web/lib/i18n.ts`, o ideal é a chave `"notif.por180"` ("Por 3 horas" /
"For 3 hours") em `CHAVE_DA_DURACAO`.

---

## 9. Resumo dos nomes

**Tipos/schemas (shared):** `ConversaFixadaEvent`, `compararConversas`,
`MAX_NOTA_DE_USUARIO`, `notaDeUsuarioSchema`, `NotaDeUsuarioInput`,
`NotaDeUsuario`, `NotasDeUsuario`, `MAX_APELIDO_DE_AMIGO`,
`apelidoDeAmigoSchema`, `ApelidoDeAmigoInput`, `ApelidoDeAmigoEvent`,
`nomeParaMim`, `ignorarUsuarioSchema`, `IgnorarUsuarioInput`,
`UsuarioIgnoradoEvent`, `TEXTO_MENSAGEM_IGNORADA`, `MAX_APELIDO_NO_SERVIDOR`,
`minhaAssociacaoEditarSchema`, `MinhaAssociacaoEditarInput`,
`normalizarApelido`, `aceitaDmDeMembro`, `ERRO_DM_NAO_PERMITIDA`,
`TIPO_DE_COMANDO_DE_APP`, `TipoDeComandoDeApp`, `ehComandoDeContexto`,
`NOME_DE_COMANDO_DE_CONTEXTO`.

**Eventos:** `dm.pinUpdated`, `user.noteUpdated`, `friend.nicknameUpdated`,
`user.ignored` (novos, todos para `user:<eu>`); `member.updated` e
`guild.settingsUpdated` (existentes, reaproveitados).

**Cliente web (`api.*`):** `fixarDM`, `desafixarDM`, `minhasNotas`,
`notaDeUsuario`, `salvarNotaDeUsuario`, `definirApelidoDeAmigo`,
`removerApelidoDeAmigo`, `ignorarUsuario`, `deixarDeIgnorarUsuario`,
`editarMinhaAssociacao`, `comandosDeContexto`, `usarComandoDeContexto`
(`membership` e `comandosDeApp` já existiam).
