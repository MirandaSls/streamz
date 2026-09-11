# ADR-0009: Paridade total com o Discord, exceto a marca

**Status:** Aceita (2026-09-11)
**Data:** 2026-09-11
**Substitui:** a [ADR-0004](0004-identidade-visual-volt-lime.md), menos a marca e as regras do accent (ver "O que sobrevive da ADR-0004")
**Escopo afetado:** `apps/web` inteiro (tokens, tipografia, primitivos, ícones, emoji), `apps/desktop` (fontes e emoji empacotados), `design.md`, §6 do `docs/PROCESSO-DE-DESENVOLVIMENTO.md`. Nenhum contrato, rota ou tabela.

## Contexto

A ADR-0004 fixou que o Discord é referência **só de leiaute e densidade**: paleta,
tipografia e marca seriam nossas. A Emenda 1 (2026-09-04) já recuou metade disso,
quando o usuário pôs o app ao lado do Discord e a escala de superfícies voltou a
ser a dele, medida. O §6.6 do PROCESSO registra a outra metade como regra:
"cores e tokens: intocados". Toda superfície nova usa "o token existente mais
próximo" e o PR anota a diferença.

Em 2026-09-11 o usuário pediu outra meta: *"que a aplicação fique idêntica ao
Discord, com exceção do ícone do Streamz e da cor padrão, que é o nosso verde. De
resto quero alterar tudo: ícones menores, fontes, tamanho da fonte, estilo do
chat, emojis, comandos, tudo."* As decisões de escopo estão no §2 do
`docs/PLANO-PARIDADE-DISCORD.md`.

Dois fatos mudaram o que é possível:

1. **A referência deixou de ser print e virou dado.** `docs/referencias-discord/tokens/`
   tem as 4.690 variáveis por tema do cliente atual (refresh de 2025), resolvidas
   pelo Chrome, e o CSS bruto de 303 + 850 arquivos. Medida de cor, raio, sombra,
   fonte e espaçamento sai de lá, não de `getpixel` sobre JPEG de blog.
2. **O meio-termo de hoje custa mais do que qualquer ponta.** Com as superfícies
   do Discord e textos, status, elevação e fontes nossos, cada tela nova exige uma
   decisão de "mais próximo", e o resultado lê como Discord mal copiado, que é
   exatamente o que o usuário rejeitou.

## Opções consideradas

### A. Manter a ADR-0004 como está
- **A favor:** nada a fazer; a identidade da marca continua espalhada na UI (Archivo,
  JetBrains Mono, Void Ink, status próprios).
- **Contra:** contradiz o pedido do usuário. E a Emenda 1 já mostrou que a meta
  "só leiaute" não se sustentava.

### B. Paridade de forma, paleta nossa (o §6 de hoje)
- **A favor:** menos arquivos tocados. A paleta, com exceção da escala de
  superfícies, continua nossa.
- **Contra:** é o estado atual, e o usuário vê a diferença. Os textos (`#D8D8D4`
  contra `#efeff1`), o menu mais escuro que o app, as cores de status e as fontes
  são o que denuncia a cópia. Cada tela nova segue pagando a decisão do "token mais
  próximo".

### C. Paridade total, exceto a marca (escolhida)
- **A favor:** uma regra só, sem julgamento por tela: **o que o Discord define, o
  Streamz copia medido; o que é marca, é nosso.** Os temas Ash e Onyx saem das
  mesmas variáveis. A dívida de contraste do `txt-faint` fecha sozinha (ver
  Consequências).
- **Contra:** toca praticamente todo `apps/web` (~400 `<button>`, ~90 `<input>`, 7
  implementações de popover). A identidade visual do produto se reduz a símbolo,
  wordmark e limão.

### D. Cópia 1:1, com o blurple
- **A favor:** zero decisão de cor.
- **Contra:** o usuário excluiu. Seria usar a cor de marca de outra empresa num
  produto que já tem pacote de marca próprio (`docs/branding/`).

## Decisão

**Opção C.** A régua de tudo que não é marca é o cliente do Discord de
2026-09-11 (tema Dark, `theme-dark theme-darker visual-refresh density-default
font-size-16`).

### 1. O que fica Streamz

| Peça | Regra |
|---|---|
| Símbolo, wordmark, favicon, ícones do app, splash, instalador | `Marca` / `MarcaLockup` e `docs/branding/`, sem mudança |
| Cor de marca | **Volt Lime `#9BE31F`** no lugar do blurple, pela regra mecânica do item 3 |
| Texto e ícone sobre a cor de marca | **`accent-ink` `#0B0B0F`** (12,54:1), nunca branco (1,57:1). É a única divergência de forma que a cor impõe |
| Archivo | **Só no wordmark** (`MarcaLockup`). Sai de títulos, telas de conta e categorias |

### 2. O que vira Discord

Todo o resto, medido nas referências: a escala de superfícies, textos, bordas e
elevação (menu, popover e tooltip **mais claros** que o app, como
`--background-surface-high/higher/highest`); as cores de status, de perigo, de
link, de aviso e do anel de foco de teclado; a tipografia (família, tamanho, peso
e entrelinha); raios, sombras, espaçamentos, larguras e alturas; os ícones (acervo
oficial) e seus tamanhos; o emoji (Twemoji); markdown, composer, autocomplete, UI
de comandos de barra e mensagens de bot; e o leiaute mobile.

### 3. Como o blurple vira limão (regra mecânica, não decisão por tela)

1. **Substituição por origem do valor.** Todo token cujo valor resolvido vem da
   família blurple passa a vir da escala do limão. Família blurple, para esta
   regra, é **matiz entre 224° e 238° com saturação de 40% ou mais**. Isso inclui a
   escala `--brand-*`/`--blurple-*`, as variantes por alfa e por `color-mix`
   (`--mention-background`, `--message-highlight-background-*`,
   `--reaction-background-reacted-*`, `--background-code`) e os vizinhos que não
   caem exatamente na escala (`--control-primary-background-hover` `#4452bb`,
   `--text-brand`/`--icon-brand` `#798df9`, `--mention-foreground` `#a9bbff`).
   Contagem de hoje: 67 tokens com a cor exata de um passo da escala, mais as
   variantes. A lista final é **gerada** de `variaveis-resolvidas.json` e
   commitada na onda 0.2, junto com o script.
2. **Azul que não é blurple continua azul.** O link (`--text-link` `#4d96ee`, matiz
   213°) e o anel de foco de teclado (`--border-focus` `#6aa8f4`, matiz 213°) não
   são marca no Discord e continuam os dele. O campo em foco
   (`--input-border-active`) é marca e vira limão.
3. **Onde o blurple é conteúdo, não marca, ele não é portado.** Cores ANSI de
   bloco de código (`--ansi-bright-blue`) ficam como no Discord. Gráficos e tokens
   de feature fora de escopo (`premium-*`, `quest-*`, Nitro) nem entram.
4. **A escala do limão tem os mesmos 26 passos do `--brand-*`** (100 a 900). O 500
   é `#9BE31F`, e cada passo guarda a posição relativa de luminosidade (OKLCH L)
   que o passo do Discord tem entre o 500 e o extremo da escala, com o matiz e o
   croma do limão, cortados à gama sRGB. Consequência: **o hover do botão primário
   escurece**, como no Discord. A regra do `design.md` "no escuro o hover clareia"
   cai.
5. **Texto e ícone sobre fundo da família viram `accent-ink`.** Isso vale para
   `--control-primary-text-default`, o visto do checkbox, o ícone do polegar do
   switch, o número do badge de marca e qualquer outro "branco sobre brand" que a
   geração encontrar. É regra dos primitivos (`Button`, `Switch`, `Checkbox`,
   `Badge`), escrita uma vez. Tela nenhuma decide isso.

### 4. Tipografia

As fontes do Discord (gg sans, ABC Ginto, gg mono) são proprietárias. Adotamos a
**pilha de fallback que o próprio CSS dele declara** (`tokens/VARIAVEIS.md`):

| Papel no Discord | Pilha dele | Streamz |
|---|---|---|
| `--font-primary` (10.839 usos) | gg sans → Noto Sans | Noto Sans (já temos) |
| `--font-headline` (430 usos) | ABC Ginto Nord → Noto Sans | Noto Sans 800 |
| `--font-code` (327 usos) | gg mono → Source Code Pro | **Source Code Pro** (OFL) por `next/font`, no lugar da JetBrains Mono |

A **base passa a 16px** (o `font-size-16` do `<html>` do Discord), no lugar dos
15,5px de hoje. A escala de fonte por preferência continua em Aparência. A escala
de texto (`text-*`/`heading-*` de `tipografia-e-formas.json`) vira classes
nomeadas.

### 5. Tokens

- Os tokens passam a ser **variáveis CSS com os nomes semânticos do Discord**
  (`--background-base-lower`, `--text-default`,
  `--control-primary-background-default`…), geradas de
  `tokens/variaveis-resolvidas.json` por tema. O Tailwind aponta para as
  variáveis. **Nenhum hex escrito à mão** entra no gerador; o limão entra só como
  a âncora do item 3.4.
- O nome do Discord é o nome canônico. Os nomes atuais (`panel`, `chat`, `txt-*`,
  `void`…) viram apelidos durante a migração (onda 0.8) e **saem ao fim da onda 0**.
- Temas: **Dark** agora; **Ash** e **Onyx** na onda 9, das mesmas variáveis.
  **Light fica fora** (item "Fora desta decisão").

### 6. Ícones e emoji

- Ícone vem do acervo oficial (`docs/Reference/Discord assets icons/`), nos
  tamanhos padrão do Discord (16/20/24). Phosphor e lucide ficam só onde o acervo
  não tem o desenho, sempre por `icones.tsx`.
- Emoji é **Twemoji** (CC-BY 4.0), empacotado **localmente** porque o desktop roda
  offline, com atribuição em "Sobre". A escolha entre sprite e arquivo por emoji
  sai da medida de peso no desktop e no Android (onda 0.6).

### 7. Ordem de autoridade das medidas

1. **Prints 1:1 do usuário** (`docs/Reference/Captura de tela *.png`, janela
   maximizada, zoom 100%).
2. **CSS e tokens medidos** (`docs/referencias-discord/tokens/`, `css-bruto/`).
3. **Imagens do catálogo** (`docs/referencias-discord/`): escala desconhecida, então
   servem para proporção, presença e ordem, **nunca para px**.

Quando nenhuma das três dá o número com confiança, o cartão escreve "não medido"
(§6.3 do PROCESSO). Se o CSS e o print divergirem, vale o print: é o que o
usuário vê, e o CSS pode ter experimento ligado ou desligado.

### 8. Comportamento, não só tela

Para as features que o Streamz ainda não tem (trilha §4b do plano), a régua é o
**comportamento** descrito na central de ajuda do Discord
(`suporte/api/artigos.json`). Continuam **não criadas**, até o usuário dizer o
contrário: Nitro, loja, missões, "Ativo agora" e toda monetização (impulsos,
cobrança, super reações pagas). Feature com decisão de arquitetura (palco, push,
conexões, atividades) ganha ADR própria antes do código.

## O que sobrevive da ADR-0004

- O **Volt Lime** como cor de marca e o **pacote de marca** (`docs/branding/`) para
  símbolo, wordmark e assets.
- **Regra 1 — limão só sobre escuro.** Continua; fica ainda mais necessária agora
  que o limão cobre toda a família de marca.
- **Regra 2 — texto e ícone sobre o accent são escuros.** Continua, e vira regra de
  primitivo (item 3.5).
- **Regra 3, segunda metade — bolinha de status nunca sobre superfície limão.**
  Continua.

O que cai: a escala Void Ink na UI (o `#0B0B0F` fica só como `accent-ink` e na
marca), Archivo em títulos e categorias, JetBrains Mono, as cores próprias de
status, perigo e link, o menu mais escuro que o app, e a **primeira metade da
regra 3** (status afastado do limão com cores nossas). Os valores do Discord
também passam nessa regra, só que com folga menor: o online `#3d9e60` fica a
59,6° do limão em matiz (o nosso `#1FB86B` ficava a 67,8°) e o ausente/aviso
`#ffcb6e`/`#fdb833` a 43,6°/42,5° (o nosso `#FF9F1C` ficava a 47,4°).

## Consequências

### Positivas

- **Uma regra no lugar de centenas de decisões.** Tela nova não pergunta mais "qual
  token é o mais próximo", porque o token é o do Discord, com o mesmo nome.
- **A dívida de contraste da ADR-0004 fecha.** O canal em repouso passa de
  `txt-faint` `#6E6E76` sobre `#1A1A1E` (3,43:1, abaixo de AA) para
  `--channels-default` `#81828a` sobre `#121214` (4,89:1). O texto apagado
  `--text-muted` `#96979e` dá 5,96:1 sobre o chat.
- **Os temas saem quase de graça.** Ash e Onyx são outro bloco das mesmas variáveis.
- **Revisão com medida, não com opinião.** A folha lado a lado (onda 0.7) compara
  com a referência, e divergência vira número.

### Negativas

- **Custo alto e espalhado.** Tokens, primitivos e a migração tocam quase todo
  `apps/web`; o plano estima ~130 cartões só de paridade. Várias sessões mexem no
  mesmo repositório, então a reserva de arquivos (§2.4) vira rotina.
- **A identidade visual encolhe.** Fora símbolo, wordmark e limão, o produto passa
  a ser visualmente o Discord. O pacote de marca (`docs/branding/`) continua
  valendo para a marca, mas **deixa de valer para a interface**: ele prescreve
  Archivo em títulos, e a interface não vai mais usar.
- **O limão aparece menos do que se espera.** Hover do primário escurece, o anel de
  foco de teclado é azul e o link é azul, porque nada disso é marca no Discord.
- **O botão primário diverge do Discord de forma permanente** (texto escuro em vez
  de branco). Um print lado a lado sempre vai mostrar isso, e é intencional.
- **O passeio visual perde a linha de base de novo**, como na ADR-0004. Tudo
  anterior à onda 0.2 é ruído para comparação.
- **Pacote maior.** Twemoji e Source Code Pro entram no bundle da web, do desktop e
  do Android. O Twemoji exige atribuição.
- **A referência envelhece.** O Discord muda de visual (houve um refresh em 2025).
  O retrato de 2026-09-11 é a régua; coletar de novo é decisão explícita do
  usuário, nunca automática.

### Fora desta decisão

- **Tema Light.** "Limão só sobre escuro" exige um accent alternativo para fundo
  claro, que o pacote de marca não define. Isso pede outra ADR.
- **Sons de UI.** Os 9 `.mp3` de `apps/web/public/sons/` são os originais do Discord
  (commits `f4217c1`/`a1f6dcc`). É um risco de licença que já existe, e que esta ADR
  não cria nem resolve.
- **Overlay de jogo**, pelo §4b do plano: exige injeção nativa no jogo.
- **Monetização**, pelo item 8.

## Plano de migração

A execução está no `docs/PLANO-PARIDADE-DISCORD.md` (ondas 0 a 9 e trilha §4b). O
que esta ADR fixa como ordem:

1. **0.1 (esta ADR).** Com a aprovação: status da ADR-0004 → "Substituída por
   ADR-0009 (menos a marca e as regras do accent)"; índice em `docs/adr/README.md`;
   a introdução do §6 e o §6.6 do PROCESSO deixam de dizer "cores e tokens
   intocados"; o `design.md` ganha o cabeçalho e os princípios novos. As tabelas de
   token e tipografia do `design.md` são reescritas **quando o código mudar**
   (0.2 e 0.3), porque o `design.md` descreve o que é, não o que será.
2. **0.2 → 0.3**, sequenciais: tokens gerados, com a escala do limão e a base de
   16px; depois a tipografia. Nenhuma medida nova é tirada antes da 0.2, porque a
   base de 16px muda todas.
3. **0.4 → 0.8**: primitivos, ícones, emoji, passeio de paridade e migração
   mecânica.

**Critério de saída da onda 0**, mecânico:
- o `grep` de hex em `apps/web/components` volta vazio (fora da lista de exceções);
- nenhum nome de token antigo sobra no código;
- `lucide-react` e `@phosphor-icons/react` só aparecem em `icones.tsx`;
- `font-display` só aparece no `MarcaLockup`;
- o passeio fotografa todas as telas nos tokens novos.
