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
#
#   <pasta-de-saída>  a que o build imprime no fim:
#                     .claude/saida-desktop/<versão>-<commit>-macos/
#                     (Streamz_<versão>_universal.dmg, Streamz.app.tar.gz, .sig)
#   arquivos...       ou os arquivos soltos (.dmg, .app.tar.gz, .app.tar.gz.sig)
#   --versao          obrigatória só se não der para ler do nome do .dmg (ou
#                     da pasta); se der, tem de bater
#   --notas           texto das notas da versão (padrão: "Correções e melhorias.")
#   --api             base da API (padrão: https://api.streamz.chat)
#
# Login: usa STREAMZ_TOKEN (access token) se definido; senão pergunta e-mail e
# senha (e o código do 2FA, se a conta tiver) pela rota de login normal.
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

while [ $# -gt 0 ]; do
  case "$1" in
    --versao) VERSAO="${2:?--versao precisa de X.Y.Z}"; shift ;;
    --versao=*) VERSAO="${1#*=}" ;;
    --notas) NOTAS="${2:?--notas precisa de um texto}"; shift ;;
    --notas=*) NOTAS="${1#*=}" ;;
    --api) API="${2:?--api precisa de uma URL}"; shift ;;
    --api=*) API="${1#*=}" ;;
    -h|--help) sed -n '2,37p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) echo "opção desconhecida: $1" >&2; exit 2 ;;
    *) ENTRADAS+=("$1") ;;
  esac
  shift
done
API="${API%/}"

passo() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
aviso() { printf '\033[1;33maviso:\033[0m %s\n' "$*" >&2; }
erro()  { printf '\033[1;31mERRO:\033[0m %s\n' "$*" >&2; exit 1; }

if [ "${#ENTRADAS[@]}" -eq 0 ]; then
  echo "uso: scripts/enviar-macos.sh <pasta-de-saída | arquivos...> [--versao X.Y.Z] [--notas \"...\"] [--api URL]" >&2
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
  passo "Login (conta administradora da instância)"
  printf 'E-mail ou usuário: ' >&2; IFS= read -r IDENT
  printf 'Senha: ' >&2; IFS= read -rs SENHA; echo >&2
  export IDENT SENHA
  status="$(post_json /auth/login 'import json,os; print(json.dumps({"identificador": os.environ["IDENT"], "password": os.environ["SENHA"]}))')"
  unset SENHA
  [ "$status" = 200 ] || [ "$status" = 201 ] || erro "login recusado (HTTP $status): $(json message < "$TMP/resp")"
  if [ "$(json mfaRequired < "$TMP/resp")" = "True" ]; then
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
