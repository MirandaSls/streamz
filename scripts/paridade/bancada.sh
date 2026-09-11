#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Bancada isolada do passeio de paridade (onda 0.7 do PLANO-PARIDADE-DISCORD).
#
# Sobe Postgres + API + web DESTA worktree em contêineres próprios, sem encostar
# na produção que roda no mesmo host (streamz-postgres/-api/-web, portas
# 5432/3333/3000). Tudo aqui tem nome `paridade-*`, rede própria e porta própria,
# publicada só em 127.0.0.1:
#
#   paridade-postgres   127.0.0.1:55432   volume paridade-pgdata
#   paridade-api        127.0.0.1:43333   (API em modo dev, THROTTLE_DISABLED=1)
#   paridade-web        127.0.0.1:43000   (next build + next start)
#   rede docker         paridade-rede     (a captura usa --network host: ver abaixo)
#
# ── Do zero (o host não tem node; tudo roda em docker) ──────────────────────
#
#   cd /opt/stack/streamz/.claude/worktrees/paridade
#   scripts/paridade/bancada.sh subir       # banco + build (shared, api, web) + API + web  (~5-10 min)
#   scripts/paridade/bancada.sh semear      # recria o banco, semeia, guarda o modelo       (~2 min)
#   scripts/paridade/bancada.sh capturar    # restaura o modelo e fotografa as telas        (~10 min)
#   scripts/paridade/bancada.sh folha --refs /opt/stack/streamz/.claude/worktrees/referencias
#   scripts/paridade/bancada.sh status
#   scripts/paridade/bancada.sh descer      # [--limpar] apaga também o volume do banco
#
# Depois de mexer no código: `subir` de novo (rebuilda e reinicia; o banco fica)
# e `capturar`. A semente só precisa ser refeita se o schema ou ela mesma mudar.
#
# Onde fica o estado: `.claude/paridade/` desta worktree (ignorado pelo git):
# segredos.env e api.env (JWT da bancada), semente.json (manifesto da semente),
# web-build-id e saida/ (capturas, resumo.json e folhas). `SAIDA=<dir>` troca a
# pasta de saída.
#
# Memória: o servidor já caiu por OOM. Todo contêiner tem --memory; o build da
# web é o mais pesado (4 GB, 4 CPUs) e roda sozinho, antes de API e web subirem.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ESTADO="$RAIZ/.claude/paridade"
SAIDA="${SAIDA:-$ESTADO/saida}"

REDE=paridade-rede
C_PG=paridade-postgres
C_API=paridade-api
C_WEB=paridade-web
V_PG=paridade-pgdata
V_PW=paridade-pw
V_COREPACK=paridade-corepack

PORTA_PG=55432
PORTA_API=43333
PORTA_WEB=43000

IMG_NODE=node:22
IMG_PG=postgres:16
IMG_PW=mcr.microsoft.com/playwright:v1.56.0-noble
# a versão do playwright-core que casa com o Chromium da imagem (1.56.0)
PW_VERSAO="${IMG_PW##*:v}"
PW_VERSAO="${PW_VERSAO%%-*}"

# O navegador da captura roda com --network host e vê a bancada como localhost:
# é essa a origem que a web embute no build (NEXT_PUBLIC_*) e a que a API aceita
# no CORS. Dá também para abrir a bancada de fora com um túnel SSH das duas portas.
API_LOCAL="http://localhost:$PORTA_API"
WEB_LOCAL="http://localhost:$PORTA_WEB"
API_INTERNA="http://$C_API:$PORTA_API"
DB_NOME=paridade
DB_MODELO=paridade_semente
DB_URL_INTERNA="postgresql://paridade:paridade@$C_PG:5432/$DB_NOME?schema=public"
REFS_PADRAO=/opt/stack/streamz/.claude/worktrees/referencias
PRINTS_1A1=/opt/stack/streamz/docs/Reference

# ── utilidades ───────────────────────────────────────────────────────────────

log() { printf '\033[1;32m[bancada]\033[0m %s\n' "$*"; }
aviso() { printf '\033[1;33m[bancada]\033[0m %s\n' "$*" >&2; }
erro() {
  printf '\033[1;31m[bancada]\033[0m %s\n' "$*" >&2
  exit 1
}

existe() { docker ps -a --format '{{.Names}}' | grep -qx "$1"; }
rodando() { docker ps --format '{{.Names}}' | grep -qx "$1"; }
porta_ocupada() { ss -ltnH "( sport = :$1 )" 2>/dev/null | grep -q .; }

esperar_http() {
  local url="$1" nome="$2" tentativas="${3:-60}"
  for _ in $(seq 1 "$tentativas"); do
    if curl -fsS -o /dev/null --max-time 3 "$url"; then return 0; fi
    sleep 2
  done
  return 1
}

garantir_rede() {
  docker network inspect "$REDE" >/dev/null 2>&1 || docker network create "$REDE" >/dev/null
}

aleatorio() { head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; }

# JWT só desta bancada: gerado uma vez e guardado, para os tokens continuarem
# valendo entre reinícios da API (o `capturar` reinicia a API a cada passeio)
garantir_segredos() {
  mkdir -p "$ESTADO"
  if [ ! -f "$ESTADO/segredos.env" ]; then
    (
      umask 077
      echo "JWT_SECRET=paridade-$(aleatorio)"
      echo "JWT_REFRESH_SECRET=paridade-refresh-$(aleatorio)"
    ) >"$ESTADO/segredos.env"
    chmod 600 "$ESTADO/segredos.env"
  fi
}

escrever_env_da_api() {
  garantir_segredos
  # shellcheck disable=SC1091
  . "$ESTADO/segredos.env"
  touch "$ESTADO/api.env"
  chmod 600 "$ESTADO/api.env"
  cat >"$ESTADO/api.env" <<EOF
DATABASE_URL=$DB_URL_INTERNA
JWT_SECRET=$JWT_SECRET
JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET
NODE_ENV=development
THROTTLE_DISABLED=1
API_HOST=0.0.0.0
API_PORT=$PORTA_API
CORS_ORIGIN=$WEB_LOCAL
WEB_PUBLIC_URL=$WEB_LOCAL
API_PUBLIC_URL=$API_LOCAL
APP_VERSION=paridade
LOG_FORMAT=pretty
LOG_LEVEL=info
REDIS_URL=
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
SMTP_URL=
GIPHY_API_KEY=
PLATFORM_ADMIN_EMAILS=
EOF
}

# ── Postgres ─────────────────────────────────────────────────────────────────

subir_postgres() {
  if rodando "$C_PG"; then return 0; fi
  if existe "$C_PG"; then
    docker start "$C_PG" >/dev/null
  else
    porta_ocupada "$PORTA_PG" && erro "a porta $PORTA_PG já está em uso por outro processo"
    log "subindo $C_PG (127.0.0.1:$PORTA_PG)"
    docker run -d --name "$C_PG" --network "$REDE" \
      -p "127.0.0.1:$PORTA_PG:5432" --memory 512m \
      -e POSTGRES_USER=paridade -e POSTGRES_PASSWORD=paridade -e POSTGRES_DB="$DB_NOME" \
      -v "$V_PG:/var/lib/postgresql/data" \
      "$IMG_PG" >/dev/null
  fi
  for _ in $(seq 1 60); do
    if docker exec "$C_PG" pg_isready -U paridade -d postgres >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  erro "o Postgres da bancada não respondeu (docker logs $C_PG)"
}

# Cada -c é um comando à parte (DROP DATABASE não roda dentro de transação).
psql_admin() { docker exec -i "$C_PG" psql -v ON_ERROR_STOP=1 -q -U paridade -d postgres "$@"; }

banco_existe() { [ "$(psql_admin -Atc "SELECT 1 FROM pg_database WHERE datname = '$1'")" = "1" ]; }

recriar_banco() {
  log "recriando o banco $DB_NOME (e descartando o modelo $DB_MODELO)"
  psql_admin -c "DROP DATABASE IF EXISTS $DB_NOME WITH (FORCE)" \
    -c "DROP DATABASE IF EXISTS $DB_MODELO WITH (FORCE)" \
    -c "CREATE DATABASE $DB_NOME"
}

# O modelo é a semente congelada: restaurar é copiar arquivo, não semear de novo.
# Exige a API parada — o CREATE DATABASE ... TEMPLATE recusa origem com conexão.
salvar_modelo() {
  psql_admin -c "DROP DATABASE IF EXISTS $DB_MODELO WITH (FORCE)" \
    -c "CREATE DATABASE $DB_MODELO TEMPLATE $DB_NOME"
}

restaurar_modelo() {
  banco_existe "$DB_MODELO" || erro "não há modelo semeado ($DB_MODELO): rode 'semear' antes"
  psql_admin -c "DROP DATABASE IF EXISTS $DB_NOME WITH (FORCE)" \
    -c "CREATE DATABASE $DB_NOME TEMPLATE $DB_MODELO"
}

# ── build, API e web ─────────────────────────────────────────────────────────

# O build roda na worktree montada: packages/shared/dist, apps/api/dist e
# apps/web/.next são os mesmos que a verificação do §3.2 produz. Por isso o
# `subir --sem-build` confere o BUILD_ID: um `next build` de verificação (sem as
# NEXT_PUBLIC_* da bancada) apontaria a web para localhost:3333 — a produção.
preparar() {
  local com_web="$1" partes="shared, api"
  [ "$com_web" = 1 ] && partes="$partes, web"
  log "build em $IMG_NODE: $partes — alguns minutos"
  docker volume inspect "$V_COREPACK" >/dev/null 2>&1 || docker volume create "$V_COREPACK" >/dev/null
  docker run --rm --name paridade-preparar --memory 4g --cpus 4 \
    -v "$RAIZ:/w" -v "$V_COREPACK:/root/.cache/node/corepack" -w /w \
    -e CI=1 -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 -e NEXT_TELEMETRY_DISABLED=1 \
    -e NODE_OPTIONS=--max-old-space-size=3072 \
    -e COM_WEB="$com_web" \
    -e NEXT_PUBLIC_API_URL="$API_LOCAL" \
    -e NEXT_PUBLIC_WS_URL="$API_LOCAL" \
    -e NEXT_PUBLIC_WEB_URL="$WEB_LOCAL" \
    -e WEB_PUBLIC_URL="$WEB_LOCAL" \
    "$IMG_NODE" bash -euo pipefail -c '
      corepack enable >/dev/null
      if [ ! -d node_modules/.pnpm ]; then pnpm install --frozen-lockfile; fi
      pnpm --filter @streamz/shared build
      pnpm --filter @streamz/api exec prisma generate
      pnpm --filter @streamz/api build
      if [ "$COM_WEB" = 1 ]; then
        cd apps/web
        # o "prebuild" do package.json, chamado à mão porque o build vai direto
        # ao next para passar --no-lint (o lint é da verificação, não da bancada)
        node scripts/copiar-supressor.mjs
        NODE_ENV=production ./node_modules/.bin/next build --no-lint
      fi'
  if [ "$com_web" = 1 ]; then cp "$RAIZ/apps/web/.next/BUILD_ID" "$ESTADO/web-build-id"; fi
}

conferir_builds() {
  if [ ! -f "$RAIZ/apps/api/dist/main.js" ] || [ ! -f "$RAIZ/packages/shared/dist/index.js" ]; then
    aviso "API ou shared sem build: buildando mesmo com --sem-build"
    preparar 0
  fi
  local atual="" nosso=""
  [ -f "$RAIZ/apps/web/.next/BUILD_ID" ] && atual="$(cat "$RAIZ/apps/web/.next/BUILD_ID")"
  [ -f "$ESTADO/web-build-id" ] && nosso="$(cat "$ESTADO/web-build-id")"
  if [ -z "$atual" ] || [ "$atual" != "$nosso" ]; then
    aviso "o .next da web não é o build da bancada (outra verificação o sobrescreveu?): rebuildando a web"
    preparar 1
  fi
}

parar_api() { docker rm -f "$C_API" >/dev/null 2>&1 || true; }

iniciar_api() {
  escrever_env_da_api
  parar_api
  porta_ocupada "$PORTA_API" && erro "a porta $PORTA_API já está em uso por outro processo"
  log "subindo $C_API (127.0.0.1:$PORTA_API) — aplica as migrations antes"
  docker run -d --name "$C_API" --network "$REDE" \
    -p "127.0.0.1:$PORTA_API:$PORTA_API" --memory 1g \
    --env-file "$ESTADO/api.env" \
    -v "$RAIZ:/w" -w /w/apps/api \
    "$IMG_NODE" sh -c './node_modules/.bin/prisma migrate deploy && exec node dist/main.js' >/dev/null
  if ! esperar_http "$API_LOCAL/api/health" "API" 90; then
    docker logs --tail 80 "$C_API" >&2 || true
    erro "a API da bancada não respondeu em $API_LOCAL/api/health"
  fi
}

iniciar_web() {
  docker rm -f "$C_WEB" >/dev/null 2>&1 || true
  porta_ocupada "$PORTA_WEB" && erro "a porta $PORTA_WEB já está em uso por outro processo"
  log "subindo $C_WEB (127.0.0.1:$PORTA_WEB)"
  docker run -d --name "$C_WEB" --network "$REDE" \
    -p "127.0.0.1:$PORTA_WEB:$PORTA_WEB" --memory 1g \
    -v "$RAIZ:/w" -w /w/apps/web \
    -e NODE_ENV=production -e NEXT_TELEMETRY_DISABLED=1 \
    "$IMG_NODE" ./node_modules/.bin/next start -p "$PORTA_WEB" -H 0.0.0.0 >/dev/null
  if ! esperar_http "$WEB_LOCAL/login" "web" 60; then
    docker logs --tail 80 "$C_WEB" >&2 || true
    erro "a web da bancada não respondeu em $WEB_LOCAL/login"
  fi
}

# O playwright-core da worktree é mais novo que o Chromium da imagem; a versão
# que casa com ela fica num volume, instalada uma vez (precisa do registro npm).
# Sem ela, PW_CORE fica vazio e os scripts caem no da worktree, procurando o
# Chromium da imagem por conta própria (com aviso).
PW_CORE_NO_CONTEINER=""
garantir_playwright() {
  docker volume inspect "$V_PW" >/dev/null 2>&1 || docker volume create "$V_PW" >/dev/null
  if docker run --rm -v "$V_PW:/pw" -e PW_VERSAO="$PW_VERSAO" "$IMG_PW" bash -c '
    atual=$(node -p "try { require(\"/pw/node_modules/playwright-core/package.json\").version } catch { \"\" }" 2>/dev/null || true)
    [ "$atual" = "$PW_VERSAO" ] && exit 0
    echo "[bancada] instalando playwright-core@$PW_VERSAO no volume (uma vez só)"
    cd /pw
    [ -f package.json ] || npm init -y >/dev/null
    npm install --no-audit --no-fund --loglevel=error "playwright-core@$PW_VERSAO"'; then
    PW_CORE_NO_CONTEINER=/pw/node_modules/playwright-core
  else
    aviso "não deu para instalar playwright-core@$PW_VERSAO: usando o da worktree com o Chromium da imagem"
    PW_CORE_NO_CONTEINER=""
  fi
}

# ── comandos ─────────────────────────────────────────────────────────────────

cmd_subir() {
  local build=1 com_web=1
  while [ $# -gt 0 ]; do
    case "$1" in
      --sem-build) build=0 ;;
      --sem-build-web) com_web=0 ;;
      *) erro "opção desconhecida para subir: $1" ;;
    esac
    shift
  done
  mkdir -p "$ESTADO"
  garantir_rede
  garantir_segredos
  subir_postgres
  if [ "$build" = 1 ]; then
    preparar "$com_web"
    [ "$com_web" = 1 ] || conferir_builds
  else
    conferir_builds
  fi
  # a API sobe no banco que houver; sem semente ainda, é um banco vazio migrado
  iniciar_api
  iniciar_web
  log "no ar: web $WEB_LOCAL · API $API_LOCAL · Postgres 127.0.0.1:$PORTA_PG"
  banco_existe "$DB_MODELO" || log "próximo passo: scripts/paridade/bancada.sh semear"
}

cmd_semear() {
  rodando "$C_PG" || erro "o Postgres da bancada não está no ar: rode 'subir' antes"
  [ -f "$RAIZ/apps/api/dist/main.js" ] || erro "a API não está compilada: rode 'subir' antes"
  mkdir -p "$ESTADO"
  parar_api
  recriar_banco
  iniciar_api
  log "semeando (API $API_INTERNA, dentro da rede $REDE)"
  docker run --rm --name paridade-semente --network "$REDE" --memory 1g \
    -v "$RAIZ:/w" -w /w \
    -e API_URL="$API_INTERNA" \
    -e DATABASE_URL="$DB_URL_INTERNA" \
    -e WEB_PUBLICA="$WEB_LOCAL" \
    "$IMG_NODE" node scripts/paridade/semente.mjs --manifesto /w/.claude/paridade/semente.json
  log "guardando o modelo $DB_MODELO"
  parar_api
  salvar_modelo
  iniciar_api
  log "semente pronta: $ESTADO/semente.json · login paridade / Paridade#2026 em $WEB_LOCAL"
}

cmd_capturar() {
  local restaurar=1
  local repassar=()
  while [ $# -gt 0 ]; do
    case "$1" in
      --sem-restaurar) restaurar=0 ;;
      --listar)
        restaurar=0
        repassar+=("$1")
        ;;
      *) repassar+=("$1") ;;
    esac
    shift
  done
  [ -f "$ESTADO/semente.json" ] || erro "sem manifesto da semente: rode 'semear' antes"
  rodando "$C_WEB" || erro "a web da bancada não está no ar: rode 'subir' antes"
  rodando "$C_PG" || erro "o Postgres da bancada não está no ar: rode 'subir' antes"
  if [ "$restaurar" = 1 ]; then
    # toda captura parte do mesmo banco: abrir um canal grava leitura, o modal
    # de convite cria convite, a voz deixa estado — sem restaurar, a segunda
    # rodada já não fotografaria a mesma coisa que a primeira
    log "restaurando o banco a partir do modelo semeado (reinicia a API)"
    parar_api
    restaurar_modelo
    iniciar_api
  fi
  garantir_playwright
  mkdir -p "$SAIDA"
  log "capturando em $SAIDA"
  local codigo=0
  docker run --rm --name paridade-captura --network host \
    --memory 3g --shm-size 1g \
    -v "$RAIZ:/w:ro" -v "$SAIDA:/saida" -v "$V_PW:/pw" -w /w \
    -e PW_CORE="$PW_CORE_NO_CONTEINER" \
    "$IMG_PW" node scripts/paridade/capturar.mjs \
    --web "$WEB_LOCAL" --api "$API_LOCAL" \
    --semente /w/.claude/paridade/semente.json --saida /saida \
    "${repassar[@]}" || codigo=$?
  if [ "$codigo" = 2 ]; then
    aviso "algumas telas falharam — ver $SAIDA/resumo.json e os <id>.falha.png"
  elif [ "$codigo" != 0 ]; then
    erro "a captura parou (código $codigo)"
  fi
  return "$codigo"
}

cmd_folha() {
  local refs=""
  local repassar=()
  while [ $# -gt 0 ]; do
    case "$1" in
      --refs)
        refs="${2:-}"
        shift
        ;;
      *) repassar+=("$1") ;;
    esac
    shift
  done
  if [ -z "$refs" ] && [ -d "$REFS_PADRAO" ]; then refs="$REFS_PADRAO"; fi
  local volumes=()
  if [ -n "$refs" ]; then
    [ -d "$refs" ] || erro "--refs não é uma pasta: $refs"
    volumes=(-v "$(cd "$refs" && pwd):/refs:ro")
    repassar+=(--refs /refs)
  else
    aviso "sem --refs (e sem $REFS_PADRAO): as folhas saem só com a nossa captura"
  fi
  # o referencias.json aponta os prints 1:1 do usuário por caminho absoluto
  # (fora do git, só no clone principal): montados no MESMO caminho, só leitura
  if [ -d "$PRINTS_1A1" ]; then volumes+=(-v "$PRINTS_1A1:$PRINTS_1A1:ro"); fi
  [ -d "$SAIDA" ] || erro "sem capturas em $SAIDA: rode 'capturar' antes"
  garantir_playwright
  docker run --rm --name paridade-folha --network none \
    --memory 2g --shm-size 512m \
    -v "$RAIZ:/w:ro" -v "$SAIDA:/saida" "${volumes[@]}" -v "$V_PW:/pw" -w /w \
    -e PW_CORE="$PW_CORE_NO_CONTEINER" \
    "$IMG_PW" node scripts/paridade/folha.mjs --saida /saida "${repassar[@]}"
  log "folhas: $SAIDA/folha/index.html"
}

cmd_status() {
  echo "── contêineres"
  docker ps -a --filter "name=^paridade-" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' || true
  echo "── serviços"
  if curl -fsS --max-time 3 "$API_LOCAL/api/health" >/dev/null 2>&1; then
    echo "API  $API_LOCAL  ok ($(curl -fsS --max-time 3 "$API_LOCAL/api/health" 2>/dev/null | head -c 120))"
  else
    echo "API  $API_LOCAL  fora do ar"
  fi
  if curl -fsS --max-time 3 -o /dev/null "$WEB_LOCAL/login"; then echo "web  $WEB_LOCAL  ok"; else echo "web  $WEB_LOCAL  fora do ar"; fi
  echo "── bancos"
  if rodando "$C_PG"; then
    psql_admin -Atc "SELECT datname FROM pg_database WHERE datname LIKE 'paridade%' ORDER BY 1" | sed 's/^/  /'
  else
    echo "  Postgres fora do ar"
  fi
  echo "── estado"
  [ -f "$ESTADO/semente.json" ] && echo "  semente: $ESTADO/semente.json" || echo "  semente: (não semeado)"
  if [ -f "$SAIDA/resumo.json" ]; then
    local ok total
    ok=$(grep -c '"ok": true' "$SAIDA/resumo.json" || true)
    total=$(grep -c '"ok":' "$SAIDA/resumo.json" || true)
    echo "  última captura: $ok de $total tela(s) ok — $SAIDA/resumo.json"
  else
    echo "  captura: (nenhuma)"
  fi
  [ -f "$SAIDA/folha/index.html" ] && echo "  folhas: $SAIDA/folha/index.html"
  return 0
}

cmd_descer() {
  local limpar=0 tudo=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --limpar) limpar=1 ;;
      --limpar-tudo)
        limpar=1
        tudo=1
        ;;
      *) erro "opção desconhecida para descer: $1" ;;
    esac
    shift
  done
  for c in "$C_WEB" "$C_API" "$C_PG" paridade-preparar paridade-semente paridade-captura paridade-folha; do
    docker rm -f "$c" >/dev/null 2>&1 || true
  done
  docker network rm "$REDE" >/dev/null 2>&1 || true
  if [ "$limpar" = 1 ]; then
    docker volume rm "$V_PG" >/dev/null 2>&1 || true
    rm -f "$ESTADO/semente.json"
    log "banco e manifesto apagados (as capturas em $SAIDA ficam)"
  fi
  if [ "$tudo" = 1 ]; then
    docker volume rm "$V_PW" "$V_COREPACK" >/dev/null 2>&1 || true
    log "caches do playwright-core e do corepack apagados"
  fi
  log "bancada fora do ar"
}

cmd_logs() {
  local alvo="${1:-api}"
  case "$alvo" in
    api | web | postgres) docker logs --tail "${2:-200}" "paridade-$alvo" ;;
    *) erro "logs de quê? api, web ou postgres" ;;
  esac
}

cmd_ajuda() {
  sed -n '2,40p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  cat <<'EOF'
Comandos:
  subir [--sem-build | --sem-build-web]   banco, build e serviços (idempotente)
  semear                                  recria o banco, semeia e guarda o modelo
  capturar [--sem-restaurar] [opções do capturar.mjs: --so id,id --plataforma desktop|celular
           --sem-relogio --sem-figurantes --escala-celular N --listar]
  folha [--refs <dir>] [--onda N] [--so id,id] [--escala-desktop 0.5]
  status                                  contêineres, serviços, bancos e última captura
  logs [api|web|postgres] [linhas]
  descer [--limpar | --limpar-tudo]
EOF
}

comando="${1:-ajuda}"
[ $# -gt 0 ] && shift
case "$comando" in
  subir) cmd_subir "$@" ;;
  semear) cmd_semear "$@" ;;
  capturar) cmd_capturar "$@" ;;
  folha) cmd_folha "$@" ;;
  status) cmd_status "$@" ;;
  descer) cmd_descer "$@" ;;
  logs) cmd_logs "$@" ;;
  ajuda | -h | --help) cmd_ajuda ;;
  *) erro "comando desconhecido: $comando (ver: bancada.sh ajuda)" ;;
esac
