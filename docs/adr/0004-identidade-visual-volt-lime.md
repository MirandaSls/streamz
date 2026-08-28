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
