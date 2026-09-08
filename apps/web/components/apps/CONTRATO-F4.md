# Contrato da F4 — diretório de aplicativos e portal do desenvolvedor

Fonte da verdade: `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` §11 (D7), §10 (o
modelo), §6 (permissões) e §12 (a fase). Este arquivo é o que os três lotes
combinaram **antes** de começar; onde ele e o documento divergem, a divergência
está registrada no fim, e o documento é corrigido no PR final.

Entrega da fase, na frase do usuário:

> o dono cria o app pela UI e pega o token; qualquer um encontra o bot em
> "Descobrir aplicativos" e o adiciona ao servidor escolhendo permissões; o bot
> aparece na lista de membros com a tag BOT.

**No desktop e no leiaute de celular.** Tudo que a F4 desenha existe nos dois:
no desktop como vista/modal, no celular como tela cheia/folha.

---

## 0. O que o coordenador já escreveu (não mexa)

Estes quatro arquivos foram editados **na `feat/bots-f4`, antes dos lotes**,
justamente para que ninguém os edite em paralelo. Eles são o contrato:

| Arquivo | O que ganhou |
|---|---|
| `packages/shared/src/aplicativos.ts` | `appEditarSchema`/`AppEditarInput`, `AppDoDiretorio`, `PaginaDoDiretorio`, `AppInstalacao`, `ServidorComOApp`, `appInstalarSchema`/`AppInstalarInput` |
| `apps/web/lib/api.ts` | o bloco `── j-bots · F4 ──` com **todos** os métodos do cliente |
| `apps/web/components/ui/icones.tsx` | `Bot` (a carinha de robô, ativo `figma/guilds-settings/integrations/bot.svg`) |
| este arquivo | o contrato |

**Se você precisa de um campo, de uma rota ou de um ícone que não está aqui,
peça ao coordenador.** Um contrato que cada lote estende sozinho deixa de ser
contrato — e os três lotes editando os mesmos quatro arquivos é exatamente o
conflito que esta fase foi desenhada para não ter.

Ícones que já existem e servem, **não crie outros**:

- `Apps` — as quatro formas (losango, triângulo, flor, estrela). É o ícone de
  "Descobrir aplicativos" na rail. Já está em `icones.tsx`.
- `Bot` — a carinha. É o ícone da aba "Aplicativos" nas configurações do
  usuário. Renderizado e conferido a 24, 48 e 96 px antes de entrar (§3.3 do
  processo: o `fill-rule="evenodd"` do segundo caminho é o que faz o rosto ser
  vazado em vez de mancha).
- `Compass` do Phosphor **não** é para isto, e o `explore.svg` do acervo **não
  é uma bússola** — está escrito em `icones.tsx`.

---

## 1. Divisão de lotes e quem pode tocar em quê

| Lote | Assunto |
|---|---|
| **A** | Portal do desenvolvedor (Configurações do usuário → "Aplicativos") |
| **B** | Descobrir aplicativos + a instalação (API e UI) |
| **C** | Tag BOT nos pontos de render + aba "Aplicativos" das configurações do servidor |

### Arquivos por lote

**Lote A — só estes:**

```
apps/web/components/settings/AplicativosTab.tsx        (novo)
apps/web/components/settings/tabs.tsx                  (uma linha + um import)
apps/web/lib/i18n.ts                                   (chaves nos DOIS dicionários)
apps/api/src/modules/applications/applications.controller.ts
apps/api/src/modules/applications/applications.service.ts
apps/api/src/modules/applications/*.spec.ts            (novos testes)
apps/api/src/modules/applications/applications.module.ts  → só o array `imports:`
```

**Lote B — só estes:**

```
apps/web/components/apps/DiretorioDeApps.tsx           (novo)
apps/web/components/apps/CardDeApp.tsx                 (novo)
apps/web/components/apps/AdicionarAoServidor.tsx       (novo)
apps/web/components/apps/PaginaDeApp.tsx               (novo, se precisar)
apps/web/stores/aplicativos.ts                         (novo)
apps/web/components/layout/GuildRail.tsx               ← o ÚNICO disputado; é seu
apps/web/app/app/page.tsx                              (a vista nova no desktop)
apps/web/components/mobile/ShellMobile.tsx             (a tela nova no celular)
apps/web/stores/mobile.ts                              (a `TelaMobile` nova)
apps/api/prisma/schema.prisma + a migration            (GuildApplication)
apps/api/src/modules/applications/diretorio.service.ts (novo)
apps/api/src/modules/applications/instalacao.controller.ts (novo)
apps/api/src/modules/applications/instalacao.service.ts    (novo)
apps/api/src/modules/discord-compat/gateway/dispatch.ts    (GUILD_CREATE/DELETE)
apps/api/src/modules/applications/applications.module.ts   → só `controllers:`/`providers:`
```

**Lote C — só estes:**

```
apps/web/components/ui/TagDeBot.tsx                    (novo)
apps/web/components/MemberList.tsx
apps/web/components/MessageItem.tsx
apps/web/components/ui/ProfilePopover.tsx
apps/web/components/modals/UserProfileModal.tsx
apps/web/components/chat/DMMemberList.tsx
apps/web/components/voice/TileDeVoz.tsx                ← NÃO é mais o VoiceGrid.tsx
apps/web/components/settings/server/AplicativosTab.tsx (novo)
apps/web/components/settings/server/tabs.ts            (uma linha)
```

### As três regras de convivência

1. **`GuildRail.tsx` é do lote B.** A e C não abrem esse arquivo. (§2.4 do
   processo.)
2. **`applications.module.ts` é tocado por A e B**, em arrays diferentes: A só
   em `imports:`, B só em `controllers:` e `providers:`. Se conflitar, o
   coordenador resolve — é uma lista.
3. **`lib/i18n.ts` é do lote A, sozinho.** B e C **não** usam i18n: o dicionário
   cobre só as telas de configuração; o resto do app é pt-BR escrito no
   componente. Não "aproveite para traduzir" o que está ao redor.

---

## 2. O modelo: o que falta no banco

Só uma tabela, a `GuildApplication` do §10. **É do lote B.**

```prisma
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
```

E a back-relation `installs GuildApplication[]` na `Application` e
`applications GuildApplication[]` na `Guild`.

Migration: `apps/api/prisma/migrations/2026090815xxxx_bots_instalacao/migration.sql`.
Aditiva pura — volta com um `DROP TABLE`. Valide num Postgres **descartável**,
nunca contra produção (§2 do processo, e `docs/…-BOTS…` §12).

`installedById` **não** tem relação declarada com `User` de propósito: o §10
não a declarou, e uma FK com `onDelete: Cascade` faria a saída de quem instalou
desinstalar o app do servidor. É um `String` que a leitura resolve à mão.

---

## 3. As rotas

Prefixo `/api`, `JwtGuard` em todas — este é o REST **interno**, o do
navegador. Não confundir com `/api/v10/**`, que fala `Authorization: Bot`.

### 3.1 Portal (lote A) — `@Controller("applications")`

| Verbo | Rota | Corpo | Resposta | Notas |
|---|---|---|---|---|
| POST | `/applications` | `appCriarSchema` | `AppCriado` | **já existe** |
| GET | `/applications` | — | `AppDetalhe[]` | **já existe** |
| POST | `/applications/:id/token` | — | `TokenCriado` | **já existe** |
| PATCH | `/applications/:id` | `appEditarSchema` | `AppDetalhe` | novo |
| DELETE | `/applications/:id` | — | 204 | novo |
| POST | `/applications/:id/icone` | multipart `file` | `AppDetalhe` | novo, `UPLOAD_THROTTLE` |
| DELETE | `/applications/:id/icone` | — | `AppDetalhe` | novo |
| GET | `/applications/:id/servidores` | — | `ServidorComOApp[]` | novo, só o dono |

Todas checam `app.ownerId === user.sub` e devolvem **404** para app que não
existe e **403** para app de outra pessoa — é o que `regenerarToken` já faz.

**Apagar o aplicativo** é a rota perigosa. A ordem importa:

1. para cada `GuildApplication`, faça o mesmo que o `DELETE` de instalação faz
   (tira o membro-bot, apaga o cargo, emite os eventos, manda `GUILD_DELETE`);
2. só então apague o **usuário-bot** (`prisma.user.delete`). A `Application`
   cai junto pelo `onDelete: Cascade` de `botUser`, e com ela tokens, comandos
   e interações.

Apagar a `Application` sozinha deixaria um `User` órfão com `isBot: true` — uma
conta que não faz login, não tem dono e continua na lista de membros de todo
servidor onde entrou. Se o lote A preferir não duplicar a lógica do lote B,
**chame o serviço do lote B** (é a dependência declarada A → B; combine com o
coordenador antes de inverter).

**Ícone:** copie o **ícone de servidor**, não o avatar — `guilds.service.ts`
`updateIcon`/`removeIcon` é o padrão com dono e permissão. Chave
`app-icons/${appId}/${randomUUID()}.${extensao}`, duas colunas (`iconKey` e a
URL derivada), `sniffImage` por magic bytes, apaga a chave anterior do bucket,
503 claro quando o storage não está configurado. `Application` **não tem coluna
`iconUrl`** — só `iconKey`; a URL é derivada na hora, como diz o §10 e como o
`paraDetalhe` do service já assume. Isso quer dizer uma rota pública de leitura
`GET /applications/:id/icone`? **Não**: reaproveite o proxy que já existe, ou
derive para o storage — decida, meça e escreva no PR o que escolheu.

**O que nunca pode acontecer:** o token em claro aparecer em log. A rota de
criação e a de regeneração devolvem o token no corpo; um log de erro genérico
que serialize a resposta o carregaria. Confira o `StructuredLogger` e diga no
PR o que encontrou (o §11 pede um redator para `Authorization`).

### 3.2 Diretório (lote B) — mesmo `@Controller("applications")`

| Verbo | Rota | Resposta |
|---|---|---|
| GET | `/applications/publicas?q=&cursor=&limit=` | `PaginaDoDiretorio` |
| GET | `/applications/:id` | `AppDoDiretorio` |

> **A ordem de declaração no controller é obrigatória.** `@Get("publicas")`
> **antes** de `@Get(":id")`. O Nest casa na ordem em que os handlers foram
> declarados; ao contrário, `publicas` vira um id e o diretório inteiro
> responde 404. Escreva um teste que pegue isso.

- `publicas` devolve **só** `publico: true`. Busca por `q` em `name` e
  `description`, `mode: "insensitive"`. Paginação por cursor opaco, no padrão
  de `admin.ts` (`proximoCursor`).
- `GET /applications/:id` devolve o app se ele for público **ou** se quem
  pergunta for o dono. Caso contrário **404** (não 403: um 403 confirma que o
  id existe, e a privacidade de um app privado inclui a existência dele).
- `servidores` é `_count` de `installs`. É a contagem inteira, não "os meus".

### 3.3 Instalação (lote B) — `@Controller("guilds/:guildId/aplicativos")`

| Verbo | Rota | Corpo | Resposta |
|---|---|---|---|
| GET | `/guilds/:id/aplicativos` | — | `AppInstalacao[]` |
| POST | `/guilds/:id/aplicativos` | `appInstalarSchema` | `AppInstalacao` |
| DELETE | `/guilds/:id/aplicativos/:applicationId` | — | 204 |

As três exigem `MANAGE_GUILD`, pela primeira linha do service:

```ts
await this.guilds.assertCanModerate(actorId, guildId, Permission.MANAGE_GUILD);
```

que devolve **403** com "Você não tem permissão para isso". É a prova 3 da fase.

#### O que `POST` faz, em ordem, numa transação

1. `assertCanModerate(..., MANAGE_GUILD)`.
2. Carrega a `Application`. Recusa (404) o que não é `publico` e não é meu.
3. **Trava a escalada de privilégio** — ver §4. 403 se falhar.
4. Cria o `Role` **gerenciado**: nome = nome do app, `permissions` = o que veio,
   `position` = pela mesma regra do `RolesService.create` (nunca acima do cargo
   mais alto de quem instala: `Math.min(maior + 1, Math.max(rank, 1))`).
5. Cria o `GuildMember` do usuário-bot (`role: "MEMBER"`) e o `GuildMemberRole`
   ligando o bot ao cargo.
6. Cria o `GuildApplication`.
7. Emite, pelo `RealtimeService`: `ROLE_CREATED` (o DTO do cargo) e
   `MEMBER_JOINED` (no formato exato de `invites.service.ts` — `joinedAt`
   **relido do banco**, não `new Date()`).
8. O bot entra nas salas (`joinGuildRoom` + `joinChannelRooms`), como um membro
   novo qualquer.

Instalação repetida do mesmo app no mesmo servidor: o `@@unique` recusa.
Trate a colisão como **edição das permissões** (atualiza o cargo) ou como 409 —
escolha, e escreva no PR qual e por quê. O Discord edita.

#### O que `DELETE` faz

O inverso, e na ordem inversa: apaga o `GuildApplication`, o `GuildMemberRole`,
o `GuildMember` do bot e o `Role`; emite `MEMBER_LEFT` e `ROLE_DELETED`; tira o
bot das salas.

Cuidado com a **ordem dos eventos de exclusão**: a `PonteDeEventos` recupera o
snowflake de um cargo apagado da memória que ela montou no `GUILD_CREATE`
(`MemoriaDeIds`, `dispatch.ts`). Se o `role.deleted` sair depois de o bot já ter
recebido `GUILD_DELETE`, ninguém escuta — e tudo bem, porque o bot já saiu. O
que **não** pode é a linha do banco sumir antes de o evento ser montado.

### 3.4 O gateway compat (lote B)

O bot conectado precisa saber que entrou e que saiu. Os dois dispatches:

| Quando | Dispatch | Para quem |
|---|---|---|
| instalação | `GUILD_CREATE` | as sessões do usuário-bot daquele app |
| remoção | `GUILD_DELETE` `{ id, unavailable: false }` | idem |

**Faça pelo gancho que já existe, não por uma chamada nova.** A
`PonteDeEventos` (`discord-compat/gateway/dispatch.ts`) já ouve
`RealtimeService.onEvent` e já trata `member.joined` → `GUILD_MEMBER_ADD` e
`member.left` → `GUILD_MEMBER_REMOVE`. A regra a acrescentar é:

> quando o membro que entrou/saiu **é o usuário-bot de uma sessão viva**
> (`registro.porBot(userId)` devolve alguma coisa), aquela sessão recebe
> `GUILD_CREATE` (via `montarGuildCreate(guildId, botUserId)`, que já é público)
> ou `GUILD_DELETE`, **em vez** do `GUILD_MEMBER_ADD`/`REMOVE` sobre si mesma.

Assim `modules/applications/` não precisa importar nada de `discord-compat/`, o
acoplamento fica em zero, e a regra vale também para o bot que entra por outro
caminho. Teste isso em `dispatch.spec.ts`, que já tem a bancada montada.

---

## 4. A trava que não pode faltar: escalada de privilégio

Quem instala **não pode conceder ao bot o que ele mesmo não tem.** Sem isso,
qualquer pessoa com `MANAGE_GUILD` fabrica um cargo com `ADMINISTRATOR`,
instala um bot que ela controla e passa a mandar no servidor — `MANAGE_GUILD`
vira `ADMINISTRATOR` de graça.

A regra, no service, **antes** de criar o cargo:

```ts
const meus = await this.guilds.permissionsOf(actorId, guildId);
// dono e ADMINISTRATOR podem conceder tudo; o resto, só o que tem
if (!hasPermission(meus, Permission.ADMINISTRATOR) && (permissions & ~meus) !== 0) {
  throw new ForbiddenException("Você não pode conceder uma permissão que não tem");
}
```

`permissionsOf` já devolve `ALL_PERMISSIONS` para o dono e para quem tem
`ADMINISTRATOR` (ver `computePermissions` em `permissoes.ts`), então a primeira
metade da condição é redundante e está ali só para dizer a intenção em voz alta.

O `RolesService` já tem um `validarPermissoes(actorId, guildId, permissions)`
que faz exatamente isso. **Use ele** em vez de reescrever — e se ele fizer algo
diferente do que está escrito aqui, o que vale é ele, e o PR diz.

Isto **não** é validável no schema zod: um schema não conhece o autor. O
`appInstalarSchema` só garante que o bitfield cabe em `ALL_PERMISSIONS`.

E na UI: a tela "Adicionar ao servidor" **desabilita** (não esconde) as
permissões que quem instala não tem, com a explicação — é o que o
`EditorDePermissoes` já faz nos overrides de canal.

---

## 5. As telas

### 5.1 Lote A — o portal, em `Configurações do usuário → Aplicativos`

Aba nova é uma linha em `components/settings/tabs.tsx`:

```tsx
{ id: "aplicativos", group: "usuario", label: "aba.aplicativos", icon: <Bot size={20} />, Component: AplicativosTab },
```

mais a chave `"aba.aplicativos"` nos **dois** dicionários de `lib/i18n.ts` (o
`EN_US` é `Record<ChaveDeTexto, string>`: esquecer quebra o typecheck, não a
tela). O `id` vira o deep link `?settings=aplicativos`.

O componente é `default export`, **sem props**, devolve um fragmento sem
moldura própria (o chrome é da `JanelaDeConfiguracoes`), lê de store zustand e
usa `Section`/`Toggle`/`ToggleLinha` de `components/ui/controls.tsx`. Modelo
mais curto: `IdiomaTab.tsx`.

Cinco telas dentro da aba (§11):

1. **Lista** — ícone, nome, "publicado / privado".
2. **Criar** — só o nome. Ao salvar, o painel do token.
3. **Editar** — nome, descrição, ícone, permissões sugeridas, e o interruptor
   **"Publicar no diretório"**.
4. **Token** — "Regenerar" com **confirmação dupla** ("o bot atual vai parar de
   funcionar na hora"), mostra o novo uma vez, revoga o anterior.
5. **Servidores** — onde está instalado, com "Remover" (chama a rota do lote B).

**O painel do token** é a peça que não pode sair errada:

- aparece **uma vez**, na resposta de criar ou de regenerar;
- botão "Copiar" (`navigator.clipboard`), com retorno visível;
- aviso explícito de que fechou, perdeu;
- fora dele, a UI mostra **só o `tokenPrefixo`** (8 caracteres) e o
  `tokenCriadoEm`. O prefixo identifica **o bot**, não o token, e não muda ao
  regenerar — quem distingue um token do outro na tela é a data.
- o token **não** vai para store, nem para `localStorage`, nem para log. Estado
  local do componente, e some quando o painel fecha.

**"Como apontar seu bot"** é uma seção da própria aba, com os trechos do §14
(discord.js v14, discord.py, Lavalink) já com **a URL desta instância** — monte
a partir de `API_URL` (`lib/config.ts`), não escreva `api.streamz.chat` na
mão. Atenção aos três detalhes que o §14 mediu e que vão no trecho:

- discord.js: `rest.api` **sem** `/v10` (a lib acrescenta);
- discord.py: `Route.BASE` **com** a versão, **e** a segunda linha do
  `DEFAULT_GATEWAY` — sem ela o bot abre o WebSocket no Discord de verdade;
- Lavalink: nada muda.

Cada trecho com botão de copiar.

### 5.2 Lote B — "Descobrir aplicativos"

**Vista própria, não uma aba da descoberta de servidores.** O "Descobrir
servidores" foi removido de propósito e **fica removido** — o comentário no
`GuildRail.tsx` diz que este é um produto onde se entra por convite. Não
reabra essa decisão, não acrescente descoberta de servidor de tabela.

- **Entrada**: um `RailItem` na `components/layout/GuildRail.tsx`, com o ícone
  `Apps` e tooltip "Descobrir aplicativos". Posição: **abaixo do `+`**, no fim
  da rail (o `+` é o último hoje, L473-480; a divisória está em L442 e o
  comentário sobre descoberta em L469-472). Reaproveite o `RailItem` que já
  existe — ele ganhou props `lado` e `redondo` no #170, e o rail inteiro é
  parametrizado por `GuildRail({ compacto })` (L222): `lado={compacto ? 48 :
  40}`, e o ícone muda de tamanho no celular. **O item novo tem que respeitar
  `compacto`**, como os quatro que já estão lá; quem passa a prop é
  `telas-base.tsx:74` (`<GuildRail compacto />`).
- **Vista**: no desktop, o par `useUI.view` + um booleano de store, do mesmo
  jeito que Amigos faz (`ui.setView("dm")` + `useFriends.setOpen(true)`, e o
  `DMView` decide). A store nova é `stores/aplicativos.ts`, com
  `aberto: boolean` e `abrir()/fechar()`. **Não** invente um terceiro valor em
  `UIState.view` (`"guild" | "dm"`): a coluna 1 e a 2 continuam existindo, e o
  Discord também abre o diretório por cima da coluna 3.
- **Grade de cards**: ícone 80, nome, descrição de uma linha, botão "Adicionar
  ao servidor", busca no topo. As medidas saem de `docs/Reference/apps/` — meça
  com Pillow (§6.3), não estime.
- **Página do app**: ícone grande, nome, descrição, "em N servidores", botão
  "Adicionar ao servidor".
- **"Adicionar ao servidor"**: modal no desktop, folha/tela cheia no celular.
  (i) escolher o servidor — **só os em que tenho `MANAGE_GUILD`**, o que sai de
  `stores/permissions.ts`/`useCan`, e a API repete a checagem; (ii) a lista de
  permissões com toggles, **agrupada pelo campo `group` de `PERMISSION_INFO`**,
  na ordem de `PERMISSION_ORDER`, pré-marcada com `permissoesPadrao`, e com o
  que eu não tenho **desabilitado**; (iii) "Autorizar".

O agrupamento é o do `CargosTab.tsx` (`geral`/`membros`/`mensagens`/`voz`), e
não o `secoesDePermissoes(escopo)`, que é do editor de overrides de canal. Um
cargo de servidor não tem escopo de canal.

### 5.3 Lote C — a tag BOT

Uma `<TagDeBot />` em `components/ui/`, uma vez, para não repetir o estilo em
seis lugares. Pílula pequena com o texto **BOT**, ao lado do nome, na cor de
destaque, com `aria-label`.

> O Discord renomeou a pílula de **BOT** para **APP** em 2024. Nós ficamos com
> **BOT**: é o que o §11 do documento e a entrega do usuário pedem. Registre o
> fato no PR, com a captura ao lado, para quem vier depois não "corrigir".

Os pontos de render (o §11 lista seis; na prática são mais, porque o
`MessageItem` tem dois caminhos):

| Arquivo | Onde |
|---|---|
| `components/MemberList.tsx` | irmã dos selos `Crown`/`ShieldCheck`/`Timer`, dentro do `<span className="flex … gap-1">` do nome |
| `components/MessageItem.tsx` | ao lado do autor — **modo normal e modo compacto**, e a barra de resposta |
| `components/ui/ProfilePopover.tsx` | ao lado do nome |
| `components/modals/UserProfileModal.tsx` | ao lado do nome |
| `components/chat/DMMemberList.tsx` | idem (mesmo padrão do `MemberList`) |
| `components/voice/TileDeVoz.tsx` | ao lado do nome no tile — **não é mais o `VoiceGrid.tsx`**, o #170 moveu |

Onde a pílula entra, os arquivos se dividem em dois grupos, e o segundo é o que
dá trabalho:

- **Com precedente móvel** — `MemberList.tsx` (7 `celular:`, linha de 60px e
  alvos de 44) e `DMMemberList.tsx` (4). Nenhuma delas está no `<span>` do
  nome; o que elas dizem é qual é a caixa em que a pílula vai caber.
- **Sem precedente nenhum** — `ProfilePopover.tsx`, `UserProfileModal.tsx` e
  `TileDeVoz.tsx` têm **zero** `celular:`. Nesses três o comportamento móvel da
  pílula se decide do zero: meça no aparelho emulado e escreva no PR o que
  escolheu. `MessageItem.tsx` tem seis `celular:`, mas todas em reações e na
  barra de ações — nenhuma perto do nome do autor.

**Antes de escrever JSX, confirme que o dado chega.** `PublicUser.bot` é
preenchido por `toPublicUser` a partir de `u.isBot ?? false`, e o `?? false`
quer dizer "a query não trouxe a coluna". As consultas internas usam
`include: { user: true }` (trazem tudo), mas isso é **verificação sua**: para
cada um dos seis pontos, siga o dado da rota até o componente e diga no PR
onde conferiu. Um `select:` que esqueça `isBot` faz a tag nunca aparecer, e
nenhum teste pega.

**Aba "Aplicativos" das configurações do servidor**: registro próprio em
`components/settings/server/tabs.ts` (não o `tabs.tsx` da raiz, e **sem**
i18n — as abas de servidor têm o rótulo escrito). Lista os apps instalados
(`api.appsDoServidor`) com ícone, nome, quem instalou, as permissões concedidas
e "Remover" com confirmação. Só aparece para quem tem `MANAGE_GUILD`.

### 5.4 O celular — vale para os três lotes

O leiaute de celular entrou na `main` no PR #170. **Não é opcional**: o que a
F4 desenha existe nos dois leiautes. Leia `docs/LEIAUTE-MOBILE-COBERTURA.md`
antes de escrever a primeira classe.

**O padrão do #170, e o que a F4 tem que imitar:** o componente é **um só**,
parametrizado de fora; o arquivo do desktop fica intocado. É o que
`GuildRail({ compacto })`, `InboxPopover modoTela` e o `COLUNA_INTEIRA` de
`telas-base.tsx` fazem. **Não** duplique um componente "versão celular".

- **Quem escolhe o shell**: `apps/web/app/app/page.tsx:113` →
  `if (ehMobile) return <ShellMobile />;`. O `min-w-[940px]` do shell de quatro
  colunas continua lá, agora com `data-shell-desktop` + `max-md:hidden`
  (page.tsx:126-129) e uma regra irmã em `globals.css:325-329` para o telefone
  deitado.
- **A consulta**: `hooks/useEhMobile.ts:45` (`CONSULTA_MOBILE`) e a variante
  Tailwind **`celular:`** em `tailwind.config.ts:128-130` são a **mesma
  string**, e têm que continuar sendo. Use `celular:` — **não** `max-md:`, que
  deixa o telefone deitado de fora (844×390 é celular para o hook e desktop
  para o `max-md`).
- **`ShellMobile.tsx` não tem um switch único**: uma base por aba
  (`inicio`/`notificacoes`/`voce`, L161-168) e telas empilhadas por
  `{topo === "…" && <TelaEmpilhada><Tela…/></TelaEmpilhada>}` (L191-213). A
  barra de abas some quando há tela empilhada (L225).
- **Tela cheia nova são quatro passos** (o molde é `TelaDeAmigos`,
  `telas-de-conversa.tsx:303`): (1) o membro novo na união `TelaMobile` de
  `stores/mobile.ts:35-43`; (2) a tela, que devolve `CabecalhoMobile` + o
  componente do desktop e **não** desenha a moldura (isso é a `TelaEmpilhada`,
  posta pelo shell); (3) a guarda no `ShellMobile`; (4) quem empilha.
- **Quem empilha**: a navegação do celular é **delegação de clique** por
  `onClickCapture` (`ShellMobile.tsx:92-126`) lendo atributos `data-*`
  (`data-channel-button`, `data-dm-button`, `data-amigos-button`). O lote B, ao
  pôr o item novo na rail, segue esse padrão — um `data-apps-button` no botão
  e a regra em `aoTocarNaLista` —, em vez de espalhar `if (ehMobile)` pelo
  componente. (Repare no `setTimeout(…, 0)` de L112: a escuta é de captura e
  roda antes do `onClick` do botão; uma microtarefa correria cedo demais.)
- **As peças prontas** estão em `components/mobile/pecas.tsx`: `BotaoDeToque`
  (44×44), `CabecalhoMobile` (56px, com voltar/título/ações) e `TelaEmpilhada`
  (a moldura `absolute inset-0 z-10` com a animação de entrada). Use as três;
  não recrie cabeçalho.
- **`components/mobile/FolhaInferior.tsx` é código morto** — nunca importado, e
  `abrirFolha`/`FolhaMobile` de `stores/mobile.ts` nunca são chamados (o ramo
  `if (s.folha)` do `voltar()` é inalcançável). As folhas de verdade do app são
  três, cada uma com o seu `anim-folha`: `PopoverFlutuante.tsx:134-146`,
  `ContextMenu.tsx:290-293` (a prop `folha`, ligada em L517 com
  `folha={ehMobile}`) e `PickerPanel.tsx:179`. **Não adote nem apague o
  `FolhaInferior` nesta fase** — é decisão de outro trabalho. Para "Adicionar ao
  servidor" no celular, use o padrão que já está em uso, ou uma tela cheia
  empilhada, e diga no PR qual e por quê.
- **Configurações no celular** (interessa ao lote A) **não** é tela empilhada:
  é o modal `{ kind: "settings" }` da pilha de `useUI`, e a
  `ui/JanelaDeConfiguracoes.tsx` tem um ramo `if (ehMobile)` (L295) em
  **mestre-detalhe**: lista de seções em cartões → tocar empurra a seção em
  tela cheia. `SETTINGS_TABS` é o **mesmo registro** do desktop, sem alteração
  — a aba nova do lote A ganha o comportamento móvel de graça, mas o
  **conteúdo** dela (o painel do token, o formulário, os trechos de código) é
  responsabilidade do lote A caber em 390px. Duas camadas de voltar do Android
  já estão ligadas (`useVoltarNoCelular`, L281-282).
- **Medidas literais.** A raiz é 15,5px (`globals.css`) e o Tailwind mede em
  `rem`: todo tamanho nominal sai 3% menor (`h-11` mede 42,6, não 44). Regra do
  §6.3 e do cabeçalho de `pecas.tsx`: **px literal onde o número significa
  alguma coisa** (medida da captura, piso de toque de 44px), escala do Tailwind
  só onde não significa. As constantes em uso: alvo `h-[44px] w-[44px]`,
  cabeçalho `h-[56px]`, barra de abas `h-[48px]`, linha de membro
  `celular:h-[60px]`, teto de folha `max-h-[85dvh]`, área segura
  `pb-[env(safe-area-inset-bottom)]`.
- **Meça o que o código entrega**, com `getBoundingClientRect` no aparelho
  emulado — não lendo a classe. Foi assim que quatro branches descobriram que
  "44" media 43 e a cápsula "de 40" media 58.

---

## 6. Referências visuais

`docs/Reference/apps/` (fora do git) tem as capturas do App Directory e do
Developer Portal do Discord que o coordenador levantou, com `FONTES.md` (de
onde veio cada uma) e `MEDIDAS.md` (medidas com Pillow, em px CSS). É o
equivalente do que o mobile fez em `docs/Reference/mobile/`.

Meça de lá e reproduza. Onde a captura não der para medir com confiança,
escreva "não medido" no PR em vez de chutar (§6.3 — "um número inventado vira
um pixel errado no app").

---

## 6.1 A bancada de render (já montada — use, não recrie)

`/tmp/claude-0/-root/4f78f313-6c03-46bf-81af-d6ffe7f819d9/scratchpad/HARNESS.md`
descreve tudo que está no ar: Postgres `streamz_mobile`, a API do harness em
`:3334`, a web da base em `:3001`, a web do `origin/main` (baseline) em `:3002`,
e o contêiner `mobile-shots` com Chromium + Playwright. Há uma **conta semeada**
(`anaxipwp`/`betoxipwp`) e um servidor com canais — **use-a, não registre outra**
(o registro tem teto de 5/hora por IP).

Suba a **sua** web numa porta entre 3003 e 3006, pelo receituário do
`HARNESS.md`. Os passeios:

```
# celular (390×844 @3×) — reaproveita a semente, não registra ninguém
node scripts/e2e-mobile.mjs --out /out/<seu-dir> --web http://localhost:300X \
  --perfil iphone --usuario xipwp

# regressão do desktop (1300×900, antes × depois) — o alvo é ZERO pixel
node scripts/e2e-desktop-diff.mjs --usuario anaxipwp \
  --antes http://localhost:3002 --depois http://localhost:300X --out /out/<seu-dir>
```

Passeio novo em `e2e-mobile.mjs` é uma linha `await foto(page, "NN-nome")` no
corpo linear, com um comentário do que a captura prova. Use os seletores
estáveis que já existem (`[data-channel-button]`, `nav[aria-label="Servidores"]`)
e acrescente o seu `data-*` em vez de casar por texto.

Duas armadilhas registradas no §6.3 do processo, que já custaram medição
repetida a quatro branches:

- **A tela inteira só serve para superfície que tapa a lista de mensagens.** Um
  modal que não tapa e a rolagem da lista muda a cada execução: o mesmo build
  contra ele mesmo já deu ~200 mil pixels. Para esses, recorte o **retângulo do
  elemento** (`locator.screenshot` + `boundingBox`).
- **`page.click()` manda `pointerType: "mouse"`** mesmo com `hasTouch`. Dica
  presa e estado de `hover` numa captura de celular são suspeitos de harness,
  não defeito: repita com `Input.dispatchTouchEvent` antes de reportar.

Diferença de imagem com Pillow em docker (`python:3-slim` + `pip install
pillow`); o host não tem Pillow nem ImageMagick.

---

## 7. Como cada lote trabalha

1. Worktree própria a partir de **`origin/feat/bots-f4`** (não de `main`):
   `git worktree add /opt/stack/streamz/.claude/worktrees/bots-f4-<x> -b feat/bots-f4-<x> origin/feat/bots-f4`.
   **Nunca `git checkout`/`switch` em `/opt/stack/streamz`. Nunca `worktree remove`.**
2. **Sem node no host** — tudo em `docker run --rm node:22`. Cada lote roda o
   que cobre o **seu** lote (`pnpm --filter @streamz/shared build`, `prisma
   generate`, `tsc --noEmit`, os testes que escreveu). A verificação **completa**
   roda **uma vez, no fim, pelo coordenador**: agente rodando verificação sobre
   a árvore parcial dos outros dá falso vermelho (§6.4).
3. **Renderize e olhe.** Typecheck não pega ícone virado mancha nem tag torta
   (§3.3). Cada lote entrega prints do que fez, desktop **e** celular.
4. Commits em português, cada um terminando com:

   ```
   Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
   Claude-Session: https://claude.ai/code/session_01PT5Ze54BcXtgjyMfWgWvYy
   ```

5. PR **contra `feat/bots-f4`**, descrição em português com: o que muda, os
   arquivos, o que ficou inerte, **o que não foi verificado**, e "como testar"
   com passos. Termina em:

   ```
   🤖 Generated with [Claude Code](https://claude.com/claude-code)

   https://claude.ai/code/session_01PT5Ze54BcXtgjyMfWgWvYy
   ```

6. **Ninguém mergeia** — nem em `main`, nem na `feat/bots-f4`. Só o coordenador.
7. Nomes em português no código novo. Ícone só por `icones.tsx`. Mudança mínima
   fora do escopo: não refatore ao redor.
8. Se o documento estiver errado, **relate no PR**. O coordenador corrige o
   documento no PR final.

---

## 8. Divergências do documento, já decididas

Registradas aqui e corrigidas no `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` pelo
PR final da fase.

| § | O documento diz | O que vale, e por quê |
|---|---|---|
| §10 | a migration da instalação é a **3**, e a de comandos a **4** | A F3 entrou primeiro: `20260908140000_bots_comandos` já está na `main`. A da instalação vem **depois**, por carimbo. As duas são aditivas puras, então a ordem não muda nada além do nome. |
| §11 | `GET /api/applications/publicas?q=` | Mantido. |
| §11 | `POST /api/applications/:id/instalar {guildId, permissions}` | Vira `POST /api/guilds/:id/aplicativos {applicationId, permissions}`, com `GET` e `DELETE` irmãos. Motivo: a aba "Aplicativos" das configurações do servidor precisa **listar** e **remover**, e as três operações são sobre o mesmo recurso — o app instalado *naquele* servidor. Uma família de três verbos numa rota só, em vez de um `instalar` e duas rotas com outra grafia. |
| §11 | "um estado novo na store de UI (`vista: "apps"`), como Amigos já faz" | Não existe `vista` na store de UI: o campo é `view: "guild" \| "dm"`, e Amigos é um booleano em `stores/friends.ts`. O diretório copia **o padrão do Amigos**, que é o que a frase quis dizer, com um booleano em `stores/aplicativos.ts`. |
| §11 | "ícone de robô/peça" na rail | O ícone da rail é o `Apps` (as quatro formas), que é o glifo do **App Directory** do Discord. O robô (`Bot`) fica na aba do portal. |
| §11 | a tag diz **BOT** | O Discord renomeou para **APP** em 2024. Ficamos com BOT, por decisão do documento e da entrega. |
| §11 | `components/voice/VoiceGrid.tsx` | O nome do participante saiu de lá no PR #170; o ponto de render é `components/voice/TileDeVoz.tsx`. |
| §11 | seis pontos de render | São seis **superfícies**, mas mais de seis edições: o `MessageItem` tem modo normal, modo compacto e a barra de resposta. |
| §12 | nada sobre celular | O leiaute de celular entrou depois (#170). Tudo da F4 existe nos dois leiautes. |
