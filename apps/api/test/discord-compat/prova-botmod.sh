#!/usr/bin/env bash
# A prova do **Streamz Moderação** (`apps/bots/src/moderacao`), ponta a ponta,
# na bancada descartável.
#
#   ./prova-botmod.sh [sufixo] [porta]       # padrão: botmod 3451
#   ./prova-botmod.sh derrubar [sufixo]
#
# Irmã da `prova-botmus.sh`, com o prefixo `botmod-` nos contêineres para as
# duas poderem existir ao mesmo tempo sem se atropelar (há outras sessões neste
# servidor).
#
# O que ela levanta — três contêineres de vida longa, e só. Este servidor tem 6
# núcleos e já caiu por OOM: **nada de emulador, nada de Lavalink**, que este
# bot não toca em voz.
#
#   botmod-pg + botmod-api    o Streamz descartável, pelo `ambiente.sh` de sempre
#   botmod-bot               o runtime de `apps/bots` com BOTS=moderacao
#
# Os passos, na ordem:
#
#   0. bancada de pé, com PLATFORM_ADMIN_EMAILS apontando para a conta que vai
#      provisionar (o selo de "oficial" é rota do painel do administrador)
#   1. semeadura: o dono + servidor + canais; a conta dona dos bots; e **dois
#      membros comuns** (`alvo` e `xereta`) — sem gente comum não dá para provar
#      nem a recusa por falta de permissão nem a hierarquia
#   2. build de `@streamz/bots`
#   3. `provisionar`: cria a Application, grava o token com chmod 600, publica
#      no diretório e marca como oficial
#   4. o dono do servidor instala o app com as permissões de moderação (é o que
#      a tela "Adicionar ao servidor" faz)
#   5. o bot sobe, com o volume do estado (`/dados`), e registra os comandos
#   6. `prova-botmod.mjs`: diretório, comandos, `/registro-de-moderacao`,
#      `/aviso` + `/avisos`, `/limpar` apagando de verdade, a recusa efêmera de
#      quem não tem permissão, `/banir` sem pendurar e o prefixo `!`
#   7. o estado no disco, olhado de dentro do contêiner
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
AQUI="$RAIZ/apps/api/test/discord-compat"
SUFIXO="${1:-botmod}"
PORTA="${2:-3451}"

REDE="streamz-bots-$SUFIXO"
API_CONTAINER="streamz-bots-$SUFIXO-api"
BOT="botmod-bot"
TRABALHO="${TMPDIR:-/tmp}/botmod-$SUFIXO"

# A conta que provisiona precisa estar em PLATFORM_ADMIN_EMAILS **antes** de a
# API subir: a lista é lida do ambiente, nunca do banco.
EMAIL_DOS_BOTS="dono-dos-bots@exemplo.invalido"
export PLATFORM_ADMIN_EMAILS="$EMAIL_DOS_BOTS"

derrubar() {
  local s="${1:-$SUFIXO}"
  docker rm -f "botmod-bot" >/dev/null 2>&1 || true
  "$AQUI/ambiente.sh" derrubar "$s" >/dev/null 2>&1 || true
  rm -rf "${TMPDIR:-/tmp}/botmod-$s"
}

if [ "${1:-}" = "derrubar" ]; then
  derrubar "${2:-botmod}"
  echo "[botmod] derrubado: ${2:-botmod}"
  exit 0
fi

trap 'echo; echo "[botmod] para derrubar: $AQUI/prova-botmod.sh derrubar $SUFIXO"' EXIT

mkdir -p "$TRABALHO/tokens" "$TRABALHO/dados"
chmod 700 "$TRABALHO/tokens"

echo "== 0. ambiente (admin da instância: $EMAIL_DOS_BOTS) =="
"$AQUI/ambiente.sh" subir "$SUFIXO" "$PORTA"

echo
echo "== 1. semeadura =="
SEMENTE="$(docker exec -e API_URL=http://localhost:3333/api "$API_CONTAINER" \
  node apps/api/test/discord-compat/semear.mjs | tail -1)"
echo "$SEMENTE" | sed -E 's/"(token|accessToken)":"[^"]*"/"\1":"<oculto>"/g'

DONO_DOS_BOTS="$(docker exec \
  -e API_URL=http://localhost:3333/api -e EMAIL_DO_DONO="$EMAIL_DOS_BOTS" \
  "$API_CONTAINER" node apps/api/test/discord-compat/semear-botmus.mjs | tail -1)"
TOKEN_DO_ADMIN="$(printf '%s' "$DONO_DOS_BOTS" | sed -E 's/.*"accessToken":"([^"]*)".*/\1/')"

GUILD_ID="$(printf '%s' "$SEMENTE" | sed -E 's/.*"servidor":\{"id":"([^"]*)".*/\1/')"
GENTE="$(docker exec -e API_URL=http://localhost:3333/api -e GUILD_ID="$GUILD_ID" \
  "$API_CONTAINER" node apps/api/test/discord-compat/semear-botmod.mjs | tail -1)"
echo "$GENTE" | sed -E 's/"accessToken":"[^"]*"/"accessToken":"<oculto>"/g'

echo
echo "== 2. build de @streamz/bots =="
docker run --rm -v "$RAIZ:/w" -w /w node:22 bash -lc "
  corepack enable >/dev/null 2>&1
  pnpm --filter @streamz/shared build >/dev/null
  pnpm --filter @streamz/bots build >/dev/null
  echo 'build ok'
"

echo
echo "== 3. provisionamento (cria a Application, grava o token, publica) =="
docker run --rm --network "$REDE" \
  -v "$RAIZ:/w" -v "$TRABALHO/tokens:/tokens" -w /w \
  -e STREAMZ_API_URL="http://$API_CONTAINER:3333/api" \
  -e BOTS_TOKEN="$TOKEN_DO_ADMIN" \
  -e BOTS_DIR=/tokens \
  -e LOG_FORMATO=texto \
  node:22 node apps/bots/dist/provisionar.js

echo "--- permissão dos arquivos de token (têm de ser 600):"
ls -l "$TRABALHO/tokens/"
TOKEN_DO_BOT="$(cat "$TRABALHO/tokens/moderacao.token")"

APP="$(docker run --rm --network "$REDE" -e T="$TOKEN_DO_ADMIN" node:22 node -e "
  fetch('http://$API_CONTAINER:3333/api/applications/publicas', {
    headers: { authorization: 'Bearer ' + process.env.T },
  })
    .then((r) => r.json())
    .then((p) => {
      const a = (p.itens || []).find((x) => x.name === 'Streamz Moderação');
      if (!a) throw new Error('o aplicativo não está no diretório');
      process.stdout.write(JSON.stringify({ id: a.id, snowflake: a.snowflake, name: a.name, botUserId: a.botUser.id }));
    });
")"
echo "aplicativo: $APP"

echo
echo "== 4. o dono do servidor instala o app (a tela 'Adicionar ao servidor') =="
docker run --rm --network "$REDE" -e SEMENTE="$SEMENTE" -e APP="$APP" node:22 node -e "
  const s = JSON.parse(process.env.SEMENTE);
  const a = JSON.parse(process.env.APP);
  // VIEW_CHANNEL | SEND_MESSAGES | MANAGE_MESSAGES | KICK_MEMBERS | BAN_MEMBERS
  // | MODERATE_MEMBERS — exatamente o \`permissoesPadrao\` que o bot declara.
  const permissoes = (1 << 0) | (1 << 1) | (1 << 2) | (1 << 5) | (1 << 6) | (1 << 15);
  fetch('http://$API_CONTAINER:3333/api/guilds/' + s.servidor.id + '/aplicativos', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + s.dono.accessToken },
    body: JSON.stringify({ applicationId: a.id, permissions: permissoes }),
  })
    .then(async (r) => {
      const t = await r.text();
      if (!r.ok) throw new Error(r.status + ': ' + t.slice(0, 300));
      console.log('instalado com as permissões de moderação');
    });
"

echo
echo "== 5. o bot sobe =="
docker rm -f "$BOT" >/dev/null 2>&1 || true
docker run -d --name "$BOT" --network "$REDE" \
  -v "$RAIZ:/w" -v "$TRABALHO/dados:/dados" -w /w/apps/bots \
  -e BOTS=moderacao \
  -e STREAMZ_API_URL="http://$API_CONTAINER:3333/api" \
  -e STREAMZ_BOT_TOKEN="$TOKEN_DO_BOT" \
  -e MODERACAO_DIR=/dados \
  -e LOG_FORMATO=texto \
  node:22 node dist/index.js >/dev/null

echo "[botmod] esperando o 'conectado' e o registro dos comandos…"
for _ in $(seq 1 60); do
  if docker logs "$BOT" 2>&1 | grep -q "comandos de barra registrados"; then break; fi
  sleep 2
done
docker logs "$BOT" 2>&1 | grep -E "conectado|comandos de barra registrados|estado por servidor" | head -10

echo
echo "== 6. as provas =="
docker run --rm --network "$REDE" \
  -e SEMENTE="$SEMENTE" -e GENTE="$GENTE" -e APP="$APP" \
  -e API_URL="http://$API_CONTAINER:3333/api" \
  -v "$AQUI:/prova:ro" -w /tmp \
  node:22 bash -lc "
    npm install --silent --no-audit --no-fund socket.io-client@4 >/dev/null 2>&1
    cp /prova/prova-botmod.mjs .
    node prova-botmod.mjs
  "

echo
echo "== 7. o estado no disco (um JSON por servidor, escrita atômica) =="
docker exec "$BOT" sh -lc 'ls -l /dados && echo "---" && cat /dados/*.json' || true
echo "--- não pode sobrar nenhum .tmp-*: a escrita atômica renomeia, não deixa rastro"
docker exec "$BOT" sh -lc 'ls /dados | grep -c "tmp-" || echo 0'

echo
echo "== fim. Para derrubar: $AQUI/prova-botmod.sh derrubar $SUFIXO =="
