#!/usr/bin/env bash
# As quatro provas da F1 (§12 do documento), em ordem, num comando.
#
#   ./prova.sh [sufixo] [porta]      # padrão: f1 3410
#
# 1. `curl -H "Authorization: Bot <t>" /api/v10/users/@me` → o bot
# 2. discord.js@14 emite `ready` com `guilds.cache.size >= 1`
# 3. `!ping` pelo socket.io (como o navegador faz) → `pong` do bot de volta
#    **pelo socket.io** — é o que prova que a resposta aparece sem F5
# 4. o mesmo com discord.py (`Route.BASE`), que prova a tolerância a
#    `compress=zlib-stream`
# 5. (F5) reagir pelo socket.io — como o navegador faz — chega ao bot como
#    `messageReactionAdd`, e **não** como `messageUpdate`; o bot reage de volta
#    pelo REST e a reação dele aparece no socket.io do dono, sem F5
#
# 6. (§9) o bot responde a um comando de barra com `ephemeral: true` e **só o
#    cliente socket.io de quem invocou recebe**: um segundo usuário logado no
#    mesmo canal fica em silêncio, e `GET /api/channels/:id/messages` não a
#    lista. O passo tem um controle antes (uma resposta normal, que chega aos
#    dois), senão o silêncio do segundo cliente não provaria nada.
#
# As libs de prova (discord.js, socket.io-client, discord.py) são instaladas em
# contêineres descartáveis. Elas **não** entram no pnpm do monorepo: são
# ferramenta de verificação, não dependência do produto.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
AQUI="$RAIZ/apps/api/test/discord-compat"
SUFIXO="${1:-f1}"
PORTA="${2:-3410}"
REDE="streamz-bots-$SUFIXO"
API_CONTAINER="streamz-bots-$SUFIXO-api"

echo "== 0. ambiente =="
"$AQUI/ambiente.sh" subir "$SUFIXO" "$PORTA"

echo
echo "== 0b. semeadura =="
SEMENTE="$(docker exec -e API_URL=http://localhost:3333/api "$API_CONTAINER" \
  node apps/api/test/discord-compat/semear.mjs | tail -1)"
# o token não vai para o log: `jq` não está garantido aqui, então cortamos com sed
echo "$SEMENTE" | sed -E 's/"token":"[^"]*"/"token":"<oculto>"/'

echo
echo "== 1-3. discord.js (REST + ready + !ping/pong no socket.io) =="
docker run --rm --network "$REDE" \
  -e SEMENTE="$SEMENTE" \
  -e API_URL="http://$API_CONTAINER:3333/api" \
  -e DEBUG_DJS="${DEBUG_DJS:-0}" \
  -v "$AQUI:/prova:ro" -w /tmp \
  node:22 bash -lc "
    npm install --silent --no-audit --no-fund discord.js@14 socket.io-client@4 >/dev/null 2>&1
    cp /prova/prova-discordjs.mjs .
    node prova-discordjs.mjs
  "

echo
echo "== 4. discord.py (Route.BASE + compress=zlib-stream) =="
docker run --rm --network "$REDE" \
  -e SEMENTE="$SEMENTE" \
  -e API_URL="http://$API_CONTAINER:3333/api" \
  -v "$AQUI:/prova:ro" -w /tmp \
  python:3-slim bash -lc "
    pip install --quiet --disable-pip-version-check 'discord.py>=2.4' >/dev/null 2>&1
    cp /prova/prova-discordpy.py .
    python prova-discordpy.py
  "

echo
echo "== 5. reações granulares (F5): messageReactionAdd + reagir pelo REST =="
docker run --rm --network "$REDE" \
  -e SEMENTE="$SEMENTE" \
  -e API_URL="http://$API_CONTAINER:3333/api" \
  -e DEBUG_DJS="${DEBUG_DJS:-0}" \
  -v "$AQUI:/prova:ro" -w /tmp \
  node:22 bash -lc "
    npm install --silent --no-audit --no-fund discord.js@14 socket.io-client@4 >/dev/null 2>&1
    cp /prova/prova-reacoes.mjs .
    node prova-reacoes.mjs
  "

echo
echo "== 6a. registro dos comandos de barra (o deploy-commands.js do guia) =="
# a prova da efêmera precisa de um comando registrado; é o mesmo script da F3
COMANDOS="$(docker run --rm --network "$REDE" \
  -e SEMENTE="$SEMENTE" \
  -e API_URL="http://$API_CONTAINER:3333/api" \
  -v "$AQUI:/prova:ro" -w /tmp \
  node:22 bash -lc "
    npm install --silent --no-audit --no-fund discord.js@14 >/dev/null 2>&1
    cp /prova/deploy-commands.mjs .
    node deploy-commands.mjs
  " | tail -1)"

echo
echo "== 6. mensagem efêmera (flags: 64) — só o invocador recebe =="
docker run --rm --network "$REDE" \
  -e SEMENTE="$SEMENTE" \
  -e COMANDOS="$COMANDOS" \
  -e API_URL="http://$API_CONTAINER:3333/api" \
  -v "$AQUI:/prova:ro" -w /tmp \
  node:22 bash -lc "
    npm install --silent --no-audit --no-fund discord.js@14 socket.io-client@4 >/dev/null 2>&1
    cp /prova/prova-efemera.mjs .
    node prova-efemera.mjs
  "

echo
echo "== fim. Para derrubar: $AQUI/ambiente.sh derrubar $SUFIXO =="
