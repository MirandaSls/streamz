#!/usr/bin/env bash
#
# Envia o build do macOS para a API (`POST /api/updates/macos`) — roda NO MAC,
# logo depois do `scripts/build-desktop-macos.sh`. Substitui o SFTP + o
# `publicar-desktop.sh` + a edição do `.env` para o Mac: a API confere tudo
# (versão, extensão, assinatura mágica, assinatura minisign contra a chave do
# app), grava sem nunca sobrescrever conteúdo diferente e, com o pacote do
# atualizador, escreve `updates/macos.json`, que liga o auto-update do Mac na
# hora (tem precedência sobre MACOS_UPDATE_* do .env).
#
# Só o ADMINISTRADOR DA INSTÂNCIA consegue (PLATFORM_ADMIN_EMAILS + e-mail
# verificado, o mesmo do painel admin).
#
# Uso:
#   scripts/enviar-macos.sh <pasta-de-saída | arquivos...> [--versao X.Y.Z]
#                           [--notas "texto"] [--api https://api.streamz.chat]
#                           [--login-em <arquivo>]
#   scripts/enviar-macos.sh --login-em <arquivo> --conferir-login
#
#   <pasta-de-saída>  a que o build imprime no fim:
#                     .claude/saida-desktop/<versão>-<commit>-macos/
#                     (Streamz_<versão>_universal.dmg, Streamz.app.tar.gz, .sig)
#   arquivos...       ou os arquivos soltos (.dmg, .app.tar.gz, .app.tar.gz.sig)
#   --versao          obrigatória só se não der para ler do nome do .dmg (ou
#                     da pasta); se der, tem de bater
#   --notas           texto das notas da versão (padrão: "Correções e melhorias.")
#   --api             base da API (padrão: https://api.streamz.chat)
#   --login-em <arq>  publica sem perguntar nada. O arquivo tem DUAS linhas:
#                       1ª  e-mail (ou usuário) da conta admin da instância
#                       2ª  a senha, byte a byte — o arquivo não tem comentário
#                           nem cabeçalho, porque "#" pode ser parte da senha
#                     Guarde-o FORA do repositório e com `chmod 600`, como a
#                     senha do .p12 (~/.streamz/certificado-mac/). O script
#                     recusa arquivo legível por grupo/outros. Mesmo efeito:
#                     STREAMZ_LOGIN_EM no ambiente.
#   --conferir-login  só confere o arquivo de --login-em (existe, permissão,
#                     duas linhas preenchidas) e sai. Não fala com a API e não
#                     precisa dos arquivos do build — é o que o
#                     `build-desktop-macos.sh --publicar` chama ANTES de
#                     compilar, para o erro de login não aparecer só meia hora
#                     depois.
#
# Login — três caminhos, nesta ordem de precedência:
#   1. STREAMZ_TOKEN no ambiente (access token já pronto);
#   2. --login-em <arquivo> / STREAMZ_LOGIN_EM — não interativo;
#   3. nenhum dos dois: pergunta e-mail e senha (e o código do 2FA, se a conta
#      tiver) pela rota de login normal.
# A senha não é impressa em lugar nenhum e não passa pela linha de comando (ela
# chega ao corpo da requisição pelo ambiente do python, fora do `ps`). A sessão
# criada aqui é encerrada no fim, para não acumular em "Dispositivos".
# Conta com 2FA ligado não tem como usar o caminho 2 — o script para e diz o que
# fazer, em vez de esperar um código que ninguém vai digitar.
#
# Envia em DUAS requisições (primeiro o .dmg, depois .app.tar.gz + .sig) para
# que cada uma seja menor — o proxy na frente da API tem tempo máximo por
# requisição. Repetir o comando é seguro: arquivo idêntico já publicado é
# aceito como "ja-existia".
#
# Dependências: bash, curl e python3 (vem com as Command Line Tools do Xcode,
# que o build já exige).

set -euo pipefail

API="https://api.streamz.chat"
VERSAO=""
NOTAS=""
ENTRADAS=()
# O caminho do arquivo pode vir do ambiente; a SENHA nunca — variável de
# ambiente é herdada por todo processo filho (curl, python) e aparece em
# ferramentas de inspeção de processo. O caminho é inofensivo, a senha não.
ARQUIVO_LOGIN="${STREAMZ_LOGIN_EM:-}"
CONFERIR_LOGIN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --versao) VERSAO="${2:?--versao precisa de X.Y.Z}"; shift ;;
    --versao=*) VERSAO="${1#*=}" ;;
    --notas) NOTAS="${2:?--notas precisa de um texto}"; shift ;;
    --notas=*) NOTAS="${1#*=}" ;;
    --api) API="${2:?--api precisa de uma URL}"; shift ;;
    --api=*) API="${1#*=}" ;;
    --login-em) ARQUIVO_LOGIN="${2:?--login-em precisa do caminho do arquivo}"; shift ;;
    --login-em=*) ARQUIVO_LOGIN="${1#*=}" ;;
    --conferir-login) CONFERIR_LOGIN=1 ;;
    -h|--help) sed -n '2,60p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) echo "opção desconhecida: $1" >&2; exit 2 ;;
    *) ENTRADAS+=("$1") ;;
  esac
  shift
done
API="${API%/}"

passo() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
aviso() { printf '\033[1;33maviso:\033[0m %s\n' "$*" >&2; }
erro()  { printf '\033[1;31mERRO:\033[0m %s\n' "$*" >&2; exit 1; }

# ------------------------------------------------------------ arquivo de login
# Fica aqui em cima, antes de qualquer coisa, porque o `--conferir-login` existe
# para o build chamar ANTES de compilar: um arquivo errado tem de doer no
# primeiro segundo, não depois de meia hora de cargo (mesma regra do certificado
# no build-desktop-macos.sh).
IDENT=""
SENHA=""

conferir_arquivo_de_login() { # conferir_arquivo_de_login <arquivo>
  local arq="$1" modo
  [ -n "$arq" ] || erro "--conferir-login sem --login-em <arquivo>"
  [ -e "$arq" ] || erro "arquivo de login não encontrado: $arq (1ª linha: e-mail ou usuário; 2ª linha: a senha)"
  [ -f "$arq" ] || erro "o caminho de --login-em não é um arquivo comum: $arq"
  [ -r "$arq" ] || erro "sem permissão de leitura em $arq"
  [ -s "$arq" ] || erro "o arquivo de login está vazio: $arq (1ª linha: e-mail ou usuário; 2ª linha: a senha)"
  # Permissão frouxa = qualquer bit de grupo ou de outros. Esta é a senha da
  # conta que publica auto-update para todo mundo; deixá-la legível por outro
  # usuário da máquina anularia o motivo de ela estar fora do repositório.
  # `stat -f` é o do macOS (onde este script roda); o `-c` é o do GNU, para o
  # caso de alguém conferir o arquivo num Linux. Não dá para encadear os dois
  # com `||`: no GNU, `-f` é "estatística do sistema de arquivos" e SAI BEM,
  # devolvendo algo que não é um modo — por isso cada resultado é conferido
  # contra dígitos octais antes de virar número.
  modo="$(stat -f '%OLp' "$arq" 2>/dev/null || true)"
  case "$modo" in ""|*[!0-7]*) modo="$(stat -c '%a' "$arq" 2>/dev/null || true)" ;; esac
  case "$modo" in ""|*[!0-7]*) modo="" ;; esac
  if [ -n "$modo" ] && [ "$((8#$modo & 8#77))" -ne 0 ]; then
    erro "$arq está com permissão $modo (legível por grupo/outros). Corrija com: chmod 600 \"$arq\""
  fi
}

ler_arquivo_de_login() { # ler_arquivo_de_login <arquivo> → define IDENT e SENHA
  local arq="$1"
  IDENT=""; SENHA=""
  # `|| true` nos dois: arquivo sem quebra de linha no final faz o `read`
  # devolver 1 mesmo tendo lido a linha inteira.
  { IFS= read -r IDENT || true; IFS= read -r SENHA || true; } < "$arq"
  # Arquivo salvo com quebra de linha do Windows (CRLF) deixaria um \r no fim de
  # cada linha, e o login seria recusado com um 401 sem explicação nenhuma.
  IDENT="${IDENT%$'\r'}"; SENHA="${SENHA%$'\r'}"
  # Espaço sobrando nas pontas do identificador é erro de cópia e colagem e vira
  # um 401 sem explicação; some com ele. Na senha, espaço pode SER a senha —
  # ela vai byte a byte, sem nenhuma limpeza. (Recorte só das pontas, para não
  # estragar um identificador que tenha espaço no meio.)
  IDENT="${IDENT#"${IDENT%%[![:space:]]*}"}"
  IDENT="${IDENT%"${IDENT##*[![:space:]]}"}"
  [ -n "$IDENT" ] || erro "a 1ª linha de $arq (e-mail ou usuário) está vazia"
  [ -n "$SENHA" ] || erro "$arq não tem a 2ª linha com a senha — o formato é: e-mail na 1ª linha, senha na 2ª"
}

if [ "$CONFERIR_LOGIN" = 1 ]; then
  conferir_arquivo_de_login "$ARQUIVO_LOGIN"
  ler_arquivo_de_login "$ARQUIVO_LOGIN"
  # O identificador não é segredo e ver de qual conta se trata evita publicar
  # pela conta errada; a senha, essa, não aparece aqui nem em lugar nenhum.
  echo "arquivo de login OK: $ARQUIVO_LOGIN (identificador: $IDENT)"
  echo "(conferência local: formato e permissão. A senha só é usada no envio.)"
  exit 0
fi

if [ "${#ENTRADAS[@]}" -eq 0 ]; then
  echo "uso: scripts/enviar-macos.sh <pasta-de-saída | arquivos...> [--versao X.Y.Z] [--notas \"...\"] [--api URL] [--login-em <arquivo>]" >&2
  exit 2
fi
command -v curl >/dev/null || erro "curl não encontrado"
command -v python3 >/dev/null || erro "python3 não encontrado (instale as Command Line Tools: xcode-select --install)"

# ---------------------------------------------------------------- arquivos
DMG=""; BUNDLE=""; SIG=""
pegar() { # pegar <arquivo>
  local f="$1" minusculo
  minusculo="$(printf '%s' "$f" | tr '[:upper:]' '[:lower:]')"
  case "$minusculo" in
    *.app.tar.gz.sig) [ -z "$SIG" ] || erro "mais de um .app.tar.gz.sig"; SIG="$f" ;;
    *.app.tar.gz)     [ -z "$BUNDLE" ] || erro "mais de um .app.tar.gz"; BUNDLE="$f" ;;
    *.dmg)            [ -z "$DMG" ] || erro "mais de um .dmg"; DMG="$f" ;;
    *) ;;
  esac
}
for entrada in "${ENTRADAS[@]}"; do
  if [ -d "$entrada" ]; then
    while IFS= read -r f; do pegar "$f"; done < <(find "$entrada" -maxdepth 1 -type f | sort)
  elif [ -f "$entrada" ]; then
    pegar "$entrada"
  else
    erro "não existe: $entrada"
  fi
done

[ -n "$DMG$BUNDLE" ] || erro "não achei .dmg nem .app.tar.gz em: ${ENTRADAS[*]}"
if [ -n "$BUNDLE" ] && [ -z "$SIG" ]; then
  aviso "achei $(basename "$BUNDLE") sem o .sig — envio só o .dmg (auto-update do Mac não muda). Gere com --assinar-atualizador."
  BUNDLE=""
fi
if [ -n "$SIG" ] && [ -z "$BUNDLE" ]; then
  aviso "achei $(basename "$SIG") sem o .app.tar.gz — ignorado"
  SIG=""
fi
[ -n "$DMG$BUNDLE" ] || erro "nada para enviar"

# ---------------------------------------------------------------- versão
versao_do_nome() { # Streamz_X.Y.Z_... ou <X.Y.Z>-<commit>-macos
  basename "$1" | grep -oE '^(Streamz_)?[0-9]+\.[0-9]+\.[0-9]+[_-]' | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || true
}
V_NOME=""
[ -n "$DMG" ] && V_NOME="$(versao_do_nome "$DMG")"
if [ -z "$V_NOME" ] && [ -n "$BUNDLE" ]; then
  # o .app.tar.gz não carrega versão; a pasta de saída do build carrega
  V_NOME="$(versao_do_nome "$(cd "$(dirname "$BUNDLE")" && pwd)")"
fi
if [ -n "$VERSAO" ] && [ -n "$V_NOME" ] && [ "$VERSAO" != "$V_NOME" ]; then
  erro "--versao $VERSAO não bate com a versão do nome ($V_NOME)"
fi
[ -n "$VERSAO" ] || VERSAO="$V_NOME"
[ -n "$VERSAO" ] || erro "não consegui ler a versão pelo nome; passe --versao X.Y.Z"
printf '%s' "$VERSAO" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$' || erro "versão inválida: $VERSAO"

passo "macOS $VERSAO → $API"
for f in "$DMG" "$BUNDLE" "$SIG"; do
  [ -n "$f" ] || continue
  printf '  %s  (%s bytes)\n' "$f" "$(wc -c < "$f" | tr -d ' ')"
done

# ---------------------------------------------------------------- login
json() { # json <campo.aninhado> — lê o JSON do stdin; vazio se não houver
  python3 -c '
import json, sys
try:
    v = json.load(sys.stdin)
    for k in sys.argv[1].split("."):
        v = v[k]
    print(v if not isinstance(v, (dict, list)) else json.dumps(v))
except Exception:
    pass
' "$1"
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
REFRESH=""

post_json() { # post_json <rota> <python que imprime o corpo> → corpo em $TMP/resp, status no stdout
  python3 -c "$2" > "$TMP/req.json"
  curl -sS -o "$TMP/resp" -w '%{http_code}' -X POST "$API/api$1" \
    -H 'content-type: application/json' --data-binary @"$TMP/req.json"
}

TOKEN="${STREAMZ_TOKEN:-}"
if [ -z "$TOKEN" ]; then
  # Um caminho só do login para diante: muda apenas de ONDE vêm IDENT e SENHA.
  INTERATIVO=1
  if [ -n "$ARQUIVO_LOGIN" ]; then
    INTERATIVO=0
    conferir_arquivo_de_login "$ARQUIVO_LOGIN"
    ler_arquivo_de_login "$ARQUIVO_LOGIN"
    passo "Login de $IDENT (arquivo $ARQUIVO_LOGIN)"
  else
    # Sem terminal e sem --login-em, o `read` abaixo leria o que viesse pelo
    # pipe (ou travaria esperando para sempre). Melhor dizer o que falta.
    [ -t 0 ] || erro "sem terminal para perguntar o login: use --login-em <arquivo> (1ª linha e-mail, 2ª senha, chmod 600) ou STREAMZ_TOKEN"
    passo "Login (conta administradora da instância)"
    printf 'E-mail ou usuário: ' >&2; IFS= read -r IDENT
    printf 'Senha: ' >&2; IFS= read -rs SENHA; echo >&2
  fi
  export IDENT SENHA
  status="$(post_json /auth/login 'import json,os; print(json.dumps({"identificador": os.environ["IDENT"], "password": os.environ["SENHA"]}))')"
  unset SENHA
  [ "$status" = 200 ] || [ "$status" = 201 ] || erro "login recusado (HTTP $status): $(json message < "$TMP/resp")"
  if [ "$(json mfaRequired < "$TMP/resp")" = "True" ]; then
    # Aqui o login ainda não criou sessão nenhuma (só um ticket), então parar
    # não deixa rastro para limpar. O que não dá é esperar um código que, sem
    # ninguém no terminal, nunca vai chegar.
    [ "$INTERATIVO" = 1 ] || erro "a conta $IDENT tem verificação em duas etapas (2FA) e o login por arquivo não tem como responder ao código.
       Saídas: (a) gere um access token com a conta já autenticada e rode com STREAMZ_TOKEN=... ;
               (b) rode o envio à mão, sem --login-em, num terminal, para digitar o código:
                   scripts/enviar-macos.sh \"<pasta-de-saída>\" --notas \"...\""
    TICKET="$(json ticket < "$TMP/resp")"
    printf 'Código do 2FA (ou de recuperação): ' >&2; IFS= read -r CODIGO
    export TICKET CODIGO
    status="$(post_json /auth/mfa 'import json,os; print(json.dumps({"ticket": os.environ["TICKET"], "code": os.environ["CODIGO"]}))')"
    [ "$status" = 200 ] || [ "$status" = 201 ] || erro "2FA recusado (HTTP $status): $(json message < "$TMP/resp")"
  fi
  TOKEN="$(json tokens.accessToken < "$TMP/resp")"
  REFRESH="$(json tokens.refreshToken < "$TMP/resp")"
  [ -n "$TOKEN" ] || erro "a resposta do login não trouxe token"
  # encerra a sessão criada aqui ao sair, para não acumular em "Dispositivos"
  trap 'export REFRESH; post_json /auth/logout "import json,os; print(json.dumps({\"refreshToken\": os.environ[\"REFRESH\"]}))" >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT
fi

# O access token dura 15 min; entre um envio e outro, renova se foi login aqui.
renovar() {
  [ -n "$REFRESH" ] || return 0
  export REFRESH
  local status
  status="$(post_json /auth/refresh 'import json,os; print(json.dumps({"refreshToken": os.environ["REFRESH"]}))')" || return 0
  if [ "$status" = 200 ] || [ "$status" = 201 ]; then
    TOKEN="$(json accessToken < "$TMP/resp")"
    REFRESH="$(json refreshToken < "$TMP/resp")"
  fi
}

# ---------------------------------------------------------------- envio
enviar() { # enviar <descrição> <-F ...>
  local desc="$1"; shift
  passo "Enviando $desc"
  # --form-string: um texto começando com @ ou < não vira leitura de arquivo
  local args=(--form-string "version=$VERSAO")
  if [ -n "$NOTAS" ]; then args+=(--form-string "notes=$NOTAS"); fi
  local status
  status="$(curl --progress-bar -o "$TMP/envio" -w '%{http_code}' -X POST "$API/api/updates/macos" \
    -H "authorization: Bearer $TOKEN" "${args[@]}" "$@")" || erro "falha de rede no envio ($desc)"
  if [ "$status" != 200 ]; then
    erro "HTTP $status: $(json message < "$TMP/envio")$( [ "$status" = 401 ] && echo ' — token vencido ou ausente')$( [ "$status" = 403 ] && echo ' — esta conta não é admin da instância (ou o e-mail não foi verificado)')"
  fi
  python3 - "$TMP/envio" <<'PY'
import json, sys
r = json.load(open(sys.argv[1]))
for a in r["arquivos"]:
    print(f'  {a["situacao"]:<10} {a["pasta"]}/{a["nome"]}  {a["tamanho"]} bytes  sha256 {a["sha256"]}')
if r["manifesto"]["gravado"]:
    print(f'  manifesto do macOS → {r["versao"]}  ({r["manifesto"]["url"]})')
au = r["autoUpdateMacos"]
print(f'  auto-update do Mac: ' + (f'ATIVO na {au["versao"]} (origem: {au["origem"]})' if au["ativo"] else 'inativo'))
PY
}

if [ -n "$DMG" ]; then
  enviar ".dmg (página de download)" -F "dmg=@$DMG;type=application/octet-stream"
fi
if [ -n "$BUNDLE" ]; then
  renovar
  enviar ".app.tar.gz + .sig (atualizador)" \
    -F "bundle=@$BUNDLE;type=application/gzip" \
    -F "sig=@$SIG;type=text/plain"
fi

passo "Pronto"
echo "Conferir: curl -s -o /dev/null -w '%{http_code}\\n' $API/api/updates/darwin/aarch64/0.0.0   (200 = oferece a $VERSAO)"
