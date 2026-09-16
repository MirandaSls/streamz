#!/usr/bin/env bash
#
# Gera o instalador macOS do Streamz — **um `.dmg` universal** (Intel e Apple
# Silicon no mesmo arquivo). Roda **num Mac**; não existe caminho a partir do
# servidor Linux, porque o `.app` precisa do `codesign`, do `lipo` e do
# `hdiutil`, que só o macOS tem.
#
# Por que universal e não um `.dmg` por chip: o navegador não revela o chip do
# Mac (o Safari de um M3 ainda se apresenta como "Intel Mac OS X"), então a
# página de download não tem como escolher entre dois arquivos — e baixar o
# errado num Intel dá "o app não pode ser aberto" sem explicação. O custo é o
# tamanho (dois binários dentro do `.app`) e o tempo de build (o cargo compila
# o crate duas vezes, uma por arquitetura, e o `lipo` junta).
#
# O que este script NÃO faz: notarização. Não há conta Apple Developer, então
# o Gatekeeper avisa na primeira abertura de quem baixou pelo navegador, com
# qualquer uma das duas assinaturas abaixo. A página de download explica o
# "botão direito → Abrir".
#
# Assinatura — duas formas, e a diferença importa para o usuário:
#   * com `--certificado` (ou APPLE_CERTIFICATE no ambiente): assina com o
#     certificado AUTOASSINADO do `scripts/gerar-certificado-mac.sh`. O
#     "designated requirement" fica `identifier "dev.streamz.app" and
#     certificate root = H"<sha1>"`, igual em todo build, então o TCC mantém as
#     permissões de microfone/câmera/tela entre versões, e o instalador pode
#     fixar a impressão digital do certificado.
#   * sem certificado: ad-hoc (`signingIdentity: "-"` do
#     `tauri.macos.conf.json`). O requirement é o cdhash, que muda a cada
#     build: o macOS pede as permissões de novo depois de cada atualização.
#
# Uso:
#   scripts/build-desktop-macos.sh [<commit-ou-ref>] [opções]
#
#     <commit-ou-ref>                 o que compilar. Padrão: origin/main.
#     --assinar-atualizador <chave>   liga o `tauri.release.conf.json` e assina o
#                                     pacote do atualizador (`.app.tar.gz` +
#                                     `.sig`) com a chave minisign do Tauri. A
#                                     senha, se houver, vem do ambiente em
#                                     TAURI_SIGNING_PRIVATE_KEY_PASSWORD.
#                                     Padrão: sem assinar (a API ainda não serve
#                                     atualização para macOS).
#     --sem-finder                    monta o `.dmg` sem o AppleScript do Finder
#                                     (sem a janela arrumada com a seta para
#                                     Aplicativos). Ligado sozinho quando o
#                                     script roda por SSH, onde o Finder não
#                                     responde e o `bundle_dmg.sh` morreria.
#     --certificado <p12>             assina com o certificado autoassinado
#                                     (o `.p12` do gerar-certificado-mac.sh).
#     --senha-do-certificado-em <arq> lê a senha do `.p12` da primeira linha do
#                                     arquivo. Sem ela: APPLE_CERTIFICATE_PASSWORD
#                                     do ambiente, ou pergunta no terminal.
#
# Ambiente (alternativa ao `--certificado`, é o que o CI usa):
#     APPLE_CERTIFICATE           o `.p12` em base64
#     APPLE_CERTIFICATE_PASSWORD  a senha dele
#     APPLE_SIGNING_IDENTITY      opcional: SHA-1 esperado do certificado; o
#                                 build para se não bater com o `.p12`
#
# Saída: <repo>/.claude/saida-desktop/<versão>-<commit>-macos/

set -euo pipefail

# ---------------------------------------------------------------- caminhos
# O repositório é o que contém este script, e não o diretório atual: dá para
# chamar de qualquer pasta.
REPO=$(cd "$(dirname "$0")/.." && pwd)
WORKTREE="$REPO/.claude/worktrees/build-desktop-macos"
SAIDA_BASE="$REPO/.claude/saida-desktop"
ALVO=universal-apple-darwin

REF=origin/main
CHAVE=""
SEM_FINDER=0
CERTIFICADO=""
ARQUIVO_SENHA=""

# `while`/`shift` em vez de `for arg`: `--assinar-atualizador` consome o
# argumento seguinte.
while [ $# -gt 0 ]; do
  case "$1" in
    --assinar-atualizador)
      if [ $# -lt 2 ]; then
        echo "--assinar-atualizador precisa do caminho da chave" >&2
        exit 2
      fi
      CHAVE="$2"
      shift
      ;;
    --certificado|--senha-do-certificado-em)
      if [ $# -lt 2 ]; then
        echo "$1 precisa de um caminho" >&2
        exit 2
      fi
      if [ "$1" = --certificado ]; then CERTIFICADO="$2"; else ARQUIVO_SENHA="$2"; fi
      shift
      ;;
    --sem-finder) SEM_FINDER=1 ;;
    -h|--help) sed -n '2,59p' "$0"; exit 0 ;;
    -*) echo "opção desconhecida: $1" >&2; exit 2 ;;
    *) REF="$1" ;;
  esac
  shift
done

passo() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
falha() { printf '\033[1;31mERRO:\033[0m %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- limpeza
# Uma função só no `trap`, e armada logo no início: o script mexe em duas
# coisas que não podem sobrar se ele morrer no meio — o `.dmg` montado e,
# com certificado, a lista de keychains do usuário (ver "assinatura"). Dois
# `trap ... EXIT` separados se sobrescreveriam.
TEMP=""
MONTAGEM=""
KEYCHAIN=""
# A lista de busca do usuário como estava ANTES de o script criar o keychain, e
# se ela já foi trocada. Os dois existem porque `security list-keychains -d user
# -s` sem argumentos não é "não faça nada": grava uma lista VAZIA e tira o
# login.keychain da busca do usuário. Restaurar só vale quando a lista foi
# mesmo trocada e a cópia original tem conteúdo; em qualquer outro caso, mexer
# nela só pode piorar.
LISTA_ORIGINAL=()
LISTA_TROCADA=0

# Devolve a lista de busca e apaga o keychain temporário. Chamada pelo `limpar`
# (morte no meio) e no fim do build (sucesso) — um caminho só para os dois.
devolver_keychain() {
  if [ "$LISTA_TROCADA" = 1 ]; then
    if [ ${#LISTA_ORIGINAL[@]} -gt 0 ]; then
      security list-keychains -d user -s "${LISTA_ORIGINAL[@]}" >/dev/null 2>&1 \
        || printf 'aviso: não deu para restaurar a lista de keychains. A original era:\n%s\n' "$(printf '  %s\n' "${LISTA_ORIGINAL[@]}")" >&2
    else
      # Inalcançável pelo `preparar_keychain` (ele recusa lista vazia antes de
      # trocar), mas é a última barreira contra o `-s` vazio.
      printf 'aviso: lista de keychains original vazia; a lista do usuário NÃO foi mexida na restauração.\n' >&2
    fi
    LISTA_TROCADA=0
  fi
  if [ -n "$KEYCHAIN" ]; then
    # `delete-keychain` também tira o keychain da lista de busca (man
    # security): cobre o intervalo entre o `-s` e o `LISTA_TROCADA=1`.
    security delete-keychain "$KEYCHAIN" >/dev/null 2>&1 || true
    KEYCHAIN=""
  fi
}

limpar() {
  if [ -n "$MONTAGEM" ]; then
    hdiutil detach -quiet "$MONTAGEM" >/dev/null 2>&1 || true
    rmdir "$MONTAGEM" 2>/dev/null || true
    MONTAGEM=""
  fi
  devolver_keychain
  if [ -n "$TEMP" ]; then
    rm -rf "$TEMP"
    TEMP=""
  fi
}
trap limpar EXIT
# Sem isto, Ctrl+C no meio da compilação pode sair sem passar pelo EXIT e
# deixar o keychain temporário na lista do usuário.
trap 'exit 130' INT TERM
TEMP_BASE="${TMPDIR:-/tmp}"
TEMP=$(mktemp -d "${TEMP_BASE%/}/streamz-build-macos.XXXXXX")

# ---------------------------------------------------------------- pré-requisitos
# Cada checagem diz **como instalar**, porque o script não instala nada além
# dos alvos do rustup: mexer em toolchain da máquina de alguém é decisão dela.
passo "Conferindo pré-requisitos"

[ "$(uname -s)" = Darwin ] || falha "este script só roda no macOS (o .app precisa de codesign, lipo e hdiutil)."

# Command Line Tools: `clang` (o linker do Rust no macOS), `codesign`, `lipo`
# e o `SetFile` que o `bundle_dmg.sh` usa para o ícone do volume. O Xcode
# completo não é necessário.
if ! xcode-select -p >/dev/null 2>&1; then
  falha "faltam as Command Line Tools do Xcode. Instale com:  xcode-select --install"
fi
for ferramenta in clang codesign lipo hdiutil SetFile shasum; do
  command -v "$ferramenta" >/dev/null 2>&1 \
    || falha "'$ferramenta' não encontrado. Reinstale as Command Line Tools:  xcode-select --install"
done

# O rustup instala em ~/.cargo/bin e só põe isso no PATH dos shells *novos*.
# Acrescentar aqui evita o falso "rustup não encontrado" logo depois de instalar.
if [ -d "$HOME/.cargo/bin" ]; then
  PATH="$HOME/.cargo/bin:$PATH"
fi
if ! command -v rustup >/dev/null 2>&1; then
  falha "falta o Rust (rustup). Instale com:
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
e abra um terminal novo. Rust via Homebrew não serve: sem rustup não dá para
adicionar o alvo da outra arquitetura."
fi

if ! command -v node >/dev/null 2>&1; then
  falha "falta o Node.js (>= 20, o \"engines\" do package.json). Instale de https://nodejs.org ou com:  brew install node"
fi
NODE_MAIOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAIOR" -ge 20 ] || falha "Node $(node -v) é velho demais; o repositório pede >= 20."

# O lockfile é do pnpm 9 (`packageManager` do package.json). Um pnpm de outra
# versão maior recusa o `--frozen-lockfile` ou, pior, reescreve o lockfile.
if ! command -v pnpm >/dev/null 2>&1; then
  falha "falta o pnpm. Com o Node instalado:  corepack enable   (ou  npm install -g pnpm@9)"
fi
# Rodado DENTRO de "$REPO" (não do diretório atual): com corepack, o pnpm lido
# fora do repositório é a versão global, não a que o `packageManager` do
# repo pede — e as duas podem divergir.
PNPM_VERSAO=$(cd "$REPO" && pnpm --version)
PNPM_MAIOR=$(echo "$PNPM_VERSAO" | cut -d. -f1)
[ "$PNPM_MAIOR" = 9 ] || falha "pnpm $PNPM_VERSAO (no repositório) — o lockfile é do pnpm 9. Use:  corepack enable  (respeita o packageManager) ou  npm install -g pnpm@9"

# Os dois alvos do universal. `rustup target add` é idempotente e rápido quando
# já estão instalados, então não vale a pena checar antes.
passo "Garantindo os alvos Rust das duas arquiteturas"
rustup target add aarch64-apple-darwin x86_64-apple-darwin

# Piso do toolchain: o `Cargo.lock` tem crate de edição 2024 (getrandom 0.4),
# que exige Rust >= 1.85. Com um rustup antigo o erro só aparece minutos
# depois, no meio do cargo, e não diz que a solução é atualizar.
RUST_MINIMO=1.85.0
RUST_VERSAO=$(rustc --version | awk '{print $2}' | cut -d- -f1)
echo "rustc: $RUST_VERSAO"
printf '%s %s\n' "$RUST_MINIMO" "$RUST_VERSAO" | awk '{
  split($1, m, "."); split($2, v, ".");
  for (i = 1; i <= 3; i++) {
    if (v[i] + 0 > m[i] + 0) exit 0;
    if (v[i] + 0 < m[i] + 0) exit 1;
  }
  exit 0 }' || falha "rustc $RUST_VERSAO é anterior a $RUST_MINIMO. Atualize com:  rustup update stable"

# Por SSH não há sessão gráfica para o Finder: o AppleScript do `bundle_dmg.sh`
# falha e derruba o build **no último passo**, depois de toda a compilação.
if [ -n "${SSH_CONNECTION:-}" ] && [ "$SEM_FINDER" = 0 ]; then
  echo "sessão SSH detectada: ligando --sem-finder"
  SEM_FINDER=1
fi

# ---------------------------------------------------------------- certificado
# Resolvido aqui, ANTES da compilação: senha errada ou `.p12` corrompido tem
# que derrubar o script no primeiro minuto, não depois de meia hora de cargo.
#
# O `.p12` é lido pelo openssl só para saber o SHA-1 (a identidade que vai para
# o `codesign`) e o SHA-256 (o pin que a conferência compara com o que sair de
# dentro do `.app`). A importação no keychain vem depois, junto do build.
MODO_ASSINATURA=adhoc
CERT_SHA1=""
CERT_SHA256=""
if [ -z "$CERTIFICADO" ] && [ -n "${APPLE_CERTIFICATE:-}" ]; then
  CERTIFICADO="$TEMP/certificado.p12"
  # `base64 --decode` e não `-d`: o `-d` só entrou no base64 do macOS 13; o
  # `--decode` existe em todas as versões e no GNU.
  printf '%s' "$APPLE_CERTIFICATE" | base64 --decode > "$CERTIFICADO" 2>/dev/null \
    || falha "APPLE_CERTIFICATE não é base64 válido."
fi
if [ -n "$CERTIFICADO" ]; then
  [ -r "$CERTIFICADO" ] || falha "certificado não encontrado em $CERTIFICADO."
  command -v security >/dev/null 2>&1 || falha "'security' não encontrado (vem com o macOS)."
  if [ -n "$ARQUIVO_SENHA" ]; then
    [ -r "$ARQUIVO_SENHA" ] || falha "arquivo de senha não encontrado em $ARQUIVO_SENHA."
    # `|| true`: arquivo sem quebra de linha no final faz o `read` devolver 1
    # mesmo tendo lido a senha.
    SENHA_CERTIFICADO=""
    IFS= read -r SENHA_CERTIFICADO < "$ARQUIVO_SENHA" || true
    [ -n "$SENHA_CERTIFICADO" ] || falha "a primeira linha de $ARQUIVO_SENHA está vazia."
  elif [ -n "${APPLE_CERTIFICATE_PASSWORD+x}" ]; then
    SENHA_CERTIFICADO="$APPLE_CERTIFICATE_PASSWORD"
  elif [ -t 0 ]; then
    printf 'Senha do certificado %s: ' "$CERTIFICADO"
    IFS= read -r -s SENHA_CERTIFICADO
    printf '\n'
  else
    falha "sem a senha do certificado: use --senha-do-certificado-em <arquivo> ou APPLE_CERTIFICATE_PASSWORD."
  fi
  # Exportada para o openssl ler com `env:`, fora da linha de comando (`ps`).
  # Isso vale só para o openssl: o `security import`, mais abaixo, recebe a
  # senha em `-P` (ver o comentário lá).
  export SENHA_CERTIFICADO

  # `-legacy` só como segunda tentativa: o OpenSSL 3 (Homebrew) recusa `.p12`
  # com RC2-40 — o que o Acesso às Chaves exporta — sem o provider legado, e
  # o LibreSSL do macOS nem conhece a opção. A variante que funcionou é
  # guardada para a checagem da chave logo abaixo.
  P12_LEGACY=""
  if openssl pkcs12 -in "$CERTIFICADO" -nokeys -clcerts -passin env:SENHA_CERTIFICADO -out "$TEMP/cert.pem" 2>/dev/null; then
    :
  elif openssl pkcs12 -legacy -in "$CERTIFICADO" -nokeys -clcerts -passin env:SENHA_CERTIFICADO -out "$TEMP/cert.pem" 2>/dev/null; then
    P12_LEGACY=-legacy
  else
    falha "não deu para abrir $CERTIFICADO — senha errada ou arquivo que não é .p12."
  fi
  # `.p12` só com o certificado (exportado do Acesso às Chaves sem marcar a
  # chave, por exemplo) é aceito pelo `security import`, e o erro só apareceria
  # depois, num `set-key-partition-list` que não diz o que falta. Aqui é o
  # primeiro minuto. A chave passa só pelo pipe, nunca por disco; `grep -c` e
  # não `-q` porque lê a entrada toda (sem SIGPIPE no openssl com `pipefail`).
  # shellcheck disable=SC2086
  CHAVES_NO_P12=$(openssl pkcs12 $P12_LEGACY -in "$CERTIFICADO" -nocerts -nodes -passin env:SENHA_CERTIFICADO 2>/dev/null \
    | grep -c '^-----BEGIN .*PRIVATE KEY-----' || true)
  [ "${CHAVES_NO_P12:-0}" -ge 1 ] \
    || falha "$CERTIFICADO não tem chave privada (só o certificado). Exporte de novo o .p12 incluindo a chave — o gerar-certificado-mac.sh já sai com as duas."
  CERT_SHA1=$(openssl x509 -in "$TEMP/cert.pem" -outform DER | openssl dgst -sha1 | awk '{print $NF}' | tr 'A-F' 'a-f')
  CERT_SHA256=$(openssl x509 -in "$TEMP/cert.pem" -outform DER | openssl dgst -sha256 | awk '{print $NF}' | tr 'A-F' 'a-f')
  [ ${#CERT_SHA1} = 40 ] && [ ${#CERT_SHA256} = 64 ] || falha "o .p12 não tem um certificado legível."
  if [ -n "${APPLE_SIGNING_IDENTITY:-}" ] \
     && [ "$(printf '%s' "$APPLE_SIGNING_IDENTITY" | tr 'A-F' 'a-f')" != "$CERT_SHA1" ]; then
    falha "APPLE_SIGNING_IDENTITY ($APPLE_SIGNING_IDENTITY) não é o SHA-1 do certificado do .p12 ($CERT_SHA1). Com certificado autoassinado a identidade tem que ser o SHA-1 — confira se o segredo não é de outro certificado."
  fi
  MODO_ASSINATURA=certificado
  echo "certificado: $(openssl x509 -in "$TEMP/cert.pem" -noout -subject)"
  echo "  válido até $(openssl x509 -in "$TEMP/cert.pem" -noout -enddate | cut -d= -f2)"
  echo "  SHA-1   $CERT_SHA1"
  echo "  SHA-256 $CERT_SHA256"
else
  if [ -n "${APPLE_SIGNING_IDENTITY:-}" ]; then
    falha "APPLE_SIGNING_IDENTITY definido sem certificado. Passe --certificado <p12> (ou APPLE_CERTIFICATE), ou tire a variável para assinar ad-hoc."
  fi
  [ -z "$ARQUIVO_SENHA" ] || falha "--senha-do-certificado-em sem --certificado."
  printf '\033[1;33maviso:\033[0m sem certificado — assinatura AD-HOC. O macOS vai pedir de novo as\n'
  printf '       permissões de microfone, câmera e tela depois de cada atualização.\n'
  printf '       Para identidade estável: scripts/gerar-certificado-mac.sh e --certificado.\n'
fi

if [ -n "$CHAVE" ]; then
  [ -r "$CHAVE" ] || falha "chave de assinatura não encontrada em $CHAVE."
  # Absoluto: o tauri-cli troca de diretório (vai para src-tauri) antes de ler
  # a chave, e um caminho relativo apontaria para outro lugar.
  CHAVE="$(cd "$(dirname "$CHAVE")" && pwd)/$(basename "$CHAVE")"
fi

# ---------------------------------------------------------------- worktree
# Worktree própria e **detached**, como a do build de Windows: o checkout em
# que você está trabalhando não leva `checkout`, não ganha `node_modules` de
# outro commit e nenhuma branch fica presa a este build. Se ela já existir, é
# reaproveitada — e com ela o `target/` do cargo, que é o que faz a segunda
# rodada levar minutos em vez de meia hora.
passo "Preparando a worktree em $WORKTREE ($REF)"
git -C "$REPO" fetch --quiet origin
if [ -d "$WORKTREE" ]; then
  git -C "$WORKTREE" checkout --quiet --detach "$REF"
  # Só o que é gerado e não versionado: `gen/android` e `gen/schemas` estão no
  # git e o `-x` do clean não toca em arquivo rastreado.
  git -C "$WORKTREE" clean -qfdx apps/desktop/src-tauri/gen apps/web/out || true
else
  mkdir -p "$(dirname "$WORKTREE")"
  git -C "$REPO" worktree add --detach "$WORKTREE" "$REF"
fi
COMMIT=$(git -C "$WORKTREE" rev-parse --short HEAD)
# A versão que o bundler põe no nome do `.dmg` é a do `tauri.conf.json`.
VERSAO=$(node -p 'require(process.argv[1]).version' "$WORKTREE/apps/desktop/src-tauri/tauri.conf.json")
echo "commit $COMMIT, versão $VERSAO"

[ -f "$WORKTREE/apps/desktop/src-tauri/tauri.macos.conf.json" ] \
  || falha "o ref $REF não tem apps/desktop/src-tauri/tauri.macos.conf.json — sem ele o bundle sairia sem Info.plist de permissões e sem assinatura ad-hoc. Compile um commit que já tenha o suporte a macOS."

# ---------------------------------------------------------------- ambiente
# Os mesmos valores do build de Windows (`build-desktop-no-servidor.sh`): o
# export estático da web embute `NEXT_PUBLIC_*` no HTML, e a CSP do
# `tauri.conf.json` já lista esses hosts.
export NEXT_PUBLIC_API_URL=https://api.streamz.chat
export NEXT_PUBLIC_WS_URL=https://api.streamz.chat
export NEXT_PUBLIC_LIVEKIT_URL=wss://livekit.streamz.chat
export NEXT_TELEMETRY_DISABLED=1

# `CI=true` é a chave que o tauri-bundler lê para passar `--skip-jenkins` ao
# `bundle_dmg.sh` (pula o AppleScript do Finder). Fora desse caso, nada de CI:
# ele também muda o comportamento interativo do pnpm e do tauri-cli, e aqui
# não há motivo para isso.
if [ "$SEM_FINDER" = 1 ]; then
  export CI=true
fi

# Sem `--assinar-atualizador`, nada de chave herdada do shell: um
# TAURI_SIGNING_PRIVATE_KEY esquecido no ambiente não pode assinar sem querer.
CONFIG_RELEASE=""
if [ -n "$CHAVE" ]; then
  export TAURI_SIGNING_PRIVATE_KEY="$CHAVE"
  export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}"
  # `createUpdaterArtifacts: true` — o mesmo arquivo do build de Windows. No
  # macOS é ele que faz sair o `Streamz.app.tar.gz` + `.sig` ao lado do `.app`.
  CONFIG_RELEASE="--config src-tauri/tauri.release.conf.json"
else
  unset TAURI_SIGNING_PRIVATE_KEY TAURI_SIGNING_PRIVATE_KEY_PASSWORD || true
fi

# ---------------------------------------------------------------- assinatura
# Por que o script importa o certificado sozinho em vez de deixar
# APPLE_CERTIFICATE para o Tauri (conferido no código do tauri-cli 2.11.4):
#   * `tauri-macos-sign/src/keychain.rs` (`with_certificate_file`) importa o
#     `.p12`, mas escolhe a identidade com `keychain/identity.rs::list`, que só
#     aceita certificado cujo nome contenha "Developer ID Application:",
#     "Apple Development:" etc. e que tenha OU (o Team ID). O autoassinado não
#     tem nada disso → "failed to resolve signing identity", e o erro sai antes
#     do `Drop` que apagaria o keychain que ele já criou em ~/Library/Keychains.
#   * Com só APPLE_SIGNING_IDENTITY (que `tauri-cli/src/interface/rust.rs`
#     põe no lugar do `signingIdentity` do config), o bundler roda
#     `codesign --force -s <identidade> [--options runtime] --entitlements ...`
#     sem `--keychain`, de dentro para fora (binário, depois o `.app`), e
#     também assina o `.dmg` (o `dmg/mod.rs` só pula quando a identidade é "-").
#     Isso aceita o certificado não confiável, desde que ele esteja num
#     keychain da lista de busca: o `codesign --keychain <arq>` sozinho
#     responde "The specified item could not be found in the keychain".
#
# Daí: keychain descartável com senha aleatória, na lista de busca do usuário
# só durante o build (o `limpar` devolve a lista original e apaga o keychain),
# e a identidade passada como SHA-1 — o nome "Streamz (autoassinado)" também
# funcionaria, mas ficaria ambíguo com outro certificado de mesmo nome.
# O `find-identity -v` NÃO lista este certificado (CSSMERR_TP_NOT_TRUSTED);
# o `codesign` assina com ele mesmo assim.
#
# O pacote do atualizador (`.app.tar.gz` + `.sig`) é gerado pelo bundler
# depois da assinatura do `.app`, então a assinatura minisign cobre o app já
# assinado — não há re-assinatura manual aqui.
unset APPLE_CERTIFICATE APPLE_CERTIFICATE_PASSWORD
# Notarização exige Developer ID: com um APPLE_ID/APPLE_API_KEY esquecido no
# shell, o bundler tentaria notarizar o app autoassinado e falharia no fim.
unset APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID APPLE_API_KEY APPLE_API_ISSUER APPLE_API_KEY_PATH || true
#
# A ordem de `preparar_keychain` é a proteção da lista do usuário: primeiro
# LER a lista original (e recusar se vier vazia), depois criar/importar/liberar
# — qualquer um desses pode morrer (`.p12` recusado, Ctrl+C) — e só por último
# trocar a lista, marcando `LISTA_TROCADA=1`. Morrer antes disso deixa a lista
# intocada e o `limpar` só apaga o keychain.
preparar_keychain() {
  local saida_lista linha senha_keychain
  saida_lista=$(security list-keychains -d user) \
    || falha "não deu para ler a lista de keychains do usuário (security list-keychains -d user)."
  LISTA_ORIGINAL=()
  # Here-string e linha a linha: caminho de keychain pode ter espaço, e o
  # `security` imprime cada um entre aspas numa linha.
  while IFS= read -r linha; do
    linha=$(printf '%s' "$linha" | sed -e 's/^[[:space:]]*"//' -e 's/"[[:space:]]*$//')
    # `if` e não `[ ] &&`: numa última linha vazia o `&&` daria status 1 ao
    # `while` inteiro e o `set -e` sairia sem a mensagem abaixo.
    if [ -n "$linha" ]; then LISTA_ORIGINAL+=("$linha"); fi
  done <<<"$saida_lista"
  [ ${#LISTA_ORIGINAL[@]} -gt 0 ] \
    || falha "a lista de keychains do usuário veio vazia — sem uma cópia para restaurar, o script não mexe nela. Confira com: security list-keychains -d user"

  senha_keychain=$(openssl rand -hex 16)
  # Definido ANTES do `create-keychain`: um Ctrl+C durante a criação ainda
  # passa pelo `delete-keychain` do `limpar` (inofensivo se o arquivo não
  # chegou a existir).
  KEYCHAIN="$TEMP/assinatura.keychain-db"
  security create-keychain -p "$senha_keychain" "$KEYCHAIN" \
    || falha "o security create-keychain falhou em $KEYCHAIN."
  security unlock-keychain -p "$senha_keychain" "$KEYCHAIN"
  # Sem `-t`: o padrão do `create-keychain` é travar depois de 5 min parado, e
  # a assinatura só acontece no fim de uma compilação que passa de meia hora.
  security set-keychain-settings "$KEYCHAIN"
  # `-P` põe a senha do `.p12` na linha de comando, visível no `ps` de qualquer
  # usuário da máquina enquanto o import roda (menos de um segundo). O
  # `security import` não tem opção de ler a senha do ambiente, de arquivo ou
  # da entrada padrão — sem `-P` ele abre um diálogo gráfico, que por SSH
  # não aparece. Aceitável num Mac de build pessoal; numa máquina compartilhada,
  # não rode o build assinado.
  security import "$CERTIFICADO" -k "$KEYCHAIN" -P "$SENHA_CERTIFICADO" -T /usr/bin/codesign >/dev/null \
    || falha "o security import recusou o .p12."
  # Identidade conferida ANTES do partition list: com o `.p12` sem chave o
  # `set-key-partition-list` falha com "item could not be found", que não diz
  # que o que falta é a chave. `find-identity` SEM `-v`: o autoassinado não é
  # confiável e o `-v` o esconderia.
  grep -q "$CERT_SHA1_MAIUSCULO" <<<"$(security find-identity -p codesigning "$KEYCHAIN" 2>&1)" \
    || falha "o certificado foi importado mas não virou identidade de assinatura (falta a chave privada no .p12?)."
  # Libera a chave para o `codesign` sem o diálogo "permitir acesso" — que,
  # por SSH ou no CI, simplesmente não aparece e trava a assinatura.
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$senha_keychain" "$KEYCHAIN" >/dev/null \
    || falha "o security set-key-partition-list não liberou a chave para o codesign."
  security list-keychains -d user -s "${LISTA_ORIGINAL[@]}" "$KEYCHAIN" \
    || falha "não deu para pôr o keychain temporário na lista de busca."
  LISTA_TROCADA=1
}

if [ "$MODO_ASSINATURA" = certificado ]; then
  passo "Importando o certificado num keychain temporário"
  CERT_SHA1_MAIUSCULO=$(printf '%s' "$CERT_SHA1" | tr 'a-f' 'A-F')
  preparar_keychain
  export APPLE_SIGNING_IDENTITY="$CERT_SHA1_MAIUSCULO"
else
  unset APPLE_SIGNING_IDENTITY || true
fi

# ---------------------------------------------------------------- build
# `--bundles app,dmg`: o `tauri.macos.conf.json` já pede os dois; repetir aqui
# deixa o comando legível sozinho e protege contra alguém mexer nos targets.
#
# O `tauri.macos.conf.json` não precisa de `--config`: o tauri-cli o aplica
# sozinho quando o alvo é macOS (JSON Merge Patch sobre o `tauri.conf.json`).
passo "Build universal (a primeira rodada compila o crate duas vezes: x86_64 e arm64)"
INICIO=$(date +%s)
(
  cd "$WORKTREE"
  pnpm install --frozen-lockfile
  pnpm --filter @streamz/shared build
  # `$CONFIG_RELEASE` sem aspas de propósito: vazio some, cheio vira dois
  # argumentos. Um array seria o jeito limpo, mas `"${arr[@]}"` vazio com
  # `set -u` quebra no bash 3.2 que o macOS traz.
  # shellcheck disable=SC2086
  pnpm --filter @streamz/desktop exec tauri build \
    --target "$ALVO" --bundles app,dmg $CONFIG_RELEASE
)
DURACAO=$(( $(date +%s) - INICIO ))

# ---------------------------------------------------------------- conferência
BUNDLE="$WORKTREE/apps/desktop/src-tauri/target/$ALVO/release/bundle"
APP="$BUNDLE/macos/Streamz.app"
DMG="$BUNDLE/dmg/Streamz_${VERSAO}_universal.dmg"
[ -d "$APP" ] || falha "o .app não saiu em $APP"
[ -f "$DMG" ] || falha "o .dmg não saiu em $DMG"

# Confere um `.app` (o da pasta de build ou o de dentro do `.dmg`): as duas
# arquiteturas no executável, a assinatura válida (e, com certificado, feita
# pelo certificado certo), os entitlements de mídia e os textos de permissão.
# Cada item é algo que, faltando, só apareceria no Mac de quem baixou.
conferir_app() {
  local app="$1" executavel identificador archs assinatura requisito entitlements extraidos sha256_app
  executavel=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app/Contents/Info.plist")
  identificador=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app/Contents/Info.plist")
  archs=$(lipo -archs "$app/Contents/MacOS/$executavel")
  echo "arquiteturas: $archs"
  case " $archs " in *" x86_64 "*) ;; *) falha "$executavel não tem x86_64 (não abriria em Mac Intel)";; esac
  case " $archs " in *" arm64 "*) ;; *) falha "$executavel não tem arm64 (rodaria no Rosetta, ou nem isso)";; esac

  # `--strict` recusa selo quebrado (arquivo mexido depois de assinar). Sem
  # assinatura válida o binário arm64 simplesmente não executa.
  codesign --verify --strict --verbose=2 "$app"
  # Here-string (`<<<`) e não `echo | grep -q`: com `pipefail`, o `grep -q`
  # sai no primeiro acerto, o `echo` leva SIGPIPE e o pipeline "falha" justo
  # quando encontrou.
  # `-dvv` e não `-dv`: só a partir do segundo `v` saem as linhas Authority.
  assinatura=$(codesign -dvv "$app" 2>&1)
  grep -E '^(Identifier=|Format=|CodeDirectory |Signature=|Authority=|TeamIdentifier=)' <<<"$assinatura" || true
  grep -q 'runtime' <<<"$assinatura" \
    || falha "o .app saiu sem hardened runtime"
  # O designated requirement é o que o TCC grava junto da permissão: é ele que
  # precisa ser igual de uma versão para a outra.
  requisito=$(codesign -d -r- "$app" 2>&1 | grep '^designated' || true)
  echo "$requisito"

  if [ "$MODO_ASSINATURA" = adhoc ]; then
    grep -q 'Signature=adhoc' <<<"$assinatura" \
      || echo "aviso: a assinatura não é ad-hoc — confira o signingIdentity"
  else
    ! grep -q 'Signature=adhoc' <<<"$assinatura" \
      || falha "o .app saiu ad-hoc apesar do certificado — o APPLE_SIGNING_IDENTITY não chegou ao bundler?"
    # A mesma checagem que o instalador pode fazer: assinatura íntegra E feita
    # pelo nosso certificado (o `H"..."` da linguagem de requirement é SHA-1).
    codesign --verify --strict \
      -R="identifier \"$identificador\" and certificate leaf = H\"$CERT_SHA1\"" "$app" \
      || falha "a assinatura do .app não é do certificado $CERT_SHA1"
    grep -q "$CERT_SHA1" <<<"$requisito" \
      || falha "o designated requirement não cita o certificado $CERT_SHA1 — o TCC não vai reconhecer o app entre versões"
    # Pin: SHA-256 do certificado (DER) extraído de dentro do `.app`, no mesmo
    # formato que o gerar-certificado-mac.sh imprime.
    extraidos=$(mktemp -d "$TEMP/certs.XXXXXX")
    (cd "$extraidos" && codesign -d --extract-certificates "$app" >/dev/null 2>&1)
    [ -f "$extraidos/codesign0" ] || falha "não saiu certificado de dentro do .app"
    sha256_app=$(shasum -a 256 "$extraidos/codesign0" | awk '{print $1}')
    rm -rf "$extraidos"
    echo "certificado do .app (SHA-256 do DER): $sha256_app"
    [ "$sha256_app" = "$CERT_SHA256" ] \
      || falha "o certificado dentro do .app ($sha256_app) não é o do .p12 ($CERT_SHA256)"
  fi

  entitlements=$(codesign -d --entitlements - "$app" 2>&1)
  for chave in com.apple.security.device.audio-input com.apple.security.device.camera; do
    grep -q "$chave" <<<"$entitlements" || falha "falta o entitlement $chave (sem ele não há microfone/câmera)"
  done
  for chave in NSMicrophoneUsageDescription NSCameraUsageDescription LSMinimumSystemVersion; do
    /usr/libexec/PlistBuddy -c "Print :$chave" "$app/Contents/Info.plist" >/dev/null 2>&1 \
      || falha "o Info.plist do .app não tem $chave"
  done
  echo "macOS mínimo: $(/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$app/Contents/Info.plist")"
}

passo "Conferindo o .app"
conferir_app "$APP"

# O que o usuário recebe é o `.dmg`, não a pasta de build: montar e conferir o
# `.app` de dentro dele pega uma cópia que tenha perdido a assinatura no caminho.
passo "Conferindo o .app de dentro do .dmg"
hdiutil verify -quiet "$DMG"
if [ "$MODO_ASSINATURA" = certificado ]; then
  # Com identidade diferente de "-" o bundler também assina o `.dmg`.
  codesign --verify --strict "$DMG" || falha "a assinatura do .dmg não confere"
  codesign -dvv "$DMG" 2>&1 | grep -E '^Authority=' || true
fi
MONTAGEM=$(mktemp -d "$TEMP/dmg.XXXXXX")
hdiutil attach -quiet -nobrowse -readonly -noautoopen -mountpoint "$MONTAGEM" "$DMG"
[ -L "$MONTAGEM/Applications" ] || echo "aviso: o .dmg não tem o atalho para Aplicativos"
conferir_app "$MONTAGEM/Streamz.app"
hdiutil detach -quiet "$MONTAGEM" >/dev/null 2>&1 || true
rmdir "$MONTAGEM" 2>/dev/null || true
MONTAGEM=""

# O keychain não é mais necessário: devolver a lista de busca do usuário já,
# e não só no fim do script. Mesma função do `limpar`: restaura só se trocou.
devolver_keychain

# ---------------------------------------------------------------- saída
SAIDA="$SAIDA_BASE/$VERSAO-$COMMIT-macos"
mkdir -p "$SAIDA"
cp "$DMG" "$SAIDA"/
if [ -n "$CHAVE" ]; then
  cp "$BUNDLE/macos/Streamz.app.tar.gz" "$BUNDLE/macos/Streamz.app.tar.gz.sig" "$SAIDA"/
fi

passo "Pronto em $((DURACAO / 60)) min $((DURACAO % 60)) s"
for f in "$SAIDA"/*; do
  printf '%s\n  %s bytes\n' "$f" "$(stat -f%z "$f")"
done
echo
echo "sha256:"
(cd "$SAIDA" && shasum -a 256 ./*.dmg)
echo
echo "Publicar: o .dmg vai para a pasta downloads/ da API (ela escolhe o arquivo"
echo "de macOS pela extensão). Não há notarização: quem baixa pelo navegador vê o"
echo "aviso do Gatekeeper na primeira abertura. Isto prova que o .dmg existe, é"
echo "universal e está assinado; só abrir num Mac Intel e num Apple Silicon prova"
echo "que roda."
echo
if [ "$MODO_ASSINATURA" = certificado ]; then
  echo "Assinado com o certificado autoassinado — as permissões do macOS se mantêm"
  echo "entre versões assinadas por ele. Pin (SHA-256 do certificado, DER):"
  echo "  $CERT_SHA256"
else
  echo "Assinatura AD-HOC: o macOS vai pedir de novo microfone/câmera/tela depois"
  echo "desta atualização. Para evitar: scripts/gerar-certificado-mac.sh + --certificado."
fi
if [ -n "$CHAVE" ]; then
  echo
  echo "O .app.tar.gz + .sig são o pacote do atualizador. Um só arquivo serve às"
  echo "duas arquiteturas: o app universal pede darwin-aarch64 num Apple Silicon e"
  echo "darwin-x86_64 num Intel, e as duas chaves do manifesto apontam para ele."
  echo "A assinatura não é impressa aqui de propósito; ela está no .sig acima."
fi

# Publicar direto daqui, sem SFTP nem .env (só admin da instância; ver
# scripts/enviar-macos.sh e docs/PROCESSO-DE-DESENVOLVIMENTO.md §5.5):
echo
echo "Publicar pela API (pede login de admin da instância):"
echo "  scripts/enviar-macos.sh \"$SAIDA\" --notas \"Correções e melhorias.\""
if [ -z "$CHAVE" ]; then
  echo "  (sem --assinar-atualizador só vai o .dmg; o auto-update do Mac não muda)"
fi
