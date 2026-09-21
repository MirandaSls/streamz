# Streamz — guia do projeto

Clone do Discord (MVP): chat em servidores/canais em tempo real, voz/vídeo/tela e
app desktop. Referência de arquitetura e produto: **stoatchat** (fork do Revolt) —
mensagens referenciam anexos por id, storage S3-compatível, presença via WS.

Este arquivo é o mínimo que você precisa saber antes de mexer no código. O que
ainda não está pronto vive em `PENDENCIAS.md`, cada variável de ambiente no
`.env.example`; convenções visuais em `design.md`.

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
  api/       # NestJS — módulos por domínio (auth, users, guilds, channels,
             #   messages, read-state, embeds, gateway, dms, voice, storage,
             #   uploads, maintenance, admin)
  web/       # Next.js — raiz vitrine/download no navegador (app/page.tsx), login/registro
             #   + app de chat de 3 colunas (app/app/page.tsx)
  desktop/   # Tauri 2 — embrulha a web num instalador
packages/
  shared/    # @streamz/shared — tipos + schemas zod + WS_EVENTS, fonte única de
             #   verdade do contrato api ↔ web. Toda mudança de payload passa aqui.
docs/adr/    # decisões arquiteturais datadas (o *porquê*; ver docs/adr/README.md)
```

## Comandos

```bash
pnpm dev                 # api + web juntos
pnpm --filter @streamz/api dev
pnpm --filter @streamz/shared build             # OBRIGATÓRIO após mexer em packages/shared (ver abaixo)
pnpm --filter @streamz/api exec tsc --noEmit    # typecheck (sempre antes de commit)
pnpm --filter @streamz/api exec prisma generate # após mexer no schema.prisma
pnpm db:up               # sobe o Postgres do docker-compose (só 127.0.0.1)
pnpm db:embedded         # alternativa sem Docker: Postgres embutido em ./.pgdata (UTF-8)
node scripts/e2e-visual.mjs --out ./e2e-shots   # passeio com screenshots (API+web no ar)
pnpm --filter @streamz/api build && pnpm --filter @streamz/api smoke:conta  # conta/2FA ponta a ponta (só Postgres)
pnpm db:migrate          # cria/aplica migration a partir do schema (dev)
pnpm db:deploy           # aplica as migrations existentes (prod/CI)

docker compose up -d --build api web            # sobe api+web em contêiner (usa o .env)
docker compose --profile redis up -d redis      # Redis opcional (multi-instância)
docker build -f apps/api/Dockerfile -t streamz-api .   # contexto = raiz do monorepo
docker build -f apps/web/Dockerfile -t streamz-web .   # NEXT_PUBLIC_* via --build-arg
```

**Não existe mais CI no GitHub.** Os workflows foram removidos em `a534a08d`
(2026-09-03): a cobrança da conta travou os runners, e `.github/workflows/` só
tem `ios.yml`. Quem roda essa sequência — `prisma generate` → build do `shared`
→ typecheck dos três pacotes → testes → `next build` — é
`scripts/publicar-local.sh`, **neste servidor**. Rode-a antes de abrir PR: não
há mais nada verde ou vermelho aparecendo no PR para te avisar.

**Mergear no `main` não publica nada.** A ADR-0007 descreve o deploy
automático por `deploy.yml`, e ele não existe mais (ver acima): publicar é rodar
`scripts/publicar-local.sh` à mão, que verifica, builda
`ghcr.io/mirandasls/streamz-{api,web}:sha-<7 do commit>` e troca os contêineres.
Voltar versão é o mesmo script com a referência antiga — as imagens já no disco
são reaproveitadas. Duas consequências para quem mexe no código: `NEXT_PUBLIC_*`
é embutida no build da imagem (mudar o `.env` do servidor não tem efeito sobre
ela), e cada publicação usa uma worktree destacada — **nunca** dê `checkout` em
`/opt/stack/streamz`, cujo HEAD descreve o compose que está no ar.

Testes unitários (vitest) cobrem só lógica pura (`pnpm --filter @streamz/api test`,
`pnpm --filter @streamz/web test`). **Verificação = typecheck limpo nos três
pacotes** (`api`, `web`, `shared`) + testes passando + validação manual ponta a
ponta quando o servidor puder rodar.

> **`@streamz/shared` é consumido pelo `dist/` compilado**, não pelo `src/`. Depois
> de qualquer mudança em `packages/shared`, rode `pnpm --filter @streamz/shared
> build` **antes** do typecheck da api/web — sem isso o `tsc` deles enxerga o
> contrato antigo e mente (passa com tipo que não existe mais, ou falha com
> "no exported member" para algo que você acabou de exportar).

## Convenções

- **Idioma:** todo código, comentário, mensagem de commit e texto de UI em
  **português (pt-BR)**. Comentários explicam o *porquê* de decisões não óbvias,
  não o *o quê*.
- **Commits:** conventional commits — `tipo(escopo): descrição` no imperativo,
  minúscula, sem ponto final. Um commit = uma mudança coerente. Nunca commitar na
  branch default; criar `feat/…`, `fix/…`, etc. antes.
- **Contrato compartilhado primeiro:** payload novo ou campo novo entram em
  `packages/shared/src/index.ts` **antes** de tocar api/web. Os dois lados
  importam de `@streamz/shared` — nunca redeclare um tipo localmente.

## Arquitetura — o que você precisa ter na cabeça

### Payload de WebSocket é validado no contrato, nunca no handler
Todo comando cliente→servidor tem schema zod em `packages/shared` (ex.:
`messageCreateSchema`) e passa pelo helper único `parseWsPayload`. O gateway
valida antes de chamar o service e responde `WS_EVENTS.ERROR` com a razão —
**nunca trunca nem ignora em silêncio**. Limites de tamanho (`MAX_MESSAGE_LENGTH`,
`MAX_ATTACHMENTS_PER_MESSAGE`) moram no contrato, não no handler. Comando novo =
schema novo em `shared` antes do handler.

### Mensagens são criadas por WebSocket, não REST
O envio de mensagem (e reação, edição, remoção, DM) passa pelo **gateway**
(`modules/gateway/chat.gateway.ts`), disparado pelos eventos de `WS_EVENTS`. O
REST de mensagens serve **leitura** (histórico paginado por cursor, thread,
janela `around/:messageId`, busca no canal e no servidor, caixa de entrada em
`/me/mentions` e `/me/unread`) e **estrutura** (fixar em `/channels/:id/pins`,
threads nomeadas em `/channels/:id/threads`), que avisa a sala pelo
`RealtimeService`. Ao adicionar um fluxo de escrita de mensagem, o caminho é:
evento em `WS_EVENTS` → handler no gateway → `MessagesService` → `emit` de volta
para a sala do canal (`channel:<id>`) ou do usuário (`user:<id>`).

### Autorização é central, nunca no handler
Toda checagem de acesso a canal vive em `GuildsService.assertCanViewChannel` /
`assertCanPostChannel` (cobre associação ao servidor, canal privado por allowlist
`ChannelMember`, somente-leitura **e** conversa direta, onde acesso = ser
participante). O retorno é a união discriminada `ChannelAccess` (`tipo: "guild" |
"dm"`): quem precisa de papel é obrigado a tratar o ramo DM. Handlers e services
**chamam** esses asserts; não reimplementam a regra. Ao criar rota/handler que
toca um canal, comece pelo assert.

### Permissão é bitfield; papel é só hierarquia (ADR-0002)
O que alguém *pode fazer* sai de `computePermissions(member, roles, overrides)`
(`@streamz/shared`): união dos cargos a partir do `@everyone`, depois os
`ChannelOverride` na ordem `deny` → `allow` (`@everyone` → cargos → usuário);
dono e `ADMINISTRATOR` ignoram tudo. Os bits de `Permission` são **estáveis para
sempre** — o valor fica gravado em cada `Role` e em cada override; permissão nova
entra no próximo bit livre, nenhuma é renumerada.

`MemberRole` (OWNER/ADMIN/MEMBER) **não** decide capacidade: decide *sobre quem*
se age. `assertCanModerate(actorId, guildId, permission)` exige o bit; quem
precisa do alvo usa `assertCanActOn`, que soma o bit à hierarquia. Ao escrever
uma rota de gestão, a pergunta é "qual bit?", não "qual papel?". Do lado do
cliente a mesma conta está em `stores/permissions.ts` (`useCan`,
`useCanPostActiveChannel`), e a UI **esconde** o que a API recusaria.

"Privado" e "somente-leitura" no `Channel` são espelhos de um `deny` no
`@everyone` do canal, mantidos porque a UI fala nesses termos —
`applyChannelFlags` é quem sincroniza os dois lados.

### Voz e chamadas vivem fora do banco
`modules/voice` guarda o estado de quem está em cada sala atrás da interface
`VoiceStateStore` (`voice-state.store.ts`) e o transmite por `voice.state`;
chamada em conversa direta é o mesmo caminho, com toque de 30 s em
`calls.service.ts`. Não há tabela de "sessão de voz": o estado é **efêmero** de
propósito — sobreviver a um restart seria mentira, porque o cliente caiu junto.
A implementação é escolhida no boot: `RedisVoiceStateStore` com `REDIS_URL`,
`MemoryVoiceStateStore` sem ela. **Só o `VoiceStateStore` é compartilhado** —
não confunda isso com "voz funciona com várias instâncias", porque não funciona:
o toque de 30 s e a solidão vivem em `setTimeout` e num `Map` do processo
(`calls.service.ts`), a carência de reconexão idem (`chat.gateway.ts`), e
`expulsarOutrasConexoesDaVoz` escreve em `s.data` de sockets vindos de
`fetchSockets()` — num socket de outra instância isso é uma cópia, e a marca
nunca chega ao socket real. Com uma instância (o caso hoje: `REDIS_URL` vazio,
nenhum compose com réplica) nada disso aparece; o que aparece é que **todo
deploy zera o estado de voz**. Single-process também o token bucket do WS.

### Administrador da instância é outro eixo, e não vira permissão (ADR-0008)
`computePermissions` responde "o que este membro pode fazer **neste servidor**".
Existe uma segunda pergunta, que não se converte nessa: "quem manda na
instância". A resposta sai de `PLATFORM_ADMIN_EMAILS` no ambiente da API — não
do banco —, é conferida pelo `PlatformAdminGuard` e alimenta o `modules/admin`:
todas as contas, todas as chamadas abertas e o histórico de qualquer canal ou
conversa, **sem entrar em servidor nenhum**.

Duas coisas a ter na cabeça ao mexer nisso. Primeira: o módulo é **só leitura**
— banir, apagar e expulsar continuam sendo moderação de servidor, com hierarquia;
um caminho de escrita aqui furaria as regras que o resto do código mantém.
Segunda: `MessagesService.historicoSemChecagemDeAcesso` é a **única** leitura de
mensagem que não passa por `assertCanViewChannel`. A autorização não sumiu,
mudou de camada (o guard, no controller). O nome é comprido para doer ao ser
digitado noutro lugar — se você precisou dele fora de `modules/admin`, a resposta
é outra.

### Notificação é preferência por escopo, não flag no canal
`NotificationSetting` guarda nível (`ALL`/`MENTIONS`/`NONE`) e silêncio por
**escopo canônico** — a string `"global"`, `"guild:<id>"` ou `"channel:<id>"`,
não um par de colunas nuláveis: no Postgres dois `NULL` são distintos e um
`@@unique` sobre colunas nuláveis deixaria gravar duas linhas do mesmo escopo.
O mais específico vence, e `muted` é independente de `level`. Quem decide se algo
notifica é `shouldNotifyMessage` no contrato — não replique a regra no cliente.

### Salas do gateway e "não lido"
No connect o socket entra em **todas** as salas que o usuário pode ver
(`channel:<id>` de cada canal visível de cada servidor + conversas) e em
`guild:<id>` (eventos de estrutura: canal criado/renomeado/apagado, papel,
membro entrou/saiu). Por isso `message.new` chega para qualquer canal e o
cliente mantém não-lido/menções ao vivo (`ReadState` no banco, `POST
/channels/:id/read`). Quem ganha/perde acesso entra/sai da sala pelo
`RealtimeService` — nunca dependa do `channel.join` do cliente para segurança.
Com `REDIS_URL`, broadcast/presença/throttler são compartilhados entre instâncias.

### DM é canal (ADR-0001)
Conversa direta e grupo são `Channel` com `guildId` null e `type` DM/GROUP;
participantes são `ChannelMember`; mensagens são `Message`. Não existe modelo,
evento nem rota "de DM" para mensagem — `message.create`/`message.new` e
`/channels/:id/messages` servem os dois casos. `DMsService` só abre/cria/lista/
sai. **Toda query de servidor parte de um `guildId` concreto** — `guildId` nullable
é a armadilha permanente dessa decisão.

Perder o acesso também precisa **cortar o tempo real**: kick, ban e saída da
allowlist chamam `RealtimeService.leaveChannelRooms`, que tira os sockets do
usuário das salas `channel:<id>`. Sem isso o ex-membro continuaria recebendo
mensagens até recarregar a página.

### Padrão de módulo NestJS
Cada domínio é um módulo com `*.module.ts`, `*.service.ts` e (quando tem REST)
`*.controller.ts`. Guard de auth: `JwtGuard` + decorator `@CurrentUser()`
(`common/`). Um service que precisa de outro importa o **módulo** que o exporta
(ex.: `MessagesModule` importa `GuildsModule` e `StorageModule`).

O `JwtGuard` não valida só a assinatura: consulta o `AccountStatusService`
(cache de 60 s por processo, exportado pelo `AuthModule`) e recusa conta
desativada/excluída **antes** dos 15 minutos do access token — quem desativa,
exclui ou reativa chama `invalidar()` para o efeito ser imediato. O gateway faz a
mesma checagem no connect.

Dependência opcional segue o padrão do R2/LiveKit: `MailService.isConfigured()` é
`false` sem `SMTP_URL` e o provedor vira `console` (imprime o link no log, que é
como o fluxo de e-mail é testado em dev). `exigirEntrega()` só derruba a rota com
`503` em produção — em dev, 503 tornaria o recurso impossível de exercitar.

As rotas de conta e segurança validam o corpo com o **schema zod de
`packages/shared`** (via `common/zod.pipe.ts`), não com DTO de `class-validator`:
o contrato dessas rotas já existe em zod e é o mesmo que a web usa para recusar
antes do round-trip. O resto da API continua com `class-validator`.

### DTO na borda, entidade Prisma dentro
Services devolvem os tipos de `@streamz/shared` (ex.: `Message`, `Attachment`,
`Guild`, `Channel`), não linhas do Prisma. A conversão fica em métodos
`toDTO`/`toAttachmentDTO` ou nos helpers de `common/dto.ts`, que é também onde as
colunas que o SQLite guarda como `String` voltam às union types. A URL de anexo é
derivada na hora pelo `StorageService.attachmentUrl` — o banco guarda só a `key`
do objeto — e por isso os `toDTO` que montam anexo são assíncronos.

### Rate limiting em duas camadas
HTTP: `@nestjs/throttler` com guard global e teto padrão folgado; os tetos
apertados ficam em `common/throttle.ts` (login, registro, upload, convites) —
adicione ali, não inline no controller. WebSocket: token bucket por socket em
`gateway/rate-limit.ts`, **single-process** (o estado vive no socket; com mais de
uma instância precisaria de store compartilhado).

### Ambiente é validado no boot
`common/env.ts` roda no `ConfigModule` e derruba o processo se faltar
`DATABASE_URL`, `JWT_SECRET` ou `JWT_REFRESH_SECRET` (que precisam ser
diferentes). Variável **opcional** (R2, LiveKit) não entra ali: fica com o
`isConfigured()` do respectivo service, que responde `503`.

## Camada de dados — Postgres, um schema só

- **Postgres em dev e em prod**, mesmo `apps/api/prisma/schema.prisma`. Em dev
  ele vem do `docker-compose` (`pnpm db:up`). Não existe mais variante SQLite
  nem `schema.postgres.prisma` — se você achar referência a isso, é doc velha.
- **Migrations são o fluxo**: mudou o schema → `pnpm db:migrate` gera a migration
  em `prisma/migrations/` e a aplica. **Não use `prisma db push`** (ele diverge o
  banco das migrations sem deixar rastro).
- **Enums são do banco** (`UserStatus`, `ChannelType`, `MemberRole`). O Prisma
  gera exatamente os mesmos literais das union types de `@streamz/shared`, então
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
- **Leitura de anexo nunca é pública.** `StorageService.attachmentUrl` devolve
  uma **URL assinada do R2** que expira (`ATTACHMENT_URL_TTL_SECONDS`); por isso
  os `toDTO` que montam anexo são assíncronos. `R2_PUBLIC_BASE_URL` continua
  valendo, mas é opt-in explícito de bucket público.
- O proxy da API (`GET /uploads/file/:id`) é o **fallback autenticado**: aceita o
  token curto `?t=` (emitido só a quem já passou pela autorização da mensagem) ou
  `Authorization: Bearer`, que reavalia a permissão pelo canal da mensagem —
  anexo ainda solto só o uploader lê. Mantém `X-Content-Type-Options: nosniff` e
  `Cache-Control: private`.
- Anexo que nunca virou mensagem (e refresh token velho) é apagado pela faxina
  diária do `modules/maintenance` — o `@nestjs/schedule` roda **por processo**,
  então com mais de uma instância da API o job repete.

## O que NÃO presumir

- Que dá para evoluir o schema com `db push` — toda mudança vira migration.
- Que R2/LiveKit estão configurados — dependem de credenciais em `.env`.
- Que mensagens vão por REST — vão por WS.
- Que "admin" quer dizer uma coisa só: `MemberRole.ADMIN` é papel de servidor;
  administrador da **instância** vem do ambiente e é outro eixo (ADR-0008).
- Que dá para redeclarar um tipo de payload localmente — ele mora em `shared`.
