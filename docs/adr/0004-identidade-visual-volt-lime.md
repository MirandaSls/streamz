# ADR-0004 — Identidade visual própria (Volt Lime sobre Void Ink)

- **Status:** Aceita
- **Data:** 2026-08-26
- **Substitui:** a meta de paridade visual com o Discord fixada em `design.md`

## Contexto

Até aqui o `design.md` era explícito: *"Referência visual: Discord (tema escuro,
2024+). A meta é ser indistinguível na paleta, na tipografia, no leiaute e nos
componentes — não 'inspirado'."* Os 20 tokens de cor de `apps/web/tailwind.config.ts`
são os valores do Discord com os nomes deles ao lado; a fonte é a Noto Sans porque
é a fallback oficial da "gg sans"; o `#5865f2` é o blurple.

Isso foi a decisão certa para o MVP: copiar um sistema maduro elimina centenas de
micro-decisões de superfície e faz telas novas nascerem coerentes. O custo era
conhecido e adiado — o produto não tem cara própria e a paleta pertence a outra
empresa.

O pacote de marca v1.0 (`docs/branding/marca`) fecha esse adiamento. Ele traz
paleta (Volt Lime `#9BE31F`, Void Ink `#0B0B0F`, Paper `#FDFDFB`), tipografia
(Archivo para display, JetBrains Mono para rótulos técnicos), símbolo, lockups e
regras de uso. É a primeira autoridade visual do projeto que não é derivada do
Discord.

O conflito é direto: um accent limão dentro de uma escala de cinza azulada
copiada do Discord não lê como marca, lê como tema mal aplicado. Não dá para
adotar o pacote e manter a meta de paridade.

## Opções consideradas

### A. Só o accent e o logo

Trocar `#5865f2` por `#9BE31F` e o símbolo, mantendo toda a escala de cinza.

- **A favor:** um dia de trabalho, risco quase nulo, reversível num commit.
- **Contra:** o limão sobre `#313338` (cinza azulado) briga em temperatura; o app
  continua sendo um clone do Discord com um botão verde. Paga o custo de mudar a
  marca sem receber o benefício.

### B. Marca e superfícies (escolhida)

Reancorar a escala de cinza inteira no Void Ink e adotar o limão como accent,
preservando leiaute, densidade, componentes e movimento.

- **A favor:** a superfície passa a ser derivada da marca, não de terceiro. O
  limão funciona porque o fundo é neutro-escuro de verdade (12,5:1 de contraste
  sobre Void Ink). O custo é alto mas fechado: tokens, ~145 hex soltos, títulos,
  assets.
- **Contra:** toca ~50 arquivos; o `design.md` precisa ser reescrito; o passeio
  visual precisa de nova linha de base.

### C. Redesign completo

Tratar o visual Discord como anti-referência e derivar leiaute, densidade,
componentes e movimento da marca.

- **A favor:** a única opção que produz um produto visualmente original.
- **Contra:** semanas de trabalho, todas as telas refeitas, e joga fora a razão
  original de copiar o Discord — a familiaridade do usuário com um app de chat de
  três colunas. O pacote de marca define identidade, não sistema de interface;
  não há material para sustentar a escolha.

## Decisão

> **Emendado em 2026-09-04 (ver "Emenda 1" no fim).** A parte da escala de
> superfícies abaixo foi revertida: os cinzas voltaram a ser os do Discord,
> medidos. O accent, as três regras e a tipografia continuam valendo.

**Opção B.** A escala de cinza é reancorada no Void Ink `#0B0B0F` preservando os
mesmos deltas de luminância entre superfícies que a escala Discord tem hoje
(`rail` < `footer` < `panel` < `chat` < `input`), e o Volt Lime `#9BE31F`
substitui o blurple como accent. Archivo entra nos títulos de marca; Noto Sans
permanece no corpo e na densidade da UI; JetBrains Mono assume a `font-mono`.

Três regras passam a valer como parte do sistema, não como preferência:

1. **Limão só sobre escuro.** Nunca como texto sobre Paper — é regra do próprio
   pacote (`LEIA-ME.txt`) e também de contraste.
2. **Texto e ícone sobre o accent são Void Ink, nunca branco.** Branco sobre
   Volt Lime dá 1,57:1.
3. **Verde de status e amarelo de aviso ficam afastados do limão em matiz**
   (`#1FB86B` e `#FF9F1C`), e uma bolinha de status nunca é posta sobre
   superfície limão.

O símbolo do pacote substitui o corvo adotado em `6cdbcbe`; o corvo fica em
`docs/branding/descartado/`.

## Consequências

### Positivas

- A paleta deixa de pertencer a outra empresa. Favicon, ícone de app, og-image,
  instalador do Tauri e tela de login passam a falar a mesma língua.
- Os ~145 valores hexadecimais soltos no JSX viram tokens (`border`,
  `border-strong`, `overlay`, `scroll`). O sistema de cor passa a ter um lugar só,
  o que era verdade no papel e não no código.
- O acerto de contraste do texto sobre o accent corrige um problema que já
  existia em potencial e que o blurple escondia.

### Negativas

- O `design.md` não pode mais ser lido como "faça igual ao Discord": ele passa a
  descrever um sistema próprio, e telas novas custam mais decisão do que custavam.
  A referência Discord sobrevive só para **leiaute e densidade**.
- A familiaridade imediata do usuário com a superfície diminui. É o preço
  aceito de ter marca.
- O passeio visual (`scripts/e2e-visual.mjs`) perde a linha de base; qualquer
  comparação com screenshots anteriores a este ADR é ruído.
- Sobra uma dívida conhecida: `txt-faint` fica em 3,4:1 sobre `chat`, abaixo de
  AA. É a mesma folga de hoje (`#80848e` sobre `#313338`), então não é regressão
   — mas agora está registrado, e não escondido atrás de "é assim no Discord".

### Fora desta decisão

Tema claro continua fora do MVP. O Paper `#FDFDFB` entra apenas como cor de texto
e de marca, nunca como superfície. Adotá-lo como tema exigiria um accent
alternativo para fundo claro, que o pacote de marca ainda não define — e isso é
outra ADR.

## Emenda 1 — 2026-09-04: os cinzas voltam a ser os do Discord

O usuário viu o app ao lado do Discord e disse: "a barra lateral está mais
escura que o restante do app; no Discord isso não acontece". A medição
(Pillow/`getpixel` em área plana dos prints `docs/Reference/Captura de tela
2026-09-04 102422/102429/102757/100527.png` e `2026-09-02 180835.png`) mostrou
duas coisas que a escala ancorada no Void Ink não previa:

1. **No Discord a rail de servidores, a coluna de canais/DMs e a barra de título
   são a mesma superfície** — `#121214`, os três. O que as separa é uma linha de
   1px `#222225`, não uma diferença de cor. A nossa escala tinha `rail #0B0B0F`
   contra `panel #141419`: um degrau que o Discord não tem, e ainda por cima no
   fundo do poço.
2. A nossa escala **descia mais fundo** que a do Discord onde ele sobe: o card
   do usuário era `#101015` (mais escuro que a coluna) quando no Discord ele é
   `#202024` (mais claro que a coluna).

Decisão: as superfícies passam a ser os hex medidos no Discord. A marca não
muda — Volt Lime continua o accent, Paper continua o texto, e o Void Ink
`#0B0B0F` continua no produto: virou o token `void` (campos escuros, tooltips,
palco de chamada, trilhos), que era o antigo `rail`.

| Token | Antes | Depois (medido no Discord) |
|---|---|---|
| `rail` → `panel` | `#0B0B0F` / `#141419` | `#121214` (rail = coluna = barra de título) |
| `footer` | `#101015` | `#202024` |
| `chat` | `#1A1A20` | `#1A1A1E` |
| `input` | `#23232B` | `#222327` |
| `hov` | `#1E1E23` | `#222225` |
| `sel` | `#29292E` | `#2C2C30` |
| `rail-divider` | `#1C1C22` (2px) | `#222225` (1px) |
| `msghov` | `#17171D` | `#17171A` (não medido: só re-harmonizado com `chat`) |
| `void` (novo, era `rail`) | — | `#0B0B0F` |

Consequências:

- O token `rail` **deixa de existir**. Quem era `bg-rail` de campo escuro virou
  `bg-void`; quem era a superfície da rail virou `bg-panel`.
- Sem o degrau de cor entre rail e coluna, a separação passa a ser a linha de
  1px (`rail-divider`), como no Discord.
- A dívida do `txt-faint` continua igual: 3,43:1 sobre o novo `chat` `#1A1A1E`
  (era 3,43:1 sobre `#1A1A20`). Nenhum texto perdeu AA por causa desta emenda;
  o pior caso novo é `txt-muted` sobre `sel`, que foi de 4,21:1 para 4,04:1 —
  já estava abaixo de AA e `sel` quase sempre carrega `txt-primary`.
- **Fora desta emenda:** `overlay` (menu de contexto, popover, toast) continua
  `#050507`. O Discord usa `#28282D` — o menu dele é *mais claro* que o app,
  o nosso é mais escuro. É uma inversão do modelo de elevação, não um ajuste de
  valor, e vale uma decisão própria.
