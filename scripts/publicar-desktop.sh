#!/usr/bin/env bash
#
# Publica instaladores do desktop (Windows, macOS e/ou Linux) já gerados por
# `build-desktop-no-servidor.sh`, `build-desktop-linux-no-servidor.sh` ou um
# build de macOS (Mac local ou Codemagic, copiado ao servidor): copia para as
# duas pastas que a API serve e imprime as linhas de `.env` do atualizador.
#
# É o irmão do `publicar-android.sh` (mesma divisão downloads/vs updates/, ver
# lá o porquê), com duas diferenças por causa de como o desktop funciona:
#
#   - três plataformas por trás do MESMO endpoint de manifesto
#     (`/api/updates/:target/:arch/:version`), cada uma com seu próprio
#     conjunto de variáveis (`DESKTOP_`/`MACOS_`/`LINUX_UPDATE_*`) — então este
#     script aceita uma pasta por chamada e por plataforma, e você pode passar
#     várias de uma vez para publicar tudo junto;
#   - a integridade aqui é uma assinatura **minisign** (arquivo `.sig` ao lado
#     do instalador), não um sha256 solto: sem `.sig` o Tauri recusa o pacote,
#     e por isso o script trata "sem .sig" como "essa plataforma fica sem
#     auto-update", não como erro — o instalador ainda serve para quem baixa
#     pela página.
#
# Como no `publicar-android.sh`: este script NÃO escreve no `.env` nem reinicia
# nada sozinho. Ele imprime as linhas e o comando de recriar a API. Motivo
# igual: a assinatura é uma linha longa que ninguém confere de cabeça, e
# reescrever o `.env` de produção por script é um gatilho fácil de puxar sem
# querer — quem cola vê o que está colando.
#
# Padrão é DRY-RUN (só mostra o que faria). Use --aplicar para copiar de
# verdade. Ao copiar, nunca sobrescreve um arquivo existente com conteúdo
# diferente (aborta e pede para apagar à mão se for intencional) — publicar de
# novo em cima do mesmo arquivo é inofensivo, pisar num instalador diferente
# sem querer não é.
#
# Uso:
#   scripts/publicar-desktop.sh <pasta> [<pasta> ...] [--notas "texto"] [--aplicar]
#
# A plataforma de cada pasta é detectada pelos arquivos que ela contém (por
# SUFIXO — .exe, .dmg/.pkg/.app.tar.gz, .AppImage/.deb — nunca por nome fixo,
# porque o nome carrega a versão e muda a cada release):
#
#   downloads/  (protegida por senha, o que o SITE oferece a quem não tem o
#               app): o instalador de um clique de cada plataforma — E os
#               formatos alternativos que o build gerar junto (.msi, .pkg,
#               .deb/.rpm), ver decisão abaixo.
#   updates/    (rota aberta, o que o ATUALIZADOR baixa sozinho): só o que tem
#               `.sig` ao lado — exe, o `.app.tar.gz` do mac (renomeado com a
#               versão, porque o arquivo original não carrega uma e dois
#               arquivos sem versão no nome colidiriam entre releases), o
#               AppImage. O `.deb`/`.rpm` NUNCA entram aqui: o atualizador do
#               Tauri para quem instalou por `.deb` consulta a mesma rota
#               (`linux-x86_64`) mas com a chave `-deb`, que este contrato não
#               publica — ver `UpdatesService.alvoDoTauri` — então por
#               enquanto só quem instalou o AppImage se atualiza sozinho.
#
# Decisão sobre publicar MAIS de um formato por plataforma em `downloads/`
# (.exe+.msi, .dmg+.pkg, .AppImage+.deb+.rpm): SIM, todos os que o build
# deixar na pasta. Isso só ficou seguro depois que
# `apps/api/src/modules/downloads/instalador.ts` (`escolherInstalador`) passou
# a escolher por ORDEM DE PREFERÊNCIA DE EXTENSÃO (exe>msi, dmg>pkg,
# AppImage>deb>rpm) em vez do arquivo de modificação mais recente — antes
# disso, copiar os dois arriscava a página trocar de formato sozinha conforme
# a ordem de cópia. Com a preferência fixa na API, publicar o `.deb` ao lado
# do AppImage é inofensivo (a página sempre serve o AppImage enquanto ele
# existir) e dá a quem administra o servidor um `.deb` à mão para distribuir
# manualmente, se precisar, sem voltar à pasta de build.
#
# Ver docs/PROCESSO-DE-DESENVOLVIMENTO.md §5 (Windows) e o `apps/desktop/README.md`
# para o que muda em cada plataforma.

set -euo pipefail

STACK=/opt/stack/streamz
API_BASE=https://api.streamz.chat
NOTAS="Correções e melhorias."
APLICAR=0
PASTAS=()

while [ $# -gt 0 ]; do
  case "$1" in
    --notas) NOTAS="${2:?--notas precisa de um texto}"; shift ;;
    --notas=*) NOTAS="${1#*=}" ;;
    --aplicar) APLICAR=1 ;;
    -h|--help) sed -n '2,61p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) echo "opção desconhecida: $1" >&2; exit 2 ;;
    *) PASTAS+=("$1") ;;
  esac
  shift
done

if [ "${#PASTAS[@]}" -eq 0 ]; then
  echo "uso: scripts/publicar-desktop.sh <pasta> [<pasta> ...] [--notas \"...\"] [--aplicar]" >&2
  exit 2
fi

passo()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
aviso()  { printf '\033[1;33maviso:\033[0m %s\n' "$*" >&2; }
erro()   { printf '\033[1;31mERRO:\033[0m %s\n' "$*" >&2; exit 1; }

sha256_de() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

# Só arquivos, um nível (a saída de cada build script é sempre plana), sufixo
# sem distinguir maiúscula/minúscula porque o `.AppImage` do Tauri já não é
# consistente entre versões.
achar() { # achar <pasta> <sufixo> — o primeiro que casar
  find "$1" -maxdepth 1 -type f -iname "*$2" 2>/dev/null | head -1
}
contar() { # contar <pasta> <sufixo>
  find "$1" -maxdepth 1 -type f -iname "*$2" 2>/dev/null | wc -l | tr -d ' '
}

# `Streamz_X.Y.Z_...` → `X.Y.Z`. Vazio (não `erro`) quando o nome não bate com
# o padrão — quem chama decide se isso é fatal (o `.app.tar.gz` do mac, por
# design, não carrega versão nenhuma).
extrair_versao() {
  local nome
  nome="$(basename "$1")"
  { printf '%s\n' "$nome" | grep -oE '^Streamz_[0-9]+\.[0-9]+\.[0-9]+_'; } \
    | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || true
}

# Copia preservando metadados; nunca pisa em arquivo existente com conteúdo
# diferente. Publicar duas vezes o mesmo build é inofensivo (o sha256 bate e a
# função só avisa); publicar por cima de um arquivo diferente é o tipo de erro
# que só se percebe quando alguém baixa o instalador errado, então aborta.
copiar() { # copiar <origem> <destino>
  local origem="$1" destino="$2"
  if [ -e "$destino" ]; then
    if [ "$(sha256_de "$origem")" = "$(sha256_de "$destino")" ]; then
      echo "  já está em $destino (mesmo conteúdo) — nada a fazer"
      return 0
    fi
    erro "$destino já existe com conteúdo DIFERENTE do que eu copiaria — não vou sobrescrever. Apague à mão se for intencional."
  fi
  cp -p "$origem" "$destino"
  echo "  copiado: $destino"
}

# ---------------------------------------------------------------- acumuladores
# Uma cópia é um par origem/destino; um `.env` é, no máximo, um jogo de quatro
# variáveis por plataforma. Arrays simples (não associativos) de propósito: o
# script pode rodar num Mac para um dry-run de conferência, e bash 3.2 (o
# padrão do macOS) não tem array associativo.
DOWN_ORIGEM=(); DOWN_DESTINO=(); DOWN_DESC=()
UP_ORIGEM=();   UP_DESTINO=();   UP_DESC=()

VER_WINDOWS="";  NOME_WINDOWS="";  SIG_WINDOWS=""
VER_MACOS="";    NOME_MACOS="";    SIG_MACOS=""
VER_LINUX="";    NOME_LINUX="";    SIG_LINUX=""

# Versão de CADA pasta processada, com ou sem `.sig` — separado de
# VER_WINDOWS/VER_MACOS/VER_LINUX (que só existem quando há atualizador) para
# o aviso de "versões diferentes" abaixo também enxergar uma plataforma sem
# assinatura.
TODAS_VERSOES=()

# ---------------------------------------------------------------- por plataforma
processar_windows() {
  local pasta="$1" exe msi sig versao nome
  exe="$(achar "$pasta" ".exe")"
  [ -n "$exe" ] || erro "pasta $pasta: detectei Windows mas não achei .exe"
  msi="$(achar "$pasta" ".msi")"
  versao="$(extrair_versao "$exe")"
  [ -n "$versao" ] || erro "não consegui ler a versão de $(basename "$exe") (esperado Streamz_X.Y.Z_...)"
  nome="$(basename "$exe")"
  sig="${exe}.sig"

  passo "Windows — $nome (versão $versao)"
  echo "  sha256: $(sha256_de "$exe")"

  DOWN_ORIGEM+=("$exe"); DOWN_DESTINO+=("$STACK/downloads/$nome"); DOWN_DESC+=("windows: instalador da página (preferido: exe > msi)")
  TODAS_VERSOES+=("windows=$versao")

  # o .msi também vai para downloads/ — a API prefere o .exe sozinha (ver
  # decisão no cabeçalho: EXTENSOES.windows = [".exe", ".msi"] em
  # downloads.service.ts), então publicar os dois é inofensivo, igual ao
  # .pkg do macOS e ao .deb do Linux logo abaixo.
  if [ -n "$msi" ]; then
    DOWN_ORIGEM+=("$msi"); DOWN_DESTINO+=("$STACK/downloads/$(basename "$msi")"); DOWN_DESC+=("windows: .msi alternativo (a API ainda prefere o .exe)")
  fi

  if [ -f "$sig" ]; then
    UP_ORIGEM+=("$exe"); UP_DESTINO+=("$STACK/updates/$nome"); UP_DESC+=("windows: o que o atualizador baixa")
    VER_WINDOWS="$versao"; NOME_WINDOWS="$nome"; SIG_WINDOWS="$(cat "$sig")"
  else
    aviso "Windows: sem $(basename "$sig") ao lado — esta versão fica sem auto-update (só o instalador da página)"
  fi
}

processar_macos() {
  local pasta="$1" dmg pkg tar instalador nome_inst versao v_pkg sig nome_tar
  dmg="$(achar "$pasta" ".dmg")"
  pkg="$(achar "$pasta" ".pkg")"
  tar="$(achar "$pasta" ".app.tar.gz")"

  # O .dmg é o canônico (instalador padrão do sistema, e é ele que a API serve
  # primeiro — ver EXTENSOES em downloads.service.ts); o .pkg, se existir, vai
  # junto para downloads/ como alternativa, nunca como o principal.
  instalador="$dmg"
  if [ -z "$instalador" ]; then instalador="$pkg"; fi
  [ -n "$instalador" ] || erro "pasta $pasta: detectei macOS mas não achei .dmg nem .pkg"

  versao="$(extrair_versao "$instalador")"
  [ -n "$versao" ] || erro "não consegui ler a versão de $(basename "$instalador")"
  if [ "$instalador" = "$dmg" ] && [ -n "$pkg" ]; then
    v_pkg="$(extrair_versao "$pkg")"
    if [ -n "$v_pkg" ] && [ "$v_pkg" != "$versao" ]; then
      erro "versões diferentes em $pasta: dmg=$versao pkg=$v_pkg"
    fi
  fi
  nome_inst="$(basename "$instalador")"

  passo "macOS — $nome_inst (versão $versao)"
  echo "  sha256: $(sha256_de "$instalador")"
  DOWN_ORIGEM+=("$instalador"); DOWN_DESTINO+=("$STACK/downloads/$nome_inst"); DOWN_DESC+=("macos: instalador da página (preferido: dmg > pkg)")
  TODAS_VERSOES+=("macos=$versao")

  # o alternativo também vai para downloads/ (a API prefere o dmg sozinha,
  # ver decisão no cabeçalho) — só quando é de fato um segundo arquivo, não o
  # mesmo já enfileirado acima
  if [ -n "$pkg" ] && [ "$pkg" != "$instalador" ]; then
    DOWN_ORIGEM+=("$pkg"); DOWN_DESTINO+=("$STACK/downloads/$(basename "$pkg")"); DOWN_DESC+=("macos: .pkg alternativo (a API ainda prefere o .dmg)")
  fi

  if [ -n "$tar" ]; then
    sig="${tar}.sig"
    if [ -f "$sig" ]; then
      # o `.app.tar.gz` do bundler não carrega versão no nome; sem renomear,
      # a segunda release pisaria no arquivo da primeira em updates/ — a
      # assinatura minisign cobre o CONTEÚDO, não o nome, então renomear não
      # invalida nada (ver doc do tauri-plugin-updater)
      nome_tar="Streamz_${versao}_universal.app.tar.gz"
      UP_ORIGEM+=("$tar"); UP_DESTINO+=("$STACK/updates/$nome_tar"); UP_DESC+=("macos: o que o atualizador baixa (renomeado com a versão)")
      VER_MACOS="$versao"; NOME_MACOS="$nome_tar"; SIG_MACOS="$(cat "$sig")"
    else
      aviso "macOS: achei $(basename "$tar") mas sem .sig ao lado — esta versão fica sem auto-update (só o .dmg da página)"
    fi
  else
    aviso "macOS: sem Streamz.app.tar.gz nesta pasta — esta versão fica sem auto-update (só o .dmg da página)"
  fi
}

processar_linux() {
  local pasta="$1" appimage deb versao v_deb nome sig
  appimage="$(achar "$pasta" ".appimage")"
  deb="$(achar "$pasta" ".deb")"
  [ -n "$appimage" ] || erro "pasta $pasta: detectei Linux mas não achei .AppImage"

  versao="$(extrair_versao "$appimage")"
  [ -n "$versao" ] || erro "não consegui ler a versão de $(basename "$appimage")"
  if [ -n "$deb" ]; then
    v_deb="$(extrair_versao "$deb")"
    if [ -n "$v_deb" ] && [ "$v_deb" != "$versao" ]; then
      erro "versões diferentes em $pasta: AppImage=$versao deb=$v_deb"
    fi
  fi
  nome="$(basename "$appimage")"

  passo "Linux — $nome (versão $versao)"
  echo "  sha256: $(sha256_de "$appimage")"
  DOWN_ORIGEM+=("$appimage"); DOWN_DESTINO+=("$STACK/downloads/$nome"); DOWN_DESC+=("linux: instalador da página (preferido: AppImage > deb > rpm)")
  TODAS_VERSOES+=("linux=$versao")

  # o .deb também vai para downloads/ — a API prefere o AppImage sozinha (ver
  # decisão no cabeçalho) — mas NUNCA para updates/: o atualizador de quem
  # instalou por .deb pede a chave `linux-x86_64-deb`, que este contrato não
  # oferece (só `-appimage`), então publicar o .deb ali não ligaria
  # auto-update nenhum, só ocuparia espaço com um arquivo que a rota nunca serve
  if [ -n "$deb" ]; then
    DOWN_ORIGEM+=("$deb"); DOWN_DESTINO+=("$STACK/downloads/$(basename "$deb")"); DOWN_DESC+=("linux: .deb alternativo (a API ainda prefere o AppImage)")
  fi

  sig="${appimage}.sig"
  if [ -f "$sig" ]; then
    UP_ORIGEM+=("$appimage"); UP_DESTINO+=("$STACK/updates/$nome"); UP_DESC+=("linux: o que o atualizador baixa")
    VER_LINUX="$versao"; NOME_LINUX="$nome"; SIG_LINUX="$(cat "$sig")"
  else
    aviso "Linux: sem $(basename "$sig") ao lado — esta versão fica sem auto-update (só o AppImage da página)"
  fi
}

# ---------------------------------------------------------------- detectar e processar
for pasta in "${PASTAS[@]}"; do
  [ -d "$pasta" ] || erro "pasta não existe: $pasta"

  n_win="$(contar "$pasta" ".exe")"
  n_mac=$(( $(contar "$pasta" ".dmg") + $(contar "$pasta" ".pkg") + $(contar "$pasta" ".app.tar.gz") ))
  n_lin=$(( $(contar "$pasta" ".appimage") + $(contar "$pasta" ".deb") ))

  achadas=0
  [ "$n_win" -gt 0 ] && achadas=$((achadas + 1))
  [ "$n_mac" -gt 0 ] && achadas=$((achadas + 1))
  [ "$n_lin" -gt 0 ] && achadas=$((achadas + 1))

  if [ "$achadas" -eq 0 ]; then
    erro "pasta $pasta: não reconheci nenhum instalador (.exe, .dmg/.pkg/.app.tar.gz, .AppImage/.deb)"
  fi
  if [ "$achadas" -gt 1 ]; then
    erro "pasta $pasta: achei arquivos de mais de uma plataforma — cada pasta de saída é de uma plataforma só"
  fi

  if [ "$n_win" -gt 0 ]; then
    processar_windows "$pasta"
  elif [ "$n_mac" -gt 0 ]; then
    processar_macos "$pasta"
  else
    processar_linux "$pasta"
  fi
done

# aviso leve (não fatal): publicar plataformas de versões diferentes na mesma
# chamada costuma ser descuido, mas pode ser proposital (ex.: o build do mac
# atrasou e você está publicando o Linux mais novo sozinho). Olha TODAS as
# pastas processadas, com ou sem `.sig` — uma plataforma sem atualizador ainda
# assim vai para downloads/, e a versão errada lá é o mesmo problema.
NUMEROS_VISTOS=""
for par in "${TODAS_VERSOES[@]}"; do
  v="${par#*=}"
  case " $NUMEROS_VISTOS " in
    *" $v "*) ;;
    *) NUMEROS_VISTOS="$NUMEROS_VISTOS $v" ;;
  esac
done
if [ "$(printf '%s\n' $NUMEROS_VISTOS | wc -w | tr -d ' ')" -gt 1 ]; then
  aviso "plataformas com versões diferentes nesta chamada (${TODAS_VERSOES[*]}) — confira se é proposital"
fi

# ---------------------------------------------------------------- copiar (ou simular)
passo "Destinos no servidor"
echo "  downloads/ (página com senha, o que o site oferece): $STACK/downloads"
echo "  updates/   (rota aberta, o que o app baixa sozinho):  $STACK/updates"

if [ "$APLICAR" -eq 0 ]; then
  passo "DRY-RUN — nada foi copiado (rode de novo com --aplicar para copiar)"
else
  passo "Copiando"
fi

for i in "${!DOWN_ORIGEM[@]}"; do
  if [ "$APLICAR" -eq 0 ]; then
    echo "  copiaria: ${DOWN_ORIGEM[$i]}"
    echo "        -> ${DOWN_DESTINO[$i]}  (${DOWN_DESC[$i]})"
  else
    echo "  ${DOWN_DESC[$i]}"
    copiar "${DOWN_ORIGEM[$i]}" "${DOWN_DESTINO[$i]}"
  fi
done
for i in "${!UP_ORIGEM[@]}"; do
  if [ "$APLICAR" -eq 0 ]; then
    echo "  copiaria: ${UP_ORIGEM[$i]}"
    echo "        -> ${UP_DESTINO[$i]}  (${UP_DESC[$i]})"
  else
    echo "  ${UP_DESC[$i]}"
    copiar "${UP_ORIGEM[$i]}" "${UP_DESTINO[$i]}"
  fi
done

# ---------------------------------------------------------------- .env
passo "Cole as linhas abaixo em $STACK/.env (substituindo as que já existem) — o script NÃO edita o .env sozinho"

algo=0
if [ -n "$VER_WINDOWS" ]; then
  algo=1
  cat <<ENV

DESKTOP_UPDATE_VERSION=$VER_WINDOWS
DESKTOP_UPDATE_URL=$API_BASE/api/updates/arquivo/$NOME_WINDOWS
DESKTOP_UPDATE_SIGNATURE=$SIG_WINDOWS
DESKTOP_UPDATE_NOTES=$NOTAS
ENV
fi
if [ -n "$VER_MACOS" ]; then
  algo=1
  cat <<ENV

MACOS_UPDATE_VERSION=$VER_MACOS
MACOS_UPDATE_URL=$API_BASE/api/updates/arquivo/$NOME_MACOS
MACOS_UPDATE_SIGNATURE=$SIG_MACOS
MACOS_UPDATE_NOTES=$NOTAS
ENV
fi
if [ -n "$VER_LINUX" ]; then
  algo=1
  cat <<ENV

LINUX_UPDATE_VERSION=$VER_LINUX
LINUX_UPDATE_URL=$API_BASE/api/updates/arquivo/$NOME_LINUX
LINUX_UPDATE_SIGNATURE=$SIG_LINUX
LINUX_UPDATE_NOTES=$NOTAS
ENV
fi
if [ "$algo" -eq 0 ]; then
  echo
  echo "  (nenhuma plataforma com .sig nesta chamada — nada para o atualizador, só instalador de página)"
fi

# ---------------------------------------------------------------- recriar a API
passo "Depois de colar, recrie a API (docker restart NÃO relê o .env — ver §5 do processo)"
cat <<'FIM'
    cd /opt/stack/streamz
    TAG=$(docker ps --filter name=streamz-api --format '{{.Image}}' | sed 's/.*://')
    STREAMZ_TAG="$TAG" docker compose -f docker-compose.yml \
      -f docker-compose.traefik.yml -f docker-compose.ghcr.yml \
      --profile livekit up -d api
FIM

# ---------------------------------------------------------------- verificação
passo "E confira (0.0.0 é sempre mais velha que qualquer release: 200 onde há atualização configurada)"
cat <<CURL
    curl -s -o /dev/null -w 'windows/x86_64 -> %{http_code}\n' $API_BASE/api/updates/windows/x86_64/0.0.0
    curl -s -o /dev/null -w 'darwin/aarch64 -> %{http_code}\n' $API_BASE/api/updates/darwin/aarch64/0.0.0
    curl -s -o /dev/null -w 'darwin/x86_64  -> %{http_code}\n' $API_BASE/api/updates/darwin/x86_64/0.0.0
    curl -s -o /dev/null -w 'linux/x86_64   -> %{http_code}\n' $API_BASE/api/updates/linux/x86_64/0.0.0
CURL
echo "  (linux/x86_64 aqui é só a checagem de versão — quem instalou pelo AppImage; quem instalou por .deb/.rpm consulta a mesma URL mas nunca recebe pacote, ver UpdatesService.alvoDoTauri)"
[ -n "$NOME_WINDOWS" ] && echo "    curl -sI $API_BASE/api/updates/arquivo/$NOME_WINDOWS | head -3"
[ -n "$NOME_MACOS" ]   && echo "    curl -sI $API_BASE/api/updates/arquivo/$NOME_MACOS | head -3"
[ -n "$NOME_LINUX" ]   && echo "    curl -sI $API_BASE/api/updates/arquivo/$NOME_LINUX | head -3"

echo
echo "O que isto NÃO faz: não edita o .env, não reinicia a API, não confere se o"
echo "instalador realmente abre (isso é o Windows/macOS/Linux de verdade dizendo)."
