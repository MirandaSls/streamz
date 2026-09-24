# Streamz — sistema de design

**Meta (ADR-0009, 2026-09-11): idêntico ao Discord, exceto a marca.** Fica nosso
o símbolo e o wordmark (`Marca`/`MarcaLockup`, `docs/branding/`) e o **Volt Lime
`#9BE31F`** no lugar do blurple, com texto escuro sobre ele. Todo o resto —
superfícies, textos, bordas, elevação, status, tipografia, raios, sombras,
medidas, ícones, emoji e comportamento — é o do Discord de 2026-09-11, medido em
`docs/referencias-discord/` (tokens e CSS) e nos prints 1:1 de
`/opt/stack/streamz/docs/Reference/`. A execução está em
`docs/PLANO-PARIDADE-DISCORD.md`.

> **Em transição (ondas 1–9).** Princípios, tokens, tipografia, forma e
> primitivos já descrevem o código (onda 0 fechada). **Layout** e **Estados**
> descrevem o app como ele está, e mudam tela a tela conforme as ondas 1–8
> passam. A medida de cada peça mora no cabeçalho do primitivo, não aqui. Na
> dúvida entre este arquivo e a ADR-0009, vale a ADR.

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
5. **Escuro sempre.** Três temas do Discord — Dark (padrão), Ash e Onyx (onda
   9, ver "Temas"); Light fora (exige um accent alternativo, que é outra ADR).
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
- **Coluna 4**: lista de membros (`w-60`, seções ONLINE/OFFLINE, offline a 30%,
  ausente a 60%)
  ou painel de thread (`w-[26rem]`, `bg-chat`) — nunca as duas ao mesmo tempo.
  O botão de membros do cabeçalho alterna a lista.

## Tokens de cor

Os tokens são as **variáveis semânticas do Discord**, com o nome dele, geradas
por `scripts/paridade/gerar-tokens.mjs` a partir de
`docs/referencias-discord/tokens/variaveis-resolvidas.json` (temas Dark, Ash e
Onyx, 2026-09-11). Saem em `apps/web/app/tokens.css` (hex, canais `-rgb` e alfa
`-a` de cada um) e em `apps/web/tokens.gerados.ts` (o mapa do Tailwind). **Nenhum
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

### Temas

Dark, Ash e Onyx são as colunas `escuro` (`theme-dark theme-darker`), `cinza`
(`theme-dark`) e `onyx` (`theme-dark theme-midnight`) de
`docs/referencias-discord/tokens/VARIAVEIS.md`. **A classe não muda com o tema**:
`bg-background-base-lower` é `#1a1a1e` no Dark, `#323339` no Ash e `#000000` no
Onyx, porque o que muda é a variável.

- **Dark é o `:root`** de `tokens.css`, e é a base. **Ash e Onyx** são blocos
  `:root[data-tema="ash"]` / `:root[data-tema="onyx"]` com **só** as variáveis
  que diferem do Dark (328 e 500 declarações); o resto herda. Translúcidos
  (`#rrggbbaa`) mantêm o alfa, que sai no `-a`.
- **O limão vale nos três**, pela mesma regra mecânica: a escala `--brand-*` é
  a mesma, e os tokens que no Discord mudam de blurple por tema (`text-brand`,
  `icon-brand`, `mention-foreground`, `tabs-indicator-default`,
  `reaction-text-reacted-default`, `text-code-title`) viram o passo do limão
  correspondente em cada um — `trocasPorTema` em
  `scripts/paridade/tokens-de-marca.json`. Contraste conferido: limão como
  texto/borda ≥ 6,57:1 na superfície mais clara do Ash (`#3f4048`) e ≥ 11,33:1
  no Onyx; texto escuro sobre o limão 12,54:1 (hover 7,64, pressionado 5,87)
  nos três.
- **Onde se escolhe**: Configurações > Aparência > Temas padrão
  (`AparenciaTab.tsx`). As amostras são a paleta crua do Discord, iguais em
  qualquer tema ativo: Ash `bg-primary-600`, Dark `bg-plum-20`, Onyx `bg-black`
  (e o Claro, `bg-white`, desabilitado "em breve").
- **Onde se guarda**: `theme: "dark" | "ash" | "onyx"` em `stores/settings.ts`
  (`localStorage`, preferência de dispositivo). A store escreve `data-tema` no
  `<html>` (nada no Dark) e o `<meta name="theme-color">` com o
  `--background-base-lowest` do tema.
- **Sem piscar**: o script inline `TEMA_ANTES_DA_PINTURA` do `app/layout.tsx`
  lê o `localStorage` e escreve o atributo no `<head>`, antes do `<body>` — no
  site, no desktop e no celular, que usam a mesma web.
- **Cor fora de token quebra tema.** Hex, `rgba()` e `bg-black`/`text-white` em
  classe só onde a cor é a mesma em qualquer tema no Discord (mídia sobre
  fundo preto, véu, polegar de slider, conteúdo como cor de avatar).

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

## Primitivos

Peça de interface não se desenha de novo: ela vem de
`components/ui/primitivos/`. **A medida de cada uma mora no cabeçalho do próprio
arquivo**, com a origem (seletor do CSS bruto do Discord ou coordenada no print
1:1) — é lá que se olha antes de mexer, não aqui.

| Primitivo | O que resolve |
|---|---|
| `Button` | ação com texto: `primario` (limão, texto escuro), `secundario`, `critico`, `critico-secundario`, `positivo`, `neutro` (sem fundo) e `link`/`critico-link` (inline, sem caixa). Tamanhos 24/32/40 ou número; `href` desenha `<a>`; `carregando` troca o conteúdo pelos três pontos |
| `BotaoDeIcone` | ícone clicável com dica: `rotulo` vira `aria-label` **e** `Tooltip`. `fundo` hover/sempre/nenhum, `forma` quadrado/disco, `tom` neutro/perigo/positivo/ativo |
| `Tooltip` | dica: `--background-surface-high`, 14/16 peso 500, padding 8×12, raio 8, máx. 190, seta de base 10 |
| `TextInput` / `TextArea` / `Campo` | campo com invólucro (o foco é a borda da caixa), rótulo **sem caixa-alta** 16/500, ajuda, erro com `aria-live` |
| `Select` / `Switch` / `Checkbox` / `RadioGroup` / `LinhaDeControle` | controles de formulário e a linha de configuração |
| `Popout` | **o único** painel flutuante: portal, colisão nos quatro lados, Esc em pilha, foco preso e devolvido, folha inferior no celular. Raio 8 (medido em três prints), `shadow-popout` |
| `Modal` | 400/480/680/960 de largura (480 é o padrão, medido em três prints 1:1), raio 12, véu `--background-scrim`, foco preso, Esc e clique no véu |
| `Tabs` / `Badge` / `Divider` | abas (sublinhado com indicador que desliza, ou pílula), contador de não lidas e divisória |

`Dialog`, `PopoverFlutuante`, `HeaderPopover`, `PainelFlutuante`, `PickerPanel`,
o `ProfilePopoverHost` e os controles de `controls.tsx` continuam existindo com a
API de sempre — por dentro, todos são os primitivos acima.

Fora dos primitivos, três coisas que a onda 0 mediu e valem para o app todo:

- **Menu de contexto** (`ContextMenuHost`): caixa de 220, fundo
  `--background-surface-higher`, raio 8, itens de 32 com raio 2 (4 no foco),
  hover **cinza** (`--interactive-background-hover`) — o Discord não pinta item
  de menu com a cor de marca —, ícone de 16 à direita, separador com 8 nos
  quatro lados.
- **Emoji**: `components/ui/Emoji.tsx` desenha Twemoji local; 1.375em no texto e
  3rem quando a mensagem é só emoji. As classes precisam de `inline-block` (o
  preflight do Tailwind põe `display: block` em `<img>`).
- **Rolagem**: a global é a barra fina; `scroller-auto` + `scroller-fade` na
  lista de mensagens (é assim que o Discord esconde a barra em repouso).

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
