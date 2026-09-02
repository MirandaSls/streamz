# Streamz — sistema de design

Identidade própria desde a **ADR-0004**: paleta ancorada no Void Ink, Volt Lime
como accent, Archivo nos títulos. O pacote de marca está em `docs/branding/`,
onde também estão a origem de cada asset e como regenerar.

O **Discord continua como referência**, mas só de **leiaute e densidade**: três
colunas, alturas, gutter da mensagem, ação no hover. Paridade de paleta,
tipografia e marca deixou de ser meta. Fonte da verdade dos tokens:
`apps/web/tailwind.config.ts` e `apps/web/app/globals.css`.

## Princípios

1. **Escuro por padrão.** `color-scheme: dark`. Sem tema claro no MVP — o Paper
   `#FDFDFB` é cor de texto e de marca, nunca superfície.
2. **Densidade sobre respiro.** Muitas mensagens/canais na tela; padding curto,
   linhas próximas. Não é uma landing page.
3. **Ação no hover, não no layout.** Editar, apagar, reagir, responder aparecem no
   hover da mensagem (`group-hover`) — a linha em repouso mostra só conteúdo.
4. **Cor com parcimônia, e o limão é a mais cara de todas.** O Volt Lime marca
   estado ativo e ação primária; o resto é a escala Void Ink. Texto colorido =
   link ou ação. Três regras que não são preferência, são o sistema:
   - **limão só sobre escuro** — nunca como texto sobre Paper;
   - **texto e ícone sobre `accent` são `accent-ink`**, nunca branco (branco
     sobre Volt Lime dá 1,57:1). Vale também para `green` e `yellow`, que são
     claros; `red` continua com branco. Sobre **véu** (`bg-accent/25`) o fundo
     efetivo ainda é escuro, então ali o texto é claro;
   - **bolinha de status nunca sobre superfície limão** — verde e limão a 10px
     de distância é o choque mais provável desta paleta.
5. **Ícone é SVG, nunca emoji.** Todo ícone entra por
   `components/ui/icones.tsx`, que é o único ponto de importação do app.
   Preenchido, não de traço: o desenho vem do **ativo do próprio Discord**
   (`docs/Reference/Discord assets icons/`, ver `ACERVO.md`) quando existe, e do
   Phosphor com o mesmo nome quando não existe. Emoji só como *conteúdo*
   (reações, texto do usuário).

   Não há mais exceção para marca utilitária. Ela existiu — lupa, `+`, chevrons e
   pontinhos ficavam no Phosphor "porque no Discord são de traço" — e caiu ao
   abrir os arquivos: **os ativos do Discord para essas são de traço**. Dava para
   ter o desenho dele e o peso certo ao mesmo tempo. Hoje fica no Phosphor só o
   que o acervo não tem: o `×` (lá só existe dentro de círculo) e as setas.

## Layout

App de **3 colunas** fixas sobre a área principal (`app/app/page.tsx`):

```
┌────┬──────────────┬───────────────────────────┬──────────────┐
│rail│ lista de     │ área principal            │ membros /    │
│72px│ canais/DMs   │ (chat, voz ou thread)     │ thread       │
│    │ w-60 (240px) │ flex-1                    │ w-60 / 26rem │
└────┴──────────────┴───────────────────────────┴──────────────┘
```

- **Rail** (`w-[72px]`, `bg-rail`): item de 48px circular (`rounded-[24px]`) que
  vira `rounded-2xl` no hover/ativo, com fundo `accent`; **pílula branca** à
  esquerda (`h-5` no hover, `h-10` ativo); tooltip à direita. Botões "novo" em
  `green`. Separador de 2px `rail-divider`.
- **Coluna 2** (`w-60`, `bg-panel`): cabeçalho de **48px** com `shadow-header`
  (nome do servidor + chevron → menu); categorias em caixa mista 14px, fonte do corpo, chevron **depois** do texto
  (`text-txt-muted`) colapsáveis; item de canal de **36px** (`h-9`, raio 8), ícone 20px
  `text-txt-faint`, hover `bg-hov text-txt-normal`, ativo `bg-sel text-txt-primary`.
  **Card do usuário** (58px, raio 8, borda 1px, `bg-footer`): avatar com status,
  nome, status em texto, botões mic / áudio / engrenagem. Ele **flutua** — sai do
  fluxo da coluna, recuado 10px dos três lados, e a lista rola por trás. Encostado
  nas bordas ele lia como o fim da coluna; recuado, lê como o que é: uma peça por
  cima dela, que não pertence a nenhuma conversa da lista.
- **Área principal** (`flex-1`, `bg-chat`): cabeçalho de 49px + 1px de borda (`HeaderBar`: ícone
  + nome, toolbar à direita com busca que expande ao focar), timeline, composer,
  linha de "digitando…" (24px).
- **Coluna 4**: lista de membros (`w-60`, seções ONLINE/OFFLINE, offline a 30%)
  ou painel de thread (`w-[26rem]`, `bg-chat`) — nunca as duas ao mesmo tempo.
  O botão de membros do cabeçalho alterna a lista.

## Tokens de cor (classes Tailwind)

A escala de superfícies preserva os mesmos deltas de luminância que a escala
Discord tinha — é o que mantém a hierarquia de profundidade sem mexer no
leiaute.

| Classe | Hex | Uso |
|---|---|---|
| `rail` | `#0B0B0F` | Void Ink puro: rail, inputs escuros, tooltips |
| `footer` | `#101015` | painel do usuário |
| `panel` | `#141419` | colunas laterais, rodapé de modal |
| `chat` | `#1A1A20` | área de mensagens, corpo de modal |
| `input` | `#23232B` | composer, campo de edição |
| `msghov` | `#17171D` | hover de mensagem — **mais escuro** que `chat` |
| `hov` | `#1E1E23` | hover de item de lista |
| `sel` | `#29292E` | item ativo |
| `border` | `#2A2A33` | divisórias e linhas de seção |
| `border-strong` | `#35353F` | borda de botão secundário |
| `border-strong-hover` | `#4C4C58` | hover dessa borda |
| `overlay` | `#050507` | menu de contexto, popover, toast |
| `rail-divider` | `#1C1C22` | separador de 2px do rail |
| `scroll` | `#2A2A33` | thumb da rolagem (clareia, não escurece) |
| `accent` / `accent-hover` / `accent-press` | `#9BE31F` / `#B4EE4D` / `#86C91A` | Volt Lime: ativo e ação primária. No escuro o hover **clareia** |
| `accent-ink` | `#0B0B0F` | texto e ícone **sobre** o accent |
| `paper` | `#FDFDFB` | cor de marca; nunca superfície |
| `mention` | `#D9F5A8` | texto de @menção sobre véu de `accent/25` |
| `green` | `#1FB86B` | online, botões "novo" — afastado do limão em matiz |
| `yellow` | `#FF9F1C` | ausente, coroa do dono — âmbar, longe do limão |
| `red` / `red-hover` | `#FF4D4F` / `#E23A3D` | não perturbe, destrutivo |
| `txt-primary` | `#FDFDFB` | títulos, nome do autor — 15,8:1 sobre `chat` |
| `txt-normal` | `#D8D8D4` | corpo da mensagem — 11,9:1 |
| `txt-secondary` | `#A9A9A6` | ícones de toolbar — 7,4:1 |
| `txt-muted` | `#8A8A8E` | timestamps, categorias — 5,0:1 |
| `txt-faint` | `#6E6E76` | canal em repouso, offline — 3,4:1, **abaixo de AA** (dívida registrada na ADR-0004) |
| `txt-link` | `#00a8fc` | links, "N respostas" — ciano, não compete com o limão |

**Não escreva hexadecimal no JSX.** Faltando um valor, o token entra aqui e no
`tailwind.config.ts` primeiro. O único hex que restou no código é o do
`EmojiPicker`, que é de terceiro e só aceita CSS vars.

## Tipografia

Três famílias, todas por `next/font` — que as serve do próprio domínio e por
isso passam na CSP do Tauri (`font-src 'self' data:`). **Nunca** importar
`fonts.googleapis.com` por URL: quebraria o desktop.

| Papel | Família | Variável | Onde |
|---|---|---|---|
| corpo e densidade | **Noto Sans** 400/500/600/700 | `--font-sans` | mensagem, listas, botões, formulário |
| título e marca | **Archivo** 700/800 | `--font-display` | wordmark, títulos de auth e de modal, categorias |
| rótulo técnico | **JetBrains Mono** 400/700 | `--font-mono` | código, código de convite, IDs, atalhos |

Uso da Archivo (`font-display`):

- **Marca e telas de conta** — 800, caixa-alta, `tracking-wordmark` (−4,5%).
- **Títulos de modal e de seção** — 700, caixa normal, `tracking-title` (−2%).
- **Categorias e rótulos de campo** — 700, caixa-alta 12px, tracking
  **positivo** `[0.02em]`.

Duas regras que o pacote de marca não escreve e o produto precisa:

- **Tracking −4,5% só a partir de 24px.** Em caixa-alta pequena ele cola as
  letras; por isso as categorias levam tracking positivo.
- **Caixa-alta só onde o texto é da interface.** Nome de canal, de servidor e de
  usuário são conteúdo: ganham Archivo, não ganham caixa-alta.

- Corpo **16px / 1.375** (`text-base`); metadados 12px (`text-xs`); hora na
  margem 11px; categorias 12px caixa-alta 700; título de modal 20px 700; título
  de boas-vindas do canal 32px 800.
- Nome do autor `font-medium text-txt-primary`; corpo `text-txt-normal`.
- `font-mono` (JetBrains Mono) só para código e valor literal.

## Espaçamento e forma

- Grid base de 4px. Cabeçalhos 48px; itens de lista 32px (canal) / 42px (DM,
  membro); botões de ícone 24–32px; composer 44px de altura mínima.
- Raios: itens de lista e botões `rounded-[3px]`/`rounded-[4px]`; composer,
  cards e modais `rounded-lg`/`rounded-[5px]`; rail `rounded-[24px]`→`rounded-2xl`;
  avatares `rounded-full`.
- Sombras: `shadow-header` sob cabeçalhos de 48px; `shadow-high` em menus,
  popovers, tooltips e modais.

## Padrões de componente

- **Mensagem** (`MessageItem`): gutter de **72px**, avatar de 40px à esquerda
  (`Avatar size="lg"`), nome + "Hoje às 14:03" na primeira linha, corpo abaixo,
  anexos → link de thread → reações. **Agrupamento**: mensagem seguinte do mesmo
  autor em até 7 min (`lib/format.continuaAnterior`) vem sem avatar/nome, com a
  hora na margem só no hover. **Divisor de data** entre dias. Hover
  `bg-msghov`; barra de ações flutuante (`-top-4 right-4`) com tooltips.
  Botão direito → menu de contexto. Clique no avatar/nome → popover de perfil.
- **Início do canal**: círculo de 68px com o ícone + "Bem-vindo a #canal!" quando
  não há mais histórico.
- **Anexos**: imagem inline até 550×350, clique abre lightbox (`ImageModal`);
  outro arquivo vira card de 432px `bg-panel` com ícone `FileText` e nome em
  `txt-link`.
- **Reações**: pílula `h-[26px] rounded-lg bg-panel`; a minha `border-accent
  bg-accent/20`; hover `border-border-strong`; "+" de reação aparece no hover.
- **Composer**: caixa `bg-input rounded-lg` com `CirclePlus` (anexo) à esquerda e
  presente / GIF / figurinha / emoji à direita; contador só a partir de 90% do
  teto. Sem dica textual de teclado. Preview de anexo em cards de 184px.
- **Modal** (`Dialog`): corpo `bg-chat` (`p-4`, título 20px), rodapé `bg-panel`
  com botão primário à direita (`h-[38px] rounded-[3px] bg-accent`) e "Cancelar"
  como texto com sublinhado no hover. Overlay `bg-black/60`, Esc/clique fora fecham.
- **Menu de contexto** (`ContextMenuHost`): `bg-overlay`, itens de 32px, hover
  `bg-accent text-accent-ink` (ou `bg-red` para destrutivo), separadores
  `border`.
- **Popover de perfil** (`ProfilePopoverHost`): 300px, faixa `accent` de 60px,
  avatar 80px sobreposto, card `bg-footer` com nome, @usuário, status e "Enviar
  mensagem".
- **Tooltip** (`Tooltip`): `bg-rail`, 14px 600, seta, hover e foco.
- **Avatar** (`Avatar`): iniciais sobre uma das 5 cores do avatar — nenhuma
  verde-limão, para não competir com o accent nem com o status (hash do id);
  bolinha de status com borda na cor da superfície (`surface`).
- **Login/registro** (`AuthCard`): fundo `bg-rail` com um brilho de limão em
  radial, lockup da marca acima do título, card de 480px `bg-chat`, rótulos 12px
  caixa-alta com asterisco vermelho, inputs `bg-rail h-10`, botão `h-11`
  `bg-accent text-accent-ink`.
- **Marca** (`Marca` / `MarcaLockup`): símbolo em `currentColor` com o "Z"
  recortado por máscara; o lockup põe o wordmark como **texto real** em Archivo.
  Desenho e regras de uso: `docs/branding/`.

## Ícones

O vocabulário inteiro vive em `components/ui/icones.tsx` — nomes, origem de cada
um e o porquê das exceções estão lá, não aqui: uma lista duplicada num `.md`
envelhece sem ninguém perceber.

Três coisas que só se aprendem mexendo, e que o arquivo registra:

- **A cor sai fora.** Vários ativos vêm com vermelho ou verde chapado. Quem pinta
  é quem chama, via `currentColor` — o estado desligado do rodapé pinta ícone e
  véu juntos, e um vermelho preso dentro do glifo brigaria com ele.
- **O quadro depende da origem.** Ativo exportado do Figma vem em `0 0 100 100`;
  os gerados da geometria vêm em `0 0 80 80`. Trocar um pelo outro passa no
  typecheck e sai com o ícone no tamanho errado.
- **Nem todo ativo sobrevive a uma cor só.** Alguns são um corpo colorido com
  caminhos brancos por cima que, no arquivo, são buraco. Achatados, cobrem o
  desenho em vez de recortá-lo. Três voltaram para o Phosphor por isso, e os três
  só apareceram **renderizando e olhando** — o typecheck passa em todos.

## Estados a nunca esquecer

- **Vazio:** toda lista tem texto de vazio em `text-txt-muted` explicando o
  próximo passo.
- **Carregando:** ações assíncronas travam o disparo (`disabled`, "Enviando…").
- **Sem permissão:** canal somente-leitura mostra a caixa cinza "Você não tem
  permissão…" no lugar do composer.
- **Digitando:** `TypingIndicator` sob o composer — três pontos e nomes em negrito.
- **Em breve:** botão presente no Discord mas sem função aqui fica visível a 50%
  com tooltip "(em breve)" — nunca some do leiaute.
- **Foco/teclado:** setas nos canais, Tab preso nos modais, Esc fecha menus,
  popovers e modais; anel de foco `accent`.
