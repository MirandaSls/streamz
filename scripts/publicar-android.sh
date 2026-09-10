#!/usr/bin/env bash
#
# Publica um `.apk` do app Android já gerado por
# `scripts/build-android-no-servidor.sh`: copia para as duas pastas que o
# servidor serve e imprime as quatro linhas de `.env` para colar.
#
# É o irmão do `publicar-<versão>-local.sh` do desktop (que mora no scratchpad
# de cada release, §3.6 do processo), com uma diferença deliberada: **este
# script não escreve no `.env`.** Ele imprime.
#
# Por quê: no desktop a variável que importa é uma assinatura minisign de 100
# caracteres que ninguém digita à mão, e automatizar era o único caminho
# razoável. Aqui são quatro linhas curtas, e o `.env` de produção é o arquivo
# que, editado errado, tira o site do ar — um script versionado no repositório
# que o reescreve é uma arma carregada em cima da mesa. Quem cola é a pessoa,
# que vê o que está colando.
#
# As DUAS pastas, e a confusão é fácil (a mesma do desktop):
#
#   updates/    — ABERTA. É de onde o **app** baixa, seguindo a URL do
#                 manifesto. O atualizador não sabe autenticar; o que garante
#                 que o pacote é nosso não é o sigilo do endereço, é o sha256
#                 publicado no manifesto e conferido no aparelho.
#   downloads/  — protegida por senha. É o que o **site** serve a quem ainda
#                 não tem o app instalado.
#
# Uso:
#   scripts/publicar-android.sh <pasta com o .apk>
#   scripts/publicar-android.sh <pasta> --notas "O que mudou nesta versão."
#
# Ver docs/APPS-MOBILE.md §13.

set -euo pipefail

STACK=/opt/stack/streamz
PASTA="${1:?uso: publicar-android.sh <pasta com o .apk> [--notas \"...\"]}"
shift || true
NOTAS="Correções e melhorias."

while [ $# -gt 0 ]; do
  case "$1" in
    --notas) NOTAS="${2:?--notas precisa de um texto}"; shift ;;
    --notas=*) NOTAS="${1#*=}" ;;
    -h|--help) sed -n '2,32p' "$0"; exit 0 ;;
    *) echo "opção desconhecida: $1" >&2; exit 2 ;;
  esac
  shift
done

passo() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

# ---------------------------------------------------------------- o arquivo
# `-name '*.apk'` e não um nome fixo: o Gradle chama a saída de
# `app-universal-release.apk`, e é só aqui que ela ganha o nome do produto.
APK="$(find "$PASTA" -maxdepth 1 -type f -name '*.apk' | head -1)"
if [ -z "$APK" ]; then
  echo "ERRO: nenhum .apk em $PASTA" >&2
  echo "  gere um com: scripts/build-android-no-servidor.sh <commit>" >&2
  exit 1
fi

# A versão sai da pasta de saída do build (`<versão>-<commit>`) e é conferida
# contra o que o **pacote** declara. Divergir aqui seria publicar um manifesto
# que promete 1.2.0 e um arquivo que se instala como 1.1.1: o app baixaria,
# instalaria, reabriria na versão velha e ofereceria a atualização de novo,
# para sempre. É o defeito mais chato possível e o mais fácil de evitar.
VERSAO_DA_PASTA="$(basename "$(dirname "$APK")" | cut -d- -f1)"
VERSAO_DO_APK="$(docker run --rm -v "$(dirname "$APK"):/s:ro" streamz-android \
  aapt dump badging "/s/$(basename "$APK")" 2>/dev/null \
  | sed -n "s/.*versionName='\([^']*\)'.*/\1/p" | head -1)"

if [ -z "$VERSAO_DO_APK" ]; then
  echo "ERRO: não deu para ler o versionName do .apk (a imagem streamz-android existe?)" >&2
  exit 1
fi
if [ -n "$VERSAO_DA_PASTA" ] && [ "$VERSAO_DA_PASTA" != "$VERSAO_DO_APK" ]; then
  echo "ERRO: a pasta diz $VERSAO_DA_PASTA e o pacote diz $VERSAO_DO_APK." >&2
  echo "  Publicar assim faria o app atualizar em laço. Refaça o build." >&2
  exit 1
fi
VERSAO="$VERSAO_DO_APK"
NOME="Streamz_${VERSAO}_android.apk"

passo "Pacote"
echo "  origem:  $APK"
echo "  versão:  $VERSAO (lida do próprio .apk)"
echo "  destino: $NOME"

# ---------------------------------------------------------------- cópia
passo "Copiando para updates/ (o app) e downloads/ (o site)"
install -m 644 "$APK" "$STACK/updates/$NOME"
install -m 644 "$APK" "$STACK/downloads/$NOME"
ls -la "$STACK/updates/$NOME" "$STACK/downloads/$NOME"

# O digest é calculado do arquivo **já copiado**, não do original: é esse o byte
# a byte que a API vai servir, e uma cópia truncada por disco cheio apareceria
# aqui em vez de aparecer no telefone de alguém.
DIGESTO="$(sha256sum "$STACK/updates/$NOME" | cut -d' ' -f1)"
ORIGEM="$(sha256sum "$APK" | cut -d' ' -f1)"
if [ "$DIGESTO" != "$ORIGEM" ]; then
  echo "ERRO: a cópia não confere com a origem. Disco cheio?" >&2
  exit 1
fi

# ---------------------------------------------------------------- .env
passo "Cole estas quatro linhas em $STACK/.env (substituindo as que já existem)"
cat <<ENV

ANDROID_UPDATE_VERSION=$VERSAO
ANDROID_UPDATE_URL=https://api.streamz.chat/api/updates/arquivo/$NOME
ANDROID_UPDATE_SHA256=$DIGESTO
ANDROID_UPDATE_NOTES=$NOTAS

ENV

passo "Depois, recrie a API (docker restart NÃO relê o .env)"
cat <<'FIM'
    cd /opt/stack/streamz
    TAG=$(docker ps --filter name=streamz-api --format '{{.Image}}' | sed 's/.*://')
    STREAMZ_TAG="$TAG" docker compose -f docker-compose.yml \
      -f docker-compose.traefik.yml -f docker-compose.ghcr.yml \
      --profile livekit up -d api
FIM

passo "E confira (a versão anterior deve receber 200; a nova, 204)"
cat <<FIM
    curl -s https://api.streamz.chat/api/updates/android/universal/<versão anterior>
    curl -s -o /dev/null -w '%{http_code}\\n' https://api.streamz.chat/api/updates/android/universal/$VERSAO
    curl -sI https://api.streamz.chat/api/updates/arquivo/$NOME | head -3
FIM

echo
echo "O que isto NÃO faz: não edita o .env (é você quem cola, vendo o que cola)"
echo "e não reinicia nada. Ver docs/APPS-MOBILE.md §13."
