# Rebranding Streamz — plano de implementação

Aplica o pacote de marca de `docs/brading/marca` (Volt Lime / Void Ink / Paper,
símbolo em balão de fala, Archivo) sobre o app existente.

**Decisões travadas** (respondidas em 2026-08-26):

1. **Profundidade — marca + superfícies.** A escala de cinza inteira é
   reancorada no Void Ink `#0B0B0F` e o Volt Lime `#9BE31F` vira o accent.
   Leiaute, densidade, componentes e movimento ficam como estão. Não é redesign.
2. **Tipografia — Archivo nos títulos.** Archivo 800 caixa-alta onde a marca
   fala; Noto Sans continua no corpo e na densidade da UI; JetBrains Mono
   assume a `font-mono`.
3. **Símbolo — o pacote vence.** O balão de fala com o "Z" substitui o corvo
   (commit `6cdbcbe`) em todo lugar; o corvo é arquivado, não apagado.

Verdade de produto: `produto.md` (não é reescrito por este plano). Verdade
visual atual: `design.md` — que **muda** no fim deste plano, porque hoje ele
exige paridade com o Discord e essa meta cai.

---

## 1. O que está no repositório hoje

| Frente | Estado | Volume |
|---|---|---|
| Tokens de cor | 20 cores Discord em `apps/web/tailwind.config.ts` | 1 arquivo |
| Hex soltos no JSX | `#3f4147`, `#4e5058`, `#6d6f78`, `#111214`, `#41434a`, `#35363c`, `#1a1b1e` | ~145 ocorrências, ~50 arquivos |
| Classe `accent` | estados ativos, botões primários, faixas | 79 ocorrências, 49 arquivos |
| `text-white` | 88 ocorrências, 50 arquivos — **parte sobre `bg-accent`** | ver §3, risco nº 1 |
| Tipografia | Noto Sans em tudo (`app/layout.tsx`), `font-mono` genérica | 1 arquivo + `tailwind.config.ts` |
| Símbolo | corvo em `components/ui/Corvo.tsx`, `app/icon.svg`, `apps/desktop/logo.svg`, ícones Tauri | 4 fontes + PNGs gerados |
| PWA / social | **não existem** — sem `manifest`, sem `apple-icon`, sem `opengraph-image` | a criar |
| Marca no auth | `AuthCard` com fundo blurple + `<Corvo>` | 1 arquivo |

O pacote de marca é coerente: todos os SVGs usam o mesmo `path` do símbolo, só
mudando fundo e preenchimento. Isso permite um componente React único
(`Marca.tsx`) que herda `currentColor`, em vez de nove arquivos.

---

## 2. Mapa de tokens (Void Ink)

Escala derivada do Void Ink preservando **os mesmos deltas de luminância** entre
superfícies que a escala Discord tem hoje — é o que mantém a hierarquia de
profundidade (rail < footer < panel < chat < input) sem mexer no leiaute.

### Superfícies

| Token | Hoje | Novo | Uso |
|---|---|---|---|
| `rail` | `#1e1f22` | **`#0B0B0F`** | Void Ink puro: rail, inputs escuros, tooltips |
| `footer` | `#232428` | **`#101015`** | painel do usuário |
| `panel` | `#2b2d31` | **`#141419`** | colunas laterais, rodapé de modal |
| `chat` | `#313338` | **`#1A1A20`** | área de mensagens, corpo de modal |
| `input` | `#383a40` | **`#23232B`** | composer, campo de edição |
| `msghov` | `#2e3035` | **`#17171D`** | hover de mensagem — **mais escuro** que `chat`, como hoje |
| `hov` | `#35373c` | **`#1E1E23`** | hover de item de lista (sobre `panel`) |
| `sel` | `#404249` | **`#29292E`** | item ativo |

### Bordas, divisórias e sobreposições (hoje são hex soltos)

| Novo token | Substitui | Valor | Uso |
|---|---|---|---|
| `border` | `#3f4147`, `#41434a` | **`#2A2A33`** | divisórias, linhas de seção |
| `border-strong` | `#4e5058` | **`#35353F`** | borda de botão secundário |
| `border-strong-hover` | `#6d6f78` | **`#4C4C58`** | hover dessa borda |
| `overlay` | `#111214` | **`#050507`** | menu de contexto, popover, toast |
| `rail-divider` | `#35363c` | **`#1C1C22`** | separador de 2px do rail |
| `scroll` | `#1a1b1e` | **`#2A2A33`** | thumb da barra de rolagem |

> O thumb **precisa clarear**, não escurecer: `#1a1b1e` sobre `#0B0B0F` some.

### Texto (ancorado no Paper)

| Token | Hoje | Novo | Contraste sobre `chat` |
|---|---|---|---|
| `txt-primary` | `#f2f3f5` | **`#FDFDFB`** (Paper) | 15,8:1 |
| `txt-normal` | `#dbdee1` | **`#D8D8D4`** | 11,9:1 |
| `txt-secondary` | `#b5bac1` | **`#A9A9A6`** | ~7,4:1 |
| `txt-muted` | `#949ba4` | **`#8A8A8E`** | 5,0:1 |
| `txt-faint` | `#80848e` | **`#6E6E76`** | 3,4:1 — mesma folga de hoje, ainda abaixo de AA |
| `txt-link` | `#00a8fc` | **mantém** | 6,6:1 — ciano não compete com o lime |

### Marca e semântica

| Token | Hoje | Novo | Nota |
|---|---|---|---|
| `accent` | `#5865f2` | **`#9BE31F`** | Volt Lime |
| `accent-hover` | `#4752c4` | **`#B4EE4D`** | sobre fundo escuro o hover **clareia** |
| `accent-press` | — | **`#86C91A`** | novo |
| `accent-ink` | — | **`#0B0B0F`** | **cor de texto/ícone sobre o accent** |
| `green` | `#23a559` | **`#1FB86B`** | afastado do lime em matiz |
| `yellow` | `#f0b232` | **`#FF9F1C`** | âmbar, longe do lime |
| `red` | `#f23f43` | **`#FF4D4F`** | |
| `red-hover` | `#da373c` | **`#E23A3D`** | |

Volt Lime sobre Void Ink = **12,5:1**. Volt Lime sobre `chat` = **11,0:1**.
Branco sobre Volt Lime = **1,57:1** — ver §3.

### Regras que nascem com a marca

- **Limão só sobre escuro.** Nunca lime como texto sobre `Paper` (regra do
  `LEIA-ME.txt`), nunca lime sobre lime.
- **Texto sobre `accent` é `accent-ink`**, nunca branco.
- **Bolinha de status nunca sobre superfície lime** — verde e lime lado a lado
  é o choque mais provável desta paleta.
- Lime é **estado ativo e ação primária**, não decoração. O princípio 4 do
  `design.md` ("cor com parcimônia") fica mais rígido, não menos.

---

## 3. O risco número um: branco sobre limão

Hoje todo botão primário é `bg-accent … text-white`. Com o accent em lime isso
vira **1,57:1** — reprova AA com folga enorme e fica ilegível na prática.

São 88 `text-white` em 50 arquivos, mas **a maioria é sobre superfície escura e
continua correta**. Caçar `text-white` é a abordagem errada. A certa:

1. Grepar a coocorrência `bg-accent` + `text-white` na mesma classe (e o mesmo
   para `bg-green`, `bg-yellow`, `bg-red`).
2. Trocar por `text-accent-ink` (ou `text-void`) só nesses.
3. Para o que resta, o `e2e-visual.mjs` antes/depois é o detector.

O mesmo vale para `bg-yellow` (âmbar) — texto escuro. `bg-red` mantém branco.

---

## 4. Tipografia

- **Archivo** e **JetBrains Mono** entram por `next/font/google` em
  `app/layout.tsx`, com as variáveis `--font-display` e `--font-mono`.
  `next/font` baixa e serve as fontes no build: **não há request de runtime** e
  a CSP do Tauri (`font-src 'self' data:`) já cobre. **Não** adicionar
  `fonts.googleapis.com` por URL — quebraria o desktop.
- Tailwind ganha `fontFamily.display` e `fontFamily.mono`; `fontFamily.sans`
  (Noto Sans) fica intacta.

| Onde | Fonte | Peso | Caixa | Tracking |
|---|---|---|---|---|
| Wordmark, `<h1>` de auth/convite/boas-vindas | Archivo | 800 | ALTA | `-0.045em` |
| Título de modal, título de seção de configurações | Archivo | 700 | normal | `-0.02em` |
| Categorias do sidebar (12px caixa-alta) | Archivo | 700 | ALTA | **`+0.02em`** |
| Corpo, mensagem, listas, botões | Noto Sans | 400–600 | — | 0 |
| Código, código de convite, IDs, atalhos | JetBrains Mono | 400 | — | 0 |

> **Tracking negativo só a partir de 24px.** O `-4,5%` do pacote é para display;
> aplicado a caixa-alta de 12px ele cola as letras e destrói a legibilidade das
> categorias. É a regra mais fácil de errar neste rebranding.

---

## 5. Assets

Componente único em vez de arquivos duplicados:

- `components/ui/Marca.tsx` — o símbolo em `currentColor` (substitui `Corvo.tsx`).
- `components/ui/MarcaLockup.tsx` — símbolo + wordmark **em texto real** Archivo.
  Dentro do app o wordmark é texto: escala, seleciona, é acessível e não depende
  de conversão em curvas.

Arquivos estáticos a gerar a partir do pacote:

| Destino | Fonte | Observação |
|---|---|---|
| `apps/web/app/icon.svg` | `logo-simbolo-limao.svg` | o Next serve como favicon |
| `apps/web/app/apple-icon.png` (180) | `icone-app-1024.svg` | |
| `apps/web/app/opengraph-image.png` (1200×630) | `og-image-1200x630.svg` | **texto em curvas** |
| `apps/web/app/manifest.ts` | — | `theme_color`/`background_color` = `#0B0B0F`, ícones 192/512 maskable |
| `apps/web/app/layout.tsx` | — | `metadata.openGraph` + `themeColor` (hoje inexistentes) |
| `apps/desktop/logo.svg` | `logo-simbolo-limao.svg` | |
| `apps/desktop/src-tauri/icons/*` | PNG 1024 do ícone | `pnpm tauri icon` regenera `.ico`/`.icns`/android/ios |

**Curvas:** o `LEIA-ME.txt` avisa que os lockups usam `<text>` com Archivo. Só os
**arquivos estáticos externos** (og-image, lockups de divulgação) precisam de
conversão — dentro do app o wordmark é texto real com a fonte já carregada.
Sem Illustrator/Figma aqui, a conversão sai por `resvg`/`opentype.js`; a
alternativa é rasterizar a og-image direto em PNG, que é o formato que ela
precisa ter de qualquer jeito.

**URL canônica:** `WEB_PUBLIC_URL` já existe no `.env.example` e é o que o
`metadata.metadataBase` deve consumir para a og-image resolver em produção.

---

## 6. Sequência de entrega

Branch `feat/rebranding-marca`. Cada item é um commit; a ordem importa porque
os primeiros deixam o app funcionando e feio, e os seguintes o corrigem.

### Fase 0 — fundação (nenhuma mudança visual)

1. `chore(marca): move o pacote para docs/branding e arquiva o corvo`
   — corrige o typo `brading` → `branding`; corvo vai para
   `docs/branding/descartado/` com uma nota de duas linhas do porquê.
2. `docs(adr): registra a identidade Volt Lime` — ADR-0004. O trade-off real:
   **abandona a paridade visual com o Discord** que o `design.md` exigia como
   meta explícita. Isso é uma decisão arquitetural de produto, não um detalhe
   de CSS.

### Fase 1 — cor

3. `feat(web): reancora os tokens no Void Ink e adota o Volt Lime`
   — só `tailwind.config.ts` e `globals.css` (body, anel de foco `#9BE31F`,
   scrollbar). O app inteiro muda de cara em um commit, e o typecheck passa.
4. `fix(web): usa Void Ink sobre o accent` — §3. **O commit de maior risco.**
5. `refactor(web): troca os hex soltos pelos tokens de borda`
   — ~145 literais viram `border`, `border-strong`, `overlay`. Sem isso metade
   da UI fica com bordas cinza-azuladas do Discord sobre superfícies Void Ink,
   e o resultado parece um bug, não uma marca.

### Fase 2 — tipografia

6. `feat(web): adiciona Archivo e JetBrains Mono` — `layout.tsx` + tailwind.
7. `feat(web): aplica Archivo nos títulos` — `AuthCard`, `Dialog`, boas-vindas
   de canal, convite, `WelcomeModal`, telas vazias, `SettingsShell`, categorias
   do sidebar (com o tracking positivo da §4).

### Fase 3 — símbolo

8. `feat(web): substitui o corvo pelo símbolo da marca`
   — `Marca.tsx`, `AuthCard` (o fundo blurple vira Void Ink com o símbolo em
   lime), `icon.svg`, `apple-icon`, `opengraph-image`, `manifest.ts`, metadata.
9. `chore(desktop): regenera os ícones do Tauri`.

### Fase 4 — coerência semântica

10. `feat(web): afasta verde e amarelo do lime e repagina o avatar padrão`
    — `green`/`yellow` novos, `STATUS_COLOR`, `Avatar.PALETTE` e a cor de menção
    do `lib/markdown.tsx` (`#c9cdfb`, um azul tingido de blurple, vira um lime
    claro sobre `accent/15`).

    `Avatar.PALETTE` hoje são as 5 cores da marca do Discord. Proposta sem
    nenhum verde-limão, luminâncias equilibradas para o texto Paper por cima:
    `#4C7EF3` · `#0E9F8A` · `#C2701C` · `#D24A7B` · `#7C5CF0`.

### Fase 5 — documentação

11. `docs: atualiza design.md para a identidade Volt Lime`
    — reescreve a tabela de tokens e a seção de tipografia; a referência Discord
    deixa de ser meta de paridade e passa a valer só para **leiaute e
    densidade**. O princípio 1 (escuro por padrão) fica; o 4 ganha as regras do
    lime da §2.

---

## 7. Verificação

Reproduzir a sequência do CI, na ordem:

```bash
pnpm --filter @streamz/shared build
pnpm --filter @streamz/api exec tsc --noEmit
pnpm --filter @streamz/web exec tsc --noEmit
pnpm --filter @streamz/web test
pnpm --filter @streamz/web build
```

Visual — a verificação que realmente pega este tipo de regressão:

```bash
node scripts/e2e-visual.mjs --out ./e2e-shots-antes    # antes da fase 1
node scripts/e2e-visual.mjs --out ./e2e-shots-depois   # após a fase 4
```

Checagens manuais que nenhum teste cobre:

- Botão primário em cada modal — texto legível sobre o lime.
- Bolinha de status ONLINE ao lado de um item de rail ativo (lime).
- Categorias do sidebar — o tracking não colou as letras.
- Aba Aparência: `saturação` a 150% e `zoom` a 150% — o filtro `saturate` do
  `globals.css` satura o lime muito mais rápido que o blurple.
- Desktop: build do Tauri, ícone na barra de tarefas, e a fonte carregando sob
  a CSP.

---

## 8. Riscos

| Risco | Onde | Mitigação |
|---|---|---|
| Branco sobre lime (1,57:1) | ~30 botões primários | §3: grep de coocorrência, não de `text-white` |
| Verde de status × lime | rail, membros, avatar | `green` → `#1FB86B`; status nunca sobre lime |
| Tracking `-4,5%` em caps 12px | categorias do sidebar | regra "só ≥24px" da §4 |
| Bordas Discord sobrando | ~145 hex soltos | fase 1 item 5 é obrigatório, não opcional |
| Lockup dependendo de Archivo instalada | assets externos | curvas só nos estáticos; no app é texto real |
| Google Fonts por URL na CSP do Tauri | `layout.tsx` | `next/font` self-hosted; não adicionar host |

## 9. Fora de escopo

Leiaute, densidade, componentes, movimento e cópia. **Tema claro continua fora
do MVP** — o Paper `#FDFDFB` entra só como cor de texto e de marca, não como
superfície. Se o tema claro voltar à mesa, é outro plano: a regra "limão só
sobre escuro" implica um accent alternativo para superfície clara, que o pacote
de marca ainda não define.
