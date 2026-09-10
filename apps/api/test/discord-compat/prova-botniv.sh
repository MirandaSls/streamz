#!/usr/bin/env bash
# A prova do **Streamz Níveis** (`apps/bots/src/niveis`) ponta a ponta, na
# bancada descartável. Irmã de `prova-botmus.sh`, mesmo desenho.
#
#   ./prova-botniv.sh [sufixo] [porta]       # padrão: botniv 3431
#   ./prova-botniv.sh derrubar [sufixo]
#
# O que ela levanta (três contêineres, e só: este servidor tem 6 núcleos e já
# caiu por OOM):
#
#   pg + api        o Streamz descartável, pelo `ambiente.sh` de sempre
#   botniv-bot      o runtime de `apps/bots` com BOTS=niveis
#
# **Nada de emulador, nada de Lavalink, nada de ponte de voz**: um bot de níveis
# não toca em voz. O que sobra é exatamente o que ele faz.
#
# Os passos:
#
#   0. bancada de pé, com PLATFORM_ADMIN_EMAILS na conta que vai provisionar
#   1. semeadura: o dono comum + servidor + canais; e a conta dona dos bots
#   2. build de `@streamz/bots`
#   3. `provisionar`: cria a Application, grava o token (chmod 600), publica e
#      marca como oficial
#   4. o dono do servidor instala o app
#   5. o bot sobe — com a carência **encolhida** (ver abaixo) e o volume de
#      dados montado num diretório do host, para dar para olhar o JSON
#   6. `prova-botniv.mjs`: diretório, comandos, carência, /nivel, cargo por
#      nível, anúncio de subida, ranking e a recusa efêmera do /dar-xp
#   7. o estado no disco: o JSON do servidor, e o XP **sobrevivendo a um
#      restart** (é a prova da política de escrita: memória + flush no SIGTERM)
#
# ## A carência
#
# O padrão do bot é 60 s entre ganhos. A prova sobe com `NIVEIS_CARENCIA_MS`
# curto porque precisa mostrar dois ganhos seguidos, e esperar um minuto por
# ganho tornaria a bancada inútil — mesmo espírito do `THROTTLE_DISABLED` que a
# API usa aqui. A **regra** continua sendo exercitada: o passo 3 manda seis
# mensagens em um segundo e cobra que só uma tenha pontuado.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
AQUI="$RAIZ/apps/api/test/discord-compat"
SUFIXO="${1:-botniv}"
PORTA="${2:-3431}"

REDE="streamz-bots-$SUFIXO"
API_CONTAINER="streamz-bots-$SUFIXO-api"
BOT="botniv-bot"
TRABALHO="${TMPDIR:-/tmp}/botniv-$SUFIXO"
CARENCIA_MS="${CARENCIA_MS:-8000}"

EMAIL_DOS_BOTS="dono-dos-bots@exemplo.invalido"
export PLATFORM_ADMIN_EMAILS="$EMAIL_DOS_BOTS"

derrubar() {
  local s="${1:-$SUFIXO}"
  docker rm -f "botniv-bot" >/dev/null 2>&1 || true
  "$AQUI/ambiente.sh" derrubar "$s" >/dev/null 2>&1 || true
  rm -rf "${TMPDIR:-/tmp}/botniv-$s"
}

if [ "${1:-}" = "derrubar" ]; then
  derrubar "${2:-botniv}"
  echo "[botniv] derrubado: ${2:-botniv}"
  exit 0
fi

trap 'echo; echo "[botniv] para derrubar: $AQUI/prova-botniv.sh derrubar $SUFIXO"' EXIT

# Bancada nova, dados novos: sobra de uma execução anterior faria o passo 7
# somar o XP de outro servidor e a conta não fecharia.
rm -rf "$TRABALHO"
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
echo "== 3. provisionamento (cria a Application, grava o token, publica) =="
docker run --rm --network "$REDE" \
  -v "$RAIZ:/w" -v "$TRABALHO/tokens:/tokens" -w /w \
  -e STREAMZ_API_URL="http://$API_CONTAINER:3333/api" \
  -e BOTS_TOKEN="$TOKEN_DO_ADMIN" \
  -e BOTS_DIR=/tokens \
  -e LOG_FORMATO=texto \
  node:22 node apps/bots/dist/provisionar.js 2>&1 | grep -iE "niveis|Níveis|token gravado|oficial|ícone" || true

echo "--- permissão do arquivo de token (tem de ser 600):"
ls -l "$TRABALHO/tokens/niveis.token"
TOKEN_DO_BOT="$(cat "$TRABALHO/tokens/niveis.token")"

APP="$(docker run --rm --network "$REDE" -e T="$TOKEN_DO_ADMIN" node:22 node -e "
  fetch('http://$API_CONTAINER:3333/api/applications/publicas', {
    headers: { authorization: 'Bearer ' + process.env.T },
  })
    .then((r) => r.json())
    .then((p) => {
      const a = (p.itens || []).find((x) => x.name === 'Streamz Níveis');
      if (!a) throw new Error('o aplicativo não está no diretório');
      process.stdout.write(JSON.stringify({ id: a.id, snowflake: a.snowflake, name: a.name, botUserId: a.botUser.id }));
    });
")"
echo "aplicativo: $APP"

echo
echo "== 4. o dono do servidor instala o app =="
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

subir_o_bot() {
  docker rm -f "$BOT" >/dev/null 2>&1 || true
  docker run -d --name "$BOT" --network "$REDE" \
    -v "$RAIZ:/w" -v "$TRABALHO/dados:/dados" -w /w/apps/bots \
    -e BOTS=niveis \
    -e STREAMZ_API_URL="http://$API_CONTAINER:3333/api" \
    -e STREAMZ_BOT_TOKEN="$TOKEN_DO_BOT" \
    -e NIVEIS_DIR=/dados \
    -e NIVEIS_CARENCIA_MS="$CARENCIA_MS" \
    -e LOG_FORMATO=texto \
    node:22 node dist/index.js >/dev/null

  for _ in $(seq 1 60); do
    if docker logs "$BOT" 2>&1 | grep -q "comandos de barra registrados"; then break; fi
    sleep 2
  done
}

echo
echo "== 5. o bot sobe (carência encolhida para ${CARENCIA_MS} ms) =="
subir_o_bot
docker logs "$BOT" 2>&1 | grep -E "conectado|comandos de barra registrados|contagem de XP|estado dos níveis" | head -10

echo
echo "== 6. as provas =="
docker run --rm --network "$REDE" \
  -e SEMENTE="$SEMENTE" -e APP="$APP" -e CARENCIA_MS="$CARENCIA_MS" \
  -e API_URL="http://$API_CONTAINER:3333/api" \
  -v "$AQUI:/prova:ro" -w /tmp \
  node:22 bash -lc "
    npm install --silent --no-audit --no-fund socket.io-client@4 >/dev/null 2>&1
    cp /prova/prova-botniv.mjs .
    node prova-botniv.mjs
  " && RESULTADO=0 || RESULTADO=$?

echo
echo "== 7. o estado no disco, e a política de escrita =="
echo "--- o que o bot tentou fazer com o cargo (a dependência declarada):"
docker logs "$BOT" 2>&1 | grep -E "rota de cargos|cargo por nível" | tail -3
echo
echo "--- os arquivos do volume (um JSON por servidor, nada de .tmp para trás):"
ls -l "$TRABALHO/dados"
echo
echo "--- o conteúdo (formato { versao, config, usuarios }):"
head -40 "$TRABALHO/dados"/*.json

# O flush do desligamento: `docker stop` manda SIGTERM, o runtime chama o
# `aoDesligar`, e o `aoDesligar` grava. Se esta parte estivesse errada, o XP do
# último meio minuto sumiria a cada `docker compose restart`.
#
# O XP no disco depois do SIGTERM tem de ser **pelo menos** o de antes: o
# estado vive em memória entre as gravações, então o flush do desligamento só
# pode acrescentar. Menos que isso seria XP perdido — que é exatamente o defeito
# que o `aoDesligar` existe para não ter.
somaDoXp() { grep -ho '"xp": [0-9]*' "$TRABALHO/dados"/*.json | awk '{ s += $2 } END { print s + 0 }'; }

echo
echo "--- XP total no disco antes do SIGTERM: $(somaDoXp)"
ANTES="$(somaDoXp)"
echo "[botniv] parando o bot (SIGTERM) e subindo de novo…"
docker stop "$BOT" >/dev/null
docker logs "$BOT" 2>&1 | grep -E "desligando|gravado no desligamento|desligado" | tail -3
DEPOIS="$(somaDoXp)"
echo "--- XP total no disco depois do desligamento limpo: $DEPOIS"
subir_o_bot
echo "--- e o bot novo releu o arquivo:"
docker logs "$BOT" 2>&1 | grep -E "estado dos níveis pronto|contagem de XP" | head -2
if [ "$DEPOIS" -ge "$ANTES" ] && [ "$DEPOIS" -gt 0 ]; then
  echo "OK   7. o flush do desligamento gravou tudo (nada de XP perdido no restart)"
else
  echo "FALHA 7. o XP encolheu no desligamento ($ANTES → $DEPOIS)"
  RESULTADO=1
fi

echo
echo "== fim. Para derrubar: $AQUI/prova-botniv.sh derrubar $SUFIXO =="
exit "$RESULTADO"
