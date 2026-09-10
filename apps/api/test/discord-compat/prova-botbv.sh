#!/usr/bin/env bash
# A prova do **Streamz Boas-vindas** (`apps/bots/src/boas-vindas`) ponta a
# ponta, na bancada descartável. Irmã de `prova-botmus.sh`.
#
#   ./prova-botbv.sh [sufixo] [porta]       # padrão: botbv 3421
#   ./prova-botbv.sh derrubar [sufixo]
#
# O que ela levanta (o mínimo — este servidor já caiu por OOM):
#
#   pg + api        o Streamz descartável, pelo `ambiente.sh` de sempre
#   botbv-bot       o runtime de `apps/bots` com BOTS=boas-vindas
#
# Nada de Lavalink, de ponte de voz e de emulador: este bot é um
# `guildMemberAdd` e um `guildMemberRemove`, e o que ele precisa é do gateway
# compat da API — que a bancada já tem.
#
# Os passos:
#
#   0. bancada de pé, com PLATFORM_ADMIN_EMAILS apontando para a conta que vai
#      provisionar (o selo de "oficial" é rota do painel do administrador)
#   1. semeadura: o dono comum + servidor + canais; e a conta dona dos bots
#   2. build de `@streamz/bots`
#   3. `provisionar`: cria as Applications, grava os tokens, publica no diretório
#   4. o dono do servidor instala o app (é o que a tela "Adicionar ao servidor" faz)
#   5. o bot sobe e registra os comandos
#   6. `prova-botbv.mjs`: diretório, comandos, silêncio antes de configurar,
#      configuração, **um segundo usuário entrando de verdade** (convite +
#      resgate), `/boas-vindas testar`, autorole, recusa efêmera e desligar
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
AQUI="$RAIZ/apps/api/test/discord-compat"
SUFIXO="${1:-botbv}"
PORTA="${2:-3421}"

REDE="streamz-bots-$SUFIXO"
API_CONTAINER="streamz-bots-$SUFIXO-api"
BOT="botbv-bot"
TRABALHO="${TMPDIR:-/tmp}/botbv-$SUFIXO"

# A conta que provisiona precisa estar em PLATFORM_ADMIN_EMAILS **antes** de a
# API subir: a lista é lida do ambiente, nunca do banco.
EMAIL_DOS_BOTS="dono-dos-bots@exemplo.invalido"
export PLATFORM_ADMIN_EMAILS="$EMAIL_DOS_BOTS"

derrubar() {
  local s="${1:-$SUFIXO}"
  docker rm -f "botbv-bot" >/dev/null 2>&1 || true
  "$AQUI/ambiente.sh" derrubar "$s" >/dev/null 2>&1 || true
  rm -rf "${TMPDIR:-/tmp}/botbv-$s"
}

if [ "${1:-}" = "derrubar" ]; then
  derrubar "${2:-botbv}"
  echo "[botbv] derrubado: ${2:-botbv}"
  exit 0
fi

trap 'echo; echo "[botbv] para derrubar: $AQUI/prova-botbv.sh derrubar $SUFIXO"' EXIT

mkdir -p "$TRABALHO/tokens" "$TRABALHO/dados"
chmod 700 "$TRABALHO/tokens"

echo "== 0. ambiente (admin da instância: $EMAIL_DOS_BOTS) =="
"$AQUI/ambiente.sh" subir "$SUFIXO" "$PORTA"

echo
echo "== 1. semeadura =="
SEMENTE="$(docker exec -e API_URL=http://localhost:3333/api "$API_CONTAINER" \
  node apps/api/test/discord-compat/semear.mjs | tail -1)"
echo "$SEMENTE" | sed -E 's/"token":"[^"]*"/"token":"<oculto>"/'

DONO_DOS_BOTS="$(docker exec \
  -e API_URL=http://localhost:3333/api -e EMAIL_DO_DONO="$EMAIL_DOS_BOTS" \
  "$API_CONTAINER" node apps/api/test/discord-compat/semear-botmus.mjs | tail -1)"
TOKEN_DO_ADMIN="$(printf '%s' "$DONO_DOS_BOTS" | sed -E 's/.*"accessToken":"([^"]*)".*/\1/')"

echo
echo "== 2. build de @streamz/bots =="
docker run --rm -v "$RAIZ:/w" -w /w node:22 bash -lc "
  corepack enable >/dev/null 2>&1
  pnpm --filter @streamz/shared build >/dev/null
  pnpm --filter @streamz/bots build >/dev/null
  echo 'build ok'
"

echo
echo "== 3. provisionamento (cria as Applications, grava os tokens, publica) =="
# O `provisionar` varre `dist/` e provisiona **todos** os bots — é assim que ele
# é (a chave é o nome, e é idempotente). Só o de boas-vindas sobe adiante.
docker run --rm --network "$REDE" \
  -v "$RAIZ:/w" -v "$TRABALHO/tokens:/tokens" -w /w \
  -e STREAMZ_API_URL="http://$API_CONTAINER:3333/api" \
  -e BOTS_TOKEN="$TOKEN_DO_ADMIN" \
  -e BOTS_DIR=/tokens \
  -e LOG_FORMATO=texto \
  node:22 node apps/bots/dist/provisionar.js

echo "--- permissão dos arquivos de token (tem de ser 600):"
ls -l "$TRABALHO/tokens/"
TOKEN_DO_BOT="$(cat "$TRABALHO/tokens/boas-vindas.token")"

APP="$(docker run --rm --network "$REDE" -e T="$TOKEN_DO_ADMIN" node:22 node -e "
  fetch('http://$API_CONTAINER:3333/api/applications/publicas', {
    headers: { authorization: 'Bearer ' + process.env.T },
  })
    .then((r) => r.json())
    .then((p) => {
      const a = (p.itens || []).find((x) => x.name === 'Streamz Boas-vindas');
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
  // VIEW_CHANNEL | SEND_MESSAGES | MANAGE_ROLES — o que o bot declara.
  const permissoes = (1 << 0) | (1 << 1) | (1 << 4);
  fetch('http://$API_CONTAINER:3333/api/guilds/' + s.servidor.id + '/aplicativos', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + s.dono.accessToken },
    body: JSON.stringify({ applicationId: a.id, permissions: permissoes }),
  })
    .then(async (r) => {
      const t = await r.text();
      if (!r.ok) throw new Error(r.status + ': ' + t.slice(0, 300));
      console.log('instalado');
    });
"

echo
echo "== 5. o bot sobe =="
docker rm -f "$BOT" >/dev/null 2>&1 || true
docker run -d --name "$BOT" --network "$REDE" \
  -v "$RAIZ:/w" -v "$TRABALHO/dados:/dados" -w /w/apps/bots \
  -e BOTS=boas-vindas \
  -e STREAMZ_API_URL="http://$API_CONTAINER:3333/api" \
  -e STREAMZ_BOT_TOKEN="$TOKEN_DO_BOT" \
  -e BOAS_VINDAS_DIR=/dados \
  -e LOG_FORMATO=texto \
  node:22 node dist/index.js >/dev/null

echo "[botbv] esperando o 'conectado' e o registro dos comandos…"
for _ in $(seq 1 60); do
  if docker logs "$BOT" 2>&1 | grep -q "comandos de barra registrados"; then break; fi
  sleep 2
done
docker logs "$BOT" 2>&1 | grep -E "conectado|comandos de barra registrados|ouvindo" | head -10

echo
echo "== 6. as provas =="
# `set -e` mataria o script antes do relatório do estado; guardamos a saída.
SAIDA=0
docker run --rm --network "$REDE" \
  -e SEMENTE="$SEMENTE" -e APP="$APP" \
  -e API_URL="http://$API_CONTAINER:3333/api" \
  -v "$AQUI:/prova:ro" -w /tmp \
  node:22 bash -lc "
    npm install --silent --no-audit --no-fund socket.io-client@4 >/dev/null 2>&1
    cp /prova/prova-botbv.mjs .
    node prova-botbv.mjs
  " || SAIDA=$?

echo
echo "--- o estado no volume (um JSON por servidor, escrita atômica):"
ls -l "$TRABALHO/dados/"
for f in "$TRABALHO/dados"/*.json; do echo "$f:"; cat "$f"; done

echo
echo "--- o log do bot:"
docker logs "$BOT" 2>&1 | grep -E "membro entrou|membro saiu|falhou" | tail -10

echo
echo "== fim. Para derrubar: $AQUI/prova-botbv.sh derrubar $SUFIXO =="
exit $SAIDA
