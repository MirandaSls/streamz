# tokens/ — variáveis CSS do Discord

Coleta: **2026-09-11**, sem login, a partir do CSS público que `https://discord.com/login` e
`https://discord.com/invite/discord-developers` carregam. É o mesmo CSS do app logado: o bundle
de temas (`css-bruto/952007.*.css`, 760 KB) vem inteiro já no login.

## O que tem

| arquivo | conteúdo |
|---|---|
| `VARIAVEIS.md` | **comece aqui**: tabela dos 80 tokens mais úteis para o clone (escuro/claro/cinza/onyx), mapa do layout (que token pinta o rail, a lista de canais, o chat, os membros), todos os 858 tokens semânticos por família, paleta, raios, espaçamento, tipografia, sombras, breakpoints |
| `variaveis.json` | `{ escopo: { "--nome": "valor cru" } }`, 80 escopos (`:root`, `.theme-*`, `.visual-refresh`, `@supports (color-mix) .theme-*`, `.high-contrast-mode …`, `.density-*`, `.mobile-visual-refresh`, `:root:lang(…)`, temas com gradiente…) |
| `variaveis-resolvidas.json` | `valores[tema]["--nome"] = { valor, cor, computado }`: `valor` com os `var()` já substituídos, `cor` em `#rrggbb[aa]` quando é cor. ~4.690 variáveis por tema, 2.296 cores |
| `tipografia-e-formas.json` | `@font-face` (família, peso, URL), escala `text-*/heading-*`, valores mais usados de `font-size`, `font-weight`, `line-height`, `border-radius`, `box-shadow`, media queries, as 200 variáveis mais referenciadas |
| `css-bruto/` | 302 `.css`: 266 citados no HTML do login/convite + 36 que o navegador pede em runtime nessas páginas |
| `css-bruto/sob-demanda/` | 850 chunks CSS do app logado, listados no mapa de chunks do `web.<hash>.js` que o login carrega. Usados para conferir o layout e nas estatísticas, **não** nas variáveis resolvidas |
| `css-bruto-ordem.txt` | ordem e origem (`html /login` ou `runtime`) de cada arquivo |

Variáveis por escopo (bundle inicial): `:root` 4.072 (2.369 sem as `-hsl`), `.theme-dark` 622,
`.theme-light` 619, `.theme-darker` 586, `.theme-midnight` 586, `.visual-refresh` 472, e mais
335 em cada `@supports (color-mix) .theme-*` e 204 em cada `.high-contrast-mode .theme-*`.

## Como foi obtido

Scripts em `../ferramentas/`, rode de dentro dessa pasta:

1. `node publico-baixar-css.mjs`: baixa o CSS (HTML + runtime + mapa de chunks). Só baixa o que falta.
2. `node publico-tokens.mjs`: parser próprio (`publico-css-parser.mjs`, sem dependências) → JSONs.
   Depois abre o `/login` no Chrome headless, tira as classes de tema do `<html>` e mede cada
   variável em quatro `<div>` com as classes de cada tema. O Chrome faz a substituição de `var()` e
   as contas de `calc`/`color-mix`, e um canvas converte a cor em sRGB. Leva uns 20 s.
3. `node publico-tokens-md.mjs`: gera o `VARIAVEIS.md`.

Nenhum formulário é enviado. O script bloqueia qualquer POST para `/api/*/auth/` e `/invites/`.

## Lacunas e cuidados

- **Nomes dos temas são inferidos.** O CSS só tem classes: `theme-dark theme-darker` (padrão
  deslogado) = Dark, `theme-light` = Light, `theme-dark` sozinho = Ash, `theme-dark theme-midnight`
  = Onyx. Confira com um print do seletor de Aparência logado.
- Os tokens "legados" (`--background-primary`, `--text-normal`, `--interactive-normal`…) **não
  existem mais**. A refresh usa `--background-base-*`, `--background-surface-*`, `--text-default` etc.
- As cores de presença do avatar (bolinha online/ausente/ocupado) são desenhadas por SVG com cor
  vinda do JS. Os tokens `--icon-status-*` / `--text-status-*` são os equivalentes no CSS.
- Temas com gradiente (Nitro): as cores de cada preset são gravadas inline pelo JS
  (`--custom-background-gradient-*`), não estão no CSS. Os `--bg-gradient-*` do `:root` são as
  paradas dos presets.
- `high-contrast-mode`, `mobile-visual-refresh`, `density-compact/cozy` e `:root:lang(…)` estão no
  JSON cru mas não foram resolvidos.
- Um chunk sob demanda (`2ebfdf9d6f68a8bf.css`) redefine o `:root` quase inteiro com `hotpink`
  (folha de depuração). Por isso fica num escopo separado e nunca se mistura à paleta.
- As URLs de fonte estão só registradas, sem download (licença). gg sans e ABC Ginto são proprietárias.
- Os hashes (`952007.818336783eeaffc7.css`, `.wrapper_ef3116`) mudam a cada deploy do Discord.
  Rodar os scripts de novo refaz tudo com os nomes novos.
