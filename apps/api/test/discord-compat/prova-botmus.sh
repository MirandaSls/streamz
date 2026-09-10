#!/usr/bin/env bash
# A prova dos **bots oficiais** (`apps/bots`) — o Streamz Música ponta a ponta,
# na bancada descartável.
#
#   ./prova-botmus.sh [sufixo] [porta]       # padrão: botmus 3420
#   ./prova-botmus.sh derrubar [sufixo]
#
# O que ela levanta (o mínimo, porque este servidor já caiu por OOM):
#
#   pg + api        o Streamz descartável, pelo `ambiente.sh` de sempre
#   botmus-bot      o runtime de `apps/bots` com BOTS=musica
#
# **Não** sobe Lavalink nem a ponte de voz: os dois exigem coisas que não
# existem aqui (`voz.streamz.chat` no DNS, 7883/udp aberta) e o que esta prova
# quer mostrar é justamente que o bot **sobe, registra, aparece no diretório e
# responde a tudo sem eles** — e que o `/tocar` recusa com uma frase clara em
# vez de pendurar. O áudio de verdade tem prova própria e já feita: a topologia
# completa (livekit + ponte + lavalink + ouvinte) é a de `prova-voz.sh`, e a
# validação com a ponte real fica para quando o DNS e a porta existirem.
#
# Os passos, na ordem:
#
#   0. bancada de pé, com PLATFORM_ADMIN_EMAILS apontando para a conta que vai
#      provisionar (o selo de "oficial" é rota do painel do administrador)
#   1. semeadura: o dono comum + servidor + canais; e a conta dona dos bots
#   2. build de `@streamz/bots`
#   3. `provisionar`: cria a Application, grava o token com chmod 600,
#      publica no diretório e marca como oficial
#   4. o dono do servidor instala o app (é o que a tela "Adicionar ao servidor" faz)
#   5. o bot sobe e registra os comandos
#   6. `prova-botmus.mjs`: diretório, comandos, `/fila`, `!fila`, `/tocar`
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
AQUI="$RAIZ/apps/api/test/discord-compat"
SUFIXO="${1:-botmus}"
PORTA="${2:-3420}"

REDE="streamz-bots-$SUFIXO"
API_CONTAINER="streamz-bots-$SUFIXO-api"
BOT="botmus-bot"
TRABALHO="${TMPDIR:-/tmp}/botmus-$SUFIXO"

# A conta que provisiona precisa estar em PLATFORM_ADMIN_EMAILS **antes** de a
# API subir: a lista é lida do ambiente, nunca do banco (é o desenho do
# `PlatformAdminService`).
EMAIL_DOS_BOTS="dono-dos-bots@exemplo.invalido"
export PLATFORM_ADMIN_EMAILS="$EMAIL_DOS_BOTS"

derrubar() {
  local s="${1:-$SUFIXO}"
  docker rm -f "botmus-bot" "botmus-lavalink" >/dev/null 2>&1 || true
  "$AQUI/ambiente.sh" derrubar "$s" >/dev/null 2>&1 || true
  rm -rf "${TMPDIR:-/tmp}/botmus-$s"
}

if [ "${1:-}" = "derrubar" ]; then
  derrubar "${2:-botmus}"
  echo "[botmus] derrubado: ${2:-botmus}"
  exit 0
fi

trap 'echo; echo "[botmus] para derrubar: $AQUI/prova-botmus.sh derrubar $SUFIXO"' EXIT

mkdir -p "$TRABALHO/tokens"
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
echo "== 3. provisionamento (cria a Application, grava o token, publica) =="
docker run --rm --network "$REDE" \
  -v "$RAIZ:/w" -v "$TRABALHO/tokens:/tokens" -w /w \
  -e STREAMZ_API_URL="http://$API_CONTAINER:3333/api" \
  -e BOTS_TOKEN="$TOKEN_DO_ADMIN" \
  -e BOTS_DIR=/tokens \
  -e LOG_FORMATO=texto \
  node:22 node apps/bots/dist/provisionar.js

echo "--- permissão do arquivo de token (tem de ser 600):"
ls -l "$TRABALHO/tokens/"
TOKEN_DO_BOT="$(cat "$TRABALHO/tokens/musica.token")"

# Os ids do aplicativo, para a prova. `applications/publicas` é a vista do
# diretório e é onde o bot tem de estar.
APP="$(docker run --rm --network "$REDE" -e T="$TOKEN_DO_ADMIN" node:22 node -e "
  fetch('http://$API_CONTAINER:3333/api/applications/publicas', {
    headers: { authorization: 'Bearer ' + process.env.T },
  })
    .then((r) => r.json())
    .then((p) => {
      const a = (p.itens || []).find((x) => x.name === 'Streamz Música');
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
  // VIEW_CHANNEL | SEND_MESSAGES | CONNECT | SPEAK — o que o bot declara.
  const permissoes = (1 << 0) | (1 << 1) | (1 << 12) | (1 << 13);
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
  -v "$RAIZ:/w" -w /w/apps/bots \
  -e BOTS=musica \
  -e STREAMZ_API_URL="http://$API_CONTAINER:3333/api" \
  -e STREAMZ_BOT_TOKEN="$TOKEN_DO_BOT" \
  -e LOG_FORMATO=texto \
  -e LAVALINK_HOST=lavalink-que-nao-existe \
  node:22 node dist/index.js >/dev/null

echo "[botmus] esperando o 'conectado' e o registro dos comandos…"
for _ in $(seq 1 60); do
  if docker logs "$BOT" 2>&1 | grep -q "comandos de barra registrados"; then break; fi
  sleep 2
done
docker logs "$BOT" 2>&1 | grep -E "conectado|comandos de barra registrados|lavalink" | head -10

echo
echo "== 6. as provas =="
docker run --rm --network "$REDE" \
  -e SEMENTE="$SEMENTE" -e APP="$APP" \
  -e API_URL="http://$API_CONTAINER:3333/api" \
  -v "$AQUI:/prova:ro" -w /tmp \
  node:22 bash -lc "
    npm install --silent --no-audit --no-fund socket.io-client@4 >/dev/null 2>&1
    cp /prova/prova-botmus.mjs .
    node prova-botmus.mjs
  "

echo
echo "== 7. com Lavalink no ar e SEM ponte de voz =="
# Este é o estado real do servidor hoje: o servidor de áudio existe, a ponte
# não (falta `voz.streamz.chat` no DNS e a 7883/udp aberta — ação do dono). O
# bot tem de dizer que a **voz** não está configurada, e não que o Lavalink
# caiu: o diagnóstico errado manda quem administra procurar no lugar errado.
#
# `PROVA_LAVALINK=0` pula este passo (a JVM come ~500 MB).
if [ "${PROVA_LAVALINK:-1}" = "1" ]; then
  docker rm -f botmus-lavalink >/dev/null 2>&1 || true
  docker run -d --name botmus-lavalink --network "$REDE" \
    -e LAVALINK_SERVER_PASSWORD=streamz \
    -e _JAVA_OPTIONS="-Xmx384m -XX:+UseSerialGC" \
    -v "$RAIZ/apps/bots/lavalink/application.yml:/opt/Lavalink/application.yml:ro" \
    --memory 640m \
    ghcr.io/lavalink-devs/lavalink:4 >/dev/null

  echo "[botmus] esperando o Lavalink (ele baixa o plugin do YouTube na 1ª subida)…"
  pronto=0
  for _ in $(seq 1 90); do
    if docker logs botmus-lavalink 2>&1 | grep -q "Lavalink is ready to accept connections"; then
      pronto=1
      break
    fi
    sleep 2
  done
  if [ "$pronto" != "1" ]; then
    echo "[botmus] o Lavalink não subiu a tempo; últimas linhas:" >&2
    docker logs --tail 20 botmus-lavalink >&2
  else
    docker rm -f "$BOT" >/dev/null 2>&1 || true
    docker run -d --name "$BOT" --network "$REDE" \
      -v "$RAIZ:/w" -w /w/apps/bots \
      -e BOTS=musica \
      -e STREAMZ_API_URL="http://$API_CONTAINER:3333/api" \
      -e STREAMZ_BOT_TOKEN="$TOKEN_DO_BOT" \
      -e LOG_FORMATO=texto \
      -e LAVALINK_HOST=botmus-lavalink \
      -e LAVALINK_SENHA=streamz \
      node:22 node dist/index.js >/dev/null

    for _ in $(seq 1 60); do
      docker logs "$BOT" 2>&1 | grep -q "lavalink conectado" && break
      sleep 2
    done
    docker logs "$BOT" 2>&1 | grep -E "conectado" | head -3

    docker run --rm --network "$REDE" \
      -e SEMENTE="$SEMENTE" -e APP="$APP" -e MODO=ponte \
      -e API_URL="http://$API_CONTAINER:3333/api" \
      -v "$AQUI:/prova:ro" -w /tmp \
      node:22 bash -lc "
        npm install --silent --no-audit --no-fund socket.io-client@4 >/dev/null 2>&1
        cp /prova/prova-botmus.mjs .
        node prova-botmus.mjs
      "
    echo "--- o log do bot no momento da recusa:"
    docker logs "$BOT" 2>&1 | grep -E "ponte de voz" | tail -3
    echo "--- o log da API (por que ela não assinou o token da ponte):"
    docker logs "$API_CONTAINER" 2>&1 | grep -E "op 4" | tail -3
  fi
else
  echo "[botmus] pulado (PROVA_LAVALINK=0)."
fi

echo
echo "== fim. Para derrubar: $AQUI/prova-botmus.sh derrubar $SUFIXO =="
