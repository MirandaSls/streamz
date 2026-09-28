# Streamz

Clone do Discord: chat em servidores e canais em tempo real, voz/vídeo/tela e
app desktop (Windows, macOS, Linux e Android). Monorepo com **NestJS** no
backend, **Next.js** no cliente web e **Tauri 2** para as cascas nativas.

Desde a [ADR-0009](docs/adr/0009-paridade-total-com-o-discord-exceto-a-marca.md)
a meta declarada é paridade total com o Discord — leiaute, densidade, ícones,
fontes, emojis e comandos — exceto o ícone do Streamz e a cor de destaque
(verde). A instância de produção roda em `streamz.chat` (ver `PENDENCIAS.md`).

## Stack

| Camada  | Tecnologia |
|---------|------------|
| Cliente | Next.js 14 (App Router), React 18, Tailwind, Zustand, Socket.IO client |
| Backend | NestJS 10 (REST + WebSocket via Socket.IO), Prisma, zod |
| Banco   | PostgreSQL (dev e prod, um schema só) |
| Storage | Cloudflare R2 (cliente S3), opcional — anexos |
| Mídia   | LiveKit self-hosted (ADR-0005); LiveKit Cloud continua suportado via `.env` |
| Bots    | discord.js + Lavalink (música), runtime próprio em `apps/bots` |
| Desktop | Tauri 2 — Windows, macOS, Linux e Android a partir do mesmo crate |
| Monorepo| pnpm workspaces + Turborepo |

## Estrutura do monorepo

```
apps/
  api/         # NestJS — módulos por domínio (auth, guilds, channels, messages,
               #   gateway, dms, voice, storage, uploads, admin, updates, ...)
  web/         # Next.js — vitrine (app/page.tsx) e app de chat (app/app/page.tsx)
  desktop/     # Tauri 2 — embrulha a web num instalador; gera também o Android
  bots/        # bots oficiais: música (Lavalink), boas-vindas, moderação,
               #   níveis e cargos por reação
  ponte-voz/   # serviço em Go que liga bots (voice gateway compatível com o
               #   Discord) ao LiveKit por UDP/RTP
packages/
  shared/      # @streamz/shared — tipos + schemas zod + WS_EVENTS; contrato
               #   único entre api e web (consumido pelo dist/ compilado)
docs/
  adr/         # decisões arquiteturais datadas, com o porquê e o que foi descartado
  ...          # demais documentos de processo, produto e referência (ver abaixo)
scripts/       # build/publicação de api, web e desktop; passeios e2e; e o
               #   ferramental de paridade visual em scripts/paridade/
```

`scripts/paridade/` é a bancada usada para comparar telas do Streamz lado a
lado com o Discord (semeia um servidor de referência, fotografa as telas e
monta a folha comparativa) — ver `scripts/paridade/README.md`.

Não há CI no GitHub além de `.github/workflows/ios.yml` (plano B manual, nunca
executado) — ver a seção "Deploy e publicação" abaixo.

## Rodando em dev

Pré-requisitos: **Node >= 20** (`.nvmrc` pede 20), **pnpm 9** (`packageManager`
do `package.json` raiz), **Docker** (ou a alternativa sem Docker abaixo) e,
só para o app desktop, **Rust**.

```bash
# 1. variáveis de ambiente
cp .env.example .env

# 2. banco — escolha um dos dois:
pnpm db:up                 # Postgres via docker-compose (127.0.0.1 só)
pnpm db:embedded           # alternativa sem Docker: Postgres embutido em ./.pgdata

# 3. dependências
pnpm install

# 4. schema do banco
pnpm db:migrate            # prisma migrate dev

# 5. subir api + web juntos
pnpm dev
```

- Web: `http://localhost:3000`
- API: `http://localhost:3333/api` (liveness em `/api/health`, readiness em
  `/api/ready`)

### Dependências opcionais

R2 (anexos), LiveKit (voz/vídeo/tela), SMTP (e-mail transacional), Giphy (busca
de GIF) e Redis (múltiplas instâncias) são opcionais por decisão de
arquitetura: sem a credencial, a rota correspondente responde `503` com o
motivo e o resto do app segue funcionando normalmente. Cada variável está
documentada no próprio `.env.example`, com o que ela liga e o que quebra sem
ela.

Para voz em dev sem depender de credencial de nuvem, é possível subir o
LiveKit self-hosted localmente:

```bash
cp livekit.example.yaml livekit.yaml   # gere um secret com openssl rand -hex 32
pnpm livekit:up                        # docker compose --profile livekit up -d livekit
```

Detalhes de topologia, portas e checklist de produção: `docs/selfhost-livekit.md`.

## Comandos úteis

```bash
pnpm --filter @streamz/shared build             # OBRIGATÓRIO após mexer em packages/shared
                                                 #   (api/web consomem o dist/ compilado, não o src/)
pnpm --filter @streamz/api exec tsc --noEmit    # typecheck da api
pnpm --filter @streamz/web exec tsc --noEmit    # typecheck da web
pnpm --filter @streamz/shared exec tsc --noEmit # typecheck do shared
pnpm --filter @streamz/api test                 # testes unitários (vitest) da api
pnpm --filter @streamz/web test                 # testes unitários (vitest) da web
pnpm --filter @streamz/api exec prisma generate # após mexer em schema.prisma
pnpm db:deploy                                  # aplica migrations existentes (prod/CI)
pnpm db:studio                                  # abre o Prisma Studio
node scripts/e2e-visual.mjs --out ./e2e-shots   # passeio com screenshots (API :3333 e web :3000 no ar)
```

Testes unitários cobrem só lógica pura. A verificação completa é typecheck
limpo nos três pacotes (`api`, `web`, `shared`) mais testes passando mais
validação manual ponta a ponta quando o servidor puder rodar — ver
`CLAUDE.md`.

## App desktop

```bash
pnpm --filter @streamz/desktop dev     # janela nativa carregando http://localhost:3000
pnpm --filter @streamz/desktop build   # instalador da plataforma do host (precisa de Rust/cargo)
```

O desktop empacota a web como HTML estático (`build.frontendDist` aponta para
`web/out`) e sai em três plataformas: Windows (`.exe` NSIS e `.msi`, inclusive
por cross-compile a partir do Linux), macOS (`.dmg` universal, Intel e Apple
Silicon) e Linux (`.AppImage` e `.deb`). O mesmo crate Tauri também gera o
Android (`apps/desktop/src-tauri/gen/android`). Segundo `PENDENCIAS.md`, os
builds de macOS e Linux existem mas ainda **não foram publicados nem testados
numa máquina real** — hoje o Windows é a plataforma publicada, com auto-update
ativo (o `.exe` ainda não tem assinatura de código, e o SmartScreen avisa quem
baixa — ver `PENDENCIAS.md`). Um caminho de
iOS existe como configuração (`codemagic.yaml`, `.github/workflows/ios.yml`)
mas nunca foi compilado; detalhes em `docs/APPS-MOBILE.md`.

Recursos nativos: bandeja do sistema (fechar minimiza em vez de encerrar),
notificações nativas via `tauri-plugin-notification`, e uma CSP explícita com
`withGlobalTauri` desligado (os módulos `@tauri-apps/*` entram por `import()`
dinâmico). Detalhes de cada plataforma, assinatura e capabilities:
`apps/desktop/README.md`.

### Auto-update

O `tauri-plugin-updater` está ativo nas três plataformas. O app consulta
`GET /api/updates/{target}/{arch}/{versão}` ao abrir; a API devolve `204`
quando não há nada, ou um manifesto assinado por uma chave minisign embutida
no app — a assinatura, não autenticação, é o que protege o canal. O usuário só
baixa e instala mediante clique no cartão de aviso. Passo a passo para gerar
chaves e publicar uma versão nova: `apps/desktop/README.md`, seção
"Auto-update".

## Deploy e publicação

**Não existe mais CI no GitHub.** Os workflows (`ci.yml`, `deploy.yml`,
`desktop.yml`) foram removidos em `a534a08d` (2026-09-03) depois que a
cobrança da conta travou os runners; o único que sobrou é
`.github/workflows/ios.yml`, disparado manualmente e nunca executado com
sucesso. Não há checagem automática em PR.

**Mergear no `main` não publica nada.** A [ADR-0007](docs/adr/0007-cd-por-ghcr-e-ssh-travado.md)
descreve o deploy automático original, mas sua seção de revogação (2026-09-03)
confirma que a automação não existe mais — o que continua valendo é a ideia de
imagem versionada e rastreável, só que acionada à mão. Publicar é rodar, neste
servidor:

```bash
scripts/publicar-local.sh                 # verifica, builda e publica origin/main
scripts/publicar-local.sh <commit-ish>    # publica outra referência (voltar versão)
scripts/publicar-local.sh --sem-verificar # pula o passo de typecheck/testes
```

O script builda `ghcr.io/mirandasls/streamz-{api,web}:sha-<7 do commit>` e
troca os contêineres; voltar versão é o mesmo script com a referência antiga,
reaproveitando as imagens já no disco. `NEXT_PUBLIC_*` é embutida no build da
imagem web — mudar o `.env` do servidor depois não tem efeito sobre ela. Cada
publicação usa uma worktree destacada; nunca dê `checkout` no `/opt/stack/streamz`
principal, cujo `HEAD` descreve o compose que está no ar.

Observação: `PENDENCIAS.md` e o corpo original da ADR-0007 ainda descrevem o CD
como automático por merge — isso está desatualizado; o comportamento real é o
descrito acima, conforme a revogação parcial da própria ADR e o `CLAUDE.md`.

## Docs e convenções

- [`CLAUDE.md`](CLAUDE.md) — guia de arquitetura para quem mexe no código:
  onde vive cada regra (autorização, permissões, notificação, rate limit) e por quê.
- [`PENDENCIAS.md`](PENDENCIAS.md) — o que ainda não está pronto.
- [`docs/adr/README.md`](docs/adr/README.md) — índice das decisões arquiteturais.
- [`design.md`](design.md) — convenções visuais.
- [`produto.md`](produto.md) — escopo e decisões de produto.
- [`docs/PROCESSO-DE-DESENVOLVIMENTO.md`](docs/PROCESSO-DE-DESENVOLVIMENTO.md) — processo de build, release e publicação por plataforma.
- [`.env.example`](.env.example) — cada variável de ambiente documentada, obrigatória ou opcional.

Convenções em três linhas: todo código, comentário, commit e texto de UI em
português; commits seguem conventional commits e nunca vão direto para o
`main` (branch `feat/…`, `fix/…` antes); payload ou campo novo de WebSocket
entra primeiro em `packages/shared`, api e web importam de lá.
