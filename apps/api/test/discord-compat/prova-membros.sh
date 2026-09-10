#!/usr/bin/env bash
# A prova das rotas de membro (F5), num comando.
#
#   ./prova-membros.sh [sufixo] [porta]     # padrão: memb 3412
#
# Sobe um Streamz descartável (`ambiente.sh`), semeia o cenário
# (`semear-membros.mjs`) e roda `prova-membros.mjs` num contêiner `node:22` com
# discord.js@14 e socket.io-client instalados na hora — **bot de verdade, sem
# emulador**. Ao todo três contêineres de pé (Postgres, API e o da prova, um de
# cada vez), porque a máquina tem seis núcleos e já caiu por OOM.
#
# Ao fim, derruba tudo. Para investigar uma falha, `MANTER=1 ./prova-membros.sh`
# deixa o ambiente de pé.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
AQUI="$RAIZ/apps/api/test/discord-compat"
SUFIXO="${1:-memb}"
PORTA="${2:-3412}"
REDE="streamz-bots-$SUFIXO"
API_CONTAINER="streamz-bots-$SUFIXO-api"

derrubar() {
  if [ "${MANTER:-0}" = "1" ]; then
    echo "== ambiente mantido de pé (MANTER=1). Para derrubar: $AQUI/ambiente.sh derrubar $SUFIXO =="
  else
    echo
    echo "== derrubando =="
    "$AQUI/ambiente.sh" derrubar "$SUFIXO"
  fi
}
trap derrubar EXIT

echo "== 0. ambiente =="
"$AQUI/ambiente.sh" subir "$SUFIXO" "$PORTA"

echo
echo "== 0b. semeadura (2 bots, 2 alvos, 3 cargos em alturas diferentes) =="
SEMENTE="$(docker exec -e API_URL=http://localhost:3333/api "$API_CONTAINER" \
  node apps/api/test/discord-compat/semear-membros.mjs | tail -1)"
echo "$SEMENTE" | sed -E 's/"token":"[^"]*"/"token":"<oculto>"/g'

echo
echo "== 1. cargos, castigo, expulsão, banimento, DM, lote, embed e hierarquia =="
docker run --rm --network "$REDE" \
  -e SEMENTE="$SEMENTE" \
  -e API_URL="http://$API_CONTAINER:3333/api" \
  -e DEBUG_DJS="${DEBUG_DJS:-0}" \
  -v "$AQUI:/prova:ro" -w /tmp \
  node:22 bash -lc "
    npm install --silent --no-audit --no-fund discord.js@14 socket.io-client@4 >/dev/null 2>&1
    cp /prova/prova-membros.mjs .
    node prova-membros.mjs
  "
