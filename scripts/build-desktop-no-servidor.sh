#!/usr/bin/env bash
#
# Gera o instalador Windows do Streamz **neste servidor Linux**, assinado,
# sem gastar minuto de runner Windows do GitHub Actions.
#
# Por que existe: o repositório é privado e o runner `windows-latest` custa 2×
# o de Linux; um instalador leva ~35 min lá. O alvo compilado aqui é o mesmo do
# CI (`x86_64-pc-windows-msvc`, CRT estática pelo `.cargo/config.toml`), a
# `libwebrtc` do LiveKit é a mesma que o `webrtc-sys` baixa no Windows, e o
# empacotador NSIS do Tauri roda no Linux sem gambiarra. O que muda é o
# compilador — `clang-cl`/`lld-link` em vez de `cl.exe`/`link.exe`.
#
# O que este script NÃO prova: que o .exe instala e abre. Isso só o Windows
# diz. Ver `docs/PROCESSO-DE-DESENVOLVIMENTO.md` §5.3.
#
# Uso:
#   scripts/build-desktop-no-servidor.sh [<commit-ou-ref>] [opções]
#
#     <commit-ou-ref>   o que compilar. Padrão: origin/main.
#     --sem-assinar     não assina (não precisa da chave; o .exe sai sem .sig
#                       e não serve para o atualizador, só para teste).
#     --refazer-imagem  reconstrói a imagem Docker mesmo que já exista.
#
# Saída: /opt/stack/streamz/.claude/saida-desktop/<versão>-<commit>/
#
# A chave privada nunca aparece no log: ela entra no container montada como
# arquivo somente-leitura, e o `TAURI_SIGNING_PRIVATE_KEY` carrega só o
# *caminho* (o tauri-cli aceita caminho ou conteúdo — `src/bundle.rs`). A
# assinatura gerada também não é impressa: o script mostra o tamanho do `.sig`
# e o caminho, e quem precisa do conteúdo dá `cat` nele de propósito.

set -euo pipefail

REPO=/opt/stack/streamz
IMAGEM=streamz-xwin
CHAVE=/root/.tauri/streamz.key
WORKTREE="$REPO/.claude/worktrees/build-desktop"
SAIDA_BASE="$REPO/.claude/saida-desktop"
ALVO=x86_64-pc-windows-msvc

# Os quatro caches que fazem a segunda rodada ser minutos em vez de uma hora.
# São volumes nomeados do Docker, não pastas do repositório, para não sujarem
# a worktree nem entrarem em `git status`.
VOL_CARGO=streamz-cargo          # registry + git do cargo
VOL_XWIN=streamz-xwin-cache      # CRT e SDK do Windows (~2 GB, baixados 1×)
VOL_PNPM=streamz-pnpm            # store do pnpm
VOL_XDG=streamz-xdg              # ~/.cache: é onde o tauri-bundler guarda o NSIS

REF=origin/main
ASSINAR=1
REFAZER_IMAGEM=0

for arg in "$@"; do
  case "$arg" in
    --sem-assinar) ASSINAR=0 ;;
    --refazer-imagem) REFAZER_IMAGEM=1 ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    -*) echo "opção desconhecida: $arg" >&2; exit 2 ;;
    *) REF="$arg" ;;
  esac
done

passo() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

# ---------------------------------------------------------------- imagem
if [ "$REFAZER_IMAGEM" = 1 ] || ! docker image inspect "$IMAGEM" >/dev/null 2>&1; then
  passo "Construindo a imagem $IMAGEM (uns 2 min)"
  docker build -f "$REPO/apps/desktop/Dockerfile.xwin" -t "$IMAGEM" "$REPO"
else
  echo "imagem $IMAGEM já existe (use --refazer-imagem para reconstruir)"
fi

for v in "$VOL_CARGO" "$VOL_XWIN" "$VOL_PNPM" "$VOL_XDG"; do
  docker volume create "$v" >/dev/null
done

# ---------------------------------------------------------------- worktree
# Worktree própria e **detached**: o clone principal nunca leva checkout, e
# nenhuma branch de trabalho fica presa a este build. Se ela já existir, é
# reaproveitada — remover worktree neste servidor é decisão do usuário, não do
# script (ver a memória `streamz-acoes-bloqueadas`).
passo "Preparando a worktree em $WORKTREE ($REF)"
git -C "$REPO" fetch --quiet origin
if [ -d "$WORKTREE" ]; then
  git -C "$WORKTREE" checkout --quiet --detach "$REF"
  git -C "$WORKTREE" clean -qfdx apps/desktop/src-tauri/gen apps/web/out || true
else
  git -C "$REPO" worktree add --detach "$WORKTREE" "$REF"
fi
COMMIT=$(git -C "$WORKTREE" rev-parse --short HEAD)
# Sem `node` no host (ver a memória `streamz-sem-node-no-host`), então a versão
# sai do JSON com sed mesmo.
VERSAO=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$WORKTREE/apps/desktop/package.json" | head -1)
echo "commit $COMMIT, versão $VERSAO"

# ---------------------------------------------------------------- assinatura
MONTA_CHAVE=()
ENV_CHAVE=()
CONFIG_RELEASE=()
if [ "$ASSINAR" = 1 ]; then
  if [ ! -r "$CHAVE" ]; then
    echo "ERRO: chave de assinatura não encontrada em $CHAVE." >&2
    echo "Ela é a mesma do segredo TAURI_SIGNING_PRIVATE_KEY do repositório." >&2
    echo "Sem ela o atualizador recusa o pacote; use --sem-assinar para um .exe de teste." >&2
    exit 1
  fi
  MONTA_CHAVE=(-v "$CHAVE:/run/chave-de-assinatura:ro")
  ENV_CHAVE=(
    -e TAURI_SIGNING_PRIVATE_KEY=/run/chave-de-assinatura
    -e TAURI_SIGNING_PRIVATE_KEY_PASSWORD=
  )
  # `createUpdaterArtifacts: true` — o mesmo arquivo que o desktop.yml usa com
  # `release=true`. É ele que faz sair o `.sig` ao lado do `.exe`.
  CONFIG_RELEASE=(--config src-tauri/tauri.release.conf.json)
fi

# ---------------------------------------------------------------- build
# `--bundles nsis`: o `tauri.conf.json` pede nsis **e** msi, e o MSI depende do
# WiX, que é Windows-only. Pedir os dois aqui quebraria no fim do build.
#
# `--runner cargo-xwin`: troca `cargo` por `cargo xwin`, que exporta
# CC/CXX/AR/CFLAGS do clang-cl e o sysroot da CRT antes de chamar o cargo de
# verdade. É o que faz o `build.rs` do `webrtc-sys` (LiveKit) compilar o glue
# C++ para MSVC.
#
# O `RUSTFLAGS` abaixo existe por causa de um empate de configuração da CRT que
# só aparece nesta combinação (levou duas rodadas para achar):
#
#   - o `tauri build` exporta `STATIC_VCRUNTIME=true`, e com isso o `build.rs`
#     do `tauri-build` (`static_vcruntime.rs`) emite
#     `/NODEFAULTLIB:libucrt.lib` + `/DEFAULTLIB:ucrt.lib` — ou seja: CRT
#     estática (`libcmt`) com **UCRT dinâmica**, que é a combinação que o
#     runner Windows produz hoje;
#   - o `cargo-xwin`, ao ver `+crt-static` no `.cargo/config.toml`, acrescenta
#     `-nodefaultlib:ucrt -defaultlib:libucrt`, querendo a UCRT **estática**.
#
# Um cancela o outro e o binário fica sem UCRT nenhuma: o link morre com
# centenas de `undefined symbol: cos/sin/strlen/_wassert...`. Passar a
# `ucrt.lib` como **arquivo de entrada** (e não como `/DEFAULTLIB`) escapa do
# `/NODEFAULTLIB` e devolve exatamente o que o Windows monta. O `+crt-static`
# vem junto porque `RUSTFLAGS` no ambiente substitui — não soma — o que está no
# `.cargo/config.toml` do repositório, que continua intocado.
FLAGS_CRT="-C target-feature=+crt-static -C link-arg=/cache/xwin/xwin/sdk/lib/ucrt/x86_64/ucrt.lib"

passo "Build (a primeira rodada compila ~700 crates e baixa a libwebrtc)"
INICIO=$(date +%s)
docker run --rm \
  -v "$WORKTREE:/repo" \
  -v "$VOL_CARGO:/cache/cargo" \
  -v "$VOL_XWIN:/cache/xwin" \
  -v "$VOL_PNPM:/cache/pnpm" \
  -v "$VOL_XDG:/cache/xdg" \
  "${MONTA_CHAVE[@]}" \
  -e NEXT_PUBLIC_API_URL=https://api.streamz.chat \
  -e NEXT_PUBLIC_WS_URL=https://api.streamz.chat \
  -e NEXT_PUBLIC_LIVEKIT_URL=wss://livekit.streamz.chat \
  -e NEXT_TELEMETRY_DISABLED=1 \
  -e CI=true \
  -e RUSTFLAGS="$FLAGS_CRT" \
  "${ENV_CHAVE[@]}" \
  -w /repo \
  "$IMAGEM" bash -euo pipefail -c "
    pnpm config set store-dir /cache/pnpm --global
    pnpm install --frozen-lockfile
    pnpm --filter @streamz/shared build
    pnpm --filter @streamz/desktop exec tauri build \
      --runner cargo-xwin --target $ALVO --bundles nsis ${CONFIG_RELEASE[*]}
  "
DURACAO=$(( $(date +%s) - INICIO ))

# ---------------------------------------------------------------- saída
BUNDLE="$WORKTREE/apps/desktop/src-tauri/target/$ALVO/release/bundle/nsis"
SAIDA="$SAIDA_BASE/$VERSAO-$COMMIT"
mkdir -p "$SAIDA"
cp "$BUNDLE"/*.exe "$SAIDA"/
[ "$ASSINAR" = 1 ] && cp "$BUNDLE"/*.sig "$SAIDA"/

passo "Pronto em $((DURACAO / 60)) min $((DURACAO % 60)) s"
for f in "$SAIDA"/*; do
  printf '%s\n  %s bytes  %s\n' "$f" "$(stat -c%s "$f")" "$(file -b "$f" | cut -c1-60)"
done
echo
echo "sha256:"
sha256sum "$SAIDA"/*.exe
echo
echo "A assinatura (o que vai em DESKTOP_UPDATE_SIGNATURE do .env) está no .sig"
echo "acima; ela não é impressa aqui de propósito. Ver o §5 do processo."
echo "O stub do NSIS é PE32 (todo instalador NSIS é); o binário do app que ele"
echo "carrega dentro é PE32+ x86-64. Só o Windows prova que o instalador roda:"
echo "aqui se prova que ele existe, tem o tamanho esperado e está assinado com a"
echo "chave do atualizador."
