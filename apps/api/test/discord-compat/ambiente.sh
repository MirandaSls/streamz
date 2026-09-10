#!/usr/bin/env bash
# Sobe um Streamz descartável (Postgres + API) para as provas da compatibilidade
# com bots do Discord. Não há node no host: tudo roda em `docker run node:22`.
#
#   ./ambiente.sh subir   <sufixo> <porta>   # ex.: ./ambiente.sh subir f1 3401
#   ./ambiente.sh derrubar <sufixo>
#   ./ambiente.sh logs     <sufixo>
#
# `PLATFORM_ADMIN_EMAILS` do ambiente é repassada à API: é o que permite a uma
# prova exercitar as rotas do painel do administrador (as dos bots oficiais
# precisam dela). Sem a variável, nada muda.
#
# O `sufixo` nomeia a rede e os contêineres — use um seu, porque há outras
# sessões trabalhando neste servidor ao mesmo tempo (§2 do processo).
#
# O banco é descartável de propósito: `docker rm` leva tudo junto. Nunca aponte
# isto para o Postgres de produção.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
ACAO="${1:-}"
SUFIXO="${2:-f1}"
PORTA="${3:-3401}"

REDE="streamz-bots-$SUFIXO"
PG="streamz-bots-$SUFIXO-pg"
API="streamz-bots-$SUFIXO-api"

# Segredos de brinquedo, só para o `validateEnv` deixar a API subir. Precisam
# ter 16+ caracteres e ser diferentes entre si.
export SENHA_PG="descartavel"
export JWT_SECRET="teste-de-compat-do-discord-1"
export JWT_REFRESH_SECRET="teste-de-compat-do-discord-2"
export DATABASE_URL_INTERNA="postgresql://postgres:$SENHA_PG@$PG:5432/streamz?schema=public"

case "$ACAO" in
subir)
  docker network create "$REDE" >/dev/null 2>&1 || true

  docker rm -f "$PG" "$API" >/dev/null 2>&1 || true

  docker run -d --name "$PG" --network "$REDE" \
    -e POSTGRES_PASSWORD="$SENHA_PG" -e POSTGRES_DB=streamz \
    postgres:16-alpine >/dev/null
  echo "[ambiente] Postgres subindo…"
  for _ in $(seq 1 60); do
    docker exec "$PG" pg_isready -U postgres >/dev/null 2>&1 && break
    sleep 1
  done

  docker run -d --name "$API" --network "$REDE" -p "$PORTA:3333" \
    -v "$RAIZ:/w" -w /w \
    -e DATABASE_URL="$DATABASE_URL_INTERNA" \
    -e JWT_SECRET="$JWT_SECRET" -e JWT_REFRESH_SECRET="$JWT_REFRESH_SECRET" \
    -e THROTTLE_DISABLED=1 -e CI=1 \
    -e PLATFORM_ADMIN_EMAILS="${PLATFORM_ADMIN_EMAILS:-}" \
    node:22 bash -lc "
      corepack enable
      pnpm install --frozen-lockfile
      pnpm --filter @streamz/shared build
      pnpm --filter @streamz/api exec prisma generate
      pnpm --filter @streamz/api exec prisma migrate deploy
      pnpm --filter @streamz/api exec nest start
    " >/dev/null

  echo "[ambiente] API subindo em http://localhost:$PORTA/api (leva ~2 min na primeira vez)"
  for _ in $(seq 1 300); do
    if curl -sf "http://localhost:$PORTA/api/health" >/dev/null 2>&1; then
      echo "[ambiente] pronta."
      exit 0
    fi
    sleep 2
  done
  echo "[ambiente] a API não respondeu em 10 min. Veja: docker logs $API" >&2
  exit 1
  ;;
derrubar)
  docker rm -f "$PG" "$API" >/dev/null 2>&1 || true
  docker network rm "$REDE" >/dev/null 2>&1 || true
  echo "[ambiente] derrubado."
  ;;
logs)
  docker logs --tail 200 -f "$API"
  ;;
*)
  echo "uso: $0 {subir|derrubar|logs} <sufixo> [porta]" >&2
  exit 2
  ;;
esac
