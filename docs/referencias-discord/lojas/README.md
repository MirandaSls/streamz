# Referências das lojas de apps — Discord

Screenshots oficiais do Discord nas lojas, coletados em 11/09/2026 (app iOS 344.1).
Cada imagem tem uma entrada em `manifesto.json`, com campos extras: `descricao` (o que
aparece de fato na tela), `largura`/`altura`, `sha1`, `data_captura`, `observacao` e,
quando o mesmo arquivo aparece em outra vitrine, `tambem_em`.

**Total: 56 imagens únicas (142 MB), sem duplicata por SHA-1.**

## Fontes varridas

| Fonte | Como | Resultado |
|---|---|---|
| App Store US — `apps.apple.com/us/app/…/id985746746` | JSON `serialized-server-data` da página + API `itunes.apple.com/lookup` | iPhone 6,5" (6 + quadro do vídeo de prévia) e iPad 12,9" (6 + 1 variante que só aparece no lookup) |
| App Store BR — `/br/` | mesmo caminho | iPhone com arte **em pt-BR** (6). O iPad e o quadro do vídeo são os mesmos arquivos em inglês (registrados em `tambem_em`) |
| Google Play `hl=en` e `hl=pt_BR` | bloco `ds:5` do HTML, imagens com `=s0` (original) | en: 6 de celular + 6 em paisagem 1920x1080 (layout de tablet). pt_BR: só as 6 de celular |
| Microsoft Store — `apps.microsoft.com/detail/xpdc2rh70k22mn` | API `storeedgefd.dsx.mp.microsoft.com/v9.0/products/XPDC2RH70K22MN` | 6 imagens 3840x2160. A lista de `market=BR&locale=pt-br` é idêntica |
| Wayback Machine (App Store US) | CDX + HTML das capturas; a imagem original ainda é servida ao vivo pelo mzstatic | uma captura por ano: 07/2023 (6), 04/2024 (5), 04/2025 (1) |

Resolução máxima: no mzstatic, `{w}x{h}bb.png` com as dimensões originais (pedir mais,
por exemplo `9999x9999bb`, devolve o mesmo arquivo; o caminho sem `/thumb/` não existe).
No play-lh, `=s0` e `=w2560` dão o mesmo PNG original.

## Pastas

- `appstore-iphone-en-us/` (7, 1284x2778) e `appstore-iphone-pt-br/` (6). O `02` de uma é
  a mesma tela do `02` da outra; a pt-BR começa em `02` porque o `01` (quadro do vídeo) é
  o mesmo arquivo da US.
- `appstore-ipad-en-us/` (7, 2732x2048)
- `googleplay-android-celular-en-us/` e `-pt-br/` (6 cada, 1242x2208)
- `googleplay-android-tablet-en-us/` (6, 1920x1080)
- `microsoftstore-windows-en-us/` (6, 3840x2160)
- `appstore-iphone-en-us-wayback2023/`, `-wayback2024/`, `-wayback2025/` (campo `data_captura`)

## O que as imagens mostram

Desde 08/2024 a campanha é a mesma nas três lojas, com seis quadros: *Group chat that's
fun*, *Stream together*, *See what's happening*, *Hop in whenever*, *Watch, chat and play*
e *Wherever you game*. As telas por trás deles:

1. canal de texto + composer + seletor de emoji (bottom sheet com abas Emoji/GIFs/Figurinhas);
2. chamada de voz com grade de câmeras, tile de Go Live ("Watch Stream") e barra de controles;
3. lista de DMs com rail de servidores, DM em grupo com atividade e seletor de status;
4. lista de canais do servidor com prévia de canal de voz (selo LIVE) e sheet "Join Voice";
5. chamada com atividade embutida ("Join Activity");
6. arte hero: monitor com o **cliente desktop** + celular num Go Live.

Legendas em pt-BR (App Store BR e Play pt_BR): "Bate-papo em grupo legal", "Transmitam
juntos", "Atualize-se", "Entre quando quiser", "Assista, bata papo e jogue", "Onde estiver
jogando". Dentro da UI também aparecem: "Enviar Emoji", "Assistir à transmissão",
"Adicionar amigos", "Entrar na chamada de voz", "Juntar-se à atividade", "AO VIVO" e
"Figurinhas". É uma boa fonte de microcopy.

Evolução pelo Wayback:
- **2023:** UI mobile antiga, com barra de 5 abas, lista de membros por cargo, sheet de
  voz e o painel do canal (Search/Pins/Notification/Settings).
- **2024:** a primeira arte com o **tema claro** (lista de canais com banner e barra de
  abas Servers/Messages/Notifications/You), mais Go Live e a atividade Putt Party.
- **2025:** já é a arte atual. A única diferença é a variante "GameHere" no lugar da hero.

## Cobertura: plataforma × grupo de tela

Contagem de imagens em que o grupo aparece. `tablet` é o layout de tela larga do app
mobile (iPad e Android). O que está em `desktop` são as artes hero: a UI é real, mas vista
em perspectiva.

| Grupo | ios | android | tablet | desktop | web / web-mobile |
|---|---|---|---|---|---|
| autenticação | — | — | — | — | — |
| home (DMs, status) | 2 | 2 | 3 | — | — |
| servidor — rail/canais/texto | 7 | 4 | 6 | 11 | — |
| servidor — canal de voz | 5 | 2 | 3 | — | — |
| servidor — lista de membros / cabeçalho | 2 | — | — | 9 | — |
| servidor — thread/fórum/palco/eventos/onboarding | — | — | — | — | — |
| chat — composer/emoji | 4 | 2 | 3 | — | — |
| chat — menções/embeds/reações | 2 | — | — | 2 | — |
| voz e vídeo — grade/painel/Go Live/atividades | 7 | 4 | 6 | 9 | — |
| perfil — status/presença | 2 | 2 | 3 | 1 | — |
| mobile — barra de abas / bottom sheets | 7 | 4 | 3 | — | — |
| configurações (usuário, servidor, canal) | — | — | — | — | — |
| modais / descoberta | — | — | — | — | — |

Plataforma: ios 20, tablet 15, desktop 11, android 10. Tema: 54 escuros, 2 claros
(ambos da arte de 2024).

## Lacunas

- **Nenhuma screenshot real do cliente Windows/Mac.** A Microsoft Store usa a mesma arte
  do app mobile em layout de tablet. O único desktop é a arte hero em perspectiva; a
  melhor versão é `microsoftstore-windows-en-us/06.png`, em 4K, onde cabeçalho do canal,
  lista de membros com atividades e o painel "Voice Connected" ficam legíveis. Não há app
  do Discord na Mac App Store, e a página iOS não traz screenshots de Mac nem de Vision.
- **O Google Play não separa tablet de Chromebook.** Na página web, os chips
  Phone/Tablet/Chromebook filtram só as avaliações. Testei os UAs de Android, tablet e
  ChromeOS e o carrossel é sempre o mesmo. O conjunto 1920x1080 foi classificado como
  `android-tablet` pelo layout, e isso é inferência. A versão pt_BR não tem esse conjunto.
- **A arte do Android é a mesma do iOS.** O conjunto de celular do Play repete a
  composição do iPhone de 5,5" e não mostra nada específico do Android (UI nativa,
  notificação, widget).
- **O iPad não tem arte em pt-BR.** Na App Store BR ele aparece em inglês.
- **Grupos inteiros ausentes:** autenticação, configurações de usuário, servidor e canal,
  modais, descoberta, thread, fórum, palco, eventos, busca, caixa de entrada, enquete,
  soundboard, perfil completo e onboarding do app. Loja só mostra o que vende: chat,
  voz, vídeo e atividades.
- **Quase nada em tema claro.** Só 2 imagens, ambas de 2024.
- **Deixado de fora de propósito:** o conjunto de iPhone 5,5" da API de lookup (a mesma
  arte do 6,5", em resolução menor), as 6 reexportações do iPad no lookup (quase idênticas
  às da página), a feature graphic do Play (1024x500, só logo e mascote), o quadro do
  vídeo de 2023 ("Imagine a place", só ilustração) e as imagens da captura de 2025 que
  repetem a arte atual.
- **Vídeos não baixados:** App Preview em HLS (`video_url` no manifesto) e o vídeo do
  YouTube `UHPZHtLElfY` do Play.
