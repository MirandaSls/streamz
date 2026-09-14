# Contrato da onda 3 — mensagens de bot

Escrito pelo cartão **3.0-contrato** (2026-09-14), antes dos outros sete
cartões da onda 3 começarem. **É a única fonte que eles leem**: quem não viu o
diff do 3.0 encontra aqui os tipos, as tabelas, as rotas, os eventos e a store.

Meta da onda (ADR-0009): `Message` ganha **embeds e componentes de verdade**, a
web desenha embed rico, botões, selects, modais e Components v2 **como o
Discord**, e os callbacks de interação 6/7/8/9 (hoje 501) passam a existir.

Fontes da forma dos objetos (a API do Discord é a especificação do contrato),
conferidas no repositório `discord/discord-api-docs` em 2026-09-10:
`developers/components/reference.mdx`, `developers/resources/message.mdx` e
`developers/interactions/receiving-and-responding.mdx`. Nomes em snake_case e
números de tipo **iguais aos do Discord**, para bot de discord.js e discord.py
funcionar sem adaptação.

> **Medidas visuais não estão aqui.** Este documento é contrato de dados. Cor,
> tamanho, raio e espaçamento de cada peça saem do print 1:1 e do CSS medido,
> no cartão que desenha a peça (regra de autoridade do plano de paridade).

---

## 0. O que já está pronto (o diff do 3.0, em uma tabela)

| Onde | O quê |
|---|---|
| `packages/shared/src/mensagens-de-bot.ts` (novo, exportado pelo `index.ts`) | Tipos, schemas zod, limites, flags, validação, normalização, texto achatado, resolução de `attachment://`, corpos das rotas do navegador e payloads dos eventos |
| `packages/shared/src/midia.ts` | `Message` ganha `embeds?`, `components?`, `flags?` |
| `packages/shared/src/eventos.ts` | `WS_EVENTS.INTERACTION_SUCCESS/FAILED/MODAL/AUTOCOMPLETE` |
| `packages/shared/src/aplicativos.ts` | `OpcaoDeComando.autocomplete?` |
| `packages/shared/src/social.ts` | `previaDaMensagem`/`textoDaPrevia` usam o texto achatado quando `content` é vazio |
| `apps/api/prisma/schema.prisma` + `migrations/20260914120000_mensagens_de_bot/` | `MessageBotPayload` (nova), colunas novas em `EphemeralMessage` e `Interaction` |
| `apps/api/src/modules/messages/payload-de-bot.ts` (novo, puro) | O que gravar ao criar/editar; linha → campos do DTO; troca de emoji e `default_values` snowflake→cuid |
| `apps/api/src/modules/messages/messages.service.ts` | `criarComoBot`, `editarComoBot`, `payloadsDeBot`; DTO com `embeds/components/flags`; busca e trecho de resposta pelo texto achatado |
| `apps/api/src/modules/discord-compat/traducao/embed.ts` | `lerPayloadDeBot` (corpo cru → payload ou erros 50035), `errosNoFormatoDoDiscord`; o achatamento saiu da gravação |
| `apps/api/src/modules/discord-compat/traducao/mensagem.ts` | `mensagemParaDiscord` devolve `embeds/components/flags` guardados (`LinhaDeMensagemDeBot`) |
| `apps/api/src/modules/discord-compat/rest/messages.controller.ts` | `POST/PATCH/GET /channels/:id/messages` validam e guardam embeds/componentes/flags |
| `apps/api/src/modules/discord-compat/rest/webhooks.controller.ts` | followup e `@original` devolvem o payload de bot |
| `apps/api/src/modules/discord-compat/rest/corpos-f3.ts` | registro de comando guarda `autocomplete: true` |
| `apps/api/src/modules/interactions/{interactions.service,efemeras,dto,tipos}.ts` | callback 4/5, followup e `@original` guardam o payload (normal e efêmera); callback 5 liga `LOADING`; `commandName` pode ser null |
| `apps/web/lib/api.ts` | `clicarComponente`, `enviarModalDeBot`, `pedirAutocompleteDeComando` |
| `apps/web/stores/interacoes-de-bot.ts` (nova) | Pendentes, falhas, modal aberto, autocomplete |
| `apps/web/hooks/useRealtime.ts` | Os quatro eventos `interaction.*` ligados à store |
| `apps/web/components/chat/bot/HostDeModalDeBot.tsx` (stub) + `app/app/page.tsx` | Montado uma vez nos dois leiautes; não desenha nada ainda |
| `scripts/paridade/semente.mjs` | `#bots` com as três mensagens de referência (seção 8) |

Testes escritos (quem roda é o coordenador): `traducao/embed.spec.ts`,
`traducao/mensagem.spec.ts`, `rest/corpo-do-post.spec.ts`,
`messages/payload-de-bot.spec.ts`, `interactions/efemeras.spec.ts`,
`interactions/interactions.service.spec.ts`, `web/stores/interacoes-de-bot.test.ts`.

---

## 1. Tipos exportados do shared

Tudo em `packages/shared/src/mensagens-de-bot.ts`, importado **sempre** por
`@streamz/shared`. Os tipos de objeto são `z.infer` dos schemas homônimos
(`Embed` ↔ `embedSchema`, `Botao` ↔ `botaoSchema`…), então a forma abaixo é a
do schema.

### 1.1 Constantes

| Nome | Valor / forma |
|---|---|
| `FLAGS_DE_MENSAGEM` | todas as flags do Discord: `SUPPRESS_EMBEDS` 1<<2, `EPHEMERAL` 1<<6, `LOADING` 1<<7, `SUPPRESS_NOTIFICATIONS` 1<<12, `IS_COMPONENTS_V2` 1<<15 (e as outras, por completude) |
| `FLAGS_QUE_O_BOT_ENVIA` | `SUPPRESS_EMBEDS \| EPHEMERAL \| SUPPRESS_NOTIFICATIONS \| IS_COMPONENTS_V2` — o resto é descartado em silêncio, como no Discord |
| `FLAGS_GUARDADAS` | `LOADING \| SUPPRESS_NOTIFICATIONS \| IS_COMPONENTS_V2` — o que vai para a coluna `flags` |
| `temFlag(flags, flag)` | `boolean`, aceita `undefined` |
| `TIPO_DE_COMPONENTE` | `ACTION_ROW` 1, `BUTTON` 2, `STRING_SELECT` 3, `TEXT_INPUT` 4, `USER_SELECT` 5, `ROLE_SELECT` 6, `MENTIONABLE_SELECT` 7, `CHANNEL_SELECT` 8, `SECTION` 9, `TEXT_DISPLAY` 10, `THUMBNAIL` 11, `MEDIA_GALLERY` 12, `FILE` 13, `SEPARATOR` 14, `CONTAINER` 17, `LABEL` 18, `FILE_UPLOAD` 19, `RADIO_GROUP` 21, `CHECKBOX_GROUP` 22, `CHECKBOX` 23 |
| `ESTILO_DE_BOTAO` | `PRIMARY` 1, `SECONDARY` 2, `SUCCESS` 3, `DANGER` 4, `LINK` 5, `PREMIUM` 6 |
| `ESTILO_DE_TEXT_INPUT` | `SHORT` 1, `PARAGRAPH` 2 |
| `ESPACAMENTO_DO_SEPARATOR` | `SMALL` 1, `LARGE` 2 |
| `TIPOS_DE_SELECT` | `[3, 5, 6, 7, 8]` |
| `TIPO_DE_INTERACAO_DE_BOT` | `PING` 1, `APPLICATION_COMMAND` 2, `MESSAGE_COMPONENT` 3, `APPLICATION_COMMAND_AUTOCOMPLETE` 4, `MODAL_SUBMIT` 5 |
| `PRAZO_DA_RESPOSTA_DO_BOT_MS` | `3000` (o prazo do Discord para a primeira resposta) |
| `LIMITES_DE_EMBED` | 10 embeds, título 256, descrição 4096, 25 campos, nome 256, valor 1024, rodapé 2048, autor 256, total 6000 |
| `LIMITES_DE_COMPONENTE` | custom_id 100; 5 action rows (legado); 5 botões/row; rótulo do botão 80; url do botão 512; 25 opções/select; placeholder 150; 25 valores; rótulo/valor/descrição da opção 100; **40 componentes em v2**; 4000 caracteres de text display somados em v2; 3 text displays por section; 10 itens de galeria; descrição de mídia 1024; título do modal 45; 5 componentes no modal; rótulo do Label 45; descrição do Label 100; text input: rótulo 45, valor 4000, placeholder 100; radio 2–10 opções; checkbox group 10; upload 10 arquivos/10 tipos; 25 escolhas de autocomplete |

### 1.2 Objetos de mensagem

```ts
type EmojiParcial = { id?: string | null; name?: string | null; animated?: boolean };

// Unfurled Media Item. Só `url` é do bot; o resto o servidor preenche.
type ItemDeMidia = {
  url: string;                       // http(s)://… ou attachment://<nome>
  proxy_url?: string; width?: number | null; height?: number | null;
  content_type?: string;
  attachment_id?: string;            // cuid do Attachment no DTO do Streamz
};

type Embed = {
  title?: string; type?: string /* "rich" */; description?: string; url?: string;
  timestamp?: string /* ISO */; color?: number | null /* 0x000000–0xFFFFFF */;
  footer?: { text: string; icon_url?: string; proxy_icon_url?: string };
  image?: { url: string; proxy_url?: string; width?: number; height?: number };
  thumbnail?: /* igual a image */; video?: /* igual a image */;
  provider?: { name?: string; url?: string };
  author?: { name: string; url?: string; icon_url?: string; proxy_icon_url?: string };
  fields?: { name: string; value: string; inline?: boolean }[];
};
type CampoDeEmbed = NonNullable<Embed["fields"]>[number];
```

Componentes (todos com `id?: number`, que no DTO **sempre** vem preenchido):

| Tipo TS | `type` | Campos além de `type`/`id` |
|---|---|---|
| `ActionRow` | 1 | `components: FilhoDeActionRow[]` (1–5) |
| `Botao` | 2 | `style` 1–6, `label?`, `emoji?`, `custom_id?`, `sku_id?`, `url?`, `disabled?` |
| `SelectDeTexto` | 3 | `custom_id`, `options: OpcaoDeSelect[]` (1–25), `placeholder?`, `min_values?`, `max_values?`, `required?`, `disabled?` |
| `TextInput` | 4 | `custom_id`, `style` 1\|2, `label?` (forma antiga), `min_length?`, `max_length?`, `required?`, `value?`, `placeholder?` |
| `SelectDeUsuario` / `SelectDeCargo` / `SelectMencionavel` | 5 / 6 / 7 | campos do select + `default_values?: ValorPadraoDeSelect[]` |
| `SelectDeCanal` | 8 | idem + `channel_types?: number[]` |
| `Section` | 9 | `components: TextDisplay[]` (1–3), `accessory: Botao \| Thumbnail` |
| `TextDisplay` | 10 | `content` (markdown, ≤4000) |
| `Thumbnail` | 11 | `media: ItemDeMidia`, `description?`, `spoiler?` |
| `MediaGallery` | 12 | `items: ItemDaGaleria[]` (1–10) — `{ media, description?, spoiler? }` |
| `Arquivo` (File) | 13 | `file: ItemDeMidia` (só `attachment://`), `spoiler?`, `name?`, `size?` (preenchidos na saída) |
| `Separator` | 14 | `divider?` (padrão true), `spacing?` 1\|2 (padrão 1) |
| `Container` | 17 | `components: FilhoDeContainer[]` (1+: 1, 10, 9, 12, 14, 13), `accent_color?`, `spoiler?` |
| `Label` | 18 | `label`, `description?`, `component: FilhoDeLabel` (4, 3, 5–8, 19, 21, 22, 23) |
| `FileUpload` | 19 | `custom_id`, `min_values?`, `max_values?`, `required?`, `file_types?` |
| `RadioGroup` | 21 | `custom_id`, `options: OpcaoDeGrupo[]` (2–10), `required?` |
| `CheckboxGroup` | 22 | `custom_id`, `options: OpcaoDeGrupo[]` (1–10), `min_values?`, `max_values?`, `required?` |
| `Checkbox` | 23 | `custom_id`, `default?` |

Uniões: `ComponenteDeMensagem` (primeiro nível de mensagem: 1, 9, 10, 12, 13,
14, 17), `SelectDeBot` (3/5/6/7/8), `FilhoDeActionRow`, `FilhoDeContainer`,
`FilhoDeLabel`, `ComponenteDeModal` (18, 1, 10). Outros: `OpcaoDeSelect`
(`label`, `value`, `description?`, `emoji?`, `default?`), `ValorPadraoDeSelect`
(`id`, `type: "user"|"role"|"channel"`), `OpcaoDeGrupo` (`value`, `label`,
`description?`, `default?`).

```ts
type ModalDeBot = { custom_id: string; title: string; components: ComponenteDeModal[] };
type EscolhaDeAutocomplete = { name: string; value: string | number; name_localizations?: Record<string,string> | null };
type RespostaDeAutocomplete = { choices: EscolhaDeAutocomplete[] };
type PayloadDeBot = { content?: string; embeds?: Embed[]; components?: ComponenteDeMensagem[]; flags?: number };
```

### 1.3 `Message` (em `midia.ts`)

Três campos novos, opcionais pelo mesmo motivo de `interacao`/`efemera`
(payload antigo não os traz). **A API atual manda sempre**: `[]`, `[]` e `0`
numa mensagem comum.

| Campo | O que a tela faz com ele |
|---|---|
| `embeds?: Embed[]` | desenha os embeds, a menos que `flags & SUPPRESS_EMBEDS`. Mídias `attachment://` já vêm trocadas pela URL do anexo. |
| `components?: ComponenteDeMensagem[]` | desenha. `emoji.id` de emoji personalizado e o `id` dos `default_values` (usuário/cargo/canal) já vêm **em cuid** quando existem no Streamz; senão fica o snowflake que o bot mandou (emoji: caia para o `name`; valor padrão: ignore). |
| `flags?: number` | `SUPPRESS_EMBEDS` → nenhum embed (rico nem prévia de link; é a coluna `suppressEmbeds` refletida). `EPHEMERAL` = `efemera: true`. `LOADING` → estado "<bot> está pensando…" e **ignore o `content`** (é o texto provisório `TEXTO_PENSANDO`). `SUPPRESS_NOTIFICATIONS` → não notifica nem toca som. `IS_COMPONENTS_V2` → não há `content` nem embeds, e **anexos só aparecem se um componente os citar** (use `anexosReferenciados`). |

### 1.4 Funções puras

| Função | Para quê |
|---|---|
| `validarPayloadDeBot(cru)` → `{ok, payload}` \| `{ok:false, erros}` | forma + limites de campo, e normaliza (trim, `type:"rich"`, `timestamp` ISO, apaga campos do servidor, numera `id`) |
| `conferirMensagemDeBot(estado)` → `ErroDePayloadDeBot[]` | regras de conjunto: v2 × legado, 40 componentes, 4000 de texto, 5 rows, composição da row, estilo × `custom_id`/`url`/`sku_id`, `min_values ≤ max_values`, `custom_id` único, File só `attachment://`, 6000 de embed, mensagem vazia |
| `validarModalDeBot(cru)` / `conferirModalDeBot(modal)` | o `data` do callback 9 (sem componente `disabled`, `custom_id` único, row antiga só com um text input) |
| `normalizarPayloadDeBot(p)` | idempotente |
| `contarComponentes(lista)` | a regra dos 40 |
| `lerEmbedsGuardados(json)` / `lerComponentesGuardados(json)` | `Json` do Prisma → lista tipada |
| `resolverAnexosDoPayload(embeds, components, anexos)` | `attachment://<nome>` → URL do anexo (+ `attachment_id`, `content_type`, dimensões; `name`/`size` no File) |
| `anexosReferenciados(embeds, components)` → `Set<string>` | nomes de arquivo citados — a v2 esconde os outros anexos |
| `achatarEmbeds(embeds, limite = 2000)` | embeds → texto (tolerante a `unknown[]`) |
| `achatarPayloadDeBot({content, embeds, components})` | content + embeds + text displays → texto |
| `textoAchatadoDaMensagem(m)` | `content` de mensagem de gente; texto achatado de mensagem de bot |

`ErroDePayloadDeBot = { caminho: (string|number)[]; codigo: string; mensagem: string }`.
A casca transforma a lista no `errors` aninhado do `50035`
(`errosNoFormatoDoDiscord`, `traducao/embed.ts`).

---

## 2. Banco

Migration `20260914120000_mensagens_de_bot`, aditiva. **A `Message` não ganhou
coluna** (regra "j-bots").

### `MessageBotPayload` (nova, 1:1 com `Message`)

| Coluna | Tipo | |
|---|---|---|
| `messageId` | TEXT PK, FK → `Message` ON DELETE CASCADE | |
| `embeds` | JSONB, `'[]'` | `Embed[]` validado e normalizado |
| `components` | JSONB, `'[]'` | `ComponenteDeMensagem[]` com `id` |
| `flags` | INT, 0 | só `FLAGS_GUARDADAS` (`SUPPRESS_EMBEDS` é `Message.suppressEmbeds`) |
| `flatText` | TEXT, `''` | `achatarPayloadDeBot` — busca e trecho de resposta |

Só existe linha quando há embed, componente ou flag guardada. `MESSAGE_INCLUDE`
do `MessagesService` faz `include: { botPayload: true }`.

### `EphemeralMessage` (colunas novas)

`embeds JSONB '[]'`, `components JSONB '[]'`, `flags INT 0`. Aqui `flags` guarda
`FLAGS_GUARDADAS | SUPPRESS_EMBEDS` (a efêmera não tem a coluna
`suppressEmbeds`); `EPHEMERAL` nunca (é a tabela).

### `Interaction` (colunas novas; é o que o 3a usa sem tocar Prisma)

| Coluna | Tipo | |
|---|---|---|
| `commandName` | agora **anulável** | null em componente/modal; a faixa "usou /…" some sozinha (`toInteracaoDaMensagem` devolve null) |
| `type` | INT, 2 | 2 comando, 3 componente, 4 autocomplete, 5 envio de modal |
| `customId` | TEXT? | `custom_id` do componente (3) ou do modal (5) |
| `componentType` | INT? | 2 ou 3/5/6/7/8 |
| `messageId` | TEXT?, FK → `Message` SET NULL, índice | mensagem de origem do componente |
| `ephemeralMessageId` | TEXT?, FK → `EphemeralMessage` SET NULL, índice | origem quando a mensagem é efêmera (exatamente um dos dois numa interação 3) |
| `nonce` | TEXT? | o do navegador; volta em todo `interaction.*` |
| `modal` | JSONB? | o `ModalDeBot` aberto pelo callback 9 — o envio confere contra ele |

Relações Prisma renomeadas (sem efeito no SQL): `Interaction.responseMessage`
é `"RespostaDaInteracao"`, `Interaction.message` é `"OrigemDaInteracao"`
(back: `Message.interacoesDeComponente`), `Interaction.ephemeralMessage` é
`"OrigemEfemeraDaInteracao"` (back: `EphemeralMessage.interacoesDeComponente`),
`Interaction.efemeras`/`EphemeralMessage.interaction` é `"EfemerasDaInteracao"`.

---

## 3. API: o que os serviços já fazem

### `MessagesService` (`modules/messages/messages.service.ts`)

| Método | |
|---|---|
| `criarComoBot(channelId, botUserId, { content, embeds, components, flags, carregando?, attachmentIds?, reply? })` | confere `User.isBot` (humano → 403), aplica máscara de flags, `conferirMensagemDeBot` (→ 400), grava a mensagem **e** a linha 1:1 no mesmo `INSERT`. Permissão, castigo, modo lento e "escrever é ler" continuam saindo do `create`. **Não emite**: quem chama emite `message.new`. |
| `editarComoBot(messageId, botUserId, patch: PayloadDeBot)` | semântica do PATCH do Discord (`gravacaoDaEdicao`): ausente não mexe; `LOADING` sai; `IS_COMPONENTS_V2` não desliga; `SUPPRESS_EMBEDS` segue o `flags` do corpo; a 1ª edição de um "pensando…" apaga o texto provisório e **não** marca `editedAt`. Upsert/delete da linha 1:1 numa transação. **Não emite.** |
| `payloadsDeBot(ids)` → `Map<id, {embeds, components, flags}>` | para a casca montar o objeto do Discord (sem `attachment://` resolvido e sem trocar emoji: o bot recebe o que mandou) |
| DTO (`getDTO`, histórico, busca…) | `embeds/components/flags` sempre presentes; `attachment://` resolvido; emoji e `default_values` snowflake→cuid (consulta só quando há algum citado) |
| busca | `content` **ou** `botPayload.flatText` |
| `MessageReplyRef.content` | cai para `flatText` quando o `content` da citada é vazio |

O composer humano **não chega** a nada disso: o `message.create` do socket não
tem os campos, e `criarComoBot` recusa autor que não é bot.

### Funções puras (`modules/messages/payload-de-bot.ts`)

`gravacaoDaMensagemNova(m, {temAnexos})`, `gravacaoDaEdicao(atual, patch)`,
`camposDeBotDoDTO(linha, anexos, mapas?)`, `snowflakesCitados(json)`,
`nenhumCitado(c)`, `trocarIdsDoDiscord(valor, mapas)`, `MAPAS_VAZIOS`,
`resumoDosErros(erros)`. **O 3a usa
`gravacaoDaEdicao` para o callback 7 numa efêmera**, igual ao que
`InteractionsService.editarOriginal` já faz.

### Casca do Discord

- `traducao/embed.ts`: `lerPayloadDeBot(corpo, estado?)` — corpo cru → payload,
  ou `ErrosPorCampo` aninhado para `corpoInvalido(...)`. Com `estado` confere o
  conjunto (criação); sem, só a forma (edição).
- `traducao/mensagem.ts`: `LinhaDeMensagemDeBot = LinhaDeMensagem & { payloadDeBot?: { embeds, components, flags } | null }`;
  `mensagemParaDiscord` devolve os três.
- `POST /v10/channels/:id/messages`: valida (50035 com detalhe), `criarComoBot`.
  `EPHEMERAL` é descartada. Corpo sem texto, embed, componente nem anexo →
  `50035 content[BASE_TYPE_REQUIRED]`.
- `PATCH /v10/channels/:id/messages/:mid`: `content`, `embeds`, `components`,
  `flags`; corpo sem nenhum dos quatro é no-op.
- `GET /v10/channels/:id/messages[/:mid]`: com o payload (`payloadsDeBot`).
- Webhooks (followup, `@original`): payload do DTO; efêmera com
  `flags | 64` (e não `= 64`, para não perder `IS_COMPONENTS_V2`).

### `InteractionsService` (callbacks 4/5, followup, `@original`)

- Corpo validado **antes** da tomada da resposta (inválido → 50035 sem gastar a
  interação). Callback 4 e followup conferem o conjunto; `editReply` só a forma.
- Callback 5: grava `TEXTO_PENSANDO` com `LOADING` (normal e efêmera).
- Efêmera: `gravacaoDaMensagemNova`/`gravacaoDaEdicao` nas colunas da própria
  tabela; DTO com `flags | EPHEMERAL`.
- `attachments` do corpo continua descartado com aviso (sem multipart nas rotas).

---

## 4. Rotas web → API (o 3a implementa)

REST **interno** (`JwtGuard`, erros no formato do Nest `{ statusCode, message }`,
que o `ApiError` da web lê). Os corpos já existem em zod no shared e os
clientes em `apps/web/lib/api.ts`. As três respondem **200** com
`InteracaoDeBotCriada` **na hora** e nunca esperam o bot:

```ts
interface InteracaoDeBotCriada { id: string /* cuid */; nonce: string; expiresAt: string /* ISO */ }
```

**Por que não HTTP que espera ~3 s**: o callback do bot pode cair em outra
instância da API (o tempo real passa pelo adaptador; um `await` em memória não),
e segurar uma conexão por tecla digitada no autocomplete é caro. O resultado
volta por evento na sala do usuário, casado pelo `nonce` — o mesmo desenho do
Discord, cujo cliente recebe a resposta pelo gateway.

### 4.1 Clicar componente

`POST /api/channels/:channelId/interactions/componente` — cliente
`api.clicarComponente(channelId, body)`.

```ts
// cliqueEmComponenteSchema
{ messageId: string;              // cuid da Message OU da EphemeralMessage
  customId: string;               // 1–100
  componentType: 2 | 3 | 5 | 6 | 7 | 8;
  values?: string[];              // só select: 3 → os `value`; 5/6/7/8 → cuids
  nonce: string }                 // 1–64, gerado pelo navegador
```

O que a API faz: acha a mensagem (normal, ou efêmera cujo `ephemeralFor` é quem
clicou), confere que o autor é o usuário-bot de um aplicativo membro do
servidor, que o `custom_id` existe **nesta** mensagem com esse `componentType`,
não está `disabled` e (select) que `values` respeita opções e
`min_values`/`max_values`; cria `Interaction { type: 3, customId,
componentType, messageId | ephemeralMessageId, nonce, commandName: null }` e
despacha `INTERACTION_CREATE` com `message` (o objeto do Discord da mensagem de
origem, com `flags` 64 se efêmera) e `data: { custom_id, component_type,
values?, resolved? }` (5/6/7/8: snowflakes em `values` e `resolved`).

| Status | Quando |
|---|---|
| 400 | corpo inválido; `values` em botão; valor fora das opções ou contagem fora de min/max; componente desabilitado; tipo não bate |
| 403 | não vê o canal |
| 404 | mensagem não existe / não é do canal / efêmera de outra pessoa; `custom_id` não está na mensagem; mensagem não é de bot de aplicativo; bot fora do servidor; conversa direta (DM com bot é F5) |

### 4.2 Enviar modal

`POST /api/channels/:channelId/interactions/modal` — `api.enviarModalDeBot`.

```ts
// envioDeModalSchema
{ interactionId: string;          // cuid da interação que RECEBEU o modal (vem no interaction.modal)
  customId: string;               // o custom_id do modal
  components: RespostaDeComponenteDeModal[];   // 1–5, forma do MODAL_SUBMIT do Discord
  nonce: string }

type RespostaDeComponenteDeModal =
  | { type: 18; id: number; component: RespostaDeCampoDeModal }
  | { type: 1;  id: number; components: [{ type: 4; id: number; custom_id: string; value: string }] }
  | { type: 10; id: number };

type RespostaDeCampoDeModal =
  | { type: 4; id; custom_id; value: string }
  | { type: 3 | 5 | 6 | 7 | 8; id; custom_id; values: string[] }   // 5–8: cuids
  | { type: 19; id; custom_id; values: string[] }                   // cuids de Attachment (POST /uploads)
  | { type: 21; id; custom_id; value: string | null }
  | { type: 22; id; custom_id; values: string[] }
  | { type: 23; id; custom_id; value: boolean };
```

A API confere contra `Interaction.modal` (existe, é de quem envia, não venceu,
`custom_id` igual, cada campo existe e respeita `required`/`min_length`/
`max_length`/opções), zera `modal` (um envio só), cria `Interaction { type: 5,
customId, messageId/ephemeralMessageId copiados da origem, nonce }` e despacha
`data: { custom_id, components, resolved? }` (+ `message` quando a origem foi um
componente).

| Status | Quando |
|---|---|
| 400 | corpo inválido; resposta não bate com o modal (campo inexistente, obrigatório vazio, tamanho/opção fora) |
| 404 | interação inexistente, de outra pessoa, vencida, sem modal (ou já enviado), `custom_id` diferente |

### 4.3 Pedir autocomplete

`POST /api/channels/:channelId/interactions/autocomplete` — `api.pedirAutocompleteDeComando`.

```ts
// pedidoDeAutocompleteSchema
{ commandId: string;
  options: { name: string; type: number; value: string | number | boolean; focused?: boolean }[]; // exatamente 1 focused
  nonce: string }
```

Cria `Interaction { type: 4, commandId, commandName, nonce }` e despacha o `data`
de comando com a opção em foco `focused: true` e `value` **em texto**.

| Status | Quando |
|---|---|
| 400 | corpo inválido; opção em foco não declara `autocomplete: true` |
| 403 | não pode escrever no canal |
| 404 | comando inexistente, bot fora do servidor, DM |

---

## 5. Eventos de tempo real

Todos em `WS_EVENTS` (`eventos.ts`), payloads em `mensagens-de-bot.ts`. **Todos
vão para `emitToUser(quem disparou)`**, nunca para o canal: carregando, falha,
modal e sugestões são de uma pessoa. Cada sessão reage só ao `nonce` que ela
gerou.

| Evento | Payload | Quem emite, quando |
|---|---|---|
| `interaction.success` | `InteracaoConcluidaEvent { interactionId, nonce, channelId, messageId: string\|null, customId: string\|null }` | 3a, no callback **4, 5, 6 ou 7** de uma interação 3 ou 5 (tira o "carregando") |
| `interaction.failed` | `InteracaoFalhouEvent { …mesmos campos…, motivo: "sem_resposta" \| "bot_offline" }` | 3a: `bot_offline` na criação quando o bot não tem sessão de gateway; `sem_resposta` aos `PRAZO_DA_RESPOSTA_DO_BOT_MS` sem callback (escrita condicional `respondedAt: null`), vencendo o token como o Discord ("the token will be invalidated") — callback atrasado leva 10062 |
| `interaction.modal` | `ModalDeBotAbertoEvent { interactionId, nonce, channelId, applicationId, bot: PublicUser, modal: ModalDeBot }` | 3a, callback **9** de interação 2 ou 3 (substitui o `success`) |
| `interaction.autocomplete` | `AutocompleteDeBotEvent { interactionId, nonce, choices: EscolhaDeAutocomplete[] }` | 3a, callback **8** de interação 4 |
| `message.new` | `Message` (já existia) | resposta 4/5 e followups: sala do canal; efêmera: sala do usuário |
| `message.updated` | `Message` (já existia) | **callback 7** e `editReply`: sala do canal; efêmera: sala do usuário. Não há evento novo para o 7 — a store de mensagens já sabe aplicar |

---

## 6. A store `apps/web/stores/interacoes-de-bot.ts`

`useInteracoesDeBot` (zustand).

### Estado

| Campo | Tipo | |
|---|---|---|
| `pendentes` | `Record<nonce, InteracaoPendente>` | `{ nonce, tipo: "componente"\|"modal"\|"autocomplete", channelId, messageId\|null, customId\|null, desde }` |
| `falhas` | `Record<messageId, FalhaDeInteracao>` | `{ motivo: "sem_resposta"\|"bot_offline"\|"erro", customId\|null, mensagem\|null, em }` — o "Esta interação falhou" da mensagem; some ao clicar de novo nela ou com `dispensarFalha` |
| `modal` | `ModalAberto \| null` | `{ interactionId, channelId, applicationId, bot, modal: ModalDeBot, enviando, erro, nonceDoEnvio }` |
| `autocomplete` | `AutocompleteEmCurso \| null` | `{ chave: "commandId:opção", nonce, carregando, escolhas }` |

Seletor puro: `componenteEstaPendente(estado, messageId, customId)`. Utilitário:
`novoNonce()`.

### Ações (as telas chamam)

| Ação | |
|---|---|
| `clicarBotao({id, channelId}, customId)` | estilos 1–4. **Link (5) abre a URL e premium (6) não chamam nada.** |
| `escolherNoSelect({id, channelId}, customId, componentType, values)` | 3: `value`s; 5–8: cuids. Chame ao **fechar** o select (como o Discord), não a cada marcação |
| `enviarModal(components)` | usa o modal aberto; `enviando` até `success` (fecha) ou `failed` (fica aberto com `erro`) |
| `fecharModal()` | Cancelar/Esc/fora; não avisa o bot |
| `pedirAutocomplete(channelId, commandId, options)` | o composer faz o *debounce*; resposta de pedido velho é descartada |
| `limparAutocomplete()` | |
| `dispensarFalha(messageId)` | |
| `limparTudo()` | troca de conta |

Ligadas pelo `useRealtime`: `aoConcluir`, `aoFalhar`, `aoAbrirModal`,
`aoReceberAutocomplete`. Falha de HTTP da rota vira `motivo: "erro"` com o texto
da API. Sem nenhum evento (socket caído), um relógio local de
`2 × PRAZO_DA_RESPOSTA_DO_BOT_MS` falha a interação — é só rede de segurança,
quem decide é o servidor.

### `HostDeModalDeBot`

`apps/web/components/chat/bot/HostDeModalDeBot.tsx`, `export default`, montado
**uma vez** em `app/app/page.tsx` (leiaute de colunas, ao lado do `ModalHost`, e
no celular ao lado do `ShellMobile`). Hoje lê `modal` e devolve `null`; quem
desenha troca o `return null`.

---

## 7. Onde o texto achatado ainda é usado

O achatamento **saiu** como forma de guardar. Continua existindo só onde não há
renderizador de embed/componente:

| Lugar | Como | Estado |
|---|---|---|
| Busca (`MessagesService.searchWhere`) | `content` **ou** `MessageBotPayload.flatText` | feito |
| Trecho da resposta citada (`MessageReplyRef.content`) | `content` ou `flatText` | feito |
| Prévia da lista de conversas no cliente (`previaDaMensagem`, no `message.new`) | `textoDeBot` quando `content` vazio | feito (shared) |
| Prévia da lista de conversas vinda da API (`DMsService.previas`, SQL cru) | falta juntar `flatText` | **pendente** — ver "faltando" do 3.0; DM com bot ainda é F5, então hoje não aparece |
| Notificação de desktop (`hooks/useRealtime.ts`, `notify` → `message.content`) | deveria usar `textoAchatadoDaMensagem(message)` e respeitar `SUPPRESS_NOTIFICATIONS` | **pendente** — o 3.0 não pode mudar os listeners existentes |
| Menções da caixa de entrada (`InboxService`) | continua lendo só `content` (mencionar dentro de embed não notifica, como no Discord) | decidido |
| Casca do Discord | **nunca**: devolve os objetos | feito |

---

## 8. A semente (`scripts/paridade/semente.mjs`, canal `#bots`)

Três mensagens do Pixel, pela casca (`POST /v10/channels/:id/messages`):

| Chave do manifesto | Hora | Conteúdo |
|---|---|---|
| `bot` | 15:30:30 | embed rico completo: autor com ícone e link, título com url, descrição com markdown (negrito, itálico, citação, código), `color` 0x5865F2, 3 campos inline + 1 não inline, `image`, `thumbnail`, rodapé com ícone e `timestamp` |
| `bot-componentes` | 15:31 | `content` + row 1 com os 5 estilos (primary com emoji 🔄, secondary, success, danger **desabilitado**, link) + row 2 com select de texto (3 opções, uma com emoji e uma `default`) |
| `bot-v2` | 15:32 | `IS_COMPONENTS_V2`: container `accent_color` 0xF0B232 com section (2 text displays + thumbnail), text display, separator (divider, spacing 2), media gallery (3 itens, um spoiler), file (`attachment://relatorio-do-servidor.pdf`, anexo da própria mensagem) e row com botão + link; fora do container, text display `-# Gerado pelo Pixel` |

A mensagem `bot` **não** é mais "remover prévia" (isso ligaria
`SUPPRESS_EMBEDS` e esconderia o embed). As imagens são `apps/web/public/icone-*.png`.

---

## 9. O que ficou para o 3a (e o que nenhum cartão tem ainda)

**3a — interações de componente (API):**

1. As três rotas da seção 4 (controller interno em `modules/interactions/`,
   `zodBody` com os schemas do shared).
2. `INTERACTION_CREATE` para os tipos 3, 4 e 5 (com `message` e `resolved`).
3. Callbacks em `InteractionsService.responder` (hoje 501):
   - **6** `DEFERRED_UPDATE_MESSAGE` — só em interação 3/5; toma a resposta e emite `interaction.success`.
   - **7** `UPDATE_MESSAGE` — só em 3/5; valida com `lerPayloadDeBot` (sem estado) e edita a **mensagem de origem**: `MessagesService.editarComoBot(messageId, botUserId, payload)` + `emitToChannel(message.updated)`, ou, na efêmera, `gravacaoDaEdicao` nas colunas + `emitToUser(message.updated)`. Emite `interaction.success`.
   - **8** `APPLICATION_COMMAND_AUTOCOMPLETE_RESULT` — só em 4; `respostaDeAutocompleteSchema`; `interaction.autocomplete`.
   - **9** `MODAL` — só em 2/3 (nunca em 5); `validarModalDeBot`; grava `Interaction.modal`; `interaction.modal`.
   - 4/5 numa interação 3/5 também emitem `interaction.success`.
4. `@original` de interação 3/5 é a **mensagem de origem** (é o que o Discord
   faz para o `editReply`/`update` de componente): `webhooks.controller.ts` e
   `editarOriginal` passam a olhar `Interaction.messageId`/`ephemeralMessageId`
   quando `responseMessageId` é null.
5. Relógio dos 3 s e `bot_offline` (seção 5).
6. `rest/interactions.controller.ts` (fora da lista do 3.0): o `with_response`
   ainda sobrescreve `flags: FLAG_EFEMERA` na efêmera (linha 143) — trocar por
   `flags | FLAG_EFEMERA`; e o `type` da interação no `InteractionCallbackResponse`
   está fixo em 2.

**Desenho (cartões 3b–3g), só leitura do contrato:** embed rico; action row e
botões (estilos, desabilitado, emoji, carregando via `componenteEstaPendente`,
"Esta interação falhou" via `falhas`); selects de mensagem (texto, usuário,
cargo, mencionável, canal); Components v2 (section, thumbnail, text display,
separator, media gallery, file, container, spoiler); o modal no
`HostDeModalDeBot` (Label, text input, selects, radio, checkbox, upload); o
autocomplete de opção no composer; o estado `LOADING`. Regras que valem para
todos: seção 1.3.

**Sem dono ainda (registrado no retorno do 3.0 ao coordenador):** o dispatch
`MESSAGE_CREATE`/`MESSAGE_UPDATE` do gateway dos bots sai com `embeds: []`
porque `DadosDeCompatService.SELECAO_DE_MENSAGEM` não seleciona `botPayload`;
a prévia de DM da API e a notificação de desktop (seção 7); upload multipart na
casca (sem ele, `attachment://` só resolve anexo mandado por `attachment_ids`,
a extensão do Streamz).
