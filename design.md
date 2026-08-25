# NewDisc — sistema de design

Referência visual: **Discord** (tema escuro, 2024+). A meta é ser indistinguível
na paleta, na tipografia, no leiaute e nos componentes — não "inspirado". Este
documento fixa os padrões para que telas novas pareçam parte do mesmo app.
Fonte da verdade dos tokens: `apps/web/tailwind.config.ts` e
`apps/web/app/globals.css`.

## Princípios

1. **Escuro por padrão.** `color-scheme: dark`. Sem tema claro no MVP.
2. **Densidade sobre respiro.** Muitas mensagens/canais na tela; padding curto,
   linhas próximas. Não é uma landing page.
3. **Ação no hover, não no layout.** Editar, apagar, reagir, responder aparecem no
   hover da mensagem (`group-hover`) — a linha em repouso mostra só conteúdo.
4. **Cor com parcimônia.** O blurple marca o estado ativo e ações primárias. O
   resto é a escala de cinza do Discord. Texto colorido = link/ação.
5. **Ícone é SVG, nunca emoji.** `lucide-react`, traço 2px, 20px em listas e 24px
   em toolbars. Emoji só como *conteúdo* (reações, texto do usuário).

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
  `green`. Separador de 2px `#35363c`.
- **Coluna 2** (`w-60`, `bg-panel`): cabeçalho de **48px** com `shadow-header`
  (nome do servidor + chevron → menu); categorias em caixa-alta 12px
  (`text-txt-muted`) colapsáveis; item de canal de **32px** (`h-8`), ícone 20px
  `text-txt-faint`, hover `bg-hov text-txt-normal`, ativo `bg-sel text-txt-primary`.
  Rodapé = **painel do usuário** (52px, `bg-footer`): avatar com status, nome,
  status em texto, botões mic / áudio / engrenagem.
- **Área principal** (`flex-1`, `bg-chat`): cabeçalho de 48px (`HeaderBar`: ícone
  + nome, toolbar à direita com busca que expande ao focar), timeline, composer,
  linha de "digitando…" (24px).
- **Coluna 4**: lista de membros (`w-60`, seções ONLINE/OFFLINE, offline a 30%)
  ou painel de thread (`w-[26rem]`, `bg-chat`) — nunca as duas ao mesmo tempo.
  O botão de membros do cabeçalho alterna a lista.

## Tokens de cor (classes Tailwind)

| Classe | Hex | Discord | Uso |
|---|---|---|---|
| `rail` | `#1e1f22` | background-tertiary | rail, inputs escuros, tooltips |
| `panel` | `#2b2d31` | background-secondary | colunas laterais, rodapé de modal |
| `chat` | `#313338` | background-primary | área de mensagens, corpo de modal |
| `footer` | `#232428` | background-secondary-alt | painel do usuário |
| `input` | `#383a40` | channeltextarea | composer, campo de edição |
| `hov` | `#35373c` | modifier-hover | hover de item de lista |
| `sel` | `#404249` | modifier-selected | item ativo |
| `msghov` | `#2e3035` | — | hover de mensagem |
| `accent` / `accent-hover` | `#5865f2` / `#4752c4` | brand | ativo, botão primário |
| `green` | `#23a559` | status-positive | online, botões "novo" |
| `yellow` | `#f0b232` | status-warning | ausente, coroa do dono |
| `red` / `red-hover` | `#f23f43` / `#da373c` | status-danger | não perturbe, destrutivo |
| `txt-primary` | `#f2f3f5` | header-primary | títulos, nome do autor |
| `txt-normal` | `#dbdee1` | text-normal | corpo da mensagem |
| `txt-secondary` | `#b5bac1` | interactive-normal | ícones de toolbar |
| `txt-muted` | `#949ba4` | text-muted | timestamps, categorias |
| `txt-faint` | `#80848e` | channels-default | canal em repouso, offline |
| `txt-link` | `#00a8fc` | text-link | links, "N respostas" |

Menus de contexto, popovers e toasts usam `#111214`. Linhas divisórias: `#3f4147`.

## Tipografia

- Família: **Noto Sans** via `next/font` (fallback oficial da "gg sans" do
  Discord), pesos 400/500/600/700. Variável `--font-sans`.
- Corpo **16px / 1.375** (`text-base`); metadados 12px (`text-xs`); hora na
  margem 11px; categorias 12px caixa-alta 600; título de modal 20px 700; título
  de boas-vindas do canal 32px 700.
- Nome do autor `font-medium text-txt-primary`; corpo `text-txt-normal`.
- `font-mono` só para código/valores literais (ex.: código de convite).

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
  bg-accent/20`; hover `border-[#4e5058]`; "+" de reação aparece no hover.
- **Composer**: caixa `bg-input rounded-lg` com `CirclePlus` (anexo) à esquerda e
  presente / GIF / figurinha / emoji à direita; contador só a partir de 90% do
  teto. Sem dica textual de teclado. Preview de anexo em cards de 184px.
- **Modal** (`Dialog`): corpo `bg-chat` (`p-4`, título 20px), rodapé `bg-panel`
  com botão primário à direita (`h-[38px] rounded-[3px] bg-accent`) e "Cancelar"
  como texto com sublinhado no hover. Overlay `bg-black/60`, Esc/clique fora fecham.
- **Menu de contexto** (`ContextMenuHost`): `#111214`, itens de 32px, hover
  `bg-accent` (ou `bg-red` para destrutivo), separadores `#3f4147`.
- **Popover de perfil** (`ProfilePopoverHost`): 300px, faixa `accent` de 60px,
  avatar 80px sobreposto, card `bg-footer` com nome, @usuário, status e "Enviar
  mensagem".
- **Tooltip** (`Tooltip`): `bg-rail`, 14px 600, seta, hover e foco.
- **Avatar** (`Avatar`): iniciais sobre uma das 5 cores da marca (hash do id);
  bolinha de status com borda na cor da superfície (`surface`).
- **Login/registro** (`AuthCard`): fundo blurple, card de 480px `bg-chat`,
  rótulos 12px caixa-alta com asterisco vermelho, inputs `bg-rail h-10`, botão
  `h-11`.

## Ícones (lucide)

`Hash` texto · `Volume2` voz · `Lock` privado · `Megaphone` somente leitura ·
`MessageSquare` thread/DM · `SmilePlus` reagir · `Pencil` editar · `Trash2` apagar ·
`MoreHorizontal` mais · `CirclePlus` anexar · `Gift`/`Sticker`/`Smile` composer ·
`Users` membros/grupo · `Crown` dono · `UserX` expulsar · `Gavel` banir ·
`Mic`/`MicOff` · `Headphones`/`HeadphoneOff` · `Settings` · `Plus` novo ·
`Compass` explorar · `Pin` · `Bell` · `Inbox` · `HelpCircle` · `Search` · `X` fechar.

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
