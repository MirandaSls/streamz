#!/usr/bin/env bash
# A prova do **Streamz Cargos** (`apps/bots/src/cargos`) ponta a ponta, na
# bancada descartável. Irmã da `apps/api/test/discord-compat/prova-botmus.sh`,
# com o mesmo desenho e o prefixo de contêiner trocado.
#
#   ./prova-cargos.sh [sufixo] [porta]      # padrão: botcar 3421
#   ./prova-cargos.sh derrubar [sufixo]
#
# O que ela levanta — **três** contêineres de pé, e nada mais (este servidor tem
# 6 núcleos e já caiu por OOM; nada de emulador, de Lavalink ou de ponte de voz,
# que este bot não usa):
#
#   botcar-pg     Postgres descartável
#   botcar-api    a API do Streamz, do repositório montado
#   botcar-bot    o runtime de `apps/bots` com BOTS=cargos
#
# Os passos:
#
#   0. bancada de pé, com PLATFORM_ADMIN_EMAILS na conta que vai provisionar
#   1. semeadura: dono + servidor + canal; a conta dona dos bots
#   2. os dois cargos e o **segundo usuário** — antes da instalação, para o
#      cargo do bot nascer acima dos dois (é a hierarquia que o bot exige)
#   3. build de `@streamz/bots` e `provisionar`
#   4. o dono instala o aplicativo com `MANAGE_ROLES`
#   5. o bot sobe e registra o `/painel`
#   6. `prova-cargos.mjs`: criar, adicionar, **ganhar e perder o cargo**,
#      modo único e a recusa a quem não gerencia cargos
#   7. reconciliação: a mensagem do painel é apagada e o bot reinicia — ele
#      esquece o painel e **sobe assim mesmo**
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPAT="$RAIZ/apps/api/test/discord-compat"
AQUI="$RAIZ/apps/bots"
SUFIXO="${1:-botcar}"
PORTA="${2:-3421}"

REDE="streamz-bots-$SUFIXO"
API_CONTAINER="streamz-bots-$SUFIXO-api"
BOT="botcar-bot"
TRABALHO="${TMPDIR:-/tmp}/botcar-$SUFIXO"

EMAIL_DOS_BOTS="dono-dos-bots@exemplo.invalido"
export PLATFORM_ADMIN_EMAILS="$EMAIL_DOS_BOTS"

derrubar() {
  local s="${1:-$SUFIXO}"
  docker rm -f "$BOT" >/dev/null 2>&1 || true
  "$COMPAT/ambiente.sh" derrubar "$s" >/dev/null 2>&1 || true
  rm -rf "${TMPDIR:-/tmp}/botcar-$s"
}

if [ "${1:-}" = "derrubar" ]; then
  derrubar "${2:-botcar}"
  echo "[botcar] derrubado: ${2:-botcar}"
  exit 0
fi

# Sai deixando a bancada de pé só se DEIXAR_DE_PE=1; o padrão é limpar tudo,
# porque há outras sessões neste servidor e contêiner esquecido é memória
# esquecida.
trap 'if [ "${DEIXAR_DE_PE:-0}" = "1" ]; then echo; echo "[botcar] de pé; derrube com: $AQUI/prova-cargos.sh derrubar $SUFIXO"; else echo; echo "[botcar] derrubando a bancada…"; derrubar "$SUFIXO"; fi' EXIT

mkdir -p "$TRABALHO/tokens"
chmod 700 "$TRABALHO/tokens"

echo "== 0. ambiente (admin da instância: $EMAIL_DOS_BOTS) =="
"$COMPAT/ambiente.sh" subir "$SUFIXO" "$PORTA"

echo
echo "== 1. semeadura =="
SEMENTE="$(docker exec -e API_URL=http://localhost:3333/api "$API_CONTAINER" \
  node apps/api/test/discord-compat/semear.mjs | tail -1)"
echo "$SEMENTE" | sed -E 's/"(token|accessToken)":"[^"]*"/"\1":"<oculto>"/g'

DONO_DOS_BOTS="$(docker exec \
  -e API_URL=http://localhost:3333/api -e EMAIL_DO_DONO="$EMAIL_DOS_BOTS" \
  "$API_CONTAINER" node apps/api/test/discord-compat/semear-botmus.mjs | tail -1)"
TOKEN_DO_ADMIN="$(printf '%s' "$DONO_DOS_BOTS" | sed -E 's/.*"accessToken":"([^"]*)".*/\1/')"

echo
echo "== 2. os dois cargos e o segundo usuário (antes da instalação) =="
BANCADA="$(docker run --rm --network "$REDE" \
  -v "$AQUI:/prova:ro" -w /prova \
  -e SEMENTE="$SEMENTE" -e API_URL="http://$API_CONTAINER:3333/api" \
  node:22 node preparar-cargos.mjs | tail -1)"
echo "$BANCADA" | sed -E 's/"accessToken":"[^"]*"/"accessToken":"<oculto>"/'

echo
echo "== 3. build de @streamz/bots e provisionamento =="
docker run --rm -v "$RAIZ:/w" -w /w node:22 bash -lc "
  corepack enable >/dev/null 2>&1
  pnpm --filter @streamz/shared build >/dev/null
  pnpm --filter @streamz/bots build >/dev/null
  echo 'build ok'
"

docker run --rm --network "$REDE" \
  -v "$RAIZ:/w" -v "$TRABALHO/tokens:/tokens" -w /w \
  -e STREAMZ_API_URL="http://$API_CONTAINER:3333/api" \
  -e BOTS_TOKEN="$TOKEN_DO_ADMIN" \
  -e BOTS_DIR=/tokens \
  -e LOG_FORMATO=texto \
  node:22 node apps/bots/dist/provisionar.js

echo "--- permissão do arquivo de token (tem de ser 600):"
ls -l "$TRABALHO/tokens/"
TOKEN_DO_BOT="$(cat "$TRABALHO/tokens/cargos.token")"

APP="$(docker run --rm --network "$REDE" -e T="$TOKEN_DO_ADMIN" node:22 node -e "
  fetch('http://$API_CONTAINER:3333/api/applications/publicas', {
    headers: { authorization: 'Bearer ' + process.env.T },
  })
    .then((r) => r.json())
    .then((p) => {
      const a = (p.itens || []).find((x) => x.name === 'Streamz Cargos');
      if (!a) throw new Error('o aplicativo não está no diretório');
      process.stdout.write(JSON.stringify({ id: a.id, snowflake: a.snowflake, name: a.name, botUserId: a.botUser.id }));
    });
")"
echo "aplicativo: $APP"

echo
echo "== 4. o dono instala o app com Gerenciar cargos =="
docker run --rm --network "$REDE" -e SEMENTE="$SEMENTE" -e APP="$APP" node:22 node -e "
  const s = JSON.parse(process.env.SEMENTE);
  const a = JSON.parse(process.env.APP);
  // VIEW_CHANNEL | SEND_MESSAGES | MANAGE_MESSAGES | ADD_REACTIONS | MANAGE_ROLES
  const permissoes = (1 << 0) | (1 << 1) | (1 << 2) | (1 << 10) | (1 << 4);
  fetch('http://$API_CONTAINER:3333/api/guilds/' + s.servidor.id + '/aplicativos', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + s.dono.accessToken },
    body: JSON.stringify({ applicationId: a.id, permissions: permissoes }),
  }).then(async (r) => {
    const t = await r.text();
    if (!r.ok) throw new Error(r.status + ': ' + t.slice(0, 300));
    const i = JSON.parse(t);
    console.log('instalado;', JSON.stringify({ permissions: i.permissions, cargo: i.role ?? i.cargo ?? null }));
  });
"

subir_bot() {
  docker rm -f "$BOT" >/dev/null 2>&1 || true
  docker run -d --name "$BOT" --network "$REDE" \
    -v "$RAIZ:/w" -v "$TRABALHO/dados:/dados" -w /w/apps/bots \
    -e BOTS=cargos \
    -e STREAMZ_API_URL="http://$API_CONTAINER:3333/api" \
    -e STREAMZ_BOT_TOKEN="$TOKEN_DO_BOT" \
    -e CARGOS_DIR=/dados \
    -e LOG_FORMATO=texto \
    node:22 node dist/index.js >/dev/null
  for _ in $(seq 1 60); do
    docker logs "$BOT" 2>&1 | grep -q "painéis reconciliados" && return 0
    sleep 2
  done
  echo "[botcar] o bot não subiu a tempo:" >&2
  docker logs --tail 30 "$BOT" >&2
  return 1
}

echo
echo "== 5. o bot sobe =="
mkdir -p "$TRABALHO/dados"
subir_bot
docker logs "$BOT" 2>&1 | grep -E "conectado|comandos de barra registrados|painéis reconciliados" | head -5 || true

echo
echo "== 6. as provas =="
SAIDA="$TRABALHO/prova.txt"
set +e
docker run --rm --network "$REDE" \
  -e SEMENTE="$SEMENTE" -e BANCADA="$BANCADA" -e APP="$APP" \
  -e TOKEN_DO_BOT="$TOKEN_DO_BOT" \
  -e API_URL="http://$API_CONTAINER:3333/api" \
  -v "$AQUI:/prova:ro" -w /tmp \
  node:22 bash -lc "
    npm install --silent --no-audit --no-fund socket.io-client@4 >/dev/null 2>&1
    cp /prova/prova-cargos.mjs .
    node prova-cargos.mjs
  " | tee "$SAIDA"
RESULTADO=${PIPESTATUS[0]}
set -e

echo
echo "--- o log do bot no momento em que deu e tirou o cargo:"
docker logs "$BOT" 2>&1 | grep -E "cargo dado|cargo tirado|recusada|members/:uid/roles" | head -10 || true
echo "--- (as últimas linhas do log do bot, para o caso de algo ter falhado):"
docker logs --tail 12 "$BOT" 2>&1

echo
echo "--- o arquivo de estado no volume (nada disso está no banco do Streamz):"
docker run --rm -v "$TRABALHO/dados:/dados:ro" node:22 bash -lc 'ls -l /dados && cat /dados/*.json' || true

echo
echo "== 7. reconciliação: o painel some e o bot sobe assim mesmo =="
# A mensagem do painel já foi apagada pelo próprio `prova-cargos.mjs`, pelo
# socket.io do dono (é o caminho do navegador; não há rota REST interna de
# apagar mensagem). Aqui só reiniciamos o bot e vemos o que ele faz com um
# painel cuja mensagem não existe mais.
PAINEL_INTERNO="$(grep -oE 'PAINEL_INTERNO=.*' "$SAIDA" | tail -1 | cut -d= -f2)"
if [ -n "$PAINEL_INTERNO" ]; then
  subir_bot
  echo "--- o que o bot disse ao subir sem a mensagem do painel:"
  docker logs "$BOT" 2>&1 | grep -E "painéis esquecidos|painéis reconciliados" | tail -3 || true
  if docker logs "$BOT" 2>&1 | grep -q '"esquecidos":1\|esquecidos=1\|esquecidos: 1'; then
    echo "OK   7. o painel morto foi esquecido e o bot subiu"
  else
    docker logs "$BOT" 2>&1 | grep -E "reconciliados" | tail -1 || true
  fi
  echo "--- o estado depois da reconciliação (o arquivo some quando fica vazio):"
  docker run --rm -v "$TRABALHO/dados:/dados:ro" node:22 bash -lc 'ls -l /dados' || true
else
  echo "[botcar] sem id de painel; passo 7 pulado."
fi

echo
if [ "$RESULTADO" = "0" ]; then
  echo "== fim: a prova passou =="
else
  echo "== fim: A PROVA FALHOU (veja acima) ==" >&2
fi
exit "$RESULTADO"
