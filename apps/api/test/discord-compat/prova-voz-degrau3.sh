#!/usr/bin/env bash
# Degrau 3 da F2 (§6 do CONTRATO-F2.md), ponta a ponta e **tudo descartável**:
#
#   `@discordjs/voice` sozinho (sem bot) → ponte-voz → LiveKit,
#   e o participante `bot:` aparecendo em `lk room participants list`.
#
#   ./prova-voz-degrau3.sh            # sobe, prova, derruba
#   MANTER=1 ./prova-voz-degrau3.sh   # deixa tudo de pé para bisbilhotar
#   ./prova-voz-degrau3.sh derrubar   # limpa os contêineres de uma corrida presa
#
# Nada aqui encosta em produção: LiveKit de brinquedo com a chave `devkey`,
# rede própria, certificado auto-assinado para o nome de teste `voz.teste`.
# **Nunca aponte para o LiveKit de produção.**
#
# Por que existe um terminador TLS no meio: o `@discordjs/voice` **fixa `wss://`
# no código** (`dist/index.js`: ``new VoiceWebSocket(`wss://${endpoint}?v=8`)``),
# então um `ws://` local nunca seria tentado. Em produção quem termina o TLS é o
# Traefik e a ponte continua falando HTTP puro — este nginx é o Traefik de
# mentira da prova.
set -euo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(cd "$AQUI/../../../.." && pwd)"

SUFIXO="${SUFIXO:-a2}"
REDE="prova-voz-$SUFIXO"
SUBREDE="${SUBREDE:-172.31.77.0/24}"
IP_LK="${IP_LK:-172.31.77.10}"
IP_PONTE="${IP_PONTE:-172.31.77.20}"
IP_TLS="${IP_TLS:-172.31.77.30}"

LK="prova-voz-$SUFIXO-livekit"
PONTE="prova-voz-$SUFIXO-ponte"
TLS="prova-voz-$SUFIXO-tls"
CLIENTE="prova-voz-$SUFIXO-cliente"
IMAGEM="ponte-voz-prova-$SUFIXO"

SALA="${SALA:-voice:prova-degrau3}"
SEGREDO="${PONTE_VOZ_SEGREDO:-segredo-de-brinquedo-do-degrau3}"
LK_KEY=devkey
LK_SECRET=secret
SEGUNDOS="${SEGUNDOS:-25}"

derrubar() {
  docker rm -f "$CLIENTE" "$TLS" "$PONTE" "$LK" >/dev/null 2>&1 || true
  docker network rm "$REDE" >/dev/null 2>&1 || true
}

if [[ "${1:-}" == "derrubar" ]]; then
  derrubar
  echo "[prova] tudo derrubado"
  exit 0
fi

TRABALHO="${TRABALHO:-$(mktemp -d)}"
echo "[prova] diretório de trabalho: $TRABALHO"

if [[ -z "${MANTER:-}" ]]; then
  trap derrubar EXIT
fi

derrubar
docker network create --subnet "$SUBREDE" "$REDE" >/dev/null

# ── 1. certificado de brinquedo para `voz.teste` ─────────────
echo "[prova] gerando a CA e o certificado de voz.teste"
mkdir -p "$TRABALHO/certs"
openssl req -x509 -newkey rsa:2048 -nodes -days 2 \
  -subj "/CN=CA da prova do degrau 3" \
  -keyout "$TRABALHO/certs/ca.key" -out "$TRABALHO/certs/ca.crt" 2>/dev/null
openssl req -newkey rsa:2048 -nodes \
  -subj "/CN=voz.teste" \
  -keyout "$TRABALHO/certs/voz.teste.key" -out "$TRABALHO/certs/voz.teste.csr" 2>/dev/null
openssl x509 -req -in "$TRABALHO/certs/voz.teste.csr" -days 2 \
  -CA "$TRABALHO/certs/ca.crt" -CAkey "$TRABALHO/certs/ca.key" -CAcreateserial \
  -extfile <(printf 'subjectAltName=DNS:voz.teste\nbasicConstraints=CA:FALSE\n') \
  -out "$TRABALHO/certs/voz.teste.crt" 2>/dev/null
chmod 644 "$TRABALHO/certs/"*

# ── 2. o `.ogg` (Opus de 20 ms, 48 kHz, estéreo — como o Lavalink entrega) ──
if [[ ! -f "$TRABALHO/audio.ogg" ]]; then
  echo "[prova] gerando o .ogg com ffmpeg em contêiner"
  docker run --rm -v "$TRABALHO:/saida" alpine:latest sh -c '
    apk add --no-cache ffmpeg >/dev/null 2>&1
    ffmpeg -v error -f lavfi -i "sine=frequency=440:sample_rate=48000:duration=8" \
      -af "aformat=channel_layouts=stereo" \
      -c:a libopus -b:a 96k -frame_duration 20 -f ogg /saida/audio.ogg
  '
  chmod 644 "$TRABALHO/audio.ogg"
fi
ls -l "$TRABALHO/audio.ogg"

# ── 3. LiveKit descartável ───────────────────────────────────
echo "[prova] subindo o LiveKit de brinquedo"
docker run -d --name "$LK" --network "$REDE" --ip "$IP_LK" \
  livekit/livekit-server:latest \
  --dev --bind 0.0.0.0 --node-ip "$IP_LK" --keys "$LK_KEY: $LK_SECRET" >/dev/null
for _ in $(seq 1 60); do
  docker logs "$LK" 2>&1 | grep -q "starting LiveKit server" && break
  sleep 1
done

# ── 4. a ponte, compilada desta branch ───────────────────────
#
# O lote A1 (cripto + UDP) pode ainda estar em `panic` na branch: se estiver, a
# prova sobrepõe as três peças provisórias de `a1-provisorio/` **só na árvore
# temporária** — `apps/ponte-voz/` no repo não é tocado. Quando o A1 entrar, a
# condição fica falsa sozinha e a prova roda contra o código de verdade.
echo "[prova] montando a árvore de build da ponte"
rm -rf "$TRABALHO/ctx"
mkdir -p "$TRABALHO/ctx/apps"
cp -r "$RAIZ/apps/ponte-voz" "$TRABALHO/ctx/apps/ponte-voz"
rm -f "$TRABALHO/ctx/apps/ponte-voz/ponte-voz"
if grep -q 'panic("F2 lote A1' "$TRABALHO/ctx/apps/ponte-voz/cripto.go"; then
  echo "[prova] AVISO: o lote A1 ainda está em panic; usando a1-provisorio/ SÓ para esta prova"
  cp "$AQUI/a1-provisorio/"*.go "$TRABALHO/ctx/apps/ponte-voz/"
else
  echo "[prova] o lote A1 está implementado na branch; a prova usa o código de verdade"
fi

docker build -q -f "$TRABALHO/ctx/apps/ponte-voz/Dockerfile" -t "$IMAGEM" "$TRABALHO/ctx" >/dev/null
echo "[prova] subindo a ponte"
docker run -d --name "$PONTE" --network "$REDE" --ip "$IP_PONTE" \
  -e PONTE_VOZ_PORTA_WS=8080 \
  -e PONTE_VOZ_PORTA_UDP=7883 \
  -e PONTE_VOZ_IP_PUBLICO="$IP_PONTE" \
  -e PONTE_VOZ_SEGREDO="$SEGREDO" \
  "$IMAGEM" --dump-pacote >/dev/null

# ── 5. o "Traefik" da prova ──────────────────────────────────
cat >"$TRABALHO/nginx.conf" <<NGINX
events {}
http {
  map \$http_upgrade \$conexao_upgrade { default upgrade; '' close; }
  server {
    listen 443 ssl;
    server_name voz.teste;
    ssl_certificate     /certs/voz.teste.crt;
    ssl_certificate_key /certs/voz.teste.key;
    location / {
      proxy_pass http://$IP_PONTE:8080;
      proxy_http_version 1.1;
      proxy_set_header Upgrade \$http_upgrade;
      proxy_set_header Connection \$conexao_upgrade;
      proxy_set_header Host \$host;
      proxy_read_timeout 3600s;
    }
  }
}
NGINX
docker run -d --name "$TLS" --network "$REDE" --ip "$IP_TLS" \
  -v "$TRABALHO/nginx.conf:/etc/nginx/nginx.conf:ro" \
  -v "$TRABALHO/certs:/certs:ro" \
  nginx:alpine >/dev/null

sleep 2
echo "[prova] saúde da ponte:"
docker run --rm --network "$REDE" alpine:latest \
  wget -qO- "http://$IP_PONTE:8080/saude" || echo "  (a ponte não respondeu /saude)"

# ── 6. o cliente: @discordjs/voice sozinho ───────────────────
echo "[prova] rodando o @discordjs/voice (node:22)"
docker run -d --name "$CLIENTE" --network "$REDE" \
  --add-host "voz.teste:$IP_TLS" \
  -v "$TRABALHO:/prova" \
  -v "$AQUI:/script:ro" \
  -e NODE_EXTRA_CA_CERTS=/prova/certs/ca.crt \
  -e PONTE_ENDPOINT=voz.teste \
  -e PONTE_VOZ_SEGREDO="$SEGREDO" \
  -e LIVEKIT_URL="ws://$IP_LK:7880" \
  -e LIVEKIT_API_KEY="$LK_KEY" \
  -e LIVEKIT_API_SECRET="$LK_SECRET" \
  -e SALA="$SALA" \
  -e OGG=/prova/audio.ogg \
  -e SEGUNDOS="$SEGUNDOS" \
  -w /prova \
  node:22 bash -lc '
    npm install --no-audit --no-fund --silent @discordjs/voice@0.19.2 prism-media libsodium-wrappers >/dev/null 2>&1
    # O script tem de rodar ao lado do node_modules: o ESM resolve o pacote
    # subindo a partir do diretório **do arquivo**, não do cwd.
    cp /script/prova-voz-degrau3.mjs /prova/
    exec node /prova/prova-voz-degrau3.mjs
  ' >/dev/null

# ── 7. a conferência ─────────────────────────────────────────
echo "[prova] esperando o participante aparecer na sala…"
achou=""
for _ in $(seq 1 40); do
  sleep 3
  saida="$(docker run --rm --network "$REDE" \
    -e LIVEKIT_URL="http://$IP_LK:7880" \
    -e LIVEKIT_API_KEY="$LK_KEY" -e LIVEKIT_API_SECRET="$LK_SECRET" \
    livekit/livekit-cli:latest room participants list "$SALA" 2>&1 || true)"
  if grep -q "bot:" <<<"$saida"; then
    achou="$saida"
    break
  fi
done

echo
echo "══════ lk room participants list $SALA ══════"
if [[ -n "$achou" ]]; then
  echo "$achou"
else
  echo "$saida"
fi
echo "═══════════════════════════════════════════════════"
echo

echo "── log do cliente (@discordjs/voice) ──"
docker logs "$CLIENTE" 2>&1 | tail -40
echo
echo "── log da ponte ──"
docker logs "$PONTE" 2>&1 | tail -60

if [[ -z "$achou" ]]; then
  echo
  echo "[prova] FALHOU: nenhum participante bot: na sala"
  exit 1
fi
echo
echo "[prova] OK: o participante bot: está na sala do LiveKit"
