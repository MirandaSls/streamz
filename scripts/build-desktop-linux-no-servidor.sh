#!/usr/bin/env bash
#
# Gera o app de desktop do Streamz para **Linux x86_64** neste servidor, em
# Docker: o `.AppImage` (o que vai para a página de download — um arquivo só,
# roda em qualquer distro com glibc >= 2.35, sem instalar nada) e o `.deb`
# (bônus para quem prefere o gerenciador de pacotes do Debian/Ubuntu).
#
# Por que existe: o mesmo motivo do `build-desktop-no-servidor.sh` — não há
# GitHub Actions (§3.5 do processo) e o host não tem rust nem node. Aqui não há
# cross-compile: o servidor já é Linux x86_64, e a imagem `streamz-linux`
# (`apps/desktop/Dockerfile.linux`) só traz o GTK/WebKitGTK e as ferramentas
# que o empacotador do Tauri chama.
#
# O que este script NÃO prova:
#
#   - que o app abre, que a bandeja aparece e que o som toca numa distro de
#     verdade. Isso é uma máquina Linux com tela; aqui se prova que os pacotes
#     existem, são ELF/AppImage/deb x86-64 e estão assinados;
#   - voz, vídeo e compartilhamento de tela no app Linux: a permissão de
#     microfone/câmera já é resolvida no próprio app
#     (`apps/desktop/src-tauri/src/permissoes_linux.rs` liga
#     `enable-media-stream`/`enable-webrtc` e concede o pedido de mídia à
#     origem do bundle). O que fica em aberto é o WebKitGTK da distro: se o
#     pacote do sistema não foi compilado com `ENABLE_WEB_RTC` (o caso comum
#     em Ubuntu/Debian/Fedora/Arch), `RTCPeerConnection` continua
#     `undefined` e o LiveKit provavelmente não conecta — não verificado numa
#     distro de verdade.
#
# Uso:
#   scripts/build-desktop-linux-no-servidor.sh [<commit-ou-ref>] [opções]
#
#     <commit-ou-ref>   o que compilar. Padrão: origin/main.
#     --sem-assinar     não assina (não precisa da chave; sai sem `.sig` e o
#                       AppImage não serve para o atualizador, só para teste).
#     --refazer-imagem  reconstrói a imagem Docker mesmo que já exista.
#
# Saída: /opt/stack/streamz/.claude/saida-desktop/<versão>-<commit>-linux/
#
# A chave privada segue o desenho do Windows: entra montada como arquivo
# somente-leitura e o `TAURI_SIGNING_PRIVATE_KEY` carrega só o *caminho*. As
# assinaturas não são impressas; quem precisa do conteúdo dá `cat` no `.sig`.

set -euo pipefail

REPO=/opt/stack/streamz
IMAGEM=streamz-linux
CHAVE=/root/.tauri/streamz.key
# Worktree **separada** da do Windows, e não por capricho: na mesma worktree
# os dois builds dividiriam o `apps/desktop/src-tauri/target/`. Em paralelo, um
# esperaria o lock do outro; em sequência, é pior — o script do Windows exporta
# `RUSTFLAGS` (o remendo da UCRT), o cargo põe `RUSTFLAGS` na impressão digital
# de cada crate, e cada alternância Windows→Linux→Windows recompilaria tudo.
WORKTREE="$REPO/.claude/worktrees/build-desktop-linux"
SAIDA_BASE="$REPO/.claude/saida-desktop"

# Caches em volumes nomeados, fora do repositório (não sujam `git status`).
#
# Dois são **compartilhados** com o build do Windows, porque é seguro:
#   - o registry/git do cargo não depende de alvo nem de versão do rustc, e o
#     cargo protege o `$CARGO_HOME` com um lock de arquivo
#     (`.package-cache`) — dois builds ao mesmo tempo esperam um pelo outro no
#     download, não se corrompem;
#   - a store do pnpm é endereçada por conteúdo e escrita com rename atômico.
# O `~/.cache` fica **próprio**: o do Windows guarda o NSIS e o deste guarda o
# linuxdeploy e seus plugins — misturar não economiza nada e só confunde
# quem for limpar um dos dois.
VOL_CARGO=streamz-cargo          # registry + git do cargo (compartilhado)
VOL_PNPM=streamz-pnpm            # store do pnpm (compartilhado)
VOL_XDG=streamz-linux-xdg        # ~/.cache: linuxdeploy, AppRun, plugins gtk/gstreamer

REF=origin/main
ASSINAR=1
REFAZER_IMAGEM=0

for arg in "$@"; do
  case "$arg" in
    --sem-assinar) ASSINAR=0 ;;
    --refazer-imagem) REFAZER_IMAGEM=1 ;;
    -h|--help) sed -n '2,36p' "$0"; exit 0 ;;
    -*) echo "opção desconhecida: $arg" >&2; exit 2 ;;
    *) REF="$arg" ;;
  esac
done

passo() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

# ---------------------------------------------------------------- imagem
if [ "$REFAZER_IMAGEM" = 1 ] || ! docker image inspect "$IMAGEM" >/dev/null 2>&1; then
  passo "Construindo a imagem $IMAGEM (uns 4 min; GTK/WebKitGTK + GStreamer + rustup)"
  docker build -f "$REPO/apps/desktop/Dockerfile.linux" -t "$IMAGEM" "$REPO"
else
  echo "imagem $IMAGEM já existe (use --refazer-imagem para reconstruir)"
fi

for v in "$VOL_CARGO" "$VOL_PNPM" "$VOL_XDG"; do
  docker volume create "$v" >/dev/null
done

# ---------------------------------------------------------------- worktree
# Worktree própria e **detached**, reaproveitada se já existir — remover
# worktree neste servidor é decisão do usuário, não do script (memória
# `streamz-acoes-bloqueadas`). O `clean` derruba só saída de build, e só nas
# pastas listadas: `git clean` nunca apaga arquivo versionado (o projeto
# Android em `gen/android` fica intacto), só o não rastreado e, com `-x`, o
# ignorado.
passo "Preparando a worktree em $WORKTREE ($REF)"
git -C "$REPO" fetch --quiet origin
if [ -d "$WORKTREE" ]; then
  git -C "$WORKTREE" checkout --quiet --detach "$REF"
  git -C "$WORKTREE" clean -qfdx apps/desktop/src-tauri/gen/schemas apps/web/out || true
else
  git -C "$REPO" worktree add --detach "$WORKTREE" "$REF"
fi
COMMIT=$(git -C "$WORKTREE" rev-parse --short HEAD)
# Sem `node` no host (memória `streamz-sem-node-no-host`): versão por sed.
VERSAO=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$WORKTREE/apps/desktop/package.json" | head -1)
echo "commit $COMMIT, versão $VERSAO"

if [ ! -f "$WORKTREE/apps/desktop/src-tauri/tauri.linux.conf.json" ]; then
  echo "ERRO: $REF não tem apps/desktop/src-tauri/tauri.linux.conf.json." >&2
  echo "Sem ele o bundle.targets é o do Windows (nsis/msi) e o build não gera nada para Linux." >&2
  exit 1
fi

# ---------------------------------------------------------------- assinatura
MONTA_CHAVE=()
ENV_CHAVE=()
CONFIG_RELEASE=""
if [ "$ASSINAR" = 1 ]; then
  if [ ! -r "$CHAVE" ]; then
    echo "ERRO: chave de assinatura não encontrada em $CHAVE." >&2
    echo "Ela é a mesma do segredo TAURI_SIGNING_PRIVATE_KEY do repositório." >&2
    echo "Sem ela o atualizador recusa o pacote; use --sem-assinar para um build de teste." >&2
    exit 1
  fi
  MONTA_CHAVE=(-v "$CHAVE:/run/chave-de-assinatura:ro")
  ENV_CHAVE=(
    -e TAURI_SIGNING_PRIVATE_KEY=/run/chave-de-assinatura
    -e TAURI_SIGNING_PRIVATE_KEY_PASSWORD=
  )
  # `createUpdaterArtifacts: true`: é o que faz sair o `.AppImage.sig` (e o
  # `.deb.sig`) ao lado dos pacotes. No Linux o próprio AppImage é o pacote do
  # atualizador — não há `.tar.gz` no formato v2.
  CONFIG_RELEASE="--config src-tauri/tauri.release.conf.json"
fi

# `NO_STRIP` só atravessa para o container se foi pedido no host (ver o
# comentário no Dockerfile.linux sobre o `strip` do linuxdeploy).
ENV_STRIP=()
if [ -n "${NO_STRIP:-}" ]; then
  ENV_STRIP=(-e NO_STRIP="$NO_STRIP")
fi

# ---------------------------------------------------------------- build
# `--bundles appimage,deb`: é o que o `tauri.linux.conf.json` já pede, repetido
# aqui para o build não mudar de forma em silêncio se alguém mexer lá (um
# `rpm` a mais custa outro minuto e outra dependência na imagem).
#
# Os pacotes antigos em `target/release/bundle/{appimage,deb}` são apagados
# antes: o bundler do AppImage limpa a própria pasta (`linuxdeploy.rs`), mas não
# vale apostar que todo formato faz o mesmo — um `.deb` de versão anterior que
# sobrasse lá seria um pacote velho a um `cp` de ir parar na saída.
#
# O container roda como root, então tudo o que ele escreve na worktree
# (`target/`, `node_modules/`, `apps/web/out`) sai com dono root. Neste
# servidor o dono da worktree já é root e nada muda; se não for, um segundo
# container devolve a posse ao dono da worktree — mesmo que o build falhe, para
# a próxima rodada (ou um `git clean`) não tropeçar em arquivo alheio.
DONO=$(stat -c '%u:%g' "$WORKTREE")

passo "Build (a primeira rodada compila ~500 crates e baixa o linuxdeploy)"
INICIO=$(date +%s)
set +e
docker run --rm \
  -v "$WORKTREE:/repo" \
  -v "$VOL_CARGO:/cache/cargo" \
  -v "$VOL_PNPM:/cache/pnpm" \
  -v "$VOL_XDG:/cache/xdg" \
  "${MONTA_CHAVE[@]}" \
  -e NEXT_PUBLIC_API_URL=https://api.streamz.chat \
  -e NEXT_PUBLIC_WS_URL=https://api.streamz.chat \
  -e NEXT_PUBLIC_LIVEKIT_URL=wss://livekit.streamz.chat \
  -e NEXT_TELEMETRY_DISABLED=1 \
  -e CI=true \
  "${ENV_CHAVE[@]}" \
  "${ENV_STRIP[@]}" \
  -w /repo \
  "$IMAGEM" bash -euo pipefail -c "
    pnpm config set store-dir /cache/pnpm --global
    pnpm install --frozen-lockfile
    pnpm --filter @streamz/shared build
    rm -rf apps/desktop/src-tauri/target/release/bundle/appimage \
           apps/desktop/src-tauri/target/release/bundle/deb
    pnpm --filter @streamz/desktop exec tauri build --bundles appimage,deb $CONFIG_RELEASE
  "
STATUS=$?
set -e
DURACAO=$(( $(date +%s) - INICIO ))

if [ "$DONO" != "0:0" ]; then
  passo "Devolvendo a posse da worktree a $DONO"
  docker run --rm -v "$WORKTREE:/repo" "$IMAGEM" chown -R "$DONO" /repo
fi

if [ "$STATUS" != 0 ]; then
  echo "ERRO: o build falhou (código $STATUS) depois de $((DURACAO / 60)) min $((DURACAO % 60)) s." >&2
  echo "Se foi 137 / \"signal: 9\", é memória (OOM killer), não código." >&2
  exit "$STATUS"
fi

# ---------------------------------------------------------------- saída
# Nomes exatos, com a versão, em vez de `*.AppImage`: é a segunda trava (depois
# do `rm -rf` lá em cima) contra copiar pacote de outra versão para a saída.
BUNDLE="$WORKTREE/apps/desktop/src-tauri/target/release/bundle"
APPIMAGE="$BUNDLE/appimage/Streamz_${VERSAO}_amd64.AppImage"
DEB="$BUNDLE/deb/Streamz_${VERSAO}_amd64.deb"
for f in "$APPIMAGE" "$DEB"; do
  if [ ! -f "$f" ]; then
    echo "ERRO: o build terminou mas $f não existe. Conteúdo de $BUNDLE:" >&2
    ls -la "$BUNDLE"/* >&2 || true
    exit 1
  fi
done

SAIDA="$SAIDA_BASE/$VERSAO-$COMMIT-linux"
mkdir -p "$SAIDA"
cp "$APPIMAGE" "$DEB" "$SAIDA"/
if [ "$ASSINAR" = 1 ]; then
  cp "$APPIMAGE.sig" "$SAIDA"/
  # O `.deb.sig` só serviria a quem instalou pelo `.deb` e se atualizasse por
  # ele, e o atualizador que a API serve é o do AppImage. Vai junto porque é de
  # graça e deixa a pasta completa.
  if [ -f "$DEB.sig" ]; then
    cp "$DEB.sig" "$SAIDA"/
  fi
fi
NOME_APPIMAGE=$(basename "$APPIMAGE")

passo "Pronto em $((DURACAO / 60)) min $((DURACAO % 60)) s"
for f in "$SAIDA"/*; do
  printf '%s\n  %s bytes  %s\n' "$f" "$(stat -c%s "$f")" "$(file -b "$f" | cut -c1-90)"
done
echo
echo "sha256:"
sha256sum "$SAIDA"/*.AppImage "$SAIDA"/*.deb

# ---------------------------------------------------------------- prova
# O que dá para perguntar sem uma tela: o que o `.deb` declara (dependências,
# seção) e se o AppImage tem dentro o que o `bundleMediaFramework` promete.
# Roda na própria imagem porque o host não precisa ter `dpkg-deb`.
passo "dpkg-deb --field (o que o .deb declara)"
docker run --rm -v "$SAIDA:/s:ro" "$IMAGEM" \
  dpkg-deb --field "/s/$(basename "$DEB")" Package Version Architecture Section Depends Recommends || true

passo "Conteúdo do AppImage (plugins GStreamer, WebKit, bandeja)"
# `--appimage-extract` descompacta o squashfs em ./squashfs-root sem FUSE. Em
# /tmp do container, que morre com ele: nada disto encosta na saída.
#
# A extração ganhou mensagem própria: se falhar (AppImage corrompido, sem
# espaço, etc.), a TRAVA de gst-libav/FFmpeg abaixo *depende* dela para rodar
# — sem squashfs-root não há como conferir se o FFmpeg GPL foi parar dentro
# do pacote. Por isso a extração falhando também derruba o script (a trava
# não pode passar sem conferir), só que com mensagem clara em vez do erro cru
# do `--appimage-extract`.
#
# Os `ls`/`grep` daqui para baixo até a trava são só informativos (contagem
# de plugins, presença do WebKit/appindicator/binários) — têm `|| true` para
# não derrubar o script por um diretório ausente; não fazem parte da
# checagem de licença.
#
# A TRAVA de gst-libav/FFmpeg no fim **não** tem `|| true`: é a decisão de
# não redistribuir GPL num app fechado (ver `apps/desktop/Dockerfile.linux`),
# e se algum dia `libgstlibav.so`/`libavcodec*.so*`/`libavformat*.so*`/
# `libavutil*.so*`/`libswresample*.so*` reaparecer aqui — porque alguém
# reinstalou `gstreamer1.0-libav` na imagem, ou outro pacote passou a puxá-lo
# — é regressão silenciosa se só o comentário do Dockerfile ficasse
# desatualizado. O build tem que falhar, não só avisar.
docker run --rm -v "$SAIDA:/s:ro" -w /tmp "$IMAGEM" bash -c "
  set -euo pipefail
  cp '/s/$NOME_APPIMAGE' app.AppImage && chmod +x app.AppImage
  if ! env -u APPIMAGE_EXTRACT_AND_RUN ./app.AppImage --appimage-extract >/dev/null 2>&1; then
    echo 'ERRO: não deu para extrair o AppImage; a trava de FFmpeg não pôde rodar.' >&2
    exit 1
  fi
  echo \"plugins GStreamer: \$(ls squashfs-root/usr/lib/gstreamer-1.0 2>/dev/null | wc -l)\"
  ls squashfs-root/usr/lib/gstreamer-1.0 2>/dev/null | grep -E 'libgst(pulseaudio|alsa|opengl|autodetect|playback)\.so' || true
  ls -d squashfs-root/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1 2>/dev/null || ls squashfs-root/usr/lib | grep -i webkit || true
  ls squashfs-root/usr/lib | grep -i appindicator || true
  ls squashfs-root/usr/bin || true
  ACHADOS=\$(find squashfs-root/usr/lib \( -iname 'libgstlibav.so*' -o -iname 'libavcodec*.so*' -o -iname 'libavformat*.so*' -o -iname 'libavutil*.so*' -o -iname 'libswresample*.so*' \) 2>/dev/null || true)
  if [ -n \"\$ACHADOS\" ]; then
    echo 'ERRO: gst-libav/FFmpeg (GPL) encontrado dentro do AppImage — não pode ser redistribuído num app fechado:' >&2
    echo \"\$ACHADOS\" >&2
    exit 1
  fi
"

passo "Licenças de terceiros (LGPL/GPL: pacotes e versões embutidos, para a oferta de código-fonte)"
# `apps/desktop/LICENCAS-DE-TERCEIROS.md` (embutido no próprio pacote via
# `tauri.linux.conf.json` → `bundle.linux.{appimage,deb}.files`) promete código
# correspondente para cada biblioteca redistribuída. Este passo grava, ao lado
# do pacote, QUAIS pacotes Ubuntu e em QUAL versão foram parar dentro desta
# build específica — sem isso a promessa não tem como ser cumprida com
# precisão (a versão do Ubuntu usada no `FROM` do Dockerfile muda com o tempo).
#
# A lista vem, de preferência, dos `.so` que **de fato** foram copiados para
# dentro do AppImage (`dpkg -S` na mesma imagem que empacotou, que é quem
# consegue amarrar arquivo→pacote→versão): assim ela acompanha sozinha
# qualquer mudança no que o `linuxdeploy`/`bundleMediaFramework` decide copiar,
# em vez de uma lista fixa que ficaria desatualizada a cada ajuste no
# Dockerfile. A LISTA_FIXA (inclui os plugins pulseaudio/alsa/gl, instalados
# no `Dockerfile.linux`) entra sempre também (o `sort -u` no fim deduplica) —
# rede de segurança para o caso raro de um `.so` que o `dpkg -S` não amarre a
# nada (ex.: arquivo renomeado pelo próprio bundler).
#
# Diferente da trava de FFmpeg do passo anterior, ESTE passo NÃO pode
# derrubar o build: os pacotes já estão prontos em $SAIDA, e um
# `versoes-de-terceiros.txt` incompleto é recuperável à mão depois — um build
# de 20 minutos perdido não. Por isso toda falha aqui (extração do AppImage,
# `dpkg -S`/`dpkg-query` sem pacote correspondente para algum `.so`, ou até o
# `docker run` inteiro) vira aviso + a LISTA_FIXA, nunca um `exit` que mata o
# script; o arquivo (com a origem anotada na primeira linha) e a cópia de
# LICENCAS-DE-TERCEIROS.md sempre acontecem, mesmo no pior caso. No fim, um
# aviso visível (sem falhar) se o `.md` ainda tiver o marcador
# `[CONTATO A DEFINIR ANTES DA PUBLICAÇÃO]` — ele é intencional até alguém
# preencher o contato oficial da oferta de código-fonte (LGPL §6(c)).
LISTA_FIXA="libwebkit2gtk-4.1-0 libgtk-3-0 libglib2.0-0 libgdk-pixbuf2.0-0 libcairo2 libpango-1.0-0 libgstreamer1.0-0 libgstreamer-plugins-base1.0-0 gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-pulseaudio gstreamer1.0-alsa gstreamer1.0-gl libayatana-appindicator3-1"

if ! docker run --rm \
  -v "$SAIDA:/s" \
  -e NOME_APPIMAGE="$NOME_APPIMAGE" \
  -e LISTA_FIXA="$LISTA_FIXA" \
  -w /tmp \
  "$IMAGEM" bash -s <<'EOF'
# Sem `-e`: este bloco decide sozinho, caso a caso, o que fazer quando um
# comando falha (extração, dpkg -S, dpkg-query) — matar o script aqui dentro
# tiraria a chance de cair para a LISTA_FIXA, que é exatamente a rede de
# segurança que este passo precisa.
set -uo pipefail

ORIGEM="dpkg -S nos .so extraidos do AppImage, mais a lista fixa"
PACOTES=""
if cp "/s/$NOME_APPIMAGE" app.AppImage \
  && chmod +x app.AppImage \
  && env -u APPIMAGE_EXTRACT_AND_RUN ./app.AppImage --appimage-extract >/dev/null 2>&1; then
  # dpkg -S devolve "pkgA, pkgB: /caminho" quando mais de um pacote instala o
  # mesmo arquivo — cortar só em ":" (o `cut -d: -f1` de antes) mantinha
  # "pkgA, pkgB" junto, e o `dpkg-query` seguinte, chamado com esse token
  # inteiro, falhava em silêncio (o pacote sumia da lista). Por isso troca
  # "," por quebra de linha antes do sort -u — cobre também o caso comum de
  # um pacote só. Cada estágio do pipe tem `|| true` para o `.so` que não
  # pertence a pacote nenhum não derrubar os que faltam processar (o status
  # de um `while` é o do último comando da última iteração).
  PACOTES=$( { find squashfs-root/usr/lib -name '*.so*' -type f 2>/dev/null || true; } \
    | xargs -r -n1 basename 2>/dev/null | sort -u \
    | while read -r so; do { dpkg -S "$so" 2>/dev/null || true; } | cut -d: -f1; done \
    | tr ',' '\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | sed '/^$/d' | sort -u)
  if [ -z "$PACOTES" ]; then
    echo "aviso: dpkg -S não achou nenhum pacote pelos .so extraídos do AppImage; usando só a lista fixa" >&2
    ORIGEM="lista fixa (dpkg -S não achou nenhum pacote pelos .so extraídos)"
  fi
else
  echo "aviso: não deu para extrair o AppImage para conferir pacotes por dpkg -S; usando só a lista fixa" >&2
  ORIGEM="lista fixa (não foi possível extrair o AppImage neste passo)"
fi

TODOS=$(printf '%s\n' $PACOTES $LISTA_FIXA | sed '/^$/d' | sort -u)

{
  echo "# pacote versao pacote-fonte versao-do-pacote-fonte"
  echo "# Ubuntu 22.04 (jammy/jammy-updates) -- codigo correspondente: apt-get source"
  echo "# <pacote-fonte>=<versao-fonte>, ou launchpad.net/ubuntu/+source/<pacote-fonte>."
  echo "# Detalhe de cada licenca em apps/desktop/LICENCAS-DE-TERCEIROS.md."
  echo "# Origem desta lista: $ORIGEM."
  for p in $TODOS; do
    dpkg-query -W -f='${Package} ${Version} ${source:Package} ${source:Version}\n' "$p" 2>/dev/null || true
  done | sort -u
} > /s/versoes-de-terceiros.txt
EOF
then
  # O `docker run` inteiro falhou (não só um comando de dentro, que já cai
  # nos ramos acima) — sem tocar no container de novo, gera o arquivo aqui
  # fora, só com a lista fixa e sem versão, para nunca faltar o arquivo.
  echo "aviso: o passo de licenças de terceiros falhou por completo (container/docker); gravando versoes-de-terceiros.txt só com a lista fixa, sem versão." >&2
  {
    echo "# pacote (versao nao conferida nesta build -- o passo de licencas falhou)"
    echo "# Origem desta lista: lista fixa (o passo dentro do container falhou por completo)."
    for p in $LISTA_FIXA; do echo "$p"; done
  } | sort -u > "$SAIDA/versoes-de-terceiros.txt"
fi

cp "$WORKTREE/apps/desktop/LICENCAS-DE-TERCEIROS.md" "$SAIDA"/
echo "gerado: $SAIDA/versoes-de-terceiros.txt"
echo "copiado: $SAIDA/LICENCAS-DE-TERCEIROS.md"

# Aviso visível, não falha: o marcador é intencional em LICENCAS-DE-TERCEIROS.md
# até alguém preencher o contato oficial da oferta de código-fonte (LGPL
# §6(c)) — publicar sem preencher não é ilegal, mas deixa a oferta sem como
# ninguém aceitá-la.
if grep -q '\[CONTATO A DEFINIR ANTES DA PUBLICAÇÃO\]' "$SAIDA/LICENCAS-DE-TERCEIROS.md"; then
  printf '\n\033[1;31m!!! AVISO: LICENCAS-DE-TERCEIROS.md ainda tem o marcador [CONTATO A DEFINIR ANTES DA PUBLICAÇÃO] — preencha o contato oficial antes de publicar este pacote. !!!\033[0m\n\n' >&2
fi

echo
echo "O que isto prova: os pacotes existem e têm o tamanho e o tipo acima."
if [ "$ASSINAR" = 1 ]; then
  echo "Estão assinados com a chave do atualizador (o .sig ao lado; o conteúdo não é impresso)."
else
  echo "Build --sem-assinar: sem .sig, não serve para o atualizador."
fi
echo "O que NÃO prova: que o app abre numa distro de verdade. Antes de publicar,"
echo "abra o AppImage uma vez numa máquina Linux com tela (chmod +x e duplo clique)."

# ---------------------------------------------------------------- publicação
# Sugestão, não ação: copiar para `downloads/` e `updates/` é publicar em
# produção, e isso é decisão de quem roda o script.
#
# O `.deb` TAMBÉM vai para `downloads/` quando você publica com
# `scripts/publicar-desktop.sh` — e isso é seguro: `escolherInstalador`
# (`apps/api/src/modules/downloads/instalador.ts`) escolhe por ORDEM DE
# PREFERÊNCIA DE EXTENSÃO (AppImage > deb > rpm), não pelo arquivo mais
# recente, então a página sempre serve o AppImage enquanto ele existir e o
# `.deb` ao lado só fica disponível para quem administra o servidor
# distribuir manualmente. Por isso a recomendação abaixo é publicar com
# aquele script — ele copia os dois para `downloads/` e só o AppImage (o que
# tem `.sig`) para `updates/`, ver o cabeçalho dele.
passo "Próximo passo — publicar (NÃO foi feito)"
if [ -x "$REPO/scripts/publicar-desktop.sh" ]; then
  echo "    scripts/publicar-desktop.sh $SAIDA            # dry-run: mostra o que faria"
  echo "    scripts/publicar-desktop.sh $SAIDA --aplicar"
else
  echo "aviso: scripts/publicar-desktop.sh não encontrado ou sem permissão de execução — publique com ele, não à mão, para não errar o que vai em downloads/ vs updates/."
  echo
  echo "à mão, o equivalente seria:"
  echo "    cp '$SAIDA/$NOME_APPIMAGE' '$SAIDA/$(basename "$DEB")' $REPO/downloads/"
  if [ "$ASSINAR" = 1 ]; then
    echo "    cp '$SAIDA/$NOME_APPIMAGE' $REPO/updates/"
    echo
    echo "e no .env da API (valem quando o UpdatesService atende linux-x86_64):"
    echo "    LINUX_UPDATE_VERSION=$VERSAO"
    echo "    LINUX_UPDATE_URL=https://api.streamz.chat/api/updates/arquivo/$NOME_APPIMAGE"
    echo "    LINUX_UPDATE_SIGNATURE=<conteúdo de $SAIDA/$NOME_APPIMAGE.sig>"
    echo "    LINUX_UPDATE_NOTES=Correções e melhorias."
  fi
fi
