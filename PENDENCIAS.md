# Pendências de ambiente

Coisas que **você precisa instalar/configurar** para rodar o projeto de ponta a
ponta. Nada disso bloqueia escrever código — bloqueia apenas *executar*. Marque
conforme resolver.

## 1. Migrar de SQLite para Postgres — prioridade alta
**Agora estamos em SQLite** (`apps/api/prisma/dev.db`) só para desenvolver sem
depender de infra. Antes de produção, migrar para Postgres:

- [ ] No `apps/api/prisma/schema.prisma`: trocar `provider = "sqlite"` por
      `provider = "postgresql"` e **reintroduzir os enums** (`UserStatus`,
      `ChannelType`, `MemberRole`) nos campos `status`, `type`, `role`.
- [ ] Provisionar o Postgres — escolha um:
  - **Gerenciado (recomendado)**: banco grátis em [neon.tech](https://neon.tech)
    ou [supabase.com](https://supabase.com); colar a URL em `DATABASE_URL`.
  - **Docker Desktop**: instalar de
    [docker.com](https://www.docker.com/products/docker-desktop/), reiniciar o
    terminal, então `pnpm db:up`.
- [ ] `pnpm db:migrate` para gerar as migrations de verdade (Postgres).

> Nota: enquanto estivermos em SQLite, os enums viram texto no banco, mas os
> valores válidos continuam garantidos pelos union types em `packages/shared` e
> pela validação nos DTOs.

## 2. LiveKit Cloud (bloqueia a voz — Dia 4)
- [ ] Criar conta e um *project* em [cloud.livekit.io](https://cloud.livekit.io).
- [ ] Copiar **URL** (`wss://...`), **API Key** e **API Secret** para o `.env`
      (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`,
      `NEXT_PUBLIC_LIVEKIT_URL`).

## 3. Rust / cargo (bloqueia o build do desktop — Dia 5)
- [ ] Instalar via [rustup.rs](https://rustup.rs). Necessário para o Tauri.
- [ ] Gerar os ícones do app:
      `pnpm --filter @newdisc/desktop tauri icon caminho/logo.png`

## 4. Segredos do `.env`
- [ ] Trocar `JWT_SECRET` e `JWT_REFRESH_SECRET` por strings aleatórias longas
      (ex.: `openssl rand -hex 32`).

## 5. Mais adiante (pós-MVP)
- [ ] Assinatura de código do instalador Windows (Azure Trusted Signing) — remove
      o alerta do SmartScreen ao enviar o `.exe`.
- [ ] Migrar a mídia de LiveKit Cloud para **self-host** (call sem limite de
      tempo) quando o MVP estiver validado.

## 6. Backlog de escopo (próximos blocos)
Ordem sugerida dos próximos blocos de features:

- [ ] **Anexos/imagens nas mensagens** — depende do armazenamento (Cloudflare R2
      ou MinIO local); precisa do endpoint de upload + URL pré-assinada.
- [x] ~~**Convites de verdade**~~ — feito: modelo `Invite` (código, expiração,
      limite de usos), endpoints criar/preview/redeem, UI de criar convite e
      entrar por código. Verificado ponta a ponta. (O `POST /guilds/:id/join`
      antigo continua existindo; pode ser removido depois.)
- [x] ~~**Moderação**~~ — feito: kick, ban (bloqueia reentrada por join e por
      convite), unban e lista de bans, com hierarquia de papéis; UI de expulsar/
      banir no hover da lista de membros. Verificado ponta a ponta.
      _Gap menor:_ o usuário expulso/banido só some da tela dele ao recarregar
      (falta um evento WS de "removido do servidor").
- [ ] **DMs e grupos de DM** — mensagens diretas 1-a-1.
- [x] ~~**Busca de mensagens** e **carregar histórico antigo**~~ — feito: busca
      por conteúdo no canal + scroll infinito (paginação por cursor, preservando
      a posição de rolagem). Verificado com 120 mensagens (50+50+20) e busca.
- [ ] **Threads, stickers, emojis animados** (cortes conscientes do MVP).

### Lacunas conhecidas
- [x] ~~**Presença em tempo real**~~ — implementado: o gateway conta conexões por
      usuário e emite `presence.update` (ONLINE/OFFLINE) no connect/disconnect,
      atualizando o DB e a lista de membros ao vivo. Verificado com 2 usuários.
- [ ] **Permissões granulares**: só existe OWNER/ADMIN/MEMBER; sem overrides por
      canal (corte consciente).

---
_Status atual: backend rodando em SQLite; chat de texto com editar/apagar/reagir
e lista de membros verificados ponta a ponta. Falta o banco de produção
(Postgres), credenciais do LiveKit e o Rust para o build desktop._
