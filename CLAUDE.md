# NewDisc — guia do projeto

Clone do Discord (MVP): chat em servidores/canais em tempo real, voz/vídeo/tela e
app desktop. Referência de arquitetura e produto: **stoatchat** (fork do Revolt) —
mensagens referenciam anexos por id, storage S3-compatível, presença via WS.

Este arquivo é o mínimo que você precisa saber antes de mexer no código. Detalhe
de ambiente vive em `PENDENCIAS.md`; convenções visuais em `design.md`.

## Stack

| Camada  | Tecnologia |
|---------|------------|
| Cliente | Next.js (App Router), React, Tailwind, Zustand, Socket.IO client |
| Backend | NestJS (REST + WebSocket via Socket.IO), Prisma |
| Banco   | PostgreSQL (dev e prod, ver "Camada de dados") |
| Storage | Cloudflare R2 (cliente S3), opcional — anexos |
| Mídia   | LiveKit (Cloud no MVP) |
| Desktop | Tauri 2 |
| Monorepo| pnpm workspaces + Turborepo |

## Estrutura

```
apps/
  api/       # NestJS — módulos por domínio (auth, guilds, channels, messages,
             #   gateway, dms, voice, storage, uploads)
  web/       # Next.js — login/registro + app de chat de 3 colunas (app/app/page.tsx)
  desktop/   # Tauri 2 — embrulha a web num instalador
packages/
  shared/    # @newdisc/shared — tipos + schemas zod + WS_EVENTS, fonte única de
             #   verdade do contrato api ↔ web. Toda mudança de payload passa aqui.
```

## Comandos

```bash
pnpm dev                 # api + web juntos
pnpm --filter @newdisc/api dev
pnpm --filter @newdisc/api exec tsc --noEmit    # typecheck (sempre antes de commit)
pnpm --filter @newdisc/api exec prisma generate # após mexer no schema.prisma
pnpm db:up               # sobe o Postgres do docker-compose (só 127.0.0.1)
pnpm db:migrate          # cria/aplica migration a partir do schema (dev)
pnpm db:deploy           # aplica as migrations existentes (prod/CI)
```

Não há suite de testes automatizados no MVP. **Verificação = typecheck limpo nos
três pacotes** (`api`, `web`, `shared`) + validação manual ponta a ponta quando o
servidor puder rodar.

## Convenções

- **Idioma:** todo código, comentário, mensagem de commit e texto de UI em
  **português (pt-BR)**. Comentários explicam o *porquê* de decisões não óbvias,
  não o *o quê*.
- **Commits:** conventional commits — `tipo(escopo): descrição` no imperativo,
  minúscula, sem ponto final. Um commit = uma mudança coerente. Nunca commitar na
  branch default; criar `feat/…`, `fix/…`, etc. antes.
- **Contrato compartilhado primeiro:** payload novo ou campo novo entram em
  `packages/shared/src/index.ts` **antes** de tocar api/web. Os dois lados
  importam de `@newdisc/shared` — nunca redeclare um tipo localmente.

## Arquitetura — o que você precisa ter na cabeça

### Mensagens são criadas por WebSocket, não REST
O envio de mensagem (e reação, edição, remoção, DM) passa pelo **gateway**
(`modules/gateway/chat.gateway.ts`), disparado pelos eventos de `WS_EVENTS`. O
REST de mensagens serve só **leitura** (histórico paginado por cursor, thread,
busca). Ao adicionar um fluxo de escrita de mensagem, o caminho é: evento em
`WS_EVENTS` → handler no gateway → método no `MessagesService` → `emit` de volta
para a sala do canal (`channel:<id>`) ou do usuário (`user:<id>`).

### Autorização é central, nunca no handler
Toda checagem de acesso a canal vive em `GuildsService.assertCanViewChannel` /
`assertCanPostChannel` (cobre associação ao servidor, canal privado por allowlist
`ChannelMember`, e somente-leitura). Handlers e services **chamam** esses
asserts; não reimplementam a regra. Ao criar rota/handler que toca um canal,
comece pelo assert.

### Padrão de módulo NestJS
Cada domínio é um módulo com `*.module.ts`, `*.service.ts` e (quando tem REST)
`*.controller.ts`. Guard de auth: `JwtGuard` + decorator `@CurrentUser()`
(`common/`). Um service que precisa de outro importa o **módulo** que o exporta
(ex.: `MessagesModule` importa `GuildsModule` e `StorageModule`).

### DTO na borda, entidade Prisma dentro
Services devolvem os tipos de `@newdisc/shared` (ex.: `Message`, `Attachment`),
não linhas do Prisma. A conversão fica em métodos `toDTO`/`toAttachmentDTO`. URL
de anexo é derivada na hora pelo `StorageService.publicUrl` — o banco guarda só a
`key` do objeto.

## Camada de dados — Postgres, um schema só

- **Postgres em dev e em prod**, mesmo `apps/api/prisma/schema.prisma`. Em dev
  ele vem do `docker-compose` (`pnpm db:up`). Não existe mais variante SQLite
  nem `schema.postgres.prisma` — se você achar referência a isso, é doc velha.
- **Migrations são o fluxo**: mudou o schema → `pnpm db:migrate` gera a migration
  em `prisma/migrations/` e a aplica. **Não use `prisma db push`** (ele diverge o
  banco das migrations sem deixar rastro).
- **Enums são do banco** (`UserStatus`, `ChannelType`, `MemberRole`). O Prisma
  gera exatamente os mesmos literais das union types de `@newdisc/shared`, então
  o DTO é atribuição direta — **não precisa de `as`**. A equivalência entre os
  dois lados fica travada em tempo de compilação em `common/enums.ts`; adicionar
  um valor só de um lado quebra o typecheck lá, e em nenhum outro lugar.
- **Cuidado com semântica de Postgres em query**: `contains` é sensível a caixa
  (busca de mensagem usa `mode: "insensitive"`), ordenação depende do collation
  e `NULL` ordena por último em `ASC`. O que "funcionava" em SQLite não é prova.

## Storage / anexos (R2)

- `StorageService.isConfigured()` é `false` sem as credenciais `R2_*`. Nesse caso
  o upload responde `503` de forma clara (espelha o tratamento do LiveKit) — o
  resto do app funciona normalmente. **Anexos são opcionais no dev.**
- Fluxo: `POST /uploads` valida por **magic-bytes** (`uploads/media.ts`, sem
  dependência externa), envia ao R2 e cria a linha `Attachment` solta
  (`messageId: null`). O envio da mensagem vincula por id, e **só** anexos do
  próprio autor ainda não vinculados — nunca confie no content-type declarado
  pelo cliente (evita servir HTML/SVG como executável).
- Sem base pública de bucket, a leitura sai por proxy da API
  (`GET /uploads/file/:id`) com `X-Content-Type-Options: nosniff`.

## O que NÃO presumir

- Que dá para evoluir o schema com `db push` — toda mudança vira migration.
- Que R2/LiveKit estão configurados — dependem de credenciais em `.env`.
- Que mensagens vão por REST — vão por WS.
- Que dá para redeclarar um tipo de payload localmente — ele mora em `shared`.
