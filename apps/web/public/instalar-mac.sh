#!/bin/bash
#
# Instalador do Streamz para macOS.
#
#   curl -fsSL https://streamz.chat/instalar-mac.sh | bash
#
# Por que existe: o app de macOS NÃO é notarizado (não há conta Apple
# Developer). Um `.dmg` baixado pelo navegador ganha o atributo
# `com.apple.quarantine`, e o Gatekeeper barra a primeira abertura — no macOS 15
# em diante, só destravando em Ajustes do Sistema. O `curl` não põe quarentena,
# então o mesmo `.dmg` baixado por aqui abre direto. Em troca da conveniência, a
# conferência que o Gatekeeper faria passa a ser feita por este script: selo da
# assinatura, identificador do app e, com o pin preenchido, o certificado.
#
# Variáveis de ambiente aceitas:
#   STREAMZ_SENHA     senha de acesso (sem ela, pergunta no terminal)
#   STREAMZ_API       base da API; só https (http apenas em 127.0.0.1/localhost,
#                     para teste local)
#   STREAMZ_DESTINO   pasta de instalação (padrão: /Applications, ou
#                     ~/Applications se não houver permissão)
#   STREAMZ_NAO_ABRIR=1  não abre o app ao terminar
#
# Todo o corpo vive em funções e só é executado pela ÚLTIMA linha: se a conexão
# cair no meio do `curl | bash`, o bash recebe um script cortado que não chama
# nada, em vez de rodar metade de uma instalação.

set -euo pipefail

# Impressão digital SHA-256 do certificado FOLHA que assina o Streamz.app.
# Preencher com o valor impresso por `scripts/gerar-certificado-mac.sh` (hex,
# com ou sem ":"). Vazio = verificação de autoria DESLIGADA: o script ainda
# confere o selo e o identificador, mas qualquer um que assine um app com o
# identificador `dev.streamz.app` passaria.
PIN_DO_CERTIFICADO_SHA256="4d0edd7a32e231c28ef3c1b73f3d3701ed6271e04bc584483f9df2a3e5c248bb"

# Identidade SHA-1 do MESMO certificado, impressa por
# `scripts/gerar-certificado-mac.sh` como `APPLE_SIGNING_IDENTITY` (hex, com ou
# sem ":", maiúsculo ou minúsculo — normalizado abaixo). Habilita uma segunda
# conferência, independente da do SHA-256: o requisito de código do próprio
# `codesign` (identificador + certificado folha), o mesmo formato que o TCC
# grava para as permissões de microfone/câmera/tela sobreviverem a atualização.
# Os dois pins nascem do mesmo certificado: preencha os dois juntos, ou nenhum
# — um sem o outro é configuração inconsistente e o script aborta.
PIN_DO_CERTIFICADO_SHA1="f924cd73c756dd80573a5db8d619b08c80e371fa"

IDENTIFICADOR_DO_APP="dev.streamz.app"
NOME_DO_APP="Streamz.app"
API_PADRAO="https://api.streamz.chat"
# Espelha `minimumSystemVersion` do tauri.macos.conf.json. O `.3` não é
# capricho, mas também não é (ainda) o que este binário exige: é o piso da
# captura de tela nativa por ScreenCaptureKit, que só existe no disco a partir
# do 12.3 e ainda vai entrar (`tela/captura/mac/mod.rs` hoje é esqueleto, sem
# `#[link]` nem dependência `objc2-*`/`screencapturekit` — o `.app` de hoje
# abre normalmente até num 12.0). Subir o piso agora evita o cenário em que,
# no dia em que essa captura entrar, um `LC_LOAD_DYLIB` forte que um `#[link]`
# gere faça o dyld recusar o app no launch num sistema mais velho, antes do
# `main()` — o usuário veria um app que não abre, sem mensagem. Mais barato
# preparar antes do que corrigir depois de já distribuído.
MACOS_MINIMO=12.3

# Globais (e não `local`) porque o `trap` de saída roda depois que a função
# principal já retornou — com `set -u`, uma variável local sumida derrubaria a
# própria limpeza.
DIR_TEMP=""
PONTO_DE_MONTAGEM=""
ECO_DESLIGADO=0

msg() { printf '%s\n' "$*"; }
aviso() { printf 'aviso: %s\n' "$*" >&2; }
falha() {
  printf 'erro: %s\n' "$*" >&2
  exit 1
}

limpar() {
  local status=$?
  if [ "$ECO_DESLIGADO" = 1 ]; then
    stty echo </dev/tty 2>/dev/null || true
  fi
  if [ -n "$PONTO_DE_MONTAGEM" ]; then
    hdiutil detach -quiet "$PONTO_DE_MONTAGEM" </dev/null 2>/dev/null ||
      hdiutil detach -quiet -force "$PONTO_DE_MONTAGEM" </dev/null 2>/dev/null || true
  fi
  if [ -n "$DIR_TEMP" ]; then
    rm -rf "$DIR_TEMP"
  fi
  return "$status"
}

tem_terminal() {
  # `-r /dev/tty` mente sem terminal de controle (a abertura é que falha com
  # "Device not configured"), então o teste é abrir de fato
  (: </dev/tty) 2>/dev/null
}

perguntar_sim() {
  # $1 = pergunta; padrão "sim". Sem terminal, responde "não": decidir por
  # alguém que não pode responder é pior que parar.
  local resposta=""
  tem_terminal || return 1
  printf '%s [S/n] ' "$1" >/dev/tty
  IFS= read -r resposta </dev/tty || return 1
  case "$resposta" in
    "" | s | S | sim | Sim | SIM | y | Y) return 0 ;;
    *) return 1 ;;
  esac
}

# Monta a string JSON da senha sem jq, python ou osascript.
#
# - o macOS não traz Python (o 2 saiu no 12.3, e o /usr/bin/python3 é só um
#   atalho que oferece instalar as Command Line Tools);
# - `osascript -l JavaScript` teria JSON.stringify, mas a senha teria de ir por
#   argumento, visível a qualquer usuário da máquina no `ps`.
# Byte a byte em locale C: `\` e `"` ganham barra, controles (0x00–0x1F, 0x7F)
# viram \u00XX, e o resto (inclusive os bytes de UTF-8) passa intacto, que é o
# que o JSON exige. A senha tem no máximo 200 caracteres, o laço é instantâneo.
json_escapar() {
  local LC_ALL=C
  local s=$1 saida="" c hex i
  for ((i = 0; i < ${#s}; i++)); do
    c=${s:i:1}
    case "$c" in
      '\') saida="$saida\\\\" ;;
      '"') saida="$saida\\\"" ;;
      [[:cntrl:]])
        printf -v hex '\\u%04x' "'$c"
        saida="$saida$hex"
        ;;
      *) saida="$saida$c" ;;
    esac
  done
  printf '%s' "$saida"
}

conferir_sistema() {
  [ "$(uname -s)" = Darwin ] || falha "este instalador é só para macOS."
  [ "$(id -u)" != 0 ] || falha "não rode como root (nem com sudo): o app é instalado para o seu usuário."

  local versao maior menor min_maior min_menor
  versao=$(sw_vers -productVersion)
  maior=${versao%%.*}
  menor=${versao#*.}
  menor=${menor%%.*}
  [ "$menor" = "$versao" ] && menor=0
  # Testados em separado: com `versao=""`, `menor` vira "0" por conta da linha
  # acima, e `"$maior$menor"` concatenado daria "0" — um guarda que passaria
  # com a versão vazia, e só apareceria depois num `[ "" -lt ... ]` calado.
  case "$maior" in
    '' | *[!0-9]*) falha "não consegui ler a versão do macOS ($versao)." ;;
  esac
  case "$menor" in
    '' | *[!0-9]*) falha "não consegui ler a versão do macOS ($versao)." ;;
  esac
  # Comparar só o número maior aceitaria um 12.0, onde o app não abre. Por isso
  # o par (maior, menor), na ordem — sem `sort -V`, que não está garantido aqui.
  min_maior=${MACOS_MINIMO%%.*}
  min_menor=${MACOS_MINIMO#*.}
  min_menor=${min_menor%%.*}
  [ "$min_menor" = "$MACOS_MINIMO" ] && min_menor=0
  if [ "$maior" -lt "$min_maior" ] ||
    { [ "$maior" -eq "$min_maior" ] && [ "$menor" -lt "$min_menor" ]; }; then
    falha "o Streamz precisa do macOS $MACOS_MINIMO ou mais novo (este é o $versao)."
  fi
}

# Base da API e os protocolos que o curl pode usar com ela.
#
# Só https: a senha e o instalador trafegam por aqui. O http existe apenas para
# 127.0.0.1/localhost, que é onde um servidor de teste roda — nenhum outro host
# pode rebaixar a conexão, nem por variável de ambiente.
API=""
PROTOCOLOS=""
resolver_api() {
  API=${STREAMZ_API:-$API_PADRAO}
  API=${API%/}
  case "$API" in
    *[[:space:]\"\\]*) falha "STREAMZ_API inválida." ;;
  esac
  if eh_http_local "$API"; then
    PROTOCOLOS="=http,https"
    aviso "usando API local sem TLS ($API) — só para teste."
  else
    case "$API" in
      https://?*) PROTOCOLOS="=https" ;;
      *) falha "STREAMZ_API precisa ser https:// (http só em 127.0.0.1/localhost)." ;;
    esac
  fi
}

# `http://127.0.0.1` ou `http://localhost`, com porta numérica opcional e
# caminho opcional — e nada mais. Um `http://127.0.0.1:1@outro.host` casaria
# com um `http://127.0.0.1:*` ingênuo, e o host de verdade é o que vem depois
# do `@`.
eh_http_local() {
  local resto
  case "$1" in
    http://127.0.0.1*) resto=${1#http://127.0.0.1} ;;
    http://localhost*) resto=${1#http://localhost} ;;
    *) return 1 ;;
  esac
  case "$resto" in
    *@*) return 1 ;;
  esac
  resto=${resto%%/*}
  case "$resto" in
    "") return 0 ;;
    :*[!0-9]* | :) return 1 ;;
    :*) return 0 ;;
    *) return 1 ;;
  esac
}

SENHA=""
ler_senha() {
  # $1 = tentativa; resultado em SENHA
  SENHA=""
  if [ -n "${STREAMZ_SENHA:-}" ]; then
    SENHA=$STREAMZ_SENHA
    return
  fi
  tem_terminal ||
    falha "sem terminal para pedir a senha — defina STREAMZ_SENHA no ambiente."
  # stdin é o pipe do curl, então a senha vem do terminal; `-s` desliga o eco
  printf 'Senha de acesso: ' >/dev/tty
  ECO_DESLIGADO=1
  IFS= read -r -s SENHA </dev/tty || true
  ECO_DESLIGADO=0
  printf '\n' >/dev/tty
}

# Troca a senha pelo link temporário. Preenche URL_DO_ARQUIVO, NOME_DO_ARQUIVO
# e TAMANHO_ESPERADO.
URL_DO_ARQUIVO=""
NOME_DO_ARQUIVO=""
TAMANHO_ESPERADO=""
pedir_link() {
  local resposta="$DIR_TEMP/token.json" tentativa=1 codigo senha_json
  local tentativas=3
  # com a senha vinda do ambiente não adianta repetir: seria a mesma senha
  [ -n "${STREAMZ_SENHA:-}" ] && tentativas=1

  while :; do
    ler_senha "$tentativa"
    [ -n "$SENHA" ] || falha "senha vazia."
    senha_json=$(json_escapar "$SENHA")

    # O corpo vai pelo stdin do curl (`@-`), nunca por argumento: argumento de
    # processo aparece no `ps` para qualquer usuário. `printf` é builtin, não
    # vira processo com a senha na linha de comando.
    if ! codigo=$(
      printf '{"senha":"%s","plataforma":"macos"}' "$senha_json" |
        curl --silent --show-error --proto "$PROTOCOLOS" --tlsv1.2 \
          --connect-timeout 15 --max-time 60 \
          -H 'Content-Type: application/json' -H 'Accept: application/json' \
          --data-binary @- -o "$resposta" -w '%{http_code}' \
          "$API/api/downloads/token"
    ); then
      falha "não consegui falar com o servidor ($API). Confira a internet e tente de novo."
    fi
    SENHA=""
    senha_json=""

    # As mensagens são nossas, e não o texto que veio do servidor: imprimir
    # corpo de resposta cru no terminal deixaria um servidor (ou proxy) mandar
    # sequências de escape para ele.
    case "$codigo" in
      200 | 201) break ;;
      401)
        if [ "$tentativa" -lt "$tentativas" ]; then
          aviso "senha incorreta. Tente de novo."
          tentativa=$((tentativa + 1))
          continue
        fi
        falha "senha incorreta."
        ;;
      400) falha "senha inválida (use de 1 a 200 caracteres)." ;;
      404) falha "ainda não há instalador para macOS neste servidor." ;;
      429) falha "muitas tentativas. Espere um minuto e rode o comando de novo." ;;
      503) falha "o download não está configurado neste servidor." ;;
      *) falha "o servidor respondeu HTTP $codigo. Tente de novo em instantes." ;;
    esac
  done

  # Sem jq: a resposta é o JSON plano de `DownloadAutorizado`. Os valores que
  # interessam não têm aspas nem barra invertida (a URL leva o token já passado
  # por encodeURIComponent), então um `sed` delimitado por aspas basta — e o
  # que não casar é recusado logo abaixo, não "adivinhado".
  local json
  json=$(tr -d '\n\r' <"$resposta")
  URL_DO_ARQUIVO=$(printf '%s' "$json" | sed -n 's/.*"url"[[:space:]]*:[[:space:]]*"\([^"\\]*\)".*/\1/p')
  NOME_DO_ARQUIVO=$(printf '%s' "$json" | sed -n 's/.*"filename"[[:space:]]*:[[:space:]]*"\([^"\\/]*\)".*/\1/p')
  TAMANHO_ESPERADO=$(printf '%s' "$json" | sed -n 's/.*"tamanho"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p')

  # o link segue a mesma regra da API: https, ou http só no servidor de teste
  case "$URL_DO_ARQUIVO" in
    https://?*) ;;
    http://*)
      [ "$PROTOCOLOS" = "=http,https" ] && eh_http_local "$URL_DO_ARQUIVO" ||
        falha "o servidor devolveu um link de download inesperado."
      ;;
    *) falha "o servidor devolveu um link de download inesperado." ;;
  esac
  case "$URL_DO_ARQUIVO" in
    *[[:space:]]*) falha "o servidor devolveu um link de download inesperado." ;;
  esac
  # a API cai para `.pkg` quando não há `.dmg`; este script só sabe montar imagem
  case "$NOME_DO_ARQUIVO" in
    *.dmg | *.DMG) ;;
    *) falha "o instalador publicado não é um .dmg (${NOME_DO_ARQUIVO:-sem nome}). Baixe pela página." ;;
  esac
}

baixar() {
  local destino="$DIR_TEMP/Streamz.dmg" progresso="--progress-bar" tamanho
  [ -t 2 ] || progresso="--silent"
  msg "Baixando $NOME_DO_ARQUIVO..."
  # --fail: HTTP de erro não vira um "dmg" com HTML dentro;
  # --proto: redirecionamento não rebaixa para http (nem para file://).
  curl --fail --location --proto "$PROTOCOLOS" --proto-redir "$PROTOCOLOS" --tlsv1.2 \
    --connect-timeout 15 --retry 2 --show-error "$progresso" \
    -o "$destino" "$URL_DO_ARQUIVO" </dev/null ||
    falha "o download falhou. Rode o comando de novo (o link vale só 2 minutos)."

  if [ -n "$TAMANHO_ESPERADO" ]; then
    tamanho=$(stat -f %z "$destino")
    [ "$tamanho" = "$TAMANHO_ESPERADO" ] ||
      falha "o arquivo chegou incompleto ($tamanho de $TAMANHO_ESPERADO bytes). Tente de novo."
  fi
}

# Monta a imagem e confere o app. Preenche APP_MONTADO e EXECUTAVEL.
APP_MONTADO=""
EXECUTAVEL=""
montar_e_conferir() {
  PONTO_DE_MONTAGEM="$DIR_TEMP/volume"
  mkdir -p "$PONTO_DE_MONTAGEM"
  # -nobrowse: o volume não aparece no Finder; -readonly: nada escreve no app
  # entre a conferência da assinatura e a cópia
  if ! hdiutil attach -nobrowse -readonly -noautoopen \
    -mountpoint "$PONTO_DE_MONTAGEM" "$DIR_TEMP/Streamz.dmg" </dev/null >/dev/null; then
    PONTO_DE_MONTAGEM=""
    falha "não consegui abrir a imagem baixada (arquivo corrompido?)."
  fi

  APP_MONTADO="$PONTO_DE_MONTAGEM/$NOME_DO_APP"
  [ -d "$APP_MONTADO" ] || falha "a imagem não contém $NOME_DO_APP."

  # `--strict` recusa bundle com arquivo sobrando ou symlink para fora. O
  # `--deep` aqui é de VERIFICAÇÃO — o que a Apple desaconselha é assinar com
  # `--deep`; verificar com ele só estende a checagem a código aninhado, que um
  # app Tauri quase não tem, então custa nada.
  codesign --verify --strict --deep "$APP_MONTADO" 2>/dev/null ||
    falha "a assinatura do app é inválida — o arquivo foi alterado. Instalação cancelada."

  local detalhes identificador
  detalhes=$(codesign -dv "$APP_MONTADO" 2>&1) || falha "não consegui ler a assinatura do app."
  identificador=$(printf '%s\n' "$detalhes" | sed -n 's/^Identifier=//p')
  [ "$identificador" = "$IDENTIFICADOR_DO_APP" ] ||
    falha "o app não é o Streamz (identificador '$identificador'). Instalação cancelada."

  conferir_certificado

  EXECUTAVEL=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' \
    "$APP_MONTADO/Contents/Info.plist" 2>/dev/null) || EXECUTAVEL=""
}

conferir_certificado() {
  local pin256 pin1
  pin256=$(printf '%s' "$PIN_DO_CERTIFICADO_SHA256" | tr -d ' :' | tr 'A-F' 'a-f')
  pin1=$(printf '%s' "$PIN_DO_CERTIFICADO_SHA1" | tr -d ' :' | tr 'A-F' 'a-f')

  if [ -z "$pin256" ] && [ -z "$pin1" ]; then
    aviso "verificação de autoria desligada (sem pin do certificado neste instalador)."
    return
  fi
  # Os dois pins vêm do mesmo certificado (gerar-certificado-mac.sh imprime os
  # dois juntos). Um preenchido sem o outro não é "verificação parcial", é
  # instalador mal configurado — abortar em vez de rodar só metade da conferência.
  if [ -z "$pin256" ] || [ -z "$pin1" ]; then
    falha "configuração inconsistente: só um dos pins do certificado (SHA-256/SHA-1) está preenchido neste instalador. Preencha os dois ou nenhum."
  fi

  # O `--verify` acima já provou que a assinatura foi feita pela chave deste
  # certificado; falta provar que o certificado é o NOSSO. Assinatura ad-hoc
  # não tem certificado nenhum e cai no primeiro teste.
  local prefixo="$DIR_TEMP/certificado" obtido
  codesign -d --extract-certificates="$prefixo" "$APP_MONTADO" >/dev/null 2>&1 || true
  [ -f "${prefixo}0" ] ||
    falha "o app não está assinado com o certificado do Streamz. Instalação cancelada."
  obtido=$(shasum -a 256 "${prefixo}0" | awk '{print $1}')
  [ "$obtido" = "$pin256" ] ||
    falha "o certificado que assina o app não é o do Streamz. Instalação cancelada."

  # Segunda conferência, independente da primeira: o requisito de código do
  # próprio `codesign`, amarrando identificador do app + certificado FOLHA pelo
  # SHA-1 — o mesmo requirement que o TCC grava (ver gerar-certificado-mac.sh).
  # `H"..."` só aceita SHA-1; retorno 0 satisfaz, 3 não satisfaz (e qualquer
  # outro código, como requisito malformado, também é tratado como falha).
  codesign --verify --strict \
    -R="identifier \"$IDENTIFICADOR_DO_APP\" and certificate leaf = H\"$pin1\"" \
    "$APP_MONTADO" 2>/dev/null ||
    falha "o certificado que assina o app não passou no requisito de código do Streamz. Instalação cancelada."
}

# Pasta de destino. Preenche DESTINO.
DESTINO=""
escolher_destino() {
  if [ -n "${STREAMZ_DESTINO:-}" ]; then
    DESTINO=${STREAMZ_DESTINO%/}
    case "$DESTINO" in /*) ;; *) falha "STREAMZ_DESTINO precisa ser um caminho absoluto." ;; esac
    [ -d "$DESTINO" ] && [ -w "$DESTINO" ] ||
      falha "sem permissão de escrita em $DESTINO."
    return
  fi

  DESTINO=/Applications
  if [ ! -w "$DESTINO" ]; then
    # conta padrão (não administradora) não escreve em /Applications, e pedir
    # sudo para instalar um app de usuário seria desproporcional
    DESTINO="$HOME/Applications"
    mkdir -p "$DESTINO" || falha "não consegui criar $DESTINO."
    aviso "sem permissão em /Applications; instalando em $DESTINO."
    if [ -d "/Applications/$NOME_DO_APP" ]; then
      aviso "existe outra cópia em /Applications/$NOME_DO_APP, que continua lá."
    fi
  fi
}

fechar_se_aberto() {
  local alvo="$DESTINO/$NOME_DO_APP" i
  [ -d "$alvo" ] || return 0
  [ -n "$EXECUTAVEL" ] || return 0
  pgrep -x "$EXECUTAVEL" >/dev/null 2>&1 || return 0

  if ! perguntar_sim "O Streamz está aberto. Fechar agora para atualizar?"; then
    falha "feche o Streamz e rode o comando de novo."
  fi
  # `tell application id` só depois do pgrep: com o app fechado, esse comando
  # o ABRIRIA
  osascript -e "tell application id \"$IDENTIFICADOR_DO_APP\" to quit" \
    </dev/null >/dev/null 2>&1 || true
  for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
    pgrep -x "$EXECUTAVEL" >/dev/null 2>&1 || return 0
    sleep 0.5
  done
  falha "o Streamz não fechou. Feche-o (Cmd+Q) e rode o comando de novo."
}

instalar() {
  local alvo="$DESTINO/$NOME_DO_APP"
  # Copia para um nome provisório na MESMA pasta e só então troca: `ditto` por
  # cima de um bundle existente mescla os dois, e arquivo velho sobrando quebra
  # o selo da assinatura. O `mv` na mesma pasta é atômico; se a cópia falhar no
  # meio, o app antigo continua intacto.
  local novo="$DESTINO/.Streamz.app.novo.$$" antigo="$DESTINO/.Streamz.app.antigo.$$"

  msg "Instalando em $DESTINO..."
  rm -rf "$novo" "$antigo"
  if ! ditto "$APP_MONTADO" "$novo"; then
    rm -rf "$novo"
    falha "não consegui copiar o app para $DESTINO."
  fi
  # o curl não põe quarentena, mas uma cópia antiga ou um proxy corporativo
  # podem ter posto; sem o atributo o Gatekeeper não intercepta a abertura
  xattr -dr com.apple.quarantine "$novo" 2>/dev/null || true

  if [ -e "$alvo" ]; then
    mv "$alvo" "$antigo" || {
      rm -rf "$novo"
      falha "não consegui substituir $alvo (sem permissão?)."
    }
  fi
  if ! mv "$novo" "$alvo"; then
    [ -e "$antigo" ] && mv "$antigo" "$alvo"
    rm -rf "$novo"
    falha "não consegui colocar o app em $alvo."
  fi
  rm -rf "$antigo" 2>/dev/null || aviso "sobrou a versão anterior em $antigo; pode apagar."
}

principal() {
  # Nada abaixo deve ler o stdin: ele é o próprio script chegando pelo pipe.
  exec </dev/null
  trap limpar EXIT
  # HUP entra porque fechar a janela do Terminal no meio é o jeito mais comum
  # de "cancelar" — sem ele sobrariam a imagem montada e o .dmg no temporário
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM

  conferir_sistema
  resolver_api
  DIR_TEMP=$(mktemp -d "${TMPDIR:-/tmp}/streamz-instalar.XXXXXX")

  msg "Instalador do Streamz para macOS"
  # destino antes da senha: descobrir a falta de permissão só depois de baixar
  # seria gastar o link (e a paciência) à toa
  escolher_destino
  pedir_link
  baixar
  montar_e_conferir
  fechar_se_aberto
  instalar

  # se o volume estiver ocupado, fica para o `trap`, que tenta com -force
  if hdiutil detach -quiet "$PONTO_DE_MONTAGEM" </dev/null 2>/dev/null; then
    PONTO_DE_MONTAGEM=""
  fi

  msg "Pronto: $DESTINO/$NOME_DO_APP"
  if [ "${STREAMZ_NAO_ABRIR:-}" != 1 ]; then
    open "$DESTINO/$NOME_DO_APP" || aviso "não consegui abrir o app; abra pela pasta Aplicativos."
  fi
}

principal "$@"
