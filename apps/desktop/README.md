# Streamz Desktop (Tauri 2)

O app desktop embrulha o cliente web numa janela nativa + instalador nas
**três plataformas**: Windows (`.exe` NSIS e `.msi`), macOS (`.dmg` universal
— Intel e Apple Silicon no mesmo arquivo) e Linux (`.AppImage` e `.deb`).

`tauri.conf.json` é JSON puro e **não aceita comentários** — as decisões que
precisariam de um comentário lá estão documentadas aqui. Cada plataforma tem o
seu arquivo de override (`tauri.macos.conf.json`, `tauri.linux.conf.json`) que
o tauri-cli aplica sozinho por cima do `tauri.conf.json` (JSON Merge Patch,
RFC 7396) quando o alvo bate — não precisa de `--config`.

```bash
pnpm --filter @streamz/desktop dev     # janela nativa carregando http://localhost:3000
pnpm --filter @streamz/desktop build   # instalador da plataforma do host (precisa de Rust/cargo)
```

**O instalador Windows** também sai **do Linux** por cross-compile, sem gastar
runner Windows: veja `Dockerfile.xwin` aqui do lado e
`scripts/build-desktop-no-servidor.sh` (documentado no §5.3 de
`docs/PROCESSO-DE-DESENVOLVIMENTO.md`). Isso é diferente do `Dockerfile.linux`
mais abaixo, que gera o instalador **nativo do Linux** (AppImage/deb) — não há
cross-compile aí, o alvo é o próprio hospedeiro.

## Estratégia de build: export estático

`build.frontendDist` aponta para `../../web/out`, ou seja: **o desktop embute a
web como HTML estático**, e não carrega uma URL remota.

Por que essa opção, e não `frontendDist` apontando para uma URL:

- O app abre e renderiza sem depender do servidor da web estar no ar; só a API
  (REST/WS) precisa estar acessível — que é justamente o que o usuário configura
  por `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_WS_URL`.
- Uma janela apontada para uma origem remota (`http(s)://`) perde o contexto
  local: a CSP e o modelo de permissões do Tauri passam a valer para conteúdo de
  terceiros, e a superfície de ataque de um XSS na web vira acesso ao app nativo.
- Todas as rotas da web (`/`, `/login`, `/register`, `/app`) são client
  components — não há rota de API, middleware, server action nem `next/image`.
  Nada exige servidor Next.

Como o `out/` é gerado: `apps/web/next.config.mjs` liga `output: "export"` **por
ambiente**, não incondicionalmente (senão o deploy web normal, com `next start`,
quebraria):

- `TAURI_ENV_*` — o Tauri injeta essas variáveis no `beforeBuildCommand`, então
  `pnpm --filter @streamz/desktop build` já produz o `out/` automaticamente;
- `NEXT_OUTPUT=export` — chave explícita, para gerar o `out/` na mão:

  ```bash
  NEXT_OUTPUT=export pnpm --filter @streamz/web build   # bash
  $env:NEXT_OUTPUT="export"; pnpm --filter @streamz/web build   # PowerShell
  ```

No export, `trailingSlash: true` faz o Next emitir `out/app/index.html` em vez de
`out/app.html` — o protocolo de asset do Tauri resolve diretório → `index.html`,
então recarregar a janela numa rota interna continua funcionando.

## CSP e `withGlobalTauri`

`app.security.csp` era `null` — ou seja, **sem CSP nenhuma**: qualquer conteúdo
injetado na webview podia carregar script de qualquer origem e falar com qualquer
host. Agora há uma política explícita, por diretiva, em `tauri.conf.json`.

O que cada abertura paga:

| Diretiva | Valor | Por quê |
|---|---|---|
| `default-src` | `'self'` | tudo o que não estiver listado abaixo é negado |
| `script-src` | `'self' 'unsafe-inline'` | o export do Next embute o payload de hidratação em `<script>` inline. O Tauri calcula os hashes desses inlines no build e os injeta na política; quando isso acontece o `'unsafe-inline'` é ignorado pelo browser (hash tem precedência) e ele fica só como rede de segurança |
| `style-src` | `'self' 'unsafe-inline'` | React/LiveKit aplicam estilo inline em elementos |
| `img-src` | `'self' data: blob:` + API | avatares e anexos vêm do proxy da API (`API_PUBLIC_URL`); `blob:`/`data:` cobrem preview local de upload |
| `media-src` | `'self' data: blob: mediastream:` | áudio/vídeo do LiveKit chegam como `MediaStream`/`blob:` |
| `connect-src` | `'self' ipc: http://ipc.localhost` + API + WS + LiveKit | `ipc:`/`http://ipc.localhost` é o canal de IPC do Tauri 2 (sem isso nenhum comando nativo funciona); o resto é REST + Socket.IO + sinalização do LiveKit |
| `worker-src` | `'self' blob:` | o LiveKit cria workers a partir de `blob:` |
| `frame-src`, `object-src`, `form-action` | `'none'` | o app não embute iframe, plugin nem submete formulário nativo |

### Como parametrizar por ambiente

Os valores versionados são os do **dev** (`.env.example`): API em
`http://localhost:3333`, LiveKit self-host em `ws://localhost:7880` e LiveKit
Cloud em `*.livekit.cloud`. Quando `NEXT_PUBLIC_API_URL`,
`NEXT_PUBLIC_LIVEKIT_URL` ou `R2_PUBLIC_BASE_URL` apontarem para outro host, a
CSP precisa listar esse host — CSP não lê variável de ambiente.

Como `tauri.conf.json` é estático, sobrescreva no build com `--config`, que aceita
um caminho de arquivo e faz **merge** sobre a config base. Guarde um arquivo por
ambiente ao lado do `tauri.conf.json` — ex. `src-tauri/tauri.prod.conf.json`:

```json
{
  "app": {
    "security": {
      "csp": {
        "connect-src": "'self' ipc: http://ipc.localhost https://api.streamz.dev wss://api.streamz.dev https://streamz.livekit.cloud wss://streamz.livekit.cloud",
        "img-src": "'self' data: blob: https://api.streamz.dev https://cdn.streamz.dev"
      }
    }
  }
}
```

```bash
pnpm --filter @streamz/desktop tauri build --config tauri.prod.conf.json
```

O merge é **por diretiva**: só as diretivas listadas mudam, mas cada uma que
aparecer substitui a original inteira — repita os valores que ainda valem
(`'self'`, `ipc:`, …).

### `withGlobalTauri: false`

Estava `true` só para o `apps/web/lib/desktop.ts` alcançar
`window.__TAURI__.notification`. Expor a ponte global inteira no `window` para
usar uma função é superfície de ataque desnecessária: qualquer script injetado
(um XSS numa mensagem, por exemplo) herdaria o mesmo acesso. O `desktop.ts` agora
importa `@tauri-apps/api` / `@tauri-apps/plugin-notification` — o que passa pelo
IPC continua limitado pelas capabilities em `capabilities/default.json`.

## macOS

`tauri.macos.conf.json` é o override que o tauri-cli aplica sozinho quando o
alvo é macOS. O que ele decide, e por quê:

| Chave | Valor | Por quê |
|---|---|---|
| `bundle.targets` | `["app", "dmg"]` | o `.dmg` é o que a página de download oferece; o `.app` solto é o que o `--config tauri.release.conf.json` compacta em `.app.tar.gz` para o atualizador |
| `bundle.macOS.signingIdentity` | `"-"` | assinatura **ad-hoc** — não há Apple Developer Program (US$ 99/ano); sem ela o Gatekeeper recusaria abrir o `.app` mesmo uma vez |
| `bundle.macOS.hardenedRuntime` | `true` | padrão do Tauri, e pré-requisito de notarização no dia em que houver conta; com ele ligado, microfone/câmera exigem os entitlements abaixo **além** dos textos do Info.plist |
| `bundle.macOS.entitlements` | `Entitlements.macos.plist` | `com.apple.security.device.audio-input` + `.camera` — sem eles o hardened runtime recusa a captura mesmo com permissão concedida nos Ajustes |
| `bundle.macOS.infoPlist` | `Info.macos.plist` | `NSMicrophoneUsageDescription`/`NSCameraUsageDescription` (sem eles o TCC **mata o processo** no primeiro `getUserMedia`, sem diálogo) e `CFBundleDevelopmentRegion: pt-BR`. Nome próprio, não `Info.plist`: o build de iOS também procura um `Info.plist` solto nesta pasta, e um arquivo genérico vazaria as chaves de um sistema para o outro |
| `bundle.macOS.minimumSystemVersion` | `"12.3"` | a captura de tela nativa por ScreenCaptureKit já entrou (`tela/captura/mac/mod.rs`), mas só roda a partir do macOS 13 (`sck::sistema_atende`, em `tela/sck.rs`); abaixo disso ela recusa e o app cai no `getDisplayMedia` do navegador (ver seção "Como gerar"). O piso do bundle continua em 12.3 porque é isso que faz o `.app` abrir e funcionar — só sem captura nativa — num sistema mais velho |
| janela `main` | `backgroundThrottling: "disabled"` | só a partir do macOS 14: o wry 0.55 o traduz em `WKPreferences.inactiveSchedulingPolicy = none`, que evita o **RunningBoard** suspender o *processo* WebContent quando a view fica inativa. Não é equivalente às flags do WebView2 no Windows — a página continua sendo uma página oculta para o WebKit (rAF parado, timers de fundo espaçados), só o processo é que não é suspenso de vez. No macOS 12–13 a política nem existe. A rede de segurança de verdade continua sendo a carência de voz do servidor (ver Limitações) |

A janela `main` do `tauri.macos.conf.json` **repete a janela inteira**, não só
os campos que mudam: como o merge é JSON Merge Patch e **arrays substituem o
array inteiro** (a mesma regra do `tauri.android.conf.json`), um objeto parcial
apagaria a janela `splash` do array `app.windows`.

### Barra de título e splash (moldura nativa)

Diferente de Windows/Linux (`decorations: false`, barra 100% nossa), no Mac a
janela `main` pede `decorations: true` + `titleBarStyle: "Overlay"` +
`hiddenTitle: true` + `trafficLightPosition: {x: 9, y: 14}`: o sistema desenha
os três semáforos por cima do conteúdo, e a nossa barra continua por baixo
(arrasto, setas, título, caixa de entrada) sem os três controles. A altura da
barra e a reserva à esquerda dos semáforos são divididas pelo zoom do app
(hook `useZoomDoApp`), para continuarem medindo 32/78 pontos de tela de
verdade — só o zoom dos semáforos é travado; o conteúdo da barra (setas,
ícones, texto) escala normalmente, e perto do zoom máximo os ícones encostam
nas bordas. Detalhe completo — a matemática do `trafficLightPosition`,
`ehMacNoTauri()`, `ESPACO_DOS_SEMAFOROS`, o comportamento em tela cheia e o
que ainda não foi verificado num Mac — está no §8.1 de
`docs/PROCESSO-DE-DESENVOLVIMENTO.md`.

A janela `splash` também muda: sem `macOSPrivateApi` (desligado de propósito —
a feature que ele exige no `Cargo.toml` brigaria com o build de Windows), o Mac
não faz janela transparente, então o cartão perde o canto arredondado e a
sombra e ganha `transparent: false` + `backgroundColor: "#1A1A1E"`
(`JanelaSplash.tsx`, `useAtualizacao.ts`). Essa cor pinta a `NSWindow` e a
sobrerrolagem (`underPageBackgroundColor`) — **não** o primeiro quadro do
WKWebView (isso exigiria `drawsBackground = NO` no wry, que só compila com a
feature `transparent`, a mesma que depende do `macOSPrivateApi` desligado).
Quem evita o flash branco é a janela nascer oculta e só aparecer depois do
primeiro quadro ou do teto de 100ms (ver §5.2) — no caso do teto, se o WebKit
ainda não tiver pintado nada, o branco pode aparecer por um instante.

### Atalhos e menu

O Tauri 2.11 instala o **menu padrão do macOS** porque o app nunca chama
`.menu()` — copiar/colar/desfazer/selecionar tudo, Cmd+M (minimizar) e zoom
saem de graça. Cmd+W esconde a janela (o mesmo `CloseRequested` → bandeja de
sempre); **Cmd+Q encerra o processo de verdade** — não há "continuar na
bandeja" para esse atalho.

### Dock: reabrir clicando no ícone

`lib.rs` trata `RunEvent::Reopen` — sem isso, clicar no ícone do Dock com o
app já rodando (janela escondida pela bandeja) não fazia nada, porque só o
Windows tem um ícone de bandeja clicável para essa finalidade. No macOS quem
cumpre esse papel é o Dock: com `has_visible_windows == false` a janela `main`
volta a aparecer. Se a `splash` estiver na frente (checagem/instalação em
andamento), quem decide mostrar a `main` continua sendo ela.

### Como gerar

```bash
scripts/build-desktop-macos.sh [<commit-ou-ref>] [--assinar-atualizador <chave>] [--sem-finder]
scripts/build-desktop-macos.sh [<ref>] --certificado <p12> [--senha-do-certificado-em <arquivo>]
scripts/build-desktop-macos.sh [<ref>] … --publicar [--login-em <arquivo>] [--notas "texto"] [--api <url>]
```

Roda **num Mac** — o `.app` precisa de `codesign`, `lipo` e `hdiutil`, que só o
macOS tem; não há caminho a partir do servidor Linux. Pré-requisitos: Xcode ou
Command Line Tools **≥ 15** (Apple clang 15), rustup com Rust ≥ 1.85 (o
`Cargo.lock` tem `getrandom 0.4`, edição 2024), Node ≥ 20, pnpm 9. O app de Mac
**compila `livekit`/`webrtc-sys`** — a captura de tela nativa por
ScreenCaptureKit (`objc2-screen-capture-kit`, ver Cargo.toml/build.rs) só
existe no SDK do macOS 14+, que só entra com as Command Line Tools 15; com CLT
14 o build para no meio da compilação sem dizer que a causa é a versão do
Xcode. `scripts/build-desktop-macos.sh` confere a versão do Apple clang logo no
início e aborta com a instrução de instalar (`xcode-select --install` ou o
Xcode pela App Store), em vez de deixar o erro aparecer minutos depois no meio
do `cargo`. O `.app` gerado continua abrindo a partir do macOS **12.3**
(`MACOSX_DEPLOYMENT_TARGET`, que o script exporta sozinho quando não vem do
ambiente — espelha `bundle.macOS.minimumSystemVersion` do
`tauri.macos.conf.json`): a captura nativa em si só existe a partir do 13, e
abaixo disso o app cai no `getDisplayMedia` do navegador. No primeiro uso da
captura de tela o macOS pede a permissão de **Gravação de Tela** (TCC) — ao
contrário de microfone/câmera, essa permissão só passa a valer depois de
**reiniciar o app** (comportamento do próprio TCC, não algo que dê para
contornar daqui). Usa uma worktree própria
(`.claude/worktrees/build-desktop-macos`) e sai em
`.claude/saida-desktop/<versão>-<commit>-macos/`.

`--assinar-atualizador <chave>` liga `tauri.release.conf.json`
(`createUpdaterArtifacts: true`) e produz `Streamz.app.tar.gz` + `.sig` ao lado
do `.dmg` — sem essa flag a API ainda não tem o que servir em
`/api/updates/darwin-*`. `--sem-finder` (ligado sozinho por SSH) pula o
AppleScript que o `bundle_dmg.sh` usa para arrumar a janela do `.dmg` com a
seta para Aplicativos; sem sessão gráfica ele travaria o build no último passo.
`--certificado`/`--senha-do-certificado-em` (ou as mesmas variáveis do
Codemagic, `APPLE_CERTIFICATE`/`APPLE_CERTIFICATE_PASSWORD`/
`APPLE_SIGNING_IDENTITY`) trocam a assinatura ad-hoc pelo certificado
autoassinado — ver a subseção abaixo. `--publicar` (com `--login-em`,
`--notas` e `--api`) manda a pasta de saída para a API no fim de um build
bem-sucedido, sem segundo comando e sem digitar login — ver "Publicar".

O script confere, no `.app` da pasta de build e no de dentro do `.dmg`: as
duas arquiteturas no executável (`lipo -archs`), a assinatura válida com
hardened runtime (`codesign --verify --strict` — ad-hoc ou pelo certificado,
conforme o modo), os dois entitlements de mídia e as chaves de permissão do
Info.plist. Assinando com certificado, confere também que o designated
requirement do `.app` cita o SHA-1 do certificado e que o SHA-256 extraído de
dentro do `.app` bate com o do `.p12`. **O que ele NÃO prova**: que o `.app`
abre e que a chamada de voz/vídeo funciona num Mac de verdade — nada disto foi
compilado nem testado numa máquina real.

Há também o workflow `desktop-macos` no `codemagic.yaml` (`mac_mini_m2`,
disparo manual): mesma build universal, mesma checagem de arquiteturas por
`lipo`. O grupo `streamz-updater` (chave de assinatura do atualizador) está
**comentado** no arquivo até existir no painel do Codemagic — sem ele o
workflow gera só o `.dmg`, sem `.app.tar.gz`/`.sig`. O segundo grupo,
`streamz-certificado-mac` (as três variáveis do certificado autoassinado),
está comentado pelo mesmo motivo — ver a subseção abaixo.

### Assinatura: ad-hoc ou certificado autoassinado

`bundle.macOS.signingIdentity: "-"` no `tauri.macos.conf.json` é o padrão
**ad-hoc** — sem conta Apple Developer, é a única assinatura possível sem
pagar. O problema dela: o "designated requirement" do código (o que o TCC
grava junto com a permissão de microfone/câmera/tela) é o **cdhash** do
binário, que muda a cada build — toda atualização vira, para o TCC, "um app
diferente", e as três permissões voltam a ser pedidas.

`scripts/gerar-certificado-mac.sh` resolve isso **sem** Apple Developer
Program: gera, uma única vez, um certificado de assinatura de código
autoassinado (chave RSA 2048, 10 anos) e imprime `APPLE_CERTIFICATE` (o `.p12`
em base64), `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY` (o SHA-1,
maiúsculo) e o pin SHA-256 do certificado. O `.p12` e o `.pem` público ficam
**fora do repositório** (padrão `~/.streamz/certificado-mac/`, chmod 600); o
script recusa gravar dentro de um repositório git e recusa sobrescrever um
`.p12` já existente. Com ele, `scripts/build-desktop-macos.sh --certificado
<p12> [--senha-do-certificado-em <arquivo>]` importa o `.p12` num keychain
**temporário**, adiciona-o à lista de busca do usuário só durante o build,
passa ao bundler **apenas** `APPLE_SIGNING_IDENTITY` e, ao final, restaura a
lista de busca original e apaga o keychain — mesmo se o build falhar no meio
(`trap`).

O designated requirement passa a ser
`identifier "dev.streamz.app" and certificate root = H"<sha1>"`, estável entre
builds: o TCC reconhece a mesma "identidade" de uma versão para a outra, e as
permissões concedidas sobrevivem à atualização. **O que isto não resolve**: o
Gatekeeper continua recusando (`spctl`) — não é Developer ID, não passa em
notarização; o aviso de "desenvolvedor não identificado" é o mesmo do ad-hoc.
Perder a chave privada custa o mesmo que nunca ter tido: o próximo build
assinado (mesmo com uma chave nova) tem outro requirement, cada usuário vê os
três pedidos de permissão mais uma vez, e o pin do instalador por Terminal
(ver abaixo) precisa ser atualizado para a nova impressão digital.

**Pegadinha conferida no código do tauri-cli (2.11.4), não só na doc**: não
adianta passar `APPLE_CERTIFICATE` direto para o Tauri. `identity::list` do
`tauri-macos-sign` só reconhece certificado cujo nome comece com "Developer ID
Application:", "Apple Development:" etc. **e** que tenha Team ID — um
autoassinado não bate com nenhum dos dois e o build morre em
"failed to resolve signing identity" **antes** do `Drop` que apagaria o
keychain temporário que o próprio tauri-macos-sign já criou, deixando-o
sobrando em `~/Library/Keychains`. Por isso o script faz a importação e a
assinatura por conta própria (`security import` + lista de busca), e só
entrega `APPLE_SIGNING_IDENTITY` ao bundler. Se algo morrer no meio de um jeito
que o `trap` do script não cobre (ex.: `kill -9`), a limpeza manual é:

```bash
security list-keychains -d user -s ~/Library/Keychains/login.keychain-db
```

### Instalar pelo Terminal (contorna o Gatekeeper sem notarização)

`apps/web/public/instalar-mac.sh`, servido em
`https://streamz.chat/instalar-mac.sh` — uso: `curl -fsSL
https://streamz.chat/instalar-mac.sh | bash`. Por quê: um `.dmg` baixado pelo
navegador ganha `com.apple.quarantine`, e sem notarização o Gatekeeper barra a
primeira abertura (no macOS 15+ só destravando em Ajustes do Sistema); o `curl`
não põe o atributo de quarentena, então o mesmo `.dmg` baixado por este caminho
abre direto — e o atualizador, que também baixa por `curl`, tampouco põe.

Em troca da conferência que o Gatekeeper faria, o script confere por conta
própria: pede a mesma senha da página de download (ou `STREAMZ_SENHA` no
ambiente) num `POST /api/downloads/token`, só aceita `.dmg` como resposta,
confere o tamanho baixado, `codesign --verify --strict`, o identificador
`dev.streamz.app` e — só se os dois pins estiverem preenchidos no topo do
script (`PIN_DO_CERTIFICADO_SHA256`, `PIN_DO_CERTIFICADO_SHA1`, ambos impressos
por `gerar-certificado-mac.sh`) — que o certificado folha é o mesmo (SHA-256 do
DER extraído) e que a assinatura satisfaz o requisito de código
`identifier "dev.streamz.app" and certificate leaf = H"<sha1>"`. Sem os pins a
verificação de autoria fica desligada (avisa e segue) — os dois pins nascem do
mesmo certificado, e um preenchido sem o outro é configuração inconsistente
(o script aborta). A instalação troca `/Applications/Streamz.app` (ou
`~/Applications` sem permissão de escrita) por uma cópia nova de forma atômica
(copiar com nome provisório na mesma pasta, `mv`), sem `sudo`.

Variáveis de ambiente: `STREAMZ_SENHA`, `STREAMZ_API` (só `https`; `http`
apenas em `127.0.0.1`/`localhost`, para teste), `STREAMZ_DESTINO`,
`STREAMZ_NAO_ABRIR=1`. `MACOS_MINIMO=12.3` no topo do script espelha o
`minimumSystemVersion` do `tauri.macos.conf.json`. A página de download
(`PaginaDeDownload.tsx` → `InstalarPeloTerminal`) mostra este comando com botão
de copiar como a opção **recomendada** no macOS, e o `.dmg` continua disponível
para quem preferir baixar pelo navegador — com a nota de que no macOS 15+
(Sequoia) o Control-clique deixou de destravar o Gatekeeper (fonte:
developer.apple.com/news/?id=saqachfa); o caminho passou a ser Ajustes do
Sistema → Privacidade e Segurança → "Abrir Mesmo Assim". No macOS 12–14
continua valendo botão direito → Abrir.

### Publicar

#### Um comando só, sem login interativo

Build assinado + pacote do atualizador + publicação na API, do zero ao
auto-update ligado, sem nada para digitar no meio:

```bash
scripts/build-desktop-macos.sh \
  --certificado ~/.streamz/certificado-mac/streamz-mac.p12 \
  --senha-do-certificado-em ~/.streamz/certificado-mac/senha-do-p12.txt \
  --assinar-atualizador ~/.tauri/streamz.key \
  --publicar \
  --login-em ~/.streamz/certificado-mac/login-da-api.txt \
  --notas "Correções e melhorias."
```

`--publicar` é a última etapa do script: ele chama o
`scripts/enviar-macos.sh` com a pasta de saída recém-gerada, repassando
`--login-em`, `--notas` e `--api`. Build que falha em qualquer ponto (cargo,
`codesign`, as conferências do `.app` e do `.dmg`) derruba o script antes —
**não existe caminho que publique um build quebrado**. O arquivo de
`--login-em` é conferido no primeiro segundo, antes de compilar, para um erro
de login não aparecer só meia hora depois.

**`--publicar` sem `--assinar-atualizador` publica só o `.dmg`**: a página de
download passa a oferecer a versão nova, mas o **auto-update do Mac não muda**
— quem já tem o app instalado continua na versão velha, porque o atualizador
precisa do `.app.tar.gz` + `.sig`. O script avisa disso em destaque, duas
vezes (ao começar e na hora do envio). Quase sempre você quer os dois.

#### O arquivo de `--login-em`

Duas linhas, e nada mais — sem comentário e sem cabeçalho, porque `#` pode ser
parte da senha:

```
fulano@exemplo.com
<a senha da conta admin da instância>
```

A conta precisa ser **administradora da instância** (`PLATFORM_ADMIN_EMAILS`,
com e-mail verificado): é ela que a API exige em `POST /api/updates/macos`.

- **Fica fora do repositório**, junto do resto dos segredos do Mac — o padrão
  do projeto é `~/.streamz/certificado-mac/`, a mesma pasta do `.p12` e do
  arquivo com a senha dele.
- **`chmod 600 ~/.streamz/certificado-mac/login-da-api.txt`.** O script recusa
  publicar com um arquivo legível por grupo ou por outros, e diz o `chmod` a
  dar. Esta é a senha da conta que publica atualização para **todos** os
  usuários do app.
- **A senha nunca entra no repositório** — nem em script, nem em `.env.example`,
  nem neste README. O git rastreia só o *caminho* do arquivo; o conteúdo, não.
  Senha em commit é comprometimento permanente da cadeia de atualização,
  porque o histórico é público.
- Ela também não aparece na linha de comando (nada de `ps`), não é impressa em
  nenhum log do script e a sessão criada pelo envio é encerrada no fim
  (logout), para não acumular em "Dispositivos".
- Para conferir o arquivo sem publicar nada e sem falar com a API:
  `scripts/enviar-macos.sh --login-em <arquivo> --conferir-login`.
- Alternativa ao arquivo: `STREAMZ_LOGIN_EM=<arquivo>` no ambiente (o caminho,
  nunca a senha) ou `STREAMZ_TOKEN=<access token>`, que pula o login.

**Conta com 2FA**: o caminho não interativo não tem como responder ao código e
para com a explicação, em vez de travar esperando. As saídas são publicar com
`STREAMZ_TOKEN` (access token de uma sessão já autenticada) ou rodar o envio à
mão, num terminal, sem `--login-em`.

#### Publicar uma pasta de saída que já existe

```bash
scripts/enviar-macos.sh .claude/saida-desktop/<versão>-<commit>-macos \
  --login-em ~/.streamz/certificado-mac/login-da-api.txt \
  --notas "Correções e melhorias."
```

Sem `--login-em` ele pergunta e-mail e senha no terminal, como sempre fez.
Repetir o comando é seguro: arquivo idêntico já publicado volta como
"ja-existia".

#### Pela raiz do servidor, sem a API

`scripts/publicar-desktop.sh <pasta-de-saída> --aplicar` (ver seção Auto-update
abaixo) — mesmo script das outras plataformas. O `.dmg` (e o `.pkg`, se
existir) vão para `downloads/`; o `.app.tar.gz` do atualizador, que o bundler
gera sem versão no nome, é renomeado para `Streamz_<versão>_universal.app.tar.gz`
antes de ir para `updates/` — sem isso a segunda release pisaria no arquivo da
primeira (a assinatura minisign cobre o conteúdo, não o nome, então renomear
não invalida nada).

### Limitações conhecidas

- **Sem notarização** (exige Apple Developer Program, US$ 99/ano): quem baixa
  pelo navegador vê o aviso do Gatekeeper na primeira abertura — "botão direito
  → Abrir", ou `xattr -dr com.apple.quarantine /Applications/Streamz.app`. O
  instalador por Terminal (acima) contorna o aviso sem precisar de nenhuma das
  duas alternativas, mas não é notarização — o `spctl` continua rejeitando.
- **Assinatura ad-hoc muda o cdhash a cada build**: o macOS pode pedir de novo
  a permissão de microfone/câmera depois de uma atualização, porque para o TCC
  é um binário "diferente". Resolvido, para quem tiver o certificado
  autoassinado (acima), assinando sempre com ele — falta gerá-lo (§10 /
  PENDENCIAS.md).
- **Compartilhamento de tela nativo só existe no Windows.** No Mac o app usa
  `getDisplayMedia` do navegador, que depende da permissão "Gravação de Tela"
  do sistema.
- **`backgroundThrottling: "disabled"` só é possível a partir do macOS 14** —
  em versões anteriores uma chamada em janela minimizada pode sofrer o mesmo
  throttling de qualquer aba de fundo.
- **Fechar a `main` em tela cheia deixa um Space preto vazio.** Esconder a
  janela no meio da tela cheia não tem saída simples — `set_fullscreen(false)`
  é assíncrono, `hide()` no meio dele não é confiável, e o Tauri não emite
  evento de "saiu da tela cheia". Contorno: sair da tela cheia antes de fechar.
- **Duplo clique na barra sempre dá zoom** (`internal_toggle_maximize`), mesmo
  para quem prefere minimizar nas Preferências do Sistema → Clique duplo na
  barra de título: o `drag.js` do Tauri 2.11 não lê essa preferência
  (`AppleActionOnDoubleClick`), só chama o zoom.
- **Nada disto rodou num `.app` real.** Em aberto: comportamento em macOS
  12, 14/15 e 26 (o `trafficLightPosition` foi medido no algoritmo do wry
  aplicado ao 13); os semáforos voltando ao normal depois de sair da tela
  cheia; arrastar uma janela sem foco pede dois cliques (`acceptFirstMouse`
  não ligado, de propósito — é o padrão do AppKit, tauri#4316).

## Linux

`tauri.linux.conf.json` é o override para Linux: `bundle.targets: ["appimage",
"deb"]`, ícone com o PNG de 256px **primeiro** na lista (o codegen usa o
primeiro PNG da lista para a janela e a bandeja), `linux.appimage.bundleMediaFramework: true`
(empacota o GStreamer do sistema de build dentro do AppImage) e
`linux.deb.recommends` com os pacotes GStreamer (pulseaudio/pipewire, gl,
libav) — `recommends`, não `depends`, porque o `apt` os instala por padrão mas
não impede o `.deb` de instalar sem eles.

### Permissão de mídia no WebKitGTK

O wry 0.55 não responde ao sinal `permission-request` do `WebKitWebView`: sem
ninguém respondendo, o manipulador padrão do próprio WebKit **nega** tudo que
não é pointer lock — sem pop-up, sem erro visível, o `getUserMedia` falha com
`NotAllowedError` antes de o LiveKit ser chamado (o oposto do Windows, onde o
padrão do WebView2 é *perguntar*). `src/permissoes_linux.rs` cobre isso: liga
`enable-media-stream` e `enable-webrtc` nos ajustes do WebView e responde
`allow` a `UserMediaPermissionRequest`/`DeviceInfoPermissionRequest` (não a
mais nada — geolocalização, notificação etc. seguem negando, como o WebKit já
faz por padrão). Depende do crate `webkit2gtk` como dependência direta
(`Cargo.toml`, só `cfg(target_os = "linux")`), na mesma versão que o
`tauri-runtime-wry` já resolve — o `webkit2gtk::WebView` que a API do Tauri
entrega é deste crate, e duas versões seriam dois tipos incompatíveis com o
mesmo nome.

A concessão vale **só para a origem do nosso app**: `permissoes_linux.rs`
confere, a cada pedido, se a URI carregada na janela é `tauri://localhost`
(onde o bundle é servido) ou — só em `tauri dev` (`tauri::is_dev()`) — o
`devUrl` da configuração (`http://localhost:3000`). Fora dessas origens (uma
navegação para outro site que escapasse do `tauri-plugin-opener`) o pedido
cai no manipulador padrão do WebKit, que nega. A comparação é por origem
(esquema, host, porta), não por prefixo de texto.

### Chamada de voz/vídeo: decidido — degrada com aviso, não trava

O WebKitGTK que Ubuntu, Debian, Fedora e Arch empacotam é compilado **sem**
`ENABLE_WEB_RTC` (é uma opção experimental do WebKit, fora do padrão desses
pacotes). Ligar `enable-webrtc` no wry não muda isso: é a biblioteca do
sistema que não tem o código, e a chamada ficaria inócua —
`typeof RTCPeerConnection` continua `"undefined"`, o microfone chega a abrir
(a permissão foi concedida), mas o LiveKit nunca teria como conectar. Não há o
que fazer do nosso lado; é uma limitação da distro, não do app. Como verificar
num build específico: `--debug`, abrir o inspetor (WebKit Web Inspector) e
rodar `typeof RTCPeerConnection` no console.

A decisão (antes pendência, ver PENDÊNCIAS) é: o app **detecta a falta de
WebRTC pela capacidade, não pelo sistema**, e recusa entrar numa chamada antes
de mexer em qualquer coisa — em vez de deixar o clique avisar o gateway (os
outros veriam a pessoa "na call"), pedir token e só então cair numa "falha ao
conectar" genérica.

- `apps/web/lib/suporte-a-chamadas.ts` (`temWebRTC`) é a mesma regra do
  `isBrowserSupported` do `livekit-client` 2.x (`room/utils.ts`): existe
  `RTCPeerConnection` **e** o protótipo tem `addTransceiver` ou `addTrack`. É
  por capacidade e não por `navigator.userAgent`: um WebKitGTK que um dia
  ganhe WebRTC passa a fazer chamada sem tocar em código nenhum daqui, e um
  navegador desktop antigo em qualquer sistema recebe o mesmo aviso. O sistema
  operacional só entra no **texto** do aviso (nomear "Linux" no título quando é
  o caso real), nunca na decisão de bloquear.
- `stores/voice.ts` — `connect`, `startCall` e `acceptCall` chamam
  `recusadoSemWebRTC` **antes** de qualquer `emit`/chamada de API: ninguém
  aparece "na call" para o outro lado, e o toque de quem liga não é
  interrompido à toa. **Regra para quem adicionar um novo ponto de entrada em
  chamada** (canal clicado, telefone da conversa, faixa de chamada, menu do
  participante, cartão de toque, atalho de teclado, tela mobile): ele passa por
  uma dessas três funções — um `if` por botão é o que esquece o próximo botão.
- No app, o aviso é um modal — "Chamadas de voz ainda não funcionam no app
  para Linux" (título nomeia o Linux só quando é o caso real; outro
  navegador/sistema sem WebRTC recebe o título genérico) — com "Abrir no
  navegador", que leva ao **mesmo** canal ou conversa (`destinoNoNavegador`,
  via `channelLinkPath` + a rota nova `/app/channels/[guildId]/[channelId]` —
  antes o link de um canal dava 404 no site; `@me` no lugar do servidor para
  conversa direta). Fora do app (navegador comum sem WebRTC) não há para onde
  abrir, e o aviso é só um toast.
- Chamada **recebida** continua tocando normalmente; é "Atender" que leva ao
  aviso em vez de entrar na sala (`IncomingCallModal.atender`: só liga a câmera
  se `accept()` de fato entrou — sem isso, tentar ligar a câmera por cima do
  aviso dava um erro extra de "você não está conectado").
- Volta a funcionar sozinho, sem mexer em nada, no dia em que o WebKitGTK de
  alguma distro vier com WebRTC — é exatamente o que a checagem por capacidade
  compra.
- **Pendência que continua aberta**: voz nativa no Linux — o mesmo caminho da
  tela nativa no Windows, com a crate `livekit` do lado Rust em vez de depender
  do WebView. Ninguém começou isso ainda.

### Outras limitações

- **Fechar a janela principal ENCERRA o app — de propósito, diferente de
  Windows e macOS.** Lá o `CloseRequested` esconde a `main` para a bandeja
  continuar a chamada; no Linux o `on_window_event` nem é registrado
  (`#[cfg(all(desktop, not(target_os = "linux")))]`), então fechar segue o
  padrão do Tauri e mata o processo. É proposital porque esconder só presta se
  houver por onde voltar: o GNOME "puro" (Fedora, Debian, Arch) não mostra a
  bandeja sem a extensão AppIndicator, e o app não tem single-instance —
  reabrir o AppImage com a janela escondida abriria uma **segunda** sessão no
  gateway, com voz duplicada. A troca: no Linux a call não sobrevive a fechar
  a janela.
- **Bandeja depende de AppIndicator** — no GNOME "puro" (sem a extensão
  AppIndicator/KStatusNotifierItem) o ícone da bandeja não aparece.
- **Janela branca com NVIDIA + Wayland**: relato conhecido de outros apps
  Tauri/Electron; a saída é rodar com
  `WEBKIT_DISABLE_DMABUF_RENDERER=1 ./Streamz*.AppImage`.
- **`libav`/FFmpeg NÃO são embutidos no AppImage — decidido por licença.** O
  `ffmpeg` do Ubuntu jammy é GPL v2+ (confirmado no `debian/copyright` do
  pacote-fonte: há arquivo GPL dentro do `libavcodec58`, ex.
  `libavcodec/x86/flac_dsp_gpl.asm`), incompatível com redistribuir dentro de
  um app de código fechado. Consequência: o AppImage não decodifica H.264/AAC —
  um `.mp4` anexado ao chat pode não tocar **dentro do app**, mas Opus/Vorbis e
  vídeo WebM (VP8/VP9) continuam tocando via `plugins-good`/`plugins-base` do
  GStreamer, que são LGPL e por isso vão embutidos. O `.deb` só **recomenda**
  (`Recommends`, não `Depends`) o `gstreamer1.0-libav` do repositório da
  própria distro — quem aceita ganha H.264 pela via do `apt`, fora de qualquer
  coisa que o Streamz redistribui. O build **falha de propósito** se
  `libgstlibav.so*`/`libavcodec*.so*` aparecer dentro do AppImage gerado
  (`scripts/build-desktop-linux-no-servidor.sh`) — trava contra reintrodução
  por acidente, não checagem manual. Detalhe completo, com a tabela de
  componentes/licenças e a oferta de código-fonte (LGPL 2.1 §6(c)), em
  `apps/desktop/LICENCAS-DE-TERCEIROS.md` — embutido no próprio pacote em
  `/usr/share/doc/streamz/` (AppImage e `.deb`, via `files` do
  `tauri.linux.conf.json`) e copiado para a saída do build junto de
  `versoes-de-terceiros.txt` (a lista exata de pacotes/versões daquela build).

### Como gerar

```bash
scripts/build-desktop-linux-no-servidor.sh [<commit-ou-ref>] [--sem-assinar] [--refazer-imagem]
```

Roda **neste servidor**, em Docker (`apps/desktop/Dockerfile.linux`, imagem
`streamz-linux`): sem cross-compile, o alvo é o próprio hospedeiro
(`x86_64-unknown-linux-gnu`). A imagem é `ubuntu:22.04` — não o `rust:1-bookworm`
das outras — porque a **glibc do build é o piso de quem consegue abrir o app**
(um binário Linux não roda numa glibc mais velha que a de quem o linkou, e o
AppImage não embute a glibc de propósito). jammy = glibc 2.35, o que cobre
Ubuntu 22.04+, Debian 12+ e Fedora 36+; e não dá para descer mais porque o
Tauri 2 exige `webkit2gtk-4.1` (ABI com libsoup 3), que o Ubuntu 20.04 não tem.
`xdg-utils` é **obrigatório, não enfeite**: o tauri-cli liga
`bundle_xdg_open` sozinho por causa do `tauri-plugin-opener`, e o build falha
no fim ("xdg-open binary not found") sem o pacote.

Usa a worktree `.claude/worktrees/build-desktop-linux` (separada da do
Windows — os dois builds dividiriam o mesmo `target/` do cargo e `RUSTFLAGS`
diferentes forçariam recompilação total a cada alternância) e sai em
`.claude/saida-desktop/<versão>-<commit>-linux/`: o `.AppImage`, o `.deb` e,
sem `--sem-assinar`, o `.AppImage.sig`.

**O que este build NÃO prova**: que o app abre, que a bandeja aparece e que o
som toca numa distro de verdade — isso é uma máquina Linux com tela dizendo.
Ele prova que os pacotes existem, são ELF/AppImage/deb x86-64 corretos e estão
assinados (o script confere com `dpkg-deb --field` e extraindo o squashfs do
AppImage). Não há workflow do Codemagic para Linux: o servidor já é Linux
x86_64, então rodar aqui é mais simples do que alugar uma máquina na nuvem.

### Publicar

`scripts/publicar-desktop.sh <pasta-de-saída> --aplicar` — **AppImage e `.deb`
vão os dois para `downloads/`** (o site sempre serve o AppImage enquanto ele
existir — ver preferência de extensão em `downloads.service.ts` —, e o `.deb`
fica ali como alternativa para quem administra distribuir à mão); só o
**AppImage** vai para `updates/` (o atualizador do Tauri para quem instalou
por `.deb` pede a chave `linux-x86_64-deb`, que este contrato não publica —
ver `UpdatesService.alvoDoTauri`).

## Auto-update

O app procura versão nova **ao abrir** e mostra um cartão no canto (o
`AvisoDeAtualizacao`, na web). Fechar o cartão vale para aquela sessão: ele volta
na próxima abertura, de propósito — um "não perturbe" gravado transformaria um
adiamento em uma versão parada para sempre. Nada é baixado sem clique.

O caminho é: o app consulta `GET /api/updates/{target}/{arch}/{versão}` na API,
que devolve **204** quando não há nada, ou um manifesto assinado quando há. O
pacote só é aceito se a assinatura bater com a chave pública embutida no app —
é isso, e não autenticação, que protege o canal.

### Publicar uma versão

1. **Uma vez**, gere o par de chaves e guarde a privada fora do repo:

   ```bash
   pnpm --filter @streamz/desktop tauri signer generate -w ~/.tauri/streamz.key
   ```

   - cole a **pública** em `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`;
   - guarde a **privada** no segredo `TAURI_SIGNING_PRIVATE_KEY` do repositório
     (e a senha dela em `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, se tiver).

   Enquanto a pública estiver vazia, o app roda normalmente e o updater
   simplesmente nunca encontra nada — mas o build de release recusa começar.
   É a **mesma chave para as três plataformas**: o `pubkey` do `tauri.conf.json`
   não muda por sistema, então Windows, macOS e Linux verificam a mesma
   assinatura.

2. Suba a `version` em `src-tauri/tauri.conf.json` (Windows também em
   `apps/desktop/package.json`, `src-tauri/Cargo.toml` e `Cargo.lock` — ver §5
   do processo).

3. Gere o pacote de cada plataforma que for publicar — nenhuma depende da
   outra, e cada uma tem seu próprio script:

   | Plataforma | Como gerar | Onde sai |
   |---|---|---|
   | Windows | `scripts/build-desktop-no-servidor.sh` (ou o workflow `Desktop (Windows)` com `release: true`, se o Actions estiver de pé) | `.claude/saida-desktop/<versão>-<commit>/` |
   | macOS | `scripts/build-desktop-macos.sh --assinar-atualizador <chave>` (roda **num Mac**) ou o workflow `desktop-macos` no Codemagic | `.claude/saida-desktop/<versão>-<commit>-macos/` |
   | Linux | `scripts/build-desktop-linux-no-servidor.sh` (assina por padrão) | `.claude/saida-desktop/<versão>-<commit>-linux/` |

4. **Publique** com `scripts/publicar-desktop.sh <pasta>... [--notas "..."] --aplicar`
   — aceita várias pastas de saída na mesma chamada (uma por plataforma), copia
   para `downloads/` (o que o site oferece) e `updates/` (o que o atualizador
   baixa, só quem tem `.sig` ao lado) e **imprime** as linhas de `.env`, sem
   editá-lo. À mão, cada plataforma tem sua própria família de variáveis — **
   nenhuma herda da outra**:

   | | Windows | macOS | Linux |
   |---|---|---|---|
   | Versão | `DESKTOP_UPDATE_VERSION` | `MACOS_UPDATE_VERSION` | `LINUX_UPDATE_VERSION` |
   | URL | `DESKTOP_UPDATE_URL` | `MACOS_UPDATE_URL` | `LINUX_UPDATE_URL` |
   | Assinatura | `DESKTOP_UPDATE_SIGNATURE` | `MACOS_UPDATE_SIGNATURE` | `LINUX_UPDATE_SIGNATURE` |
   | Notas | `DESKTOP_UPDATE_NOTES` | `MACOS_UPDATE_NOTES` | `LINUX_UPDATE_NOTES` |
   | Data (opcional) | `DESKTOP_UPDATE_DATE` | `MACOS_UPDATE_DATE` | `LINUX_UPDATE_DATE` |

   Exemplo de uma plataforma:

   ```
   DESKTOP_UPDATE_VERSION=0.1.0
   DESKTOP_UPDATE_URL=https://.../Streamz_0.1.0_x64-setup.exe
   DESKTOP_UPDATE_SIGNATURE=<conteúdo do .sig>
   DESKTOP_UPDATE_NOTES=O que mudou nesta versão.
   ```

   Recrie a API (`docker restart` não relê o `.env` — ver §5 do processo). Não
   precisa rebuildar imagem: o manifesto é montado do ambiente.

Sem as variáveis de uma plataforma, **só ela** responde "não há atualização" —
as outras continuam servindo normalmente; é o estado padrão e não quebra nada.

O endpoint do updater ganhou `?bundle_type={{bundle_type}}` (plugin ≥2.10), mas
só o **Linux** usa isso para recusar pacote: quem instalou pelo `.deb`/`.rpm`
passa a receber **204** em vez do AppImage que o instalador dele não sabe
aplicar por cima do que já está no disco — ver
`UpdatesService.pacoteIncompativel`. **O Windows não isola por `bundle_type`**
(conferido no `tauri-plugin-updater` 2.11.0: `install_inner` decide NSIS ou
MSI pelos **bytes baixados**, não pelo que está instalado): quem instalou pelo
`.msi` recebe o mesmo `.exe` NSIS de sempre (`DESKTOP_UPDATE_URL`, o único
pacote que publicamos) e o próprio atualizador o reconhece e roda — o
`msiexec` nunca entra em cena. `msi`, `nsis`, ausente ou `unknown` recebem
todos o mesmo manifesto. O macOS também não tem essa distinção: o plugin
sempre manda `bundle_type=app` e só publicamos `.app`, sem formato
alternativo.

## Android: o mesmo crate, sem crate novo

O app de celular **reaproveita este `src-tauri`**: mesmo `tauri.conf.json`,
mesmo `frontendDist: ../../web/out`, mesmos plugins. Não existe `apps/mobile`.
O `tauri android init` gera um projeto Gradle em `src-tauri/gen/android/`, que
fica **versionado** (ver mais abaixo o porquê).

Três coisas precisaram mudar para isso, e nenhuma delas altera o desktop:

1. **O crate virou biblioteca + binário.** No Android não há `main()`: o
   sistema carrega uma `.so` e chama o ponto de entrada que o
   `tauri::mobile_entry_point` gera. Daí o `[lib] crate-type = ["staticlib",
   "cdylib", "rlib"]` no `Cargo.toml`, o app inteiro em `src/lib.rs` e um
   `src/main.rs` de uma linha para o desktop. É o que a doc do Tauri 2 manda
   (<https://v2.tauri.app/start/migrate/from-tauri-1/>, "Mobile support").
   O executável de desktop é o mesmo código, só mudou de arquivo.

2. **`tauri.android.conf.json`** — a config por plataforma. O Tauri aplica esse
   arquivo sobre o `tauri.conf.json` com **JSON Merge Patch (RFC 7396)**:
   objetos mesclam chave a chave, mas **arrays substituem o array inteiro**.
   Por isso o `app.windows` de lá repete a janela em vez de acrescentá-la.
   O que ele resolve:

   - a janela `main` do desktop nasce `"visible": false`, porque quem a mostra é
     a janelinha `splash` depois de checar atualização. **No celular não há
     splash**: sem essa troca o app abriria numa tela preta permanente. Este é
     o item que quebra de verdade; o resto é higiene.
   - `"decorations": false` existe porque a barra de título é nossa (§8 do
     processo). Não há barra de título de sistema num telefone para desligar, e
     o `ShellMobile` não desenha a nossa.
   - `width`/`height`/`minWidth`/`minHeight` não significam nada num telefone.
   - a segunda janela — a `splash` de 300×350 — é o ciclo do atualizador do
     Tauri, que não existe no Android.

   O que **não** está lá de propósito: `app.security.csp`. É a mesma do desktop
   e continua valendo (merge por chave); duas verdades sobre para onde o app
   pode falar seria pior que qualquer economia.

3. **`capabilities/` ganhou `platforms`.** Metade das permissões da janela
   principal é desktop-only (maximizar, arrastar a janela, o atualizador) e a
   ACL do Android não as conhece. `default.json` e `splash.json` declaram
   `["windows", "linux", "macOS"]`; o celular tem o seu `mobile.json`, com
   `["android", "iOS"]` e um conjunto bem menor.

### `bundle.android` e o `versionCode`

O Tauri deriva o `versionCode` da `version` do `tauri.conf.json` pela fórmula
`major * 1000000 + minor * 1000 + patch`. Para a **1.1.0** isso dá
**`1001000`**. Duas consequências práticas:

- a Play recusa upload com `versionCode` menor ou igual ao anterior, e a
  fórmula só cresce se a versão crescer — ou seja, **publicar duas vezes a mesma
  versão não dá**, mesmo que o `.aab` mude. Para isso existe
  `bundle.android.versionCode` (número sequencial próprio) ou
  `autoIncrementVersionCode`;
- `patch` acima de 999 e `minor` acima de 999 colidem com a casa seguinte. Não é
  um problema hoje, mas é o motivo de a fórmula não ser eterna.

`minSdkVersion` é 24 (Android 7.0) — o padrão do Tauri, declarado no arquivo
para ficar explícito em vez de implícito.

### Por que `gen/android/` é versionado

Porque **não existe chave no `tauri.conf.json` para permissão de Android**.
`INTERNET`, `RECORD_AUDIO`, `CAMERA`, `MODIFY_AUDIO_SETTINGS` e as
`FOREGROUND_SERVICE*` só entram editando o `AndroidManifest.xml` gerado, e a
configuração de assinatura de release só entra editando o `build.gradle.kts`
gerado. Se a pasta fosse ignorada, um clone novo rodaria `android init` e
produziria um `.apk` **sem as permissões** — o app abriria sem microfone, e o
sintoma apareceria só no telefone.

O `android init` escreve um `.gitignore` próprio dentro de `gen/android/`, que
já exclui `build/`, `.gradle/`, `local.properties` e o `keystore.properties`
(que carrega a senha). É esse arquivo que faz o trabalho; o `.gitignore` da
raiz não sabe de Android.

### Como gerar o `.apk`/`.aab`

```bash
scripts/build-android-no-servidor.sh              # origin/main, assinado
scripts/build-android-no-servidor.sh <ref>
scripts/build-android-no-servidor.sh --sem-assinar
```

Sai em `.claude/saida-android/<versão>-<commit>/`. O keystore de release está
em `/root/.android/streamz.keystore` e a senha em
`/root/.android/streamz.keystore.senha` (chmod 600). **Perder esse keystore é o
mesmo que perder `/root/.tauri/streamz.key`**: a Play só aceita atualização
assinada com a mesma chave, então um keystore perdido significa **nunca mais
atualizar o app** — só publicar um app novo, com outro `applicationId`, e pedir
a todo mundo que reinstale.

### O atualizador do Tauri não vale para Android

O `tauri-plugin-updater` é desktop-only, e por isso ele e o `tauri-plugin-process`
estão num bloco `[target.'cfg(not(any(target_os = "android", target_os = "ios")))'.dependencies]`
do `Cargo.toml` — no `.apk` eles nem entram. Na loja quem atualiza é a loja.

Num `.apk` fora da loja quem atualiza é o **nosso** atualizador: o plugin
`atualizador` (`src/atualizador.rs` + `AtualizadorPlugin.kt`), dirigido por
`apps/web/lib/atualizacao-mobile.ts`. Ele consulta a mesma rota `/api/updates`
(alvo `android`), baixa o `.apk`, confere o **sha256** — não há verificador de
minisign no Android — e abre o instalador do sistema. O que não dá para fazer é
pular a tela de confirmação do Android, e a interface diz isso. Ver
`docs/APPS-MOBILE.md` §13.
