# syntax=docker/dockerfile:1
#
# Imagem dos bots oficiais do Streamz (`apps/bots`). Uma imagem só para todos
# os bots; **qual** bot o container roda é a variável `BOTS`.
#
#   docker build -f apps/bots/Dockerfile -t streamz-bots .
#   docker run --rm -e BOTS=musica -e STREAMZ_BOT_TOKEN=… streamz-bots
#
# O contexto de build é a **raiz do monorepo** (o pnpm precisa do lockfile e
# dos package.json de todos os workspaces para resolver `workspace:*`).

# ── Base ────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# ── Dependências ────────────────────────────────────────────────────────────
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/desktop/package.json apps/desktop/
COPY apps/bots/package.json apps/bots/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @streamz/bots... --filter @streamz/shared...

# ── Dependências de produção ────────────────────────────────────────────────
# Um segundo `install`, agora sem as devDependencies. Vale a pena: as do
# **root** (playwright-core, embedded-postgres, turbo, typescript) são centenas
# de megabytes que nada aqui executa. Ao contrário da API, este pacote não tem
# um client do Prisma gerado dentro do store, então podar é seguro.
FROM base AS prod-deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/desktop/package.json apps/desktop/
COPY apps/bots/package.json apps/bots/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter @streamz/bots... --filter @streamz/shared...

# ── Build ───────────────────────────────────────────────────────────────────
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/bots apps/bots
# O shared é consumido pelo dist/ — precisa vir antes do tsc dos bots.
RUN pnpm --filter @streamz/shared build \
 && pnpm --filter @streamz/bots build

# ── Runtime ─────────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
ENV LOG_FORMATO=json
# O diretório de tokens dentro do container. O compose monta `./.bots` aqui
# como somente leitura; nada é escrito em produção pela imagem.
ENV BOTS_DIR=/app/.bots

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/shared/package.json packages/shared/
# Sem esta linha a imagem sobe e morre em "Cannot find module 'zod'": no pnpm o
# node_modules da raiz só linka as deps diretas da RAIZ, e zod é dependência do
# shared. É a mesma pegadinha documentada no Dockerfile da API.
COPY --from=prod-deps /app/packages/shared/node_modules packages/shared/node_modules
COPY --from=prod-deps /app/apps/bots/node_modules apps/bots/node_modules
COPY --from=build /app/apps/bots/dist apps/bots/dist
COPY --from=build /app/apps/bots/package.json apps/bots/
# Os ícones: o `provisionar` os lê daqui quando roda dentro da imagem.
COPY --from=build /app/apps/bots/assets apps/bots/assets

USER node
WORKDIR /app/apps/bots

# Sem HEALTHCHECK de propósito: um bot não abre porta nenhuma, e a única sonda
# honesta seria perguntar à API se a sessão do gateway está viva — o que
# dependeria de credencial dentro do healthcheck. O sinal de saúde é o log
# ("conectado") e o `restart: unless-stopped`.
CMD ["node", "dist/index.js"]
