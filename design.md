# Streamz — sistema de design

**Meta (ADR-0009, 2026-09-11): idêntico ao Discord, exceto a marca.** Fica nosso
o símbolo e o wordmark (`Marca`/`MarcaLockup`, `docs/branding/`) e o **Volt Lime
`#9BE31F`** no lugar do blurple, com texto escuro sobre ele. Todo o resto —
superfícies, textos, bordas, elevação, status, tipografia, raios, sombras,
medidas, ícones, emoji e comportamento — é o do Discord de 2026-09-11, medido em
`docs/referencias-discord/` (tokens e CSS) e nos prints 1:1 de
`/opt/stack/streamz/docs/Reference/`. A execução está em
`docs/PLANO-PARIDADE-DISCORD.md`.

> **Em transição (onda 0).** Princípios, tokens, tipografia e espaçamento já
> descrevem o código. **Layout**, **Padrões de componente** e **Estados** ainda
> descrevem o sistema anterior: as medidas de cada peça passam a morar no
> cabeçalho do primitivo (`components/ui/primitivos/`), e as telas são refeitas
> nas ondas 1–8. Na dúvida entre este arquivo e a ADR-0009, vale a ADR.

## Princípios

1. **O Discord é a régua, e a régua é medida.** Cor e token saem das variáveis
   semânticas do Discord (`--background-base-lower`, `--text-default`…), geradas
   de `tokens/variaveis-resolvidas.json`; medida sai do print 1:1 ou do CSS bruto.
   Número que não veio de lá é "não medido", nunca chute (§6.3 do PROCESSO).
2. **O limão só substitui o que no Discord é marca**, por regra mecânica: todo
   token que o Discord pinta com o blurple vira o passo equivalente da escala do
   limão. Link e anel de foco de teclado são azuis no Discord e continuam azuis;
   o hover do botão primário escurece, como lá.
3. **Três regras do accent, que não são preferência:**
   - **limão só sobre escuro** — nunca como texto sobre fundo claro;
   - **texto e ícone sobre o limão são `accent-ink` `#0B0B0F`**, nunca branco
     (branco sobre Volt Lime dá 1,57:1). É regra dos primitivos (`Button`,
     `Switch`, `Checkbox`, `Badge`), não de tela;
   - **bolinha de status nunca sobre superfície limão.**
4. **Archivo só no wordmark.** Corpo e títulos em Noto Sans (a fallback do gg sans
   e do ABC Ginto no próprio CSS do Discord); código em Source Code Pro (a
   fallback do gg mono). Base de 16px.
5. **Escuro por padrão.** Tema Dark agora; Ash e Onyx na onda 9; Light fora
   (exige um accent alternativo, que é outra ADR).
6. **Ação no hover, não no layout.** Editar, apagar, reagir, responder aparecem no
   hover da mensagem (`group-hover`) — a linha em repouso mostra só conteúdo.
7. **Ícone é SVG do acervo oficial do Discord**, sempre por
   `components/ui/icones.tsx`, que é o único ponto de importação do app, nos
   tamanhos do Discord (16/20/24). Phosphor só onde o acervo não tem o desenho.
   **Emoji é Twemoji**, empacotado localmente — só como conteúdo (reações, texto
   do usuário), nunca como ícone de interface.

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

## Tokens de cor

Os tokens são as **variáveis semânticas do Discord**, com o nome dele, geradas
por `scripts/paridade/gerar-tokens.mjs` a partir de
`docs/referencias-discord/tokens/variaveis-resolvidas.json` (tema Dark,
2026-09-11). Saem em `apps/web/app/tokens.css` (hex, canais `-rgb` e alfa `-a`
de cada um) e em `apps/web/tokens.gerados.ts` (o mapa do Tailwind). **Nenhum
hex é escrito à mão**: faltando um valor, ele sai do gerador.

**A classe é o utilitário + o nome do token sem o `--`.** O prefixo repetido é o
preço de um nome que se procura no CSS do Discord sem tradução:

| Papel | Classe |
|---|---|
| rail, coluna de canais/DMs, barra de título | `bg-background-base-lowest` |
| mensagens, cabeçalho do canal, membros | `bg-background-base-lower` |
| painel do usuário, conteúdo de configurações | `bg-background-base-low` |
| popout, menu, dica, cartão | `bg-background-surface-high` / `-higher` / `-highest` |
| composer | `bg-chat-background-default` |
| hover / selecionado de item de lista | `bg-interactive-background-hover` / `-selected` |
| texto: título / corpo / secundário / apagado | `text-text-strong` / `text-text-default` / `text-text-subtle` / `text-text-muted` |
| nome de canal em repouso | `text-channels-default` (4,89:1 — fechou a dívida AA da ADR-0004) |
| link | `text-text-link` (azul: não é marca no Discord) |
| divisória | `border-border-subtle` (normal, strong: mais fortes) |
| botão primário | `bg-control-primary-background-default` + `text-control-primary-text-default` |
| perigo / sucesso / aviso | `status-danger` / `status-positive` / `status-warning` |
| presença | `text-icon-status-online` / `-idle` / `-dnd` / `-offline` |
| menção | `bg-mention-background` + `text-mention-foreground` |
| véu de modal | `bg-background-scrim` |

**O limão no lugar do blurple, por regra mecânica** (ADR-0009, item 3): todo
token cuja cor vem da família blurple (matiz 224–238°, saturação ≥ 40%) virou o
passo equivalente da escala `--brand-*` do limão — 65 trocas, listadas em
`scripts/paridade/tokens-de-marca.json`. Consequências que se veem:

- **Texto e ícone sobre o limão são escuros** (`#0B0B0F`): o próprio token
  (`control-primary-text-default`, `checkbox-icon-active`…) já é escuro. 12,5:1
  no limão, 7,6:1 no hover, 5,9:1 no pressionado.
- **O hover do primário escurece**, como no Discord (`#7BB129`).
- **Link, anel de foco de teclado e cores ANSI continuam azuis** — no Discord
  não são marca. O campo em foco (`input-border-active`) é marca: limão.

Duas exceções que não são do Discord: `efem`/`efemhov` (fundo da mensagem
efêmera: o limão a 4%, medido no print — o Discord não tem token) e `paper`
(`#FDFDFB`, cor de **marca**, nunca de interface).

**Sombras**: as do Discord pelo nome (`shadow-shadow-high`, `shadow-elevation-low`…)
e `shadow-popout`, a combinação `--shadow-border` + `--shadow-high` que o CSS do
Discord usa em 74 popouts. **Rolagem**: a regra global é a barra `thin`;
`scroller-auto` (chat), `scroller-none` (carrosséis) e `scroller-fade` estão no
`globals.css`.

## Tipografia

A pilha de fallback que o CSS do Discord declara (ADR-0009, item 4), toda por
`next/font` — que serve os arquivos do próprio domínio e por isso passa na CSP do
Tauri (`font-src 'self' data:`). **Nunca** importar `fonts.googleapis.com` por URL.

| Papel no Discord | Família | Classe |
|---|---|---|
| `--font-primary` (gg sans) | **Noto Sans** 400–800, com itálico | `font-sans` (padrão) |
| `--font-headline` (ABC Ginto Nord) | **Noto Sans 800** | `font-headline font-extrabold` |
| `--font-code` (gg mono) | **Source Code Pro** 400/700 | `font-mono` |
| wordmark (marca) | Archivo 800 | `font-display` — **só** no `MarcaLockup` |

**Base de 16px** (`html { font-size }`), a do Discord; a escala por preferência
continua em Aparência (`stores/settings.ts`). Com 16 a escala do Tailwind cai
exatamente na grade: `h-10` = 40, `rounded-lg` = 8.

A escala de texto do Discord, com o nome dele (o peso vai à parte, como as
variantes `/semibold` de lá):

| Classe | Tamanho / linha |
|---|---|
| `text-text-xxs` | 10 / 1.2 |
| `text-text-xs` | 12 / 1.333 |
| `text-text-sm` | 14 / 1.286 |
| `text-text-md` | 16 / 1.25 |
| `text-text-lg` | 20 / 1.2 |
| `text-heading-sm` / `-md` / `-lg` / `-xl` / `-xxl` | 14 / 16 / 20 / 24 / 32 |

## Espaçamento e forma

- Grade de 4px, que é a do Discord (`--space-*`) e a do Tailwind com a base de 16.
- Raios do Discord = raios do Tailwind: `rounded` 4 (`--radius-xs`),
  `rounded-lg` 8 (`--radius-sm`), `rounded-xl` 12 (`--radius-md`),
  `rounded-2xl` 16 (`--radius-lg`), `rounded-full` (pílula).
- **px literal onde o número significa alguma coisa** (medida de print, piso de
  alvo de toque), escala do Tailwind onde não significa.
- Medidas de cada peça: no cabeçalho do primitivo correspondente
  (`components/ui/primitivos/`), com a origem (seletor do CSS bruto ou print).

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
- **Modal** (`Dialog`, #59): caixa de 480 (borda de 1px incluída), raio 8,
  `bg-chat`, padding de 24; título 20px 700, descrição 16px em linha de 20 a 8
  do título, "×" de 24 a 16 do canto. Rodapé na mesma cor do corpo, sem faixa:
  botões de 40 com raio 8 e 8 entre eles — primário `bg-accent` à direita
  (`PrimaryButton`), "Cancelar" com fundo `border-strong` (`SecondaryButton`).
  Overlay `bg-black/85`, Esc/clique fora fecham. `semPadding` para quem pinta a
  caixa inteira (perfil, boas-vindas).
- **Menu de contexto** (`ContextMenuHost`, #59): caixa de 220 (borda incluída),
  raio 8, `bg-overlay` com `p-2`, itens de 32px, hover `bg-accent
  text-accent-ink` (ou `bg-red` para destrutivo), separadores `border`.
- **Popover de perfil** (`ProfilePopoverHost`): 300px, faixa `accent` de 60px,
  avatar 80px sobreposto, card `bg-footer` com nome, @usuário, status e "Enviar
  mensagem".
- **Tooltip** (`Tooltip`, #59): 34 de altura (14px 600 em linha de 16, 8 de
  respiro vertical, borda de 1px), raio 8, `bg-rail`, seta, hover e foco.
- **Mensagem no hover** (#60): barra de ações com raio 8, botões de 28 e borda
  clara; composer a 10px do fundo, sem faixa reservada para o "digitando…".
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
