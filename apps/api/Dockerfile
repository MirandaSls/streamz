# syntax=docker/dockerfile:1
#
# Imagem da API (NestJS + Prisma). Multi-stage: as dependências e o build ficam
# num estágio descartável e a imagem final leva só o que roda.
#
#   docker build -f apps/api/Dockerfile -t streamz-api .
#
# O contexto de build é a **raiz do monorepo** (o pnpm precisa do lockfile e dos
# package.json de todos os workspaces para resolver `workspace:*`).

# ── Base ────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
# openssl: o engine do Prisma linka contra ele no Alpine (libssl3).
RUN apk add --no-cache openssl
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# ── Dependências ────────────────────────────────────────────────────────────
# Copiar só os manifestos antes do código faz esta camada ser reaproveitada
# enquanto o lockfile não muda — é o que separa um build de 2min de um de 20s.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/desktop/package.json apps/desktop/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @streamz/api... --filter @streamz/shared...

# ── Build ───────────────────────────────────────────────────────────────────
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
# O shared é consumido pelo dist/ — precisa vir antes do tsc da api.
RUN pnpm --filter @streamz/shared build \
 && pnpm --filter @streamz/api exec prisma generate \
 && pnpm --filter @streamz/api build

# ── Runtime ─────────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
ENV LOG_FORMAT=json
# Dentro do contêiner o único endereço alcançável pelo mapeamento de porta é o
# 0.0.0.0 (main.ts já usa este padrão; explícito aqui para quem lê a imagem).
ENV API_HOST=0.0.0.0
ENV API_PORT=3333

# Copiamos o node_modules inteiro do estágio de build, com devDependencies.
# É deliberado: o client do Prisma é gerado dentro do store do pnpm
# (`node_modules/.pnpm/@prisma+client@…/node_modules/.prisma`) e qualquer poda
# "só produção" o desfaz — reinstalar sem o CLI do Prisma produziria uma imagem
# que sobe e quebra na primeira query. O custo é ~150MB de camada; a alternativa
# seria mudar o `output` do generator no schema, que é território de outro dono.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/shared/package.json packages/shared/
# Sem esta linha a imagem sobe e morre em "Cannot find module 'zod'": no pnpm o
# node_modules da raiz só linka as deps diretas da RAIZ, e zod é dependência do
# shared. Quem resolve o require é o symlink que mora aqui, apontando para o
# store em /app/node_modules/.pnpm.
COPY --from=build /app/packages/shared/node_modules packages/shared/node_modules
COPY --from=build /app/apps/api/node_modules apps/api/node_modules
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/package.json apps/api/
COPY --from=build /app/apps/api/prisma apps/api/prisma
COPY apps/api/docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# node:alpine já traz o usuário `node`; rodar como root numa imagem exposta à
# internet é risco gratuito.
USER node
WORKDIR /app/apps/api
EXPOSE 3333

# Sonda de liveness (a de readiness fica com o orquestrador: /api/ready).
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||3333)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "dist/main.js"]
