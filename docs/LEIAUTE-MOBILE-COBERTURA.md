# Cobertura do leiaute mobile — varredura de 2026-09-08

> **Revisado depois de mesclar a base.** A `feat/layout-mobile` andou quatro
> commits depois desta varredura e consertou três coisas que estavam anotadas
> aqui como buraco: o toque longo passou a valer no app inteiro (§6.1), tocar
> num canal de voz passou a abrir o palco, e o desligar da quarta coluna no
> celular virou atribuição. As linhas afetadas foram reescritas e dizem o que
> mudou; nada foi apagado sem registro.

O app inteiro percorrido num **iPhone 14 emulado (390×844 @3×, `isMobile` +
`hasTouch`)** contra a branch `feat/layout-mobile`, tela por tela. Cada linha
diz o que está de pé, o que está pela metade e o que não existe no celular —
e, quando o defeito é de outra pessoa, de quem é o arquivo.

**Como foi medido.** Chromium do Playwright no perfil `iPhone 14` do
`scripts/e2e-mobile.mjs`, com um sonar por tela que lê do DOM: `scrollWidth`
contra `clientWidth` da página, todo elemento cuja caixa passa da borda da
tela (ignorando o que está dentro de um rolador horizontal deliberado), todo
alvo interativo com menos de 44px de lado, todo campo de texto com fonte menor
que 16px e todo elemento cuja visibilidade depende de `:hover`. Cada tela tem
uma PNG, e **todas foram olhadas** — foi olhando que apareceram a barra de
ações flutuando sobre a mensagem e o corpo das configurações espremido em 28px,
que nenhum número teria contado sozinho.

**Convenções desta tabela**

| símbolo | quer dizer |
|---|---|
| **ok** | cabe em 390px, sem rolagem horizontal, sem depender de hover ou de botão direito, alvos de toque no padrão do shell |
| **parcial** | funciona, mas falta alguma coisa — está dito qual |
| **não** | não existe no celular, ou está quebrada a ponto de não dar para usar |
| **n/a** | não se aplica ao celular (é do desktop/Tauri) |

**A variante `celular:`.** Os consertos deste PR não são JS: são classes com
o prefixo `celular:`, uma tela ("screen") `raw` do `tailwind.config.ts` que
repete **exatamente** a `CONSULTA_MOBILE` do `hooks/useEhMobile` —
`(max-width: 767px), (pointer: coarse) and (max-height: 599px)`. Começaram como
`max-md:`, e isso deixava o **telefone deitado** de fora: 844×390 é celular
para o hook (ponteiro grosso, 390 de altura) e desktop para o `max-md`, ou seja,
girar o aparelho devolvia os alvos de 31px e o cartão de login sem área segura.
Conferido nos dois sentidos: em 390×844 e em 844×390 o campo de login mede 47px
com fonte de 16, a busca da lista de conversas 43, as abas de Amigos 43, a
linha de membro 60 e o chip de reação 44.

**Sobre os 43px.** O shell do celular usa `h-11` para os botões de cabeçalho, e
com a base de 15,5px do `html` isso dá **42,6px**, não 44. A varredura reporta
esses botões como "abaixo de 44", mas eles são a convenção do próprio shell
(`BotaoDeToque` em `components/mobile/pecas.tsx`) e os consertos deste
documento seguiram a mesma medida, para não criar um segundo padrão de 1px de
diferença. Se a decisão for subir para 44, é uma linha em `pecas.tsx` e vale
para todos.

---

## 1. Telas de fora do app (não passam pelo shell mobile)

Todas usam a mesma moldura, `components/auth/AuthCard.tsx` — menos o convite,
que tem a sua.

| tela | arquivo | antes | agora | o que faltava |
|---|---|---|---|---|
| Login | `app/login/page.tsx` | parcial | **ok** | `min-h-screen` (= `100vh`) media a janela sem a barra de endereço; campos de 40px e botão de 43 com texto de 16px; sem área segura |
| Login — 2º passo (2FA) | idem | não avaliado | não avaliado | a conta semeada não tem 2FA; herda a moldura corrigida |
| Registro | `app/register/page.tsx` | parcial | **ok** | idem login (quatro campos de 40px) |
| Esqueci a senha | `app/forgot-password/page.tsx` | parcial | **ok** | idem |
| Redefinir senha | `app/reset-password/page.tsx` | parcial | **ok** | idem |
| Verificar e-mail | `app/verify-email/page.tsx` | parcial | **ok** | idem |
| Download | `app/download/page.tsx` | parcial | **ok** | os três botões de sistema em 39px |
| **Convite** | `app/invite/[code]/AceitarConvite.tsx` | **não** | **ok** | **a página rolava 436px numa tela de 390** e o botão "Entrar para aceitar o convite" saía pela direita: `w-[420px] max-w-full` dentro de um `grid place-items-center` não é limitado pela tela |
| Convite inválido | idem | **não** | **ok** | mesmo estouro |
| Raiz (`/`) | `app/page.tsx` | ok | ok | redireciona para o login |
| Link de mensagem | `app/app/channels/.../[messageId]` | não avaliado | não avaliado | redireciona para `/app`; a tela final é a do canal |
| Splash | `app/splash/page.tsx` | n/a | n/a | janela de 300×350 do Tauri |

## 2. Shell de abas — as quatro bases

| tela | arquivo | estado | o que falta |
|---|---|---|---|
| Servidores (rail + canais) | `components/mobile/telas-base.tsx` + `layout/GuildRail.tsx` + `layout/ChannelSidebar.tsx` | parcial → **ok** | os botões por linha (convite, editar, abrir conversa) e a engrenagem da categoria continuam sendo de `hover`, mas **as mesmas ações estão no menu de toque longo**, que a base passou a ligar no shell inteiro (§6.1) — conferido: segurar a linha de `#geral` abre a folha com sete itens. A linha de canal fica em 35px, que é a medida do próprio Discord no telefone (`MEDIDAS.md` §5: 36pt) |
| Mensagens (lista de conversas) | `layout/DMList.tsx` | parcial → **ok** | campo de busca de 31px e o "+" de nova conversa com 20×20 — os dois em 44 agora. O "X" de fechar conversa continua `opacity-0` até o hover, mas "Fechar conversa" está no menu de toque longo da linha (§6.1) |
| Notificações (caixa de entrada) | `chat/InboxPopover.tsx` (`modoTela`) | parcial → **ok** | "Marcar tudo como lido" e a pílula de pedidos mediam 31px |
| Você | `components/mobile/telas-base.tsx` | **ok** | — (os dois botões de microfone/áudio ficam em 43px, a convenção do shell) |

## 3. Telas empilhadas

| tela | arquivo | antes | agora | o que faltava |
|---|---|---|---|---|
| Canal de texto | `chat/ChatView.tsx` + `MessageList` + `MessageItem` | parcial | **parcial** | a barra de ações do hover não existe no dedo — coberta pelo menu de toque longo (§4); busca, fixados e threads não têm entrada no celular (§5) |
| **Conversa direta** | `chat/DMView.tsx` | **não** | **ok** | **o cartão de perfil de 320px era montado como coluna dentro da tela de 390 e espremia a conversa em 70px** — a timeline e o composer ficavam ilegíveis. A coluna 4 agora só existe no desktop; no celular ela é o painel deslizante |
| **Amigos** | `friends/FriendsPage.tsx` | **não** | **ok** | **o cabeçalho media 553px numa tela de 390** e o shell o cortava: "Adicionar amigo" saía pela metade e as abas "Pendente" e "Bloqueado" ficavam inteiramente fora da tela, sem nenhum jeito de alcançá-las |
| Palco da chamada | `components/mobile/telas-de-conversa.tsx` + `VoicePanel` | **não** (não chegava lá) | **ok** (com o #180) | a base consertou o caminho: tocar num canal de voz abre o palco, com a grade e o botão para a conversa do canal no cabeçalho (`tela-de-voz-retrato.png`). Medi o palco **sem** o trabalho da chamada e anotei que faltava a barra de controles — era o `VoiceControls` do desktop, que se esconde por inatividade. **Resolvido no #180**, que põe um `ControlesMobile` de 68pt com seis botões (mudo, fone, câmera, tela, sons, desligar), a medida do `MEDIDAS.md` §12. Não reabrir |

## 4. Mensagem (`components/MessageItem.tsx`)

| item | antes | agora | observação |
|---|---|---|---|
| Menu por toque longo | ok | ok | traz reagir (4 rápidas), adicionar reação, editar, fixar, responder, encaminhar, criar tópico, apagar — a folha inferior com itens de 43px |
| Barra de ações do hover | **defeito** | **ok** | ela é `hover`, mas `group-focus-within` a fazia **aparecer sozinha** depois de qualquer toque que desse foco dentro da mensagem, com sete botões de 27px flutuando sobre o texto (na PNG `enquete-na-conversa.png` dá para ver). No celular ela agora não existe: as ações estão no menu de toque longo |
| Chips de reação | parcial | **ok** | mediam ~26px de altura; agora 44 (`min-height`, que preserva quem aumentou o tamanho do emoji nas configurações) |
| "+" ao lado das reações | **não** | **ok** | era `opacity-0` até o hover — no dedo, inexistente. Agora 44×44 e sempre visível |
| Botão de thread na mensagem | parcial | **ok** | 22px de altura; agora 44 |
| Carimbo de hora (mensagem seguida) | parcial | parcial | continua `opacity-0` até o hover. É decorativo: a hora completa está na dica e no menu |
| Enquete (`polls/PollCard.tsx`) | parcial | **ok** | as opções em 39px (agora 48) e "Quem votou"/"Encerrar" com **16px de altura** (agora 44) |
| Dica de ferramenta (`ui/Tooltip.tsx`) | **defeito** | **ok** | `pointerenter` dispara no toque e o `pointerleave` que a fecharia pode só chegar no próximo toque: um toque no carimbo de hora deixava a caixa "terça-feira, 8 de setembro de 2026 às 17:14" **parada sobre a conversa**. Agora a dica só nasce de ponteiro do tipo mouse (e de foco que não veio de toque) |

## 5. Painéis laterais e de cabeçalho

| painel | arquivo | estado | o que falta |
|---|---|---|---|
| Lista de membros do canal | `components/MemberList.tsx` | parcial → **ok** | linha de 42px (o Discord do celular usa **60** — `docs/Reference/mobile/MEDIDAS.md` §10) e as ações só no hover. Agora: linha de 60, "Mensagem" sempre visível em 44px. Castigo, expulsar e banir ficam escondidos no celular de propósito — quatro botões de 44 numa faixa de 335 truncavam o nome em "betoxip…"; eles continuam no menu de contexto, que ainda depende do toque longo (§6.1) |
| Perfil do contato em DM | `chat/DMProfilePanel.tsx` | parcial → **ok** | os dois discos do canto ("adicionar amigo" e "…") mediam 30px; "Ver Perfil Completo" 39px. Agora 44 e 48, com a área segura no rodapé |
| Participantes do grupo | `chat/DMMemberList.tsx` | parcial → **ok** | mesma linha de 42px e "remover do grupo" só no hover. **Não visto rodando**: a semente não tem grupo; a correção é a mesma do `MemberList`, por simetria |
| **Busca de mensagens** | `chat/SearchPanel.tsx` | **não** | não é montado no celular. Ele é irmão do `<main>` em `app/app/page.tsx`, que o shell mobile substitui; e o botão que o abre vive no `HeaderBar`, que fica oculto (`incorporado`/`semCabecalho`). §6.2 |
| **Thread** | `chat/ThreadPanel.tsx` | **não** | idem. O menu de toque longo abre "Criar Tópico", mas o painel resultante não tem onde aparecer |
| **Fixados** | `chat/PinsPopover.tsx` | **não** | só existe dentro do `tools` do `HeaderBar`, oculto no celular |
| **Threads (lista)** | `chat/ThreadsPopover.tsx` | **não** | idem |
| Caixa de entrada (popover) | `chat/InboxPopover.tsx` | n/a | no celular ela é a aba Notificações (`modoTela`), não um popover |

## 6. Menus, folhas e o que abre cada um

| superfície | arquivo | estado | observação |
|---|---|---|---|
| Menu do servidor | `layout/ChannelSidebar.tsx` + `ui/ContextMenu.tsx` | **ok** | folha inferior, itens de 43px: convidar, configurações, criar canal, criar categoria, silenciar, notificações |
| Menu do canal | idem | parcial → **ok** | a folha sempre esteve certa (marcar como lido, convidar, copiar link, silenciar, editar, apagar); o que faltava era o gesto. A base pôs o toque longo no shell inteiro — conferido depois do merge: segurar a linha do canal abre a folha com **sete** itens |
| Menu da mensagem | `ui/ContextMenu.tsx` + `AreaDeToqueLongo` | **ok** | as 4 reações rápidas mediam 31px de largura; a base as levou a 44 no mesmo commit do toque longo |
| Menu do membro | `MemberList.tsx` | **não** → **ok** | mesmo caso do menu do canal: o gesto passou a existir |
| Menu do "+" do composer | `chat/Composer.tsx` | **ok** | "Enviar arquivo" e "Criar enquete", 43px |
| Emoji / GIF / Figurinha | `media/PickerPanel.tsx` | **parcial** | o painel mede 424px e nasce **44px à esquerda da tela** — sai pelos dois lados. Arquivo do agente dos modais |
| Cartão de perfil | `ui/ProfilePopover.tsx` | **parcial** | itens de 31px de altura e o "…" em 27px. Arquivo do agente dos modais |
| Trocador rápido (Ctrl+K) | `ui/QuickSwitcher.tsx` | **parcial** | a caixa cabe e as linhas medem 39px, mas **não há como abri-lo no celular**: o gatilho é um atalho de teclado |
| Avisos (`Toasts`) | `ui/Toasts.tsx` | não avaliado | nenhum toast disparou na varredura |

### 6.1 O toque longo — o buraco que a base fechou

Quando esta varredura foi feita, `AreaDeToqueLongo` envolvia só o
`ChatView`/`DMView` e ignorava qualquer `button`. Consequência: **todo menu de
contexto de lista ficava sem gesto que o abrisse num telefone** — canal,
categoria, conversa da lista de DMs, membro. Como as mesmas ações também moram
em botões de `hover`, elas sumiam duas vezes: editar canal, criar convite do
canal, apagar canal, editar categoria, fechar conversa, marcar como lida,
silenciar, castigar, expulsar, banir, denunciar.

O commit `0b5209d` da base resolveu: a área de toque longo passou a envolver o
shell inteiro e o filtro deixou de ignorar botões — só campo de texto continua
de fora, porque lá o gesto é do cursor. Conferido depois do merge, em retrato e
em paisagem: segurar a linha de `#geral` abre a folha do canal com sete itens.

Fica registrado o **porquê de não ter enchido as listas de botões**: numa faixa
de 390px, três ou quatro alvos de 44 por linha truncam o nome do canal e do
membro (medido: "betoxip…"), e não é o que o Discord do celular faz — lá o
gesto é o toque longo. Foi por isso que na lista de membros só "Mensagem" ficou
sempre visível e a moderação continuou no menu.

### 6.2 Defeitos nos arquivos dos outros (relatados, não consertados)

Três itens que esta varredura tinha listado aqui **saíram da lista**: a base os
consertou nos commits `0b5209d` e `2c5d583` — o toque longo no shell inteiro
(§6.1), o canal de voz que abria a tela de texto em vez do palco
(`aoTocarNaLista` lia a store na fase de captura), e o `membersOpen` que era
alternado em vez de atribuído. As reações rápidas do menu-folha também foram de
31 para 44px. O que sobra:

| onde | o que acontece | de quem |
|---|---|---|
| `components/ui/JanelaDeConfiguracoes.tsx` | **as configurações são inutilizáveis no celular**: o menu de 252px come dois terços da tela e o corpo fica com ~28px de largura — o campo "Nome do canal" mostra uma letra por linha, o parágrafo do modo lento sai uma palavra por linha. Vale para configurações do usuário, do servidor, do canal e da categoria (PNGs `configuracoes.png`, `config-servidor.png`, `config-canal.png`) | agente dos modais |
| `components/media/PickerPanel.tsx` | painel de 424px ancorado 44px fora da tela à esquerda; a busca de GIF fica cortada nos dois lados (`gif-picker.png`) | agente dos modais |
| `components/ui/ProfilePopover.tsx` | itens de menu com 31px e o "…" com 27px (`perfil-popover.png`) | agente dos modais |
| `components/modals/*` (moldura `Dialog`) | a caixa em si está certa (375px de largura, áreas seguras) — o que está pequeno é o conteúdo: o "X" de fechar em 23px e os botões de rodapé em 39px, em todos os modais (`modal-convite.png`, `modal-criar-canal.png`, `modal-nova-conversa.png`, `modal-quem-votou.png`) | agente dos modais |
| `components/modals/CreatePollModal.tsx` | os campos de pergunta e resposta ficam com 22px de altura e os botões de emoji com 31px (`criar-enquete.png`) | agente dos modais |
| `components/mobile/telas-de-conversa.tsx` | o cabeçalho de 48px do canal só tem "voltar" e "membros" — busca, fixados e threads não têm entrada nenhuma no celular (§5). Continua valendo depois do merge | dono do shell |
| `components/chat/Composer.tsx` (compartilhado) | os três botões do composer ("+", GIF, emoji) medem 39px | combinar |
| `components/voice/**` | o palco abre (depois do merge) e a grade cabe. A barra de controles que eu tinha anotado como faltando **está no #180** (`ControlesMobile`, 68pt) — não é pendência. Chamada de DM e seletor de tela continuam não avaliados por mim | agente da call (#180) |

## 7. O que este PR consertou

Tudo atrás de `celular:` (a variante que repete a `CONSULTA_MOBILE`, retrato
**e** paisagem) ou de uma condição que só o shell do celular liga. **0 pixels
de diferença no desktop em 1300×900.**

| arquivo | conserto |
|---|---|
| `tailwind.config.ts` | a variante `celular:` — uma tela `raw` com a mesma consulta do `hooks/useEhMobile`, para as classes perguntarem o mesmo que o JS (e não perderem o telefone deitado) |
| `app/invite/[code]/AceitarConvite.tsx` | `w-full max-w-[420px]` no lugar de `w-[420px] max-w-full` (fim do estouro de 46px), `100dvh`, áreas seguras, botão de 48 |
| `components/auth/AuthCard.tsx` | `100dvh`, áreas seguras no padding e na marca, cartão com 24px de respiro, campos e botão de envio em 48px — vale para login, registro, esqueci/redefinir senha, verificar e-mail e download |
| `app/download/page.tsx` | os três botões de sistema em 48px |
| `components/friends/FriendsPage.tsx` | cabeçalho que **rola na horizontal** no celular, sem a identidade (já está no cabeçalho da tela) e sem o grupo da direita (a caixa de entrada é uma aba; "nova conversa" é o "+" da lista); abas e "Adicionar amigo" em 44px; busca em 48 |
| `components/friends/FriendRow.tsx` | ações da linha (mensagem, aceitar, recusar, "…") de 35 para 44px, com recuo menor para o nome caber |
| `components/friends/AddFriend.tsx` | campo e botão empilhados em 44px cada (lado a lado sobrava menos de 100px para o campo) |
| `components/chat/DMView.tsx` | **a coluna 4 não é montada no celular** — o painel deslizante já é ela |
| `components/MemberList.tsx` | linha de 60px (MEDIDAS §10), "Mensagem" sempre visível em 44, moderação escondida no celular, alvo do perfil na altura toda da linha |
| `components/chat/DMMemberList.tsx` | linha de 60px, "remover do grupo" e "adicionar pessoas" sempre visíveis em 44 |
| `components/chat/DMProfilePanel.tsx` | discos do canto em 44px, "Ver Perfil Completo" em 48 com área segura |
| `components/layout/DMList.tsx` | busca de 31 para 44px, "+" de nova conversa de 20 para 44, linha "Amigos" para 48, cabeçalho para 56 |
| `components/chat/InboxPopover.tsx` | botões do topo da caixa de entrada em 44px |
| `components/MessageItem.tsx` | barra de ações do hover desligada no celular, chips de reação e "+" em 44, botão de thread em 44 |
| `components/polls/PollCard.tsx` | opções em 48px, "Quem votou"/"Encerrar" em 44 |
| `components/permissoes/EditorDePermissoes.tsx` | as duas colunas empilham no celular (a de permissões ficava com ~190px), linhas em 44, "remover regra" sempre visível |
| `components/ui/Tooltip.tsx` | a dica não nasce mais de um toque |

## 8. O que não foi visto

- Aparelho real (só Chromium emulado com `hasTouch`/`isMobile`).
- Android (perfil `Pixel 7` do `e2e-mobile.mjs`) — a varredura toda foi em
  iPhone 14.
- Paisagem: **conferida** para os consertos deste PR (844×390: campo de login
  47px/16px, busca 43, abas de Amigos 43, linha de membro 60, chip de reação
  44), mas a varredura tela a tela da tabela acima foi toda em retrato.
- Grupo de conversa (a semente só tem 1:1), chamada, tela compartilhada.
- Modais que não têm caminho pelo celular: `AddGroupMembersModal`,
  `AdicionarContaModal`, `AdicionarSomModal`, `BanModal`,
  `CategorySettingsModal`, `ChannelAccessModal`, `ChannelTopicModal`,
  `CustomStatusModal`, `GroupSettingsModal`, `GuildEmojisModal`, `ImageModal`,
  `InvitesModal`/`InvitesPanel`, `KickModal`, `RecortarImagemModal`,
  `ReportModal`, `TimeoutModal`, `WelcomeModal`, `PromptDialog`. Todos usam a
  moldura `Dialog`, que o shell já ajustou para a largura da tela; o que vale
  para os medidos (X de 23px, rodapé de 39px) provavelmente vale para eles.
- Segundo passo do login (2FA) e a página de link de mensagem.
