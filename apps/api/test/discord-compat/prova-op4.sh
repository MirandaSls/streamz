#!/usr/bin/env bash
# A prova de ponta a ponta do **lote B da F2**: o op 4 e o par de dispatches.
#
#   ./prova-op4.sh [sufixo] [porta]      # padrão: f2b 3420
#
# Reusa o ambiente descartável da F1 (`ambiente.sh` + `semear.mjs`, que agora
# semeia um canal de voz também) e roda um discord.js@14 + @discordjs/voice de
# verdade contra ele. A **ponte não precisa existir**: o que se prova aqui é que
# a API manda o par certo, com o conteúdo certo. O áudio saindo do outro lado é
# o degrau 3 e o 4 da fase.
#
# A API sobe com `PONTE_VOZ_SEGREDO` e as três variáveis do LiveKit de mentira —
# o token do LiveKit é assinado localmente e nunca é apresentado a servidor
# nenhum nesta prova, então uma chave de brinquedo basta.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
AQUI="$RAIZ/apps/api/test/discord-compat"
SUFIXO="${1:-f2b}"
PORTA="${2:-3420}"
REDE="streamz-bots-$SUFIXO"
PG="streamz-bots-$SUFIXO-pg"
API_CONTAINER="streamz-bots-$SUFIXO-api"

SENHA_PG="descartavel"
export PONTE_VOZ_SEGREDO="${PONTE_VOZ_SEGREDO:-segredo-de-prova-da-ponte-de-voz}"
export PONTE_VOZ_ENDPOINT="${PONTE_VOZ_ENDPOINT:-voz.streamz.chat}"

echo "== 0. ambiente (com as variáveis da ponte) =="
docker network create "$REDE" >/dev/null 2>&1 || true
docker rm -f "$PG" "$API_CONTAINER" >/dev/null 2>&1 || true

docker run -d --name "$PG" --network "$REDE" \
  -e POSTGRES_PASSWORD="$SENHA_PG" -e POSTGRES_DB=streamz \
  postgres:16-alpine >/dev/null
echo "[ambiente] Postgres subindo…"
for _ in $(seq 1 60); do
  docker exec "$PG" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done

docker run -d --name "$API_CONTAINER" --network "$REDE" -p "$PORTA:3333" \
  -v "$RAIZ:/w" -w /w \
  -e DATABASE_URL="postgresql://postgres:$SENHA_PG@$PG:5432/streamz?schema=public" \
  -e JWT_SECRET="teste-de-compat-do-discord-1" \
  -e JWT_REFRESH_SECRET="teste-de-compat-do-discord-2" \
  -e THROTTLE_DISABLED=1 -e CI=1 \
  -e PONTE_VOZ_SEGREDO="$PONTE_VOZ_SEGREDO" \
  -e PONTE_VOZ_ENDPOINT="$PONTE_VOZ_ENDPOINT" \
  -e LIVEKIT_URL="wss://livekit.streamz.chat" \
  -e LIVEKIT_API_KEY="devkey" \
  -e LIVEKIT_API_SECRET="3f9a1c7e5b2d8046a1f3c9e7b5d2048613f9a1c7e5b2d8046a1f3c9e7b5d20486" \
  node:22 bash -lc "
    corepack enable
    pnpm install --frozen-lockfile
    pnpm --filter @streamz/shared build
    pnpm --filter @streamz/api exec prisma generate
    pnpm --filter @streamz/api exec prisma migrate deploy
    pnpm --filter @streamz/api exec nest start
  " >/dev/null

echo "[ambiente] API subindo em http://localhost:$PORTA/api (leva ~2 min na primeira vez)"
pronta=0
for _ in $(seq 1 300); do
  if curl -sf "http://localhost:$PORTA/api/health" >/dev/null 2>&1; then
    pronta=1
    break
  fi
  sleep 2
done
if [ "$pronta" != "1" ]; then
  echo "[ambiente] a API não respondeu. Veja: docker logs $API_CONTAINER" >&2
  exit 1
fi
echo "[ambiente] pronta."

echo
echo "== 0b. semeadura (dono + servidor + canal de texto + canal de voz + bot) =="
SEMENTE="$(docker exec -e API_URL=http://localhost:3333/api "$API_CONTAINER" \
  node apps/api/test/discord-compat/semear.mjs | tail -1)"
echo "$SEMENTE" | sed -E 's/"token":"[^"]*"/"token":"<oculto>"/'

echo
echo "== 1-7. discord.js + @discordjs/voice: op 4 → os dois dispatches =="
docker run --rm --network "$REDE" \
  -e SEMENTE="$SEMENTE" \
  -e API_URL="http://$API_CONTAINER:3333/api" \
  -e PONTE_VOZ_ENDPOINT="$PONTE_VOZ_ENDPOINT" \
  -e DEBUG_DJS="${DEBUG_DJS:-0}" \
  -v "$AQUI:/prova:ro" -w /tmp \
  node:22 bash -lc "
    npm install --silent --no-audit --no-fund discord.js@14 @discordjs/voice@0.18 >/dev/null 2>&1
    cp /prova/prova-op4.mjs .
    node prova-op4.mjs
  "

echo
echo "== o que a API registrou (o tamanho do JWT sai daqui) =="
docker logs "$API_CONTAINER" 2>&1 | grep -E "VozDoGateway|JWT da ponte" | tail -10 || true

echo
echo "== fim. Para derrubar: docker rm -f $API_CONTAINER $PG; docker network rm $REDE =="
