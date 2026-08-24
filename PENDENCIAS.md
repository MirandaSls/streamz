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

---
_Status atual: `pnpm install` já rodou com sucesso. Falta apenas o banco para
subir a API._
