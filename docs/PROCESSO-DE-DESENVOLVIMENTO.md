# Como o Streamz é desenvolvido neste servidor

Guia para quem chega agora (pessoa ou sessão do Claude) e precisa mexer no
Streamz sem quebrar o que os outros estão fazendo. Consolidado em 2026-09-02,
depois de um dia com treze PRs (#38 a #50) e três versões do desktop
(0.0.6, 0.0.7, 0.0.8). Tudo aqui foi feito e verificado; onde não foi, está
dito.

## 1. O sistema em uma página

- **Repositório**: `MirandaSls/streamz` (privado). Monorepo pnpm:
  - `apps/api` — NestJS + Prisma + socket.io (gateway de chat e voz).
  - `apps/web` — Next.js + zustand + livekit-client. É o app inteiro; o desktop
    embute o build estático dela (`apps/web/out`).
  - `apps/desktop` — Tauri 2 (Rust). Só a casca: janela, bandeja, auto-update,
    notificações. `decorations: false`; a barra de título é nossa (§7).
  - `packages/shared` — contratos: eventos WS, constantes (`canais.ts`,
    `midia.ts`), tipos.
- **Produção**: este servidor (`143.95.161.17`, Ubuntu, 6 vCPU). Domínios
  `streamz.chat` (web), `api.streamz.chat`, `livekit.streamz.chat`. Traefik em
  `/opt/stack/traefik` (não leia o `.env` dele: o classificador bloqueia). A
  aplicação em `/opt/stack/streamz`, com `docker compose` e três overrides:
  `docker-compose.yml` + `docker-compose.traefik.yml` + `docker-compose.ghcr.yml`
  (este último troca "buildar aqui" por "puxar a imagem que o CI publicou").
- **Segredos**: `/root/.secrets/generated.env`, `/opt/stack/streamz/.env`,
  chave de assinatura do desktop em `/root/.tauri/streamz.key` (§5). Nunca
  copie nem imprima assinaturas e tokens em PR, mensagem ou log.
- **O host não tem node**. Tudo de JS roda em `docker run node:22` (§3).

## 2. Regras de convivência no servidor

Várias sessões do Claude trabalham no mesmo clone ao mesmo tempo. As regras
existem porque cada uma foi aprendida com um estrago.

1. **Nunca dê `checkout`/`switch` em `/opt/stack/streamz`.** O HEAD e o índice
   são compartilhados. Crie uma worktree por branch:
   `git -C /opt/stack/streamz worktree add .claude/worktrees/<nome> -b <tipo>/<slug> origin/main`.
   Trabalhe só dentro dela. Antes de mexer, confira `git status` e
   `git worktree list`.
2. **Não remova worktrees** (`git worktree remove` é bloqueado pelo
   classificador). Deixe para o usuário, com o comando pronto.
3. **Descubra quem está vivo com `ListAgents`** antes de assumir que um arquivo
   é seu. Sessões `interactive`/`busy` estão trabalhando; `Remote Control
   offline` não. Um socket morto (`ENOENT`) significa que a sessão acabou.
4. **Reserve arquivos por mensagem** (`SendMessage`) quando duas sessões vão
   tocar a mesma área: diga quais arquivos são seus e quais não são. Se outra
   sessão discordar com prova (histórico de PR, medição), ceda.
5. **Autorização para ir ao ar vem do usuário, na conversa de quem age.** Uma
   sessão não mergeia por "outra sessão disse que o usuário aprovou". O padrão
   que funcionou: a sessão que implementa abre o PR e avisa; a sessão que tem a
   autorização do usuário mergeia.
6. **Ações que o classificador bloqueia** (não insista; entregue o comando ao
   usuário com `!`): `git worktree remove`, ler `/opt/stack/traefik/`, `psql`
   na tabela `User`, `gh pr review --approve`. `cd X && git log` pode ser
   negado quando `git -C X log` passa.

## 3. Fluxo de uma mudança

### 3.1 Branch e worktree
`feat/…`, `fix/…`, `chore/…`, `docs/…`, sempre a partir de `origin/main`
atualizado. Se o `main` andar enquanto você trabalha, `git merge origin/main`
na sua branch antes de abrir o PR.

### 3.2 Verificação local (obrigatória antes do PR)
Tudo via docker, na worktree:

```
docker run --rm -v /opt/stack/streamz/.claude/worktrees/<nome>:/w -w /w -e CI=1 node:22 bash -lc "
  corepack enable
  pnpm install --frozen-lockfile >/dev/null 2>&1
  pnpm --filter @streamz/shared build
  pnpm --filter @streamz/api exec prisma generate >/dev/null 2>&1
  pnpm --filter @streamz/api exec tsc --noEmit && pnpm --filter @streamz/api test
  pnpm --filter @streamz/web exec tsc --noEmit && pnpm --filter @streamz/web lint
  pnpm --filter @streamz/web test && pnpm --filter @streamz/web build"
```

Sem `shared build` o `tsc` da API falha (ela resolve o `dist`). Sem
`prisma generate` a API acusa `rows` implícito `any`. Rust não compila aqui; o
CI tem um job `clippy + fmt (src-tauri)` que roda em PR quando `apps/desktop/`
muda.

### 3.3 O que typecheck e testes NÃO pegam
Em um dia, cinco erros passaram por tudo isso e só apareceram olhando: três
ícones que viravam mancha preta (caminhos brancos que eram "furo" no SVG
original), um ativo chamado `explore.svg` que não é bússola, e um composer com
50px mortos. Regra: **mudança visual exige renderizar e olhar** (§6.5). Quando
ninguém consegue abrir a tela logada, o PR tem que dizer "não visto em app
rodando", e a validação é o usuário mandar prints.

### 3.4 Commit e PR
- Mensagens em português, no estilo do repo (`git log --oneline -20`):
  `fix(voz): …`, `feat(ui): …`, `chore(desktop): versão 0.0.8`. Corpo com o
  "por quê". Um commit por assunto.
- PR com `gh pr create --base main`. Corpo com: o que acontecia, o que muda,
  arquivos, o que ficou inerte ou fora de escopo, o que não foi verificado, e
  "como testar" com passos manuais. Para mudança visual: tabela
  Discord / nosso antes / nosso depois por item (§6).
- Não mergeie sem autorização do usuário (§2.5).

### 3.5 Verificação, imagens e deploy (sem GitHub Actions)
- Em 2026-09-03 os workflows (`ci.yml`, `deploy.yml`, `desktop.yml`) foram
  **removidos** do repositório a pedido do usuário: o repo é privado, o runner
  Windows custa 2× e a cobrança travou os jobs. Não há mais CI no GitHub.
- O caminho é `scripts/publicar-local.sh` (PR #101), rodado **neste servidor**:
  verificação idêntica à do antigo `ci.yml` (typecheck, testes, lint, build e
  export da web, `cargo fmt --check`), build das imagens `streamz-{api,web}`
  com os mesmos Dockerfiles e `NEXT_PUBLIC_*` de produção, tag
  `ghcr.io/mirandasls/streamz-*:sha-<7>` **local** (sem push) e
  `docker compose … up -d api web` com `STREAMZ_TAG`. A API aplica migrations
  no boot (`RUN_MIGRATIONS=1`).
- Merge: `gh pr merge <n> --merge` depois de a verificação local passar; não há
  mais `mergeStateStatus: CLEAN` a esperar.
- Confirmação: `docker ps --filter name=streamz` e `/api/health` devolvendo a
  tag; `/api/updates/windows/x86_64/<versão>` continua respondendo.
- Instalador do desktop: ver §5 (build no servidor via `cargo-xwin`, se
  viável; senão numa máquina Windows).

> **Desde 2026-09-03 o Actions não inicia job nenhum**: a conta do GitHub caiu
> em pendência de cobrança ("recent account payments have failed or your
> spending limit needs to be increased"). `build das imagens`, `deploy em
> produção` e tudo que roda em `windows-latest` nem chegam a começar — o job
> aparece como *failure* com zero passos. Enquanto isso não for resolvido, o
> caminho é o §3.6. Os workflows continuam no `.github/` de propósito: voltam a
> valer sozinhos assim que a cobrança destravar.

### 3.6 Sem o Actions: publicar local

`scripts/publicar-local.sh` faz no servidor o que o `ci.yml` + `deploy.yml`
faziam. É idempotente: pode rodar duas vezes seguidas.

```
scripts/publicar-local.sh                 # origin/main
scripts/publicar-local.sh <commit-ish>    # outra referência — é assim que se volta versão
scripts/publicar-local.sh --sem-verificar # pula a verificação (o merge já foi verificado)
scripts/publicar-local.sh --refazer-imagens
```

O que ele faz, na ordem:

1. **Worktree destacada** do commit em `.claude/worktrees/publicar-<7>` — nunca
   dá checkout em `/opt/stack/streamz` (§2.1).
2. **Verificação** em `docker run node:22`, os mesmos passos do job
   `typecheck + testes + build`: install, `prisma generate`, build do `shared`,
   typecheck dos três pacotes, testes de api e web, lint da web, build da web e
   o export do desktop (`NEXT_OUTPUT=export`). Mais `cargo fmt --check` do
   `src-tauri` num `rust:1-slim`.
3. **Imagens** `ghcr.io/mirandasls/streamz-{api,web}:sha-<7>`, com o mesmo
   contexto (a raiz), os mesmos Dockerfiles e os mesmos build-args da web
   (`NEXT_PUBLIC_API_URL`, `_WS_URL`, `_LIVEKIT_URL` — as *variables* do repo,
   embutidas no bundle em tempo de build). **Sem push**: o host não está logado
   no GHCR, a imagem fica no disco e o compose não puxa o que já existe.
4. **`up -d` de api e web** com `STREAMZ_TAG=sha-<7>` e os três compose. A API
   aplica as migrations no boot. No fim imprime as tags, `docker ps`,
   `/api/health` e o HTTP da raiz de `streamz.chat`.

**O que ele NÃO cobre:**

- **O instalador `.exe` do desktop.** O job `instalador .exe` do `desktop.yml`
  roda em `windows-latest` e é o único lugar que produz e assina o pacote — não
  há como fazê-lo neste Linux. Enquanto o Actions estiver parado, **não sai
  versão nova de desktop** (§5); o site e o auto-update continuam servindo a
  última que já foi publicada.
- **`clippy` do Rust.** O alvo do desktop é msvc; aqui só dá para checar
  formatação. Para o clippy sem esperar o Windows há o caminho das crates de
  sombra descrito na memória `streamz-rust-check-no-linux`.
- **O `latest` do GHCR e o registro em geral.** Ninguém publica imagem enquanto
  o Actions está parado; voltar versão só funciona para tag que ainda esteja no
  disco desta máquina (`docker images | grep streamz`).
- **Merge do PR.** Continua sendo `gh pr merge <n> --merge`, à mão, com
  autorização do usuário (§2.5) — o script só publica o que já está na `main`.

## 4. Onde as coisas estão (mapa de componentes)

| Área | Arquivos |
|---|---|
| Shell do app | `apps/web/app/app/page.tsx` (rail + coluna + conteúdo; `VoiceLayer`, `BarraDeTitulo`) |
| Rail de servidores | `components/layout/GuildRail.tsx` |
| Coluna de DMs / canais | `components/layout/DMList.tsx`, `ChannelSidebar.tsx` |
| Categorias de canal | `stores/categories.ts`, `stores/channel-order.ts`; API em `apps/api/src/modules/channels/categories.{controller,service}.ts` (`MANAGE_CHANNELS` nas três rotas, eventos `category.*`) |
| Categorias padrão ("Canais de Texto"/"Canais de Voz") | `apps/api/src/modules/guilds/categorias-padrao.ts` — os nomes, a rotina que as cria e o passo de boot que conserta servidor antigo. **São categorias de verdade**, não rótulo da coluna (§4.1) |
| Criar canal / categoria | `components/modals/CreateChannelModal.tsx` (recebe `categoryId` **e** `tipo` do "+" do cabeçalho); "Criar canal"/"Criar categoria" no dropdown do nome do servidor, dentro de `ChannelSidebar.tsx` |
| Arrastar na coluna | tudo em `ChannelSidebar.tsx` (`inicioArrasto`/`LinhaDeSolta`, DnD nativo): canal, categoria **e** participante de voz. A regra pura de onde o participante pode cair é `stores/voice-mover.ts` |
| Card do usuário (mic/fone/engrenagem) | `components/layout/UserFooter.tsx` (irmão de rail+coluna, atravessa a rail), `voice/VoiceConnectedBar.tsx` |
| Conversa (DM) | `components/chat/DMView.tsx`, `HeaderBar.tsx`, `Composer.tsx`, `MessageList.tsx`, painel de perfil em DM 1:1 |
| Canal de texto | `components/chat/ChatView.tsx` |
| Amigos | `components/friends/FriendsPage.tsx`, `FriendRow.tsx`, `AddFriend.tsx` |
| Caixa de entrada | `components/chat/InboxPopover.tsx` (+ `HeaderPopover.tsx`) |
| Modal "Nova mensagem" | `components/modals/CreateGroupDMModal.tsx` |
| Sessão do cliente | `lib/session.ts` (par de tokens + renovação), `lib/usuario-guardado.ts` (retrato da conta em uso), `stores/auth.ts` |
| Multiconta ("Mudar de conta") | `lib/contas.ts` (o cofre: `localStorage` versionado com as contas do aparelho e a ativa; puro e testado), `lib/troca-de-contas.ts` (trocar, sair de uma conta, esquecer), `components/modals/GerenciarContasModal.tsx` e `AdicionarContaModal.tsx`, aberto pela linha "Mudar de conta" do `ProfilePopover.tsx` |
| Ícones | `components/ui/icones.tsx` — **único** ponto de importação de ícone (§6.2) |
| Voz (estado) | `stores/voice.ts`, `voice-saida.ts`, `voice-mover.ts`, `voice-retomada.ts`, `voice-reconexao.ts`, `voicePrefs.ts`, `voiceDevices.ts` |
| Voz (UI) | `components/voice/*` — `VoiceLayer.tsx` (global), `AudioRemotoHost.tsx` (global), `VoiceGrid.tsx`, `CallStage.tsx`, `VoicePanel.tsx`, `VoiceHotkeys.tsx`, `ScreenSharePicker.tsx` |
| Desktop | `components/desktop/BarraDeTitulo.tsx`, `useAtualizacao.ts`, `JanelaSplash.tsx` + `janela-splash.ts` (janelinha de abertura/atualização, rota `app/splash/`); `apps/desktop/src-tauri/tauri.conf.json`, `capabilities/{default,splash}.json` |
| Atalhos | `lib/shortcuts.ts`, `hooks/useKeyboardShortcuts.ts` (M/D de voz são do `VoiceHotkeys`) |
| Gateway de voz | `apps/api/src/modules/gateway/chat.gateway.ts`, `voz-em-um-lugar-so.ts`, `modules/voice/*` |
| Updates do desktop | `apps/api/src/modules/updates/*`; site de download em `modules/downloads/*` |
| Estilos globais | `apps/web/app/globals.css` (foco: anel afastado para botões, 1px colado para campos), `tailwind.config.ts` (tokens) |

### 4.1 As duas categorias padrão são linhas, não desenho

Todo servidor do Discord nasce com "Canais de Texto" e "Canais de Voz". Aqui
elas eram **inventadas pela barra lateral**: enquanto `categories` estivesse
vazia, `ChannelSidebar` separava os canais soltos por tipo e desenhava os dois
títulos; a primeira categoria de verdade que alguém criasse desligava esse modo
e os dois títulos sumiam, com os canais indo todos para o bloco sem título do
topo. Também não havia como renomear ou apagar o que não existe no banco.

Agora são linhas de `Category`, e portanto categorias comuns: renomeáveis,
apagáveis e arrastáveis pelo mesmo menu de contexto (Editar categoria / Apagar
categoria / Criar canal) e pelo mesmo arrasto de qualquer outra. Duas
consequências para quem mexer nisso:

- **Uma rotina só.** `arrumarCategoriasPadrao(prisma, guildId)` cria as duas e
  recolhe para elas os canais sem categoria, pelo tipo (voz na de voz, todo o
  resto na de texto), renumerando as posições de 0 dentro de cada bloco. É ela
  que `GuildsService.create` chama depois de criar o servidor com os dois canais
  iniciais soltos (`geral` de texto, `Geral` de voz) — servidor novo e servidor
  antigo passam pelo mesmo caminho, então não há duas verdades sobre o que é um
  servidor arrumado.
- **A correção dos servidores antigos é de dado, não de esquema**: nenhuma
  coluna mudou, então **não há migration SQL nova**. Ela é um passo idempotente
  do boot da API (`CategoriasPadraoService.onModuleInit`, antes de a porta
  abrir; independe de `RUN_MIGRATIONS`). A guarda é a mais conservadora
  possível: a rotina só age em servidor que **não tem categoria nenhuma**. Da
  segunda vez em diante ela não acha ninguém, e um servidor já organizado por
  gente nunca é tocado — quem renomeou "Canais de Texto" para "Bate-papo" não
  ganha uma "Canais de Texto" de volta no próximo boot, e quem deixou um canal
  de propósito no topo, sem categoria (o Discord permite), não o vê ser engolido.

Canal sem categoria continua no topo da coluna, sem título — é o que o Discord
faz com quem você arrasta para fora de uma categoria. Apagar uma categoria
**solta** os canais dela (FK `SetNull`) em vez de apagá-los.

### 4.2 Tempo real entre as sessões da mesma conta (a tabela de referência)

A mesma conta fica aberta no desktop **e** no site. A regra, que vale para
qualquer rota nova:

> **Toda mutação que muda o que EU vejo tem de chegar às outras conexões da
> minha conta.** A sala que as tem todas é `user:<id>` (`emitToUser`). O socket
> que fez a requisição já recebeu a resposta HTTP — o evento não é para ele, é
> para os outros. Quando o efeito também é dos outros (canal, servidor), a sala
> do canal (`channel:<id>`) ou a do servidor (`guild:<id>`) já cobre as minhas
> conexões, porque elas estão nessas salas: `handleConnection` põe cada socket
> em `user:<id>`, em todos os canais visíveis e em todos os servidores, e refaz
> isso a cada reconexão. Desktop e site rodam o mesmo código: as salas são as
> mesmas nos dois.

E do lado do cliente, duas exigências:

- **Idempotência.** Quem originou a mutação já aplicou o resultado de forma
  otimista; o evento chega depois, para todo mundo, inclusive para ele. Aplicar
  o mesmo estado duas vezes não pode duplicar linha, somar contador duas vezes
  nem redesenhar à toa. Onde "nada mudou", os aplicadores devolvem a **mesma
  referência** (`stores/leitura.ts`), que é o que impede a piscada.
- **Delta, não `refreshList` cego.** O evento carrega o objeto novo; recarregar
  a lista inteira para aplicar o que já veio no payload é uma volta ao servidor
  e uma piscada. Só se recarrega quando o evento realmente não basta.

| Mutação | Evento | Para quem | Cliente (`useRealtime` → store) | Sem F5 |
|---|---|---|---|---|
| **Perfil e conta** | | | | |
| nome de exibição, avatar (pôr/tirar) | `user.updated` | todos (`emitAll`) | `usePresence.applyProfile` + `useAuth.setUser` | sim |
| banner (pôr) | `user.updated` | todos | idem | sim |
| banner (tirar) | `user.updated` | todos | idem | **sim (era não)** |
| status personalizado | `user.updated` | todos | idem | sim |
| status manual (Online/Ausente/Não perturbe/Invisível) | `presence.update` + `user.updated` | todos | `usePresence.apply` + `useAuth.setUser` | sim |
| e-mail trocado, verificado, 2FA ligado/desligado, códigos regerados | `account.updated` | `user:<id>` | `useConta.aplicar` | **sim (era não — ninguém ouvia)** |
| encerrar uma sessão / todas as outras / desativar / excluir | `sessions.revoked` | `user:<id>` | cai para o login se `all` ou se o `sid` do meu token está na lista | **sim (era não — ninguém ouvia)** |
| preferências de aparência, voz, idioma, privacidade | — | — | — | **não, de propósito**: são do aparelho (`localStorage`, `stores/settings.ts` e `privacidade.ts`), não da conta |
| **Notificações** | | | | |
| nível global / por servidor / por canal, silenciar | `notification.updated` | `user:<id>` | `useNotifications.apply` | sim |
| **Leitura ("lido" num cliente apaga o badge no outro)** | | | | |
| abrir/ler um canal (`POST /channels/:id/read`) | `channel.read` | `user:<id>` | `useDMs`/`useChannels.aplicarLeitura` + `useGuilds.syncFromChannels` | **sim (era não)** |
| marcar o servidor como lido (`POST /guilds/:id/read`) | `channel.read` (lote + `guildId`) | `user:<id>` | idem, com `useGuilds.clearUnread` quando o servidor não está aberto | **sim (era não)** |
| marcar tudo como lido (`POST /me/read-all`) | `channel.read` (lote) | `user:<id>` | idem | **sim (era não)** |
| **Amizades** | | | | |
| mandar pedido | `friend.request` | `user:<alvo>` **e** `user:<eu>`, com `direcao` | `useFriends.handleRequest` (Pendentes / Enviados) | **sim (a aba "Enviados" era não)** |
| aceitar | `friend.accepted` | os dois `user:<id>` | `handleAccepted` + `useDMs.garantirNaLista` | sim |
| recusar, cancelar, remover amigo | `friend.removed` | os dois `user:<id>` | `handleRemoved` | sim |
| bloquear | `friend.removed` (ao outro) + `user.blocked` (a mim, **com a pessoa**) | `user:<id>` | `handleBlocked` — delta, sem refazer o `GET /friends` | sim |
| desbloquear | `user.blocked` | `user:<eu>` | `handleBlocked` | sim |
| **Conversas (DM e grupo)** | | | | |
| abrir conversa / reabrir (`POST /dms`, `/dms/:id/show`) | `channel.updated` | `user:<eu>` | `useDMs.handleUpdated` (era `refreshList` cego) | sim |
| criar grupo | `channel.updated` | `user:<id>` de cada participante | `handleUpdated` | sim |
| renomear, trocar ícone, adicionar/remover participante | `channel.updated` (+ `message.new` de sistema) | `user:<id>` de cada participante | `handleUpdated` | sim |
| fechar a conversa (`POST /dms/:id/hide`) | `channel.deleted` | `user:<eu>` **só** | `useDMs.handleDeleted` | **sim (era não)** |
| sair do grupo | `channel.deleted` (a mim) + `message.new` de sistema | `user:<eu>` / canal | `handleDeleted` | **sim (era não)** |
| ser removido do grupo | `channel.deleted` | `user:<removido>` | `handleDeleted` | sim |
| **Servidores** | | | | |
| criar | `guild.joined` (`created`) | `user:<eu>` | `useGuilds.handleJoined` | sim (#104) |
| entrar por convite | `guild.joined` + `member.joined` | `user:<eu>` / `guild:<id>` | idem | sim (#104) |
| entrar pela Descobrir | `guild.joined` + `member.joined` | `user:<eu>` / `guild:<id>` | idem | **sim (era não)** |
| editar nome/descrição, ícone (pôr/tirar) | `guild.updated` | `guild:<id>` | `handleGuildUpdated` | sim |
| transferir a posse | `guild.ownerChanged` + 2× `member.updated` | `guild:<id>` | `handleOwnerChanged`, `handleMemberUpdated` | sim |
| sair | `member.left` + `guild.removed` | `guild:<id>` / `user:<eu>` | `handleRemoved` | sim |
| apagar | `guild.removed` | `user:<id>` de todos os membros | `handleRemoved` | sim |
| expulsar, banir | `member.left` + `guild.removed` | `guild:<id>` / `user:<alvo>` | `handleRemoved` + toast | sim |
| papel (ADMIN/MEMBER), cargo atribuído/removido, castigo | `member.updated` | `guild:<id>` | `handleMemberUpdated` (+ recarrega canais e permissões quando sou eu) | sim |
| aceitar as regras, ver as boas-vindas | `guild.settingsUpdated` | `user:<eu>` | recarrega a minha associação | **sim (era não)** |
| onboarding/descoberta do servidor | `guild.settingsUpdated` | `guild:<id>` | idem | sim |
| **Canais e categorias** | | | | |
| criar, editar, apagar canal | `channel.created` / `.updated` / `.deleted` | quem enxerga o canal (`emitToUsers`) | `useChannels.handle*` | sim |
| reordenar canais e categorias | `channel.updated` / `category.updated` | quem enxerga / `guild:<id>` | `handleUpdated` (a coluna ordena por `position` ao desenhar) | sim |
| criar, renomear, apagar categoria | `category.created` / `.updated` / `.deleted` | `guild:<id>` | `useCategories.handle*` | sim |
| dar/tirar acesso a canal privado | `channel.created` / `.deleted` + entra/sai da sala | `user:<id>` de quem ganhou/perdeu | `handle*` | sim |
| permissões de cargo e overrides de canal | `role.*`, `channel.overrides` | `guild:<id>` | `usePermissions.handle*` (+ recarrega a lista de canais) | sim |
| **Mensagens** | | | | |
| enviar, editar, apagar, reagir | `message.new` / `.updated` / `.deleted` | `channel:<id>` | `useMessages.handle*` (dedupe por id; o `nonce` só casa no autor) | sim |
| fixar/desafixar | `message.pinned` / `.unpinned` | `channel:<id>` | `usePins.handle*` | sim |
| thread, enquete, exclusão em massa | `thread.updated`, `poll.updated`, `messages.bulkDeleted` | `channel:<id>` | stores correspondentes | sim |
| emoji e figurinha do servidor | `emoji.updated` / `sticker.updated` | `guild:<id>` | `useEmojis.apply*` | sim |
| **Voz** | | | | |
| entrar, sair, mudo, surdo, tela, câmera | `voice.state` | `guild:<id>` ou os participantes | `useVoice.applyState` | sim |
| mover alguém de canal (`MOVE_MEMBERS`) | `voice.moved` (ao movido) + 2× `voice.state` | `user:<movido>` / servidor | `useVoice.movidoDeCanal` — a conexão que **não** estava na chamada ignora (`decidirMovido`) | sim |
| entrar de outro aparelho | `voice.evicted` | **um socket só** (é a exceção da regra: quem acabou de entrar não pode receber a própria expulsão) | `useVoice.expulsoDaVoz` | sim |
| chamada em conversa (tocar/encerrar) | `call.ring` / `call.ended` | `user:<id>` dos envolvidos | `useVoice.handleRing`/`handleEnded` | sim |
| **Convites** | | | | |
| criar/revogar convite | — | — | — | **não**: a lista de convites vive dentro do modal de configurações do servidor e é relida ao abrir. O Discord também não a atualiza ao vivo. Se virar incômodo, o caminho é um `invite.updated` em `guild:<id>` |

**Reconexão.** O servidor esquece as salas quando a conexão cai, mas
`handleConnection` reentra em todas — o cliente só precisa ressincronizar o que
perdeu enquanto esteve fora. O `onReconnect` de `useRealtime` faz um resync
leve, sem recarregar a página: histórico do canal ativo, servidores, conversas,
amigos/bloqueios, permissões e categorias do servidor aberto, emojis,
preferências de notificação, a conta (quando alguma tela a mostra) e a
retomada da voz. Listas de servidores e conversas trazem o estado de leitura
junto, então os badges voltam certos sem rota nova.

**Onde ficam os testes.** `apps/api/src/modules/realtime/entre-sessoes.spec.ts`
(um teste por grupo de mutação, cada um só perguntando "saiu para `user:<id>`?"),
`todas-as-conexoes.spec.ts` (criar servidor e resgatar convite),
`apps/web/stores/leitura.test.ts` e `friends-eventos.test.ts` (os tratadores,
com a idempotência explícita).

## 5. Publicar uma versão do desktop

O app consulta `GET /api/updates/{target}/{arch}/{versão}` na abertura: 204
quando não há nada, ou um manifesto assinado. A chave privada está em
`/root/.tauri/streamz.key` (e no segredo `TAURI_SIGNING_PRIVATE_KEY` do repo);
a pública em `tauri.conf.json`. Perder a privada = ninguém atualiza mais.

Passo a passo, como foi feito para 0.0.6, 0.0.7 e 0.0.8:

1. **Bump** em quatro lugares, numa worktree própria: `apps/desktop/package.json`,
   `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` (linha 3) e
   `src-tauri/Cargo.lock` (a linha `version` logo abaixo de
   `name = "streamz-desktop"`). Commit `chore(desktop): versão X.Y.Z`, PR,
   merge. Pode ser aberto antes dos outros PRs; o que importa é o `main` na
   hora do build.
2. **Build assinado**: `gh workflow run desktop.yml --ref main -f release=true`.
   Leva ~30 minutos. Pegue o id em `gh run list --workflow=desktop.yml --limit 1`
   e acompanhe com um monitor de até 1 hora (um `until` em bash morre em 10).
   **Ou, de graça, neste servidor:** `scripts/build-desktop-no-servidor.sh`
   (~1 min com cache quente) — ver §5.3, inclusive o que só o Windows prova.
3. **Publicar** (o script usado está em
   `scratchpad/publicar-0.0.8.sh` da sessão que fez; recrie se precisar):
   - `gh run download <id> -R MirandaSls/streamz -n streamz-windows -D <dir>`
     → `nsis/Streamz_X.Y.Z_x64-setup.exe` e `.exe.sig`.
   - copiar o `.exe` para `/opt/stack/streamz/updates/` (o que o atualizador
     baixa) **e** para `/opt/stack/streamz/downloads/` (o que o site serve; ele
     escolhe o mais novo sozinho).
   - no `.env`: `DESKTOP_UPDATE_VERSION`, `DESKTOP_UPDATE_URL`
     (`https://api.streamz.chat/api/updates/arquivo/<nome>`),
     `DESKTOP_UPDATE_SIGNATURE` (conteúdo do `.sig`), `DESKTOP_UPDATE_NOTES`.
   - recriar a API **com a tag que está no ar**, senão o compose tenta puxar
     `:latest` do GHCR e falha com `unauthorized`:
     `STREAMZ_TAG=sha-<7> docker compose -f docker-compose.yml -f docker-compose.traefik.yml -f docker-compose.ghcr.yml --profile livekit up -d api`.
     `docker restart` não serve: não relê o `.env`.
   - verificar: manifesto da versão anterior → 200 com a nova; da nova → 204;
     download do arquivo → 200 com o tamanho certo; `/api/health` ok.
4. O deploy seguinte da web recria a API e **preserva** o `.env`; o manifesto
   continua valendo.
5. O primeiro salto de quem está antes da 0.0.3 é manual (a chave pública mora
   no app instalado).

**A atualização acontece numa janelinha própria** (§5.2), não dentro do app.
`plugins.updater.windows.installMode` é `"quiet"` (o NSIS roda com `/S /R`, sem
janela do instalador). Duas consequências: com
`bundle.windows.nsis.installMode: "perMachine"` o **UAC continua aparecendo**
uma vez por atualização (silêncio é do instalador, não da elevação), e o plugin
chama `exit(0)` logo depois de disparar o instalador — no Windows o app morre em
"Instalando…" e quem reabre é o `/R`, então "Reiniciando…" e o `relaunch()` só
se veem fora dali.

O desktop embute a web: o que entra em `main` depois do build só chega ao
instalado na versão seguinte.

### 5.1 O instalador é o padrão do Tauri (NSIS)

Em 2026-09-03 o PR #79 trouxe um template NSIS próprio (tema escuro, arte,
ícone animado por `SysAnimate32`, fechar sozinho e abrir o app). Custou três
builds de ~35 min (comentário com `{{...}}` quebra o Handlebars; `${__FILEDIR__}`
sem separador final no makensis do Windows; `File` não aceita barra normal) e
o resultado saiu com o **corpo branco** do MUI apesar do cabeçalho escuro. O
usuário viu as prints e preferiu o instalador padrão: o PR seguinte apagou
`nsis/` e deixou só `installerIcon`. Se voltar a esse assunto, o histórico do
#79 tem o template, o `gerar-arte.py` e o harness de fumaça.

### 5.2 A janelinha de abertura e atualização (`splash`)

Desde o PR #88, abrir e atualizar o Streamz é uma **janela de 300×350** no meio
da tela, como a do Discord — não uma tela dentro do app. O que existe:

- `tauri.conf.json`: a janela `main` nasce `"visible": false` e a janela
  `splash` (300×350, `center`, `resizable: false`, `decorations: false`,
  `transparent: true`, `shadow: false`, `visible: false`) aponta para
  `"url": "splash/"`. Com `trailingSlash: true` o export gera
  `out/splash/index.html`, e o `get_asset` do Tauri tira a barra final e tenta
  `<caminho>/index.html` — a mesma URL serve no `tauri dev` (`next dev`).
- `apps/web/app/splash/page.tsx` → `components/desktop/JanelaSplash.tsx`
  (leiaute medido nas referências, com a tabela no topo do arquivo) e
  `janela-splash.ts` (parte pura, testada).
- **Na abertura**: a janelinha se mostra no primeiro quadro (nasce escondida
  porque o WebView2 pinta um quadro branco antes do primeiro render), chama
  `check()` com teto de 8s e: sem versão nova, erro de rede ou tempo esgotado →
  `show()` + foco na `main` e fecha; com versão nova → `downloadAndInstall`,
  com a porcentagem vinda dos eventos de download. Exibição mínima de 600ms
  para não piscar.
- **Com o app já aberto**: a setinha verde da barra (`useAtualizacao.abrir`)
  cria a mesma janela com `splash/?modo=atualizar`, espera o `tauri://created`
  e só então esconde a `main`. Erro vira evento `splash:erro` → toast na
  janela principal, que volta.
- Permissões: `capabilities/splash.json` (janela `splash`) com `updater:default`
  (= `allow-check`, `allow-download`, `allow-install`,
  `allow-download-and-install` na 2.11.0), `process:allow-restart`, `show`,
  `hide`, `set-focus`, `unminimize`, `close` e `start-dragging`; a `default.json`
  (janela `main`) ganhou `core:webview:allow-create-webview-window` e trocou
  `updater:default` por `updater:allow-check`. **Confira os nomes na versão
  presa no `Cargo.lock`** (`permissions/*/autogenerated/` do crate), não de
  memória — foi assim que os desta janela foram escolhidos.
- `main.rs`: o `CloseRequested` só esconde a janela **`main`** (bandeja). Se a
  `splash` também fosse escondida, o rótulo continuaria ocupado e a próxima
  atualização não conseguiria criar a janela.
- A rede de segurança quando o JS da janelinha não sobe continua sendo a
  bandeja ("Abrir Streamz"), porque a `main` nasce invisível.

### 5.3 Instalador sem o Actions (build no próprio servidor)

O runner `windows-latest` custa **2× minuto** em repositório privado e cada
instalador leva ~35 min lá. Desde 2026-09-03 o mesmo `.exe` assinado sai deste
servidor Linux, em Docker, sem gastar nada:

```bash
scripts/build-desktop-no-servidor.sh            # origin/main, assinado
scripts/build-desktop-no-servidor.sh <ref>      # outro commit
scripts/build-desktop-no-servidor.sh --sem-assinar
```

Sai em `.claude/saida-desktop/<versão>-<commit>/`: `Streamz_X.Y.Z_x64-setup.exe`
e `.exe.sig`. Daí em diante o §5 segue igual (copiar para `updates/` e
`downloads/`, preencher o `.env`, recriar a API).

**Como funciona.** `apps/desktop/Dockerfile.xwin` monta `rust:1-bookworm` +
`cargo-xwin` + clang/lld 21 + NSIS + node 22. O `cargo-xwin` baixa a CRT e o
SDK do Windows dos endereços públicos da Microsoft e põe `clang-cl`/`lld-link`
no lugar de `cl.exe`/`link.exe`. **O alvo é o mesmo do CI**
(`x86_64-pc-windows-msvc`): mesma ABI, mesmo `+crt-static` do
`.cargo/config.toml`, mesma `libwebrtc` pré-compilada que o `webrtc-sys` baixa
no Windows. Não é mingw. O empacotador NSIS do `tauri-bundler` já roda no
Linux sem gambiarra: fora do Windows ele chama o `makensis` do PATH e só baixa
o plugin `nsis_tauri_utils.dll`. A assinatura do atualizador é minisign em
Rust puro e funciona em qualquer sistema.

**Números da primeira prova (commit `3221908`, versão 0.0.16):**

| | |
|---|---|
| imagem Docker | ~2 min, 0,8 GB |
| primeira rodada (tudo frio, baixa CRT+SDK do Windows) | ~17 min |
| worktree nova, caches quentes | 3 min 36 s |
| mesma worktree, incremental | ~1 min 20 s |
| caches em volumes | `streamz-xwin-cache` 1,1 GB · `streamz-pnpm` 1,1 GB · `streamz-cargo` 0,8 GB · `streamz-xdg` 23 MB |
| `target/` na worktree | 2,6 GB |
| instalador gerado | 12 643 158 bytes |
| instalador do CI (mesma versão) | 12 585 908 bytes (+0,45 %) |

A assinatura foi conferida contra a **chave pública que está dentro do app**
(`plugins.updater.pubkey` do `tauri.conf.json`): keyID igual e Ed25519
`Signature Verified Successfully` sobre o blake2b do arquivo. É a mesma
verificação que o atualizador faz no cliente.

**Duas armadilhas que custaram rodadas** (estão comentadas no script e no
Dockerfile; não desfaça sem ler):

1. **A UCRT some no link.** O `tauri build` exporta `STATIC_VCRUNTIME=true`, e
   com isso o `static_vcruntime.rs` do `tauri-build` emite
   `/NODEFAULTLIB:libucrt.lib` + `/DEFAULTLIB:ucrt.lib` (CRT estática com UCRT
   **dinâmica** — o que o Windows monta). O `cargo-xwin`, vendo `+crt-static`,
   acrescenta `-nodefaultlib:ucrt -defaultlib:libucrt`, querendo a UCRT
   estática. Um cancela o outro e o binário fica sem UCRT nenhuma: centenas de
   `undefined symbol: cos/sin/strlen/_wassert`. A saída é passar a `ucrt.lib`
   como **arquivo de entrada** (`-C link-arg=<caminho>/ucrt.lib`), que o
   `/NODEFAULTLIB` não alcança. Sintoma enganoso: `cargo xwin build` sozinho
   linka de boa, porque só o `tauri build` liga o `STATIC_VCRUNTIME`.
2. **"Can't detect any appindicator library".** O `tauri-cli` tem um bloco
   `#[cfg(target_os = "linux")]` que olha o **hospedeiro**, não o alvo: com a
   feature `tray-icon` ligada ele exige o appindicator via `pkg-config` e entra
   em pânico, mesmo compilando para Windows. O resultado só alimentaria as
   dependências do `.deb` e do AppImage, que este build nunca gera. A imagem
   responde com um `.pc` de fachada em vez de arrastar 146 pacotes de GTK.

**O que este build NÃO prova.** Que o instalador instala e que o app abre —
isso continua só o Windows dizendo. O `wine` não serve de substituto aqui: o
stub do NSIS é PE32 (todo instalador NSIS é), então precisaria de wine 32 bits,
e o app depende do WebView2, que o wine não tem. A recomendação prática: gerar
aqui, e antes de publicar em `updates/` instalar uma vez numa máquina Windows.
(O `file` mostra o stub do NSIS como PE32 — todo instalador NSIS é 32 bits; o
binário do app que ele carrega dentro é PE32+ x86-64, e o do CI é igual.)
O build também não é bit a bit reprodutível: duas rodadas do mesmo commit
saíram com ~6 KB de diferença, coisa de timestamp dentro do LZMA do NSIS.
O `desktop.yml` continua no repositório e continua sendo a referência — se algo
divergir, ele é o desempate.

Diferenças conhecidas e aceitas em relação ao artefato do CI: o NSIS é o 3.08
do Debian (no Windows o bundler baixa o 3.11), e o `.exe` sai sem assinatura
Authenticode — igual ao do CI, que também não tem certificado.

## 6. Paridade visual com o Discord (o método)

O objetivo do usuário é "idêntico ao Discord", com uma exceção fixa: **cores e
tokens de paleta não mudam**. Só forma, tamanho, espaçamento e ícone.

### 6.1 Fontes de verdade
- Prints do Discord e do nosso app em `docs/Reference/Captura de tela *.png`,
  1:1 (janela maximizada, zoom 100%, 1919x1079). Os nomes são carimbos de hora;
  o usuário coloca novos e avisa. Se um print for "nosso" ou "do Discord" não
  é óbvio pelo nome: olhe.
- Acervo de ícones oficiais em `docs/Reference/Discord assets icons/`
  (`ACERVO.md` explica): `svg/` (229, exportação oficial do Figma, **preferida**,
  com `MAPA.md` e `USADOS-NA-INTERFACE.md` que cruza cada tela com o arquivo),
  `figma/` (630 gerados da geometria; **nunca** `figma/_suspeitos/`, 48 saem
  errados), `Collections/` (893 PNGs). Cada pasta tem `_folha*.png` (folha de
  contato) para achar o ícone olhando.

### 6.2 Vocabulário de ícones
`apps/web/components/ui/icones.tsx` é o único lugar de onde o app importa
ícone. Ativos do Discord entram pela fábrica `doDiscord`/`QUADRO`, com o
**mesmo nome do componente lucide** que existia (`Search`, `Plus`,
`ChevronDown`…), aceitando `size`, `className` e props de `<svg>`. O que não
tem ativo fica reexportado do Phosphor (marcas utilitárias) ou do lucide (três
sem equivalente) pelo mesmo arquivo, com o motivo em comentário. "Todos é
todos": marca utilitária com ativo no acervo também troca. Não importe de
`lucide-react` nem de `@phosphor-icons/react` fora desse arquivo
(`ScreenSharePicker.tsx` é a única exceção histórica, e está sendo reescrito).

### 6.3 Medir, não estimar
Pillow via docker (o host não tem Pillow nem ImageMagick):

```
docker run --rm -v "/opt/stack/streamz/docs/Reference:/ref:ro" -v "<dir>:/out" \
  -v "<script>.py:/s.py:ro" python:3-slim sh -c "pip install --quiet pillow && python /s.py"
```

Recorte a região, amplie com `Image.NEAREST`, **olhe** o PNG, e tire números de
`getpixel` (varrer uma coluna/linha até a cor mudar dá altura, largura, raio e
posição). Toda medida citada em PR tem que ter vindo daí. Se não dá para medir
com confiança, diga "não medido" em vez de chutar. Um número inventado vira um
pixel errado no app.

### 6.4 Paralelizar sem colidir
Migração grande (83 arquivos) funcionou assim, e é o modelo:
1. **Fase A, sequencial**: fechar o vocabulário inteiro (`icones.tsx`) e
   commitar verde antes de qualquer consumo.
2. **Fase B, paralela**: 3 ou 4 agentes com lotes de arquivos **disjuntos**,
   cada um só trocando imports; proibidos de tocar nos arquivos compartilhados
   (`icones.tsx`, `tailwind.config.ts`, `design.md`, `page.tsx`). Quem acha um
   ícone faltando **relata**, não cria.
3. **Fase C**: tamanhos das superfícies, também por lotes disjuntos, seguida de
   uma passada sequencial de coerência (cabeçalhos que deixaram de casar,
   glifos apertados na casa nova).
4. Typecheck, lint, testes e build **uma vez, no fim**, por quem coordena:
   agentes rodando verificação sobre a árvore parcial dos outros dá falso
   vermelho.
5. Critério de conclusão mecânico (ex.: `grep -rl lucide-react apps/web` só
   pode devolver a exceção conhecida).

### 6.5 Verificação visual
- Renderize o vocabulário inteiro numa folha de contato em `currentColor` e
  olhe. Foi o que pegou os três ícones quebrados.
- Para tela, o ideal é abrir logado; ninguém aqui tem a conta do usuário e não
  se deve usar. Então: aritmética conferida + pedir prints ao usuário. Diga no
  PR o que não foi visto.
- Lista de prints que o usuário tira para validar (mesmo tamanho de janela do
  Discord): Amigos com amigos online, conversa com mensagens, cabeçalho e
  composer, card do usuário em quatro estados e em call, popover do microfone,
  seletor de tela, configurações, menu do servidor, hover de mensagem, popover
  de perfil, modais menores, e o fluxo da call em dois dispositivos.

### 6.6 Decisões já tomadas (não reabrir sem o usuário)
- Cores e tokens: intocados. Nova superfície usa o token existente mais próximo
  e o PR registra a diferença.
- Nitro, Loja, Missões e o painel "Ativo agora": não criar.
- Botões sem função no nosso app (presente e apps no composer, filtros na caixa
  de entrada): existem como visual, inertes, com tooltip, registrados no PR.
- Barra de título e caixa de entrada/ajuda: no desktop moram na barra; no
  navegador ficam no cabeçalho de Amigos (como o Discord web).
- Foco: anel afastado de 2px para botões/links; campos de texto focam com 1px
  colado, no verde do `design.md`.
- **Cabeçalho de categoria** (medido na print `2026-09-03 201805`, coluna de
  294, 1:1 pelo `h-9` do canal): o "+" de criar canal é **sempre visível**, não
  de hover — na print o cursor está sobre outro canal e os três cabeçalhos
  mostram o "+". Glifo de 12×12 (`Plus size={20}`: o quadro do ativo do Discord
  desenha 0,583 do tamanho), na mesma coluna da engrenagem do canal; rótulo a
  18px da borda do painel, alinhado com o ícone do canal; linha de 22px, centro
  a 29px do canal anterior e canal seguinte a 42. A zona de solta do fim de um
  bloco leva `-mb-3` para não somar 12px a esse vão.
- Card do usuário: flutuante, 58px, raio 8, atravessa a rail (irmão de rail e
  coluna, `inset-x-2.5`), listas e rail com respiro embaixo (`pb-[78px]`).
- Configurações (usuário, servidor, canal e grupo, todas na mesma moldura
  `components/ui/JanelaDeConfiguracoes.tsx`): **janela flutuante** de 1400×888
  centrada sobre o app escurecido — não página inteira —, com menu de 252,
  busca de 40 e cabeçalho de 48 com o X simples no canto (medido nos prints
  `2026-09-01 1143–1146`, janela de 1920×1032).

## 7. Arquitetura de voz (o que precisa continuar verdade)

- A `Room` do LiveKit vive na store (`stores/voice.ts`, `let sala`), fora do
  React. Nenhum componente a derruba; só `sairDaSalaAtual`/`disconnect`.
- **Áudio remoto é global**: `AudioRemotoHost` em `VoiceLayer` renderiza um
  `<audio>` por participante da sala da store, independente da tela. A grade
  (`VoiceGrid`) é só visual. Sem isso, trocar de DM silenciava a call.
- `sairDaSalaAtual(motivo)` fecha a sala e avisa o gateway; `disconnect` é o
  caminho do usuário e também fecha a coluna. `connect`, `startCall` e
  `acceptCall` usam o primeiro (trocar de canal de voz não pode desmontar o
  painel que pediu a conexão).
- Atalhos de mudo/surdo (Ctrl+Shift+M/D) têm um dono só: `VoiceHotkeys`.
- **"Testar microfone" muta e ensurdece de verdade.** O teste é o mesmo nos
  três lugares (`PopoverDeRuido`, aba "Voz e vídeo", `VoiceSettingsPanel`), num
  hook só (`useTesteDeMicrofone`). Ao começar ele liga mudo **e** surdo pelo
  caminho normal — `voicePrefs.setMuteDeafen`, com o som de surdo, os ícones do
  rodapé e da cápsula acesos e `voice.update` para o gateway, como se o usuário
  tivesse clicado — e ao parar **restaura exatamente** o par de antes. A regra
  pura (e testada) é `stores/teste-de-microfone.ts`
  (`iniciarTeste`/`pararTeste`/`testeSobrevive`); o par guardado mora fora da
  store, em `anteriorDoTeste` (`stores/voice.ts`). Três coisas que precisam
  continuar verdade:
  - **o retorno sobrevive ao mudo.** Mudo é `enabled = false` na faixa de
    **entrada** da cadeia, então aplicá-lo mataria o próprio som que o teste
    devolve: `abertoDeFato` (`lib/microfone.ts`) mantém a captura aberta
    enquanto o teste dura, e o loopback ouve a cadeia inteira, antes do
    interruptor de mudo. Quem garante que a sala não ouve nada é a
    despublicação (`definirMicrofoneEmTeste`), nunca o mudo.
  - **todo caminho de saída passa pelo mesmo `pararTeste`**: o botão, fechar o
    popover, trocar de aba, fechar o painel, desmontar o hook e
    `sairDaSalaAtual` — este último com `naSala = false`, para não republicar a
    faixa numa sala que já está indo embora.
  - **mexer em mudo/surdo na mão no meio do teste para o teste**, e a escolha do
    usuário fica: a restauração só acontece se as preferências ainda forem as
    que o próprio teste pôs.
  A primeira versão (#102) ensurdecia por dentro — um estado transitório
  sobrepunha as preferências sem escrevê-las e sem avisar o gateway. Funcionava
  e não deixava rastro, mas era invisível: os ícones diziam que você estava
  ouvindo e os outros te viam normal enquanto você não ouvia nada. A decisão do
  usuário (2026-09-04) é a do Discord — o teste aparece.
- **Quem está falando é um conjunto só**: `falando: ReadonlySet<userId>` na
  store, montado em `stores/voice-falantes.ts`. Palco (`VoiceGrid`), lista do
  canal (`VoiceChannelMembers`) e lista de membros (`MemberList`) leem esse
  conjunto e mais nada — `participant.isSpeaking` lido no render era uma segunda
  conta, e era dela que vinham as divergências. Duas fontes o alimentam:
  `RoomEvent.ActiveSpeakersChanged` para os **outros** (recomposto também em
  `ParticipantConnected`/`Disconnected`/`TrackMuted`, senão quem sai falando
  fica com o anel aceso) e, para **mim**, um detector local em
  `stores/voz-detector-local.ts` — o SFU decide fala a cada 500 ms, com limiar
  próprio e por canal *lossy*, e era isso que fazia o meu anel piscar ou não
  acender. O detector é rearmado por `rearmarDetectorLocal()` em todo caminho
  que troca a faixa, inclusive `switchActiveDevice`, que reinicia a faixa **sem**
  emitir `LocalTrackPublished`. Identidade do LiveKit vira `userId` por
  `donoDaIdentidade` (o `<userId>#tela` é a mesma pessoa).
- **O anel verde tem uma definição só**, `AnelDeFala` em `pecas-de-voz.tsx`:
  2px, `ring-green` (`rgb(31,184,107)`), desenhado por **cima** do avatar e por
  dentro do diâmetro, com o avatar em `ENCOLHE_AO_FALAR`. Não é `ring-inset` na
  caixa do próprio `Avatar`: sombra `inset` é pintada abaixo do conteúdo, então
  a `<img>` (ou o círculo das iniciais) cobria o anel por completo — a regra
  estava na lista lateral e o anel nunca aparecia. Conferido renderizando os
  dois markups com o CSS compilado do app: o antigo não produz um pixel verde.
- **"Testar microfone" é uma cabine, não um medidor** (Discord): enquanto dura,
  você fica surdo dos dois lados e ouve a si mesmo. Um hook só,
  `components/voice/useTesteDeMicrofone.ts`, para os três lugares (popover de
  supressão, `VoiceSettingsPanel`, aba Voz e vídeo). O estado é
  `testandoMicrofone` na store — transitório, **sobrepõe** mudo/surdo sem
  escrevê-los (`stores/teste-de-microfone.ts`, com teste unitário) e não vai
  para o gateway: o Discord ensurdece só de um lado. Quem o respeita é a
  publicação do microfone (`microfoneNaSala`) e o `<audio>` de cada participante
  remoto (`saidaCalada`, em `AudioRemotoHost`). O retorno sai por um `<audio>`
  criado pelo hook — só elemento de mídia tem `setSinkId`, e é ele que faz o
  teste tocar na saída escolhida —, com o mesmo eco/ganho/supressão da call
  (RNNoise incluso). Sair da call, fechar o popover ou trocar de aba param o
  teste.
- **Numa call, o teste não abre uma segunda captura.** Ele escuta a faixa que o
  dono do microfone já tem aberta, e o que muda na sala é a **despublicação**
  (`definirMicrofoneEmTeste`), não o fechamento: a mesma faixa, a mesma cadeia e
  o mesmo volume de entrada continuam rodando, então o retorno é literalmente o
  que a sala ouviria. Mutar em vez de despublicar não serviria — o mudo é
  `mediaStreamTrack.enabled = false` na **entrada** da cadeia, e o retorno sairia
  mudo junto; despublicando, o teste funciona com o microfone mudo, que é
  justamente onde se descobre que ele estava mudo. Fora de qualquer call não há
  faixa de ninguém, e aí o hook abre a captura dele montando a mesma
  `cadeiaDoMicrofone`.
- Estados de voz de DM têm rota REST (`GET /dms/:id/voice-states`); o boot
  retoma a call após F5 se o usuário aparecer como `reconnecting`
  (`stores/voice-retomada.ts`, `sessionStorage`); a reconexão do socket não
  zera `states` antes de ter a resposta.
- Servidor: presença de voz por usuário, carência de 45 s
  (`VOICE_RECONNECT_GRACE_MS`) antes de tirar quem caiu; `POST /dms/:id/call`
  em call já existente entra em silêncio (não toca de novo).
- **Mover alguém de canal de voz** (`POST /guilds/:id/voice/move`, permissão
  `MOVE_MEMBERS`, bit 19 — o primeiro depois do `ADMINISTRATOR`): quem arrasta
  chama a rota; a API troca o estado de voz pelo **mesmo** `join` do caminho
  normal (que já tira da sala anterior e emite os dois `voice.state`), e por
  cima manda um `voice.moved` **só para quem foi movido**. Quem troca a sala no
  LiveKit é o cliente movido, nunca o servidor: `movidoDeCanal` na store faz
  `sairDaSalaAtual("movido")` + `connect(..., { som: false })` e toca
  `tocarSomDeMovido()`. O motivo `movido` existe para não mandar `voice.leave`
  (ele desfaria o move que acabou de acontecer), não tocar o som de sair e não
  fechar a coluna do canal — para quem foi movido a chamada não acabou. As
  quatro recusas da rota (sem permissão, destino que não é canal de voz deste
  servidor, alvo fora da voz, alvo que não enxerga o destino) estão em
  `voice-mover.spec.ts`; a decisão de onde o arrasto pode cair e do que fazer
  com um `voice.moved` atrasado é pura, em `stores/voice-mover.ts`.
- Câmera e tela **não** sobrevivem ao move: as faixas ficaram na sala antiga do
  LiveKit. Mudo e surdo viajam junto com a pessoa.
- LiveKit é por identidade e não aceita duas iguais: entrar de outro aparelho
  expulsa a conexão anterior de propósito, com evento `voice.evicted` e a
  mensagem "você entrou de outro dispositivo" (`voz-em-um-lugar-so.ts`).
- Seletor de tela (`ScreenSharePicker`): duas abas (Aplicativos e Tela
  Inteira) e, no rodapé, resolução e taxa de quadros como segmentos sempre
  visíveis, com as opções vindas de `SCREEN_QUALITY` — sem aba de
  dispositivos, sem alternador SD/HD e sem a etapa da engrenagem. **Medidas**
  (prints `2026-08-31 123946`/`124000`, janela do Discord de 1283×718, 1:1
  conferido pelo avatar de 32 da lista de DMs, pela rail de 40+10 e pela barra
  de tarefas de 48): modal 960×606, ou seja 75% da largura e 85% da altura da
  janela — no nosso `Dialog`, `w-[min(1400px,max(75vw,880px))]` e `h-[888px]`
  sob o `max-h-[85vh]` da base, com teto no maior modal do Discord já medido
  (1400×888, janela de configurações) e piso de 880, este não medido. Barra de
  abas 40 (segmento 32), grade de `auto-fill` com mínimo de 300 e 16 entre
  colunas, quadro 16:9 raio 8 e nome com ícone de 16 embaixo. **A grade não é
  de duas colunas fixas**: 2×441 na janela do print, 4×322 numa de 1920 — foi
  o `w-[440px]` fixo que deixava a miniatura grande demais em janela larga.
- **No navegador não existe seletor nosso**: "Compartilhar tela" chama
  `getDisplayMedia` direto (`restricoesDeCaptura`, preset da store) e publica;
  cancelar o diálogo do browser não é erro e não vira toast. O modal de
  miniaturas é só do desktop, e a qualidade no navegador se ajusta na aba Voz
  das configurações, com os mesmos `SegmentosDeQualidade` do rodapé. A barra
  branca "Você está compartilhando sua tela inteira" que cobre o cabeçalho é do
  Firefox, não nossa — não dá para mover nem esconder.
- **O palco tem dois leiautes: grade e foco.** Sem nada no palco, a grade é a
  de sempre (`grid-layout.ts`, 16:9 maximizado na área). Com um tile no palco —
  um clique no tile, ou "Assistir transmissão" — ele vai para o **destaque**,
  16:9 centralizado e contido na área, e os outros descem para uma **faixa** de
  miniaturas centralizada; clicar no destaque volta para a grade. O anel de
  fala continua vindo da fonte única (`falando` da store e `AnelDeFala`): o
  palco não lê `isSpeaking` de participante nenhum.
  Medido na print `2026-09-03 203909`, escala 0,8075 (= 2777/3439, a largura da
  imagem sobre a do monitor do usuário; conferida por três elementos: passo da
  lista de canais 26px → 32, avatar do card do usuário 25px → 32, cápsula de
  controles 38px → 48):

  | o quê | na print | real |
  |---|---|---|
  | destaque | 1458×823 (16:9 exato) | 1806×1019, centralizado |
  | vão destaque → faixa | 6 | **8** (`FOCO_GAP`) |
  | tile da faixa | 150×86 | **188×106** (`FAIXA_ALTURA`/`FAIXA_LARGURA`) |
  | raio do tile | 6 | **8** (o `rounded-lg` que já havia) |
  | pílula de nome | 26 de altura, 8–9 de folga | **32**, folga **12** |
  | avatar no tile | 57 | ~72 (usamos 80, que é o medido a 1:1 na `101857`) |
  | cápsula de controles | 38 | 48 |
  | ícones do canto | 15–16 de tinta, 12 da direita | 20, 15 |

  A cápsula e os dois ícones do canto foram conferidos contra esta print: os
  **ícones batem** (20px de tinta, ~15 da borda direita, ~28 da de baixo — é o
  que o `IconesDoCanto` já fazia) e a **cápsula diverge**: o Discord tem 48 de
  altura e 64×48 no botão vermelho, e nós temos 52 e 70×56. A divergência é a do
  PR #91, pedida pelo usuário ("uns 10% maior"), e por isso ficou como está.

- **O fundo do tile é a cor dominante da foto** (`lib/cor-dominante.ts`), não um
  token: medido na print, o fundo do tile e o fundo do avatar são o **mesmo**
  pixel. A extração é no cliente, num canvas de 16×16, com cache por URL e
  `crossOrigin = "anonymous"`; se o canvas contaminar (CORS) ou não houver foto,
  cai na cor do avatar sem imagem (`corDoAvatar`, estável por id). A parte pura
  (`corDominanteDosPixels`) tem teste.

- **Dá para assistir a várias telas ao mesmo tempo.** A store guarda
  `assistindo: Set<userId>`, e é ele que decide a assinatura da faixa no LiveKit
  (`aplicarAssinaturasDeTela`): tela que ninguém abriu fica **desassinada** — o
  tile existe, com o convite "Assistir transmissão" sobre a cor da pessoa, e
  nada é baixado. Cada tela assistida é um tile próprio no palco; a chave do
  tile passou a ser `userId` ou `userId:trackSid`, e é ela que o `focado`
  guarda. No tile já assistido não há "Assistir": há o botão de parar e o "…".
  A miniatura do hover da lista do canal (`PreviaDeTela`) assina em **baixa
  qualidade** só enquanto o pop-up está na tela.

- **Voz e texto dividem a coluna de dois jeitos, e quem escolhe é o contexto**
  (`orientacaoDaChamada`, em `call-split-layout.ts`, com teste). O PR #108
  apagou a diferença e mandou tudo para a coluna da direita; o usuário viu na
  print `2026-09-04 001116` uma DM com a timeline espremida.
  - **Conversa direta e grupo → faixa em cima.** O palco é uma tira no topo e a
    conversa continua embaixo, na largura toda, com o composer no lugar de
    sempre. A faixa é **fixa em 199px**, medida por `getpixel` em quatro prints
    de chamada em DM com janelas bem diferentes — `2026-08-31 123800` (714),
    `160122` (718), `160106` (788) e `103419` (914) —, do filete do cabeçalho
    até onde começa o fundo da conversa. (O #72 já tinha visto o fixo, mas leu
    215; a releitura dá 199 nas quatro.) `ALTURA_MIN` passou a ser a própria
    faixa: abaixo dela os 96px que o `CallStage` reserva aos controles começam a
    comer o avatar de 80. O arrasto guarda **proporção**, para que tela maior dê
    mais palco. Na faixa o `CallStage` não desenha título: o cabeçalho da
    conversa está 199px acima dizendo o mesmo nome, e na print do Discord a
    faixa não tem título nenhum.
  - **Canal de voz de servidor → coluna de 450 à direita**
    (`PainelDeChatDaCall`). Medidas da print `2026-09-03 203909`: painel de
    363px → **450**; cabeçalho de 36 → **44** com balão de 18 a 14 da borda,
    nome e X a 16 da direita; composer de 41 → 51. O cabeçalho **não** tem
    busca, alfinete nem lista de membros — por isso o `ChatView incorporado`
    deixou de desenhar o `HeaderBar`. O arrasto guarda **pixel**: na print são
    450 numa janela de 3333, não uma fração dela. Abre pelo balão do cabeçalho
    do palco e pelo balão da linha do canal (hover, print `image (1)`).
- **A minha própria tela é assinada de volta — foi a tela preta da 0.0.18.** A
  regra de assinatura acima nasceu com um furo: no desktop a captura é nativa e
  entra na sala como um **participante remoto**, `<userId>#tela`. Do ponto de
  vista do meu cliente a minha transmissão é uma publicação remota como
  qualquer outra — e como ninguém entra em `assistindo` pela própria tela (o
  botão "Assistir" não aparece no próprio tile, e não deve mesmo), o cliente
  mandava `setSubscribed(false)` **na própria transmissão**. O SFU parava de
  encaminhá-la, `pub.track` ficava `undefined` e o tile no palco ficava
  **totalmente preto**, com o nome e o selo "Ao vivo" por cima (print
  `2026-09-04 001246`). O Rust não tinha nada a ver: ele segue publicando o
  tempo todo, e o quadro morria no cliente. Nada disso aparecia no navegador,
  onde a faixa é local e não passa por assinatura nenhuma. A regra corrigida
  mora inteira em `stores/assinaturas-de-tela.ts`, com teste e participantes de
  mentira com identidade `#tela`:
  1. **a minha tela é sempre assinada** (no Discord você vê a sua própria
     transmissão no palco — é como se confere o que está no ar);
  2. tela escolhida (`assistindo`) e miniatura aberta (`previa`) são assinadas;
     o resto — tile que mostra só o convite — fica desassinado, que é o ganho
     do #108;
  3. **a qualidade segue o tamanho do tile**: `HIGH` no destaque e na grade sem
     foco, `LOW` na faixa de 188×106 e no pop-up de 240×135. Por isso
     `setFocado`/`focarAutomaticamente` reaplicam as assinaturas — antes, quem
     subia ao destaque continuava pedindo a camada baixa.
  Duas consequências de encanamento: `RoomEvent.TrackPublished`/`TrackUnpublished`
  entraram na lista de eventos da sala (sem eles, a única notícia de uma
  transmissão nova vinha do `autoSubscribe` **já** tendo baixado a faixa), e o
  áudio da minha própria tela é desassinado de propósito — `AudioRemotoHost`
  não desenha `<audio>` para mim, então ele era banda paga por silêncio. Com a
  faixa assinada mas ainda sem o primeiro quadro, o tile diz "Carregando a
  transmissão…": um retângulo mudo é indistinguível de uma transmissão
  quebrada, que foi exatamente a leitura da print.

- **A conversa da chamada é uma coluna à direita**, não uma faixa embaixo
  (`PainelDeChatDaCall`, usado pelo canal de voz e pelo `CallSplit` da conversa
  direta). Medidas da print: painel de 363px → **450**; cabeçalho de 36 → **44**
  com balão de 18 a 14 da borda, nome e X a 16 da direita; composer de 41 → 51.
  O cabeçalho **não** tem busca, alfinete nem lista de membros — por isso o
  `ChatView incorporado` deixou de desenhar o `HeaderBar`. Abre pelo balão do
  cabeçalho do palco e pelo balão da linha do canal (hover, print `image (1)`).

- **A faixa do microfone tem um dono só: `lib/microfone.ts`.** Ele cria a faixa,
  monta a cadeia de captura **antes** de publicar, aplica preferências novas na
  faixa que já está no ar e a fecha — tudo numa fila, então `fecharMicrofone()`
  é idempotente e nunca roda no meio de um `abrirMicrofone()`. Ninguém mais
  chama `setMicrophoneEnabled`: nem o `syncFlags`, nem a troca de dispositivo,
  nem a aba de voz. Três defeitos vieram de não haver esse dono, e os três eram
  relatos do usuário:
  1. **`processor` em `captureOptions` nunca funcionou.** No livekit-client
     2.22.0, `createLocalTracks` chama `track.setProcessor(...)` *antes* de o
     `LocalParticipant` chamar `track.setAudioContext(...)`, e
     `LocalAudioTrack.setProcessor` começa lançando `"Audio context needs to be
     set on LocalAudioTrack in order to enable processors"` quando não há
     contexto. Medido aqui, fora do browser, com dublês de `getUserMedia` e
     `AudioContext`: a chamada rejeita, sempre. Como o `conectarMidia` termina
     em `.catch(() => {})`, entrar com "Avançada" **não publicava microfone
     nenhum**; segundos depois o `syncFlags` chamava `setMicrophoneEnabled(true)`
     *sem opções* e subia a faixa **crua**, sem eco, sem AGC e sem supressor. É
     isto que se ouvia como "a voz fica estranha ao entrar e depois volta ao
     normal".
  2. **`setMicrophoneEnabled(true, opts)` ignora `opts` quando a publicação já
     existe** — só faz `unmute()`. O `mute → unmute` que servia de "republicar o
     microfone" não aplicava restrição nem processador: ligar a supressão no
     meio da call não mudava nada (e, quando o publish inicial tinha falhado,
     mudava para pior).
  3. **Vazamento de `AudioContext`.** O supressor antigo abria uma
     `AudioContext` própria quando a do LiveKit não estava em 48 kHz, e quem a
     fecharia era a `destroy()` do processador — que o `LocalTrack.stop()`
     dispara **sem `await`**. Entrar e sair algumas vezes encostava no teto do
     Chromium (≈6 contextos por página), `new AudioContext()` passava a lançar e
     a supressão "bugava" até o F5. E a outra metade era pior: a `AudioContext`
     do LiveKit é fechada pelo próprio `Room.disconnect()`, então o supressor
     que ficasse pendurado nela rodava num contexto morto.
- **Um `AudioContext` de captura por aba, e ele é nosso** (`contextoDeCaptura`,
  em `lib/supressor-ruido.ts`), em 48 kHz porque é a taxa que o RNNoise assume.
  O worklet é registrado uma vez nele — `addModule` repetido no mesmo contexto é
  erro. Quem o usa o toma e o devolve (`usarContextoDeCaptura` /
  `liberarContextoDeCaptura`): as cadeias, o detector local de fala e o retorno
  do teste. Ele é **suspenso** — nunca fechado — quando o último dono sai;
  contar só as cadeias deixaria o anel de fala congelado sempre que a supressão
  estivesse desligada e o volume em 100%, que é justamente o caso em que não há
  cadeia nenhuma.
- **O detector local de fala ouve a faixa já processada.**
  `LocalTrack.mediaStreamTrack` devolve `processor?.processedTrack ??
  _mediaStreamTrack`, então o `AnalyserNode` de `voz-detector-local.ts` mede a
  saída da cadeia. É o certo duas vezes: o anel acende pelo que os outros ouvem
  (o ventilador que o RNNoise comeu não acende mais nada) e o volume de entrada
  vale também para ele. Ele é rearmado por **todo** caminho que troca a faixa —
  entrar, mudo/desmudo, trocar de microfone, mudar a supressão, começar e parar
  o teste —, porque trocar a faixa não emite `LocalTrackPublished` e um
  analisador preso à antiga mede silêncio para sempre.
- **A cadeia é `fonte → [RNNoise] → ganho → destino`.** O ganho é o "volume de
  entrada" (`audio.entrada`, 0–2) e fica **depois** do supressor de propósito: o
  RNNoise decide o que é voz pelo nível que o microfone entrega, e empurrar 200%
  na entrada dele faria ruído alto virar "voz"; já o detector de fala que acende
  o anel do participante é o do LiveKit, que mede o áudio **publicado** — ou
  seja, depois do ganho. Assim o slider mexe no que os outros ouvem e no que o
  medidor mostra, sem mexer no VAD do modelo. Mudar só o volume não republica
  nada: anda numa rampa de 20 ms dentro do `GainNode`. Ligar/desligar a supressão
  troca o grafo por `setProcessor`/`stopProcessor`, que fazem `replaceTrack` no
  mesmo `sender` — sem renegociação e sem corte. Só eco/supressão nativa/AGC/
  dispositivo exigem `restartTrack`, porque são do `getUserMedia`. A troca de
  **microfone** também passa pelo dono, e não por `room.switchActiveDevice`:
  aquele reiniciaria a faixa por baixo dele. A saída (`audiooutput`) continua
  sendo do SDK.
- **A cadeia sobe do silêncio**: 120 ms de rampa no `GainNode` ao montar, em vez
  de entrar com o áudio no volume cheio num grafo recém-nascido. E o modelo é
  carregado **antes** de o grafo existir — publicar primeiro e esperar o wasm
  depois é o que mandava os primeiros segundos de áudio cru.
- O ciclo (entrar → ligar/desligar supressão → trocar de microfone → sair →
  entrar de novo, dez vezes) tem teste: `lib/__tests__/microfone.test.ts`, com
  dublês de `AudioContext`, `getUserMedia` e da faixa local do LiveKit — este
  último imitando o vício que importa (o `stop()` chama a `destroy()` do
  processador sem esperar por ela). Conferido que o teste **falha** quando o
  contexto volta a ser um por `init()`: 60 contextos vivos em vez de 1. Um caso
  à parte cobre o teste de microfone: a faixa sai da sala, continua viva com a
  cadeia montada e volta.
- O popover da setinha do microfone tem, como no print `2026-09-03 202542`:
  "Dispositivo de entrada ›", "Redução de ruído ›" (o "Perfil de entrada" do
  Discord é o Krisp, que não temos), o slider "Volume de entrada" e
  "Configurações de voz". O slider é o mesmo `SliderDeVolume` do "Volume de
  saída" do menu do fone, **0–200%** — o print do Discord mostra o dele numa
  escala de 0 a 100, mas 0–200 é a escala que o app já usa nos dois lugares onde
  este mesmo `audio.entrada` aparece (o popover e a aba de voz), e microfone
  baixo demais é o problema comum: cortar o reforço tiraria a metade útil.
- **Não descartado**: `voiceDevices.refresh()` abre um `getUserMedia` só para
  descobrir os nomes dos aparelhos quando a lista vem anônima, e o para em
  seguida. Com uma call em pé, isso é uma segunda captura do mesmo microfone no
  Windows. Só acontece sem permissão persistida (no desktop o
  `PermissionRequested` do WebView2 resolve), e não foi medido como causa de
  nada — mas é o candidato que sobrou para um estalo isolado ao entrar.
- **Ligar numa conversa é idempotente e serializado** (PR #122). Três regras
  que precisam continuar verdade, cada uma com o defeito que a originou:
  1. **Uma tentativa por conversa por vez.** `startCall`, `acceptCall` e
     `connect` perguntam a `stores/chamada-em-curso.ts` (`jaNaChamada`) antes de
     agir: mesmo canal com `status` `connecting`/`connected`, ou fase
     `outgoing`/`active`, é **no-op**. `error` fica de fora — a faixa vermelha
     precisa do "tentar de novo". `connect` aceita `{ forcar: true }`, e só o
     `reconnect` usa (refazer a mídia da mesma sala é o caso legítimo de
     repetir). Sem isso, cada clique a mais no telefone era um `POST
     /dms/:id/call` e uma `Room` a mais.
  2. **Nunca duas `Room` ao mesmo tempo.** `entrarNaSala` chama `desmontarSala()`
     antes de construir a nova, e o handler de `RoomEvent.Disconnected` começa
     com `if (sala !== room) return`. O LiveKit não aceita identidade repetida:
     a conexão nova derruba a antiga, e era a **antiga** — com os ouvintes ainda
     vivos — que anunciava "a conexão de voz caiu" e zerava `sala` por cima da
     conexão boa. Essa era a "queda de alguns segundos ao ligar", e era ela que
     matava a tela compartilhada junto (quem transmite depende da mesma `sala`;
     e a captura nativa ficava como `#tela` órfão).
  3. **O meu próprio estado de voz não confirma a minha chamada.** `applyState`
     só dispara `{ type: "connected" }` quando o estado é de **outra pessoa**.
     `startCall` aplica o que o `POST /dms/:id/call` devolve, e o primeiro
     estado da lista sou eu entrando na sala: a fase pulava de `outgoing` para
     `active` antes de o outro lado atender, e o ringback (`<audio loop>` da
     `VoiceLayer`, que só toca em `outgoing`) morria no instante em que
     começava. **Não era a guarda de 300 ms do `tocarArquivo`** — nem o
     ringback nem o toque passam por ela; os dois são elementos próprios, e
     dividir o `chamada.mp3` é seguro.
- **Os botões de ligar e vídeo da DM ficam cinzas** enquanto a chamada daquela
  conversa está saindo, tocando (para mim) ou de pé, com tooltip "Chamada em
  andamento" (`botaoDeChamadaBloqueado` + `HeaderIcon.motivoDesabilitado`). É
  `aria-disabled`, **não** o atributo `disabled`: um `<button disabled>` não
  dispara evento de ponteiro no Chromium e o tooltip que explica o cinza nunca
  apareceria. A trava de verdade é a da store — quem clica não é só o botão (a
  faixa `CallBanner` e o teclado chegam ao mesmo `startCall`).
- **Eventos de chamada da própria conta** (todas as sessões recebem, desde o
  #117): atender em outro aparelho **cala** o toque desta janela sem avisar o
  gateway (`applyState`, o ramo `eu && call.phase === "incoming"`). Sem isso a
  segunda sessão tocava os 30 s inteiros com o cartão "Atender" na tela — e
  atender ali entrava na sala com a mesma identidade, expulsando a sessão que já
  estava na chamada. `call.ring` **não** chega a quem ligou (o servidor tira o
  autor de `alvos`); `call.ended` chega, e é inofensivo porque a máquina ignora
  evento de canal que não é o dela.
- **`POST /dms/:id/call` não toca duas vezes** (`CallsService.start`): além de
  `jaEmChamada`, o guarda é `this.tocando.has(channelId)`. Dois pedidos do mesmo
  clique duplo podem ler a contagem da sala antes de qualquer um dos dois entrar
  nela, e aí os dois concluíam que a chamada nascia agora — o outro lado recebia
  dois `call.ring` e o telefone recomeçava no meio do primeiro toque.
- **Onde estão os testes disso**: `apps/web/stores/chamada-em-curso.test.ts` (a
  regra pura), `apps/web/stores/voice-chamada.test.ts` (a store inteira com uma
  `Room` e um gateway de mentira — o primeiro teste que exercita `stores/voice.ts`
  de ponta a ponta; 9 dos 13 falham no `main` de antes) e
  `apps/api/src/modules/voice/calls-toque-unico.spec.ts`.
- Ainda aquém do Discord (não é defeito): botão de voltar para call em outro
  servidor cai no primeiro canal de texto; barra "conectado" sem cronômetro nem
  quem fala; sem "ocupado" para quem liga durante uma call; diálogos invisíveis
  com o palco em tela cheia; sem PiP; sem o degradê sutil no topo do tile que a
  print mostra; sem o tile de "atividade" ao lado do palco vazio (atividade não
  existe no produto).

## 8. Barra de título do desktop

- `tauri.conf.json`: `decorations: false`. Permissões em
  `capabilities/default.json`: `core:window:allow-minimize`,
  `allow-toggle-maximize`, `allow-internal-toggle-maximize`,
  `allow-is-maximized`, `allow-close`, `allow-start-dragging`. Nome errado de
  permissão quebra o app sem erro de build: confira contra
  `node_modules/@tauri-apps/api/gen/schemas/desktop-schema.json`.
- `BarraDeTitulo.tsx` (32px, só quando `isTauri()`): setas com histórico real
  (`stores/historico*.ts`), título da tela no centro, caixa de entrada, ajuda,
  botão verde de atualização (hook `useAtualizacao`, substitui o card antigo),
  separador, controles de 32px com 4px de gap, `data-tauri-drag-region`.
  Controles sem foco por mouse e sem tooltip. `body` desconta a altura por
  `--barra-de-titulo`.
- Limitação conhecida: sem moldura nativa, o Windows 11 não mostra o menu de
  "snap" ao pousar no maximizar (o Discord tem a mesma).
- Ctrl+I abre a caixa de entrada.

## 9. Histórico de 2026-09-02

| PR | O quê |
|---|---|
| #38 | Voz em um lugar só: entrar de outro aparelho derruba a conexão anterior e avisa |
| #39 | Bump 0.0.6 |
| #40 | Vocabulário de ícones do Discord (88 ativos), 83 arquivos migrados, tamanhos das superfícies, card flutuante |
| #41 | Card do usuário atravessa a rail |
| #42 | Barra de título própria + botão de atualização |
| #43 | Bump 0.0.7 |
| #44 | Tela de conversa medida contra o Discord (cabeçalho, perfil em DM, composer, coluna) |
| #45 | A chamada sobrevive à navegação (5 defeitos) |
| #46 | Foco dos campos com uma borda só |
| #47 | Tela de Amigos medida contra o Discord |
| #48 | Barra polida, caixa de entrada e modal "Nova mensagem" como no Discord |
| #49 | Bump 0.0.8 |
| #50 | Popover do microfone nasce do botão, não da setinha |
| #51 | Este documento |
| #52 | O quadro dos ícones recortava no arquivo, não no desenho (`10 10 80 80`) |
| #53 | Bump 0.0.9 |
| #54 | Não lidas por conversa, notificações do Windows, mídia sem prompt e ping na barra de voz |
| #55 | A parte visual da call medida contra o Discord |
| #56 | Lista de membros, Amigos e Adicionar amigo como no Discord |
| #57 | Configurações: navegação, campos, ícone do servidor, cargos e convites como no Discord |
| #58 | Cabeçalho de canal, busca e boas-vindas como no Discord |
| #59 | Menu de contexto, tooltip, popover de perfil e modal como no Discord |
| #60 | Composer, embed e mensagem como no Discord |
| #61–#62, #66–#67, #69 | Compartilhamento de tela nativo no desktop: enumerar fontes, capturar sem a borda amarela, publicar no LiveKit pelo Rust, seletor com miniaturas, áudio do sistema (WASAPI) |
| #63–#64, #68 | Coluna de canais, rota de remover ícone, rail e rodapé medidos |
| #65, #70 | Bumps 0.0.10 e 0.0.11 |
| #71 | **CRT estática no Windows** (`.cargo/config.toml` na raiz): a libwebrtc do `livekit` vem com /MT e o link da 0.0.11 quebrou com LNK2038 — o clippy não pega porque não linka |
| #72 | Palco da call abre numa faixa fixa (~215px), não em metade da coluna |
| #73 | Sons originais do Discord (`public/sons/`), badge de não lidas na borda (rail com miolo de 16px), cronômetro colado na borda (botões do hover fora do fluxo), amizade nova põe a conversa no topo dos dois lados |
| #74 | Sons do Discord em todo caminho: mudo/surdo pelo botão do rodapé (o som foi para a store), entrar e transmissão de tela com arquivo, nada mais sintetizado |
| #99 | GIF animado como foto de perfil e banner: o GIF pula o recorte (canvas achata a animação) e sobe inteiro, com teto de 8 MB, lado de 2048px, assinatura `GIF87a`/`GIF89a` conferida e content-type real no proxy |
| #103 | Criar canal e categoria pela coluna, "+" sempre visível no cabeçalho, e mover alguém de canal de voz arrastando (`MOVE_MEMBERS`) |
| #104 | Convite vira cartão com "Entrar" (reconhecido no host público **e** no host do app), `guild.joined` para todas as conexões da conta, logo do rail volta para Amigos, e o foco da janela do desktop volta a marcar a conversa aberta como lida |
| #105 | Sons: um som não se sobrepõe a si mesmo em menos de 300 ms, um dono só do volume com fator por som, e badge de não lidas no ícone da caixa de entrada |
| #112 | As duas categorias padrão viram categorias de verdade (§4.1): paravam de existir na primeira categoria criada, e não dava para renomear nem apagar |
| #117 | Auditoria de tempo real entre as sessões da conta (§4.2) e as lacunas fechadas: `channel.read` (o "lido" num cliente apaga o badge no outro), fechar conversa/sair do grupo, pedido de amizade na aba "Enviados", `account.updated` e `sessions.revoked` finalmente ouvidos, entrar pela Descobrir, aceitar as regras, tirar o banner |

Desktop: 0.0.6 (#38 + #40 + #41), 0.0.7 (+ #42), 0.0.8 (tudo até #50),
0.0.10 (até #64), 0.0.11 (até #71, primeira com a tela nativa), 0.0.12 (até #73).

**Duas sessões da mesma conta.** O que muda a lista de servidores ou de
conversas sai para a **sala do usuário** (`user:<id>`, `emitToUser`), onde estão
todas as conexões — não para o socket que fez a requisição, que já tem a
resposta HTTP na mão. Foi essa a falha do `redeem` até o #104: ele punha os
sockets na sala do servidor e avisava o servidor do membro novo, mas não avisava
o próprio usuário, e o desktop ficava com o rail velho até reiniciar. Vale para
`guild.joined` (entrei/criei), `guild.removed` (saí/expulso/apagado),
`channel.updated` (conversa aberta ou reaberta), amizade e `account.updated`.

**O host do app de desktop não é o host público.** Dentro do Tauri a origem é
`http://tauri.localhost` — o WebView2 serve o export estático de dentro do app.
Qualquer regra que compare com `window.location.origin` (link de convite, link
de mensagem, "é nosso?") tem que aceitar **os dois**: o host público, que vem de
`WEB_URL` em `lib/config.ts` (derivado do `NEXT_PUBLIC_API_URL`, o único que
todos os builds recebem), e o do próprio app.

**O foco da janela é o gate de "marcar como lido".** `lib/na-tela.ts` decide o
que está na tela; `janelaTemFoco()` decide se o usuário está olhando. No desktop
a janela `main` nasce `visible: false` (§5.2), então o primeiro
`document.hasFocus()` é `false` e quem mostra a janela é a janelinha. O estado
de foco precisa aceitar sinal do `focus`/`blur` do DOM **e** do `onFocusChanged`
do Tauri (`lib/foco-da-janela.ts`): fotografá-lo uma vez e esperar só pelo
ouvinte nativo — que entra por `import()` assíncrono — travava tudo em "sem
foco" pelo resto da sessão.

**Sons.** `lib/ringtone.ts` e `lib/notification-sound.ts` tocam arquivos de
`apps/web/public/sons/` (origem: `docs/Reference/audio/`, fora do git). **Nada
é sintetizado** — os tons de Web Audio de entrar/alguém-entrou saíram quando o
arquivo de entrada chegou.
Mapeamento final (origem → nosso arquivo → quando toca):

| origem | nosso | quando |
|---|---|---|
| `discord-notification.mp3` | `mensagem.mp3` | mensagem nova |
| `discord-call-sound.mp3` | `chamada.mp3` | chamada recebida (loop) e o ringback de quem liga |
| `discord mute.mp3` | `mudo.mp3` | mutar o microfone **e** ficar surdo |
| `discord-unmute-sound.mp3` | `desmudo.mp3` | desmutar **e** religar o áudio |
| `user_join.mp3` | `entrar.mp3` | eu entrei **e** alguém entrou |
| `discord connect and disconect.mp3` | `sair.mp3` | eu saí **e** alguém saiu |
| `discord_start_screan.mp3` | `transmissao-iniciada.mp3` | a minha transmissão de tela começou |
| `discord-stream-stop.mp3` | `transmissao-encerrada.mp3` | a minha transmissão terminou |
| `discord-user-moved.mp3` | `movido.mp3` | movido de canal — **sem chamador** (a API não move ninguém) |

O som de mudo/surdo mora dentro de `useVoicePrefs.toggleMute`/`toggleDeafen`,
não em quem chama: assim o botão do rodapé, a barra da call e o atalho soam
igual, e fora de qualquer chamada também. Tocá-lo no `VoiceHotkeys` de novo
dobrava o aviso — por isso ele lá só dispara a ação. O interruptor mestre
`notificationSound` e o interruptor por som (`stores/sons.ts`) valem para
todos; a prévia da aba Notificações passa `forcar` e ignora os dois.

**Duas regras que o #105 acrescentou, e que não devem ser desfeitas:**

1. **Um som não se sobrepõe a si mesmo.** `tocarSom` é a única porta, e ela
   engole um segundo pedido do **mesmo arquivo** dentro de 300 ms
   (`JANELA_SEM_REPETIR_MS`, a janela do Discord). A guarda é por arquivo e
   não por nome porque o recurso disputado é o elemento: `mudo`/`surdo` são o
   mesmo `mudo.mp3`, `entrar`/`alguem-entrou` o mesmo `entrar.mp3`. Sons
   *diferentes* continuam podendo soar juntos (sair + entrar ao trocar de
   sala). Isso existe porque vários caminhos legítimos disparam o mesmo aviso
   quase junto — o `useEffect` de `useRealtime` remontando (StrictMode em
   dev), `connect()` chamado por `startCall`/`acceptCall`/retomada/reconexão
   de mídia no mesmo canal, `pararTela` e o evento `telaEncerrada` do Rust — e
   o `currentTime = 0` sobre o elemento em cache reiniciava o som no meio,
   que é o que se ouvia como "toca várias vezes" e "varia de volume".
   Duas sessões da mesma conta (desktop + navegador) continuam tocando uma
   vez cada: a guarda é por cliente, e não há como ser diferente.
2. **Um dono só do volume.** `volumeDoSom(nome)` = `outputVolume` das
   configurações × o fator do som. **Ninguém mais passa volume** — nem
   `tocarSomDeNotificacao`, nem a prévia da aba, nem `prepararToque` (os dois
   `<audio loop>` de toque saem no mesmo `volumeDoSom("chamada")`). Antes eram
   quatro contas diferentes e a mensagem tinha `1` como padrão. Os fatores,
   decididos com o usuário: chamada 0,7; entrar/sair/alguém-entrou/
   alguém-saiu/transmissão/movido 0,5; mensagem 0,4; mudo/desmudo/surdo/
   não-surdo 0,35. `setSinkId` só é reaplicado quando a saída escolhida muda:
   trocar a rota de um elemento tocando também dá salto de nível.

`NomeDeSom` mora em `lib/ringtone.ts` (é a chave dos mapas de arquivo e de
fator) e `stores/sons.ts` o reexporta.

**Caixa de entrada (badge).** O ícone que abre a caixa mostra um selo vermelho
quando há o que ler — na barra de título do desktop e no cabeçalho de Amigos
do navegador, que são o **mesmo** `InboxPopover`. Conta o que é dirigido a mim
(menção em servidor + não lida em conversa), igual ao contador no ícone do
app; canal de servidor não lido sem menção vira um ponto de 8px, e número e
ponto não se somam (`badgeDaCaixa`, em `stores/nao-lidas.ts`, com teste). Lê
`useGuilds`/`useDMs`, **não** o `useInbox` — este é um retrato tirado ao abrir
o painel, e um ícone que só descobre a novidade depois do clique não serve
para nada; é também por isso que o selo some sozinho no "marcar tudo como
lido". Medidas (renderizado com o CSS compilado e conferido no Pillow):
miolo 16×16, número 12px bold, anel de 3px na cor da superfície (`ring-rail`
na barra, `ring-chat` no cabeçalho), em `top-0 -right-2` sobre o botão de 24.
O `-top-1 -right-1` do rail é para um item de 40: num botão de 24 dentro da
barra de 32 ele cobria o ícone quase inteiro e o anel passava da borda da
janela. Decisão do usuário: **só o badge** — sem faixa no topo e sem
notificação extra.

**Sons (2026-09-03, noite).** Quatro arquivos trocados pelos que o usuário
colocou em `docs/Reference/audio/`: `enter.mp3` → `entrar.mp3` (eu entrei e
alguém entrou), `notificacao.mp3` → `mensagem.mp3`, `discord_call.mp3` →
`chamada.mp3` (toque e ringback), `discord_disconnect.mp3` → `sair.mp3` (eu saí
e alguém saiu). Fatores de volume bem baixos por pedido dele: mensagem 0,15;
chamada 0,35; mudo/desmudo/surdo/não-surdo 0,08; entrar/sair/transmissão/movido
0,2 — sempre × `outputVolume`.

**Arrastar e soltar no desktop (2026-09-03).** O WebView2 do Tauri nasce com
`dragDropEnabled: true` (o gancho nativo de arquivos), e isso **engole o
drag-and-drop HTML5** da página: arrastar participante entre canais, reordenar
canais/categorias — tudo funcionava no site e nada no app. `dragDropEnabled:
false` na janela `main` devolve os eventos ao DOM; o app não usa o gancho
nativo (nenhum `onDragDropEvent`), então anexar arquivo por arrasto continua
pelo `drop` da página.

## 10. Pendências e o que não foi verificado

- **Nenhum PR de hoje foi visto em app rodando.** Validação pelos prints do
  usuário (§6.5). O que estiver torto vira PR pequeno.
- Navegador do usuário que não carregava após F5 durante uma call (antes do
  #45): sem causa confirmada; pedia-se o erro do Console (F12) antes de limpar
  os dados do site.
- `ScreenSharePicker.tsx` ainda importa do lucide; a sessão do compartilhamento
  de tela reescreve.
- Coluna do modal de configurações: os 252 estavam certos — no print da janela
  flutuante a coluna mede 252 de borda a borda.
- Polimentos de voz listados no §7.
- Painel "Ativo agora" e a barra de título no navegador: decisão do usuário.
- **O instalador novo (§5.1) nunca rodou no Windows.** O `.nsi` compila aqui,
  mas cor, leiaute, animação, fechar-sozinho e abrir-o-app dependem do build do
  CI e de alguém instalando.
- **`installMode` continua `perMachine`, e por isso toda atualização pede UAC.**
  Só `currentUser` seria 100% silencioso (é o que o Discord faz). A troca não é
  só mudar a linha: o template do Tauri detecta instalação anterior lendo
  `SHCTX`, e o `SetContext` do `utils.nsh` aponta `SHCTX` para HKCU quando o
  modo é `currentUser` — ou seja, o instalador por usuário **não enxerga** a
  instalação perMachine que está na máquina hoje (0.0.12) e deixaria duas
  cópias: arquivos em `Program Files` + entrada em HKLM, mais uma cópia em
  `%LOCALAPPDATA%`. A varredura de WiX no topo do `PageReinstall` também não
  ajuda: ela só casa com desinstaladores que começam com `msiexec`. Migrar
  exige um passo próprio no template (ler `HKLM\...\Uninstall\Streamz` e
  chamar o desinstalador antigo por `ExecShell "runas"`, um UAC único), e isso
  precisa ser testado numa máquina que já tenha a versão perMachine — não dá
  para verificar daqui.
- **Janela branca no boot do desktop**: resolvida no papel pelo PR #88 (a
  `main` nasce `"visible": false` e quem a mostra é a janelinha, que também
  nasce escondida e se mostra no primeiro quadro), mas **nunca vista num
  Windows** — nem ela, nem o canto arredondado por `transparent: true` no
  WebView2, nem o ciclo de atualização pela janelinha.

## 11. Checklist para uma sessão nova

1. `ListAgents`: quem está vivo e no quê. Avise o que vai tocar.
2. Worktree própria a partir de `origin/main`. Nunca `checkout` no clone.
3. Leia `icones.tsx` (topo), `design.md`, `ACERVO.md` antes de mexer em UI.
4. Meça nos prints por `getpixel`; renderize e olhe; registre o que não viu.
5. Verificação completa no docker (§3.2). Tudo verde antes do PR.
6. PR com "como testar" e tabela de medidas. Não mergeie sem o usuário.
7. Depois do merge: confira `docker ps` e, se falhou no Prisma, `rerun --failed`.
8. Versão nova do desktop: §5, na ordem, com `STREAMZ_TAG` no restart.
