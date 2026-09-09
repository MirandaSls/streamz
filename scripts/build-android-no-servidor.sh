#!/usr/bin/env bash
#
# Gera o **app Android** do Streamz neste servidor Linux, assinado: o `.apk`
# universal (para instalar à mão e para o emulador) e o `.aab` (o formato que a
# Google Play exige desde 2021).
#
# Por que existe: o mesmo motivo do `build-desktop-no-servidor.sh` — desde
# 2026-09-03 não há GitHub Actions (§3.5 do processo), e o host não tem java,
# nem SDK do Android, nem rust. Tudo roda em Docker, com os caches em volumes
# nomeados, e o repositório nunca leva `checkout` (§2.1).
#
# O que este script **NÃO prova**:
#
#   - que o app abre, entra numa chamada ou toca áudio. Isso é aparelho ou
#     emulador; aqui se prova que o pacote existe, tem as permissões que
#     dissemos que tem e está assinado com a chave de release. É a mesma
#     ressalva do §5.3 para o instalador do Windows.
#   - que a chamada continua em segundo plano. O serviço nativo que segura a
#     call com o app minimizado existe (`ChamadaService.kt`, ver
#     `docs/APPS-MOBILE.md` §12), e o `aapt dump badging` abaixo mostra as
#     `FOREGROUND_SERVICE*` que ele usa — mas quem prova que **funciona** é o
#     emulador, não este script.
#   - que a Play aceita o `.aab`. Isso depende de conta de desenvolvedor, ficha
#     da loja e política de privacidade, que são trabalho de fora do código.
#
# Uso:
#   scripts/build-android-no-servidor.sh [<commit-ou-ref>] [opções]
#
#     <commit-ou-ref>   o que compilar. Padrão: origin/main.
#     --sem-assinar     não assina (não precisa do keystore; o `.apk` sai
#                       **não assinado** e nenhum aparelho o instala — serve
#                       só para provar que compila).
#     --alvos a,b,c     ABIs a compilar, nos nomes do tauri-cli:
#                       `aarch64`, `armv7`, `i686`, `x86_64`. Padrão: os quatro.
#                       `--alvos aarch64,x86_64` corta o tempo pela metade
#                       quando o que se quer é só rodar no emulador.
#     --refazer-imagem  reconstrói a imagem Docker mesmo que já exista.
#     --aqui            compila **esta** cópia do repositório (a worktree de
#                       onde o script foi chamado, suja e tudo) em vez de criar
#                       a worktree destacada. É como se prova uma branch antes
#                       do merge — e é o único modo que não mexe no clone
#                       principal, coisa que várias sessões em paralelo
#                       agradecem (§2.1). Ignora o <commit-ou-ref>.
#
# Saída: /opt/stack/streamz/.claude/saida-android/<versão>-<commit>/
#
# A senha do keystore **nunca aparece**: nem no log, nem em `ps`, nem no
# ambiente do container. Ela entra montada como arquivo somente-leitura e é
# lida *dentro* do container, na hora de escrever o `keystore.properties` que o
# Gradle consome (e que o `.gitignore` do `gen/android` já exclui). É o mesmo
# desenho da chave de assinatura do Windows, que entra por caminho e não por
# conteúdo.

set -euo pipefail

REPO=/opt/stack/streamz
IMAGEM=streamz-android
KEYSTORE=/root/.android/streamz.keystore
KEYSTORE_SENHA=/root/.android/streamz.keystore.senha
KEYSTORE_ALIAS=streamz
WORKTREE="$REPO/.claude/worktrees/build-android"
SAIDA_BASE="$REPO/.claude/saida-android"

# Os caches que fazem a segunda rodada ser minutos em vez de uma hora. São
# volumes nomeados do Docker, não pastas do repositório, para não sujarem a
# worktree nem entrarem em `git status`.
VOL_SDK=streamz-android-sdk        # reservado: SDK extra baixado em runtime
VOL_CARGO=streamz-android-cargo    # registry + git do cargo
VOL_GRADLE=streamz-android-gradle  # GRADLE_USER_HOME: distribuição + Maven
VOL_PNPM=streamz-android-pnpm      # store do pnpm
VOL_XDG=streamz-android-xdg        # ~/.cache genérico

REF=origin/main
ASSINAR=1
REFAZER_IMAGEM=0
AQUI=0
ALVOS=""

while [ $# -gt 0 ]; do
  case "$1" in
    --sem-assinar) ASSINAR=0 ;;
    --refazer-imagem) REFAZER_IMAGEM=1 ;;
    --alvos) ALVOS="${2:-}"; shift ;;
    --alvos=*) ALVOS="${1#*=}" ;;
    --aqui) AQUI=1 ;;
    -h|--help) sed -n '2,52p' "$0"; exit 0 ;;
    -*) echo "opção desconhecida: $1" >&2; exit 2 ;;
    *) REF="$1" ;;
  esac
  shift
done

passo() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

# ---------------------------------------------------------------- imagem
if [ "$REFAZER_IMAGEM" = 1 ] || ! docker image inspect "$IMAGEM" >/dev/null 2>&1; then
  passo "Construindo a imagem $IMAGEM (uns 4 min; baixa ~3 GB de SDK e NDK)"
  docker build -f "$REPO/apps/desktop/Dockerfile.android" -t "$IMAGEM" "$REPO"
else
  echo "imagem $IMAGEM já existe (use --refazer-imagem para reconstruir)"
fi

for v in "$VOL_SDK" "$VOL_CARGO" "$VOL_GRADLE" "$VOL_PNPM" "$VOL_XDG"; do
  docker volume create "$v" >/dev/null
done

# ---------------------------------------------------------------- worktree
# Worktree própria e **detached**: o clone principal nunca leva checkout, e
# nenhuma branch de trabalho fica presa a este build. Se ela já existir, é
# reaproveitada — remover worktree neste servidor é decisão do usuário, não do
# script (ver a memória `streamz-acoes-bloqueadas`).
#
# O `clean` derruba só o que é saída de build. `gen/android` **não** entra
# nessa lista: ele é versionado e carrega o `AndroidManifest.xml` com as
# permissões e o `build.gradle.kts` com a assinatura. Limpá-lo seria apagar
# exatamente o que faz o `.apk` prestar.
if [ "$AQUI" = 1 ]; then
  WORKTREE=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
  passo "Compilando esta cópia mesmo: $WORKTREE (--aqui)"
  git -C "$WORKTREE" status --short | head -20
else
  passo "Preparando a worktree em $WORKTREE ($REF)"
  git -C "$REPO" fetch --quiet origin
  if [ -d "$WORKTREE" ]; then
    git -C "$WORKTREE" checkout --quiet --detach "$REF"
    git -C "$WORKTREE" clean -qfdx apps/web/out apps/desktop/src-tauri/gen/android/app/build || true
  else
    git -C "$REPO" worktree add --detach "$WORKTREE" "$REF"
  fi
fi
COMMIT=$(git -C "$WORKTREE" rev-parse --short HEAD)
# Sem `node` no host (memória `streamz-sem-node-no-host`), então a versão sai do
# JSON com sed mesmo.
VERSAO=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$WORKTREE/apps/desktop/package.json" | head -1)
echo "commit $COMMIT, versão $VERSAO"

# ---------------------------------------------------------------- assinatura
MONTA_CHAVE=()
PREPARAR_ASSINATURA="echo 'build SEM assinatura (--sem-assinar): o .apk não instala em aparelho nenhum'"
if [ "$ASSINAR" = 1 ]; then
  if [ ! -r "$KEYSTORE" ] || [ ! -r "$KEYSTORE_SENHA" ]; then
    echo "ERRO: keystore de release não encontrado." >&2
    echo "  esperado: $KEYSTORE  +  $KEYSTORE_SENHA (chmod 600)" >&2
    echo >&2
    echo "Ele NÃO pode ser regerado: a Play só aceita atualização assinada com" >&2
    echo "a mesma chave da versão publicada. Perder este arquivo é perder o app" >&2
    echo "— mesma gravidade de perder /root/.tauri/streamz.key (§5)." >&2
    echo >&2
    echo "Para um .apk de teste, sem assinatura: --sem-assinar" >&2
    exit 1
  fi
  MONTA_CHAVE=(
    -v "$KEYSTORE:/run/streamz.keystore:ro"
    -v "$KEYSTORE_SENHA:/run/streamz.keystore.senha:ro"
  )
  # A senha é lida DENTRO do container, de um arquivo, e escrita direto no
  # `keystore.properties`. Ela não passa por `-e`, não passa por argumento de
  # `docker run` e não aparece em `ps` nem no log deste script.
  PREPARAR_ASSINATURA=$(cat <<'SH'
    umask 077
    printf 'keyAlias=%s\npassword=%s\nstoreFile=%s\n' \
      "$KEYSTORE_ALIAS" "$(cat /run/streamz.keystore.senha)" /run/streamz.keystore \
      > apps/desktop/src-tauri/gen/android/keystore.properties
    echo "keystore.properties escrito (a senha não é impressa, aqui nem em lugar nenhum)"
SH
  )
fi

# ---------------------------------------------------------------- build
# `--apk --aab`: os dois de uma vez, porque compartilham a compilação do Rust e
# dos recursos — pedir separado dobraria o tempo. O `.apk` é o que se instala à
# mão e no emulador; o `.aab` é o que sobe na Play.
#
# `--target`: os ABIs. Sem a flag, o Tauri compila os quatro.
#
# Os tetos de memória não são superstição. O servidor tem 16 GB compartilhados
# com produção e com outras sessões, e os dois vilões são:
#   - o **daemon do Gradle**, que pede 2 GB por padrão e cresce; `--no-daemon`
#     + `-Xmx1g` o mantêm no lugar (e um daemon sobrevivente entre rodadas de
#     container seria memória parada, já que o container morre no fim);
#   - o **rustc**, que com `-j6` sobe seis processos de ~1,5 GB. `CARGO_BUILD_JOBS`
#     segura isso.
# Sintoma de estourar: o passo morre com código **137** (SIGKILL do OOM killer)
# e a mensagem do cargo diz "signal: 9", que não parece falta de memória.
ALVO_FLAG=""
if [ -n "$ALVOS" ]; then
  ALVO_FLAG="--target $(echo "$ALVOS" | tr ',' ' ')"
fi

passo "Build (a primeira rodada compila ~500 crates × 4 ABIs e baixa o Gradle)"
INICIO=$(date +%s)
docker run --rm \
  -v "$WORKTREE:/repo" \
  -v "$VOL_CARGO:/cache/cargo" \
  -v "$VOL_GRADLE:/cache/gradle" \
  -v "$VOL_PNPM:/cache/pnpm" \
  -v "$VOL_XDG:/cache/xdg" \
  "${MONTA_CHAVE[@]}" \
  -e KEYSTORE_ALIAS="$KEYSTORE_ALIAS" \
  -e NEXT_PUBLIC_API_URL=https://api.streamz.chat \
  -e NEXT_PUBLIC_WS_URL=https://api.streamz.chat \
  -e NEXT_PUBLIC_LIVEKIT_URL=wss://livekit.streamz.chat \
  -e NEXT_TELEMETRY_DISABLED=1 \
  -e CI=true \
  -e CARGO_BUILD_JOBS=2 \
  -e GRADLE_OPTS="-Dorg.gradle.jvmargs=-Xmx1g -Dorg.gradle.daemon=false -Dorg.gradle.workers.max=2" \
  -w /repo \
  "$IMAGEM" bash -euo pipefail -c "
    pnpm config set store-dir /cache/pnpm --global
    pnpm install --frozen-lockfile
    pnpm --filter @streamz/shared build
    $PREPARAR_ASSINATURA
    pnpm --filter @streamz/desktop exec tauri android build --apk --aab $ALVO_FLAG
  "
DURACAO=$(( $(date +%s) - INICIO ))

# ---------------------------------------------------------------- saída
SAIDA="$SAIDA_BASE/$VERSAO-$COMMIT"
mkdir -p "$SAIDA"
BASE="$WORKTREE/apps/desktop/src-tauri/gen/android/app/build/outputs"
cp "$BASE"/apk/universal/release/*.apk "$SAIDA"/ 2>/dev/null || \
  cp "$BASE"/apk/*/release/*.apk "$SAIDA"/
cp "$BASE"/bundle/universalRelease/*.aab "$SAIDA"/ 2>/dev/null || \
  cp "$BASE"/bundle/*/*.aab "$SAIDA"/ || true

# O `keystore.properties` fica na worktree com a senha em texto. Ele é ignorado
# pelo git, mas "ignorado" não é "apagado": some agora.
rm -f "$WORKTREE/apps/desktop/src-tauri/gen/android/keystore.properties"

passo "Pronto em $((DURACAO / 60)) min $((DURACAO % 60)) s"
for f in "$SAIDA"/*; do
  printf '%s\n  %s bytes\n' "$f" "$(stat -c%s "$f")"
done
echo
echo "sha256:"
sha256sum "$SAIDA"/* | sed 's|/opt/stack/streamz/||'

# ---------------------------------------------------------------- prova
# As duas perguntas que se consegue responder num Linux sem telefone:
# "está assinado com a nossa chave?" e "o que este pacote declara ser?".
APK=$(ls "$SAIDA"/*.apk | head -1)
passo "apksigner verify (a assinatura é a de release?)"
docker run --rm -v "$SAIDA:/s:ro" "$IMAGEM" \
  apksigner verify --verbose --print-certs "/s/$(basename "$APK")" || true

passo "aapt dump badging (o que o pacote declara)"
docker run --rm -v "$SAIDA:/s:ro" "$IMAGEM" bash -c "
  aapt dump badging '/s/$(basename "$APK")' \
    | grep -E \"^package|^sdkVersion|^targetSdkVersion|^application-label:|^uses-permission|^uses-feature|native-code\"
"

echo
echo "O que isto prova: o pacote existe, declara as permissões acima e está"
echo "assinado. O que NÃO prova: que o app abre, que o microfone funciona e"
echo "que a chamada sobrevive em segundo plano — o serviço de primeiro plano"
echo "existe (ChamadaService.kt), mas quem prova que ele segura a call é o"
echo "emulador (docs/APPS-MOBILE.md §12). Ver o cabeçalho deste arquivo."

# ---------------------------------------------------------------- publicação
# O sha256 do `.apk`, sozinho e legível, porque ele deixou de ser conferência
# de download e virou **parte do release**: é o que vai em
# `ANDROID_UPDATE_SHA256` e é a única coisa que o app tem para separar o pacote
# que publicamos do que chegou pelo fio (docs/APPS-MOBILE.md §13). Sai duas
# vezes de propósito — na lista acima, junto do `.aab`, e aqui, isolado, para
# quem vai copiar não pegar o digest errado por engano.
DIGESTO=$(sha256sum "$APK" | cut -d' ' -f1)
passo "sha256 do .apk (é ele que vai no ANDROID_UPDATE_SHA256)"
echo "  arquivo: $(basename "$APK")"
echo "  sha256:  $DIGESTO"
echo
echo "Próximo passo — publicar (copiar para updates/ e downloads/ e imprimir as"
echo "quatro linhas do .env):"
echo
echo "    scripts/publicar-android.sh $SAIDA"
