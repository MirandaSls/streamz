#!/usr/bin/env bash
#
# Publica uma versão SEM o GitHub Actions: faz aqui, no servidor, o que o
# ci.yml + deploy.yml faziam — verificar, buildar as duas imagens e trocar os
# contêineres.
#
# Existe porque a cobrança do GitHub travou os runners (2026-09-03): nenhum job
# do Actions inicia, então `build das imagens` e `deploy em produção` não rodam
# mais sozinhos. Os workflows continuam no `.github/` e voltam a valer assim
# que a conta destravar — este script é o caminho enquanto isso não acontece.
#
# Uso:
#   scripts/publicar-local.sh                 # origin/main
#   scripts/publicar-local.sh <commit-ish>    # outra referência (voltar versão)
#   scripts/publicar-local.sh --sem-verificar # pula o passo 1 (typecheck/testes)
#
# É idempotente: rodar duas vezes no mesmo commit reaproveita as imagens que já
# existem no disco (use --refazer-imagens para forçar) e o `up -d` não mexe em
# contêiner que já está na tag certa. Publicação bem-sucedida também faz a
# própria faxina: apaga a worktree desta publicação e guarda só as
# $IMAGENS_GUARDADAS imagens mais recentes de cada app (ver passo 5).
#
# O que NÃO cobre: o instalador `.exe` do desktop (job `instalador .exe` do
# desktop.yml) e o `clippy` do Rust — os dois exigem Windows. Ver §3.6 e §5 do
# docs/PROCESSO-DE-DESENVOLVIMENTO.md.

set -euo pipefail

STACK=/opt/stack/streamz
REPO=ghcr.io/mirandasls
IMAGEM_NODE=node:22
ESPERA_SEGUNDOS=180
IMAGENS_GUARDADAS=3  # imagens guardadas por app (as mais recentes) — dá para voltar versão sem rebuild

# As mesmas `gh variable list` do repositório — NEXT_PUBLIC_* é embutida no
# bundle em tempo de build, então elas moram no build-arg, não no .env.
NEXT_PUBLIC_API_URL=https://api.streamz.chat
NEXT_PUBLIC_WS_URL=https://api.streamz.chat
NEXT_PUBLIC_LIVEKIT_URL=wss://livekit.streamz.chat

log()    { printf '\033[36m[publicar %s]\033[0m %s\n' "$(date -u +%H:%M:%S)" "$*"; }
falhar() { printf '\033[31m[publicar] ERRO:\033[0m %s\n' "$*" >&2; exit 1; }

# ── entrada ──────────────────────────────────────────────────
verificar=1
refazer=0
alvo=origin/main

for arg in "$@"; do
  case "$arg" in
    --sem-verificar)   verificar=0 ;;
    --refazer-imagens) refazer=1 ;;
    -h|--help)         sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*)                falhar "opção desconhecida: $arg" ;;
    *)                 alvo="$arg" ;;
  esac
done

command -v docker >/dev/null || falhar "docker não encontrado"
[[ -d "$STACK/.git" ]] || falhar "$STACK não é um clone do repositório"

cd "$STACK"
git fetch --quiet --prune origin
commit="$(git rev-parse --verify "${alvo}^{commit}" 2>/dev/null)" \
  || falhar "referência inválida: $alvo"
curto="${commit:0:7}"
tag="sha-$curto"
log "alvo $alvo → $curto ($(git log -1 --format=%s "$commit" | cut -c1-60))"

# ── worktree limpa do commit ─────────────────────────────────
# NUNCA dar checkout em $STACK: o HEAD é compartilhado com as outras sessões e
# é o que descreve o compose que está no ar. Cada publicação ganha sua worktree
# destacada, reaproveitada se já existir no commit certo — inclusive a de uma
# publicação anterior que falhou no meio, já que só a bem-sucedida se apaga
# sozinha no passo 5 (faxina).
arvore="$STACK/.claude/worktrees/publicar-$curto"
if [[ -d "$arvore" ]]; then
  atual="$(git -C "$arvore" rev-parse HEAD 2>/dev/null || true)"
  [[ "$atual" == "$commit" ]] \
    || falhar "$arvore existe em $atual, não em $commit — remova-a à mão e rode de novo"
  log "worktree reaproveitada: $arvore"
else
  git worktree add --detach --quiet "$arvore" "$commit"
  log "worktree criada: $arvore"
fi

# ── 1. verificação (o job `typecheck + testes + build` do ci.yml) ──
# Mesma ordem do workflow: sem `shared build` o tsc da api enxerga o contrato
# antigo, e sem `prisma generate` ela acusa `any` implícito no que vem do
# client. O export do desktop no fim prova que o instalador ainda builda — uma
# rota dinâmica sem generateStaticParams só quebra ali.
if ((verificar)); then
  log "verificando em $IMAGEM_NODE (typecheck, testes, lint, build, export)"
  docker run --rm -v "$arvore:/w" -w /w -e CI=1 "$IMAGEM_NODE" bash -lc '
    set -euo pipefail
    corepack enable
    pnpm install --frozen-lockfile
    pnpm --filter @streamz/api exec prisma generate
    pnpm --filter @streamz/shared build
    pnpm --filter @streamz/shared exec tsc --noEmit
    pnpm --filter @streamz/api exec tsc --noEmit
    pnpm --filter @streamz/web exec tsc --noEmit
    pnpm --filter @streamz/api test
    pnpm --filter @streamz/web test
    pnpm --filter @streamz/web lint
    NEXT_TELEMETRY_DISABLED=1 pnpm --filter @streamz/web build
    NEXT_OUTPUT=export NEXT_TELEMETRY_DISABLED=1 pnpm --filter @streamz/web build
  ' || falhar "a verificação falhou — nada foi buildado nem implantado"
  log "verificação verde"

  # O Rust do desktop não compila neste Linux (o alvo é msvc): dá para checar a
  # formatação, e só. O `clippy` de verdade é o job do desktop.yml, no Windows.
  if docker run --rm -v "$arvore/apps/desktop/src-tauri:/s" -w /s rust:1-slim \
       bash -c 'export PATH=/usr/local/cargo/bin:$PATH
                rustup component add rustfmt >/dev/null 2>&1
                cargo fmt --check'; then
    log "cargo fmt --check ok (clippy do Windows NÃO rodou)"
  else
    falhar "cargo fmt --check reprovou em apps/desktop/src-tauri"
  fi
else
  log "verificação pulada (--sem-verificar)"
fi

# ── 2. imagens (o job `build das imagens` do ci.yml) ─────────
# Sem push: o host não está logado no GHCR e o compose não puxa o que já existe
# no disco. Mesmo contexto (a raiz) e mesmos Dockerfiles do workflow.
construir() {
  local app="$1"
  local imagem="$REPO/streamz-$app:$tag"
  if ((!refazer)) && docker image inspect "$imagem" >/dev/null 2>&1; then
    log "imagem $imagem já existe — pulando (use --refazer-imagens)"
    return 0
  fi
  log "buildando $imagem"
  if [[ "$app" == web ]]; then
    docker build -f apps/web/Dockerfile \
      --build-arg "NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL" \
      --build-arg "NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL" \
      --build-arg "NEXT_PUBLIC_LIVEKIT_URL=$NEXT_PUBLIC_LIVEKIT_URL" \
      -t "$imagem" "$arvore"
  else
    docker build -f apps/api/Dockerfile -t "$imagem" "$arvore"
  fi
}

cd "$arvore"
construir api || falhar "build da imagem da api falhou"
construir web || falhar "build da imagem da web falhou"
cd "$STACK"

# ── 3. implantar (o deploy.yml / comando forçado) ────────────
# Só api e web: postgres e livekit não mudam de imagem aqui. A API aplica as
# migrations no boot (RUN_MIGRATIONS=1 no .env).
#
# STREAMZ_TAG é obrigatória: o docker-compose.ghcr.yml usa `${STREAMZ_TAG:-latest}`
# e sem ela o compose tenta puxar `:latest` do GHCR e morre em `unauthorized`.
# `docker restart` não serve para nada disto — não relê o .env.
log "implantando $tag"
STREAMZ_TAG="$tag" docker compose \
  -f docker-compose.yml \
  -f docker-compose.traefik.yml \
  -f docker-compose.ghcr.yml \
  --profile livekit up -d --no-build api web

# ── 4. prova ─────────────────────────────────────────────────
log "aguardando health de api e web"
fim=$((SECONDS + ESPERA_SEGUNDOS))
estado=desconhecido
while ((SECONDS < fim)); do
  estado="$(docker inspect -f '{{.Name}}={{if .State.Health}}{{.State.Health.Status}}{{else}}sem-health{{end}}' \
            streamz-api streamz-web 2>/dev/null || true)"
  # `if`, não `&&`: sob `set -e` um `&&` que falha como último comando do laço
  # derrubaria o script sem mensagem nenhuma.
  if [[ "$(grep -c '=healthy$' <<<"$estado")" == "2" ]]; then break; fi
  sleep 3
done
if [[ "$(grep -c '=healthy$' <<<"$estado")" != "2" ]]; then
  docker logs streamz-api --tail 40 >&2 || true
  falhar "api/web não ficaram saudáveis em ${ESPERA_SEGUNDOS}s — a versão anterior NÃO foi restaurada"
fi

saude="$(curl -fsS https://api.streamz.chat/api/health || echo '(sem resposta)')"
web_http="$(curl -s -o /dev/null -w '%{http_code}' https://streamz.chat/ || echo '000')"

# ── 5. faxina ──────────────────────────────────────────────────
# Só chega aqui quem passou pela prova de saúde — publicação que falhou já saiu
# por `falhar` (set -euo pipefail), então nada abaixo roda numa publicação
# malsucedida. Nada aqui pode derrubar uma publicação que já deu certo: toda
# falha de remoção vira só `log`, nunca `falhar`.

# A worktree não é mais necessária: a imagem já foi buildada e o contêiner roda
# dela, não da pasta. `--force` porque git recusaria remover com mudanças (não
# deveria haver nenhuma, mas não é motivo para travar a faxina).
if git -C "$STACK" worktree remove --force "$arvore" 2>/dev/null; then
  git -C "$STACK" worktree prune --quiet 2>/dev/null || true
  log "faxina: worktree removida ($arvore)"
else
  log "faxina: não consegui remover $arvore — verifique à mão"
fi

# Guarda só as $IMAGENS_GUARDADAS mais novas de cada app. A tag recém-publicada
# e a que o contêiner está rodando agora nunca são apagadas, mesmo que por
# algum motivo não estejam entre as mais novas (ex.: publicação de uma
# referência antiga, voltando versão) — por isso elas contam posição na lista
# mas pulam o `docker rmi` em vez de ficarem de fora da ordenação.
guardadas=()
for app in api web; do
  imagem_em_uso="$(docker inspect -f '{{.Config.Image}}' "streamz-$app" 2>/dev/null || true)"
  tags=()
  # `sort -r` sobre `CreatedAt\tTag` funciona porque o timestamp do docker vem
  # com largura fixa; `|| true` no fim evita que o `grep` sem match (nenhuma
  # imagem `sha-*` ainda) derrube o script sob pipefail.
  mapfile -t tags < <(
    docker images "$REPO/streamz-$app" --format '{{.CreatedAt}}\t{{.Tag}}' \
      | grep -E $'\t''sha-[0-9a-f]{7}$' \
      | sort -r \
      | cut -f2 \
      || true
  )
  posicao=0
  for t in "${tags[@]}"; do
    [[ -z "$t" ]] && continue
    ((++posicao))
    imagem="$REPO/streamz-$app:$t"
    if ((posicao <= IMAGENS_GUARDADAS)) || [[ "$t" == "$tag" ]] || [[ "$imagem" == "$imagem_em_uso" ]]; then
      guardadas+=("$imagem")
      continue
    fi
    if docker rmi "$imagem" >/dev/null 2>&1; then
      log "faxina: imagem $imagem removida"
    else
      log "faxina: não consegui remover $imagem (provavelmente em uso) — deixei"
    fi
  done
done

echo
log "publicado"
printf '  imagens : %s/streamz-api:%s\n            %s/streamz-web:%s\n' "$REPO" "$tag" "$REPO" "$tag"
printf '  em pé   : %s\n' "$(docker ps --filter name=streamz --format '{{.Names}}={{.Image}}' | tr '\n' ' ')"
printf '  health  : %s\n' "$saude"
printf '  web     : HTTP %s\n' "$web_http"
printf '  não fez : instalador .exe do desktop e clippy do Rust (exigem Windows)\n'
printf '  guardadas: %s\n' "$(IFS=' '; echo "${guardadas[*]:-nenhuma}")"
