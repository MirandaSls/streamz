#!/usr/bin/env bash
# Prepara os artefatos do degrau 4 que não dependem de nada estar de pé:
# os certificados do TLS de teste e a música.
#
#   ./preparar.sh <diretório de trabalho>
#
# **Por que existe TLS numa prova local.** O `@discordjs/voice` monta a URL do
# voice gateway assim, e o esquema é **fixo** (medido em 0.19.2,
# `dist/index.js:1424`):
#
#     const ws = new VoiceWebSocket(`wss://${endpoint}?v=8`, …)
#
# Ou seja: não existe apontar um bot para `ws://`. Em produção quem termina o
# TLS é o Traefik e a ponte continua falando HTTP puro por dentro (§D5.5); na
# prova, quem termina é um nginx da rede de teste com um certificado nosso, e
# os clientes precisam confiar na nossa CA — o Node por `NODE_EXTRA_CA_CERTS`,
# a JVM do Lavalink por um truststore, porque a JVM não tem "confie em tudo".
#
# O documento não menciona isso em lugar nenhum, e é a primeira parede em que
# qualquer um esbarra ao testar a ponte.
set -euo pipefail

TRABALHO="${1:?uso: $0 <diretório de trabalho>}"
NOME="${VOZ_NOME:-voz.teste}"
mkdir -p "$TRABALHO"

if [ ! -f "$TRABALHO/ca.pem" ]; then
  echo "[preparar] CA e certificado para $NOME…"
  # `--entrypoint sh`: a imagem tem o próprio `openssl` como entrypoint, e sem
  # isto o shell inteiro vira argumento dele ("Invalid command 'sh'").
  docker run --rm --entrypoint sh -v "$TRABALHO:/t" -w /t alpine/openssl:latest -c "
    set -e
    openssl req -x509 -newkey rsa:2048 -sha256 -days 30 -nodes \
      -keyout ca.key -out ca.pem -subj '/CN=CA de teste da ponte de voz' >/dev/null 2>&1
    openssl req -newkey rsa:2048 -nodes -keyout folha.key -out folha.csr \
      -subj '/CN=$NOME' >/dev/null 2>&1
    printf 'subjectAltName=DNS:$NOME\nextendedKeyUsage=serverAuth\n' > ext.cnf
    openssl x509 -req -in folha.csr -CA ca.pem -CAkey ca.key -CAcreateserial \
      -out folha.pem -days 30 -sha256 -extfile ext.cnf >/dev/null 2>&1
    rm -f folha.csr ext.cnf
  "
  chmod 644 "$TRABALHO"/*.pem "$TRABALHO"/*.key
fi

# Truststore da JVM: o Lavalink precisa confiar na nossa CA para abrir o
# `wss://` contra a ponte. `keytool` sai de uma imagem de JDK descartável.
if [ ! -f "$TRABALHO/truststore.jks" ]; then
  echo "[preparar] truststore da JVM…"
  docker run --rm -v "$TRABALHO:/t" -w /t eclipse-temurin:21-jdk sh -c "
    keytool -importcert -noprompt -alias ponte-de-teste \
      -file ca.pem -keystore truststore.jks -storepass changeit >/dev/null
  "
  chmod 644 "$TRABALHO/truststore.jks"
fi

# A música: quatro minutos gerados aqui, para a prova não depender da internet
# nem do YouTube (que bloqueia IP de datacenter, e uma prova que falha por isso
# não diz nada sobre a ponte). MP3 porque é o que o lavaplayer decodifica com
# menos cerimônia.
if [ ! -f "$TRABALHO/musica.mp3" ]; then
  echo "[preparar] música de 4 min…"
  docker run --rm -v "$TRABALHO:/t" -w /t linuxserver/ffmpeg:latest \
    -f lavfi -i "sine=frequency=220:sample_rate=48000:duration=240" \
    -f lavfi -i "sine=frequency=277:sample_rate=48000:duration=240" \
    -filter_complex "[0:a][1:a]amerge=inputs=2,tremolo=f=0.5:d=0.7[a]" \
    -map "[a]" -ac 2 -ar 48000 -b:a 128k -y /t/musica.mp3 >/dev/null 2>&1
  chmod 644 "$TRABALHO/musica.mp3"
fi

echo "[preparar] pronto em $TRABALHO:"
ls -la "$TRABALHO"
