# Variáveis CSS do cliente do Discord

Coleta: **2026-09-11**. Fonte: os bundles CSS públicos carregados por `https://discord.com/login` e `/invite/...` (mesmo CSS do app logado), em `css-bruto/`. Valores finais medidos no Chrome (ver `README.md`).

## Como ler

O `<html>` do login deslogado vem com `platform-web theme-dark theme-darker images-dark density-default font-size-16 has-webkit-scrollbar full-motion app-focused visual-refresh`.

Os temas da *visual refresh* são combinações de classes. Nomes na UI atual (Aparência) — o mapeamento classe → nome é inferência pelos valores, não está escrito no CSS:

| coluna aqui | classes no `<html>` | nome provável na UI |
| --- | --- | --- |
| **escuro** | `theme-dark theme-darker` | Dark (padrão do login deslogado) |
| **claro** | `theme-light` | Light |
| cinza | `theme-dark` | Ash |
| onyx | `theme-dark theme-midnight` | Onyx |

Todas as medições incluem `visual-refresh density-default`. Cores com 8 dígitos têm alfa (`#rrggbbaa`) e são **translúcidas**: a cor vista depende do fundo por baixo.

O CSS guarda a paleta como `--x-hsl` (tripla HSL com `--saturation-factor`, que o app baixa na opção de saturação reduzida) e `--x: hsl(var(--x-hsl)/1)`. Os temas então apontam para a paleta, e dentro de `@supports (color-mix)` sobrescrevem 335 tokens por versões `color-mix(in oklab, …)` — é essa versão que um navegador atual usa.

## Os tokens mais relevantes para o clone

Uso: onde o token aparece no CSS do app (seletores reais citados quando conferidos nos chunks sob demanda; o resto é pelo nome).

### Fundos / layout

| token | uso | escuro | claro | cinza | onyx |
| --- | --- | --- | --- | --- | --- |
| `--background-base-lowest` | rail de servidores, lista de canais/DMs, barra de título, moldura do chat (`.wrapper_ef3116`, `.container__2637a`, `.privateChannels_e6b769`, `.chat_f75fb0`) | `#121214` | `#f3f3f4` | `#2c2d32` | `#000000` |
| `--background-base-lower` | área das mensagens (`.chatContent_f75fb0`), lista de membros (`--custom-channel-members-bg`), cabeçalho do canal (`--__header-bar-background`) | `#1a1a1e` | `#fbfbfb` | `#323339` | `#000000` |
| `--background-base-low` | painel do usuário no rodapé da lista de canais (`.panels__5e434`), conteúdo das configurações | `#202024` | `#fbfbfb` | `#36373e` | `#000000` |
| `--background-surface-high` | popouts, menus, cards, cabeçalho de popout | `#242429` | `#ffffff` | `#393a41` | `#0a0a0c` |
| `--background-surface-higher` | superfície elevada (menu aberto, barra flutuante) | `#28282d` | `#ffffff` | `#3c3d45` | `#121214` |
| `--background-surface-highest` | superfície mais alta (tooltips/overlays) | `#2c2d32` | `#ffffff` | `#3f4048` | `#17181b` |
| `--app-frame-border` | borda fina entre rail e lista de canais (`.sidebarList__5e434`) | `#94949c1f` | `#97979e47` | `#94949c1f` | `#9696a033` |
| `--app-frame-background` | rail com o experimento `refresh-fast-follow-guild-bg` | `#070709` | `#e8e8ea` | `#25262a` | `#000000` |
| `--chat-background-default` | caixa do composer (`.channelTextArea_f75fb0`) | `#222327` | `#ffffff` | `#393a41` | `#101013` |
| `--modal-background` | modal | `#242429` | `#ffffff` | `#393a41` | `#0a0a0c` |
| `--modal-footer-background` | rodapé do modal | `#242429` | `#ffffff` | `#393a41` | `#0a0a0c` |
| `--background-scrim` | véu atrás do modal | `#000000b8` | `#00000085` | `#000000b8` | `#000000b8` |
| `--home-background` | home (amigos) e páginas vazias | `#27272c` | `#fbfbfb` | `#292a2f` | `#27272c` |
| `--card-background-default` | card | `#242429` | `#ffffff` | `#393a41` | `#0a0a0c` |
| `--embed-background` | embed de link | `#242429` | `#ffffff` | `#393a41` | `#0a0a0c` |
| `--background-code` | bloco de código | `#5966f214` | `#4d66e60a` | `#5966f214` | `#5966f214` |

### Texto e ícones

| token | uso | escuro | claro | cinza | onyx |
| --- | --- | --- | --- | --- | --- |
| `--text-strong` | títulos, nome do servidor | `#fbfbfb` | `#28282d` | `#ffffff` | `#dcdcdf` |
| `--text-default` | texto normal da mensagem | `#efeff1` | `#2e2e34` | `#f3f3f4` | `#d4d5d8` |
| `--text-subtle` | texto secundário | `#abacb2` | `#595a63` | `#c5c6ca` | `#96979e` |
| `--text-muted` | texto apagado, timestamps | `#96979e` | `#6c6d76` | `#abacb2` | `#81828a` |
| `--text-link` | link | `#4d96ee` | `#006dd4` | `#76aff6` | `#2781e7` |
| `--text-brand` | texto na cor da marca | `#798df9` | `#525fe0` | `#94a8ff` | `#6374f4` |
| `--text-code` | código inline/bloco | `#e4e4e6` | `#36373e` | `#ffffff` | `#c9cace` |
| `--channels-default` | nome de canal na lista | `#81828a` | `#666770` | `#999aa1` | `#7a7b83` |
| `--channel-icon` | ícone # do canal | `#81828a` | `#666770` | `#999aa1` | `#7a7b83` |
| `--icon-default` | ícone padrão | `#efeff1` | `#2e2e34` | `#f3f3f4` | `#d4d5d8` |
| `--icon-muted` | ícone apagado | `#96979e` | `#6c6d76` | `#abacb2` | `#81828a` |
| `--textbox-markdown-syntax` | sintaxe markdown no composer | `#96979e` | `#41424a` | `#999aa1` | `#96979e` |

### Interação (hover/selecionado)

| token | uso | escuro | claro | cinza | onyx |
| --- | --- | --- | --- | --- | --- |
| `--interactive-text-default` | item de lista em repouso | `#abacb2` | `#595a63` | `#c5c6ca` | `#96979e` |
| `--interactive-text-hover` | item em hover | `#fbfbfb` | `#28282d` | `#ffffff` | `#dcdcdf` |
| `--interactive-text-active` | item selecionado | `#fbfbfb` | `#28282d` | `#ffffff` | `#dcdcdf` |
| `--interactive-background-hover` | fundo em hover (canal, membro, menu) | `#94949c1f` | `#94949c1f` | `#94949c1f` | `#94949c1f` |
| `--interactive-background-selected` | fundo do item selecionado | `#9696a033` | `#96969f3d` | `#9696a033` | `#96969f3d` |
| `--interactive-background-active` | fundo pressionado | `#9595a229` | `#9595a229` | `#9595a229` | `#9696a033` |
| `--interactive-muted` | canal silenciado | `#4f505a` | `#c9cace` | `#4f505a` | `#4f505a` |
| `--background-mod-subtle` | modificador sutil sobre qualquer fundo | `#94949c1f` | `#94949c1f` | `#94949c1f` | `#94949c1f` |
| `--background-mod-normal` | modificador médio | `#9595a229` | `#9595a229` | `#9595a229` | `#9696a033` |
| `--background-mod-strong` | modificador forte | `#9696a033` | `#96969f3d` | `#9696a033` | `#96969f3d` |
| `--message-background-hover` | hover da mensagem (`.message__5126c:hover`) | `#94949c1f` | `#94949c1f` | `#94949c1f` | `#94949c1f` |

### Campos

| token | uso | escuro | claro | cinza | onyx |
| --- | --- | --- | --- | --- | --- |
| `--input-background-default` | fundo do input | `#0000001f` | `#00000005` | `#00000014` | `#0000001f` |
| `--input-border-default` | borda do input | `#9696a033` | `#9696a066` | `#9696a033` | `#96969f3d` |
| `--input-border-hover` | borda em hover | `#9696a033` | `#9696a066` | `#9696a033` | `#96969f3d` |
| `--input-border-active` | borda em foco | `#5865f2` | `#5865f2` | `#5865f2` | `#5865f2` |
| `--input-text-default` | texto digitado | `#efeff1` | `#2e2e34` | `#f3f3f4` | `#d4d5d8` |
| `--input-placeholder-text-default` | placeholder | `#8f9097` | `#696a73` | `#a4a5ab` | `#7d7e87` |
| `--border-focus` | anel de foco (teclado) | `#6aa8f4` | `#408eec` | `#6aa8f4` | `#6aa8f4` |

### Marca e botões

| token | uso | escuro | claro | cinza | onyx |
| --- | --- | --- | --- | --- | --- |
| `--brand-500` | blurple da marca | `#5865f2` | `#5865f2` | `#5865f2` | `#5865f2` |
| `--background-brand` | fundo na cor da marca | `#5865f2` | `#5865f2` | `#5865f2` | `#5865f2` |
| `--control-primary-background-default` | botão primário | `#5865f2` | `#5865f2` | `#5865f2` | `#5865f2` |
| `--control-primary-background-hover` | botão primário em hover | `#4452bb` | `#4452bb` | `#4452bb` | `#4452bb` |
| `--control-primary-background-active` | botão primário pressionado | `#3a48a3` | `#3a48a3` | `#3a48a3` | `#3a48a3` |
| `--control-primary-text-default` | texto do botão primário | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--control-secondary-background-default` | botão secundário | `#94949c1f` | `#94949c1f` | `#94949c1f` | `#94949c1f` |
| `--control-secondary-text-default` | texto do botão secundário | `#fbfbfb` | `#28282d` | `#ffffff` | `#dcdcdf` |
| `--control-critical-primary-background-default` | botão de perigo | `#d22d39` | `#d22d39` | `#d22d39` | `#d22d39` |

### Status e feedback

| token | uso | escuro | claro | cinza | onyx |
| --- | --- | --- | --- | --- | --- |
| `--icon-status-online` | presença online | `#3d9e60` | `#01783e` | `#3d9e60` | `#3d9e60` |
| `--icon-status-idle` | presença ausente | `#ffcb6e` | `#faaa00` | `#ffcb6e` | `#ffcb6e` |
| `--icon-status-dnd` | presença não perturbe | `#dc4247` | `#d22d39` | `#dc4247` | `#dc4247` |
| `--icon-status-offline` | presença offline/invisível | `#9d9ea5` | `#5f606a` | `#9d9ea5` | `#9d9ea5` |
| `--status-danger` | erro/perigo | `#da3e44` | `#d6363f` | `#da3e44` | `#da3e44` |
| `--status-warning` | aviso | `#fdb833` | `#bb7300` | `#fdb833` | `#fdb833` |
| `--status-positive` | sucesso | `#3d9e60` | `#269153` | `#3d9e60` | `#3d9e60` |
| `--badge-notification-background` | badge de não lidas/menções | `#da3e44` | `#d22d39` | `#da3e44` | `#da3e44` |
| `--text-feedback-critical` | texto de erro de campo | `#f87e7a` | `#b92733` | `#ffa09b` | `#eb5f5e` |

### Menções e destaque

| token | uso | escuro | claro | cinza | onyx |
| --- | --- | --- | --- | --- | --- |
| `--mention-background` | pílula @menção | `#5864f23d` | `#5864f23d` | `#5864f23d` | `#5864f23d` |
| `--mention-foreground` | texto da pílula @menção | `#a9bbff` | `#2e3c88` | `#cdd7ff` | `#8ca0fd` |
| `--message-mentioned-background-default` | mensagem que menciona você | `#f2a60014` | `#f2a60014` | `#f2a60014` | `#f2a60014` |
| `--message-mentioned-background-hover` | mensagem que menciona você, em hover | `#ff99000a` | `#f7a5001f` | `#ff99000a` | `#ff99000a` |
| `--message-highlight-background-default` | mensagem destacada (pulo/busca) | `#5764f329` | `#5764f329` | `#5764f329` | `#5764f329` |

### Divisores, rolagem, sombras

| token | uso | escuro | claro | cinza | onyx |
| --- | --- | --- | --- | --- | --- |
| `--border-subtle` | divisor sutil | `#94949c1f` | `#97979e47` | `#94949c1f` | `#9696a033` |
| `--border-normal` | divisor normal | `#9696a033` | `#9696a066` | `#9696a033` | `#96969f3d` |
| `--border-strong` | divisor forte | `#96969f70` | `#97979f85` | `#96969f70` | `#96969f70` |
| `--border-muted` | borda do painel do usuário | `#9999990a` | `#9696a033` | `#9999990a` | `#9595a229` |
| `--scrollbar-thin-thumb` | polegar da barra fina (listas) | `#5f606a` | `#8b8c94` | `#767780` | `#595a63` |
| `--scrollbar-auto-thumb` | polegar da barra do chat | `#666770` | `#8f9097` | `#7d7e87` | `#595a63` |
| `--scrollbar-auto-track` | trilho da barra do chat | `#00000000` | `#00000000` | `#00000000` | `#00000000` |
| `--shadow-low` | sombra baixa | `0 1px 4px 0 rgba(0,0,0,0.14)` | `0 1px 4px 0 rgba(0,0,0,0.08)` | `0 1px 4px 0 rgba(0,0,0,0.14)` | `0 1px 4px 0 rgba(0,0,0,0.14)` |
| `--shadow-medium` | sombra média | `0 4px 8px 0 rgba(0,0,0,0.16)` | `0 4px 8px 0 rgba(0,0,0,0.08)` | `0 4px 8px 0 rgba(0,0,0,0.16)` | `0 4px 8px 0 rgba(0,0,0,0.16)` |
| `--shadow-high` | sombra alta (popouts) | `0 12px 24px 0 rgba(0,0,0,0.24)` | `0 12px 36px 0 rgba(0,0,0,0.12)` | `0 12px 24px 0 rgba(0,0,0,0.24)` | `0 12px 24px 0 rgba(0,0,0,0.24)` |
| `--shadow-border` | contorno de 1px como sombra | `0 0 0 1px rgba(255,255,255,0.08)` | `0 0 0 1px rgba(0,0,0,0.08)` | `0 0 0 1px rgba(255,255,255,0.08)` | `0 0 0 1px rgba(255,255,255,0.08)` |

## Layout do app (conferido no CSS dos chunks sob demanda)

| peça | seletor | regra |
| --- | --- | --- |
| rail de servidores | `.wrapper_ef3116` | `background-color: var(--background-base-lowest); width: var(--custom-guild-list-width)` (= 40px de avatar + padding) |
| lista de canais | `.container__2637a`, `.privateChannels_e6b769` | `background: var(--background-gradient-high, var(--background-base-lowest))` |
| borda rail ↔ canais | `.sidebarList__5e434` | `border-top` e `border-inline-start: 1px solid var(--app-frame-border)` |
| painel do usuário | `.panels__5e434` | `background: var(--background-base-low); border: 1px solid var(--border-muted); border-radius: var(--radius-sm)` e margem `--space-xs` |
| chat (moldura) | `.chat_f75fb0` | `background: var(--background-base-lowest)` |
| chat (mensagens) | `.chatContent_f75fb0` | `background: var(--background-base-lower)` |
| cabeçalho do canal | `.container__9293f` | `--__header-bar-background: var(--background-base-lower)`, altura `--custom-channel-header-height` |
| composer | `.channelTextArea_f75fb0` | `background: var(--chat-background-default)` |
| lista de membros | `.members_c8ffbb` | `background: var(--custom-channel-members-bg)` = `--background-base-lower`; largura `--custom-member-list-width` 264px (256 compacto, 268 confortável) |
| barra de título do app | `.titleBar__0bd4a`, `.bg__960e4` | `--background-base-lowest`; altura `--custom-app-top-bar-height` 32px (24/40 nas variantes) |
| configurações | `.sidebarRegionScroller__23e6b` / `.contentRegion__23e6b` | lateral `--background-base-lowest`, conteúdo `--background-base-low` |

Os `--background-gradient-*` são os temas com gradiente (Nitro): o JS grava `--custom-background-gradient-*-color/opacity` inline e o fallback de cada `var()` é o tema sólido.

## Escopos encontrados

| escopo | variáveis |
| --- | ---: |
| `:root` | 4072 |
| `.visual-refresh` | 472 |
| `.theme-dark` | 622 |
| `.theme-darker` | 586 |
| `.theme-midnight` | 586 |
| `.theme-light` | 619 |
| `@supports (color:color-mix(in lch,red,blue)) .theme-dark` | 335 |
| `@supports (color:color-mix(in lch,red,blue)) .theme-light` | 335 |
| `@supports (color:color-mix(in lch,red,blue)) .theme-midnight` | 335 |
| `@supports (color:color-mix(in lch,red,blue)) .theme-darker` | 335 |
| `.high-contrast-mode .theme-dark,.high-contrast-mode.theme-dark` | 204 |
| `.high-contrast-mode .theme-light,.high-contrast-mode.theme-light` | 204 |
| `.high-contrast-mode .theme-midnight,.high-contrast-mode.theme-midnight` | 204 |
| `.high-contrast-mode .theme-darker,.high-contrast-mode.theme-darker` | 204 |
| `@supports (color:color-mix(in lch,red,blue)) .high-contrast-mode .theme-dark,.high-contrast-mode.theme-dark` | 142 |
| `@supports (color:color-mix(in lch,red,blue)) .high-contrast-mode .theme-light,.high-contrast-mode.theme-light` | 142 |
| `@supports (color:color-mix(in lch,red,blue)) .high-contrast-mode .theme-midnight,.high-contrast-mode.theme-midnight` | 142 |
| `@supports (color:color-mix(in lch,red,blue)) .high-contrast-mode .theme-darker,.high-contrast-mode.theme-darker` | 142 |
| `.mobile-visual-refresh` | 113 |
| `.mobile-visual-refresh-floating` | 33 |
| `.theme-darker,.theme-midnight` | 26 |
| `.custom-theme-background` | 18 |
| `.density-compact` | 12 |
| `.custom-user-profile-theme.theme-dark` | 11 |
| `.custom-user-profile-theme.theme-light` | 11 |
| `.density-cozy` | 11 |
| `.density-default` | 10 |
| `.theme-dark.custom-theme-background` | 9 |
| `.theme-light.custom-theme-background` | 9 |
| `:root:lang(bg),:root:lang(el),:root:lang(ru),:root:lang(uk)` | 8 |
| `:root:lang(ko)` | 8 |
| `:root:lang(ja)` | 8 |
| `:root:lang(zh-CN)` | 8 |
| `:root:lang(zh-TW)` | 8 |
| `.theme-dark.custom-theme-background.custom-client-theme` | 7 |
| `.theme-light.custom-theme-background.custom-client-theme` | 7 |
| `:root .custom-user-profile-theme.theme-dark` | 6 |
| `:root .custom-user-profile-theme.theme-light` | 6 |
| `.mobile-visual-refresh-legacy-send-button` | 6 |
| `:root .user-profile-sidebar.user-profile-sidebar-redesign` | 3 |
| `.custom-theme-background .theme-dark,.theme-dark.custom-theme-background` | 3 |
| `.custom-theme-background .theme-light,.theme-light.custom-theme-background` | 3 |
| `:root .user-profile-sidebar` | 2 |
| `.refresh-fast-follow-avatars.density-compact` | 2 |
| `.refresh-fast-follow-avatars.density-cozy,.refresh-fast-follow-avatars.density-default` | 2 |
| `@supports (color:color-mix(in lch,red,blue)) .custom-theme-background:not(.custom-client-theme)` | 2 |
| `.refresh-fast-follow-avatars` | 2 |
| `:where(:root) .theme-midnight` | 1 |
| `:where(:root) .theme-darker` | 1 |
| `:where(:root) .theme-dark` | 1 |
| `:where(:root) .theme-light` | 1 |
| `@media (-webkit-max-device-pixel-ratio:1.5) .theme-light` | 1 |
| `.platform-osx` | 1 |
| `.high-contrast-mode,.high-contrast-mode .theme-light,.high-contrast-mode.theme-light,.high-contrast-mode .theme-dark,.high-contrast-mode.theme-dark,.high-contrast-mode .theme-darker,.high-contrast-mode.theme-darker,.high-contrast-mode .theme-midnight,.high-contrast-mode.theme-midnight` | 1 |
| `[sob-demanda/2ebfdf9d6f68a8bf.css] :root` | 3406 |
| `[sob-demanda/2ebfdf9d6f68a8bf.css] .theme-dark` | 690 |
| `[sob-demanda/2ebfdf9d6f68a8bf.css] .theme-light` | 690 |
| `[sob-demanda/2ebfdf9d6f68a8bf.css] .theme-midnight` | 690 |
| `[sob-demanda/2ebfdf9d6f68a8bf.css] .theme-darker` | 690 |
| `[sob-demanda/451094.88bae068e674db05.css] :host,:root` | 492 |
| `[sob-demanda/451094.88bae068e674db05.css] :root` | 54 |

Os escopos com prefixo `[sob-demanda/…]` vêm de chunks do app logado e **não** entram na resolução. `2ebfdf9d6f68a8bf.css` redefine quase tudo com `hotpink` (folha de depuração); `451094…css` é outro design system (`--primitive-color-*`) de uma superfície específica. Escopos pequenos desses chunks estão só no JSON.

## Todos os tokens semânticos (por tema)

São 858 nomes (sem os `-hsl`) definidos em `.theme-*`, `.visual-refresh` e nos `@supports`. Cada célula é o valor final no tema.

### background (48)

| token | escuro | claro | cinza | onyx |
| --- | --- | --- | --- | --- |
| `--app-frame-background` | `#070709` | `#e8e8ea` | `#25262a` | `#000000` |
| `--app-frame-border` | `#94949c1f` | `#97979e47` | `#94949c1f` | `#9696a033` |
| `--background-accent` | `#393a41` | `#6c6d76` | `#41424a` | `#2c2d32` |
| `--background-base-low` | `#202024` | `#fbfbfb` | `#36373e` | `#000000` |
| `--background-base-lower` | `#1a1a1e` | `#fbfbfb` | `#323339` | `#000000` |
| `--background-base-lowest` | `#121214` | `#f3f3f4` | `#2c2d32` | `#000000` |
| `--background-brand` | `#5865f2` | `#5865f2` | `#5865f2` | `#5865f2` |
| `--background-code` | `#5966f214` | `#4d66e60a` | `#5966f214` | `#5966f214` |
| `--background-code-addition` | `#0084421f` | `#0084421f` | `#0084421f` | `#0084421f` |
| `--background-code-deletion` | `#d6293a1f` | `#d6293a1f` | `#d6293a1f` | `#d6293a1f` |
| `--background-feedback-critical` | `#cc333314` | `#cc333314` | `#cc333314` | `#cc333314` |
| `--background-feedback-info` | `#0073e614` | `#0073e614` | `#0073e614` | `#0073e614` |
| `--background-feedback-notification` | `#da3e44` | `#d22d39` | `#da3e44` | `#da3e44` |
| `--background-feedback-positive` | `#00804014` | `#00804014` | `#00804014` | `#00804014` |
| `--background-feedback-warning` | `#f2a60014` | `#f2a60014` | `#f2a60014` | `#f2a60014` |
| `--background-mod-muted` | `#99999914` | `#99999914` | `#99999914` | `#99999914` |
| `--background-mod-normal` | `#9595a229` | `#9595a229` | `#9595a229` | `#9696a033` |
| `--background-mod-strong` | `#9696a033` | `#96969f3d` | `#9696a033` | `#96969f3d` |
| `--background-mod-subtle` | `#94949c1f` | `#94949c1f` | `#94949c1f` | `#94949c1f` |
| `--background-scrim` | `#000000b8` | `#00000085` | `#000000b8` | `#000000b8` |
| `--background-scrim-lightbox` | `#000000eb` | `#000000eb` | `#000000eb` | `#000000eb` |
| `--background-secondary-alt` | `#393a41` | `#ebeced` | `#242429` | `#2c2d32` |
| `--background-surface-high` | `#242429` | `#ffffff` | `#393a41` | `#0a0a0c` |
| `--background-surface-higher` | `#28282d` | `#ffffff` | `#3c3d45` | `#121214` |
| `--background-surface-highest` | `#2c2d32` | `#ffffff` | `#3f4048` | `#17181b` |
| `--background-tile-gradient-pink-end` | `#6700674d` | `#fc98e84d` | `#6700674d` | `#6700674d` |
| `--background-tile-gradient-pink-start` | `#b3249c4d` | `#fce8ff4c` | `#b3249c4d` | `#b3249c4d` |
| `--background-voice-muted` | `#d6293a1f` | `#d6293a1f` | `#d6293a1f` | `#d6293a1f` |
| `--bg-surface-raised` | `#27272c` | `#ffffff` | `#393a41` | `#131416` |
| `--card-background-default` | `#242429` | `#ffffff` | `#393a41` | `#0a0a0c` |
| `--card-border-default` | `#94949c1f` | `#97979e47` | `#94949c1f` | `#9696a033` |
| `--card-primary-pressed-bg` | `#222327` | `#ebeced` | `#292a2f` | `#0c0c0e` |
| `--card-secondary-bg` | `#94949c1f` | `#94949c1f` | `#94949c1f` | `#94949c1f` |
| `--card-secondary-pressed-bg` | `#1a1a1e` | `#ebeced` | `#292a2f` | `#070709` |
| `--channel-background-default` | `#1a1a1e` | `#fbfbfb` | `#323339` | `#000000` |
| `--channeltextarea-background` | `#393a41` | `#ebeced` | `#393a41` | `#131416` |
| `--chat-background` | `#323339` | `#ffffff` | `#323339` | `#000000` |
| `--chat-background-default` | `#222327` | `#ffffff` | `#393a41` | `#101013` |
| `--embed-background` | `#242429` | `#ffffff` | `#393a41` | `#0a0a0c` |
| `--embed-background-alternate` | `#242429` | `#ffffff` | `#393a41` | `#0a0a0c` |
| `--guild-header-text-shadow` | `0 1px 1px hsl(0 0% 0%/0.4)` | `0 1px 1px hsl(0 0% 100%/0.4)` | `0 1px 1px hsl(0 0% 0%/0.4)` | `0 1px 1px hsl(0 0% 0%/0.4)` |
| `--home-background` | `#27272c` | `#fbfbfb` | `#292a2f` | `#27272c` |
| `--message-background-hover` | `#94949c1f` | `#94949c1f` | `#94949c1f` | `#94949c1f` |
| `--mobile-background-scrim-opaque` | `#000000` | `#000000` | `#000000` | `#222327` |
| `--modal-background` | `#242429` | `#ffffff` | `#393a41` | `#0a0a0c` |
| `--modal-footer-background` | `#242429` | `#ffffff` | `#393a41` | `#0a0a0c` |
| `--overlay-backdrop-lightbox` | `#000000eb` | `#000000eb` | `#000000eb` | `#000000eb` |
| `--panel-bg` | `#1a1a1e` | `#fbfbfb` | `#323339` | `#000000` |

### text (50)

| token | escuro | claro | cinza | onyx |
| --- | --- | --- | --- | --- |
| `--channel-icon` | `#81828a` | `#666770` | `#999aa1` | `#7a7b83` |
| `--channel-text-area-placeholder` | `#6c6d76` | `#84858d` | `#6c6d76` | `#6c6d76` |
| `--channels-default` | `#81828a` | `#666770` | `#999aa1` | `#7a7b83` |
| `--chat-text-muted` | `#81828a` | `#70717a` | `#9d9ea5` | `#73747d` |
| `--mobile-text-heading-primary` | `#fbfbfb` | `#28282d` | `#ffffff` | `#dcdcdf` |
| `--navigator-header-tint` | `#ffffff` | `#4f505a` | `#ffffff` | `#ffffff` |
| `--text-brand` | `#798df9` | `#525fe0` | `#94a8ff` | `#6374f4` |
| `--text-code` | `#e4e4e6` | `#36373e` | `#ffffff` | `#c9cace` |
| `--text-code-addition` | `#7ac991` | `#005f30` | `#99e0ad` | `#5bb277` |
| `--text-code-attribute` | `#82b7f8` | `#0158ab` | `#abcfff` | `#5ea0f1` |
| `--text-code-builtin` | `#f49f00` | `#884800` | `#ffc252` | `#dc8d00` |
| `--text-code-bullet` | `#82b7f8` | `#0158ab` | `#abcfff` | `#5ea0f1` |
| `--text-code-comment` | `#999aa1` | `#696a73` | `#b3b3b9` | `#888991` |
| `--text-code-decorator` | `#f49f00` | `#884800` | `#ffc252` | `#dc8d00` |
| `--text-code-deletion` | `#ff9691` | `#9e1f2a` | `#ffbdb9` | `#f67774` |
| `--text-code-error` | `#ff9691` | `#a9232e` | `#ffbdb9` | `#f67774` |
| `--text-code-escape` | `#ff8be2` | `#9b277e` | `#ffb6ed` | `#ff59d5` |
| `--text-code-keyword` | `#ff9691` | `#a9232e` | `#ffbdb9` | `#f67774` |
| `--text-code-link` | `#82b7f8` | `#0158ab` | `#abcfff` | `#5ea0f1` |
| `--text-code-namespace` | `#82b7f8` | `#0158ab` | `#abcfff` | `#5ea0f1` |
| `--text-code-number` | `#efa275` | `#963b03` | `#fcc0a1` | `#e18752` |
| `--text-code-operator` | `#ffaba6` | `#971d28` | `#ffcfcd` | `#fc8884` |
| `--text-code-property` | `#63c1ca` | `#00636e` | `#8edae1` | `#36abb6` |
| `--text-code-regexp` | `#73c48b` | `#006734` | `#96dda9` | `#57af74` |
| `--text-code-section` | `#ff9691` | `#a9232e` | `#ffbdb9` | `#f67774` |
| `--text-code-string` | `#73c48b` | `#006734` | `#96dda9` | `#57af74` |
| `--text-code-tag` | `#ff8be2` | `#9b277e` | `#ffb6ed` | `#ff59d5` |
| `--text-code-title` | `#9db0ff` | `#404eb1` | `#bccaff` | `#8195fb` |
| `--text-code-type` | `#ff8be2` | `#9b277e` | `#ffb6ed` | `#ff59d5` |
| `--text-code-variable` | `#e4e4e6` | `#36373e` | `#ffffff` | `#c9cace` |
| `--text-default` | `#efeff1` | `#2e2e34` | `#f3f3f4` | `#d4d5d8` |
| `--text-feedback-critical` | `#f87e7a` | `#b92733` | `#ffa09b` | `#eb5f5e` |
| `--text-feedback-info` | `#66a5f3` | `#0361bc` | `#8ebefa` | `#4591ec` |
| `--text-feedback-positive` | `#5eb479` | `#01713a` | `#7ecb94` | `#41a063` |
| `--text-feedback-warning` | `#ea9800` | `#945300` | `#fcb529` | `#ce8100` |
| `--text-invert` | `#2f3035` | `#ffffff` | `#2f3035` | `#2f3035` |
| `--text-link` | `#4d96ee` | `#006dd4` | `#76aff6` | `#2781e7` |
| `--text-muted` | `#96979e` | `#6c6d76` | `#abacb2` | `#81828a` |
| `--text-overlay-dark` | `#000000` | `#000000` | `#000000` | `#000000` |
| `--text-overlay-light` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--text-status-dnd` | `#dc4247` | `#d22d39` | `#dc4247` | `#dc4247` |
| `--text-status-idle` | `#ffcb6e` | `#faaa00` | `#ffcb6e` | `#ffcb6e` |
| `--text-status-offline` | `#9d9ea5` | `#5f606a` | `#9d9ea5` | `#9d9ea5` |
| `--text-status-online` | `#3d9e60` | `#01783e` | `#3d9e60` | `#3d9e60` |
| `--text-strong` | `#fbfbfb` | `#28282d` | `#ffffff` | `#dcdcdf` |
| `--text-subtle` | `#abacb2` | `#595a63` | `#c5c6ca` | `#96979e` |
| `--text-voice-connected` | `#53ad71` | `#01783e` | `#73c48b` | `#3d9e60` |
| `--text-voice-disconnected` | `#f87e7a` | `#b92733` | `#ffa09b` | `#eb5f5e` |
| `--text-voice-speaking` | `#3d9e60` | `#269153` | `#3d9e60` | `#3d9e60` |
| `--textbox-markdown-syntax` | `#96979e` | `#41424a` | `#999aa1` | `#96979e` |

### icon (23)

| token | escuro | claro | cinza | onyx |
| --- | --- | --- | --- | --- |
| `--icon-brand` | `#798df9` | `#525fe0` | `#94a8ff` | `#6374f4` |
| `--icon-default` | `#efeff1` | `#2e2e34` | `#f3f3f4` | `#d4d5d8` |
| `--icon-feedback-critical` | `#f87e7a` | `#b92733` | `#ffa09b` | `#eb5f5e` |
| `--icon-feedback-info` | `#66a5f3` | `#0361bc` | `#8ebefa` | `#4591ec` |
| `--icon-feedback-notification` | `#da3e44` | `#d22d39` | `#da3e44` | `#da3e44` |
| `--icon-feedback-positive` | `#5eb479` | `#01713a` | `#7ecb94` | `#41a063` |
| `--icon-feedback-warning` | `#ea9800` | `#945300` | `#fcb529` | `#ce8100` |
| `--icon-invert` | `#2f3035` | `#ffffff` | `#2f3035` | `#2f3035` |
| `--icon-link` | `#4d96ee` | `#006dd4` | `#76aff6` | `#2781e7` |
| `--icon-muted` | `#96979e` | `#6c6d76` | `#abacb2` | `#81828a` |
| `--icon-overlay-dark` | `#000000` | `#000000` | `#000000` | `#000000` |
| `--icon-overlay-light` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--icon-status-dnd` | `#dc4247` | `#d22d39` | `#dc4247` | `#dc4247` |
| `--icon-status-idle` | `#ffcb6e` | `#faaa00` | `#ffcb6e` | `#ffcb6e` |
| `--icon-status-offline` | `#9d9ea5` | `#5f606a` | `#9d9ea5` | `#9d9ea5` |
| `--icon-status-online` | `#3d9e60` | `#01783e` | `#3d9e60` | `#3d9e60` |
| `--icon-strong` | `#fbfbfb` | `#28282d` | `#ffffff` | `#dcdcdf` |
| `--icon-subtle` | `#abacb2` | `#595a63` | `#c5c6ca` | `#96979e` |
| `--icon-transparent` | `#00000000` | `#00000000` | `#00000000` | `#00000000` |
| `--icon-voice-connected` | `#53ad71` | `#01783e` | `#73c48b` | `#3d9e60` |
| `--icon-voice-disconnected` | `#f87e7a` | `#b92733` | `#ffa09b` | `#eb5f5e` |
| `--icon-voice-muted` | `#da3e44` | `#d22d39` | `#da3e44` | `#da3e44` |
| `--icon-voice-speaking` | `#3d9e60` | `#269153` | `#3d9e60` | `#3d9e60` |

### interactive (15)

| token | escuro | claro | cinza | onyx |
| --- | --- | --- | --- | --- |
| `--interactive-accent-background-active` | `#3a48a3` | `#3a48a3` | `#3a48a3` | `#3a48a3` |
| `--interactive-accent-background-default` | `#94949c1f` | `#94949c1f` | `#94949c1f` | `#94949c1f` |
| `--interactive-accent-background-hover` | `#5865f2` | `#5865f2` | `#5865f2` | `#5865f2` |
| `--interactive-accent-background-selected` | `#5865f2` | `#5865f2` | `#5865f2` | `#5865f2` |
| `--interactive-background-active` | `#9595a229` | `#9595a229` | `#9595a229` | `#9696a033` |
| `--interactive-background-default` | `#99999914` | `#99999914` | `#99999914` | `#99999914` |
| `--interactive-background-hover` | `#94949c1f` | `#94949c1f` | `#94949c1f` | `#94949c1f` |
| `--interactive-background-selected` | `#9696a033` | `#96969f3d` | `#9696a033` | `#96969f3d` |
| `--interactive-icon-active` | `#fbfbfb` | `#28282d` | `#ffffff` | `#dcdcdf` |
| `--interactive-icon-default` | `#abacb2` | `#595a63` | `#c5c6ca` | `#96979e` |
| `--interactive-icon-hover` | `#fbfbfb` | `#28282d` | `#ffffff` | `#dcdcdf` |
| `--interactive-muted` | `#4f505a` | `#c9cace` | `#4f505a` | `#4f505a` |
| `--interactive-text-active` | `#fbfbfb` | `#28282d` | `#ffffff` | `#dcdcdf` |
| `--interactive-text-default` | `#abacb2` | `#595a63` | `#c5c6ca` | `#96979e` |
| `--interactive-text-hover` | `#fbfbfb` | `#28282d` | `#ffffff` | `#dcdcdf` |

### control (botões) (140)

| token | escuro | claro | cinza | onyx |
| --- | --- | --- | --- | --- |
| `--button-danger-background-disabled` | `#d22d39` | `#d22d39` | `#d22d39` | `#d22d39` |
| `--button-outline-brand-background-hover` | `#5865f2` | `#5865f2` | `#5865f2` | `#5865f2` |
| `--button-outline-brand-border-active` | `#4654c0` | `#4654c0` | `#4654c0` | `#4654c0` |
| `--button-outline-primary-text` | `#ffffff` | `#000000` | `#ffffff` | `#ffffff` |
| `--control-brand-foreground` | `#8ca0fd` | `#5865f2` | `#8ca0fd` | `#8ca0fd` |
| `--control-brand-foreground-new` | `#8ca0fd` | `#5865f2` | `#8ca0fd` | `#8ca0fd` |
| `--control-connected-background-active` | `#005f30` | `#005f30` | `#005f30` | `#005f30` |
| `--control-connected-background-default` | `#008545` | `#008545` | `#008545` | `#008545` |
| `--control-connected-background-hover` | `#006c37` | `#006c37` | `#006c37` | `#006c37` |
| `--control-connected-border-active` | `#ffffff14` | `#ffffff14` | `#ffffff14` | `#ffffff14` |
| `--control-connected-border-default` | `#ffffff14` | `#ffffff14` | `#ffffff14` | `#ffffff14` |
| `--control-connected-border-hover` | `#ffffff14` | `#ffffff14` | `#ffffff14` | `#ffffff14` |
| `--control-connected-icon-active` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--control-connected-icon-default` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--control-connected-icon-hover` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--control-connected-text-active` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--control-connected-text-default` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--control-connected-text-hover` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--control-critical-primary-background-active` | `#971d28` | `#971d28` | `#971d28` | `#971d28` |
| `--control-critical-primary-background-default` | `#d22d39` | `#d22d39` | `#d22d39` | `#d22d39` |
| `--control-critical-primary-background-hover` | `#a9232e` | `#a9232e` | `#a9232e` | `#a9232e` |
| `--control-critical-primary-border-active` | `#ffffff14` | `#ffffff14` | `#ffffff14` | `#ffffff14` |
| `--control-critical-primary-border-default` | `#ffffff14` | `#ffffff14` | `#ffffff14` | `#ffffff14` |
| `--control-critical-primary-border-hover` | `#ffffff14` | `#ffffff14` | `#ffffff14` | `#ffffff14` |
| `--control-critical-primary-icon-active` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--control-critical-primary-icon-default` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--control-critical-primary-icon-hover` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--control-critical-primary-text-active` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--control-critical-primary-text-default` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--control-critical-primary-text-hover` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--control-critical-secondary-background-active` | `#9696a033` | `#96969f3d` | `#9696a033` | `#96969f3d` |
| `--control-critical-secondary-background-default` | `#94949c1f` | `#94949c1f` | `#94949c1f` | `#94949c1f` |
| `--control-critical-secondary-background-hover` | `#9595a229` | `#9595a229` | `#9595a229` | `#9696a033` |
| `--control-critical-secondary-border-active` | `#9999990a` | `#9696a033` | `#9999990a` | `#9595a229` |
| `--control-critical-secondary-border-default` | `#9999990a` | `#9696a033` | `#9999990a` | `#9595a229` |
| `--control-critical-secondary-border-hover` | `#9999990a` | `#9696a033` | `#9999990a` | `#9595a229` |
| `--control-critical-secondary-icon-active` | `#f87e7a` | `#b92733` | `#ffa09b` | `#eb5f5e` |
| `--control-critical-secondary-icon-default` | `#f87e7a` | `#b92733` | `#ffa09b` | `#eb5f5e` |
| `--control-critical-secondary-icon-hover` | `#f87e7a` | `#b92733` | `#ffa09b` | `#eb5f5e` |
| `--control-critical-secondary-text-active` | `#f87e7a` | `#b92733` | `#ffa09b` | `#eb5f5e` |
| `--control-critical-secondary-text-default` | `#f87e7a` | `#b92733` | `#ffa09b` | `#eb5f5e` |
| `--control-critical-secondary-text-hover` | `#f87e7a` | `#b92733` | `#ffa09b` | `#eb5f5e` |
| `--control-expressive-background-active` | `#efeff1` | `#3a48a3` | `#efeff1` | `#efeff1` |
| `--control-expressive-background-default` | `#ffffff` | `#5865f2` | `#ffffff` | `#ffffff` |
| `--control-expressive-background-hover` | `#ffffff` | `#4452bb` | `#ffffff` | `#ffffff` |
| `--control-expressive-border-active` | `#94949c1f` | `#ffffff14` | `#94949c1f` | `#9696a033` |
| `--control-expressive-border-default` | `#94949c1f` | `#ffffff14` | `#94949c1f` | `#9696a033` |
| `--control-expressive-border-hover` | `#94949c1f` | `#ffffff14` | `#94949c1f` | `#9696a033` |
| `--control-expressive-icon-active` | `#000000` | `#ffffff` | `#000000` | `#000000` |
| `--control-expressive-icon-default` | `#000000` | `#ffffff` | `#000000` | `#000000` |
| `--control-expressive-icon-hover` | `#000000` | `#ffffff` | `#000000` | `#000000` |
| `--control-expressive-text-active` | `#000000` | `#ffffff` | `#000000` | `#000000` |
| `--control-expressive-text-default` | `#000000` | `#ffffff` | `#000000` | `#000000` |
| `--control-expressive-text-hover` | `#000000` | `#ffffff` | `#000000` | `#000000` |
| `--control-icon-only-background-active` | `#9696a033` | `#96969f3d` | `#9696a033` | `#96969f3d` |
| `--control-icon-only-background-hover` | `#9595a229` | `#9595a229` | `#9595a229` | `#9696a033` |
| `--control-icon-only-border-active` | `#9999990a` | `#9696a033` | `#9999990a` | `#9595a229` |
| `--control-icon-only-border-hover` | `#9999990a` | `#9696a033` | `#9999990a` | `#9595a229` |
| `--control-icon-only-icon-active` | `#fbfbfb` | `#28282d` | `#ffffff` | `#dcdcdf` |
| `--control-icon-only-icon-default` | `#abacb2` | `#595a63` | `#c5c6ca` | `#96979e` |
| `--control-icon-only-icon-hover` | `#fbfbfb` | `#28282d` | `#ffffff` | `#dcdcdf` |
| `--control-overlay-primary-background-active` | `#c2c2c7` | `#c2c2c7` | `#c2c2c7` | `#c2c2c7` |
| `--control-overlay-primary-background-default` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--control-overlay-primary-background-hover` | `#e0e0e3` | `#e0e0e3` | `#e0e0e3` | `#e0e0e3` |
| `--control-overlay-primary-border-active` | `#94949c1f` | `#ffffff14` | `#94949c1f` | `#9696a033` |
| `--control-overlay-primary-border-default` | `#94949c1f` | `#ffffff14` | `#94949c1f` | `#9696a033` |
| `--control-overlay-primary-border-hover` | `#94949c1f` | `#ffffff14` | `#94949c1f` | `#9696a033` |
| `--control-overlay-primary-icon-active` | `#000000` | `#000000` | `#000000` | `#000000` |
| `--control-overlay-primary-icon-default` | `#000000` | `#000000` | `#000000` | `#000000` |
| `--control-overlay-primary-icon-hover` | `#000000` | `#000000` | `#000000` | `#000000` |
| `--control-overlay-primary-text-active` | `#000000` | `#000000` | `#000000` | `#000000` |
| `--control-overlay-primary-text-default` | `#000000` | `#000000` | `#000000` | `#000000` |
| `--control-overlay-primary-text-hover` | `#000000` | `#000000` | `#000000` | `#000000` |
| `--control-overlay-secondary-background-active` | `#0000007a` | `#0000007a` | `#0000007a` | `#0000007a` |
| `--control-overlay-secondary-background-default` | `#00000085` | `#00000085` | `#00000085` | `#00000085` |
| `--control-overlay-secondary-background-hover` | `#000000a3` | `#000000a3` | `#000000a3` | `#000000a3` |
| `--control-overlay-secondary-border-active` | `#9999990a` | `#9696a033` | `#9999990a` | `#9595a229` |
| `--control-overlay-secondary-border-default` | `#9999990a` | `#9696a033` | `#9999990a` | `#9595a229` |
| `--control-overlay-secondary-border-hover` | `#9999990a` | `#9696a033` | `#9999990a` | `#9595a229` |
| `--control-overlay-secondary-icon-active` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--control-overlay-secondary-icon-default` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--control-overlay-secondary-icon-hover` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--control-overlay-secondary-text-active` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--control-overlay-secondary-text-default` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--control-overlay-secondary-text-hover` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--control-primary-background-active` | `#3a48a3` | `#3a48a3` | `#3a48a3` | `#3a48a3` |
| `--control-primary-background-default` | `#5865f2` | `#5865f2` | `#5865f2` | `#5865f2` |
| `--control-primary-background-hover` | `#4452bb` | `#4452bb` | `#4452bb` | `#4452bb` |
| `--control-primary-border-active` | `#ffffff14` | `#ffffff14` | `#ffffff14` | `#ffffff14` |
| `--control-primary-border-default` | `#ffffff14` | `#ffffff14` | `#ffffff14` | `#ffffff14` |
| `--control-primary-border-hover` | `#ffffff14` | `#ffffff14` | `#ffffff14` | `#ffffff14` |
| `--control-primary-icon-active` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--control-primary-icon-default` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--control-primary-icon-hover` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--control-primary-text-active` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--control-primary-text-default` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--control-primary-text-hover` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--control-secondary-background-active` | `#9696a033` | `#96969f3d` | `#9696a033` | `#96969f3d` |
| `--control-secondary-background-default` | `#94949c1f` | `#94949c1f` | `#94949c1f` | `#94949c1f` |
| `--control-secondary-background-hover` | `#9595a229` | `#9595a229` | `#9595a229` | `#9696a033` |
| `--control-secondary-border-active` | `#9999990a` | `#9696a033` | `#9999990a` | `#9595a229` |
| `--control-secondary-border-default` | `#9999990a` | `#9696a033` | `#9999990a` | `#9595a229` |
| `--control-secondary-border-hover` | `#9999990a` | `#9696a033` | `#9999990a` | `#9595a229` |
| `--control-secondary-icon-active` | `#fbfbfb` | `#28282d` | `#ffffff` | `#dcdcdf` |
| `--control-secondary-icon-default` | `#fbfbfb` | `#28282d` | `#ffffff` | `#dcdcdf` |
| `--control-secondary-icon-hover` | `#fbfbfb` | `#28282d` | `#ffffff` | `#dcdcdf` |
| `--control-secondary-text-active` | `#fbfbfb` | `#28282d` | `#ffffff` | `#dcdcdf` |
| `--control-secondary-text-default` | `#fbfbfb` | `#28282d` | `#ffffff` | `#dcdcdf` |
| `--control-secondary-text-hover` | `#fbfbfb` | `#28282d` | `#ffffff` | `#dcdcdf` |
| `--redesign-button-premium-primary-pink-for-gradient` | `#ab5d8a` | `#ab5d8a` | `#ab5d8a` | `#ab5d8a` |
| `--redesign-button-premium-primary-pressed-background` | `#0000001a` | `#0000001a` | `#0000001a` | `#0000001a` |
| `--redesign-button-premium-primary-purple-for-gradient` | `#8547c6` | `#8547c6` | `#8547c6` | `#8547c6` |
| `--redesign-button-premium-primary-purple-for-gradient-2` | `#b845c1` | `#b845c1` | `#b845c1` | `#b845c1` |
| `--redesign-button-tertiary-background` | `#00000000` | `#00000000` | `#00000000` | `#00000000` |
| `--redesign-button-tertiary-pressed-background` | `#9696a033` | `#96969f3d` | `#9696a033` | `#96969f3d` |
| `--redesign-button-tertiary-pressed-text` | `#d4d5d8` | `#4f505a` | `#babbc0` | `#c9cace` |
| `--redesign-button-tertiary-text` | `#efeff1` | `#2e2e34` | `#f3f3f4` | `#d4d5d8` |
| `--togglebutton-background-selected` | `#5764f329` | `#5764f329` | `#5764f329` | `#5764f329` |
| `--togglebutton-background-selected-active` | `#9696a033` | `#96969f3d` | `#9696a033` | `#96969f3d` |
| `--togglebutton-background-selected-hover` | `#5864f23d` | `#5864f23d` | `#5864f23d` | `#5864f23d` |
| `--togglebutton-border-active` | `#5865f2d6` | `#5865f2d6` | `#5865f2d6` | `#5865f2d6` |
| `--togglebutton-border-selected` | `#5865f2` | `#5865f2` | `#5865f2` | `#5865f2` |
| `--togglebutton-critical-background-selected` | `#d6293a1f` | `#d6293a1f` | `#d6293a1f` | `#d6293a1f` |
| `--togglebutton-critical-background-selected-hover` | `#d32c3829` | `#d32c3829` | `#d32c3829` | `#d32c3829` |
| `--togglebutton-critical-border-active` | `#d32c3852` | `#d32c3852` | `#d32c3852` | `#d32c3852` |
| `--togglebutton-critical-icon-active` | `#da3e44` | `#d22d39` | `#da3e44` | `#da3e44` |
| `--togglebutton-critical-icon-default` | `#efeff1` | `#2e2e34` | `#f3f3f4` | `#d4d5d8` |
| `--togglebutton-critical-icon-hover` | `#efeff1` | `#2e2e34` | `#f3f3f4` | `#d4d5d8` |
| `--togglebutton-critical-icon-selected` | `#da3e44` | `#d22d39` | `#da3e44` | `#da3e44` |
| `--togglebutton-critical-icon-selected-hover` | `#da3e44` | `#d22d39` | `#da3e44` | `#da3e44` |
| `--togglebutton-icon-active` | `#efeff1` | `#2e2e34` | `#f3f3f4` | `#d4d5d8` |
| `--togglebutton-icon-default` | `#efeff1` | `#2e2e34` | `#f3f3f4` | `#d4d5d8` |
| `--togglebutton-icon-hover` | `#efeff1` | `#2e2e34` | `#f3f3f4` | `#d4d5d8` |
| `--togglebutton-icon-only-icon-active` | `#fbfbfb` | `#28282d` | `#ffffff` | `#dcdcdf` |
| `--togglebutton-icon-only-icon-default` | `#efeff1` | `#2e2e34` | `#f3f3f4` | `#d4d5d8` |
| `--togglebutton-icon-only-icon-hover` | `#fbfbfb` | `#28282d` | `#ffffff` | `#dcdcdf` |
| `--togglebutton-icon-only-icon-selected` | `#fbfbfb` | `#28282d` | `#ffffff` | `#dcdcdf` |
| `--togglebutton-icon-only-icon-selected-hover` | `#fbfbfb` | `#28282d` | `#ffffff` | `#dcdcdf` |
| `--togglebutton-icon-selected` | `#fbfbfb` | `#28282d` | `#ffffff` | `#dcdcdf` |
| `--togglebutton-icon-selected-hover` | `#fbfbfb` | `#28282d` | `#ffffff` | `#dcdcdf` |

### input e formulários (52)

| token | escuro | claro | cinza | onyx |
| --- | --- | --- | --- | --- |
| `--checkbox-background-active` | `#3a48a3` | `#3a48a3` | `#3a48a3` | `#3a48a3` |
| `--checkbox-background-default` | `#00000014` | `#0000000a` | `#00000014` | `#00000014` |
| `--checkbox-background-hover` | `#00000014` | `#0000000a` | `#00000014` | `#00000014` |
| `--checkbox-background-selected-default` | `#5865f2` | `#5865f2` | `#5865f2` | `#5865f2` |
| `--checkbox-background-selected-hover` | `#4452bb` | `#4452bb` | `#4452bb` | `#4452bb` |
| `--checkbox-border-active` | `#94949c1f` | `#97979e47` | `#94949c1f` | `#9696a033` |
| `--checkbox-border-default` | `#9898a0a3` | `#84858d` | `#9898a0a3` | `#9898a0a3` |
| `--checkbox-border-hover` | `#97979fcc` | `#5c5d67` | `#97979fcc` | `#97979fcc` |
| `--checkbox-border-selected-default` | `#94949c1f` | `#97979e47` | `#94949c1f` | `#9696a033` |
| `--checkbox-border-selected-hover` | `#94949c1f` | `#97979e47` | `#94949c1f` | `#9696a033` |
| `--checkbox-icon-active` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--datepicker-range-background-default` | `#5764f266` | `#5764f266` | `#5764f266` | `#5764f266` |
| `--datepicker-range-background-hover` | `#5866f299` | `#5866f299` | `#5866f299` | `#5866f299` |
| `--input-background-default` | `#0000001f` | `#00000005` | `#00000014` | `#0000001f` |
| `--input-background-error-default` | `#cc33330a` | `#cc33330a` | `#cc33330a` | `#cc33330a` |
| `--input-border-active` | `#5865f2` | `#5865f2` | `#5865f2` | `#5865f2` |
| `--input-border-default` | `#9696a033` | `#9696a066` | `#9696a033` | `#96969f3d` |
| `--input-border-error-default` | `#f87e7a` | `#b92733` | `#ffa09b` | `#eb5f5e` |
| `--input-border-hover` | `#9696a033` | `#9696a066` | `#9696a033` | `#96969f3d` |
| `--input-border-readonly` | `#ffffff14` | `#0000000a` | `#ffffff14` | `#ffffff1f` |
| `--input-icon-default` | `#abacb2` | `#595a63` | `#c5c6ca` | `#96979e` |
| `--input-placeholder-text-default` | `#8f9097` | `#696a73` | `#a4a5ab` | `#7d7e87` |
| `--input-text-default` | `#efeff1` | `#2e2e34` | `#f3f3f4` | `#d4d5d8` |
| `--input-text-error-default` | `#efeff1` | `#2e2e34` | `#f3f3f4` | `#d4d5d8` |
| `--radio-background-active` | `#3a48a3` | `#3a48a3` | `#3a48a3` | `#3a48a3` |
| `--radio-background-default` | `#00000014` | `#9999990a` | `#00000014` | `#00000014` |
| `--radio-background-hover` | `#00000014` | `#9999990a` | `#00000014` | `#00000014` |
| `--radio-background-selected-default` | `#5865f2` | `#5865f2` | `#5865f2` | `#5865f2` |
| `--radio-background-selected-hover` | `#4452bb` | `#4452bb` | `#4452bb` | `#4452bb` |
| `--radio-border-active` | `#94949c1f` | `#97979e47` | `#94949c1f` | `#9696a033` |
| `--radio-border-default` | `#9898a0a3` | `#84858d` | `#9898a0a3` | `#9898a0a3` |
| `--radio-border-hover` | `#97979fcc` | `#5c5d67` | `#97979fcc` | `#97979fcc` |
| `--radio-border-selected-default` | `#94949c1f` | `#97979e47` | `#94949c1f` | `#9696a033` |
| `--radio-border-selected-hover` | `#94949c1f` | `#97979e47` | `#94949c1f` | `#9696a033` |
| `--radio-foreground-active` | `#5865f2` | `#5865f2` | `#5865f2` | `#5865f2` |
| `--radio-foreground-default` | `#00000014` | `#9999990a` | `#00000014` | `#00000014` |
| `--radio-foreground-hover` | `#00000014` | `#9999990a` | `#00000014` | `#00000014` |
| `--radio-thumb-background-active` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--slider-track-background` | `#474851` | `#c5c6ca` | `#595a63` | `#383940` |
| `--switch-background-active` | `#3a48a3` | `#3a48a3` | `#3a48a3` | `#3a48a3` |
| `--switch-background-default` | `#0000001f` | `#00000005` | `#0000001f` | `#0000001f` |
| `--switch-background-hover` | `#0000001f` | `#00000005` | `#0000001f` | `#0000001f` |
| `--switch-background-selected-default` | `#5865f2` | `#5865f2` | `#5865f2` | `#5865f2` |
| `--switch-background-selected-hover` | `#4452bb` | `#4452bb` | `#4452bb` | `#4452bb` |
| `--switch-border-default` | `#9696a033` | `#00000029` | `#9696a033` | `#9696a033` |
| `--switch-border-hover` | `#9696a066` | `#00000070` | `#9696a066` | `#9696a066` |
| `--switch-border-selected-default` | `#94949c1f` | `#97979e47` | `#94949c1f` | `#9696a033` |
| `--switch-border-selected-hover` | `#94949c1f` | `#97979e47` | `#94949c1f` | `#9696a033` |
| `--switch-thumb-background-default` | `#ffffff` | `#62636d` | `#ffffff` | `#ffffff` |
| `--switch-thumb-background-selected-default` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--switch-thumb-icon-active` | `#5865f2` | `#5865f2` | `#5865f2` | `#5865f2` |
| `--switch-thumb-icon-default` | `#2f3035` | `#ffffff` | `#2f3035` | `#2f3035` |

### border (10)

| token | escuro | claro | cinza | onyx |
| --- | --- | --- | --- | --- |
| `--border-feedback-critical` | `#f87e7a` | `#b92733` | `#ffa09b` | `#eb5f5e` |
| `--border-feedback-info` | `#66a5f3` | `#0361bc` | `#8ebefa` | `#4591ec` |
| `--border-feedback-positive` | `#5eb479` | `#01713a` | `#7ecb94` | `#41a063` |
| `--border-feedback-warning` | `#ea9800` | `#945300` | `#fcb529` | `#ce8100` |
| `--border-focus` | `#6aa8f4` | `#408eec` | `#6aa8f4` | `#6aa8f4` |
| `--border-muted` | `#9999990a` | `#9696a033` | `#9999990a` | `#9595a229` |
| `--border-normal` | `#9696a033` | `#9696a066` | `#9696a033` | `#96969f3d` |
| `--border-strong` | `#96969f70` | `#97979f85` | `#96969f70` | `#96969f70` |
| `--border-subtle` | `#94949c1f` | `#97979e47` | `#94949c1f` | `#9696a033` |
| `--border-voice-muted` | `#d6293a1f` | `#d6293a1f` | `#d6293a1f` | `#d6293a1f` |

### brand (37)

| token | escuro | claro | cinza | onyx |
| --- | --- | --- | --- | --- |
| `--brand-100` | `#e6eaff` | `#e6eaff` | `#e6eaff` | `#e6eaff` |
| `--brand-130` | `#e6eaff` | `#e6eaff` | `#e6eaff` | `#e6eaff` |
| `--brand-160` | `#e6eaff` | `#e6eaff` | `#e6eaff` | `#e6eaff` |
| `--brand-200` | `#dbe2ff` | `#dbe2ff` | `#dbe2ff` | `#dbe2ff` |
| `--brand-230` | `#d1daff` | `#d1daff` | `#d1daff` | `#d1daff` |
| `--brand-260` | `#c7d2ff` | `#c7d2ff` | `#c7d2ff` | `#c7d2ff` |
| `--brand-300` | `#b6c5ff` | `#b6c5ff` | `#b6c5ff` | `#b6c5ff` |
| `--brand-330` | `#a3b5ff` | `#a3b5ff` | `#a3b5ff` | `#a3b5ff` |
| `--brand-345` | `#94a8ff` | `#94a8ff` | `#94a8ff` | `#94a8ff` |
| `--brand-360` | `#8ca0fd` | `#8ca0fd` | `#8ca0fd` | `#8ca0fd` |
| `--brand-400` | `#7487f8` | `#7487f8` | `#7487f8` | `#7487f8` |
| `--brand-430` | `#6c7ff6` | `#6c7ff6` | `#6c7ff6` | `#6c7ff6` |
| `--brand-460` | `#6374f4` | `#6374f4` | `#6374f4` | `#6374f4` |
| `--brand-500` | `#5865f2` | `#5865f2` | `#5865f2` | `#5865f2` |
| `--brand-530` | `#505ddb` | `#505ddb` | `#505ddb` | `#505ddb` |
| `--brand-560` | `#4654c0` | `#4654c0` | `#4654c0` | `#4654c0` |
| `--brand-600` | `#3a48a3` | `#3a48a3` | `#3a48a3` | `#3a48a3` |
| `--brand-630` | `#303e8d` | `#303e8d` | `#303e8d` | `#303e8d` |
| `--brand-660` | `#29367c` | `#29367c` | `#29367c` | `#29367c` |
| `--brand-700` | `#1c295f` | `#1c295f` | `#1c295f` | `#1c295f` |
| `--brand-730` | `#1a275b` | `#1a275b` | `#1a275b` | `#1a275b` |
| `--brand-760` | `#172354` | `#172354` | `#172354` | `#172354` |
| `--brand-800` | `#14204c` | `#14204c` | `#14204c` | `#14204c` |
| `--brand-830` | `#0c173a` | `#0c173a` | `#0c173a` | `#0c173a` |
| `--brand-860` | `#050d24` | `#050d24` | `#050d24` | `#050d24` |
| `--brand-900` | `#01030c` | `#01030c` | `#01030c` | `#01030c` |
| `--creator-revenue-icon-gradient-end` | `#007c87` | `#00919d` | `#007c87` | `#007c87` |
| `--creator-revenue-icon-gradient-start` | `#15a2ac` | `#3caeb8` | `#15a2ac` | `#15a2ac` |
| `--creator-revenue-info-box-background` | `#0076891a` | `#0076891a` | `#0076891a` | `#0076891a` |
| `--creator-revenue-info-box-border` | `#00919d` | `#00919d` | `#00919d` | `#00919d` |
| `--creator-revenue-locked-channel-icon` | `#3caeb8` | `#00919d` | `#3caeb8` | `#3caeb8` |
| `--creator-revenue-progress-bar` | `#00919d` | `#3caeb8` | `#00919d` | `#00919d` |
| `--logo-primary` | `#ffffff` | `#5865f2` | `#ffffff` | `#ffffff` |
| `--nitro-tab-gradient-center` | `#ff4cd2` | `#fd99e9` | `#ff4cd2` | `#ff4cd2` |
| `--nitro-tab-gradient-inner-ring` | `#5866f180` | `#9fa7fb40` | `#5866f180` | `#5866f180` |
| `--nitro-tab-gradient-outer-ring` | `#00000000` | `#00000000` | `#00000000` | `#00000000` |
| `--premium-nitro-pink-text` | `#fa4acd` | `#c639a2` | `#ff7dde` | `#da41b3` |

### status e feedback (51)

| token | escuro | claro | cinza | onyx |
| --- | --- | --- | --- | --- |
| `--badge-background-brand` | `#5865f2` | `#5865f2` | `#5865f2` | `#5865f2` |
| `--badge-background-default` | `#9595a229` | `#9595a229` | `#9595a229` | `#9696a033` |
| `--badge-common-background` | `#96969f3d` | `#96969f3d` | `#96969f3d` | `#96969f3d` |
| `--badge-common-border` | `#81828a` | `#81828a` | `#81828a` | `#81828a` |
| `--badge-common-text` | `#c9cace` | `#5f606a` | `#c9cace` | `#c9cace` |
| `--badge-epic-background` | `#9f58f23d` | `#9f58f23d` | `#9f58f23d` | `#9f58f23d` |
| `--badge-epic-border-gradient-end` | `#a056f2` | `#a056f2` | `#a056f2` | `#a056f2` |
| `--badge-epic-border-gradient-start` | `#ff4cd2` | `#ff4cd2` | `#ff4cd2` | `#ff4cd2` |
| `--badge-epic-text` | `#ca9ef9` | `#612caf` | `#ca9ef9` | `#ca9ef9` |
| `--badge-expressive-background-default` | `#ffffff` | `#5865f2` | `#ffffff` | `#ffffff` |
| `--badge-expressive-text-default` | `#2f3035` | `#ffffff` | `#2f3035` | `#2f3035` |
| `--badge-mythic-background` | `#ff6d0d3d` | `#ff6d0d3d` | `#ff6d0d3d` | `#ff6d0d3d` |
| `--badge-mythic-border-gradient-end` | `#fe6e0d` | `#fe6e0d` | `#fe6e0d` | `#fe6e0d` |
| `--badge-mythic-border-gradient-start` | `#ffe047` | `#ffe047` | `#ffe047` | `#ffe047` |
| `--badge-mythic-text` | `#fe9242` | `#f25e0c` | `#fe9242` | `#fe9242` |
| `--badge-notification-background` | `#da3e44` | `#d22d39` | `#da3e44` | `#da3e44` |
| `--badge-rare-background` | `#5864f23d` | `#5864f23d` | `#5864f23d` | `#5864f23d` |
| `--badge-rare-border-gradient-end` | `#2d35ad` | `#2d35ad` | `#2d35ad` | `#2d35ad` |
| `--badge-rare-border-gradient-start` | `#5865f2` | `#5865f2` | `#5865f2` | `#5865f2` |
| `--badge-rare-text` | `#a0a9fa` | `#2d35ad` | `#a0a9fa` | `#a0a9fa` |
| `--badge-text-brand` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--badge-text-default` | `#fbfbfb` | `#28282d` | `#ffffff` | `#dcdcdf` |
| `--inlinenotice-border-critical` | `#d32c3a85` | `#d22d3999` | `#d32c3a85` | `#d22d3999` |
| `--inlinenotice-border-info` | `#0075e285` | `#0075e399` | `#0075e285` | `#0075e399` |
| `--inlinenotice-border-positive` | `#00844585` | `#00854499` | `#00844585` | `#00854499` |
| `--inlinenotice-border-warning` | `#f9a20052` | `#f7a4005c` | `#f9a20052` | `#f8a400b8` |
| `--notice-background-critical` | `#4f000f` | `#ffdedd` | `#730e1b` | `#230004` |
| `--notice-background-info` | `#00234f` | `#e5efff` | `#003873` | `#000a24` |
| `--notice-background-positive` | `#002b0e` | `#c8ffd8` | `#00431e` | `#001002` |
| `--notice-background-warning` | `#431000` | `#ffe7cf` | `#622a00` | `#240000` |
| `--notice-text-critical` | `#ffc0bd` | `#690917` | `#ffdedd` | `#ffa09b` |
| `--notice-text-info` | `#b0d2ff` | `#003873` | `#e5efff` | `#8abcfa` |
| `--notice-text-positive` | `#99e0ad` | `#00461f` | `#c1fcd1` | `#7ecb94` |
| `--notice-text-warning` | `#ffc356` | `#5e2700` | `#ffe7cf` | `#faaa00` |
| `--polls-normal-image-background` | `#242429` | `#ffffff` | `#242429` | `#242429` |
| `--polls-victor-fill` | `#3ca05f33` | `#28915533` | `#3ca05f33` | `#3ca05f33` |
| `--polls-voted-fill` | `#5a64f033` | `#5a64f033` | `#5a64f033` | `#5a64f033` |
| `--progressbar-indicator-background` | `#5865f2` | `#5865f2` | `#5865f2` | `#5865f2` |
| `--progressbar-track-background` | `#9696a033` | `#96969f3d` | `#9696a033` | `#96969f3d` |
| `--spoiler-hidden-background` | `#666770` | `#8f9097` | `#7d7e87` | `#595a63` |
| `--spoiler-hidden-background-hover` | `#84858d` | `#70717a` | `#9d9ea5` | `#767780` |
| `--spoiler-revealed-background` | `#6a707629` | `#ebeced` | `#242429` | `#6a707629` |
| `--status-danger` | `#da3e44` | `#d6363f` | `#da3e44` | `#da3e44` |
| `--status-online` | `#3d9e60` | `#269153` | `#3d9e60` | `#3d9e60` |
| `--status-positive` | `#3d9e60` | `#269153` | `#3d9e60` | `#3d9e60` |
| `--status-positive-background` | `#008043` | `#008043` | `#008043` | `#008043` |
| `--status-positive-text` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--status-speaking` | `#3d9e60` | `#3d9e60` | `#3d9e60` | `#3d9e60` |
| `--status-warning` | `#fdb833` | `#bb7300` | `#fdb833` | `#fdb833` |
| `--status-warning-background` | `#fdb833` | `#bb7300` | `#fdb833` | `#fdb833` |
| `--status-warning-text` | `#000000` | `#ffffff` | `#000000` | `#000000` |

### menção e mensagem (23)

| token | escuro | claro | cinza | onyx |
| --- | --- | --- | --- | --- |
| `--keyword-highlight-background` | `#9696a033` | `#96969f3d` | `#9696a033` | `#96969f3d` |
| `--mention-background` | `#5864f23d` | `#5864f23d` | `#5864f23d` | `#5864f23d` |
| `--mention-foreground` | `#a9bbff` | `#2e3c88` | `#cdd7ff` | `#8ca0fd` |
| `--message-automod-background-default` | `#f2737314` | `#d83b3b0d` | `#d83b3b0d` | `#f2737314` |
| `--message-automod-background-hover` | `#d83b451a` | `#d83b451a` | `#d83b451a` | `#d83b451a` |
| `--message-highlight-background-default` | `#5764f329` | `#5764f329` | `#5764f329` | `#5764f329` |
| `--message-highlight-background-hover` | `#5a63ef1f` | `#5a64f033` | `#5a63ef1f` | `#5a63ef1f` |
| `--message-mentioned-background-default` | `#f2a60014` | `#f2a60014` | `#f2a60014` | `#f2a60014` |
| `--message-mentioned-background-hover` | `#ff99000a` | `#f7a5001f` | `#ff99000a` | `#ff99000a` |
| `--reaction-background-active` | `#9696a033` | `#96969f3d` | `#9696a033` | `#96969f3d` |
| `--reaction-background-default` | `#94949c1f` | `#94949c1f` | `#94949c1f` | `#94949c1f` |
| `--reaction-background-hover` | `#9595a229` | `#9595a229` | `#9595a229` | `#9696a033` |
| `--reaction-background-reacted-default` | `#5864f23d` | `#5864f23d` | `#5864f23d` | `#5864f23d` |
| `--reaction-background-reacted-hover` | `#5864f23d` | `#5864f23d` | `#5864f23d` | `#5864f23d` |
| `--reaction-border-active` | `#96969f70` | `#97979f85` | `#96969f70` | `#96969f70` |
| `--reaction-border-default` | `#94949c1f` | `#97979e47` | `#94949c1f` | `#9696a033` |
| `--reaction-border-hover` | `#9999990a` | `#9696a033` | `#9999990a` | `#9595a229` |
| `--reaction-border-reacted-default` | `#5865f2` | `#5865f2` | `#5865f2` | `#5865f2` |
| `--reaction-text-active` | `#fbfbfb` | `#28282d` | `#ffffff` | `#dcdcdf` |
| `--reaction-text-default` | `#abacb2` | `#595a63` | `#c5c6ca` | `#96979e` |
| `--reaction-text-hover` | `#fbfbfb` | `#28282d` | `#ffffff` | `#dcdcdf` |
| `--reaction-text-reacted-default` | `#b9c8ff` | `#273478` | `#dfe4ff` | `#9aadff` |
| `--thread-channel-spine` | `#4f505a` | `#c9cace` | `#4f505a` | `#4f505a` |

### scrollbar (6)

| token | escuro | claro | cinza | onyx |
| --- | --- | --- | --- | --- |
| `--scrollbar-auto-scrollbar-color-thumb` | `#5f606a` | `#888991` | `#73747d` | `#595a63` |
| `--scrollbar-auto-scrollbar-color-track` | `#0e0e10` | `#efeff1` | `#2b2b31` | `#000000` |
| `--scrollbar-auto-thumb` | `#666770` | `#8f9097` | `#7d7e87` | `#595a63` |
| `--scrollbar-auto-track` | `#00000000` | `#00000000` | `#00000000` | `#00000000` |
| `--scrollbar-thin-thumb` | `#5f606a` | `#8b8c94` | `#767780` | `#595a63` |
| `--scrollbar-thin-track` | `#00000000` | `#00000000` | `#00000000` | `#00000000` |

### shadow e elevação (33)

| token | escuro | claro | cinza | onyx |
| --- | --- | --- | --- | --- |
| `--elevation-high` | `0 8px 16px hsl(0 0% 0%/0.24)` | `0 8px 16px hsl(0 0% 0%/0.16)` | `0 8px 16px hsl(0 0% 0%/0.24)` | `0 8px 16px hsl(0 0% 0%/0.24)` |
| `--elevation-low` | `0 1px 0 hsl(240 20% 0.98%/0.2),0 1.5px 0 hsl(240 9.091% 2.157%/0.05…` | `0 1px 0 hsl(240 9.091% 2.157%/0.1),0 1.5px 0 hsl(240 20% 0.98%/0.02…` | `0 1px 0 hsl(240 20% 0.98%/0.2),0 1.5px 0 hsl(240 9.091% 2.157%/0.05…` | `0 1px 0 hsl(240 20% 0.98%/0.2),0 1.5px 0 hsl(240 9.091% 2.157%/0.05…` |
| `--elevation-medium` | `0 4px 4px hsl(0 0% 0%/0.16)` | `0 4px 4px hsl(0 0% 0%/0.08)` | `0 4px 4px hsl(0 0% 0%/0.16)` | `0 4px 4px hsl(0 0% 0%/0.16)` |
| `--elevation-stroke` | `0 0 0 1px hsl(240 20% 0.98%/0.15)` | `0 0 0 1px hsl(240 9.091% 2.157%/0.08)` | `0 0 0 1px hsl(240 20% 0.98%/0.15)` | `0 0 0 1px hsl(240 20% 0.98%/0.15)` |
| `--legacy-elevation-border` | `0 0 0 1px hsl(225 6.25% 12.549%/0.6)` | `0 0 0 1px hsl(210 9.259% 78.824%/0.3)` | `0 0 0 1px hsl(225 6.25% 12.549%/0.6)` | `0 0 0 1px hsl(225 6.25% 12.549%/0.6)` |
| `--legacy-elevation-high` | `0 2px 10px 0 hsl(0 0% 0%/0.2)` | `0 2px 10px 0 hsl(0 0% 0%/0.0784313725490196)` | `0 2px 10px 0 hsl(0 0% 0%/0.2)` | `0 2px 10px 0 hsl(0 0% 0%/0.2)` |
| `--legacy-elevation-low` | `0 1px 5px 0 hsl(0 0% 0%/0.2784313725490196)` | `0 1px 5px hsl(0 0% 0%/0.2)` | `0 1px 5px 0 hsl(0 0% 0%/0.2784313725490196)` | `0 1px 5px 0 hsl(0 0% 0%/0.2784313725490196)` |
| `--shadow-border` | `0 0 0 1px rgba(255,255,255,0.08)` | `0 0 0 1px rgba(0,0,0,0.08)` | `0 0 0 1px rgba(255,255,255,0.08)` | `0 0 0 1px rgba(255,255,255,0.08)` |
| `--shadow-border-filter` | `drop-shadow(0 0 1px rgba(255,255,255,0.08))` | `drop-shadow(0 0 1px rgba(0,0,0,0.08))` | `drop-shadow(0 0 1px rgba(255,255,255,0.08))` | `drop-shadow(0 0 1px rgba(255,255,255,0.08))` |
| `--shadow-button-overlay` | `0 12px 24px 0 rgba(0,0,0,0.24)` | `0 12px 24px 0 rgba(0,0,0,0.24)` | `0 12px 24px 0 rgba(0,0,0,0.24)` | `0 12px 24px 0 rgba(0,0,0,0.24)` |
| `--shadow-button-overlay-filter` | `drop-shadow(0 12px 24px rgba(0,0,0,0.24))` | `drop-shadow(0 12px 24px rgba(0,0,0,0.24))` | `drop-shadow(0 12px 24px rgba(0,0,0,0.24))` | `drop-shadow(0 12px 24px rgba(0,0,0,0.24))` |
| `--shadow-high` | `0 12px 24px 0 rgba(0,0,0,0.24)` | `0 12px 36px 0 rgba(0,0,0,0.12)` | `0 12px 24px 0 rgba(0,0,0,0.24)` | `0 12px 24px 0 rgba(0,0,0,0.24)` |
| `--shadow-high-filter` | `drop-shadow(0 12px 24px rgba(0,0,0,0.24))` | `drop-shadow(0 12px 36px rgba(0,0,0,0.12))` | `drop-shadow(0 12px 24px rgba(0,0,0,0.24))` | `drop-shadow(0 12px 24px rgba(0,0,0,0.24))` |
| `--shadow-ledge` | `0 2px 0 0 rgba(0,0,0,0.05),0 1.5px 0 0 rgba(0,0,0,0.05),0 1px 0 0 r…` | `0 2px 0 0 rgba(0,0,0,0.03),0 1.5px 0 0 rgba(0,0,0,0.03),0 1px 0 0 r…` | `0 2px 0 0 rgba(0,0,0,0.05),0 1.5px 0 0 rgba(0,0,0,0.05),0 1px 0 0 r…` | `0 2px 0 0 rgba(0,0,0,0.05),0 1.5px 0 0 rgba(0,0,0,0.05),0 1px 0 0 r…` |
| `--shadow-ledge-filter` | `drop-shadow(0 1.5px 0 rgba(0,0,0,0.24))` | `drop-shadow(0 1.5px 0 rgba(0,0,0,0.12))` | `drop-shadow(0 1.5px 0 rgba(0,0,0,0.24))` | `drop-shadow(0 1.5px 0 rgba(0,0,0,0.24))` |
| `--shadow-low` | `0 1px 4px 0 rgba(0,0,0,0.14)` | `0 1px 4px 0 rgba(0,0,0,0.08)` | `0 1px 4px 0 rgba(0,0,0,0.14)` | `0 1px 4px 0 rgba(0,0,0,0.14)` |
| `--shadow-low-active` | `0 0 4px 0 rgba(0,0,0,0.14)` | `0 0 4px 0 rgba(0,0,0,0.08)` | `0 0 4px 0 rgba(0,0,0,0.14)` | `0 0 4px 0 rgba(0,0,0,0.14)` |
| `--shadow-low-active-filter` | `drop-shadow(0 0 4px rgba(0,0,0,0.14))` | `drop-shadow(0 0 4px rgba(0,0,0,0.08))` | `drop-shadow(0 0 4px rgba(0,0,0,0.14))` | `drop-shadow(0 0 4px rgba(0,0,0,0.14))` |
| `--shadow-low-filter` | `drop-shadow(0 1px 4px rgba(0,0,0,0.14))` | `drop-shadow(0 1px 4px rgba(0,0,0,0.08))` | `drop-shadow(0 1px 4px rgba(0,0,0,0.14))` | `drop-shadow(0 1px 4px rgba(0,0,0,0.14))` |
| `--shadow-low-hover` | `0 4px 10px 0 rgba(0,0,0,0.14)` | `0 4px 8px 0 rgba(0,0,0,0.08)` | `0 4px 10px 0 rgba(0,0,0,0.14)` | `0 4px 10px 0 rgba(0,0,0,0.14)` |
| `--shadow-low-hover-filter` | `drop-shadow(0 4px 10px rgba(0,0,0,0.14))` | `drop-shadow(0 4px 8px rgba(0,0,0,0.08))` | `drop-shadow(0 4px 10px rgba(0,0,0,0.14))` | `drop-shadow(0 4px 10px rgba(0,0,0,0.14))` |
| `--shadow-medium` | `0 4px 8px 0 rgba(0,0,0,0.16)` | `0 4px 8px 0 rgba(0,0,0,0.08)` | `0 4px 8px 0 rgba(0,0,0,0.16)` | `0 4px 8px 0 rgba(0,0,0,0.16)` |
| `--shadow-medium-filter` | `drop-shadow(0 4px 8px rgba(0,0,0,0.16))` | `drop-shadow(0 4px 8px rgba(0,0,0,0.08))` | `drop-shadow(0 4px 8px rgba(0,0,0,0.16))` | `drop-shadow(0 4px 8px rgba(0,0,0,0.16))` |
| `--shadow-mobile-chatinput` | `0 -1px 4px 0 rgba(26,26,30,.5)` | `0 -1px 4px 0 rgba(26,26,30,.5)` | `0 -1px 4px 0 rgba(26,26,30,.5)` | `0 -1px 4px 0 rgba(26,26,30,.5)` |
| `--shadow-mobile-chatinput-filter` | `drop-shadow(0 -1px 4px rgba(26,26,30,.5))` | `drop-shadow(0 -1px 4px rgba(26,26,30,.5))` | `drop-shadow(0 -1px 4px rgba(26,26,30,.5))` | `drop-shadow(0 -1px 4px rgba(26,26,30,.5))` |
| `--shadow-mobile-navigator-x` | `0 0 10px 0 rgba(0,0,0,0.22)` | `0 0 9px 0 rgba(0,0,0,0.13)` | `0 0 10px 0 rgba(0,0,0,0.22)` | `0 0 10px 0 rgba(0,0,0,0.22)` |
| `--shadow-mobile-navigator-x-filter` | `drop-shadow(0 0 10px rgba(0,0,0,0.22))` | `drop-shadow(0 0 9px rgba(0,0,0,0.13))` | `drop-shadow(0 0 10px rgba(0,0,0,0.22))` | `drop-shadow(0 0 10px rgba(0,0,0,0.22))` |
| `--shadow-top-high` | `0 -12px 32px 0 rgba(0,0,0,0.24)` | `0 -12px 36px 0 rgba(0,0,0,0.12)` | `0 -12px 32px 0 rgba(0,0,0,0.24)` | `0 -12px 32px 0 rgba(0,0,0,0.24)` |
| `--shadow-top-high-filter` | `drop-shadow(0 -12px 32px rgba(0,0,0,0.24))` | `drop-shadow(0 -12px 36px rgba(0,0,0,0.12))` | `drop-shadow(0 -12px 32px rgba(0,0,0,0.24))` | `drop-shadow(0 -12px 32px rgba(0,0,0,0.24))` |
| `--shadow-top-ledge` | `0 -2px 0 0 rgba(0,0,0,0.05),0 -1.5px 0 0 rgba(0,0,0,0.05),0 -1px 0 …` | `0 -2px 0 0 rgba(0,0,0,0.03),0 -1.5px 0 0 rgba(0,0,0,0.03),0 -1px 0 …` | `0 -2px 0 0 rgba(0,0,0,0.05),0 -1.5px 0 0 rgba(0,0,0,0.05),0 -1px 0 …` | `0 -2px 0 0 rgba(0,0,0,0.05),0 -1.5px 0 0 rgba(0,0,0,0.05),0 -1px 0 …` |
| `--shadow-top-ledge-filter` | `drop-shadow(0 -1.5px 0 rgba(0,0,0,0.24))` | `drop-shadow(0 -1.5px 0 rgba(0,0,0,0.12))` | `drop-shadow(0 -1.5px 0 rgba(0,0,0,0.24))` | `drop-shadow(0 -1.5px 0 rgba(0,0,0,0.24))` |
| `--shadow-top-low` | `0 -1px 4px 0 rgba(0,0,0,0.14)` | `0 -1px 4px 0 rgba(0,0,0,0.08)` | `0 -1px 4px 0 rgba(0,0,0,0.14)` | `0 -1px 4px 0 rgba(0,0,0,0.14)` |
| `--shadow-top-low-filter` | `drop-shadow(0 -1px 4px rgba(0,0,0,0.14))` | `drop-shadow(0 -1px 4px rgba(0,0,0,0.08))` | `drop-shadow(0 -1px 4px rgba(0,0,0,0.14))` | `drop-shadow(0 -1px 4px rgba(0,0,0,0.14))` |

### chips, charts, código, ANSI (92)

| token | escuro | claro | cinza | onyx |
| --- | --- | --- | --- | --- |
| `--ansi-black` | `#000000` | `#000000` | `#000000` | `#000000` |
| `--ansi-blue` | `#1a7ce6` | `#3789ea` | `#4591ec` | `#0268ca` |
| `--ansi-bright-black` | `#70717a` | `#70717a` | `#70717a` | `#70717a` |
| `--ansi-bright-blue` | `#5865f2` | `#5865f2` | `#a0a9fa` | `#5865f2` |
| `--ansi-bright-cyan` | `#2fa9b3` | `#007782` | `#5fbfc8` | `#0096a1` |
| `--ansi-bright-green` | `#21bb63` | `#108e4d` | `#21bb63` | `#108e4d` |
| `--ansi-bright-magenta` | `#ff4cd2` | `#b3269c` | `#fd99e9` | `#ff4cd2` |
| `--ansi-bright-red` | `#f47470` | `#ca2b37` | `#ff938e` | `#e55455` |
| `--ansi-bright-white` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--ansi-bright-yellow` | `#e79418` | `#db6e00` | `#e79418` | `#db6e00` |
| `--ansi-cyan` | `#008995` | `#0098a3` | `#049faa` | `#00757f` |
| `--ansi-green` | `#1b8d4d` | `#399b5d` | `#45a366` | `#017b40` |
| `--ansi-magenta` | `#d53fae` | `#e444bb` | `#f549c9` | `#b73495` |
| `--ansi-red` | `#de464a` | `#e75858` | `#ec6361` | `#ca2b37` |
| `--ansi-white` | `#b6b7bc` | `#b6b7bc` | `#b6b7bc` | `#b6b7bc` |
| `--ansi-yellow` | `#b36c00` | `#c07600` | `#ce8100` | `#9d5a00` |
| `--chart-brand` | `#5865f2` | `#5865f2` | `#6374f4` | `#5865f2` |
| `--chart-categorical-1` | `#5865f2` | `#5865f2` | `#6374f4` | `#5865f2` |
| `--chart-categorical-10` | `#9d5a00` | `#9d5a00` | `#9d5a00` | `#9d5a00` |
| `--chart-categorical-2` | `#fe9242` | `#fe9242` | `#fe9242` | `#fe9242` |
| `--chart-categorical-3` | `#a056f2` | `#a056f2` | `#a056f2` | `#a056f2` |
| `--chart-categorical-4` | `#47b3bc` | `#47b3bc` | `#47b3bc` | `#47b3bc` |
| `--chart-categorical-5` | `#62b77c` | `#62b77c` | `#62b77c` | `#62b77c` |
| `--chart-categorical-6` | `#d53fae` | `#d53fae` | `#d53fae` | `#d53fae` |
| `--chart-categorical-7` | `#febd45` | `#febd45` | `#febd45` | `#febd45` |
| `--chart-categorical-8` | `#dc4247` | `#dc4247` | `#dc4247` | `#dc4247` |
| `--chart-categorical-9` | `#00468a` | `#00468a` | `#00468a` | `#00468a` |
| `--chart-mono-1` | `#b6c5ff` | `#e6eaff` | `#b6c5ff` | `#b6c5ff` |
| `--chart-mono-2` | `#899dfd` | `#b6c5ff` | `#899dfd` | `#899dfd` |
| `--chart-mono-3` | `#5865f2` | `#899dfd` | `#5865f2` | `#5865f2` |
| `--chart-mono-4` | `#3e4cad` | `#5865f2` | `#3e4cad` | `#3e4cad` |
| `--chart-mono-5` | `#273478` | `#4452bb` | `#273478` | `#273478` |
| `--chart-mono-6` | `#152250` | `#2e3c88` | `#152250` | `#152250` |
| `--chart-mono-7` | `#060f29` | `#182557` | `#060f29` | `#060f29` |
| `--chart-mono-text-1` | `#1b1c1f` | `#35363c` | `#1b1c1f` | `#1b1c1f` |
| `--chart-mono-text-2` | `#000000` | `#1b1c1f` | `#000000` | `#000000` |
| `--chart-mono-text-3` | `#ffffff` | `#000000` | `#ffffff` | `#ffffff` |
| `--chart-mono-text-4` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--chart-mono-text-5` | `#f3f3f4` | `#ffffff` | `#f3f3f4` | `#f3f3f4` |
| `--chart-mono-text-6` | `#d1d1d5` | `#ffffff` | `#d1d1d5` | `#d1d1d5` |
| `--chart-mono-text-7` | `#bebec3` | `#d4d5d8` | `#bebec3` | `#bebec3` |
| `--chart-negative` | `#d22d39` | `#d22d39` | `#e55455` | `#d22d39` |
| `--chart-neutral` | `#96979e` | `#96979e` | `#96979e` | `#96979e` |
| `--chart-positive` | `#62b77c` | `#62b77c` | `#62b77c` | `#62b77c` |
| `--chip-blurple-dark-background` | `#303e8d` | `#303e8d` | `#303e8d` | `#303e8d` |
| `--chip-blurple-dark-text` | `#e6eaff` | `#e6eaff` | `#e6eaff` | `#e6eaff` |
| `--chip-blurple-light-background` | `#a6b8ff` | `#a6b8ff` | `#a6b8ff` | `#a6b8ff` |
| `--chip-blurple-light-text` | `#0c173a` | `#0c173a` | `#0c173a` | `#0c173a` |
| `--chip-blurple-medium-background` | `#6f82f7` | `#6f82f7` | `#6f82f7` | `#6f82f7` |
| `--chip-blurple-medium-text` | `#000000` | `#000000` | `#000000` | `#000000` |
| `--chip-gray-dark-background` | `#292a2f` | `#292a2f` | `#292a2f` | `#292a2f` |
| `--chip-gray-dark-text` | `#ebeced` | `#ebeced` | `#ebeced` | `#ebeced` |
| `--chip-gray-light-background` | `#dcdcdf` | `#dcdcdf` | `#dcdcdf` | `#dcdcdf` |
| `--chip-gray-light-text` | `#34343a` | `#34343a` | `#34343a` | `#34343a` |
| `--chip-gray-medium-background` | `#70717a` | `#70717a` | `#70717a` | `#70717a` |
| `--chip-gray-medium-text` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--chip-green-dark-background` | `#005428` | `#005428` | `#005428` | `#005428` |
| `--chip-green-dark-text` | `#c8ffd8` | `#c8ffd8` | `#c8ffd8` | `#c8ffd8` |
| `--chip-green-light-background` | `#84d09a` | `#84d09a` | `#84d09a` | `#84d09a` |
| `--chip-green-light-text` | `#00250a` | `#00250a` | `#00250a` | `#00250a` |
| `--chip-green-medium-background` | `#269153` | `#269153` | `#269153` | `#269153` |
| `--chip-green-medium-text` | `#001b05` | `#001b05` | `#001b05` | `#001b05` |
| `--chip-orange-dark-background` | `#792b00` | `#792b00` | `#792b00` | `#792b00` |
| `--chip-orange-dark-text` | `#ffe3d9` | `#ffe3d9` | `#ffe3d9` | `#ffe3d9` |
| `--chip-orange-light-background` | `#f2a87d` | `#f2a87d` | `#f2a87d` | `#f2a87d` |
| `--chip-orange-light-text` | `#370200` | `#370200` | `#370200` | `#370200` |
| `--chip-orange-medium-background` | `#d16c31` | `#d16c31` | `#d16c31` | `#d16c31` |
| `--chip-orange-medium-text` | `#180002` | `#180002` | `#180002` | `#180002` |
| `--chip-pink-dark-background` | `#8c1381` | `#8c1381` | `#8c1381` | `#8c1381` |
| `--chip-pink-dark-text` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--chip-pink-light-background` | `#fcc0f4` | `#fcc0f4` | `#fcc0f4` | `#fcc0f4` |
| `--chip-pink-light-text` | `#2c2d32` | `#2c2d32` | `#2c2d32` | `#2c2d32` |
| `--chip-pink-medium-background` | `#ff4cd2` | `#ff4cd2` | `#ff4cd2` | `#ff4cd2` |
| `--chip-pink-medium-text` | `#000000` | `#000000` | `#000000` | `#000000` |
| `--chip-purple-dark-background` | `#3e1689` | `#3e1689` | `#3e1689` | `#3e1689` |
| `--chip-purple-dark-text` | `#dcdcdf` | `#dcdcdf` | `#dcdcdf` | `#dcdcdf` |
| `--chip-purple-light-background` | `#dec2fc` | `#dec2fc` | `#dec2fc` | `#dec2fc` |
| `--chip-purple-light-text` | `#292a2f` | `#292a2f` | `#292a2f` | `#292a2f` |
| `--chip-purple-medium-background` | `#a056f2` | `#a056f2` | `#a056f2` | `#a056f2` |
| `--chip-purple-medium-text` | `#000000` | `#000000` | `#000000` | `#000000` |
| `--chip-red-dark-background` | `#851621` | `#851621` | `#851621` | `#851621` |
| `--chip-red-dark-text` | `#ffdedd` | `#ffdedd` | `#ffdedd` | `#ffdedd` |
| `--chip-red-light-background` | `#ff9a94` | `#ff9a94` | `#ff9a94` | `#ff9a94` |
| `--chip-red-light-text` | `#320007` | `#320007` | `#320007` | `#320007` |
| `--chip-red-medium-background` | `#dc4247` | `#dc4247` | `#dc4247` | `#dc4247` |
| `--chip-red-medium-text` | `#140002` | `#140002` | `#140002` | `#140002` |
| `--chip-yellow-dark-background` | `#9d5a00` | `#9d5a00` | `#9d5a00` | `#9d5a00` |
| `--chip-yellow-dark-text` | `#ffe7cf` | `#ffe7cf` | `#ffe7cf` | `#ffe7cf` |
| `--chip-yellow-light-background` | `#ffce76` | `#ffce76` | `#ffce76` | `#ffce76` |
| `--chip-yellow-light-text` | `#562000` | `#562000` | `#562000` | `#562000` |
| `--chip-yellow-medium-background` | `#faaa00` | `#faaa00` | `#faaa00` | `#faaa00` |
| `--chip-yellow-medium-text` | `#733700` | `#733700` | `#733700` | `#733700` |

### gradientes expressivos e perfil (43)

| token | escuro | claro | cinza | onyx |
| --- | --- | --- | --- | --- |
| `--expressive-gradient-blue-end` | `#171a8b4d` | `#a0a9facc` | `#161b8973` | `#181c8b40` |
| `--expressive-gradient-blue-start` | `#5963f24d` | `#e6e8ffcc` | `#5966f273` | `#5864f340` |
| `--expressive-gradient-green-end` | `#0067384d` | `#8af8b5cc` | `#00663773` | `#00683840` |
| `--expressive-gradient-green-start` | `#21b9634d` | `#e5fff0cc` | `#21ba6473` | `#20bb6440` |
| `--expressive-gradient-nitro-green-end` | `#1414ca66` | `#5865f2e6` | `#1414cb80` | `#1414ca4d` |
| `--expressive-gradient-nitro-green-start` | `#20bc6466` | `#e6ffefe6` | `#22bb6480` | `#21b9634d` |
| `--expressive-gradient-nitro-pink-end` | `#1414ca66` | `#5865f2e6` | `#1414cb80` | `#1414ca4d` |
| `--expressive-gradient-nitro-pink-start` | `#8c148266` | `#fd99e9e6` | `#8b148180` | `#8b14814d` |
| `--expressive-gradient-pink-end` | `#6700674d` | `#fc98e8cc` | `#66006673` | `#68006840` |
| `--expressive-gradient-pink-start` | `#b3249c4d` | `#fbe6ffcc` | `#b4269b73` | `#b3289b40` |
| `--expressive-gradient-purple-end` | `#3f17884d` | `#ca9ef9cc` | `#3e168973` | `#40188740` |
| `--expressive-gradient-purple-start` | `#9f56f24d` | `#f2e6ffcc` | `#a056f273` | `#9f58f340` |
| `--expressive-gradient-tenure-badge-bronze-end` | `#db3c0a4d` | `#db3c0a4d` | `#db3c0a4d` | `#db3c0a4d` |
| `--expressive-gradient-tenure-badge-bronze-start` | `#ff92424d` | `#ff92424d` | `#ff92424d` | `#ff92424d` |
| `--expressive-gradient-tenure-badge-diamond-end` | `#602bb04d` | `#602bb04d` | `#602bb04d` | `#602bb04d` |
| `--expressive-gradient-tenure-badge-diamond-start` | `#9f56f24d` | `#9f56f24d` | `#9f56f24d` | `#9f56f24d` |
| `--expressive-gradient-tenure-badge-emerald-end` | `#118e4c4d` | `#118e4c4d` | `#118e4c4d` | `#118e4c4d` |
| `--expressive-gradient-tenure-badge-emerald-start` | `#35ee7e4d` | `#35ee7e4d` | `#35ee7e4d` | `#35ee7e4d` |
| `--expressive-gradient-tenure-badge-gold-end` | `#fcb0144d` | `#fcb0144d` | `#fcb0144d` | `#fcb0144d` |
| `--expressive-gradient-tenure-badge-gold-start` | `#f2b92e4d` | `#f2b92e4d` | `#f2b92e4d` | `#f2b92e4d` |
| `--expressive-gradient-tenure-badge-opal-end` | `#0074e14d` | `#0074e14d` | `#0074e14d` | `#0074e14d` |
| `--expressive-gradient-tenure-badge-opal-start` | `#4cb6c04d` | `#4cb6c04d` | `#4cb6c04d` | `#4cb6c04d` |
| `--expressive-gradient-tenure-badge-platinum-end` | `#006a744d` | `#006a744d` | `#006a744d` | `#006a744d` |
| `--expressive-gradient-tenure-badge-platinum-start` | `#7bcdd74d` | `#7bcdd74d` | `#7bcdd74d` | `#7bcdd74d` |
| `--expressive-gradient-tenure-badge-ruby-end` | `#6307144d` | `#6307144d` | `#6307144d` | `#6307144d` |
| `--expressive-gradient-tenure-badge-ruby-start` | `#de46494d` | `#de46494d` | `#de46494d` | `#de46494d` |
| `--expressive-gradient-tenure-badge-silver-end` | `#42424c4d` | `#42424c4d` | `#42424c4d` | `#42424c4d` |
| `--expressive-gradient-tenure-badge-silver-start` | `#d4d4d74d` | `#d4d4d74d` | `#d4d4d74d` | `#d4d4d74d` |
| `--gradient-progress-pill-background` | `#46474f` | `#bebec3` | `#5c5d67` | `#36373e` |
| `--profile-gradient-note-background` | `#0000004d` | `#ffffff4c` | `#0000004d` | `#0000004d` |
| `--profile-gradient-overlay` | `#00000099` | `#ffffff99` | `#00000099` | `#00000099` |
| `--profile-gradient-overlay-synced-with-user-theme` | `#000000cc` | `#ffffffcc` | `#000000cc` | `#000000cc` |
| `--profile-gradient-role-pill-background` | `#24242a80` | `#ffffff80` | `#24242a80` | `#24242a80` |
| `--profile-gradient-role-pill-border` | `#ffffff33` | `#23232833` | `#ffffff33` | `#ffffff33` |
| `--profile-gradient-section-box` | `#00000073` | `#ffffff73` | `#00000073` | `#00000073` |
| `--user-profile-activity-toolbar-background` | `#2c2d32` | `#ffffff` | `#3f4048` | `#17181b` |
| `--user-profile-background-hover` | `#94949c1f` | `#94949c1f` | `#94949c1f` | `#94949c1f` |
| `--user-profile-border` | `#94949c1f` | `#97979e47` | `#94949c1f` | `#9696a033` |
| `--user-profile-note-background-focus` | `#121214` | `#f3f3f4` | `#2c2d32` | `#000000` |
| `--user-profile-overlay-background` | `#2c2d32` | `#ffffff` | `#3f4048` | `#17181b` |
| `--user-profile-overlay-background-hover` | `#94949c1f` | `#94949c1f` | `#94949c1f` | `#94949c1f` |
| `--user-profile-toolbar-background` | `#2c2d32` | `#ffffff` | `#3f4048` | `#17181b` |
| `--user-profile-toolbar-border` | `#9999990a` | `#9696a033` | `#9999990a` | `#9595a229` |

### outros (235)

| token | escuro | claro | cinza | onyx |
| --- | --- | --- | --- | --- |
| `--app-message-embed-secondary-text` | `#ffffffb2` | `#ffffffb2` | `#ffffffb2` | `#ffffffb2` |
| `--blue-100` | `#e5efff` | `#e5efff` | `#e5efff` | `#e5efff` |
| `--blue-130` | `#e5efff` | `#e5efff` | `#e5efff` | `#e5efff` |
| `--blue-160` | `#e5efff` | `#e5efff` | `#e5efff` | `#e5efff` |
| `--blue-200` | `#d3e5ff` | `#d3e5ff` | `#d3e5ff` | `#d3e5ff` |
| `--blue-230` | `#b8d7ff` | `#b8d7ff` | `#b8d7ff` | `#b8d7ff` |
| `--blue-260` | `#a3cbfd` | `#a3cbfd` | `#a3cbfd` | `#a3cbfd` |
| `--blue-300` | `#82b7f8` | `#82b7f8` | `#82b7f8` | `#82b7f8` |
| `--blue-330` | `#6aa8f4` | `#6aa8f4` | `#6aa8f4` | `#6aa8f4` |
| `--blue-345` | `#5299ef` | `#5299ef` | `#5299ef` | `#5299ef` |
| `--blue-360` | `#408eec` | `#408eec` | `#408eec` | `#408eec` |
| `--blue-400` | `#217fe7` | `#217fe7` | `#217fe7` | `#217fe7` |
| `--blue-430` | `#006fd9` | `#006fd9` | `#006fd9` | `#006fd9` |
| `--blue-460` | `#0363c1` | `#0363c1` | `#0363c1` | `#0363c1` |
| `--blue-500` | `#0158ab` | `#0158ab` | `#0158ab` | `#0158ab` |
| `--blue-530` | `#004c96` | `#004c96` | `#004c96` | `#004c96` |
| `--blue-560` | `#004386` | `#004386` | `#004386` | `#004386` |
| `--blue-600` | `#003a76` | `#003a76` | `#003a76` | `#003a76` |
| `--blue-630` | `#00346b` | `#00346b` | `#00346b` | `#00346b` |
| `--blue-660` | `#002e60` | `#002e60` | `#002e60` | `#002e60` |
| `--blue-700` | `#002756` | `#002756` | `#002756` | `#002756` |
| `--blue-730` | `#00214b` | `#00214b` | `#00214b` | `#00214b` |
| `--blue-760` | `#001b41` | `#001b41` | `#001b41` | `#001b41` |
| `--blue-800` | `#00173b` | `#00173b` | `#00173b` | `#00173b` |
| `--blue-830` | `#001333` | `#001333` | `#001333` | `#001333` |
| `--blue-860` | `#00102f` | `#00102f` | `#00102f` | `#00102f` |
| `--blue-900` | `#000d2a` | `#000d2a` | `#000d2a` | `#000d2a` |
| `--brightness` | `calc(1.5 - 1*0.5)` | `calc(0.5 + 1*0.5)` | `calc(1.5 - 1*0.5)` | `calc(1.5 - 1*0.5)` |
| `--chat-border` | `#94949c1f` | `#97979e47` | `#94949c1f` | `#9696a033` |
| `--content-inventory-media-seekbar-container` | `#c9c9cd3d` | `#c9c9cd3d` | `#c9c9cd3d` | `#c9c9cd3d` |
| `--content-inventory-overlay-text-primary` | `#ffffffd9` | `#ffffffd9` | `#ffffffd9` | `#ffffffd9` |
| `--content-inventory-overlay-text-secondary` | `#ffffffb2` | `#ffffffb2` | `#ffffffb2` | `#ffffffb2` |
| `--context-menu-backdrop-background` | `#000000b8` | `#00000085` | `#000000b8` | `#000000b3` |
| `--contrast` | `1` | `1` | `1` | `1` |
| `--experimental-avatar-embed-bg` | `#00000085` | `#00000085` | `#00000085` | `#00000085` |
| `--green-100` | `#c8ffd8` | `#c8ffd8` | `#c8ffd8` | `#c8ffd8` |
| `--green-130` | `#c8ffd8` | `#c8ffd8` | `#c8ffd8` | `#c8ffd8` |
| `--green-160` | `#c1fcd1` | `#c1fcd1` | `#c1fcd1` | `#c1fcd1` |
| `--green-200` | `#abedbd` | `#abedbd` | `#abedbd` | `#abedbd` |
| `--green-230` | `#92dba6` | `#92dba6` | `#92dba6` | `#92dba6` |
| `--green-260` | `#81ce97` | `#81ce97` | `#81ce97` | `#81ce97` |
| `--green-300` | `#73c48b` | `#73c48b` | `#73c48b` | `#73c48b` |
| `--green-330` | `#65ba7f` | `#65ba7f` | `#65ba7f` | `#65ba7f` |
| `--green-345` | `#53ad71` | `#53ad71` | `#53ad71` | `#53ad71` |
| `--green-360` | `#3d9e60` | `#3d9e60` | `#3d9e60` | `#3d9e60` |
| `--green-400` | `#269153` | `#269153` | `#269153` | `#269153` |
| `--green-430` | `#008043` | `#008043` | `#008043` | `#008043` |
| `--green-460` | `#01713a` | `#01713a` | `#01713a` | `#01713a` |
| `--green-500` | `#006433` | `#006433` | `#006433` | `#006433` |
| `--green-530` | `#00562a` | `#00562a` | `#00562a` | `#00562a` |
| `--green-560` | `#004d24` | `#004d24` | `#004d24` | `#004d24` |
| `--green-600` | `#00431e` | `#00431e` | `#00431e` | `#00431e` |
| `--green-630` | `#003d19` | `#003d19` | `#003d19` | `#003d19` |
| `--green-660` | `#003615` | `#003615` | `#003615` | `#003615` |
| `--green-700` | `#003011` | `#003011` | `#003011` | `#003011` |
| `--green-730` | `#00290d` | `#00290d` | `#00290d` | `#00290d` |
| `--green-760` | `#00250a` | `#00250a` | `#00250a` | `#00250a` |
| `--green-800` | `#001f07` | `#001f07` | `#001f07` | `#001f07` |
| `--green-830` | `#001b05` | `#001b05` | `#001b05` | `#001b05` |
| `--green-860` | `#001603` | `#001603` | `#001603` | `#001603` |
| `--green-900` | `#001303` | `#001303` | `#001303` | `#001303` |
| `--guild-profile-banner-background-default` | `#121214` | `#70717a` | `#2c2d32` | `#000000` |
| `--mobile-expression-picker-background-default` | `#242429` | `#ffffff` | `#393a41` | `#0a0a0c` |
| `--mobile-guildbar-icon-default` | `#abacb2` | `#595a63` | `#c5c6ca` | `#96979e` |
| `--mobile-searchbar-gradient-background` | `#1a1a1e` | `#fbfbfb` | `#323339` | `#000000` |
| `--orange-100` | `#ffe3d9` | `#ffe3d9` | `#ffe3d9` | `#ffe3d9` |
| `--orange-130` | `#ffe3d9` | `#ffe3d9` | `#ffe3d9` | `#ffe3d9` |
| `--orange-160` | `#ffe3d9` | `#ffe3d9` | `#ffe3d9` | `#ffe3d9` |
| `--orange-200` | `#ffdcce` | `#ffdcce` | `#ffdcce` | `#ffdcce` |
| `--orange-230` | `#ffcdb4` | `#ffcdb4` | `#ffcdb4` | `#ffcdb4` |
| `--orange-260` | `#f9ba97` | `#f9ba97` | `#f9ba97` | `#f9ba97` |
| `--orange-300` | `#f1a579` | `#f1a579` | `#f1a579` | `#f1a579` |
| `--orange-330` | `#e38a56` | `#e38a56` | `#e38a56` | `#e38a56` |
| `--orange-345` | `#da7b43` | `#da7b43` | `#da7b43` | `#da7b43` |
| `--orange-360` | `#d36f34` | `#d36f34` | `#d36f34` | `#d36f34` |
| `--orange-400` | `#cd6729` | `#cd6729` | `#cd6729` | `#cd6729` |
| `--orange-430` | `#c75e1d` | `#c75e1d` | `#c75e1d` | `#c75e1d` |
| `--orange-460` | `#a44304` | `#a44304` | `#a44304` | `#a44304` |
| `--orange-500` | `#933a03` | `#933a03` | `#933a03` | `#933a03` |
| `--orange-530` | `#833100` | `#833100` | `#833100` | `#833100` |
| `--orange-560` | `#702600` | `#702600` | `#702600` | `#702600` |
| `--orange-600` | `#6a2200` | `#6a2200` | `#6a2200` | `#6a2200` |
| `--orange-630` | `#5b1900` | `#5b1900` | `#5b1900` | `#5b1900` |
| `--orange-660` | `#581700` | `#581700` | `#581700` | `#581700` |
| `--orange-700` | `#551500` | `#551500` | `#551500` | `#551500` |
| `--orange-730` | `#470b00` | `#470b00` | `#470b00` | `#470b00` |
| `--orange-760` | `#420800` | `#420800` | `#420800` | `#420800` |
| `--orange-800` | `#390300` | `#390300` | `#390300` | `#390300` |
| `--orange-830` | `#1f0002` | `#1f0002` | `#1f0002` | `#1f0002` |
| `--orange-860` | `#1f0002` | `#1f0002` | `#1f0002` | `#1f0002` |
| `--orange-900` | `#180002` | `#180002` | `#180002` | `#180002` |
| `--plum-0` | `#fbfbfb` | `#fbfbfb` | `#fbfbfb` | `#fbfbfb` |
| `--plum-1` | `#f3f3f4` | `#f3f3f4` | `#f3f3f4` | `#f3f3f4` |
| `--plum-10` | `#84858d` | `#84858d` | `#84858d` | `#84858d` |
| `--plum-11` | `#6c6d76` | `#6c6d76` | `#6c6d76` | `#6c6d76` |
| `--plum-12` | `#5c5d67` | `#5c5d67` | `#5c5d67` | `#5c5d67` |
| `--plum-13` | `#4f505a` | `#4f505a` | `#4f505a` | `#4f505a` |
| `--plum-14` | `#43434c` | `#43434c` | `#43434c` | `#43434c` |
| `--plum-15` | `#393a41` | `#393a41` | `#393a41` | `#393a41` |
| `--plum-16` | `#323339` | `#323339` | `#323339` | `#323339` |
| `--plum-17` | `#2c2d32` | `#2c2d32` | `#2c2d32` | `#2c2d32` |
| `--plum-18` | `#27272c` | `#27272c` | `#27272c` | `#27272c` |
| `--plum-19` | `#222327` | `#222327` | `#222327` | `#222327` |
| `--plum-2` | `#ebeced` | `#ebeced` | `#ebeced` | `#ebeced` |
| `--plum-20` | `#1d1d21` | `#1d1d21` | `#1d1d21` | `#1d1d21` |
| `--plum-21` | `#1a1a1e` | `#1a1a1e` | `#1a1a1e` | `#1a1a1e` |
| `--plum-22` | `#161619` | `#161619` | `#161619` | `#161619` |
| `--plum-23` | `#131416` | `#131416` | `#131416` | `#131416` |
| `--plum-24` | `#101013` | `#101013` | `#101013` | `#101013` |
| `--plum-25` | `#0c0c0e` | `#0c0c0e` | `#0c0c0e` | `#0c0c0e` |
| `--plum-26` | `#070709` | `#070709` | `#070709` | `#070709` |
| `--plum-3` | `#e4e4e6` | `#e4e4e6` | `#e4e4e6` | `#e4e4e6` |
| `--plum-4` | `#dcdcdf` | `#dcdcdf` | `#dcdcdf` | `#dcdcdf` |
| `--plum-5` | `#d4d5d8` | `#d4d5d8` | `#d4d5d8` | `#d4d5d8` |
| `--plum-6` | `#c9cace` | `#c9cace` | `#c9cace` | `#c9cace` |
| `--plum-7` | `#babbc0` | `#babbc0` | `#babbc0` | `#babbc0` |
| `--plum-8` | `#a8a8af` | `#a8a8af` | `#a8a8af` | `#a8a8af` |
| `--plum-9` | `#96979e` | `#96979e` | `#96979e` | `#96979e` |
| `--primary-100` | `#fbfbfb` | `#fbfbfb` | `#fbfbfb` | `#fbfbfb` |
| `--primary-130` | `#f3f3f4` | `#f3f3f4` | `#f3f3f4` | `#f3f3f4` |
| `--primary-160` | `#ebeced` | `#ebeced` | `#ebeced` | `#ebeced` |
| `--primary-200` | `#e4e4e6` | `#e4e4e6` | `#e4e4e6` | `#e4e4e6` |
| `--primary-230` | `#dcdcdf` | `#dcdcdf` | `#dcdcdf` | `#dcdcdf` |
| `--primary-260` | `#d4d5d8` | `#d4d5d8` | `#d4d5d8` | `#d4d5d8` |
| `--primary-300` | `#c9cace` | `#c9cace` | `#c9cace` | `#c9cace` |
| `--primary-330` | `#babbc0` | `#babbc0` | `#babbc0` | `#babbc0` |
| `--primary-345` | `#abacb2` | `#abacb2` | `#abacb2` | `#abacb2` |
| `--primary-360` | `#999aa1` | `#999aa1` | `#999aa1` | `#999aa1` |
| `--primary-400` | `#84858d` | `#84858d` | `#84858d` | `#84858d` |
| `--primary-430` | `#6c6d76` | `#6c6d76` | `#6c6d76` | `#6c6d76` |
| `--primary-460` | `#5c5d67` | `#5c5d67` | `#5c5d67` | `#5c5d67` |
| `--primary-500` | `#4f505a` | `#4f505a` | `#4f505a` | `#4f505a` |
| `--primary-530` | `#41424a` | `#41424a` | `#41424a` | `#41424a` |
| `--primary-560` | `#393a41` | `#393a41` | `#393a41` | `#393a41` |
| `--primary-600` | `#323339` | `#323339` | `#323339` | `#323339` |
| `--primary-630` | `#2c2d32` | `#2c2d32` | `#2c2d32` | `#2c2d32` |
| `--primary-645` | `#292a2f` | `#292a2f` | `#292a2f` | `#292a2f` |
| `--primary-660` | `#242429` | `#242429` | `#242429` | `#242429` |
| `--primary-700` | `#1e1f22` | `#1e1f22` | `#1e1f22` | `#1e1f22` |
| `--primary-730` | `#1a1a1e` | `#1a1a1e` | `#1a1a1e` | `#1a1a1e` |
| `--primary-760` | `#161619` | `#161619` | `#161619` | `#161619` |
| `--primary-800` | `#121214` | `#121214` | `#121214` | `#121214` |
| `--primary-830` | `#0c0c0e` | `#0c0c0e` | `#0c0c0e` | `#0c0c0e` |
| `--primary-860` | `#050506` | `#050506` | `#050506` | `#050506` |
| `--primary-900` | `#020203` | `#020203` | `#020203` | `#020203` |
| `--quest-home-tab-gradient-blurple-center` | `#5865f2` | `#5865f2` | `#5865f2` | `#5865f2` |
| `--quest-home-tab-gradient-blurple-inner` | `#5866f180` | `#5866f180` | `#5866f180` | `#5866f180` |
| `--quest-home-tab-gradient-blurple-outer` | `#00000000` | `#00000000` | `#00000000` | `#00000000` |
| `--red-100` | `#ffdedd` | `#ffdedd` | `#ffdedd` | `#ffdedd` |
| `--red-130` | `#ffdedd` | `#ffdedd` | `#ffdedd` | `#ffdedd` |
| `--red-160` | `#ffdedd` | `#ffdedd` | `#ffdedd` | `#ffdedd` |
| `--red-200` | `#ffdedd` | `#ffdedd` | `#ffdedd` | `#ffdedd` |
| `--red-230` | `#ffcfcd` | `#ffcfcd` | `#ffcfcd` | `#ffcfcd` |
| `--red-260` | `#ffbdb9` | `#ffbdb9` | `#ffbdb9` | `#ffbdb9` |
| `--red-300` | `#ffa7a3` | `#ffa7a3` | `#ffa7a3` | `#ffa7a3` |
| `--red-330` | `#ff9691` | `#ff9691` | `#ff9691` | `#ff9691` |
| `--red-345` | `#f67774` | `#f67774` | `#f67774` | `#f67774` |
| `--red-360` | `#e95c5b` | `#e95c5b` | `#e95c5b` | `#e95c5b` |
| `--red-400` | `#da3e44` | `#da3e44` | `#da3e44` | `#da3e44` |
| `--red-430` | `#d6363f` | `#d6363f` | `#d6363f` | `#d6363f` |
| `--red-460` | `#bd2934` | `#bd2934` | `#bd2934` | `#bd2934` |
| `--red-500` | `#a2212b` | `#a2212b` | `#a2212b` | `#a2212b` |
| `--red-530` | `#8f1a25` | `#8f1a25` | `#8f1a25` | `#8f1a25` |
| `--red-560` | `#811420` | `#811420` | `#811420` | `#811420` |
| `--red-600` | `#730e1b` | `#730e1b` | `#730e1b` | `#730e1b` |
| `--red-630` | `#6c0b19` | `#6c0b19` | `#6c0b19` | `#6c0b19` |
| `--red-660` | `#5f0514` | `#5f0514` | `#5f0514` | `#5f0514` |
| `--red-700` | `#550211` | `#550211` | `#550211` | `#550211` |
| `--red-730` | `#45000c` | `#45000c` | `#45000c` | `#45000c` |
| `--red-760` | `#3c0009` | `#3c0009` | `#3c0009` | `#3c0009` |
| `--red-800` | `#320007` | `#320007` | `#320007` | `#320007` |
| `--red-830` | `#2d0006` | `#2d0006` | `#2d0006` | `#2d0006` |
| `--red-860` | `#230004` | `#230004` | `#230004` | `#230004` |
| `--red-900` | `#1d0004` | `#1d0004` | `#1d0004` | `#1d0004` |
| `--spine-default` | `#474851` | `#c5c6ca` | `#595a63` | `#383940` |
| `--standard-tab-gradient-center` | `#5865f2` | `#a0a9fa` | `#5865f2` | `#5865f2` |
| `--standard-tab-gradient-inner-ring` | `#5866f180` | `#c3c7fb40` | `#5866f180` | `#5866f180` |
| `--standard-tab-gradient-outer-ring` | `#00000000` | `#00000000` | `#00000000` | `#00000000` |
| `--steam-review-text-mixed` | `#f49f00` | `#884800` | `#ffc252` | `#d78900` |
| `--steam-review-text-negative` | `#f06a67` | `#d22d39` | `#fd8c87` | `#e24d50` |
| `--steam-review-text-positive` | `#4d96ee` | `#006dd4` | `#7ab2f7` | `#2781e7` |
| `--tabs-indicator-default` | `#798df9` | `#525fe0` | `#94a8ff` | `#6374f4` |
| `--tabs-indicator-overlay` | `#fbfbfb` | `#28282d` | `#ffffff` | `#dcdcdf` |
| `--teal-100` | `#cafcff` | `#cafcff` | `#cafcff` | `#cafcff` |
| `--teal-130` | `#cafcff` | `#cafcff` | `#cafcff` | `#cafcff` |
| `--teal-160` | `#cafcff` | `#cafcff` | `#cafcff` | `#cafcff` |
| `--teal-200` | `#b0edf4` | `#b0edf4` | `#b0edf4` | `#b0edf4` |
| `--teal-230` | `#97dfe6` | `#97dfe6` | `#97dfe6` | `#97dfe6` |
| `--teal-260` | `#7dd0d8` | `#7dd0d8` | `#7dd0d8` | `#7dd0d8` |
| `--teal-300` | `#68c4cd` | `#68c4cd` | `#68c4cd` | `#68c4cd` |
| `--teal-330` | `#4cb5bf` | `#4cb5bf` | `#4cb5bf` | `#4cb5bf` |
| `--teal-345` | `#3caeb8` | `#3caeb8` | `#3caeb8` | `#3caeb8` |
| `--teal-360` | `#15a2ac` | `#15a2ac` | `#15a2ac` | `#15a2ac` |
| `--teal-400` | `#00919d` | `#00919d` | `#00919d` | `#00919d` |
| `--teal-430` | `#007c87` | `#007c87` | `#007c87` | `#007c87` |
| `--teal-460` | `#006d78` | `#006d78` | `#006d78` | `#006d78` |
| `--teal-500` | `#005e69` | `#005e69` | `#005e69` | `#005e69` |
| `--teal-530` | `#00525c` | `#00525c` | `#00525c` | `#00525c` |
| `--teal-560` | `#004953` | `#004953` | `#004953` | `#004953` |
| `--teal-600` | `#004049` | `#004049` | `#004049` | `#004049` |
| `--teal-630` | `#003942` | `#003942` | `#003942` | `#003942` |
| `--teal-660` | `#00323b` | `#00323b` | `#00323b` | `#00323b` |
| `--teal-700` | `#002e37` | `#002e37` | `#002e37` | `#002e37` |
| `--teal-730` | `#002730` | `#002730` | `#002730` | `#002730` |
| `--teal-760` | `#00212a` | `#00212a` | `#00212a` | `#00212a` |
| `--teal-800` | `#001d26` | `#001d26` | `#001d26` | `#001d26` |
| `--teal-830` | `#001921` | `#001921` | `#001921` | `#001921` |
| `--teal-860` | `#00141c` | `#00141c` | `#00141c` | `#00141c` |
| `--teal-900` | `#001119` | `#001119` | `#001119` | `#001119` |
| `--yellow-100` | `#ffe7cf` | `#ffe7cf` | `#ffe7cf` | `#ffe7cf` |
| `--yellow-130` | `#ffe7cf` | `#ffe7cf` | `#ffe7cf` | `#ffe7cf` |
| `--yellow-160` | `#ffe7cf` | `#ffe7cf` | `#ffe7cf` | `#ffe7cf` |
| `--yellow-200` | `#ffe1b5` | `#ffe1b5` | `#ffe1b5` | `#ffe1b5` |
| `--yellow-230` | `#ffd58b` | `#ffd58b` | `#ffd58b` | `#ffd58b` |
| `--yellow-260` | `#ffbf4a` | `#ffbf4a` | `#ffbf4a` | `#ffbf4a` |
| `--yellow-300` | `#fdb833` | `#fdb833` | `#fdb833` | `#fdb833` |
| `--yellow-330` | `#fcb323` | `#fcb323` | `#fcb323` | `#fcb323` |
| `--yellow-345` | `#e09000` | `#e09000` | `#e09000` | `#e09000` |
| `--yellow-360` | `#c97e00` | `#c97e00` | `#c97e00` | `#c97e00` |
| `--yellow-400` | `#bb7300` | `#bb7300` | `#bb7300` | `#bb7300` |
| `--yellow-430` | `#a56100` | `#a56100` | `#a56100` | `#a56100` |
| `--yellow-460` | `#945300` | `#945300` | `#945300` | `#945300` |
| `--yellow-500` | `#834500` | `#834500` | `#834500` | `#834500` |
| `--yellow-530` | `#773b00` | `#773b00` | `#773b00` | `#773b00` |
| `--yellow-560` | `#6b3100` | `#6b3100` | `#6b3100` | `#6b3100` |
| `--yellow-600` | `#622a00` | `#622a00` | `#622a00` | `#622a00` |
| `--yellow-630` | `#5a2400` | `#5a2400` | `#5a2400` | `#5a2400` |
| `--yellow-660` | `#5a2400` | `#5a2400` | `#5a2400` | `#5a2400` |
| `--yellow-700` | `#521d00` | `#521d00` | `#521d00` | `#521d00` |
| `--yellow-730` | `#4b1700` | `#4b1700` | `#4b1700` | `#4b1700` |
| `--yellow-760` | `#431000` | `#431000` | `#431000` | `#431000` |
| `--yellow-800` | `#3f0d00` | `#3f0d00` | `#3f0d00` | `#3f0d00` |
| `--yellow-830` | `#330400` | `#330400` | `#330400` | `#330400` |
| `--yellow-860` | `#1b0000` | `#1b0000` | `#1b0000` | `#1b0000` |
| `--yellow-900` | `#1b0000` | `#1b0000` | `#1b0000` | `#1b0000` |

## `:root` — primitivos (iguais em todos os temas)

4072 variáveis, 2369 sem contar as `-hsl`.

### Paleta

Passo → cor final (sRGB). A escala `primary` é a base dos cinzas dos temas; `brand` é o blurple.

**black** — 500 `#000000`

**white** — 500 `#ffffff`

**neutral** — 1 `#ffffff` · 2 `#fbfbfb` · 3 `#f7f7f8` · 4 `#f3f3f4` · 5 `#efeff1` · 6 `#ebeced` · 7 `#e8e8ea` · 8 `#e4e4e6` · 9 `#e0e0e3` · 10 `#dcdcdf` · 11 `#d8d9dc` · 12 `#d4d5d8` · 13 `#d1d1d5` · 14 `#cdcdd1` · 15 `#c9cace` · 16 `#c5c6ca` · 17 `#c2c2c7` · 18 `#bebec3` · 19 `#babbc0` · 20 `#b6b7bc` · 21 `#b3b3b9` · 22 `#afb0b6` · 23 `#abacb2` · 24 `#a8a8af` · 25 `#a4a5ab` · 26 `#a0a1a8` · 27 `#9d9ea5` · 28 `#999aa1` · 29 `#96979e` · 30 `#92939b` · 31 `#8f9097` · 32 `#8b8c94` · 33 `#888991` · 34 `#84858d` · 35 `#81828a` · 36 `#7d7e87` · 37 `#7a7b83` · 38 `#767780` · 39 `#73747d` · 40 `#70717a` · 41 `#6c6d76` · 42 `#696a73` · 43 `#666770` · 44 `#62636d` · 45 `#5f606a` · 46 `#5c5d67` · 47 `#595a63` · 48 `#555660` · 49 `#52535d` · 50 `#4f505a` · 51 `#4d4e58` · 52 `#4c4d56` · 53 `#4a4b55` · 54 `#494a53` · 55 `#474851` · 56 `#46474f` · 57 `#44454d` · 58 `#43434c` · 59 `#41424a` · 60 `#3f4048` · 61 `#3e3f46` · 62 `#3c3d45` · 63 `#3b3c43` · 64 `#393a41` · 65 `#383940` · 66 `#36373e` · 67 `#35363c` · 68 `#34343a` · 69 `#323339` · 70 `#313137` · 71 `#2f3035` · 72 `#2e2e34` · 73 `#2c2d32` · 74 `#2b2b31` · 75 `#292a2f` · 76 `#28282d` · 77 `#27272c` · 78 `#25262a` · 79 `#242429` · 80 `#222327` · 81 `#212125` · 82 `#202024` · 83 `#1e1f22` · 84 `#1d1d21` · 85 `#1b1c1f` · 86 `#1a1a1e` · 87 `#19191c` · 88 `#17181b` · 89 `#161619` · 90 `#151518` · 91 `#131416` · 92 `#121214` · 93 `#101013` · 94 `#0e0e10` · 95 `#0c0c0e` · 96 `#0a0a0c` · 97 `#070709` · 98 `#050506` · 99 `#020203` · 100 `#000000`

**blurple** — 1 `#e6eaff` · 2 `#e3e7ff` · 3 `#dfe4ff` · 4 `#dbe2ff` · 5 `#d8dfff` · 6 `#d4ddff` · 7 `#d1daff` · 8 `#cdd7ff` · 9 `#cad5ff` · 10 `#c7d2ff` · 11 `#c3d0ff` · 12 `#c0cdff` · 13 `#bccaff` · 14 `#b9c8ff` · 15 `#b6c5ff` · 16 `#b3c3ff` · 17 `#b0c0ff` · 18 `#acbdff` · 19 `#a9bbff` · 20 `#a6b8ff` · 21 `#a3b5ff` · 22 `#a0b3ff` · 23 `#9db0ff` · 24 `#9aadff` · 25 `#97abff` · 26 `#94a8ff` · 27 `#91a5fe` · 28 `#8fa3fe` · 29 `#8ca0fd` · 30 `#899dfd` · 31 `#869bfc` · 32 `#8398fb` · 33 `#8195fb` · 34 `#7e92fa` · 35 `#7c90fa` · 36 `#798df9` · 37 `#768af9` · 38 `#7487f8` · 39 `#7185f8` · 40 `#6f82f7` · 41 `#6c7ff6` · 42 `#6a7cf6` · 43 `#6879f5` · 44 `#6576f5` · 45 `#6374f4` · 46 `#6171f4` · 47 `#5f6ef3` · 48 `#5d6bf3` · 49 `#5a68f2` · 50 `#5865f2` · 51 `#5663ec` · 52 `#5461e6` · 53 `#525fe0` · 54 `#505ddb` · 55 `#4e5bd5` · 56 `#4c59d0` · 57 `#4a58cb` · 58 `#4856c5` · 59 `#4654c0` · 60 `#4452bb` · 61 `#4250b6` · 62 `#404eb1` · 63 `#3e4cad` · 64 `#3c4aa8` · 65 `#3a48a3` · 66 `#38469f` · 67 `#36449a` · 68 `#344296` · 69 `#324091` · 70 `#303e8d` · 71 `#2e3c88` · 72 `#2c3a84` · 73 `#2b3880` · 74 `#29367c` · 75 `#273478` · 76 `#253273` · 77 `#23316f` · 78 `#212f6b` · 79 `#1f2d67` · 80 `#1e2b63` · 81 `#1c295f` · 82 `#1a275b` · 83 `#182557` · 84 `#172354` · 85 `#152250` · 86 `#14204c` · 87 `#121e48` · 88 `#101c45` · 89 `#0f1a41` · 90 `#0d193d` · 91 `#0c173a` · 92 `#0a1536` · 93 `#091332` · 94 `#08112e` · 95 `#060f29` · 96 `#050d24` · 97 `#040a1e` · 98 `#030716` · 99 `#01030c` · 100 `#000000`

**pink** — 1 `#ffd7f4` · 2 `#ffd4f3` · 3 `#ffd1f3` · 4 `#ffcef2` · 5 `#ffcbf2` · 6 `#ffc9f1` · 7 `#ffc6f1` · 8 `#ffc3f0` · 9 `#ffc1f0` · 10 `#ffbeef` · 11 `#ffbbef` · 12 `#ffb8ee` · 13 `#ffb6ed` · 14 `#ffb3ec` · 15 `#ffb1ec` · 16 `#ffaeeb` · 17 `#ffacea` · 18 `#ffa9e9` · 19 `#ffa7e9` · 20 `#ffa4e8` · 21 `#ffa1e7` · 22 `#ff9fe7` · 23 `#ff9ce6` · 24 `#ff99e5` · 25 `#ff97e5` · 26 `#ff94e4` · 27 `#ff91e3` · 28 `#ff8ee3` · 29 `#ff8be2` · 30 `#ff88e1` · 31 `#ff86e0` · 32 `#ff83e0` · 33 `#ff80df` · 34 `#ff7dde` · 35 `#ff7bdd` · 36 `#ff78dd` · 37 `#ff75dc` · 38 `#ff72db` · 39 `#ff6fda` · 40 `#ff6cd9` · 41 `#ff69d9` · 42 `#ff66d8` · 43 `#ff63d7` · 44 `#ff60d6` · 45 `#ff5dd6` · 46 `#ff59d5` · 47 `#ff56d4` · 48 `#ff53d3` · 49 `#ff4fd3` · 50 `#ff4bd2` · 51 `#fa4acd` · 52 `#f549c9` · 53 `#ef47c4` · 54 `#ea46c0` · 55 `#e444bb` · 56 `#df42b7` · 57 `#da41b3` · 58 `#d53fae` · 59 `#d03daa` · 60 `#cb3ba6` · 61 `#c639a2` · 62 `#c1389d` · 63 `#bc3699` · 64 `#b73495` · 65 `#b23291` · 66 `#ae308d` · 67 `#a92e89` · 68 `#a42b85` · 69 `#a02982` · 70 `#9b277e` · 71 `#97257a` · 72 `#922376` · 73 `#8e2172` · 74 `#891f6e` · 75 `#851d6b` · 76 `#801b67` · 77 `#7c1863` · 78 `#781660` · 79 `#73145c` · 80 `#6f1258` · 81 `#6b1055` · 82 `#660d51` · 83 `#620b4e` · 84 `#5e094a` · 85 `#5a0747` · 86 `#560543` · 87 `#520340` · 88 `#4e023d` · 89 `#4a0139` · 90 `#460036` · 91 `#420033` · 92 `#3e002f` · 93 `#3a002c` · 94 `#360029` · 95 `#320025` · 96 `#2d0022` · 97 `#28001d` · 98 `#210018` · 99 `#190011` · 100 `#0b0006`

**red** — 100 `#ffdedd` · 130 `#ffdedd` · 160 `#ffdedd` · 200 `#ffdedd` · 230 `#ffcfcd` · 260 `#ffbdb9` · 300 `#ffa7a3` · 330 `#ff9691` · 345 `#f67774` · 360 `#e95c5b` · 400 `#da3e44` · 430 `#d6363f` · 460 `#bd2934` · 500 `#a2212b` · 530 `#8f1a25` · 560 `#811420` · 600 `#730e1b` · 630 `#6c0b19` · 660 `#5f0514` · 700 `#550211` · 730 `#45000c` · 760 `#3c0009` · 800 `#320007` · 830 `#2d0006` · 860 `#230004` · 900 `#1d0004`

**orange** — 100 `#ffe3d9` · 130 `#ffe3d9` · 160 `#ffe3d9` · 200 `#ffdcce` · 230 `#ffcdb4` · 260 `#f9ba97` · 300 `#f1a579` · 330 `#e38a56` · 345 `#da7b43` · 360 `#d36f34` · 400 `#cd6729` · 430 `#c75e1d` · 460 `#a44304` · 500 `#933a03` · 530 `#833100` · 560 `#702600` · 600 `#6a2200` · 630 `#5b1900` · 660 `#581700` · 700 `#551500` · 730 `#470b00` · 760 `#420800` · 800 `#390300` · 830 `#1f0002` · 860 `#1f0002` · 900 `#180002`

**yellow** — 100 `#ffe7cf` · 130 `#ffe7cf` · 160 `#ffe7cf` · 200 `#ffe1b5` · 230 `#ffd58b` · 260 `#ffbf4a` · 300 `#fdb833` · 330 `#fcb323` · 345 `#e09000` · 360 `#c97e00` · 400 `#bb7300` · 430 `#a56100` · 460 `#945300` · 500 `#834500` · 530 `#773b00` · 560 `#6b3100` · 600 `#622a00` · 630 `#5a2400` · 660 `#5a2400` · 700 `#521d00` · 730 `#4b1700` · 760 `#431000` · 800 `#3f0d00` · 830 `#330400` · 860 `#1b0000` · 900 `#1b0000`

**green** — 100 `#c8ffd8` · 130 `#c8ffd8` · 160 `#c1fcd1` · 200 `#abedbd` · 230 `#92dba6` · 260 `#81ce97` · 300 `#73c48b` · 330 `#65ba7f` · 345 `#53ad71` · 360 `#3d9e60` · 400 `#269153` · 430 `#008043` · 460 `#01713a` · 500 `#006433` · 530 `#00562a` · 560 `#004d24` · 600 `#00431e` · 630 `#003d19` · 660 `#003615` · 700 `#003011` · 730 `#00290d` · 760 `#00250a` · 800 `#001f07` · 830 `#001b05` · 860 `#001603` · 900 `#001303`

**blue** — 100 `#e5efff` · 130 `#e5efff` · 160 `#e5efff` · 200 `#d3e5ff` · 230 `#b8d7ff` · 260 `#a3cbfd` · 300 `#82b7f8` · 330 `#6aa8f4` · 345 `#5299ef` · 360 `#408eec` · 400 `#217fe7` · 430 `#006fd9` · 460 `#0363c1` · 500 `#0158ab` · 530 `#004c96` · 560 `#004386` · 600 `#003a76` · 630 `#00346b` · 660 `#002e60` · 700 `#002756` · 730 `#00214b` · 760 `#001b41` · 800 `#00173b` · 830 `#001333` · 860 `#00102f` · 900 `#000d2a`

**teal** — 100 `#cafcff` · 130 `#cafcff` · 160 `#cafcff` · 200 `#b0edf4` · 230 `#97dfe6` · 260 `#7dd0d8` · 300 `#68c4cd` · 330 `#4cb5bf` · 345 `#3caeb8` · 360 `#15a2ac` · 400 `#00919d` · 430 `#007c87` · 460 `#006d78` · 500 `#005e69` · 530 `#00525c` · 560 `#004953` · 600 `#004049` · 630 `#003942` · 660 `#00323b` · 700 `#002e37` · 730 `#002730` · 760 `#00212a` · 800 `#001d26` · 830 `#001921` · 860 `#00141c` · 900 `#001119`

**brand** — 100 `#e6eaff` · 130 `#e6eaff` · 160 `#e6eaff` · 200 `#dbe2ff` · 230 `#d1daff` · 260 `#c7d2ff` · 300 `#b6c5ff` · 330 `#a3b5ff` · 345 `#94a8ff` · 360 `#8ca0fd` · 400 `#7487f8` · 430 `#6c7ff6` · 460 `#6374f4` · 500 `#5865f2` · 530 `#505ddb` · 560 `#4654c0` · 600 `#3a48a3` · 630 `#303e8d` · 660 `#29367c` · 700 `#1c295f` · 730 `#1a275b` · 760 `#172354` · 800 `#14204c` · 830 `#0c173a` · 860 `#050d24` · 900 `#01030c`

**primary** — 100 `#fbfbfb` · 130 `#f3f3f4` · 160 `#ebeced` · 200 `#e4e4e6` · 230 `#dcdcdf` · 260 `#d4d5d8` · 300 `#c9cace` · 330 `#babbc0` · 345 `#abacb2` · 360 `#999aa1` · 400 `#84858d` · 430 `#6c6d76` · 460 `#5c5d67` · 500 `#4f505a` · 530 `#41424a` · 560 `#393a41` · 600 `#323339` · 630 `#2c2d32` · 645 `#292a2f` · 660 `#242429` · 700 `#1e1f22` · 730 `#1a1a1e` · 760 `#161619` · 800 `#121214` · 830 `#0c0c0e` · 860 `#050506` · 900 `#020203`

**plum** — 0 `#fbfbfb` · 1 `#f3f3f4` · 2 `#ebeced` · 3 `#e4e4e6` · 4 `#dcdcdf` · 5 `#d4d5d8` · 6 `#c9cace` · 7 `#babbc0` · 8 `#a8a8af` · 9 `#96979e` · 10 `#84858d` · 11 `#6c6d76` · 12 `#5c5d67` · 13 `#4f505a` · 14 `#43434c` · 15 `#393a41` · 16 `#323339` · 17 `#2c2d32` · 18 `#27272c` · 19 `#222327` · 20 `#1d1d21` · 21 `#1a1a1e` · 22 `#161619` · 23 `#131416` · 24 `#101013` · 25 `#0c0c0e` · 26 `#070709`

**opacidades** (275): `--opacity-<cor>-<1..100>` = a cor com alfa — ex.: `--opacity-white-8` `#ffffff14`, `--opacity-white-12` `#ffffff1f`, `--opacity-white-20` `#ffffff33`, `--opacity-white-48` `#ffffff7a`, `--opacity-black-8` `#00000014`, `--opacity-black-12` `#0000001f`, `--opacity-black-20` `#00000033`, `--opacity-black-48` `#0000007a`

### raio

| variável | valor no CSS | resolvido |
| --- | --- | --- |
| `--radius-none` | `0px` | `0px` |
| `--radius-xs` | `4px` | `4px` |
| `--radius-sm` | `8px` | `8px` |
| `--radius-md` | `12px` | `12px` |
| `--radius-lg` | `16px` | `16px` |
| `--radius-xl` | `24px` | `24px` |
| `--radius-xxl` | `32px` | `32px` |
| `--radius-round` | `2147483647px` | `2147483647px` |

### espaçamento

| variável | valor no CSS | resolvido |
| --- | --- | --- |
| `--space-0` | `0px` | `0px` |
| `--space-4` | `4px` | `4px` |
| `--space-6` | `6px` | `6px` |
| `--space-8` | `8px` | `8px` |
| `--space-10` | `10px` | `10px` |
| `--space-12` | `12px` | `12px` |
| `--space-16` | `16px` | `16px` |
| `--space-20` | `20px` | `20px` |
| `--space-24` | `24px` | `24px` |
| `--space-26` | `26px` | `26px` |
| `--space-30` | `30px` | `30px` |
| `--space-32` | `32px` | `32px` |
| `--space-40` | `40px` | `40px` |
| `--space-48` | `48px` | `48px` |
| `--space-64` | `64px` | `64px` |
| `--space-80` | `80px` | `80px` |
| `--space-96` | `96px` | `96px` |
| `--space-128` | `128px` | `128px` |
| `--space-160` | `160px` | `160px` |
| `--space-192` | `192px` | `192px` |
| `--space-xxs` | `var(--space-4)` | `4px` |
| `--space-xs` | `var(--space-8)` | `8px` |
| `--space-sm` | `var(--space-12)` | `12px` |
| `--space-md` | `var(--space-16)` | `16px` |
| `--space-lg` | `var(--space-20)` | `20px` |
| `--space-xl` | `var(--space-24)` | `24px` |
| `--space-xxl` | `var(--space-32)` | `32px` |

### tamanho

| variável | valor no CSS | resolvido |
| --- | --- | --- |
| `--size-0` | `0px` | `0px` |
| `--size-4` | `4px` | `4px` |
| `--size-8` | `8px` | `8px` |
| `--size-12` | `12px` | `12px` |
| `--size-16` | `16px` | `16px` |
| `--size-20` | `20px` | `20px` |
| `--size-24` | `24px` | `24px` |
| `--size-32` | `32px` | `32px` |
| `--size-48` | `48px` | `48px` |
| `--size-64` | `64px` | `64px` |
| `--size-80` | `80px` | `80px` |
| `--size-96` | `96px` | `96px` |
| `--size-128` | `128px` | `128px` |
| `--size-160` | `160px` | `160px` |
| `--size-192` | `192px` | `192px` |
| `--size-xxs` | `var(--size-4)` | `4px` |
| `--size-xs` | `var(--size-8)` | `8px` |
| `--size-sm` | `var(--size-12)` | `12px` |
| `--size-md` | `var(--size-16)` | `16px` |
| `--size-lg` | `var(--size-20)` | `20px` |
| `--size-xl` | `var(--size-24)` | `24px` |
| `--size-xxl` | `var(--size-32)` | `32px` |

### breakpoint

| variável | valor no CSS | resolvido |
| --- | --- | --- |
| `--breakpoint-480` | `480px` | `480px` |
| `--breakpoint-640` | `640px` | `640px` |
| `--breakpoint-768` | `768px` | `768px` |
| `--breakpoint-1024` | `1024px` | `1024px` |
| `--breakpoint-1280` | `1280px` | `1280px` |
| `--breakpoint-1536` | `1536px` | `1536px` |
| `--breakpoint-1800` | `1800px` | `1800px` |
| `--breakpoint-2500` | `2500px` | `2500px` |
| `--breakpoint-xxs` | `480px` | `480px` |
| `--breakpoint-xs` | `640px` | `640px` |
| `--breakpoint-sm` | `768px` | `768px` |
| `--breakpoint-md` | `1024px` | `1024px` |
| `--breakpoint-lg` | `1280px` | `1280px` |
| `--breakpoint-xl` | `1536px` | `1536px` |
| `--breakpoint-xxl` | `1800px` | `1800px` |
| `--breakpoint-max` | `2500px` | `2500px` |

### fonte

| variável | valor no CSS | resolvido |
| --- | --- | --- |
| `--font-primary` | `"gg sans","Noto Sans","Helvetica Neue",Helvetica,Arial,sans-serif` | `"gg sans","Noto Sans","Helvetica Neue",Helvetica,Arial,sans-serif` |
| `--font-headline` | `"ABC Ginto Nord","Noto Sans","Helvetica Neue",Helvetica,Arial,sans-serif` | `"ABC Ginto Nord","Noto Sans","Helvetica Neue",Helvetica,Arial,sans-…` |
| `--font-nitro` | `"ABC Ginto Discord Nord","Noto Sans","Helvetica Neue",Helvetica,Arial,sans-serif` | `"ABC Ginto Discord Nord","Noto Sans","Helvetica Neue",Helvetica,Ari…` |
| `--font-code` | `"gg mono","Source Code Pro",Consolas,"Andale Mono WT","Andale Mono","Lucida Console","Luci` | `"gg mono","Source Code Pro",Consolas,"Andale Mono WT","Andale Mono"…` |
| `--font-clan-body` | `Fraunces,"gg sans",serif,"Noto Sans","Helvetica Neue",Helvetica,Arial,sans-serif` | `Fraunces,"gg sans",serif,"Noto Sans","Helvetica Neue",Helvetica,Ari…` |
| `--font-clan-signature` | `Corinthia,"gg sans",cursive,"Noto Sans","Helvetica Neue",Helvetica,Arial,sans-serif` | `Corinthia,"gg sans",cursive,"Noto Sans","Helvetica Neue",Helvetica,…` |
| `--font-display-marketing` | `"ABC Ginto Discord","gg sans",serif,"Noto Sans","Helvetica Neue",Helvetica,Arial,sans-seri` | `"ABC Ginto Discord","gg sans",serif,"Noto Sans","Helvetica Neue",He…` |
| `--font-display-marketing-header` | `"ABC Ginto Discord Nord","gg sans",serif,"Noto Sans","Helvetica Neue",Helvetica,Arial,sans` | `"ABC Ginto Discord Nord","gg sans",serif,"Noto Sans","Helvetica Neu…` |
| `--font-weight-light` | `300` | `300` |
| `--font-weight-normal` | `400` | `400` |
| `--font-weight-medium` | `500` | `500` |
| `--font-weight-semibold` | `600` | `600` |
| `--font-weight-bold` | `700` | `700` |
| `--font-weight-extra-bold` | `800` | `800` |
| `--font-weight-black` | `900` | `900` |
| `--font-weight-extrabold` | `800` | `800` |

### ícone

| variável | valor no CSS | resolvido |
| --- | --- | --- |
| `--icon-size-lg` | `32px` | `32px` |
| `--icon-size-md` | `24px` | `24px` |
| `--icon-size-sm` | `18px` | `18px` |
| `--icon-size-xs` | `16px` | `16px` |
| `--icon-size-xxs` | `12px` | `12px` |

### movimento

| variável | valor no CSS | resolvido |
| --- | --- | --- |
| `--expand-structural-duration` | `100ms` | `100ms` |
| `--expand-fade-duration` | `200ms` | `200ms` |
| `--expand-easing-function` | `ease-out` | `ease-out` |
| `--collapse-structural-duration` | `150ms` | `150ms` |
| `--collapse-fade-duration` | `150ms` | `150ms` |
| `--collapse-easing-function` | `ease-in` | `ease-in` |
| `--motion-spring-subtle` | `linear(0,0.00508 1%,0.02111 2.1%,0.04883 3.3%,0.08833 4.6%,0.13142 5.8%,0.18324 7.1%,0.480` | `linear(0,0.00508 1%,0.02111 2.1%,0.04883 3.3%,0.08833 4.6%,0.13142 …` |
| `--motion-spring-subtle-duration` | `598ms` | `598ms` |

### layout do app

| variável | valor no CSS | resolvido |
| --- | --- | --- |
| `--custom-channel-members-bg` | `var(--background-base-lower)` | — |
| `--chat-avatar-size` | `40px` | `40px` |
| `--chat-input-icon-size` | `20px` | `20px` |
| `--chat-markup-line-height` | `1.375rem` | `1.375rem` |
| `--chat-resize-handle-width` | `8px` | `8px` |
| `--guildbar-avatar-size` | `40px` | `40px` |
| `--guildbar-folder-size` | `48px` | `48px` |
| `--modal-horizontal-padding` | `24px` | `24px` |
| `--modal-vertical-padding` | `16px` | `16px` |
| `--modal-width-large` | `800px` | `800px` |
| `--modal-width-medium` | `602px` | `602px` |
| `--modal-width-small` | `442px` | `442px` |
| `--custom-message-avatar-size` | `40px` | `40px` |
| `--custom-message-avatar-decoration-size` | `calc(var(--custom-message-avatar-size)*var(--decoration-to-avatar-ratio))` | `calc(40px*1.2)` |
| `--custom-member-list-item-avatar-decoration-padding` | `2px` | `2px` |
| `--custom-guild-list-padding` | `var(--space-md)` | `16px` |
| `--custom-guild-list-width` | `calc(var(--guildbar-avatar-size) + var(--custom-guild-list-padding)*2)` | `calc(40px + 16px*2)` |
| `--custom-guild-sidebar-width` | `268px` | `268px` |
| `--custom-app-top-bar-height` | `32px` | `32px` |
| `--custom-app-top-bar-item-radius` | `6px` | `6px` |
| `--custom-channel-header-height` | `49px` | `49px` |
| `--custom-member-list-width` | `264px` | `264px` |

### Demais variáveis do `:root`

1432 variáveis de componente/experimento (`custom-*`, `mobile-*`, `checkpoint-*`, `illo-*`…), só no `variaveis.json`. Por prefixo: custom 357, mobile 166, blue 100, green 100, red 100, teal 100, yellow 100, orange 100, checkpoint 86, bg 68, illo 43, premium 32, platform 23, role 22, guild 6, control 4, legacy 3, hypesquad 3, channels 3, application 2, lol 2, button 2, menu 2, select 2, transparent 1, white 1, black 1, form 1, video 1, decoration 1.

## Tipografia

### Famílias (`:root`)

- `--font-primary`: "gg sans","Noto Sans","Helvetica Neue",Helvetica,Arial,sans-serif
- `--font-headline`: "ABC Ginto Nord","Noto Sans","Helvetica Neue",Helvetica,Arial,sans-serif
- `--font-nitro`: "ABC Ginto Discord Nord","Noto Sans","Helvetica Neue",Helvetica,Arial,sans-serif
- `--font-code`: "gg mono","Source Code Pro",Consolas,"Andale Mono WT","Andale Mono","Lucida Console","Lucida Sans Typewriter","DejaVu Sans Mono","Bitstream Vera Sans Mono","Liberation Mono","Nimbus Mono L",Monaco,"Courier New",Courier,monospace
- `--font-clan-body`: Fraunces,"gg sans",serif,"Noto Sans","Helvetica Neue",Helvetica,Arial,sans-serif
- `--font-clan-signature`: Corinthia,"gg sans",cursive,"Noto Sans","Helvetica Neue",Helvetica,Arial,sans-serif
- `--font-display-marketing`: "ABC Ginto Discord","gg sans",serif,"Noto Sans","Helvetica Neue",Helvetica,Arial,sans-serif
- `--font-display-marketing-header`: "ABC Ginto Discord Nord","gg sans",serif,"Noto Sans","Helvetica Neue",Helvetica,Arial,sans-serif

Uso no CSS (declarações `font-family`): `var(--font-primary)` ×10839, `var(--font-nitro)` ×1065, `var(--font-headline)` ×430, `var(--font-code)` ×327, `inherit` ×10.

### `@font-face` (URLs registradas; arquivos **não** baixados)

| família | peso | estilo | URL (woff2) |
| --- | --- | --- | --- |
| ABC Ginto Nord | 800 | normal | https://discord.com/assets/097b737553f77c92.woff2 |
| ABC Ginto Nord | 800 | italic | https://discord.com/assets/d7f3d9317a5ff964.woff2 |
| ABC Ginto Discord Nord | 700 | normal | https://discord.com/assets/f83f3e7b5185847e.woff2 |
| ABC Ginto Discord Nord | 700 | italic | https://discord.com/assets/404896f5b47121de.woff2 |
| ABC Ginto Discord Nord | 900 | italic | https://discord.com/assets/09aa0c6f7bc0b851.woff2 |
| ABC Ginto Discord | 400 | normal | https://discord.com/assets/4fde9afc66b16d4c.woff2 |
| ABC Ginto Discord | 500 | normal | https://discord.com/assets/272d1732b4e01ec5.woff2 |
| gg sans | 400 | normal | https://discord.com/assets/66d715454104d24e.woff2 |
| gg sans | 400 | italic | https://discord.com/assets/dd24010f3cf7def7.woff2 |
| gg sans | 500 | normal | https://discord.com/assets/b272b33815319bae.woff2 |
| gg sans | 500 | italic | https://discord.com/assets/6a1346ad3821ff3c.woff2 |
| gg sans | 600 | normal | https://discord.com/assets/2df2c3ff74408972.woff2 |
| gg sans | 600 | italic | https://discord.com/assets/d5d789aeb6282532.woff2 |
| gg sans | 700 | normal | https://discord.com/assets/189422196a4f8b53.woff2 |
| gg sans | 700 | italic | https://discord.com/assets/ce3b8055f5114434.woff2 |
| gg sans | 800 | normal | https://discord.com/assets/b2fdbe507d6ce9ef.woff2 |
| gg sans | 800 | italic | https://discord.com/assets/03dcf979852e8b8e.woff2 |
| gg mono | 400 | normal | https://discord.com/assets/249d0a057895c668.woff2 |
| gg mono | 700 | normal | https://discord.com/assets/45efa6936fdfb918.woff2 |
| Noto Sans | 400 | normal | https://discord.com/assets/f72b5ce64feb2086.woff2 |
| Noto Sans | 400 | italic | https://discord.com/assets/7a6a566c2e88a35d.woff2 |
| Noto Sans | 500 | normal | https://discord.com/assets/a4a3d323feb11add.woff2 |
| Noto Sans | 500 | italic | https://discord.com/assets/1a9d6f15e3bade15.woff2 |
| Noto Sans | 600 | normal | https://discord.com/assets/36e7b68ea0c05ae7.woff2 |
| Noto Sans | 600 | italic | https://discord.com/assets/7b652d8bbf885aea.woff2 |
| Noto Sans | 700 | normal | https://discord.com/assets/cb2006dbced0e246.woff2 |
| Noto Sans | 700 | italic | https://discord.com/assets/e52f0cba712e2fb4.woff2 |
| Noto Sans | 800 | normal | https://discord.com/assets/772df2968ca0cf92.woff2 |
| Noto Sans | 800 | italic | https://discord.com/assets/19797abd0807f76b.woff2 |
| Source Code Pro | 400 | normal | https://discord.com/assets/268aaee6b96a3789.woff2 |
| Source Code Pro | 700 | normal | https://discord.com/assets/c76eb070f0fcec44.woff2 |
| Corinthia | 400 | normal | https://discord.com/assets/b598312a5e479904.woff2 |
| Fraunces | 300 800 | normal | https://discord.com/assets/943f151cdf1b637e.woff2 |
| Munro | 400 | normal | https://discord.com/assets/b4099c935ba38494.woff2 |
| Delicious Handrawn | 400 | normal | https://discord.com/assets/54ea0efe31f53f3c.woff2 |
| Sakura | 400 | normal | https://discord.com/assets/33d4f12a85e1f736.woff2 |
| Jellybean | 400 | normal | https://discord.com/assets/e6f5f44abb520735.woff2 |
| Medieval | 400 | normal | https://discord.com/assets/52b541f86401a5b6.woff2 |
| Modern | 500 | normal | https://discord.com/assets/c560709c3470bb66.woff2 |
| 8Bit | 400 | normal | https://discord.com/assets/69c735ca5c604de7.woff2 |
| Vampyre | 400 | normal | https://discord.com/assets/8f20cb550d739cea.woff2 |
| Tempo | 600 | normal | https://discord.com/assets/27b34a77ba5d693e.woff2 |
| Monkey Bars | 700 | normal | https://discord.com/assets/45ef50dce38a931a.woff2 |
| Mainframe | 700 | normal | https://discord.com/assets/4841dace333e9054.woff2 |
| Headbang | 400 | normal | https://discord.com/assets/c00df4f25667809b.woff2 |
| Journal | 700 | normal | https://discord.com/assets/aa59ae54ce7e540a.woff2 |
| AI Visual Identity Glyphs | 400 | normal | https://discord.com/assets/f5f3aa7dcba172ed.woff2 |
| DM Sans | 400 | normal | data: (fonte embutida no CSS, omitida) |
| DM Sans | 500 | normal | data: (fonte embutida no CSS, omitida) |
| DM Sans | 600 | normal | data: (fonte embutida no CSS, omitida) |
| DM Sans | 700 | normal | data: (fonte embutida no CSS, omitida) |
| Rethink Sans | 800 | normal | data: (fonte embutida no CSS, omitida) |

gg sans (400–800, com itálico) é a fonte da UI; ABC Ginto (Nord) é títulos/marketing/Nitro; gg mono é código. Munro, Sakura, 8Bit etc. são as fontes dos *display name styles*. As duas últimas famílias (DM Sans, Rethink Sans) vêm embutidas no SDK de verificação de idade (Incode).

### Escala de texto (classes do design system)

Cada variante tem pesos `normal` 400, `medium` 500, `semibold` 600, `bold` 700 e (algumas) `extrabold` 800.

| variante | font-size | line-height | família |
| --- | ---: | ---: | --- |
| `heading-sm` | 14px | 1.286 | `var(--font-primary)` |
| `heading-md` | 16px | 1.25 | `var(--font-primary)` |
| `heading-lg` | 20px | 1.2 | `var(--font-primary)` |
| `heading-xl` | 24px | 1.25 | `var(--font-primary)` |
| `heading-xxl` | 32px | 1.25 | `var(--font-primary)` |
| `text-xxs` | 10px | 1.2 | `var(--font-primary)` |
| `text-xs` | 12px | 1.333 | `var(--font-primary)` |
| `text-sm` | 14px | 1.286 | `var(--font-primary)` |
| `text-md` | 16px | 1.25 | `var(--font-primary)` |
| `text-lg` | 20px | 1.2 | `var(--font-primary)` |

Tamanhos mais declarados: 16px ×2826, 14px ×1980, 12px ×1973, 20px ×1795, 24px ×1157, 32px ×1146, 10px ×805, 18px ×584, 44px ×427, 15px ×294 (cada um aparece de novo em rem como fallback).

Pesos mais declarados: 600 ×4204, 500 ×3356, 700 ×2371, 400 ×1797, 800 ×924, var(--font-weight-medium) ×219.

## Raios, sombras, breakpoints

**Raios** (`:root`): `--radius-none` 0px, `--radius-xs` 4px, `--radius-sm` 8px, `--radius-md` 12px, `--radius-lg` 16px, `--radius-xl` 24px, `--radius-xxl` 32px, `--radius-round` 2147483647px. `--radius-round` é 2147483647px (pílula).

Mais declarados em `border-radius`: `var(--radius-sm)` ×643, `8px` ×420, `50%` ×290, `var(--radius-md)` ×288, `4px` ×280, `var(--radius-xs)` ×224, `var(--radius-round)` ×125, `var(--radius-lg)` ×123, `12px` ×113, `inherit` ×99, `0` ×86, `3px` ×84, `16px` ×70, `2px` ×65.

**Sombras** (valor final, tema escuro):

- `--elevation-high`: `0 8px 16px hsl(0 0% 0%/0.24)`
- `--elevation-low`: `0 1px 0 hsl(240 20% 0.98%/0.2),0 1.5px 0 hsl(240 9.091% 2.157%/0.05),0 2px 0 hsl(240 20% 0.98%/0.05)`
- `--elevation-medium`: `0 4px 4px hsl(0 0% 0%/0.16)`
- `--elevation-stroke`: `0 0 0 1px hsl(240 20% 0.98%/0.15)`
- `--shadow-border`: `0 0 0 1px rgba(255,255,255,0.08)`
- `--shadow-border-filter`: `drop-shadow(0 0 1px rgba(255,255,255,0.08))`
- `--shadow-button-overlay`: `0 12px 24px 0 rgba(0,0,0,0.24)`
- `--shadow-button-overlay-filter`: `drop-shadow(0 12px 24px rgba(0,0,0,0.24))`
- `--shadow-high`: `0 12px 24px 0 rgba(0,0,0,0.24)`
- `--shadow-high-filter`: `drop-shadow(0 12px 24px rgba(0,0,0,0.24))`
- `--shadow-ledge`: `0 2px 0 0 rgba(0,0,0,0.05),0 1.5px 0 0 rgba(0,0,0,0.05),0 1px 0 0 rgba(0,0,0,0.16)`
- `--shadow-ledge-filter`: `drop-shadow(0 1.5px 0 rgba(0,0,0,0.24))`
- `--shadow-low`: `0 1px 4px 0 rgba(0,0,0,0.14)`
- `--shadow-low-active`: `0 0 4px 0 rgba(0,0,0,0.14)`
- `--shadow-low-active-filter`: `drop-shadow(0 0 4px rgba(0,0,0,0.14))`
- `--shadow-low-filter`: `drop-shadow(0 1px 4px rgba(0,0,0,0.14))`
- `--shadow-low-hover`: `0 4px 10px 0 rgba(0,0,0,0.14)`
- `--shadow-low-hover-filter`: `drop-shadow(0 4px 10px rgba(0,0,0,0.14))`
- `--shadow-medium`: `0 4px 8px 0 rgba(0,0,0,0.16)`
- `--shadow-medium-filter`: `drop-shadow(0 4px 8px rgba(0,0,0,0.16))`
- `--shadow-mobile-chatinput`: `0 -1px 4px 0 rgba(26,26,30,.5)`
- `--shadow-mobile-chatinput-filter`: `drop-shadow(0 -1px 4px rgba(26,26,30,.5))`
- `--shadow-mobile-navigator-x`: `0 0 10px 0 rgba(0,0,0,0.22)`
- `--shadow-mobile-navigator-x-filter`: `drop-shadow(0 0 10px rgba(0,0,0,0.22))`
- `--shadow-top-high`: `0 -12px 32px 0 rgba(0,0,0,0.24)`
- `--shadow-top-high-filter`: `drop-shadow(0 -12px 32px rgba(0,0,0,0.24))`
- `--shadow-top-ledge`: `0 -2px 0 0 rgba(0,0,0,0.05),0 -1.5px 0 0 rgba(0,0,0,0.05),0 -1px 0 0 rgba(0,0,0,0.16)`
- `--shadow-top-ledge-filter`: `drop-shadow(0 -1.5px 0 rgba(0,0,0,0.24))`
- `--shadow-top-low`: `0 -1px 4px 0 rgba(0,0,0,0.14)`
- `--shadow-top-low-filter`: `drop-shadow(0 -1px 4px rgba(0,0,0,0.14))`

Mais declaradas em `box-shadow`: `var(--shadow-border),var(--shadow-high)` ×74, `none` ×66, `var(--shadow-high)` ×44, `var(--shadow-low)` ×41, `var(--elevation-low)` ×37, `var(--shadow-medium)` ×19, `var(--legacy-elevation-high)` ×14, `var(--legacy-elevation-border),var(--legacy-elevation-high)` ×10, `var(--shadow-border) var(--shadow-high)` ×10, `var(--elevation-medium)` ×8.

**Breakpoints** (`:root`): `--breakpoint-xxs` 480px, `--breakpoint-xs` 640px, `--breakpoint-sm` 768px, `--breakpoint-md` 1024px, `--breakpoint-lg` 1280px, `--breakpoint-xl` 1536px, `--breakpoint-xxl` 1800px, `--breakpoint-max` 2500px.

Media queries mais frequentes no CSS:

- `@media (max-width:485px)` ×70
- `@media screen and (max-height:550px),screen and (max-width:485px)` ×20
- `@media (-webkit-max-device-pixel-ratio:1)` ×20
- `@media screen and (max-width:848px)` ×18
- `@media (prefers-reduced-motion:reduce)` ×13
- `@media (min-width:900px)` ×13
- `@media (min-width:929px)` ×13
- `@media (max-width:1439px)` ×13
- `@media (min-width:48rem)` ×12
- `@media (forced-colors:active)` ×11
- `@media (min-width:1010px)` ×10
- `@media (max-width:780px)` ×9
- `@media (hover:hover)` ×8
- `@media (min-height:785px) and (min-width:929px)` ×8
- `@media (max-width:860px)` ×7

`max-width: 485px` é o corte de celular das telas de autenticação/convite (e `max-height: 550px`).

