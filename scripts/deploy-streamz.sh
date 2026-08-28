#!/usr/bin/env bash
#
# Comando forçado da chave de deploy do GitHub Actions.
#
# Fica instalado em /usr/local/bin/deploy-streamz e é a ÚNICA coisa que aquela
# chave consegue executar (ver a linha `restrict,command="..."` no
# authorized_keys). Mesmo que a chave privada vaze do GitHub, quem a tiver não
# ganha shell: ganha o direito de reimplantar uma tag já publicada.
#
# Entrada:
#   SSH_ORIGINAL_COMMAND  a tag da imagem — `latest` ou `sha-<hex>`
#   stdin                 duas linhas: usuário e token do GHCR
#
# O token é de vida curta (o GITHUB_TOKEN do job, que morre com ele) e chega
# pelo stdin de propósito: em argumento de linha de comando ele apareceria no
# `ps` de qualquer processo da máquina.
#
# Voltar versão sem o GitHub, se precisar:
#   cd /opt/stack/streamz && export STREAMZ_TAG=sha-abc1234
#   docker compose -f docker-compose.yml -f docker-compose.traefik.yml \
#     -f docker-compose.ghcr.yml --profile livekit up -d --no-build

set -euo pipefail

STACK=/opt/stack/streamz
REGISTRO=ghcr.io
ESPERA_SEGUNDOS=120

compose() {
  docker compose \
    -f "$STACK/docker-compose.yml" \
    -f "$STACK/docker-compose.traefik.yml" \
    -f "$STACK/docker-compose.ghcr.yml" \
    --profile livekit "$@"
}

log() { printf '[deploy %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
falhar() { printf '[deploy] ERRO: %s\n' "$*" >&2; exit 1; }

# ── 1. entrada ───────────────────────────────────────────────
# A tag vem de fora e vira argumento de docker/compose. Sem esta trava, um
# "tag" com espaço ou `$(...)` viraria outra coisa lá dentro.
tag="${SSH_ORIGINAL_COMMAND:-}"
[[ "$tag" =~ ^(latest|sha-[0-9a-f]{7,40})$ ]] || falhar "tag inválida: '${tag}'"

IFS= read -r usuario || true
IFS= read -r token || true
[[ -n "${usuario:-}" && -n "${token:-}" ]] || falhar "usuário/token do registro ausentes no stdin"

log "alvo: $tag"
cd "$STACK"

# ── 2. topologia do stack ────────────────────────────────────
# A imagem vem pronta do registro, mas os compose e o .env continuam morando
# aqui — é o que descreve COMO os contêineres sobem.
[[ "$(git rev-parse --abbrev-ref HEAD)" == "main" ]] || falhar "o checkout do servidor não está em main"

# O `credential.helper=` vazio ZERA a lista antes de instalar o nosso: sem ele
# o helper do `gh` que existe na máquina responde primeiro, e o deploy passaria
# a depender de um login que ninguém renova. O token vai por variável de
# ambiente, não em argumento — argumento aparece no `ps`.
export GIT_TOKEN="$token"
git -c credential.helper= \
    -c credential.helper='!f(){ echo username=x-access-token; echo "password=${GIT_TOKEN}"; }; f' \
    fetch --quiet --prune origin main
unset GIT_TOKEN

# `--ff-only` de propósito: se alguém editou algo à mão aqui, o deploy PARA em
# vez de apagar o trabalho por baixo. Reset silencioso já destruiu servidor
# demais.
git merge --ff-only origin/main >/dev/null \
  || falhar "o checkout do servidor divergiu de origin/main — resolva à mão antes de reimplantar"
log "compose em $(git rev-parse --short HEAD)"

# ── 3. imagem ────────────────────────────────────────────────
printf '%s\n' "$token" | docker login "$REGISTRO" -u "$usuario" --password-stdin >/dev/null
trap 'docker logout "$REGISTRO" >/dev/null 2>&1 || true' EXIT

export STREAMZ_TAG="$tag"
log "puxando imagens $tag"
compose pull --quiet api web

# ── 4. troca ─────────────────────────────────────────────────
# `--no-build` é cinto de segurança: se o override do GHCR sumir do disco por
# algum motivo, é melhor o deploy falhar do que virar um build de 4 minutos
# roubando CPU do LiveKit no meio do dia.
log "subindo"
compose up -d --no-build

# ── 5. prova ─────────────────────────────────────────────────
# Sem esta espera o job ficaria verde com a API morrendo em loop de restart.
log "aguardando health de api e web"
fim=$((SECONDS + ESPERA_SEGUNDOS))
while ((SECONDS < fim)); do
  estado="$(docker inspect -f '{{.Name}}={{if .State.Health}}{{.State.Health.Status}}{{else}}sem-health{{end}}' \
            streamz-api streamz-web 2>/dev/null || true)"
  if [[ "$(grep -c '=healthy$' <<<"$estado")" == "2" ]]; then
    log "ok — $(tr '\n' ' ' <<<"$estado")"
    docker image prune -f >/dev/null 2>&1 || true
    exit 0
  fi
  sleep 3
done

printf '[deploy] estado final: %s\n' "$(tr '\n' ' ' <<<"${estado:-desconhecido}")" >&2
docker compose -f "$STACK/docker-compose.yml" logs --tail 40 api web >&2 || true
falhar "api/web não ficaram saudáveis em ${ESPERA_SEGUNDOS}s — a versão anterior NÃO foi restaurada automaticamente, use o workflow de deploy manual com a tag antiga"
