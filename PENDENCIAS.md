# Pendências de ambiente

Coisas que **você precisa instalar/configurar** para rodar o projeto de ponta a
ponta. Nada disso bloqueia escrever código — bloqueia apenas *executar*. Marque
conforme resolver.

## 1. Migrar de SQLite para Postgres — prioridade alta
**Agora estamos em SQLite** (`apps/api/prisma/dev.db`) só para desenvolver sem
depender de infra. O caminho para Postgres já está **preparado** (sem quebrar o
dev SQLite atual):

- [x] Schema Postgres pronto em **`apps/api/prisma/schema.postgres.prisma`** —
      cópia do schema com `provider = "postgresql"` e os **enums** reintroduzidos
      (`UserStatus`, `ChannelType`, `MemberRole`). Validado (`prisma validate`).
- [x] **Primeira migration** gerada em `apps/api/prisma/migrations/` (offline, via
      `migrate diff`) — cobre todas as tabelas atuais, incl. `RefreshToken`,
      `DMParticipant`, `ChannelMember`, `Message.parentId`, `Attachment` e as
      flags `Channel.private/readOnly`.
- [ ] Provisionar o Postgres — escolha um:
  - **Gerenciado (recomendado)**: banco grátis em [neon.tech](https://neon.tech)
    ou [supabase.com](https://supabase.com); colar a URL em `DATABASE_URL`.
  - **Docker Desktop**: `pnpm db:up` (sobe só o Postgres). `DATABASE_URL=`
    `postgresql://newdisc:newdisc@localhost:5432/newdisc?schema=public`.
- [ ] Aplicar a migration: **`pnpm db:pg:deploy`** (`migrate deploy` usando o
      `schema.postgres.prisma`).
- [ ] Tornar o Postgres o schema ativo: copie `schema.postgres.prisma` sobre
      `schema.prisma` (ou aponte `--schema`) e `prisma generate`.

> **Sincronia dos schemas:** enquanto os dois arquivos coexistirem, toda mudança
> de modelo feita no `schema.prisma` (SQLite, dev) precisa ser refletida no
> `schema.postgres.prisma`. Ao adotar o Postgres de vez, apague o SQLite.
>
> Nota: em SQLite os enums viram texto no banco, mas os valores válidos seguem
> garantidos pelos union types em `packages/shared` e pela validação nos DTOs.

## 1b. Cloudflare R2 (bloqueia os anexos)
O código de anexos está pronto (upload, storage, render); falta só a credencial
para testar ponta a ponta — mesmo padrão do LiveKit.

- [ ] Criar um bucket em [dash.cloudflare.com](https://dash.cloudflare.com) → R2 e
      um **API Token** (S3). Preencher no `.env`: `R2_ACCOUNT_ID`,
      `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
- [ ] (Opcional) `R2_PUBLIC_BASE_URL` com o domínio público do bucket (r2.dev ou
      domínio próprio). Sem ela, os anexos são servidos pelo proxy da API em
      `/api/uploads/file/:id` — funciona só com as credenciais acima.

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
- [ ] Instalar via [rustup.rs](https://rustup.rs). Necessário para o Tauri.
- [ ] Gerar os ícones do app:
      `pnpm --filter @newdisc/desktop tauri icon caminho/logo.png`

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

---
_Status atual: backend rodando em SQLite; chat de texto (editar/apagar/reagir),
threads, DMs 1-a-1 e em grupo, moderação em tempo real e canais privados/somente-
leitura implementados (features novas com typecheck ok, faltando validação ponta
a ponta com o servidor rodando). Falta o banco de produção (Postgres) — e a
primeira migration, já que o schema evoluiu por `db push` —, credenciais do
LiveKit e o Rust para o build desktop._
