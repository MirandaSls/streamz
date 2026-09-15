# Licenças de terceiros — build Linux (AppImage/.deb)

Este arquivo cobre só o pacote **Linux** do Streamz Desktop
(`Streamz_<versão>_amd64.AppImage` e `Streamz_<versão>_amd64.deb`). O motivo de
ele existir é o `bundleMediaFramework: true` de
`apps/desktop/src-tauri/tauri.linux.conf.json`: para vídeo/áudio (Opus/Vorbis,
WebM VP8/VP9) tocar em qualquer distro, o AppImage carrega dentro de si o
WebKitGTK, o GTK/GLib e o GStreamer (núcleo + plugins *base*/*good* e os
plugins de saída *pulseaudio*/*alsa*/*gl*) — todos vinculados
**dinamicamente**, sem nenhuma modificação de código-fonte. Nada
disto é escrito por nós; é software de terceiros redistribuído tal como o
Ubuntu 22.04 (jammy) o compila.

O texto abaixo não é aconselhamento jurídico — é o resumo, para quem recebe o
pacote, de que licença rege cada peça e onde pegar o código-fonte correspondente.

## Componentes e licenças

| Componente | Pacotes Ubuntu (jammy) | Licença |
|---|---|---|
| WebKitGTK | `libwebkit2gtk-4.1-0` | LGPL-2.1(+)/LGPL-3, com partes BSD-2/3-Clause (o motor de renderização soma código de várias origens — Apple/KDE/Google/Nokia — cada arquivo com sua licença; nenhum arquivo do binário `.so` distribuído é GPL-only) |
| GTK 3 / GLib | `libgtk-3-0`, `libglib2.0-0` e dependências (`libgdk-pixbuf-2.0-0`, `libcairo2`, `libpango-1.0-0`, …) | LGPL-2.1+ |
| GStreamer (núcleo) | `libgstreamer1.0-0`, `libgstreamer-plugins-base1.0-0` | LGPL-2.1+ |
| Plugins GStreamer *base* e *good* | `gstreamer1.0-plugins-base`, `gstreamer1.0-plugins-good` | LGPL-2.1+ |
| Plugins GStreamer de saída de áudio/vídeo | `gstreamer1.0-pulseaudio`, `gstreamer1.0-alsa`, `gstreamer1.0-gl` | LGPL-2.1+ |
| Ícone de bandeja | `libayatana-appindicator3-1` | LGPL-2.1+ (o pacote é licenciado sob "LGPL-2.1 ou LGPL-3 ou GPL-3"; como o LGPL-2.1 é uma das opções, é o termo que seguimos) |

### FFmpeg/gst-libav: NÃO embutidos — não são LGPL no build do Ubuntu

O AppImage e o `.deb` **não** carregam `gstreamer1.0-libav` nem o FFmpeg da
distro (`libavcodec`/`libavformat`/`libavutil`/`libswresample`). O
`debian/copyright` do pacote-fonte `ffmpeg` 4.4.2-0ubuntu0.22.04.1 (jammy)
mostra que o build padrão do Ubuntu usa arquivos GPL (ex.
`libavcodec/x86/flac_dsp_gpl.asm` dentro do `libavcodec58`), então os
binários resultantes são **GPL v2+, não LGPL** — redistribuí-los dentro do
instalador de um app de código fechado traria a obrigação da GPL para código
que não é GPL. Por isso a decisão do projeto é não embutir.

Consequência prática: o AppImage não decodifica H.264/AAC — um `.mp4` anexado
ao chat pode não tocar dentro do app embutido (o navegador do usuário, fora do
app, continua abrindo normalmente). Áudio Opus/Vorbis e vídeo WebM VP8/VP9
continuam tocando, via `plugins-good`/`plugins-base` da tabela acima.

O `.deb` apenas **recomenda** (`Recommends`, ver `tauri.linux.conf.json` →
`bundle.linux.deb.recommends`) o pacote `gstreamer1.0-libav` do repositório da
própria distro — é o gerenciador de pacotes do usuário (`apt`) que baixa esse
pacote do Ubuntu/Debian, com a licença e a origem que o Ubuntu já declara; nós
não copiamos esse `.so` para dentro de nada, então nenhuma obrigação de
redistribuição nasce daqui.

## O que "vinculado dinamicamente, sem modificação" significa aqui

Nenhuma dessas bibliotecas tem patch nosso — são exatamente os pacotes `.deb`
do Ubuntu 22.04, só copiados para dentro do AppImage pelo
`linuxdeploy`/`linuxdeploy-plugin-gstreamer` na hora do build (ver
`apps/desktop/Dockerfile.linux`). O Streamz as carrega por vínculo dinâmico
(`.so`), nunca estático, e a interface entre o app e o GStreamer é a API
pública dele. Consequências práticas para quem recebe o pacote:

- **Você pode substituir as bibliotecas.** O AppImage não impede trocar
  qualquer `.so` embutido por uma versão sua compatível com a mesma ABI —
  basta extrair o pacote (`./Streamz_<versão>_amd64.AppImage --appimage-extract`,
  que gera `squashfs-root/`), trocar o arquivo em `squashfs-root/usr/lib/...`
  e rodar `squashfs-root/AppRun`. Isso é exatamente o direito que a LGPL exige
  (relinkar/substituir a biblioteca) e que o formato AppImage, por ser um
  squashfs sem DRM, já entrega.
- **O `.deb`** não embute nada disso — ele só *declara a dependência/
  recomendação* (`Depends`/`Recommends`) nos pacotes do repositório do
  Ubuntu/Debian de quem instala; quem atualiza esses pacotes pelo `apt` já
  está substituindo a biblioteca.

## Código-fonte correspondente

Cada build de Linux gera, ao lado do `.AppImage` e do `.deb`, um arquivo
`versoes-de-terceiros.txt` com a lista exata de pacotes Ubuntu e versões
embutidos naquela build específica (gerado por
`scripts/build-desktop-linux-no-servidor.sh`, ver o comentário lá).

Para qualquer pacote `<pacote>` na versão `<versão>` dessa lista, o
código-fonte correspondente é o pacote-fonte do Ubuntu 22.04 (jammy/
jammy-updates) daquela versão exata, disponível por qualquer um destes
caminhos:

- `apt-get source <pacote>=<versão>` numa máquina com os repositórios `deb-src`
  do jammy habilitados;
- a página do pacote em
  `https://launchpad.net/ubuntu/+source/<pacote-fonte>/<versão>` (o nome do
  pacote-fonte às vezes difere do binário);
- o arquivo de changelog/copyright de cada pacote em
  `https://changelogs.ubuntu.com/changelogs/pool/<seção>/<letra>/<pacote-fonte>/`.

### Oferta por escrito (LGPL 2.1 §6(c))

Para as bibliotecas LGPL desta lista, oferecemos por escrito, a qualquer
pessoa que receba este binário, fornecer o código-fonte correspondente (o
mesmo pacote-fonte do Ubuntu usado nesta build, sem modificação) por um custo
não superior ao de distribuição física, por um período de **3 anos** a partir
da distribuição deste pacote. Como esse código-fonte já é público nos
repositórios do Ubuntu/Launchpad (endereços acima), a forma mais rápida de
obtê-lo é diretamente por lá; para pedir por outro meio, ou para qualquer
dúvida sobre esta oferta, o contato é:

**contato@aipecorp.com**

## Patentes (H.264)

O AppImage e o `.deb` do Streamz Desktop **não** embutem decodificação H.264
(ver a seção sobre FFmpeg/gst-libav acima). Quem instala pelo `.deb` e aceita
a recomendação do `gstreamer1.0-libav` do repositório da própria distro
ganha H.264 por conta própria — nesse caso a decodificação roda inteiramente
com pacotes do Ubuntu/Debian, fora de qualquer coisa que redistribuímos, e o
pool de patentes correspondente (Via Licensing/Access Advance, sucessora do
MPEG LA para o AVC/H.264) é uma questão entre o usuário e sua distro, não
deste pacote. Isto é uma constatação factual, não uma opinião jurídica.
