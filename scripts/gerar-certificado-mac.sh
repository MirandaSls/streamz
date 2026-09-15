#!/usr/bin/env bash
#
# Gera, UMA vez, o certificado AUTOASSINADO que assina o Streamz.app no macOS.
# Roda num Mac ou em qualquer máquina com openssl (OpenSSL 1.1/3 ou o LibreSSL
# que o macOS traz); no Mac ele ainda confere que o `security import` aceita o
# `.p12` gerado.
#
# Por que existe: sem conta Apple Developer o app sai com assinatura ad-hoc, e
# no ad-hoc o "designated requirement" do código é o próprio cdhash — muda a
# cada build. O TCC (permissões de microfone, câmera e gravação de tela) grava
# a permissão amarrada a esse requirement, então para ele cada versão nova é
# um app diferente e as permissões são pedidas de novo. Assinando com uma chave
# nossa, o requirement vira
#   identifier "dev.streamz.app" and certificate root = H"<sha1 do certificado>"
# que é o mesmo em todo build. O certificado NÃO passa no Gatekeeper (isso só
# com Developer ID + notarização); o aviso de "desenvolvedor não identificado"
# continua. O que ele dá é (1) permissões que sobrevivem à atualização e (2) uma
# impressão digital que o instalador pode fixar para conferir que o app foi
# assinado por nós.
#
# CUIDADOS — leia antes de rodar:
#   * A chave privada (dentro do `.p12`) NUNCA vai para o repositório. Ela mora
#     fora dele (padrão ~/.streamz/certificado-mac/, chmod 600) e, no CI, só
#     como segredo (APPLE_CERTIFICATE no Codemagic). O script recusa gravar
#     dentro de um repositório git.
#   * Perder a chave NÃO quebra nada de imediato, mas custa: o próximo build
#     assinado com uma chave nova tem outro requirement, então cada usuário
#     vê os pedidos de permissão mais uma vez, e o pin do instalador precisa
#     ser trocado para a nova impressão digital. Guarde o `.p12` e a senha num
#     cofre de senhas.
#   * Por isso o script se recusa a sobrescrever um `.p12` que já existe.
#
# Uso:
#   scripts/gerar-certificado-mac.sh [<diretório de saída>]
#
#     <diretório de saída>   onde gravar. Padrão: ~/.streamz/certificado-mac
#
# A senha do `.p12` vem do ambiente em STREAMZ_SENHA_CERTIFICADO; sem ela o
# script pergunta, e se a resposta for vazia gera uma aleatória. Em qualquer
# caso ela é impressa UMA vez no final e não é gravada em disco.
#
# Saída (no diretório):
#   streamz-mac.p12            chave + certificado (o que vira APPLE_CERTIFICATE)
#   streamz-mac.cert.pem       só o certificado — público, serve para conferência

set -euo pipefail

passo() { printf '\n==> %s\n' "$*"; }
falha() { printf 'ERRO: %s\n' "$*" >&2; exit 1; }

case "${1:-}" in
  -h|--help) sed -n '2,44p' "$0"; exit 0 ;;
  -*) falha "opção desconhecida: $1" ;;
esac
[ $# -le 1 ] || falha "argumentos demais; uso: $0 [<diretório de saída>]"

DESTINO="${1:-$HOME/.streamz/certificado-mac}"
NOME_CN="Streamz (autoassinado)"
P12="$DESTINO/streamz-mac.p12"
CERT_PEM="$DESTINO/streamz-mac.cert.pem"

command -v openssl >/dev/null 2>&1 || falha "falta o openssl."

# A chave dentro de uma pasta versionada acabaria num `git add .` distraído.
# Checado no ancestral mais próximo que já existe, ANTES do `mkdir`, para não
# deixar pasta vazia criada dentro do repositório ao recusar.
EXISTENTE="$DESTINO"
while [ ! -d "$EXISTENTE" ]; do EXISTENTE=$(dirname "$EXISTENTE"); done
if command -v git >/dev/null 2>&1 && git -C "$EXISTENTE" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  falha "$DESTINO está dentro de um repositório git. A chave privada não pode morar em repositório — escolha uma pasta fora dele."
fi

mkdir -p "$DESTINO"
DESTINO=$(cd "$DESTINO" && pwd)
P12="$DESTINO/streamz-mac.p12"
CERT_PEM="$DESTINO/streamz-mac.cert.pem"
[ -e "$P12" ] && falha "já existe $P12. Trocar a chave faz todo usuário repetir as permissões e exige novo pin no instalador; se é mesmo isso que você quer, mova o arquivo antigo para outro lugar antes."

# `umask 077` antes de criar qualquer coisa: a chave nunca existe, nem por um
# instante, legível por outro usuário da máquina.
umask 077
chmod 700 "$DESTINO"

# ---------------------------------------------------------------- senha
if [ -z "${STREAMZ_SENHA_CERTIFICADO:-}" ]; then
  if [ -t 0 ]; then
    printf 'Senha do .p12 (Enter vazio = gerar uma aleatória): '
    read -r -s STREAMZ_SENHA_CERTIFICADO
    printf '\n'
    if [ -n "$STREAMZ_SENHA_CERTIFICADO" ]; then
      printf 'Repita a senha: '
      read -r -s CONFIRMACAO
      printf '\n'
      [ "$CONFIRMACAO" = "$STREAMZ_SENHA_CERTIFICADO" ] || falha "as senhas não conferem."
      unset CONFIRMACAO
    fi
  fi
fi
SENHA_GERADA=0
if [ -z "${STREAMZ_SENHA_CERTIFICADO:-}" ]; then
  # Só letras e dígitos: a senha vai parar em variável de ambiente do CI e em
  # linha de comando do `security import`, onde `/`, `+` e `=` do base64 cru
  # dão problema de aspas.
  STREAMZ_SENHA_CERTIFICADO=$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | cut -c1-32)
  SENHA_GERADA=1
fi
# Exportada para o openssl ler com `env:` — na linha de comando (`pass:`) ela
# apareceria no `ps` de qualquer usuário da máquina. Só o openssl tem essa
# saída: o `security import` da conferência no Mac recebe a senha em `-P`.
export STREAMZ_SENHA_CERTIFICADO

# ---------------------------------------------------------------- certificado
TMP=$(mktemp -d "${TMPDIR:-/tmp}/streamz-cert.XXXXXX")
limpar() { rm -rf "$TMP"; }
trap limpar EXIT
trap 'exit 130' INT TERM

# Arquivo de configuração e não `-addext`: o LibreSSL do macOS não tem
# `-addext`. As extensões são as de um certificado de assinatura de código
# comum (as mesmas que o Assistente de Certificado do Acesso às Chaves põe):
# uso de chave "assinatura digital", uso estendido "code signing" e não-CA —
# é com esse perfil que a política "Code Signing" do `security find-identity`
# o lista como identidade.
cat > "$TMP/cert.cnf" <<EOF
[ req ]
distinguished_name = dn
x509_extensions    = ext
prompt             = no

[ dn ]
CN = $NOME_CN
O  = Streamz

[ ext ]
basicConstraints     = critical, CA:FALSE
keyUsage             = critical, digitalSignature
extendedKeyUsage     = critical, codeSigning
subjectKeyIdentifier = hash
EOF

passo "Gerando chave RSA 2048 e certificado autoassinado (10 anos)"
# 10 anos: trocar de certificado custa as permissões de todo mundo, então ele
# precisa durar mais que qualquer ciclo de vida razoável do app.
openssl req -new -x509 -newkey rsa:2048 -nodes -sha256 -days 3650 \
  -config "$TMP/cert.cnf" -keyout "$TMP/chave.pem" -out "$TMP/cert.pem" 2>/dev/null \
  || falha "o openssl não conseguiu gerar o certificado."

passo "Empacotando em .p12"
# PBE-SHA1-3DES + MAC SHA-1, explícitos: é o formato que o `security import`
# de todo macOS aceita. O padrão do OpenSSL 3 (AES-256 + PBKDF2) é conhecido
# por ser recusado pelo `security` de macOS mais antigos ("MAC verification
# failed"), e o `-legacy` do OpenSSL 3 usa RC2-40, que depende do provider
# legado carregado.
# Com os algoritmos escritos por extenso, OpenSSL 1.1, OpenSSL 3 e LibreSSL
# geram o mesmo tipo de arquivo, sem provider legado.
openssl pkcs12 -export \
  -inkey "$TMP/chave.pem" -in "$TMP/cert.pem" -name "$NOME_CN" \
  -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -macalg sha1 \
  -passout env:STREAMZ_SENHA_CERTIFICADO -out "$TMP/streamz-mac.p12" \
  || falha "o openssl não conseguiu gerar o .p12."

# A impressão digital é sobre o DER do certificado — os mesmos bytes que o
# `codesign -d --extract-certificates` devolve de dentro do `.app` (conferido
# num Mac: `shasum -a 256 codesign0` bate com este valor).
SHA256=$(openssl x509 -in "$TMP/cert.pem" -outform DER | openssl dgst -sha256 | awk '{print $NF}')
SHA1=$(openssl x509 -in "$TMP/cert.pem" -outform DER | openssl dgst -sha1 | awk '{print $NF}')
SHA1_MAIUSCULO=$(printf '%s' "$SHA1" | tr 'a-f' 'A-F')

# ---------------------------------------------------------------- conferência no Mac
# Só no macOS: importa num keychain descartável (nunca no login) para provar
# que o `security` aceita o `.p12` e que ele vira uma identidade com o SHA-1
# esperado. `find-identity` SEM `-v`: o certificado não é confiável para o
# sistema (CSSMERR_TP_NOT_TRUSTED), e `-v` o esconde — o `codesign` assina com
# ele mesmo assim.
if [ "$(uname -s)" = Darwin ] && command -v security >/dev/null 2>&1; then
  passo "Conferindo o .p12 com o security do macOS (keychain temporário)"
  KC="$TMP/conferencia.keychain-db"
  KC_SENHA=$(openssl rand -hex 16)
  security create-keychain -p "$KC_SENHA" "$KC" >/dev/null
  security unlock-keychain -p "$KC_SENHA" "$KC"
  # `-P` põe a senha na linha de comando, visível no `ps` de qualquer usuário
  # da máquina enquanto o import roda (menos de um segundo). O `security
  # import` não tem opção de ler a senha do ambiente, de arquivo ou da entrada
  # padrão (sem `-P` ele abre um diálogo gráfico). Rode este script num Mac
  # só seu; em máquina compartilhada, gere o `.p12` fora do macOS, onde esta
  # conferência não roda.
  security import "$TMP/streamz-mac.p12" -k "$KC" -P "$STREAMZ_SENHA_CERTIFICADO" -T /usr/bin/codesign >/dev/null \
    || { security delete-keychain "$KC" 2>/dev/null || true; falha "o security import recusou o .p12 gerado."; }
  IDENTIDADES=$(security find-identity -p codesigning "$KC" 2>&1 || true)
  security delete-keychain "$KC" 2>/dev/null || true
  grep -q "$SHA1_MAIUSCULO" <<<"$IDENTIDADES" \
    || falha "o .p12 foi importado mas não aparece como identidade de assinatura com SHA-1 $SHA1_MAIUSCULO:
$IDENTIDADES"
  echo "ok: identidade $SHA1_MAIUSCULO \"$NOME_CN\" (não confiável para o sistema, como esperado)"
fi

# ---------------------------------------------------------------- gravação
mv "$TMP/streamz-mac.p12" "$P12"
cp "$TMP/cert.pem" "$CERT_PEM"
chmod 600 "$P12" "$CERT_PEM"

passo "Pronto"
cat <<EOF
Arquivos (fora do repositório, chmod 600):
  $P12
  $CERT_PEM

Segredos para o grupo do Codemagic (marque todos como "Secure"):

  APPLE_CERTIFICATE  (o .p12 em base64, uma linha só):
$(openssl base64 -A -in "$P12")

  APPLE_CERTIFICATE_PASSWORD:
$STREAMZ_SENHA_CERTIFICADO

  APPLE_SIGNING_IDENTITY  (SHA-1 do certificado; o build confere que bate com o .p12):
$SHA1_MAIUSCULO

Pin do instalador — SHA-256 do certificado (DER), hex minúsculo sem separador:
$SHA256

Como conferir um .app contra o pin:
  d=\$(mktemp -d) && (cd "\$d" && codesign -d --extract-certificates /Applications/Streamz.app && shasum -a 256 codesign0)
e, SEMPRE junto, a assinatura (extrair o certificado não prova que ela vale):
  codesign --verify --strict -R='identifier "dev.streamz.app" and certificate leaf = H"$SHA1"' /Applications/Streamz.app

Build local assinado:
  scripts/build-desktop-macos.sh --certificado "$P12" --senha-do-certificado-em <arquivo com a senha>
EOF
if [ "$SENHA_GERADA" = 1 ]; then
  echo
  echo "A senha acima foi GERADA agora e não está gravada em lugar nenhum: guarde-a no cofre de senhas antes de fechar este terminal."
fi
