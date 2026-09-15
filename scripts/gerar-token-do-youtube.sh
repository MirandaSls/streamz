#!/usr/bin/env bash
#
# Gera um refresh token OAuth do YouTube para o Streamz Música.
#
# Por que existe: o YouTube recusa tocar para o IP deste servidor sem uma conta
# logada ("This video requires login" em todos os clientes, medido em
# 2026-09-15). O bot guarda uma lista de tokens em `YOUTUBE_REFRESH_TOKENS` e
# faz rodízio entre eles (`apps/bots/src/musica/tokens-do-youtube.ts`), como o
# Vocard faz.
#
# Como: sobe um Lavalink **temporário** (não mexe no de produção) com o fluxo
# de login do Google ligado, mostra o código, espera alguém autorizar em
# https://www.google.com/device e imprime o token. Não escreve no `.env`: quem
# cola é a pessoa (mesma regra do `publicar-android.sh`).
#
#   !!! USE UMA CONTA GOOGLE DESCARTÁVEL, NUNCA A PRINCIPAL !!!
#   O próprio plugin avisa: a conta pode ser suspensa.
#
# Uso:
#   scripts/gerar-token-do-youtube.sh            # espera até 15 min
#
# Depois, no `.env` de produção (vários tokens separados por vírgula):
#   YOUTUBE_REFRESH_TOKENS=1//0abc...,1//0def...
# e recriar o bot:
#   docker compose -f docker-compose.yml -f docker-compose.traefik.yml \
#     --profile bots up -d bot-musica

set -euo pipefail

NOME="streamz-lavalink-token-$$"
PASTA="$(mktemp -d)"
trap 'docker rm -f "$NOME" >/dev/null 2>&1 || true; rm -rf "$PASTA"' EXIT

# O plugin já baixado pelo Lavalink de produção, se houver; senão baixa.
PLUGINS_VOLUME="streamz_lavalink-plugins"
mkdir -p "$PASTA/plugins" && chmod 777 "$PASTA/plugins"

cat > "$PASTA/application.yml" <<'YML'
server: { port: 2333, address: 0.0.0.0 }
lavalink:
  plugins:
    - dependency: "dev.lavalink.youtube:youtube-plugin:1.18.2"
      repository: "https://maven.lavalink.dev/releases"
  server:
    password: "so-para-gerar-token"
    sources: { youtube: false }
plugins:
  youtube:
    enabled: true
    clients: ["TV"]
    oauth:
      enabled: true
logging:
  level:
    root: WARN
    dev.lavalink.youtube.http.YoutubeOauth2Handler: INFO
YML

if docker volume inspect "$PLUGINS_VOLUME" >/dev/null 2>&1; then
  docker run --rm -v "$PLUGINS_VOLUME":/de:ro -v "$PASTA/plugins":/para alpine \
    sh -c 'cp /de/youtube-plugin-*.jar /para/ 2>/dev/null || true'
fi

echo "Subindo um Lavalink temporário ($NOME)..."
docker run -d --name "$NOME" --cpuset-cpus 0,1 \
  -e _JAVA_OPTIONS="-Xmx384m -XX:+UseSerialGC" \
  -v "$PASTA/application.yml":/opt/Lavalink/application.yml:ro \
  -v "$PASTA/plugins":/opt/Lavalink/plugins \
  ghcr.io/lavalink-devs/lavalink:4 >/dev/null

codigo_mostrado=""
for _ in $(seq 1 300); do
  logs="$(docker logs "$NOME" 2>&1 || true)"
  if [ -z "$codigo_mostrado" ]; then
    codigo="$(grep -oE 'enter code [A-Z0-9-]+' <<<"$logs" | tail -1 | awk '{print $3}')"
    if [ -n "$codigo" ]; then
      codigo_mostrado=1
      echo
      echo "  1. Abra https://www.google.com/device com uma conta Google DESCARTÁVEL"
      echo "  2. Digite o código: $codigo"
      echo
      echo "Esperando a autorização..."
    fi
  fi
  token="$(grep -oE 'Store your refresh token as this can be reused\. \(([^)]+)\)' <<<"$logs" \
    | tail -1 | sed -E 's/.*\(([^)]+)\)/\1/')"
  if [ -n "$token" ]; then
    echo
    echo "Token gerado. Acrescente em YOUTUBE_REFRESH_TOKENS no .env (é uma credencial):"
    echo
    echo "$token"
    exit 0
  fi
  if grep -qE 'denied|has expired\. OAuth integration has been canceled' <<<"$logs"; then
    echo "O login foi negado ou o código expirou. Rode de novo." >&2
    exit 1
  fi
  sleep 3
done

echo "Ninguém autorizou em 15 minutos. Rode de novo." >&2
exit 1
