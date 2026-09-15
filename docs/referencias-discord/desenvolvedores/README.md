# Referências da documentação de desenvolvedores do Discord

São 143 capturas da **UI que apps e bots produzem no cliente do Discord**, tiradas do
repositório oficial da documentação,
[`discord/discord-api-docs`](https://github.com/discord/discord-api-docs). Esse
repositório gera o site `https://docs.discord.com/developers/`; o endereço antigo
`discord.com/developers/docs/` redireciona para ele. As capturas servem de base para a
compatibilidade com a API de bots do Streamz.

- `imagens/<assunto>/` guarda as capturas, com nomes descritivos em pt-BR.
- `manifesto.json` tem uma entrada por imagem, com estes campos:
  - `arquivo`
  - `url_origem`: raw do GitHub, fixado num commit
  - `pagina_origem`: página da doc que usa a imagem; `null` quando a imagem é órfã no repositório
  - `contexto`, `plataforma`, `tela` (rótulos do `../TELAS.md`, vários separados por `; `) e `tema`
  - extras: `assunto`, `versao` (`atual` ou `antiga (removida do repositório)`), `bytes`, `largura` e `altura`

## Como foi coletado

- **126 imagens atuais** vieram de um clone raso do repositório no commit
  [`988920b`](https://github.com/discord/discord-api-docs/tree/988920b067aec9bb20859e0dd90673b2aed4b803),
  de 10/09/2026. O repositório tem 376 arquivos de imagem. Ficaram de fora:
  - duplicatas `.png`/`.webp` da mesma imagem (manteve-se a versão que a página usa);
  - diagramas, logos, banners ilustrados;
  - telas de terceiros (Cloudflare, ngrok, Glitch, Unity);
  - slides de design do Social SDK, que mostram UI de jogo, não do cliente.
- **17 imagens antigas** foram recuperadas do histórico git, a partir de um clone sem
  blobs. A maioria saiu no PR #7742 (ago/2025, "Remove unused images"). Estão marcadas
  com `versao: "antiga…"` e o prefixo `antigo-` no nome. O `url_origem` delas aponta
  para o último commit em que existiam. Elas documentam estados antigos da UI, como o
  select no mobile, o "bot está pensando…", o fluxo de compra premium, o banner do
  servidor e o popout de perfil em tema claro.
- Não houve login, conteúdo pago nem dados pessoais: todas as pessoas nas capturas são
  contas fictícias da própria documentação.

## Por assunto

| Assunto | Qtd. | O que tem |
|---|---:|---|
| `comandos/` | 9 | Autocomplete de comando de barra (simples, subcomandos, chips de parâmetro e OPTIONAL), lançador de comandos com trilho de apps, composer com opção preenchida, menus de contexto de **mensagem** e de **usuário** com o submenu Apps, comando Entry Point no App Launcher |
| `componentes/` | 21 | Action Row, estilos de botão (incluindo a tabela antiga **clara e escura**), botão premium, os cinco selects (texto, usuário, cargo, mencionável, canal), **layout v2**: Section + Thumbnail, Text Display, Media Gallery, File, Separator, Container; select antigo no desktop e no **mobile (bottom sheet)** |
| `modais/` | 15 | Modal clássico (text input curto e parágrafo), aviso "This form will be submitted to…", Label, os selects dentro do modal, Checkbox, Checkbox Group, Radio Group, Text Display e File Upload |
| `mensagens-de-bot/` | 9 | Mensagem **efêmera** ("Only you can see this • Dismiss message"), "<bot> is thinking…", resposta de app instalado pelo usuário ("<user> used /game"), anúncio com embeds, enquete, sorteio com botão Claim, leaderboard em markdown, bot temático |
| `atividades/` | 16 | Atividade no palco do canal de voz, botão "Start An Activity" no painel de voz, diálogo de convite, "Share with your friends", modal "HOLD UP" de link externo, modal de aceleração de hardware, card "Join Activity", embed de link de atividade, momento compartilhado no chat |
| `diretorio-de-apps/` | 3 | App Launcher, página de perfil do app no diretório, embed "INVITE APP TO SERVER" |
| `monetizacao/` | 9 | Loja aberta pelo perfil do bot, loja com vários níveis de assinatura, itens avulsos, card de benefícios, embeds de link para SKU e para loja; antigos: modal "App Shop", fluxo de checkout em 3 modais, resposta "requires Premium" |
| `rich-presence/` | 22 | Cards "Playing" em todas as variações (básico, imagens, tooltip, botões, Ask to Join, party, timers), **popout de perfil** com presença, comparações boa/má prática, legenda anotada dos campos, presença de atividade; antigos: popout de perfil em **tema claro** |
| `oauth2-e-cargos-vinculados/` | 6 | **Tela OAuth2 "Authorize"** de app externo (escopos, "Signed in as… Not you?", Cancel/Authorize), modal de autorização de atividade, autorização por QR/código de dispositivo, "Connect your accounts", "<app> connected!", aba **Links** das configurações de cargo |
| `servidor-e-comunidade/` | 15 | Modal "Create Your Server" (templates), habilitar Comunidade, configurações de **Onboarding**, criar evento, Server Insights, ícone de cargo, tópico do canal, modal de convite com cargos, card de convite ("Roles Granted"), convite inválido; antigos: banner do servidor na lista de canais |
| `social-sdk/` | 8 | Convite de jogo no chat e em DM, popup "Connect with…" saindo do painel do usuário, modal de resgatar presente, Configurações > Content & Social > jogos conectados, widget de estatísticas de jogo no perfil |
| `overlay-e-configuracoes/` | 5 | Overlay: convite, modal de voz, widget de voz (antigo); Configurações de voz com dispositivo certificado; GIF do Modo Desenvolvedor em Configurações > Avançado (antigo) |
| `portal-do-desenvolvedor/` | 5 | *Secundário, não é o cliente:* gerador de URL OAuth2, instalação padrão, contextos de instalação (servidor/usuário), toggle de atividades, página de times. Entrou porque a compatibilidade com bots vai precisar de um painel equivalente. |

**Total: 143 imagens (cerca de 28 MB).** Quase tudo está no **tema escuro** (139). Há
3 em tema claro (popouts antigos) e 1 com os dois temas lado a lado (estilos de botão).
Por plataforma, são 136 de desktop (uma delas com a versão mobile ao lado), 6 web/portal e 1 mobile.

## Lacunas: a documentação não tem

- **Tela "Add to Server" do OAuth2 de bot**, com seletor de servidor, lista de
  permissões e captcha. Só aparecem o consentimento de linked roles, a autorização de
  atividade e a de dispositivo.
- **Integrações do servidor**: Configurações do servidor > Integrações, gestão do bot e
  **permissões de comando** por canal/cargo. Não há nenhuma captura.
- **Webhooks**: nem a mensagem de webhook (crachá, nome/avatar sobrescritos) nem a tela
  de criação de webhook.
- **Anatomia de embed clássico** (autor, título, campos inline, thumbnail, imagem,
  rodapé, cor). Só aparecem embeds de passagem, dentro de outras capturas.
- **Autocomplete de opções**: a lista de sugestões que o bot devolve enquanto o usuário
  digita um argumento.
- **Mobile**: só 1 captura de fato mobile (select antigo em bottom sheet), mais a versão
  mobile ao lado da atividade no `activities-hero`. Comandos, modais e componentes no
  iOS/Android ficaram de fora. O `LINKS.md` na raiz aponta Mobbin e Page Flows.
- **Temas do refresh de 2025**: nenhuma captura atual no tema Light, e nenhuma
  identificável como Ash ou Onyx. As escuras são, na maioria, do tema Dark anterior.
- **Perfil do bot no cliente** (popout com "Add App" e comandos), fora do contexto de
  loja; só aparece em `monetizacao/loja-pelo-perfil-do-bot`.
- **Onboarding do servidor visto pelo membro**: só as telas de configuração.
- **Não baixados por tamanho**, mas disponíveis no histórico do repositório:
  - `ask-to-join.gif` (26 MB, fluxo de "Pedir para entrar" da rich presence):
    https://raw.githubusercontent.com/discord/discord-api-docs/95765bbf6428241eea2c699a22180c688a59d93c/static/images/ask-to-join.gif
  - `spectate.gif` (7 MB):
    https://raw.githubusercontent.com/discord/discord-api-docs/95765bbf6428241eea2c699a22180c688a59d93c/static/images/spectate.gif
- As 24 imagens com `pagina_origem: null` são órfãs (o repositório as guarda, mas
  nenhuma página as usa) ou antigas. Por isso o contexto delas veio só da imagem.
