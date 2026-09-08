#!/usr/bin/env bash
# As provas da F3 (§12 do documento), em ordem, num comando.
#
#   ./prova-f3.sh [sufixo] [porta]      # padrão: f3 3420
#
# 1. O `deploy-commands.js` **padrão do guia do discord.js** roda sem erro
#    contra a API descartável, e os comandos aparecem em
#    `GET applications/:app/guilds/:gid/commands`.
# 2. `/play` aparece no autocomplete do composer com nome, descrição e o
#    **avatar do bot** — é visual, sai do harness de render do lote C, não
#    daqui. O que este script prova da parte dela é o degrau de baixo: que
#    `GET /api/guilds/:id/comandos-de-app` devolve o `/play` com o `botUser`.
# 3. Um bot discord.js com `interactionCreate` faz `deferReply()` e depois
#    `editReply('pong')`: as duas etapas aparecem no chat — a mensagem
#    "pensando…" e depois o texto — **pelo socket.io**, sem F5. E o mesmo com
#    discord.py `app_commands`.
# 4. Os erros: interação expirada → 404, callback duplicado → 400, token
#    inexistente → 404, bot respondendo em canal que não vê → 403.
#
# Reaproveita o `ambiente.sh` e o `semear.mjs` da F1. As libs de prova
# (discord.js, socket.io-client, discord.py) são instaladas em contêineres
# descartáveis e **não** entram no pnpm do monorepo: são ferramenta de
# verificação, não dependência do produto.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
AQUI="$RAIZ/apps/api/test/discord-compat"
SUFIXO="${1:-f3}"
PORTA="${2:-3420}"
REDE="streamz-bots-$SUFIXO"
API_CONTAINER="streamz-bots-$SUFIXO-api"

echo "== 0. ambiente =="
"$AQUI/ambiente.sh" subir "$SUFIXO" "$PORTA"

echo
echo "== 0b. semeadura =="
SEMENTE="$(docker exec -e API_URL=http://localhost:3333/api "$API_CONTAINER" \
  node apps/api/test/discord-compat/semear.mjs | tail -1)"
echo "$SEMENTE" | sed -E 's/"token":"[^"]*"/"token":"<oculto>"/'

echo
echo "== 1. deploy-commands.js (o script padrão do guia do discord.js) =="
COMANDOS="$(docker run --rm --network "$REDE" \
  -e SEMENTE="$SEMENTE" \
  -e API_URL="http://$API_CONTAINER:3333/api" \
  -v "$AQUI:/prova:ro" -w /tmp \
  node:22 bash -lc "
    npm install --silent --no-audit --no-fund discord.js@14 >/dev/null 2>&1
    cp /prova/deploy-commands.mjs .
    node deploy-commands.mjs
  " | tail -1)"
echo "$COMANDOS"

echo
echo "== 1 e 3. discord.js (listagem + deferReply/editReply no socket.io) =="
docker run --rm --network "$REDE" \
  -e SEMENTE="$SEMENTE" \
  -e COMANDOS="$COMANDOS" \
  -e API_URL="http://$API_CONTAINER:3333/api" \
  -e DEBUG_DJS="${DEBUG_DJS:-0}" \
  -v "$AQUI:/prova:ro" -w /tmp \
  node:22 bash -lc "
    npm install --silent --no-audit --no-fund discord.js@14 socket.io-client@4 >/dev/null 2>&1
    cp /prova/prova-f3-discordjs.mjs .
    node prova-f3-discordjs.mjs
  "

echo
echo "== 3b. discord.py (app_commands: defer + edit_original_response) =="
# O cuid do /play, que é o que o composer manda (o snowflake é do bot).
#
# O `-w /w/apps/api` não é enfeite: `node -e` não tem arquivo, então a resolução
# de módulo parte do diretório de trabalho, e `@prisma/client` mora sob
# `apps/api`. Da raiz do monorepo dá `MODULE_NOT_FOUND`; os outros scripts
# escapam disso porque são arquivos dentro de `apps/api/`.
ID_DO_COMANDO="$(docker exec -w /w/apps/api "$API_CONTAINER" node -e '
  const { PrismaClient } = require("@prisma/client");
  const p = new PrismaClient();
  p.applicationCommand.findFirst({ where: { name: "play" }, select: { id: true } })
    .then((c) => { process.stdout.write(c ? c.id : ""); return p.$disconnect(); });
')"
docker run --rm --network "$REDE" \
  -e SEMENTE="$SEMENTE" \
  -e API_URL="http://$API_CONTAINER:3333/api" \
  -e ID_DO_COMANDO="$ID_DO_COMANDO" \
  -v "$AQUI:/prova:ro" -w /tmp \
  python:3-slim bash -lc "
    pip install --quiet --disable-pip-version-check 'discord.py>=2.4' >/dev/null 2>&1
    cp /prova/prova-f3-discordpy.py .
    python prova-f3-discordpy.py
  "

echo
echo "== 4. os erros (dentro do contêiner da API: precisa do Prisma) =="
docker exec -e SEMENTE="$SEMENTE" -e API_URL=http://localhost:3333/api "$API_CONTAINER" \
  node apps/api/test/discord-compat/prova-f3-erros.mjs

echo
echo "== fim. Para derrubar: $AQUI/ambiente.sh derrubar $SUFIXO =="
