# Streamz no celular: PWA, Android e iOS

Como o Streamz sai como app de celular, o que custa, em que ordem se compra e
o que **não** dá para provar deste servidor. Escrito em 2026-09-09, junto com
os três PRs que prepararam o terreno. Vale a mesma regra do
`docs/PROCESSO-DE-DESENVOLVIMENTO.md`: o que foi feito e verificado está dito
como feito; o que não foi, está dito como não foi.

**Estado hoje: nenhum destes três caminhos foi compilado e aberto num celular.**
O PWA é o único que já roda de verdade, e roda porque é o site que já está no
ar. O Android e o iOS são configuração escrita contra a documentação, com YAML,
JSON e plist validados por parser — não com build.

## Índice

1. [Os três caminhos em uma página](#1-os-três-caminhos-em-uma-página)
2. [O que dá para testar sem gastar nada](#2-o-que-dá-para-testar-sem-gastar-nada)
3. [O que comprar, em que ordem](#3-o-que-comprar-em-que-ordem)
4. [As variáveis de cada pipeline](#4-as-variáveis-de-cada-pipeline)
5. [Chaves que, se perdidas, matam o app](#5-chaves-que-se-perdidas-matam-o-app)
6. [Decisões do iOS e por quê](#6-decisões-do-ios-e-por-quê)
7. [Limitações fixas](#7-limitações-fixas)
8. [PWA no iOS não serve para chamada de voz](#8-pwa-no-ios-não-serve-para-chamada-de-voz)
9. [Cadência de release dos quatro juntos](#9-cadência-de-release-dos-quatro-juntos)
10. [O que este trabalho NÃO prova](#10-o-que-este-trabalho-não-prova)
11. [Os três PRs](#11-os-três-prs)

---

## 1. Os três caminhos em uma página

O app é um só: `apps/web` (Next.js). O que muda é a casca.

| | PWA | Android | iOS |
|---|---|---|---|
| Casca | nenhuma — é o site | Tauri 2 (`apps/desktop/src-tauri`) | Tauri 2 (o mesmo crate) |
| Como chega no aparelho | "Adicionar à tela de início" em `streamz.chat` | `.apk` baixado de `streamz.chat/download`, ou Play Store | TestFlight, depois App Store |
| Custo | zero | zero fora da loja; US$ 25 uma vez na Play | US$ 99/ano, obrigatório |
| Onde compila | já está no ar | neste servidor, em Docker | **só em macOS** — Codemagic |
| Precisa de Mac | não | não | sim (alugado por minuto) |
| Serve para chamada de voz | Android sim, **iPhone não** (§8) | sim | sim |

**Como isso está montado por dentro** — um crate só para as três plataformas,
os arquivos de config por plataforma, a divisão das `capabilities/`, os
identificadores e a ordem de merge dos PRs — está em
`apps/desktop/CONTRATO-MOBILE.md`. Este documento não repete nada de lá: ele
responde o que custa, o que dá para testar de graça e o que nunca vai
funcionar.

## 2. O que dá para testar sem gastar nada

### PWA — tudo, hoje

`streamz.chat` no navegador do celular, e "Adicionar à tela de início" para
ver em tela cheia. Não precisa de conta, de loja, de assinatura, de nada. É o
único dos três que já pode ser testado por qualquer pessoa neste minuto.

No **Android** o PWA é um app de verdade: chamada de voz funciona, inclusive
com a tela apagada. No **iPhone**, não — ver §8. É a diferença mais importante
deste documento.

### Android — tudo, instalando o `.apk` fora da loja

O Android permite instalar um `.apk` assinado por qualquer chave, desde que o
usuário autorize "instalar apps desconhecidos" para o navegador. Nenhuma taxa,
nenhuma conta, nenhuma revisão. Só a chave de assinatura, que já existe neste
servidor (§5).

Isso significa que **o app Android inteiro pode ser testado antes de o usuário
decidir se quer pagar os US$ 25 da Play Store** — e a Play Store, se vier, é só
distribuição.

O Bloco 2 já gerou os dois pacotes neste servidor, e estes números são medidos,
não estimados:

| | |
|---|---|
| `.apk` universal | 55 244 528 bytes |
| `.aab` (o formato da Play) | 23 869 802 bytes |
| `apksigner verify` | `Verifies` (esquema v2) |
| `versionCode` da versão 1.1.0 | 1001000 |

O `.apk` é o dobro do `.aab` porque leva as bibliotecas nativas de todas as
ABIs; a Play entrega só a do aparelho.

### iOS — nada

Não há como rodar o app de iPhone sem a conta paga. Nem parcialmente:

- **`tauri ios init` não roda no Linux.** O comando gera um projeto Xcode e
  depende de ferramentas que só existem no macOS.
- **Não há Mac.** Sem Mac não há simulador, não há Xcode, não há
  `xcodebuild`, e não há Safari Web Inspector para depurar o WebView.
- **Sem os US$ 99 não há assinatura.** O iOS recusa executar binário não
  assinado, e o certificado de assinatura só sai de uma conta paga. Isso vale
  até para instalar no próprio iPhone por cabo.
- Alugar um Mac na nuvem (o Codemagic, §3) resolve a primeira e a segunda
  barreiras, mas **não** a terceira: a máquina alugada precisa da conta Apple
  do usuário para assinar.

Ou seja: os US$ 99 não são para "publicar na loja". São para **compilar uma
vez**.

## 3. O que comprar, em que ordem

### Apple — US$ 99/ano, obrigatório para o iOS

A anuidade está confirmada na página de inscrição da Apple:
"The Apple Developer Program annual fee is 99 USD".
(https://developer.apple.com/support/enrollment/)

Na ordem, sem pular passo:

1. **Apple Developer Program** — `developer.apple.com/programs/enroll`.
   Pessoa física serve. Pede Apple ID com verificação em duas etapas e,
   dependendo do país, documento. A aprovação leva de horas a alguns dias.
2. **App Store Connect → My Apps → +** — criar o app.
   - **Bundle ID**: `chat.streamz.app`. Tem que ser registrado antes, em
     Certificates, Identifiers & Profiles → Identifiers → App IDs. É este, não
     o `dev.streamz.app` do desktop (§6).
   - Plataforma: iOS. Nome: Streamz. Idioma principal: Português (Brasil).
   - Guarde o **Apple ID numérico do app** (aparece em App Information); ele é
     útil para automatizar o número de build depois.
3. **Users and Access → Integrations → App Store Connect API → +** — gerar a
   chave de API. Papel **App Manager** (Admin também serve; menos que App
   Manager não sobe build).
   Anote os três, que são coisas diferentes:
   - **Issuer ID** — um UUID, fica no topo da página;
   - **Key ID** — dez caracteres, na linha da chave;
   - **o arquivo `AuthKey_<KeyID>.p8`** — **só pode ser baixado uma vez.**
     A Apple não guarda cópia. Se perder, revoga e gera outra. Guarde-o junto
     com as outras chaves críticas (§5).
4. **Codemagic** — `codemagic.io`, entrar com a conta do GitHub e dar acesso a
   `MirandaSls/streamz`. **Conta pessoal, não Team**: a cota gratuita de 500
   min/mês em Mac mini M2 é só para conta pessoal
   (https://docs.codemagic.io/billing/pricing/).
5. **Codemagic → Teams/Integrations → Developer Portal → Connect** — cadastrar
   a chave da App Store Connect com os três dados do passo 3. **O nome que se
   dá à integração aqui tem que ser `streamz-app-store-connect`**, que é o que
   o `codemagic.yaml` procura; usando outro, ajuste o YAML.
6. **Codemagic → Environment variables** — criar o grupo `streamz-apple` com
   uma variável: `APPLE_DEVELOPMENT_TEAM`, o Team ID de dez caracteres (fica em
   Membership no portal da Apple). Marque como *secure*.
7. **Rodar o workflow `ios-app-store`** pelo painel do Codemagic. Ele não tem
   gatilho automático de propósito (cada build come da cota).
8. **TestFlight** — o build aparece em App Store Connect → TestFlight em alguns
   minutos, depois de o processamento da Apple terminar. Instale o app
   TestFlight no iPhone e teste. **Teste interno não passa por revisão
   humana**; teste externo e a loja passam.
9. Só quando estiver bom: App Store Connect → enviar para revisão. A revisão é
   feita por gente e leva de um a alguns dias.

### Google — US$ 25 uma vez, opcional

"There is a US$25 one-time registration fee"
(https://support.google.com/googleplay/android-developer/answer/6112435).

É **opcional** porque o `.apk` do Bloco 2 instala fora da loja. Vale a pena
quando o objetivo for alcance: atualização automática, busca na Play, e o
usuário não precisar autorizar "fontes desconhecidas". A conta é permanente;
não tem anuidade.

**Atenção ao entrar na Play**: a Play exige o *Play App Signing*, e a partir do
momento em que o app está lá, **o `versionCode` só pode subir** e o pacote tem
que continuar com o mesmo `applicationId`. Um `versionCode` publicado nunca
mais pode ser reaproveitado.

### Resumo do dinheiro

| Item | Quanto | Quando | Obrigatório |
|---|---|---|---|
| Apple Developer Program | US$ 99/ano | antes de qualquer build de iOS | sim, para iOS |
| Codemagic | US$ 0 até 500 min/mês, depois US$ 0,095/min | ao rodar o build | sim (ou um Mac) |
| Google Play Console | US$ 25, uma vez | quando quiser a loja | não |
| PWA | US$ 0 | — | — |

Com `max_build_duration: 60` do `codemagic.yaml`, a cota garante **8 builds por
mês no pior caso**. Na prática o build deve ficar perto de 25 min — o crate
`livekit`, que é o que demora no desktop, é `cfg(windows)` e não entra no iOS —
o que dá cerca de **20 builds por mês** de graça. Passando disso, cada build de
25 min custa ~US$ 2,40.

## 4. As variáveis de cada pipeline

**Nada disto entra no repositório.** Nem valor, nem exemplo com valor real, nem
Team ID, nem `.p8`, nem certificado. O `codemagic.yaml` e o
`.github/workflows/ios.yml` citam apenas **nomes**.

### iOS — Codemagic (caminho principal)

| Variável | Onde se consegue | Onde se guarda |
|---|---|---|
| `APPLE_DEVELOPMENT_TEAM` | portal da Apple → Membership → Team ID (10 caracteres) | grupo `streamz-apple` no Codemagic, *secure* |
| Issuer ID, Key ID e a `.p8` | App Store Connect → Users and Access → Integrations | na **integração** `streamz-app-store-connect` do Codemagic, não em variável |
| certificado e perfil de provisionamento | — | **nenhum**: o `environment.ios_signing` do YAML busca os dois sozinho durante o build (https://docs.codemagic.io/yaml-code-signing/signing-ios/) |

`APPLE_DEVELOPMENT_TEAM` é o nome que o **Tauri** lê para sobrescrever
`bundle.iOS.developmentTeam`
(https://v2.tauri.app/reference/environment-variables/). Não é
`TAURI_APPLE_DEVELOPMENT_TEAM` — esse nome aparece em discussões antigas e não
vale no v2.

### iOS — GitHub Actions (plano B, desligado)

Só faz sentido se a cobrança do GitHub for destravada (§3.5 do processo) e a
cota do Codemagic acabar. Aqui a assinatura é na mão, então há mais segredos:

| Segredo do repositório | O que é |
|---|---|
| `APPLE_DEVELOPMENT_TEAM` | o mesmo Team ID |
| `APPLE_API_ISSUER` | o Issuer ID (UUID) da App Store Connect API |
| `APPLE_API_KEY_ID` | o Key ID de 10 caracteres |
| `APPLE_API_KEY_BASE64` | o conteúdo do `AuthKey_<KeyID>.p8` em base64 (`base64 -w0 AuthKey_XXXX.p8`) |

O workflow escreve a `.p8` em `$RUNNER_TEMP`, usa, e apaga num passo
`if: always()`. `APPLE_API_ISSUER`, `APPLE_API_KEY` e `APPLE_API_KEY_PATH` são
as variáveis que o **próprio Tauri** lê para assinar em CI
(https://v2.tauri.app/distribute/sign/ios/) — por isso `APPLE_API_KEY` recebe o
*Key ID* e `APPLE_API_KEY_PATH` recebe o *caminho do arquivo*.

Guardar em Settings → Secrets and variables → Actions → New repository secret.

### Android

O Bloco 2 documenta as dele no PR de Android. O essencial para este documento:
o build acontece **neste servidor**, em Docker, e a chave de assinatura é um
arquivo local (§5) — não sobe para lugar nenhum.

## 5. Chaves que, se perdidas, matam o app

Três arquivos, mesma gravidade. Nenhum deles pode ser recriado: perder é
perder.

| Chave | Onde está | O que acontece se sumir |
|---|---|---|
| Assinatura do atualizador do desktop | `/root/.tauri/streamz.key` (a pública está em `tauri.conf.json`) | **Ninguém no Windows atualiza mais.** O app instalado só aceita manifesto assinado por essa chave; trocá-la exige reinstalar na mão em toda máquina. Ver §5 do processo. |
| Keystore do Android | `/root/.android/streamz.keystore`, senha em `/root/.android/streamz.keystore.senha` | Fora da loja: os usuários têm que **desinstalar e reinstalar** (o Android recusa atualizar um app assinado por outra chave). Na Play: **nunca mais dá para atualizar** aquele app — vira app novo, com nova ficha, sem os instalados. |
| `AuthKey_<KeyID>.p8` da App Store Connect | onde o usuário guardar. A Apple **não guarda cópia** e só deixa baixar **uma vez** | Nenhum build sobe para o TestFlight nem para a App Store. Esta é a única das três que **dá para refazer**: revogar a chave no App Store Connect e gerar outra. |

Regras que valem para as três:

- **Nunca imprimir o conteúdo em PR, log, mensagem ou commit.** A senha do
  keystore não é citada em lugar nenhum deste repositório de propósito.
- Backup fora deste servidor (o disco é um só). Um gerenciador de senhas com
  anexo serve.
- Se alguma vazar, revogue/gere outra antes de qualquer outra coisa. Para o
  keystore isso não existe — por isso ele é o mais grave dos três.

## 6. Decisões do iOS e por quê

O que vale para os dois celulares está em `apps/desktop/CONTRATO-MOBILE.md`.
Aqui ficam só as decisões que são **do iOS**, cada uma com a fonte e com o que
não deu para confirmar deste servidor.

### O bundle id do iOS é `chat.streamz.app`, e é diferente do desktop

O desktop usa `dev.streamz.app` e continua usando. O iOS usa
`chat.streamz.app`, escrito no `tauri.ios.conf.json`.

Isso funciona porque `identifier` é campo de **topo** do objeto `Config`, e o
arquivo por plataforma faz merge patch no `Config` inteiro, não só em `bundle`.
A própria doc do Tauri mostra o padrão de sobrescrever `productName` e
`identifier` por arquivo de config
(https://v2.tauri.app/develop/configuration-files/). Não achamos nenhuma
restrição documentada de que o identifier não possa variar por plataforma.

**O que não deu para provar daqui:** que o `tauri ios init` de fato usa esse
identifier ao gerar o projeto Xcode. Existe um relato do contrário
(tauri-apps/tauri#9851, "iOS app's bundle identifier does not use
tauri.conf.json"), cujo desfecho não conseguimos confirmar. Por isso os dois
pipelines têm um **passo de trava logo depois do `tauri ios init`**: um `grep`
no `project.pbxproj` que derruba o build se `chat.streamz.app` não estiver lá.
Assim o erro aparece em segundos, e não quinze minutos depois no upload
recusado. Se a trava disparar, a saída documentada é passar
`--config src-tauri/tauri.ios.conf.json` no `tauri ios init`.

### `developmentTeam` não está no arquivo

`bundle.iOS.developmentTeam` foi deixado **ausente** de propósito: o Team ID é
dado do usuário e não entra no repositório. Quem preenche é a variável de
ambiente `APPLE_DEVELOPMENT_TEAM`. Se ela não estiver setada, o build falha
com mensagem clara — que é melhor do que um valor de mentira no JSON.

### O plist se chama `Info.ios.plist`, não `Info.plist`

O nome e o lugar não são escolha nossa. A descrição do campo
`bundle.iOS.infoPlist` no schema oficial diz: "Note that Tauri also looks for a
`Info.plist` and `Info.ios.plist` file in the same directory as the Tauri
configuration file" (https://schema.tauri.app/config/2). Ou seja, os dois nomes
valem, e o diretório é `src-tauri/` — o mesmo do `tauri.conf.json`, **não**
`gen/apple/`.

Escolhemos a variante `.ios` porque `Info.plist` alcançaria também um eventual
bundle de macOS, e `UIBackgroundModes` e as chaves `NS*UsageDescription` de
câmera/microfone não são as mesmas no macOS. O
`apps/desktop/CONTRATO-MOBILE.md` §7 dizia `Info.plist`; foi corrigido para
`Info.ios.plist`.

### `UIBackgroundModes` tem `audio` e **não** tem `voip`

O pedido original era `audio` e `voip`. Ficou só `audio`, e a diferença é
importante:

- **`audio`** é o que mantém uma chamada **já em andamento** viva com o app em
  segundo plano ou a tela apagada. É exatamente o que o Streamz precisa.
- **`voip`** é para **acordar** o app quando chega uma chamada com ele fechado,
  e pressupõe PushKit + CallKit. Declarar `voip` sem implementar isso é motivo
  conhecido de rejeição no App Review (relatos consistentes nos fóruns da
  Apple, alinhados à App Review Guideline 2.5.4:
  https://developer.apple.com/forums/thread/64960).

Como o Streamz hoje não tem PushKit nem CallKit (push é fase seguinte, §7),
`voip` só traria risco de rejeição sem trazer função. **É uma linha para
acrescentar** no dia em que houver CallKit.

**Não verificado:** que o `audio` sozinho basta para o WKWebView do Tauri
segurar a chamada em segundo plano. Isso depende de a `AVAudioSession` estar em
`.playAndRecord`, e o Tauri **não tem API para isso** — há uma issue aberta
pedindo suporte a modos de segundo plano no iOS (tauri-apps/tauri#12523). Se o
primeiro build mostrar a chamada caindo ao bloquear a tela, o conserto é código
Swift no projeto gerado, e aí `gen/apple/` deixa de ser descartável.

### `minimumSystemVersion` é `15.0`

O default do Tauri é `14.0`. Subimos para 15.0 por dois motivos medidos na
documentação:

- o WKWebView só ganhou WebRTC/`getUserMedia` no **iOS 14.3** — abaixo disso o
  app abre e a chamada simplesmente não existe;
- o `WKUIDelegate.webView(_:requestMediaCapturePermissionFor:...)`, que evita
  o pedido de permissão de microfone **a cada** `getUserMedia`, é **iOS 15**
  (https://developer.apple.com/documentation/webkit/wkuidelegate/webview(_:requestmediacapturepermissionfor:initiatedbyframe:type:decisionhandler:)).

**Não verificado:** se o wry (o WebView do Tauri) implementa esse delegate. Se
não implementar, o usuário vai ver o pedido de microfone toda vez que entrar
numa call. É a primeira coisa a olhar no TestFlight.

### `NSLocalNetworkUsageDescription` está lá mesmo sem certeza

O WebRTC enumera interfaces de rede ao juntar candidatos ICE, e no iOS isso
pode disparar o pedido de acesso à rede local. Sem o texto no plist o sistema
nega sem perguntar. Não conseguimos confirmar que o LiveKit dispara esse pedido
(a conexão é sempre com o SFU, não com um par na mesma rede), mas a chave só
custa uma linha e a falha que ela evita é silenciosa. Se o App Review reclamar
de permissão sem uso, é só remover.

### `ITSAppUsesNonExemptEncryption` é `false`

Sem ela, **toda** submissão para no formulário de conformidade de exportação. O
app só usa HTTPS/WSS e a criptografia do próprio sistema, que é a isenção
padrão.

### O Rust do build tem piso 1.85, e os dois pipelines travam nisso

A árvore de dependências dos alvos móveis puxa o `getrandom 0.4`, que é
`edition2024`, e a **edição 2024 só existe a partir do Rust 1.85**. Com um
toolchain mais velho o build morre no meio do `cargo`, com
`feature "edition2024" is required` — uma mensagem que não fala em versão de
toolchain e custa uma hora até alguém ligar uma coisa na outra.

Isto **não é teoria**: derrubou o build de Android do Bloco 2 com o Rust 1.83,
neste servidor. O iOS compartilha a mesma árvore de crates, então bateria no
mesmo muro. Por isso `codemagic.yaml` e `.github/workflows/ios.yml` fazem
`rustup toolchain install stable` + `rustup default stable` — a versão que a
imagem alugada traz não é escolha nossa — e logo depois **comparam a versão
com 1.85 e derrubam o build na hora** se for menor. A comparação é em `awk`
porque `sort -V` não é confiável no `sort` BSD do macOS.

### Os ícones foram refeitos

Os 18 PNGs de `apps/desktop/src-tauri/icons/ios/` estavam completos em tamanho
(20/29/40/60/76/83.5 em @1x/@2x/@3x, mais o de 1024 em `AppIcon-512@2x.png`),
mas tinham dois defeitos medidos:

1. **Canal alfa.** Todos eram RGBA. O de 1024 tinha 518 pixels com alfa 254. A
   App Store recusa o ícone de 1024 com canal alfa (`ITMS-90717`).
2. **Cantos arredondados chapados, com branco por fora.** O SVG de origem
   (`docs/branding/marca/icone-app-1024.svg`) tem `rx="236"`, e o rasterizador
   compôs o lado de fora sobre **branco**. O iOS aplica a **própria** máscara
   (superelipse) por cima: o resultado seria uma auréola branca nos cantos.

Os 18 foram regerados do mesmo SVG com o `rx` removido — ícone **quadrado e
sangrado**, com o `#0B0B0F` da marca até a borda — em RGB, sem alfa. Medido
depois: canto `(0,0)` = `(11,11,15)`, centro = `(155,227,31)`, todos em modo
`RGB`. O desenho não mudou; o que mudou foi o que está debaixo da máscara.

> Uma consequência: rodar `tauri icon` de novo **desfaz** isto, porque ele
> parte do SVG com o `rx` e compõe sobre branco. Se precisar regerar, refaça
> o passo do PR do Bloco 3 em vez de rodar `tauri icon` para o iOS.

### `capabilities/ios.json` é curto de propósito

Só `core:default`, `notification:default` e `opener:allow-open-url`. Ficaram de
fora, porque não têm equivalente no iPhone:

- **`updater:*` e `process:allow-restart`** — o atualizador do Tauri não cobre
  iOS (§7). Quem atualiza é a App Store.
- **A janela `splash`** — ela não existe no iOS (o `app.windows` do
  `tauri.ios.conf.json` tem só a `main`), então `capabilities/splash.json` não
  se aplica.
- **`dialog:allow-save` + `fs:allow-write-file`** — o "Salvar como" do desktop
  escreve em `$DOWNLOAD`/`$PICTURE`/`$DESKTOP`/`$DOCUMENT`, que no iOS não
  existem como pasta gravável pelo app. Salvar imagem no iPhone é a galeria,
  via `NSPhotoLibraryAddUsageDescription`, e isso é plugin nativo, não `fs`.
- **`clipboard-manager:allow-write-image`** — não confirmamos que o plugin
  implementa escrita de imagem no iOS.

Consequência prática: no iPhone, os botões "Salvar como" e "Copiar imagem" do
visualizador de imagem em tela cheia vão falhar. **Isso precisa ser escondido
na interface** — é trabalho de quem for fazer a tela, não deste PR.

## 7. Limitações fixas

Não são "ainda não fizemos". São coisas que exigem trabalho nativo novo e estão
**fora de escopo** dos três PRs.

### Compartilhar a tela do celular: não existe

O compartilhamento de tela do Streamz é `apps/desktop/src-tauri/src/tela/`,
`cfg(windows)` puro: Windows Graphics Capture, DXGI Desktop Duplication e WASAPI
loopback. No celular seria outro código, do zero, em cada sistema — **ReplayKit**
no iOS (que ainda exige uma *Broadcast Upload Extension*, um alvo separado no
Xcode) e **MediaProjection** no Android. Nenhum dos dois tem plugin oficial do
Tauri.

Ver a tela de **outra pessoa** continua funcionando: isso é vídeo recebido pelo
LiveKit, e é o mesmo caminho de sempre.

### iOS sem Mac: sem depuração do WebView

O Safari Web Inspector, único jeito de abrir o console do WKWebView de um app
iOS, **roda no macOS**. Sem Mac não há console, não há inspetor de rede, não há
breakpoint. O que sobra:

- **TestFlight** — instalar e olhar;
- **log** — o que o app escrever e mandar para a API; e
- os **logs de build** do Codemagic, que dizem se compilou, não se funciona.

Isto é o análogo iOS do §5.3 do processo ("o que este build NÃO prova"). Lá o
Linux gera o `.exe` mas só o Windows diz se ele abre. Aqui é pior: o Linux nem
gera.

### Notificação push: fase seguinte

Hoje a notificação do Streamz é `tauri-plugin-notification`, que é **local** —
o app só notifica enquanto está rodando. Push de verdade (o celular acorda com
mensagem nova, app fechado) exige três coisas que não existem:

- **APNs** no iOS: uma chave própria (outra `.p8`), certificado de push, e o
  *entitlement* `aps-environment`;
- **FCM** no Android: projeto no Firebase e um `google-services.json`;
- **um serviço no backend** que guarde o token de cada aparelho e dispare o
  envio nos eventos de mensagem/menção — nada disso existe em `apps/api`.

No PWA, o push do iOS existe desde o **iOS 16.4** e **exige** o site adicionado
à tela de início (https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

### O atualizador do Tauri não cobre Android nem iOS

`tauri-plugin-updater` é desktop. Consequência, por caminho:

- **APK fora da loja**: quem atualiza é o usuário, baixando o `.apk` novo em
  `streamz.chat/download`. Vale avisar dentro do app quando houver versão nova.
- **Play Store** e **App Store**: quem atualiza é a loja, sozinha.
- **PWA**: o service worker atualiza no recarregamento — é o mais rápido dos
  quatro.

O `plugins.updater` continua no `tauri.conf.json` porque é o desktop que o usa;
no iOS ele fica inerte, e a `capabilities/ios.json` não dá permissão para ele.

### PWA no iOS: ver §8

## 8. PWA no iOS não serve para chamada de voz

Esta seção existe porque a resposta importa mais do que todas as outras juntas,
e ela é ruim.

**O PWA no iPhone não serve como app de voz.** Serve para ler e mandar mensagem;
não serve para ficar numa call. Com todas as letras: se o usuário só instalar o
PWA no iPhone, ele vai conseguir conversar por texto e vai perder a ligação toda
vez que sair da tela.

O que funciona:

- **`getUserMedia` funciona** em PWA standalone desde o **iOS 13.4**. Havia um
  bug (WebKit #185448) que quebrava captura de mídia em app adicionado à tela de
  início; foi corrigido em março de 2020.
  (https://bugs.webkit.org/show_bug.cgi?id=185448)
- **Push funciona** desde o iOS 16.4, com o site na tela de início
  (https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

O que **não** funciona, e é o que mata:

1. **Áudio em segundo plano.** No Safari do iOS, WebRTC e Web Audio são
   suspensos assim que a tela bloqueia ou o app vai para segundo plano. A
   chamada não sobrevive a trocar de app nem a apagar a tela — que é o uso
   normal de uma call de voz. Não há chave, `manifest` ou API que contorne
   isso: é decisão do WebKit, e há pedido aberto no fórum da Apple para mudar
   (https://developer.apple.com/forums/thread/774239).
2. **Áudio de quem entra depois.** Há issue aberta no SDK do LiveKit
   (livekit/client-sdk-js#1751): no Safari, faixas de áudio de participantes que
   entram **depois** que a aba foi para segundo plano ficam mudas até o usuário
   voltar — mesmo com `autoplay`, `playsinline` e interação prévia.
3. **Autoplay travado.** O próprio LiveKit documenta: "Safari on iOS is very
   restrictive with regards to audio playback that is not initiated by user
   interaction" — é preciso chamar `Room.startAudio()` dentro de um `click`/
   `tap` (https://docs.livekit.io/reference/components/react/component/startaudio/).
   Dá para contornar com um botão, mas é atrito toda vez.
4. **A chave de silenciar do aparelho cala o Web Audio**, ao contrário de um
   `<audio>` comum (WebKit #237322).
5. **Ligação telefônica recebida derruba.** O `AudioContext` fica em estado
   `interrupted` e, em alguns casos, não volta sozinho quando a ligação acaba
   (WebAudio/web-audio-api#2585).

Nada disso vale para o **Android**: lá o PWA (e principalmente o `.apk`) segura
a chamada em segundo plano normalmente.

**Conclusão prática.** No iPhone, chamada de voz **exige o app nativo** — que
exige o TestFlight/App Store, que exige os US$ 99. Não há atalho. O PWA no
iPhone é um bom leitor de mensagens e um péssimo telefone, e é honesto dizer
isso ao usuário dentro do próprio app quando ele estiver em Safari standalone
num iPhone e tentar entrar numa call.

## 9. Cadência de release dos quatro juntos

O §5 do processo descreve a publicação do desktop. Com celular são quatro
saídas, com velocidades muito diferentes.

### O bump de versão

Hoje a versão vive em **quatro** arquivos, e todos sobem juntos (§5.1 do
processo):

1. `apps/desktop/package.json`
2. `apps/desktop/src-tauri/tauri.conf.json`
3. `apps/desktop/src-tauri/Cargo.toml` (linha 3)
4. `apps/desktop/src-tauri/Cargo.lock` (o `version` logo abaixo de
   `name = "streamz-desktop"`)

Com o celular entram **mais dois**, e estes são **monotônicos** — nunca podem
repetir nem descer:

5. **`versionCode` do Android** — inteiro. A Play recusa um `versionCode` já
   publicado. Pelo `apps/desktop/CONTRATO-MOBILE.md` §3 ele é **derivado** da
   versão semântica (`major*1000000 + minor*1000 + patch`), então sobe sozinho
   com o bump — desde que a versão semântica nunca desça. Confirmado no build
   do Bloco 2: a versão 1.1.0 saiu com `versionCode` **1001000**.
6. **`bundleVersion` do iOS** — `bundle.iOS.bundleVersion` no
   `tauri.ios.conf.json`, que vira o `CFBundleVersion`. É o "(3)" do
   `1.2.0 (3)` do TestFlight. **Dois uploads com o mesmo par
   `version`+`bundleVersion` são recusados pela App Store Connect**, mesmo que o
   binário seja diferente. Está em `"1"` hoje; **sobe a cada envio**, mesmo que
   a `version` não mude.

O `version` do `tauri.conf.json` (herdado pelo iOS) é o
`CFBundleShortVersionString` — o "1.2.0" que o usuário vê.

### O que sai de cada pipeline

| Saída | Como | Quanto demora | Chega no usuário |
|---|---|---|---|
| Web / PWA | `scripts/publicar-local.sh` (§3.6 do processo) | minutos | no recarregamento, mesmo dia |
| Desktop Windows | `scripts/build-desktop-no-servidor.sh` + §5 | ~25 min com cache | na próxima abertura do app |
| Android `.apk` | Docker neste servidor (PR do Bloco 2) | primeira rodada longa, depois minutos | quando o usuário baixar |
| Android Play | mesmo `.aab`, upload manual | horas a dias de revisão | atualização automática da Play |
| iOS TestFlight | Codemagic (`codemagic.yaml`) | ~25 min + processamento | minutos, para os testadores |
| iOS App Store | envio manual pelo painel | **dias**, revisão humana | atualização automática da loja |

### A ordem que funciona

1. Merge de tudo em `main`, com a verificação do §3.2 verde.
2. **Bump nos seis lugares**, num PR só (`chore(mobile): versão X.Y.Z`).
3. **Publicar a web** — é o mais rápido e é o que todo mundo vê. O desktop e o
   Android embutem o build da web, então a web tem que ser a verdade primeiro.
4. **Disparar os builds lentos em paralelo**: o instalador Windows aqui e o
   `.ipa` no Codemagic. São máquinas diferentes; não competem.
5. **Enviar para as lojas** (App Store e Play, se estiver nela) e **só então**
   publicar o `.exe` em `updates/` e o `.apk` em `downloads/`.
6. Esperar a revisão. Dias.

**A consequência a engolir:** as versões **não** chegam juntas. A web e o
desktop saem no mesmo dia; a App Store pode levar uma semana. Ou o produto
aceita conviver com versões diferentes no ar ao mesmo tempo — e aí a API
precisa continuar servindo o cliente velho —, ou cada release passa a esperar a
loja mais lenta, e aí a web fica presa a uma revisão da Apple, o que é pior.

O caminho recomendado é o primeiro: **a API nunca quebra o cliente velho**, e a
loja chega quando chegar. É o mesmo contrato que o atualizador do desktop já
assume hoje, onde alguém pode ficar semanas numa versão antiga.

## 10. O que este trabalho NÃO prova

No estilo do §5.3 do processo. O que foi feito e o que não foi:

**Foi verificado, aqui, com saída:**

- `codemagic.yaml` e `.github/workflows/ios.yml` parseiam (PyYAML 6.0.3), e o
  `ios.yml` tem `workflow_dispatch` como **único** gatilho.
- `Info.ios.plist` parseia com `plistlib`, com as 8 chaves esperadas.
- O merge patch RFC 7396 do `tauri.ios.conf.json` sobre o `tauri.conf.json` dá
  o objeto esperado: `identifier` = `chat.streamz.app`, uma única janela
  (`main`, sem `decorations`, sem `width`/`height`, sem a `splash`), CSP e
  `beforeBuildCommand` intactos, e o `tauri.conf.json` do desktop **inalterado**
  (`dev.streamz.app`).
- O resultado da mescla valida contra o schema oficial
  (`https://schema.tauri.app/config/2`, draft-07). Os dois campos usados em
  `bundle.iOS` existem no schema, que é `additionalProperties: false`.
- `platforms: ["iOS"]` é um dos cinco valores de `definitions.Target`, com a
  caixa certa.
- Os 18 ícones: tamanhos conferidos por Pillow, alfa removido, e o de 1024
  regerado do SVG sem o `rx`.
- Nenhuma variável de segredo aparece com valor no repositório (`git grep`).

**NÃO foi verificado, e não dá para verificar deste servidor:**

- **Que o app iOS compila.** Nenhum comando de iOS rodou. Não há macOS, não há
  Xcode, não há conta Apple. `tauri ios init` nunca foi executado, o projeto
  Xcode nunca existiu e não há `.ipa`.
- **Que o `codemagic.yaml` roda.** Nunca foi submetido ao Codemagic. Os nomes
  de chave foram escritos contra a documentação, mas só o primeiro build vai
  dizer se `xcode-project use-profiles` funciona sobre um projeto gerado pelo
  `tauri ios init` (esse par não aparece na doc de nenhum dos dois).
- **Que o `.github/workflows/ios.yml` roda.** O Actions do repositório não
  inicia job nenhum desde 2026-09-03.
- **Que o identifier do `tauri.ios.conf.json` sobrevive ao `tauri ios init`**
  (§6). Por isso a trava com `grep`.
- **Que `UIBackgroundModes: audio` basta** para segurar a call com a tela
  apagada (§6).
- **Que o wry implementa `requestMediaCapturePermissionFor`** — se não, o
  pedido de microfone repete a cada call (§6).
- **Que o `NSLocalNetworkUsageDescription` é necessário** (§6).
- **Que a CSP do `tauri.conf.json` está certa para o iOS.** Ela não foi tocada:
  `connect-src` tem `ipc:` e `http://ipc.localhost`, que são as origens de IPC
  do desktop e do Android. Se no iOS a origem for outra, a primeira chamada de
  IPC morre em silêncio e o sintoma vai ser "o app abre e não faz nada".
  **É a primeira hipótese a testar** se o build passar e o app abrir em branco.
- **Que os ícones ficam bons na tela de um iPhone.** Foram medidos e olhados no
  1024; a máscara do iOS por cima só o aparelho mostra.
- **Que a App Store aceita o app.** Revisão é gente.

## 11. Os três PRs

O trabalho de celular foi feito em três blocos, em worktrees separadas, a
partir do mesmo `origin/main` (`d17dc51`):

| Bloco | Branch | O que traz |
|---|---|---|
| 1 — PWA | `feat/app-pwa` | manifest, ícones, cabeçalhos, ajustes de tela |
| 2 — Android | `feat/app-android` | o crate como lib+bin, `tauri.android.conf.json`, `capabilities/mobile.json`, o `.apk` |
| 3 — iOS | `feat/app-ios` | este documento, `apps/desktop/CONTRATO-MOBILE.md`, `tauri.ios.conf.json`, `Info.ios.plist`, `capabilities/ios.json`, `codemagic.yaml`, `.github/workflows/ios.yml`, os 18 ícones do iOS |

**Ordem de merge.** O Bloco 3 **depende do Bloco 2** e só faz sentido depois
dele: é o PR de Android que transforma o crate em `lib + bin` (com
`crate-type = ["staticlib","cdylib","rlib"]` e o
`#[cfg_attr(mobile, tauri::mobile_entry_point)] pub fn run()` em `src/lib.rs`),
sem o qual **nenhum** build móvel — Android ou iOS — linka. O Bloco 1 é
independente dos outros dois.

O `apps/desktop/CONTRATO-MOBILE.md` foi escrito pelo Bloco 2 (é ele que decide a
montagem) e vai commitado no PR do Bloco 3 só porque o Bloco 3 é o último a
entrar. A única correção feita nele aqui foi o nome do plist — `Info.ios.plist`
em vez de `Info.plist` (§6).
