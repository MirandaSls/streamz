# NewDisc — sistema de design

Referência visual: **Discord** (via stoatchat / Revolt). Interface densa, escura,
funcional — informação em primeiro lugar, cromo mínimo. Este documento fixa os
padrões para que telas novas pareçam parte do mesmo app. Fonte da verdade dos
tokens: `apps/web/tailwind.config.ts` e `apps/web/app/globals.css`.

## Princípios

1. **Escuro por padrão.** `color-scheme: dark`. Sem tema claro no MVP.
2. **Densidade sobre respiro.** Muitas mensagens/canais na tela; padding curto,
   linhas próximas. Não é uma landing page.
3. **Ação no hover, não no layout.** Editar, apagar, reagir, responder aparecem no
   hover da mensagem (`group-hover`) — a linha em repouso mostra só conteúdo.
4. **Cor com parcimônia.** O accent (roxo) marca o estado ativo e ações
   primárias. O resto é escala de cinza. Texto colorido = link/ação.

## Layout

App de **3 colunas** fixas sobre a área principal (`app/app/page.tsx`):

```
┌────┬──────────────┬───────────────────────────┬──────────────┐
│rail│ lista de     │ área principal            │ membros /    │
│72px│ canais/DMs   │ (chat, voz ou thread)     │ thread       │
│    │ w-60         │ flex-1                    │ w-[22rem]    │
└────┴──────────────┴───────────────────────────┴──────────────┘
```

- **Rail** (`w-[72px]`, `bg-rail`): servidores + DMs. Ícone ativo vira `bg-accent`;
  inativo `bg-panel`. Botões redondos `rounded-2xl`, `h-12 w-12`.
- **Coluna 2** (`w-60`, `bg-panel`): lista de canais (ou de DMs). Cabeçalho e
  rodapé com borda `border-black/20`; item ativo `bg-black/30 text-white`, inativo
  `text-neutral-400`.
- **Área principal** (`flex-1`, `bg-chat`): assume chat de texto, painel de voz
  (`VoicePanel`) ou continua o chat com a thread aberta à direita.
- **Coluna 4** (`w-[22rem]`): alterna entre lista de membros e painel de thread —
  nunca as duas ao mesmo tempo.

## Tokens de cor

Definidos como cores Tailwind (use as classes utilitárias, não o hex cru):

| Token / classe | Hex | Uso |
|----------------|-----|-----|
| `rail`   | `#1e1f22` | rail de servidores, barras mais escuras, campos internos |
| `panel`  | `#2b2d31` | colunas laterais, modais, cabeçalhos |
| `chat`   | `#313338` | fundo da área de mensagens (= `body`) |
| `accent` | `#5865f2` | estado ativo, botão primário, links/ações |

Cinzas de texto (Tailwind `neutral`): título/nome de autor `text-white`; corpo de
mensagem `text-neutral-200`; secundário/rótulo `text-neutral-400`; metadado/
timestamp `text-neutral-500`; apagado/desabilitado `text-neutral-600`.

Superfícies translúcidas para camadas sobre um fundo já escuro: hover de mensagem
`hover:bg-black/10`, item ativo `bg-black/30`, bordas `border-black/20`,
overlay de modal `bg-black/60`.

## Tipografia

- Família: system stack (`ui-sans-serif, system-ui, -apple-system, "Segoe UI",
  Roboto, sans-serif`). Sem webfont.
- Escala prática: corpo `text-sm`; metadados/timestamps `text-xs`; títulos de
  seção `font-semibold`/`font-bold text-lg`. Nome do autor `font-semibold`.
- `font-mono` só para código/valores literais (ex.: código de convite).

## Espaçamento e forma

- Grid base de 4px (utilitários Tailwind). Padding típico de container:
  `px-4 py-3`; de item de lista: `px-2 py-1`.
- Raios: elementos de chat/itens `rounded` / `rounded-lg`; botões do rail e avatares
  `rounded-2xl` / `rounded-full`; modais `rounded-lg`.
- Sombra só onde há elevação real: modais (`shadow-xl`) e popovers (`shadow-lg`).

## Padrões de componente

- **Mensagem** (`components/MessageItem.tsx`): nome + timestamp na linha de topo,
  conteúdo abaixo, depois anexos → link de thread → reações. Barra de ações
  flutuante no `group-hover` (reagir/responder/editar/apagar), filtrada por
  permissão (`isOwn`, `canModerate`). "(editado)" em itálico discreto.
- **Anexos:** imagem reconhecida renderiza inline (`max-h-80 max-w-md rounded-lg
  object-contain`, linkando o original); qualquer outro arquivo vira card
  `bg-rail` com 📎 + nome + tamanho. Preview no composer usa thumb `h-10 w-10
  object-cover` com botão ✕ de remover.
- **Reações:** pílula `rounded-full` com borda; a minha fica `border-accent
  bg-accent/20 text-white`, as outras em cinza com hover de borda.
- **Modal:** overlay `fixed inset-0 bg-black/60` fechável por clique fora; caixa
  `bg-panel rounded-lg p-6 shadow-xl`, largura fixa (`w-[360px]`–`w-[400px]`),
  `stopPropagation` no corpo. Botão primário `bg-accent`, secundário `bg-rail`,
  desabilitado `disabled:opacity-40`.
- **Campo de texto:** `bg-rail` (ou `bg-panel` no composer) `rounded`, `outline-none`,
  `text-sm`. Sem borda em repouso — o contraste de superfície já delimita.
- **Composer:** o `+` abre o seletor de arquivo; a área aceita drag-drop e colar
  (durante o arraste, o placeholder muda e o form ganha `opacity-70`).

## Ícones

Emoji como ícone (sem biblioteca): `#`/🔒/🔊 (tipo de canal), 📢 (somente
leitura), 💬 (thread), 😊 (reagir), ✏️/🗑️ (editar/apagar), 📎 (arquivo), ✉️
(DMs), 👥 (grupo), 🔗 (convite). Ao criar tela nova, reaproveite o vocabulário
existente antes de introduzir um símbolo novo.

## Estados a nunca esquecer

- **Vazio:** toda lista tem texto de vazio em `text-neutral-500` explicando o
  próximo passo (ex.: "Nenhuma conversa. Abra uma pelo 💬…").
- **Carregando:** ações assíncronas travam o disparo (`disabled`, "Enviando…").
- **Sem permissão:** canal somente-leitura mostra aviso no lugar do composer.
- **Foco/teclado:** inputs de edição usam `autoFocus`; Esc cancela, Enter salva.
