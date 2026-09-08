#!/usr/bin/env bash
# Os degraus 2, 3 e 4 da F2 (§12 do documento), num comando.
#
#   ./prova-voz.sh [sufixo] [segundos-de-medicao]     # padrão: voz 180
#
# O degrau 1 (unitário, cripto) é `go test ./...` em `apps/ponte-voz` e roda
# sozinho — se ele falhar, nada aqui adiante funciona e não vale subir nada.
#
# O que este script levanta, tudo descartável e tudo numa rede própria:
#
#   pg + api      o Streamz (o mesmo caminho do `ambiente.sh` da F1)
#   livekit       um LiveKit de brinquedo — NUNCA o de produção
#   ponte         a ponte de voz, com IP fixo na rede (o READY.ip precisa dele)
#   voz.teste     nginx terminando TLS na frente da ponte (é o Traefik de mentira)
#   musica        nginx servindo o mp3 de 4 min gerado pelo `voz/preparar.sh`
#   lavalink      Lavalink v4, só com a fonte `http`
#   bot           discord.js + shoukaku, apontados para o Streamz
#   ouvinte       cliente Go que entra na sala e MEDE o que chega
#
# **Por que existe um terminador TLS numa prova local**: o `@discordjs/voice`
# fixa `wss://${endpoint}` no código (0.19.2, `dist/index.js:1424`) e o koe do
# Lavalink faz o mesmo. Não há como apontar um bot para `ws://`. Em produção
# quem termina o TLS é o Traefik e a ponte continua falando HTTP puro por
# dentro (§D5.5) — o nginx daqui faz exatamente o papel dele.
#
# Nada disto encosta em produção: rede própria, nomes com sufixo, `docker rm`
# leva tudo junto.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
AQUI="$RAIZ/apps/api/test/discord-compat"
SUFIXO="${1:-voz}"
SEGUNDOS="${2:-180}"

REDE="streamz-voz-$SUFIXO"
SUBREDE="172.31.77.0/24"
IP_DA_PONTE="172.31.77.10"
PG="streamz-voz-$SUFIXO-pg"
API="streamz-voz-$SUFIXO-api"
LK="streamz-voz-$SUFIXO-livekit"
PONTE="streamz-voz-$SUFIXO-ponte"
TLS="streamz-voz-$SUFIXO-tls"
MUSICA="streamz-voz-$SUFIXO-musica"
LAVA="streamz-voz-$SUFIXO-lavalink"
TRABALHO="${TMPDIR:-/tmp}/streamz-voz-$SUFIXO"

# Segredos de brinquedo. Precisam de 16+ caracteres e de serem diferentes entre
# si (é o que o `validateEnv` da API exige). O do LiveKit precisa de 32+.
SENHA_PG="descartavel"
JWT_SECRET="prova-de-voz-do-discord-1"
JWT_REFRESH_SECRET="prova-de-voz-do-discord-2"
LIVEKIT_API_KEY="devkey"
LIVEKIT_API_SECRET="segredo-de-brinquedo-do-livekit-para-a-prova"
PONTE_VOZ_SEGREDO="segredo-de-brinquedo-da-ponte-de-voz"
SENHA_LAVALINK="senha-de-teste"

derrubar() {
  docker rm -f "$PG" "$API" "$LK" "$PONTE" "$TLS" "$MUSICA" "$LAVA" >/dev/null 2>&1 || true
  docker network rm "$REDE" >/dev/null 2>&1 || true
}

if [ "${1:-}" = "derrubar" ]; then
  SUFIXO="${2:-voz}"
  derrubar
  echo "[voz] derrubado."
  exit 0
fi

esperar() { # <descrição> <comando…>
  local o="$1"
  shift
  for _ in $(seq 1 120); do
    if "$@" >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  echo "[voz] $o não ficou pronto" >&2
  return 1
}

echo "== 0. artefatos (certificados, truststore, música) =="
"$AQUI/voz/preparar.sh" "$TRABALHO"

echo
echo "== 1. rede e infraestrutura =="
derrubar
docker network create --subnet "$SUBREDE" "$REDE" >/dev/null

docker run -d --name "$PG" --network "$REDE" \
  -e POSTGRES_PASSWORD="$SENHA_PG" -e POSTGRES_DB=streamz \
  postgres:16-alpine >/dev/null
esperar "o Postgres" docker exec "$PG" pg_isready -U postgres

# LiveKit de brinquedo. `--dev` não serve: precisamos da chave que a API assina.
docker run -d --name "$LK" --network "$REDE" \
  -e "LIVEKIT_KEYS=$LIVEKIT_API_KEY: $LIVEKIT_API_SECRET" \
  livekit/livekit-server:latest --bind 0.0.0.0 >/dev/null
esperar "o LiveKit" docker exec "$LK" wget -q -O- http://localhost:7880

# O mp3 e a ponte, servidos por nginx. `voz.teste` é um alias de rede: é assim
# que o bot e o Lavalink resolvem o nome do certificado sem `/etc/hosts`.
docker run -d --name "$MUSICA" --network "$REDE" --network-alias musica \
  -v "$TRABALHO/musica.mp3:/usr/share/nginx/html/musica.mp3:ro" \
  nginx:alpine >/dev/null

echo
echo "== 2. a API (leva ~2 min na primeira vez) =="
docker run -d --name "$API" --network "$REDE" --network-alias api \
  -v "$RAIZ:/w" -w /w \
  -e DATABASE_URL="postgresql://postgres:$SENHA_PG@$PG:5432/streamz?schema=public" \
  -e JWT_SECRET="$JWT_SECRET" -e JWT_REFRESH_SECRET="$JWT_REFRESH_SECRET" \
  -e LIVEKIT_URL="ws://$LK:7880" \
  -e LIVEKIT_API_KEY="$LIVEKIT_API_KEY" -e LIVEKIT_API_SECRET="$LIVEKIT_API_SECRET" \
  -e PONTE_VOZ_SEGREDO="$PONTE_VOZ_SEGREDO" \
  -e PONTE_VOZ_ENDPOINT="voz.teste" \
  -e THROTTLE_DISABLED=1 -e CI=1 \
  node:22 bash -lc "
    corepack enable
    pnpm install --frozen-lockfile
    pnpm --filter @streamz/shared build
    pnpm --filter @streamz/api exec prisma generate
    pnpm --filter @streamz/api exec prisma migrate deploy
    pnpm --filter @streamz/api exec nest start
  " >/dev/null
esperar "a API" docker exec "$API" curl -sf http://localhost:3333/api/health

echo
echo "== 3. semeadura (dono, servidor, canal de voz, bot) =="
SEMENTE="$(docker exec -e API_URL=http://localhost:3333/api "$API" \
  node apps/api/test/discord-compat/semear.mjs | tail -1)"
echo "$SEMENTE" | sed -E 's/"token":"[^"]*"/"token":"<oculto>"/'

# O `semear.mjs` da F1 semeia canal de texto. Se o lote B já tiver acrescentado
# o canal de voz, usamos o dele; senão, criamos um aqui — a prova não pode
# depender de qual das duas versões está na árvore.
CANAL_DE_VOZ="$(docker exec -e SEMENTE="$SEMENTE" "$API" node -e '
const s = JSON.parse(process.env.SEMENTE);
if (s.canalDeVoz?.snowflake) { console.log(JSON.stringify(s.canalDeVoz)); process.exit(0); }
const { PrismaClient } = require("@prisma/client");
(async () => {
  const r = await fetch("http://localhost:3333/api/guilds/" + s.servidor.id + "/channels", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + s.dono.accessToken },
    body: JSON.stringify({ name: "voz-da-prova", type: "VOICE" }),
  });
  if (!r.ok) { console.error(await r.text()); process.exit(1); }
  const canal = await r.json();
  const prisma = new PrismaClient();
  const linha = await prisma.channel.findUnique({ where: { id: canal.id }, select: { snowflake: true } });
  await prisma.$disconnect();
  console.log(JSON.stringify({ id: canal.id, snowflake: linha.snowflake.toString(), name: canal.name }));
})();
' | tail -1)"
echo "[voz] canal de voz: $CANAL_DE_VOZ"
CANAL_ID="$(echo "$CANAL_DE_VOZ" | sed -E 's/.*"id":"([^"]*)".*/\1/')"
CANAL_SF="$(echo "$CANAL_DE_VOZ" | sed -E 's/.*"snowflake":"([^"]*)".*/\1/')"
SALA="voice:$CANAL_ID"

echo
echo "== 4. a ponte de voz =="
docker build -q -t "streamz-ponte-voz:$SUFIXO" -f "$RAIZ/apps/ponte-voz/Dockerfile" "$RAIZ" >/dev/null
docker run -d --name "$PONTE" --network "$REDE" --ip "$IP_DA_PONTE" --network-alias ponte \
  -e PONTE_VOZ_PORTA_WS=8080 \
  -e PONTE_VOZ_PORTA_UDP=7883 \
  -e PONTE_VOZ_IP_PUBLICO="$IP_DA_PONTE" \
  -e PONTE_VOZ_SEGREDO="$PONTE_VOZ_SEGREDO" \
  -e API_INTERNA_URL="http://api:3333" \
  "streamz-ponte-voz:$SUFIXO" >/dev/null

docker run -d --name "$TLS" --network "$REDE" --network-alias voz.teste \
  -v "$AQUI/voz/nginx.conf:/etc/nginx/nginx.conf:ro" \
  -v "$TRABALHO:/certs:ro" \
  nginx:alpine >/dev/null
esperar "o TLS da ponte" docker exec "$TLS" wget -q --no-check-certificate -O- https://localhost/saude

echo
echo "== degrau 2: descoberta de IP por UDP (74 bytes) =="
# O pedido: tipo 0x0001, tamanho 70, ssrc 1, resto zero. A resposta tem que
# trazer o IP de ORIGEM como a ponte o viu — e é isso que o NAT do bot precisa.
docker run --rm --network "$REDE" -v "$TRABALHO:/t" alpine:latest sh -c "
  apk add --no-cache netcat-openbsd xxd >/dev/null 2>&1
  printf '\\x00\\x01\\x00\\x46\\x00\\x00\\x00\\x01' > /tmp/p
  dd if=/dev/zero bs=1 count=66 >> /tmp/p 2>/dev/null
  nc -u -w 3 $IP_DA_PONTE 7883 < /tmp/p | xxd | head -6
" || echo "[voz] ATENÇÃO: a descoberta de IP não respondeu"

echo
echo "== 5. Lavalink v4 =="
docker run -d --name "$LAVA" --network "$REDE" --network-alias lavalink \
  -v "$AQUI/voz/application.yml:/opt/Lavalink/application.yml:ro" \
  -v "$TRABALHO/truststore.jks:/certs/truststore.jks:ro" \
  -e "JAVA_TOOL_OPTIONS=-Djavax.net.ssl.trustStore=/certs/truststore.jks -Djavax.net.ssl.trustStorePassword=changeit" \
  ghcr.io/lavalink-devs/lavalink:4 >/dev/null
esperar "o Lavalink" docker exec "$LAVA" sh -c "wget -q -O- --header='Authorization: $SENHA_LAVALINK' http://localhost:2333/v4/info"

echo
echo "== 6. o ouvinte entra na sala e começa a medir =="
TOKEN_OUVINTE="$(docker exec -e SALA="$SALA" "$API" node -e '
const { AccessToken } = require("livekit-server-sdk");
(async () => {
  const at = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
    identity: "ouvinte-da-prova", ttl: "1h",
  });
  at.addGrant({ room: process.env.SALA, roomJoin: true, canPublish: false, canSubscribe: true });
  console.log(await at.toJwt());
})();
' | tail -1)"

docker run -d --name "streamz-voz-$SUFIXO-ouvinte" --network "$REDE" \
  -v "$AQUI/ouvinte-livekit:/w" -w /w \
  -e OUVINTE_URL="ws://$LK:7880" -e OUVINTE_TOKEN="$TOKEN_OUVINTE" \
  -e OUVINTE_SEGUNDOS="$SEGUNDOS" \
  golang:1.26 go run . >/dev/null

echo
echo "== degraus 3 e 4: o bot toca e o som tem que chegar =="
docker run --rm --network "$REDE" \
  -e SEMENTE="$SEMENTE" \
  -e API_URL="http://api:3333/api" \
  -e CANAL_DE_VOZ="$CANAL_SF" \
  -e LAVALINK_HOST="lavalink:2333" \
  -e LAVALINK_SENHA="$SENHA_LAVALINK" \
  -e MUSICA="http://musica/musica.mp3" \
  -e SEGUNDOS="$((SEGUNDOS + 20))" \
  -e NODE_EXTRA_CA_CERTS=/certs/ca.pem \
  -v "$TRABALHO:/certs:ro" -v "$AQUI/voz:/prova:ro" -w /tmp \
  node:22 bash -lc "
    npm install --silent --no-audit --no-fund discord.js@14 shoukaku@4 >/dev/null 2>&1
    cp /prova/bot-de-musica.mjs .
    node bot-de-musica.mjs
  " || echo "[voz] o bot terminou com erro — veja o log acima e o da ponte"

echo
echo "== a medição do ouvinte =="
docker logs "streamz-voz-$SUFIXO-ouvinte" 2>&1 | tail -20
docker rm -f "streamz-voz-$SUFIXO-ouvinte" >/dev/null 2>&1 || true

echo
echo "== log da ponte (últimas 40 linhas) =="
docker logs "$PONTE" 2>&1 | tail -40

echo
echo "== fim. Para derrubar: $0 derrubar $SUFIXO =="
