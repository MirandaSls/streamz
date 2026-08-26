# Pendências de ambiente

Coisas que **você precisa instalar/configurar** para rodar o projeto de ponta a
ponta. Nada disso bloqueia escrever código — bloqueia apenas *executar*. Marque
conforme resolver.

## 1. Postgres — subir o banco (única coisa que falta)
O projeto roda **só em Postgres**, em dev e em prod: um `schema.prisma`, os enums
no banco e migrations versionadas. Não há mais SQLite nem `db push`. O que falta
é ter um Postgres de pé.

- [x] `schema.prisma` é o Postgres (`provider = "postgresql"`, enums
      `UserStatus`, `ChannelType`, `MemberRole`). A variante
      `schema.postgres.prisma` foi apagada.
- [x] **Migration inicial** em `apps/api/prisma/migrations/20260825000000_init/`
      — confere com o schema atual (`prisma migrate diff --from-empty`).
- [ ] Subir o banco — escolha um:
  - **Sem Docker (funciona hoje nesta máquina)**: `pnpm db:embedded` sobe um
    Postgres embutido em `./.pgdata` (UTF-8, mesmas credenciais do compose).
    Foi assim que a validação ponta a ponta de 2026-08-25 rodou — o Docker
    Desktop não sobe aqui porque o WSL está sem distribuição.
  - **Docker Desktop**: `pnpm db:up` (sobe só o Postgres, exposto apenas em
      `127.0.0.1:5432`). `DATABASE_URL=`
      `postgresql://newdisc:newdisc@localhost:5432/newdisc?schema=public`.
      Credenciais diferentes: exporte `POSTGRES_USER`/`POSTGRES_PASSWORD`/
      `POSTGRES_DB` antes do compose e reflita na `DATABASE_URL`.
  - **Gerenciado**: banco grátis em [neon.tech](https://neon.tech) ou
      [supabase.com](https://supabase.com); colar a URL em `DATABASE_URL`.
- [ ] Aplicar o schema: **`pnpm db:migrate`** em dev (gera e aplica migrations),
      **`pnpm db:deploy`** em prod/CI (só aplica o que já existe).

> **Ao mudar um modelo:** edite o `schema.prisma` e rode `pnpm db:migrate`. Toda
> mudança vira migration versionada — `prisma db push` não faz parte do fluxo,
> porque deixa o banco fora de sincronia com o histórico sem deixar rastro.

## 1b. Cloudflare R2 (bloqueia os anexos)
O código de anexos está pronto (upload, storage, render); falta só a credencial
para testar ponta a ponta — mesmo padrão do LiveKit.

- [ ] Criar um bucket em [dash.cloudflare.com](https://dash.cloudflare.com) → R2 e
      um **API Token** (S3). Preencher no `.env`: `R2_ACCOUNT_ID`,
      `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
- [ ] (Opcional) `R2_PUBLIC_BASE_URL` com o domínio público do bucket (r2.dev ou
      domínio próprio). **Só preencha se o bucket for mesmo público**: sem ela a
      API devolve URL assinada com expiração, e só cai no proxy autenticado
      `/api/uploads/file/:id` quando não dá para assinar.

## 1c. Tenor (bloqueia só a busca de GIF)
O botão GIF do composer já existe e o envio de GIF por URL não depende do R2 —
o que falta é a chave da busca. Sem ela o seletor mostra "GIFs não configurados"
e o resto do app segue igual.

- [ ] Pegar uma chave gratuita em
      [developers.google.com/tenor](https://developers.google.com/tenor/guides/quickstart)
      e preencher `TENOR_API_KEY` no `.env`.
- _Emojis personalizados e figurinhas, ao contrário, **dependem do R2** (item 1b):
  a imagem vai para o bucket; sem credencial o upload responde 503 com o motivo._

## 2. LiveKit (bloqueia a voz — Dia 4)
O código de voz é **agnóstico de provedor** (só usa `LIVEKIT_URL/KEY/SECRET`).
Duas formas de rodar — escolha uma:

**Opção A — Self-host via Docker (preparado):**
- [x] Serviço `livekit` no `docker-compose.yml` (profile `livekit`) + modelo de
      config em `livekit.example.yaml` + scripts `pnpm livekit:up` / `livekit:down`.
- [ ] Criar o `livekit.yaml` **local** (ele é ignorado pelo git porque carrega o
      secret real; o docker-compose monta esse caminho):

      cp livekit.example.yaml livekit.yaml
      openssl rand -hex 32          # gere o secret

      Cole o valor gerado nos **dois** lugares — `keys: devkey: <secret>` no
      `livekit.yaml` e `LIVEKIT_API_SECRET` no `.env`. Eles precisam **bater**,
      senão o token de acesso é rejeitado pelo servidor.
- [ ] `pnpm livekit:up` e usar no `.env` (Opção A): `LIVEKIT_URL=ws://localhost:7880`,
      `NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880`, `LIVEKIT_API_KEY=devkey`.

**Opção B — LiveKit Cloud:**
- [ ] Criar conta e um *project* em [cloud.livekit.io](https://cloud.livekit.io).
- [ ] Copiar **URL** (`wss://...`), **API Key** e **API Secret** para o `.env`
      (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`,
      `NEXT_PUBLIC_LIVEKIT_URL`).

## 3. Rust / cargo (bloqueia o build do desktop — Dia 5)
- [x] ~~Instalar via [rustup.rs](https://rustup.rs)~~ — feito em 2026-08-25
      (cargo 1.98). O `cargo` fica em `%USERPROFILE%\.cargo\bin`; se um terminal
      antigo não achar, reabra.
- [x] ~~Gerar os ícones do app~~ — feito a partir de `apps/desktop/logo.svg`
      (balão do rail sobre o blurple). Para trocar o logo, edite o SVG e rode
      `pnpm --filter @newdisc/desktop tauri icon logo.svg`.
- [ ] `pnpm --filter @newdisc/desktop tauri build` — gera o instalador em
      `apps/desktop/src-tauri/target/release/bundle/`.

**Empacotamento resolvido:** o desktop embute a web como **HTML estático**
(`frontendDist: ../../web/out`). O `output: "export"` do Next não está mais
comentado — ele liga por ambiente (`TAURI_ENV_*`, que o Tauri injeta no
`beforeBuildCommand`, ou `NEXT_OUTPUT=export` na mão), então o build web normal
(`next start`) continua funcionando. Motivo da escolha e alternativa descartada
(carregar URL remota): `apps/desktop/README.md`.

## 4. Segredos do `.env`
- [ ] Trocar `JWT_SECRET` e `JWT_REFRESH_SECRET` por strings aleatórias longas
      (ex.: `openssl rand -hex 32`).

## 5. Mais adiante (pós-MVP)
- [ ] **Auto-update do desktop** — o `tauri-plugin-updater` foi **desligado**
      (estava apontando para `releases.newdisc.dev`, que não existe, com `pubkey`
      placeholder; assim ele só gera erro em runtime). Para religar:
  - [ ] Gerar o par de chaves e guardar a privada **fora do repo**:
        `pnpm --filter @newdisc/desktop tauri signer generate -w ~/.tauri/newdisc.key`
  - [ ] Publicar um endpoint real de releases
        (`/updater/{{target}}/{{arch}}/{{current_version}}`) servindo o JSON de
        update assinado.
  - [ ] Reativar plugin + capability + `plugins.updater` + `createUpdaterArtifacts`
        e assinar o build com `TAURI_SIGNING_PRIVATE_KEY` — passo a passo em
        `apps/desktop/README.md` (seção "Auto-update").
- [ ] Assinatura de código do instalador Windows (Azure Trusted Signing) — remove
      o alerta do SmartScreen ao enviar o `.exe`.
- [ ] Migrar a mídia de LiveKit Cloud para **self-host** (call sem limite de
      tempo) quando o MVP estiver validado.

## 6. Backlog de escopo (próximos blocos)
Ordem sugerida dos próximos blocos de features:

- [x] ~~**Anexos/imagens nas mensagens**~~ — feito: módulos `storage` (cliente
      S3→Cloudflare R2) e `uploads` (`POST /uploads` com validação por
      magic-bytes + `GET /uploads/file/:id` como proxy), modelo `Attachment`
      vinculado por id no envio da mensagem, e composer com input/drag-drop/colar
      + render inline de imagens e card de arquivo. _Typecheck ok nos 3 pacotes;
      o upload real depende das credenciais `R2_*` (sem elas, responde 503)._
- [x] ~~**Convites de verdade**~~ — feito: modelo `Invite` (código, expiração,
      limite de usos), endpoints criar/preview/redeem, UI de criar convite e
      entrar por código. Verificado ponta a ponta. O `POST /guilds/:id/join`
      antigo foi **removido** (furava os convites).
- [x] ~~**Moderação**~~ — feito: kick, ban (bloqueia reentrada por convite),
      unban e lista de bans, com hierarquia de papéis; UI de expulsar/banir no
      hover da lista de membros. Verificado ponta a ponta. O usuário expulso/
      banido agora **sai da tela em tempo real** (evento WS `guild.removed`).
- [x] ~~**DMs 1-a-1**~~ — feito: canal de DM canonicalizado por dupla, lista,
      histórico e envio em tempo real (salas por usuário no gateway); UI com
      botão ✉️ no rail e 💬 na lista de membros. Verificado ponta a ponta.
- [x] ~~**Grupos de DM** (3+ pessoas)~~ — feito: modelo baseado em
      participantes (`DMParticipant`), `POST /dms/group`, título/avatar por
      conversa e modal de criar grupo a partir dos contatos. _Typecheck ok;
      falta validar ponta a ponta._
- [x] ~~**Busca de mensagens** e **carregar histórico antigo**~~ — feito: busca
      por conteúdo no canal + scroll infinito (paginação por cursor, preservando
      a posição de rolagem). Verificado com 120 mensagens (50+50+20) e busca.
- [x] ~~**Threads**~~ — feito: `Message.parentId`, timeline mostra só raízes,
      `GET .../:messageId/thread`, contador de respostas e painel lateral de
      thread com envio em tempo real. _Typecheck ok; falta validar ponta a ponta._
- [ ] **Stickers, emojis animados** (dependem de storage de assets — ver Anexos).

### Lacunas conhecidas
- [x] ~~**Presença em tempo real**~~ — implementado: o gateway conta conexões por
      usuário e emite `presence.update` (ONLINE/OFFLINE) no connect/disconnect,
      atualizando o DB e a lista de membros ao vivo. Verificado com 2 usuários.
- [x] ~~**Permissões de canal**~~ — feito o essencial: canais **privados**
      (allowlist `ChannelMember` além de OWNER/ADMIN) e **somente-leitura** (só
      moderação posta), com autorização central (`assertCanView/PostChannel`),
      lista de canais escondendo privados e UI de criar/gerenciar acesso.
      _Ainda um corte:_ não há matriz de overrides por papel/permissão fina
      (ex.: silenciar, gerenciar mensagens) — só os dois modos acima.
- [x] ~~**DM não tem as features de mensagem**~~ — resolvido pela
      [ADR-0001](docs/adr/0001-unificar-dm-em-channel-message.md): DM/grupo são
      `Channel` sem servidor e ganham reação, anexo, edição, remoção, thread e
      busca. _Typecheck e testes ok; falta validar ponta a ponta com o Postgres._
- [x] ~~**Sem indicador de "digitando"**~~ — feito: `stores/typing.ts` +
      `TypingIndicator` sob o composer; o composer emite `typing` a cada 3s.
- [x] ~~**Sem estado de leitura**~~ — feito: `ReadState` (lastReadAt por
      usuário/canal), badge de menções e pílula de não-lido no rail, canal em
      negrito, "marcar como lido". Validado ponta a ponta (2 usuários).
- [x] ~~**Sem perfil**~~ — feito: nome de exibição, avatar (precisa do R2),
      status manual (Ausente/Não perturbe/Invisível), promover/rebaixar admin,
      renomear/apagar canal, sair/apagar servidor, convites (listar/revogar),
      busca de usuário para DM/grupo. Markdown, menções e prévia de link também.
- [x] ~~**Presença não zera no boot**~~ — feito (`onModuleInit` do gateway).
      Com `REDIS_URL` a presença, o broadcast do Socket.IO e o throttler passam a
      ser compartilhados entre instâncias; sem, ficam por processo.
- [x] ~~**Sem CI nem imagem**~~ — feito: `.github/workflows/ci.yml` (Node 22 +
      pnpm do `packageManager`) roda `prisma generate` → build do `shared` →
      typecheck dos três pacotes → testes de api e web → `next build`, e um job
      separado buildar as duas imagens (sem push). `apps/api/Dockerfile` e
      `apps/web/Dockerfile` são multi-stage, rodam como usuário `node` e têm
      `HEALTHCHECK`; o `docker-compose.yml` ganhou os serviços `api`, `web` e
      `redis` (profile `redis`). Observabilidade junto: log JSON com id de
      requisição, `GET /api/health` (liveness), `/api/ready` (Postgres+Redis) e
      `/api/metrics` (Prometheus).
      _Validado por typecheck + testes; **o build das imagens não foi executado**
      — ver "Ambiente" abaixo._

### Ainda depende de ambiente (não dá para fechar por código)

- [ ] **Build de imagem nunca executado**: Docker Desktop não funciona na
      máquina de desenvolvimento (WSL sem distro), então os dois `Dockerfile` e
      os serviços novos do compose foram validados só por revisão. A primeira
      execução real será o job `docker` do CI — é o lugar certo para descobrir
      um `COPY` de caminho que sumiu ou dependência nativa que não compila no
      Alpine.
- [ ] **Sem registry**: o CI faz `push: false`. Publicar exige escolher o
      destino (GHCR, Docker Hub, registry do provedor), criar o segredo e
      decidir a tag (SHA do commit + `latest` por branch).
- [ ] **Deploy não escolhido**: sem provedor definido não há `RUN_MIGRATIONS`
      ligado num job de release, nem `TRUST_PROXY`/`APP_VERSION` preenchidos,
      nem Postgres/Redis gerenciados provisionados.
- [ ] **`/api/metrics` é público**: hoje qualquer um lê os contadores (nada
      sensível, mas expõe volume de tráfego). Ao publicar, feche por rede ou
      exija um token — decisão que depende de onde o Prometheus vai rodar.

---
_Status atual: backend em Postgres (schema único + migration inicial; falta só
subir o banco); chat de texto (editar/apagar/reagir), threads, DMs 1-a-1 e em grupo, moderação em tempo real e canais privados/somente-
leitura implementados (features novas com typecheck ok, faltando validação ponta
a ponta com o servidor rodando). Falta provisionar o Postgres, credenciais do
LiveKit e o Rust para o build desktop._

<!-- b-canais -->
### Canais: categorias, tópico, modo lento (rodada 2)
- [x] **Categorias** — modelo `Category`, CRUD em `/guilds/:id/categories`,
      eventos `category.created/updated/deleted`, colapso por usuário no
      `localStorage`. Sem nenhuma categoria a barra lateral ainda agrupa por
      tipo, como o template padrão do Discord.
- [x] **Reordenar** — arrastar-e-soltar (DnD nativo do HTML5) de canais entre e
      dentro de categorias e de categorias entre si; `PATCH
      /guilds/:id/channels/positions` grava o lote e emite `channel.updated`.
- [x] **Configurações do canal** — modal com abas (visão geral, permissões,
      apagar): nome, tópico (`Channel.topic`), modo lento
      (`Channel.slowmodeSeconds`), NSFW (`Channel.nsfw`), somente-leitura,
      privacidade e allowlist.
- [x] **Modo lento** — aplicado no envio (`429` com os segundos restantes;
      moderação isenta) e contagem regressiva no cliente pelo `useSlowmode`.
- [x] **Canal de anúncios** — `ChannelType.ANNOUNCEMENT` (somente-leitura com
      ícone de megafone). `readOnly` continua valendo para os canais antigos.
- [ ] **"Seguir" canal de anúncios** em outro servidor — item do menu existe
      desabilitado ("em breve"); não há modelo de canal seguido.
- [x] **Estados de voz na barra lateral** — ligado na integração da rodada 2.
      A lista sob o canal de voz é o `VoiceChannelMembers` de f-voz, sobre a
      store `stores/voice`; a `stores/voiceStates.ts` era uma segunda cópia do
      mesmo estado e foi removida.
- [x] **Visibilidade por permissão de cargo** — `GuildsService.filterVisible`
      calcula `VIEW_CHANNEL` com `computePermissions` (c-cargos). A barra
      lateral não filtra nada: desenha o que a API mandou.
## Configurações, notificações e atalhos (agente E)

Nada aqui bloqueia rodar o app — são as pontas que dependem de outra pessoa ou
de uma variável opcional.

- [ ] `NEXT_PUBLIC_APP_VERSION` (opcional): aparece no rodapé do menu de
      configurações. Sem ela, mostra `0.0.1`.
- [ ] **Sessões/dispositivos** dependem de `GET/DELETE /me/sessions` (agente I).
      A aba já está pronta contra o contrato
      (`{ id, createdAt, expiresAt, current, userAgent? }`) e mostra "ainda não
      disponível nesta API" enquanto a rota responder 404.
- [x] **Perfil** — `PerfilTab.tsx` é a versão de d-social (nome de exibição,
      avatar, "sobre mim", pronomes, faixa). **Conta/privacidade**
      (`ContaTab.tsx`, `SegurancaTab.tsx`) seguem esperando o agente I.
- [x] **Apertar para falar** e **dispositivos de áudio/vídeo** — a aba "Voz e
      vídeo" monta o `VoiceSettingsPanel` de f-voz, que é quem escreve nas
      stores que os atalhos e os controles de voz leem. O par
      `voiceMode`/`pushToTalkKey` de `stores/settings` era estado morto e saiu.
- [ ] **Notificação do navegador** só dispara depois que o usuário concede a
      permissão (pedida uma vez por sessão, ver `lib/desktop.ts`), e o som só
      toca depois da primeira interação com a página — regra do autoplay.
- [ ] **Contador no ícone**: usa `setBadgeCount` no Tauri ≥ 2.1 e o Badging API
      no navegador (só em PWA instalado). Onde não houver, vira no-op.

<!-- integração r2 -->
## Pós-integração da rodada 2

O que ficou de fora depois de mesclar as oito frentes (f, c, b, a, e, d, g, h) na
`r2-integracao`. Nada aqui bloqueia rodar o app.

- [ ] **`GET/DELETE /me/sessions`** — a aba "Dispositivos" das configurações já
      está escrita contra o contrato (`SessionInfo`) e mostra "ainda não
      disponível nesta API" enquanto a rota responder 404. É do agente I.
- [ ] **Apelido por servidor (`/nick`)** — o comando existe no composer e avisa
      que não está disponível. Falta a coluna de apelido em `GuildMember` (nenhuma
      frente da rodada 2 a criou), a rota que a edita e a leitura no
      `displayNameOf` da lista de membros.
- [ ] **"Seguir" canal de anúncios** em outro servidor — o item do menu existe
      desabilitado; não há modelo de canal seguido.
- [ ] **Estado de voz é in-memory por processo** (`voice-state.store.ts`), assim
      como o token bucket do WebSocket. Com mais de uma instância da API cada uma
      teria a sua visão da sala; o `RealtimeService` já usa Redis para broadcast,
      então é o mesmo caminho a seguir.
- [ ] **Faxina diária por processo** — o `@nestjs/schedule` do
      `modules/maintenance` roda em toda instância; com mais de uma, o job
      repete.
- [ ] **Menção a cargo não vira notificação de desktop dedicada** — ela conta no
      badge, na faixa amarela e na caixa de entrada; o texto da notificação é o
      mesmo de uma menção comum.
- [ ] **Cargo apagado deixa `<@&id>` órfão** no histórico — a marcação vira
      "@cargo" em vez de sumir, que é o comportamento do Discord, mas não há
      faxina de menções.
- [ ] **`ADMINISTRATOR` não aparece na UI de cargos como aviso** — quem marca o
      bit ganha tudo, inclusive por cima dos overrides de canal, sem confirmação
      extra.
