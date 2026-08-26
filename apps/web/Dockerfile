# syntax=docker/dockerfile:1
#
# Imagem da web (Next.js). Multi-stage, saída `standalone`.
#
#   docker build -f apps/web/Dockerfile -t newdisc-web \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.exemplo.com .
#
# O contexto de build é a **raiz do monorepo** (o pnpm precisa do lockfile e
# dos package.json de todos os workspaces para resolver `workspace:*`).

# ── Base ────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

# ── Dependências ────────────────────────────────────────────────────────────
# Manifestos antes do código: a camada de instalação sobrevive a qualquer
# mudança que não mexa no lockfile.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY apps/desktop/package.json apps/desktop/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @newdisc/web... --filter @newdisc/shared...

# ── Build ───────────────────────────────────────────────────────────────────
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web

# `NEXT_PUBLIC_*` é **embutida no bundle** durante o build, não lida em runtime:
# trocar de ambiente (dev → prod) exige rebuild da imagem, não só outra env no
# contêiner. Por isso entram como ARG, com o padrão local.
ARG NEXT_PUBLIC_API_URL="http://localhost:3333"
ARG NEXT_PUBLIC_WS_URL="http://localhost:3333"
ARG NEXT_PUBLIC_LIVEKIT_URL="ws://localhost:7880"
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_LIVEKIT_URL=$NEXT_PUBLIC_LIVEKIT_URL

# Liga o `output: "standalone"` do next.config (ver o comentário de lá: o modo
# padrão continua valendo no `next dev`/`next start`, e o export do Tauri vence
# quando estiver ligado).
ENV NEXT_OUTPUT=standalone
ENV NODE_ENV=production
# O shared é consumido pelo dist/ — precisa vir antes do build da web.
RUN pnpm --filter @newdisc/shared build \
 && pnpm --filter @newdisc/web build

# ── Runtime ─────────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
# server.js do standalone só escuta onde estas duas mandam; preso ao loopback,
# o mapeamento de porta do Docker não alcançaria o processo.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# O standalone já traz o server.js e só as dependências rastreadas — com o
# tracing na raiz do monorepo, o layout de dentro espelha o do repositório
# (apps/web/server.js, packages/shared/dist, node_modules).
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
# O `.next/static` fica de fora do standalone de propósito (é servido por CDN
# em deploy grande); aqui vai junto para o server.js conseguir servir sozinho.
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
# Não existe `apps/web/public` neste projeto — se um dia existir, copie aqui.

USER node
EXPOSE 3000

# A web não tem rota de health própria; a raiz basta para provar que o server
# do Next está atendendo.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/web/server.js"]
