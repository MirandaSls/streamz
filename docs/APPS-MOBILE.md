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
12. [A chamada em segundo plano no Android](#12-a-chamada-em-segundo-plano-no-android)
13. [O áudio no Android: por que não saía som](#13-o-áudio-no-android-por-que-não-saía-som)
14. [O ícone do launcher no Android](#14-o-ícone-do-launcher-no-android)

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

O Bloco 2 deixou uma pendência declarada em voz alta: as permissões
`FOREGROUND_SERVICE*` estavam no manifesto e **o serviço nativo não existia**,
então minimizar o app durante uma chamada derrubava o áudio. Isso foi fechado
depois, num PR próprio — ver §12.

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
`apps/desktop/CONTRATO-MOBILE.md` §8 dizia `Info.plist`; foi corrigido para
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

## 12. A chamada em segundo plano no Android

### O problema, e por que ele não se resolve na web

O Android não deixa um app em segundo plano segurar o microfone nem tocar áudio
indefinidamente. Apertar Home no meio de uma call derruba a captura em alguns
segundos e o WebView é estrangulado logo depois: o usuário some da sala sem
nunca ter pedido para sair. Nenhuma configuração de webview, nenhum
`wakeLock` de JavaScript e nenhum truque de `<audio>` contorna isso — o
contrato do sistema é explícito e tem um preço único: **enquanto houver uma
notificação persistente de um serviço de primeiro plano, o processo é
intocável**.

Por isso a notificação não é enfeite. Ela é a contrapartida.

### As peças

| arquivo | papel |
|---|---|
| `gen/android/…/dev/streamz/app/ChamadaService.kt` | o `Service`. Sobe com `ServiceCompat.startForeground`, escreve a notificação persistente e a derruba no `parar` |
| `gen/android/…/dev/streamz/app/ChamadaPlugin.kt` | a ponte Kotlin, no formato de plugin Tauri 2 mobile (`@TauriPlugin`/`@Command`/`@InvokeArg`). É quem pede `POST_NOTIFICATIONS` |
| `src-tauri/src/chamada.rs` | o lado Rust do plugin, **inteiro** atrás de `#[cfg(target_os = "android")]` |
| `src-tauri/build.rs` | o `InlinedPlugin` que gera a ACL `chamada:default` que a `capabilities/mobile.json` lista |
| `gen/android/…/res/drawable/ic_notificacao_chamada.xml` | o ícone pequeno, vazado — um PNG opaco viraria um quadrado branco na barra de status |
| `apps/web/stores/servico-de-chamada.ts` | a decisão pura de quando ligar e desligar, com teste |

A superfície de comandos está em `apps/desktop/CONTRATO-MOBILE.md` §7.

### As três decisões que mais custaram

1. **`foregroundServiceType="microphone|mediaPlayback"`, os dois.** A partir do
   Android 14 (API 34) o serviço declara o *tipo* e o sistema confere contra a
   permissão `FOREGROUND_SERVICE_*` correspondente — faltando uma, o app cai com
   `SecurityException`. Uma call é as duas coisas: captura (microfone) e
   reprodução (a voz dos outros). Declarar só `microphone` deixaria o áudio
   remoto sujeito ao corte, que é metade do defeito de volta.
2. **`startService`, não `startForegroundService`.** Quem liga o serviço é o
   webview no instante em que a call conecta, ou seja, com o app na frente — e
   aí a partida é permitida sem o contrato dos 5 segundos. Estourar aquele prazo
   mata o app com `ForegroundServiceDidNotStartInTimeException`.
3. **Negar a notificação não derruba a call.** No Android 13+ `POST_NOTIFICATIONS`
   é permissão de tempo de execução, pedida na primeira chamada. Se o usuário
   recusar, o serviço **sobe do mesmo jeito** e o que se perde é o aviso na tela.
   A permissão governa a notificação, não o direito de continuar capturando.

E uma quarta, do lado da web: **`status: "error"` não desliga o serviço.** A
queda de mídia (`RoomEvent.Disconnected`) deixa o `channelId` de pé, com o
`reconnect()` a caminho; desligar ali faria a notificação piscar a cada
reconexão e — pior — entregaria o processo ao sistema justamente no momento em
que ele precisa de fôlego para voltar. Quem desliga é o `channelId` zerar, que
é por onde passam os sete motivos de saída de `voice-saida.ts`.

### O que foi provado, e como

Emulador **Android 14 (API 34)**, imagem `google_apis` x86_64, com `/dev/kvm`
neste servidor — API 34 importa porque é a versão que passou a exigir o
`foregroundServiceType`. O `.apk` é um **debug** do mesmo commit, apontado para
uma API e um LiveKit **descartáveis** (containers `prova-*`, nada de produção);
o `.apk` de release entregue neste PR aponta para `api.streamz.chat` como
sempre. A saída completa está em
`.claude/saida-android/1.1.1-1c19c00/prova-do-servico.txt` e os prints em
`prints/` ao lado.

1. **`POST_NOTIFICATIONS` é pedida em tempo de execução, na primeira chamada.**
   A permissão foi *revogada* antes do teste; o diálogo do sistema apareceu
   **por cima da call já conectada**, que é exatamente o momento em que o
   plugin a pede (`prints/01-permissao-post-notifications.png`).

2. **O serviço sobe com o tipo certo.** Com a call conectada:

   ```
   * ServiceRecord{a90399e u0 dev.streamz.app/.ChamadaService}
     intent={act=dev.streamz.app.CHAMADA_INICIAR cmp=dev.streamz.app/.ChamadaService}
     isForeground=true foregroundId=42 types=00000082
     foregroundNoti=Notification(channel=chamada-em-andamento ... flags=0x6a
                                 color=0xff9be31f category=call actions=1 ...)
   ```

   `types=00000082` é `0x80 | 0x02` — `MEDIA_PLAYBACK` **e** `MICROPHONE`, os
   dois que o `<service>` do manifesto declara. `flags=0x6a` traz o
   `ONGOING_EVENT` (não dá para dispensar deslizando) e `actions=1` é o "Sair
   da chamada".

3. **Minimizar não derruba mais a chamada.** `KEYCODE_HOME`, 60 s de espera com
   o launcher em primeiro plano, e então:

   ```
   topResumedActivity=...nexuslauncher/.NexusLauncherActivity
   * ServiceRecord{a90399e u0 dev.streamz.app/.ChamadaService}
     isForeground=true foregroundId=42 types=00000082
   LiveKit voice:cmtucr2n... | num_participants: 1 | num_publishers: 1
   ```

   O `num_publishers: 1` é o ponto: não é só a sinalização que sobreviveu — a
   faixa de microfone continua publicada. A notificação na gaveta, com o app em
   segundo plano, está em `prints/02-notificacao-em-segundo-plano.png`.

4. **Voltar não reconecta.** De volta ao app, o cronômetro da call segue
   correndo (`2:03` no print) e o `sid` do participante no LiveKit é o mesmo:
   é a mesma sessão, não uma reconexão silenciosa
   (`prints/03-de-volta-ainda-na-call.png`).

5. **O botão da notificação sai pelo caminho normal.** Tocar em "Sair da
   chamada" com o app em segundo plano:

   ```
   17:45:03  V Tauri/Plugin: pluginId: chamada, command: iniciarServicoDeChamada
   17:45:36  V Tauri/Plugin: pluginId: chamada, command: pararServicoDeChamada
   ChamadaService no dumpsys: 0
   LiveKit ... | num_participants: 0     motivo: CLIENT_INITIATED
   ```

   `CLIENT_INITIATED` é a prova de que quem saiu foi o `disconnect()` da store
   — o Kotlin avisou pelo `Channel`, a web decidiu, e só então a store mandou
   `pararServicoDeChamada`. Se o Kotlin tivesse encerrado por conta própria, o
   LiveKit teria registrado uma queda, não uma saída.

### O que isto ainda não prova

- **Que funciona em aparelho de verdade.** O emulador é `google_apis` x86_64;
  fabricante nenhum entra nessa conta, e Xiaomi, Samsung e Huawei têm cada um a
  sua camada de "otimização de bateria" que mata serviço de primeiro plano em
  situações que o AOSP não mata. É a diferença entre "o Android permite" e "este
  telefone permite".
- **Que a Play aceita.** A partir de 2024 a Play pede justificativa de uso para
  cada `foregroundServiceType` declarado na ficha da loja. É trabalho de
  publicação, não de código.
- **Áudio de verdade.** O emulador não tem microfone físico; o que se prova aqui
  é que a **conexão** e o **serviço** sobrevivem ao segundo plano, não que a voz
  chega do outro lado.

---

## 13. O áudio no Android: por que não saía som

O relato foi curto — "o app mobile não está reproduzindo áudio", no aparelho
real, com o `.apk` 1.1.1 do commit `3e709bc` — e podia ser duas coisas bem
diferentes: a **voz dos outros** na chamada (WebRTC/LiveKit) ou os **sons do
app** (`apps/web/public/sons/*`). As duas foram medidas, uma de cada vez, dentro
do WebView de verdade.

### Como se pergunta ao WebView (e não ao `dumpsys`)

O `.apk` de depuração liga `setWebContentsDebuggingEnabled` — é o `wry` que
faz isso, sob `#[cfg(debug_assertions)]`. Com ele de pé dá para falar com a
página pelo protocolo do DevTools:

```
adb forward tcp:9222 localabstract:webview_devtools_remote_$(adb shell pidof dev.streamz.app)
curl http://127.0.0.1:9222/json          # acha o alvo e o webSocketDebuggerUrl
# e daí Runtime.evaluate no WebSocket
```

É assim que se responde "o `play()` foi aceito?", "`/sons/x.mp3` resolve?" e "o
que os `<audio>` remotos estão fazendo?". Nenhum `dumpsys` responde isso, e sem
isso a investigação vira adivinhação. O §12 provou o **serviço**; isto prova o
**áudio**.

### O que **não** era — e por que vale registrar

| hipótese | resultado | como se sabe |
|---|---|---|
| Permissão de microfone no WebView (`onPermissionRequest`) | **o Tauri já trata** | `RustWebChromeClient.kt` do `wry` pede `RECORD_AUDIO` + `MODIFY_AUDIO_SETTINGS` e só então chama `request.grant(...)`. Com a permissão concedida, `getUserMedia({audio:true})` devolve faixa `live`. Com ela **negada**, o `getUserMedia` fica pendurado esperando o diálogo do sistema — que é o comportamento certo, não um defeito |
| Autoplay recusado sem gesto | **não acontece** | o `wry` monta o webview com `settings.mediaPlaybackRequiresUserGesture = false` (`RustWebView.kt`). Medido na tela de login, **sem um toque sequer**: `play()` aceito, `paused=false`, `currentTime` andando, `readyState=4`. O `--autoplay-policy=no-user-gesture-required` do `lib.rs` é só do WebView2; no Android o equivalente já vem ligado |
| `/sons/*.mp3` não resolve dentro do app | **resolve** | `fetch("/sons/mensagem.mp3")` na origem `http://tauri.localhost` → `200`, `audio/mpeg`, 19 688 bytes |
| CSP bloqueando o LiveKit | **não bloqueia** | `tauri.android.conf.json` não redefine `app.security`: vale a CSP do `tauri.conf.json`, que já lista `wss://livekit.streamz.chat` em `connect-src` e `mediastream:`/`blob:` em `media-src` |
| `AudioContext` suspenso | **não** | `state` = `running` |
| `setSinkId` calando a saída | **não** | `aplicarSaida` já é no-op quando `setSinkId` não existe, que é o caso do WebView |
| `AudioRemotoHost` não montado no shell do celular | **é montado** | `ShellMobile.tsx` renderiza `<VoiceLayer />`, e é ele que traz o `AudioRemotoHost` |

Nenhuma dessas precisava de correção — e é por isso que estão aqui: quem ler
"sem áudio no Android" da próxima vez não precisa refazer o caminho.

### O que era: a **rota** de saída

Sobrou o que nenhum dos sete arquivos do app tocava: o `AudioManager`. Uma
chamada põe o aparelho em `MODE_IN_COMMUNICATION` — é o modo que liga o
cancelamento de eco e o sensor de proximidade — e nesse modo, **sem ninguém
escolher o dispositivo de saída**, o Android manda o som para o *alto-falante de
conversa*: o furinho de encostar no ouvido. Com o telefone na mão, isso é
indistinguível de "não tem áudio".

O `AndroidManifest.xml` já previa exatamente isto quando declarou
`MODIFY_AUDIO_SETTINGS` ("sem ela o áudio sai pelo alto-falante de chamada em
vez do de mídia, que é o relato clássico"). O que faltava era **usar** a
permissão: declarar o direito não muda rota nenhuma.

A correção é `gen/android/…/dev/streamz/app/AudioDaChamada.kt`, ligada e
desligada pelo `ChamadaPlugin` nos mesmos dois pontos do serviço de primeiro
plano (§12) — que são, por construção, exatamente o começo e o fim da chamada
(`decidirServicoDeChamada`).

Três decisões dela:

1. **A lista de rotas vem de `availableCommunicationDevices` (API 31+), não de
   `getDevices`.** Um alto-falante Bluetooth pareado aparece em `getDevices`
   como `TYPE_BLUETOOTH_A2DP`, mas A2DP **não é rota de voz**: em
   `MODE_IN_COMMUNICATION` o sistema não o usa. Um app que olhasse `getDevices`
   e concluísse "tem fone, não mexo" deixaria o som no ouvido justamente para
   quem tem uma caixinha pareada. `availableCommunicationDevices` só lista o que
   serve para conversa. Abaixo da API 31 sobra o `setSpeakerphoneOn`, e aí o
   Bluetooth fica de fora da conta de propósito — sem a API nova não dá para
   saber se o aparelho pareado fala SCO, e chutar que fala é o mesmo erro.
2. **É reversível.** Modo e viva-voz anteriores são guardados e devolvidos no
   `desligar`. O `AudioManager` é um recurso do aparelho inteiro: sair da
   chamada deixando o telefone em modo de conversa estragaria o som do próximo
   app. E o `desligar` é **no-op quando nunca ligamos** — a store manda
   `pararServicoDeChamada` já na carga da web, com `channelId` nulo, e um
   `clearCommunicationDevice()` ali apagaria a escolha de outro app.
3. **Fica no plugin, não no serviço.** Quem tem `Activity` é a `Plugin`; o
   `ChamadaService` continua só com a notificação, que é o que o §12 combinou.
## 14. O ícone do launcher no Android

Relato do usuário, em aparelho de verdade, com o `Streamz_1.1.1_android.apk` do
commit `3e709bc`: *"o app está sem o ícone do Streamz, está com o ícone de
conversa normal"* — um balão liso, sem o "Z".

### O que se mediu antes de mexer

A primeira coisa foi **não acreditar na hipótese**. O `.apk` publicado foi
aberto com `apkanalyzer` e o `android:icon` do manifesto foi seguido até o
bitmap:

```
android:icon="@ref/0x7f0d0000"          → mipmap/ic_launcher
mipmap anydpi-v26 ic_launcher  → res/BW.xml   (adaptive-icon)
  background → @0x7f050064   (color/ic_launcher_background = #FF0B0B0F)
  foreground → @0x7f0d0001   (mipmap/ic_launcher_foreground)
```

Ou seja: o ícone **era o nosso**. O `foreground` do `.apk` bate pixel a pixel
com o do repositório (diferença máxima de 1/255, que é a recompressão do
`aapt`), e o desenho já estava reduzido para a zona segura — alfa de 72 a 360
num quadro de 432, exatamente os 72dp centrais de 108dp.

E, instalado num emulador **Android 14** com o Pixel Launcher, ele **aparecia
certo**: balão limão com o "Z", em cima do Void Ink. As quatro suspeitas
iniciais (adaptive icon apontando para drawable genérico, mipmaps de
placeholder, manifesto no recurso errado, zona segura) estavam todas erradas.

**Isto é o que ficou provado e é preciso dizer com todas as letras: no Android
14 de estoque, o ícone do 1.1.1 já estava correto — o defeito relatado não foi
reproduzido no emulador.**

### A causa, e por que ela não aparece no emulador

O que faltava é uma camada que só entra em cena fora do launcher de estoque: o
**`monochrome`**, dos ícones temáticos do Android 13+.

Quando o app declara essa camada, o launcher usa a silhueta que o app deu.
Quando **não** declara, os launchers que implementam tema de ícone não desistem
— One UI, Nothing OS e as ROMs que copiam o Pixel Launcher sintetizam a
silhueta a partir do `foreground`, achatando tudo que é opaco. E o `foreground`
que estava lá era o **tile inteiro do `.exe`**: um quadrado Void Ink de borda a
borda, com o balão limão dentro e o "Z" pintado em Void Ink por cima do limão.
Tudo opaco. Achatado, isso vira um borrão só — na melhor das hipóteses um balão
liso, sem "Z". Que é, palavra por palavra, o relato.

O Pixel Launcher do emulador `google_apis` não tem o tema de ícone ligável por
`settings put secure theme_customization_overlay_packages` (foi tentado, com
reinício e com `pm clear`: os ícones do Google continuaram coloridos), então
**essa parte é inferência bem fundamentada, não medição**. O que se mediu é o
resto: que a camada faltava, e que agora existe e desenha o "Z".

### O que mudou

| arquivo | mudança |
|---|---|
| `res/drawable/ic_launcher_monochrome.xml` | **novo**. A silhueta, com o "Z" vazado por `fillType="evenOdd"` |
| `res/mipmap-anydpi-v26/ic_launcher.xml` | ganhou o `<monochrome>` |
| `res/mipmap-anydpi-v26/ic_launcher_round.xml` | **novo**. O mesmo ícone adaptativo sob o segundo nome |
| `AndroidManifest.xml` | ganhou `android:roundIcon="@mipmap/ic_launcher_round"` |
| `res/mipmap-*/ic_launcher_foreground.png` | refeitos: **só o símbolo**, sobre alfa |
| `res/mipmap-*/ic_launcher.png` e `_round.png` | refeitos nos tamanhos certos |
| `res/drawable/ic_launcher_background.xml` | **apagado** (era a grade verde do template do Android) |
| `res/drawable-v24/ic_launcher_foreground.xml` | **apagado** (era o robozinho do Android) |

Quatro decisões que valem explicação:

1. **O `foreground` deixou de carregar o fundo.** O contrato do ícone adaptativo
   é que o chão vem da camada `background` — que aqui é a cor da marca, chapada.
   Pôr o tile opaco na camada da frente quebra o efeito de profundidade (o
   launcher move e amplia as duas camadas em ritmos diferentes ao tocar no
   ícone) e, principalmente, é o que faz a silhueta sintetizada virar um bloco.
   Agora o `foreground` é só o símbolo, com alfa em volta.

2. **O tamanho do símbolo é o do tile da marca, não o da zona segura.** A
   tentação é encher os 72dp garantidos. Não se deve: o launcher **amplia**
   esses 72dp para preencher o espaço do ícone, então encher a zona segura
   entrega um balão colado na borda da máscara. O ponto limão mais distante do
   centro está a 37,73% da largura no `icon.png`; `0,3773 × 72 = 27,2dp` é o
   raio que reproduz a mesma proporção — 76% do raio de 36dp da zona segura.

3. **O "Z" do `monochrome` não são as três peças da marca empilhadas.** Sob
   `evenOdd`, as sobreposições entre as duas barras e a diagonal voltariam a
   ficar cheias e o "Z" sairia rendilhado. O que está no arquivo é o contorno da
   união das três, calculado uma vez.

4. **O `roundIcon` não é enfeite.** O One UI e boa parte das ROMs chinesas pedem
   essa variante; sem o recurso, ela cai no PNG de legado — bitmap chapado, sem
   máscara e **sem `monochrome`**, ou seja, exatamente o defeito de volta em
   metade dos aparelhos. Por isso ele existe e aponta para o mesmo
   `adaptive-icon`.

O `mipmap-hdpi/ic_launcher.png` e o `_round.png` estavam em **49×49** em vez de
72×72 (os outros quatro buckets estavam certos: 48/96/144/192). Não é o defeito
relatado — hdpi hoje é aparelho de museu — mas era um borrão esperando um
aparelho antigo, e saiu junto.

### O que ficou de fora, de propósito

- **`apps/desktop/src-tauri/icons/` não foi tocado.** É de onde sai o `.ico` do
  instalador do Windows, e este PR não tem nada a dizer sobre o `.exe`. Fica
  registrada uma dívida: o `icons/android/mipmap-*/ic_launcher_foreground.png`
  ainda é o desenho antigo (o tile cheio), então **rodar `tauri icon` de novo
  reintroduz o defeito** por cima do `gen/android`. Quem fizer isso precisa
  refazer os `foreground` — o script que os gera está descrito acima e é
  reprodutível a partir de `docs/branding/marca/icone-app-1024.svg`.
- **O `ic_notificacao_chamada.xml` não mudou.** Foi rasterizado e conferido: já
  é branco com alfa e com o "Z" vazado, que é o que a barra de status exige
  (§12). Estava certo.
- **O `manifest.webmanifest` do PWA não mudou.** As duas famílias (`any` e
  `maskable`) já estão lá, com o símbolo dentro do círculo de 80% do spec —
  a conta está comentada em `apps/web/app/manifest.ts`. Estava certo.

### O que isto não prova

- **Que o aparelho do usuário voltou ao normal.** O que se provou é o Android 14
  de estoque, no emulador. A camada `monochrome` que fecha a hipótese do tema de
  ícone não pôde ser exercitada aqui (o launcher do emulador não liga o tema), e
  One UI/MIUI não entram em conta nenhuma deste servidor.
- **Que o launcher do aparelho vai largar o ícone velho.** Launcher guarda
  bitmap em cache. Se depois de instalar continuar errado, reinstalar ou
  reiniciar o aparelho é parte do teste, não sinal de que o pacote está errado.
