// Gera tokens/VARIAVEIS.md a partir dos JSON produzidos por publico-tokens.mjs.
// Uso (de dentro de ferramentas/): node publico-tokens-md.mjs
import fs from "node:fs";
import path from "node:path";

const BASE = new URL("../tokens", import.meta.url).pathname;
const vars = JSON.parse(fs.readFileSync(path.join(BASE, "variaveis.json"), "utf8"));
const res = JSON.parse(fs.readFileSync(path.join(BASE, "variaveis-resolvidas.json"), "utf8"));
const formas = JSON.parse(fs.readFileSync(path.join(BASE, "tipografia-e-formas.json"), "utf8"));
const V = res.valores;
const TEMAS = ["escuro", "claro", "cinza", "onyx"];

// Deixa legível o que o Chrome serializa: calc(1*7%) -> 7%, hsl(none 0% 0%/a) -> rgba(0,0,0,a)
const limpa = (s) => s
  .replace(/calc\(1\*([\d.]+%)\)/g, "$1")
  .replace(/hsl\(none 0% 0%\/([\d.]+)\)/g, "rgba(0,0,0,$1)")
  .replace(/hsl\(none 0% 100%\/([\d.]+)\)/g, "rgba(255,255,255,$1)")
  .replace(/\s+/g, " ");
const cel = (tema, n) => {
  const x = V[tema]?.[n];
  if (!x) return "—";
  if (x.cor) return "`" + x.cor + "`";
  const v = limpa(x.valor);
  return "`" + (v.length > 70 ? v.slice(0, 67) + "…" : v).replace(/\|/g, "\\|") + "`";
};
const linha = (cols) => "| " + cols.join(" | ") + " |";

// ---------------------------------------------------------------- tokens principais
const PRINCIPAIS = [
  ["Fundos / layout", [
    ["--background-base-lowest", "rail de servidores, lista de canais/DMs, barra de título, moldura do chat (`.wrapper_ef3116`, `.container__2637a`, `.privateChannels_e6b769`, `.chat_f75fb0`)"],
    ["--background-base-lower", "área das mensagens (`.chatContent_f75fb0`), lista de membros (`--custom-channel-members-bg`), cabeçalho do canal (`--__header-bar-background`)"],
    ["--background-base-low", "painel do usuário no rodapé da lista de canais (`.panels__5e434`), conteúdo das configurações"],
    ["--background-surface-high", "popouts, menus, cards, cabeçalho de popout"],
    ["--background-surface-higher", "superfície elevada (menu aberto, barra flutuante)"],
    ["--background-surface-highest", "superfície mais alta (tooltips/overlays)"],
    ["--app-frame-border", "borda fina entre rail e lista de canais (`.sidebarList__5e434`)"],
    ["--app-frame-background", "rail com o experimento `refresh-fast-follow-guild-bg`"],
    ["--chat-background-default", "caixa do composer (`.channelTextArea_f75fb0`)"],
    ["--modal-background", "modal"],
    ["--modal-footer-background", "rodapé do modal"],
    ["--background-scrim", "véu atrás do modal"],
    ["--home-background", "home (amigos) e páginas vazias"],
    ["--card-background-default", "card"],
    ["--embed-background", "embed de link"],
    ["--background-code", "bloco de código"],
  ]],
  ["Texto e ícones", [
    ["--text-strong", "títulos, nome do servidor"],
    ["--text-default", "texto normal da mensagem"],
    ["--text-subtle", "texto secundário"],
    ["--text-muted", "texto apagado, timestamps"],
    ["--text-link", "link"],
    ["--text-brand", "texto na cor da marca"],
    ["--text-code", "código inline/bloco"],
    ["--channels-default", "nome de canal na lista"],
    ["--channel-icon", "ícone # do canal"],
    ["--icon-default", "ícone padrão"],
    ["--icon-muted", "ícone apagado"],
    ["--textbox-markdown-syntax", "sintaxe markdown no composer"],
  ]],
  ["Interação (hover/selecionado)", [
    ["--interactive-text-default", "item de lista em repouso"],
    ["--interactive-text-hover", "item em hover"],
    ["--interactive-text-active", "item selecionado"],
    ["--interactive-background-hover", "fundo em hover (canal, membro, menu)"],
    ["--interactive-background-selected", "fundo do item selecionado"],
    ["--interactive-background-active", "fundo pressionado"],
    ["--interactive-muted", "canal silenciado"],
    ["--background-mod-subtle", "modificador sutil sobre qualquer fundo"],
    ["--background-mod-normal", "modificador médio"],
    ["--background-mod-strong", "modificador forte"],
    ["--message-background-hover", "hover da mensagem (`.message__5126c:hover`)"],
  ]],
  ["Campos", [
    ["--input-background-default", "fundo do input"],
    ["--input-border-default", "borda do input"],
    ["--input-border-hover", "borda em hover"],
    ["--input-border-active", "borda em foco"],
    ["--input-text-default", "texto digitado"],
    ["--input-placeholder-text-default", "placeholder"],
    ["--border-focus", "anel de foco (teclado)"],
  ]],
  ["Marca e botões", [
    ["--brand-500", "blurple da marca"],
    ["--background-brand", "fundo na cor da marca"],
    ["--control-primary-background-default", "botão primário"],
    ["--control-primary-background-hover", "botão primário em hover"],
    ["--control-primary-background-active", "botão primário pressionado"],
    ["--control-primary-text-default", "texto do botão primário"],
    ["--control-secondary-background-default", "botão secundário"],
    ["--control-secondary-text-default", "texto do botão secundário"],
    ["--control-critical-primary-background-default", "botão de perigo"],
  ]],
  ["Status e feedback", [
    ["--icon-status-online", "presença online"],
    ["--icon-status-idle", "presença ausente"],
    ["--icon-status-dnd", "presença não perturbe"],
    ["--icon-status-offline", "presença offline/invisível"],
    ["--status-danger", "erro/perigo"],
    ["--status-warning", "aviso"],
    ["--status-positive", "sucesso"],
    ["--badge-notification-background", "badge de não lidas/menções"],
    ["--text-feedback-critical", "texto de erro de campo"],
  ]],
  ["Menções e destaque", [
    ["--mention-background", "pílula @menção"],
    ["--mention-foreground", "texto da pílula @menção"],
    ["--message-mentioned-background-default", "mensagem que menciona você"],
    ["--message-mentioned-background-hover", "mensagem que menciona você, em hover"],
    ["--message-highlight-background-default", "mensagem destacada (pulo/busca)"],
  ]],
  ["Divisores, rolagem, sombras", [
    ["--border-subtle", "divisor sutil"],
    ["--border-normal", "divisor normal"],
    ["--border-strong", "divisor forte"],
    ["--border-muted", "borda do painel do usuário"],
    ["--scrollbar-thin-thumb", "polegar da barra fina (listas)"],
    ["--scrollbar-auto-thumb", "polegar da barra do chat"],
    ["--scrollbar-auto-track", "trilho da barra do chat"],
    ["--shadow-low", "sombra baixa"],
    ["--shadow-medium", "sombra média"],
    ["--shadow-high", "sombra alta (popouts)"],
    ["--shadow-border", "contorno de 1px como sombra"],
  ]],
];

const md = [];
md.push("# Variáveis CSS do cliente do Discord", "");
md.push(`Coleta: **${res.coletadoEm}**. Fonte: os bundles CSS públicos carregados por \`https://discord.com/login\` e`
  + " `/invite/...` (mesmo CSS do app logado), em `css-bruto/`. Valores finais medidos no Chrome (ver `README.md`).", "");
md.push("## Como ler", "");
md.push("O `<html>` do login deslogado vem com `" + res.classesDoHtmlNoLogin + "`.", "");
md.push("Os temas da *visual refresh* são combinações de classes. Nomes na UI atual (Aparência) — o mapeamento classe → nome é inferência pelos valores, não está escrito no CSS:", "");
md.push(linha(["coluna aqui", "classes no `<html>`", "nome provável na UI"]), linha(["---", "---", "---"]));
md.push(linha(["**escuro**", "`theme-dark theme-darker`", "Dark (padrão do login deslogado)"]));
md.push(linha(["**claro**", "`theme-light`", "Light"]));
md.push(linha(["cinza", "`theme-dark`", "Ash"]));
md.push(linha(["onyx", "`theme-dark theme-midnight`", "Onyx"]), "");
md.push("Todas as medições incluem `visual-refresh density-default`. Cores com 8 dígitos têm alfa (`#rrggbbaa`) e são **translúcidas**: a cor vista depende do fundo por baixo.", "");
md.push("O CSS guarda a paleta como `--x-hsl` (tripla HSL com `--saturation-factor`, que o app baixa na opção de saturação reduzida) e `--x: hsl(var(--x-hsl)/1)`. Os temas então apontam para a paleta, e dentro de `@supports (color-mix)` sobrescrevem 335 tokens por versões `color-mix(in oklab, …)` — é essa versão que um navegador atual usa.", "");

// ---------------------------------------------------------------- tabela principal
md.push("## Os tokens mais relevantes para o clone", "");
md.push("Uso: onde o token aparece no CSS do app (seletores reais citados quando conferidos nos chunks sob demanda; o resto é pelo nome).", "");
let totalPrincipais = 0;
for (const [grupo, lista] of PRINCIPAIS) {
  md.push(`### ${grupo}`, "");
  md.push(linha(["token", "uso", "escuro", "claro", "cinza", "onyx"]), linha(["---", "---", "---", "---", "---", "---"]));
  for (const [n, uso] of lista) {
    if (!V.escuro[n]) { console.log("aviso: não existe", n); continue; }
    totalPrincipais++;
    md.push(linha(["`" + n + "`", uso, ...TEMAS.map((t) => cel(t, n))]));
  }
  md.push("");
}

md.push("## Layout do app (conferido no CSS dos chunks sob demanda)", "");
md.push(linha(["peça", "seletor", "regra"]), linha(["---", "---", "---"]));
for (const [p, s, r] of [
  ["rail de servidores", "`.wrapper_ef3116`", "`background-color: var(--background-base-lowest); width: var(--custom-guild-list-width)` (= 40px de avatar + padding)"],
  ["lista de canais", "`.container__2637a`, `.privateChannels_e6b769`", "`background: var(--background-gradient-high, var(--background-base-lowest))`"],
  ["borda rail ↔ canais", "`.sidebarList__5e434`", "`border-top` e `border-inline-start: 1px solid var(--app-frame-border)`"],
  ["painel do usuário", "`.panels__5e434`", "`background: var(--background-base-low); border: 1px solid var(--border-muted); border-radius: var(--radius-sm)` e margem `--space-xs`"],
  ["chat (moldura)", "`.chat_f75fb0`", "`background: var(--background-base-lowest)`"],
  ["chat (mensagens)", "`.chatContent_f75fb0`", "`background: var(--background-base-lower)`"],
  ["cabeçalho do canal", "`.container__9293f`", "`--__header-bar-background: var(--background-base-lower)`, altura `--custom-channel-header-height`"],
  ["composer", "`.channelTextArea_f75fb0`", "`background: var(--chat-background-default)`"],
  ["lista de membros", "`.members_c8ffbb`", "`background: var(--custom-channel-members-bg)` = `--background-base-lower`; largura `--custom-member-list-width` 264px (256 compacto, 268 confortável)"],
  ["barra de título do app", "`.titleBar__0bd4a`, `.bg__960e4`", "`--background-base-lowest`; altura `--custom-app-top-bar-height` 32px (24/40 nas variantes)"],
  ["configurações", "`.sidebarRegionScroller__23e6b` / `.contentRegion__23e6b`", "lateral `--background-base-lowest`, conteúdo `--background-base-low`"],
]) md.push(linha([p, s, r]));
md.push("", "Os `--background-gradient-*` são os temas com gradiente (Nitro): o JS grava `--custom-background-gradient-*-color/opacity` inline e o fallback de cada `var()` é o tema sólido.", "");

// ---------------------------------------------------------------- contagem por escopo
md.push("## Escopos encontrados", "");
md.push(linha(["escopo", "variáveis"]), linha(["---", "---:"]));
for (const [k, o] of Object.entries(vars)) {
  if (k.startsWith("[sob-demanda") && Object.keys(o).length < 50) continue;
  md.push(linha(["`" + k.replace(/\|/g, "\\|") + "`", String(Object.keys(o).length)]));
}
md.push("", "Os escopos com prefixo `[sob-demanda/…]` vêm de chunks do app logado e **não** entram na resolução. `2ebfdf9d6f68a8bf.css` redefine quase tudo com `hotpink` (folha de depuração); `451094…css` é outro design system (`--primitive-color-*`) de uma superfície específica. Escopos pequenos desses chunks estão só no JSON.", "");

// ---------------------------------------------------------------- semânticos por família
const nomesTema = new Set();
for (const [k, o] of Object.entries(vars)) {
  if (/^(@supports \(color:color-mix\(in lch,red,blue\)\) )?\.(theme-(dark|light|darker|midnight)|visual-refresh)$/.test(k) || k === ".theme-darker,.theme-midnight") {
    for (const n of Object.keys(o)) if (!n.endsWith("-hsl")) nomesTema.add(n);
  }
}
const FAMILIAS = [
  ["background", /^--(background|bg-|app-frame|chat-background|channeltextarea|home-background|modal|panel-bg|card|embed|mobile-background|guild-header|channel-background|message-background|overlay-backdrop)/],
  ["text", /^--(text|chat-text|channel-text|channels-|channel-icon|mobile-text|textbox|navigator-header)/],
  ["icon", /^--icon/],
  ["interactive", /^--interactive/],
  ["control (botões)", /^--(control|button|redesign-button|togglebutton)/],
  ["input e formulários", /^--(input|checkbox|radio|switch|slider|datepicker|select)/],
  ["border", /^--(border|divider)/],
  ["brand", /^--(brand|logo|premium|guild-boosting|creator|nitro)/],
  ["status e feedback", /^--(status|badge|notice|inlinenotice|background-feedback|spoiler|polls|progressbar)/],
  ["menção e mensagem", /^--(mention|message|keyword|reaction|thread)/],
  ["scrollbar", /^--scrollbar/],
  ["shadow e elevação", /^--(shadow|elevation|legacy-elevation)/],
  ["chips, charts, código, ANSI", /^--(chip|chart|ansi|text-code|background-code|code)/],
  ["gradientes expressivos e perfil", /^--(expressive|profile|user-profile|gradient|bg-gradient)/],
];
const familiaDe = (n) => {
  for (const [nome, re] of FAMILIAS) if (re.test(n)) return nome;
  return "outros";
};
const porFamilia = {};
for (const n of [...nomesTema].sort()) (porFamilia[familiaDe(n)] ??= []).push(n);
md.push("## Todos os tokens semânticos (por tema)", "");
md.push(`São ${nomesTema.size} nomes (sem os \`-hsl\`) definidos em \`.theme-*\`, \`.visual-refresh\` e nos \`@supports\`. Cada célula é o valor final no tema.`, "");
for (const f of [...FAMILIAS.map((x) => x[0]), "outros"]) {
  const lista = porFamilia[f];
  if (!lista?.length) continue;
  md.push(`### ${f} (${lista.length})`, "");
  md.push(linha(["token", ...TEMAS]), linha(["---", ...TEMAS.map(() => "---")]));
  for (const n of lista) md.push(linha(["`" + n + "`", ...TEMAS.map((t) => cel(t, n))]));
  md.push("");
}

// ---------------------------------------------------------------- :root
const root = vars[":root"];
md.push("## `:root` — primitivos (iguais em todos os temas)", "");
md.push(`${Object.keys(root).length} variáveis, ${Object.keys(root).filter((n) => !n.endsWith("-hsl")).length} sem contar as \`-hsl\`.`, "");

// paleta: --<cor>-<passo>
const paleta = {};
for (const n of Object.keys(root)) {
  const m = n.match(/^--(blue|green|red|teal|yellow|orange|neutral|blurple|pink|primary|plum|brand|white|black)-(\d+)$/);
  if (m) (paleta[m[1]] ??= []).push([Number(m[2]), n]);
}
md.push("### Paleta", "", "Passo → cor final (sRGB). A escala `primary` é a base dos cinzas dos temas; `brand` é o blurple.", "");
for (const [cor, lista] of Object.entries(paleta)) {
  lista.sort((a, b) => a[0] - b[0]);
  md.push(`**${cor}** — ` + lista.map(([p, n]) => `${p} \`${V.escuro[n]?.cor ?? root[n]}\``).join(" · "), "");
}
const opac = Object.keys(root).filter((n) => /^--opacity-/.test(n) && !n.endsWith("-hsl"));
md.push(`**opacidades** (${opac.length}): \`--opacity-<cor>-<1..100>\` = a cor com alfa — ex.: ` +
  opac.filter((n) => /^--opacity-(black|white)-(8|12|20|48)$/.test(n)).map((n) => `\`${n}\` ${cel("escuro", n)}`).join(", "), "");

const grupoRoot = [
  ["raio", /^--radius-/], ["espaçamento", /^--space-/], ["tamanho", /^--size-/], ["breakpoint", /^--breakpoint-/],
  ["fonte", /^--font-/], ["ícone", /^--icon-size-/], ["movimento", /^--(motion|expand|collapse)-/],
  ["layout do app", /^--(chat-|guildbar-|modal-(width|horizontal|vertical)|custom-(guild-list|guild-sidebar|member-list|app-top-bar|channel-header|message-avatar|channel-members))/],
];
for (const [titulo, re] of grupoRoot) {
  const lista = Object.keys(root).filter((n) => re.test(n) && !n.endsWith("-hsl"));
  if (!lista.length) continue;
  md.push(`### ${titulo}`, "", linha(["variável", "valor no CSS", "resolvido"]), linha(["---", "---", "---"]));
  for (const n of lista) md.push(linha(["`" + n + "`", "`" + root[n].replace(/\|/g, "\\|").slice(0, 90) + "`", cel("escuro", n)]));
  md.push("");
}
const restantes = Object.keys(root).filter((n) => !n.endsWith("-hsl") && !/^--(blue|green|red|teal|yellow|orange|neutral|blurple|pink|primary|plum|brand|white|black)-\d+$/.test(n) && !/^--opacity-/.test(n) && !grupoRoot.some(([, re]) => re.test(n)));
const pref = {};
for (const n of restantes) inc(pref, n.replace(/^--/, "").split("-")[0]);
function inc(o, k) { o[k] = (o[k] || 0) + 1; }
md.push("### Demais variáveis do `:root`", "");
md.push(`${restantes.length} variáveis de componente/experimento (\`custom-*\`, \`mobile-*\`, \`checkpoint-*\`, \`illo-*\`…), só no \`variaveis.json\`. Por prefixo: ` +
  Object.entries(pref).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ") + ".", "");

// ---------------------------------------------------------------- tipografia e formas
md.push("## Tipografia", "");
md.push("### Famílias (`:root`)", "");
for (const n of Object.keys(root).filter((n) => /^--font-(primary|headline|nitro|code|display|clan)/.test(n))) md.push(`- \`${n}\`: ${root[n]}`);
md.push("", "Uso no CSS (declarações `font-family`): " + formas.maisUsados["font-family"].slice(0, 5).map((x) => `\`${x.valor}\` ×${x.vezes}`).join(", ") + ".", "");
md.push("### `@font-face` (URLs registradas; arquivos **não** baixados)", "");
md.push(linha(["família", "peso", "estilo", "URL (woff2)"]), linha(["---", "---", "---", "---"]));
const vistas = new Set();
for (const f of formas.fontFaces) {
  const k = f.familia + f.peso + f.estilo + (f.urls[0] || "");
  if (vistas.has(k)) continue; vistas.add(k);
  md.push(linha([f.familia, f.peso, f.estilo, f.urls[0] ? (f.urls[0].startsWith("http") ? f.urls[0] : f.urls[0]) : "—"]));
}
md.push("", "gg sans (400–800, com itálico) é a fonte da UI; ABC Ginto (Nord) é títulos/marketing/Nitro; gg mono é código. Munro, Sakura, 8Bit etc. são as fontes dos *display name styles*. As duas últimas famílias (DM Sans, Rethink Sans) vêm embutidas no SDK de verificação de idade (Incode).", "");
md.push("### Escala de texto (classes do design system)", "");
md.push("Cada variante tem pesos `normal` 400, `medium` 500, `semibold` 600, `bold` 700 e (algumas) `extrabold` 800.", "");
md.push(linha(["variante", "font-size", "line-height", "família"]), linha(["---", "---:", "---:", "---"]));
const esc = {};
for (const [k, o] of Object.entries(formas.escalaTexto)) {
  const base = k.split("/")[0];
  esc[base] ??= o;
}
for (const [k, o] of Object.entries(esc)) md.push(linha(["`" + k + "`", o["font-size"] ?? "—", o["line-height"] ? (+o["line-height"]).toFixed(3).replace(/0+$/, "").replace(/\.$/, "") : "—", "`" + (o["font-family"] ?? "") + "`"]));
md.push("", "Tamanhos mais declarados: " + formas.maisUsados["font-size"].filter((x) => x.valor.endsWith("px")).slice(0, 10).map((x) => `${x.valor} ×${x.vezes}`).join(", ") + " (cada um aparece de novo em rem como fallback).", "");
md.push("Pesos mais declarados: " + formas.maisUsados["font-weight"].slice(0, 6).map((x) => `${x.valor} ×${x.vezes}`).join(", ") + ".", "");

md.push("## Raios, sombras, breakpoints", "");
md.push("**Raios** (`:root`): " + Object.keys(root).filter((n) => /^--radius-/.test(n)).map((n) => `\`${n}\` ${root[n]}`).join(", ") + ". `--radius-round` é 2147483647px (pílula).", "");
md.push("Mais declarados em `border-radius`: " + formas.maisUsados["border-radius"].slice(0, 14).map((x) => `\`${x.valor}\` ×${x.vezes}`).join(", ") + ".", "");
md.push("**Sombras** (valor final, tema escuro):", "");
for (const n of Object.keys(V.escuro).filter((n) => /^--(shadow|elevation)-/.test(n))) md.push(`- \`${n}\`: \`${limpa(V.escuro[n].valor).slice(0, 160)}\``);
md.push("", "Mais declaradas em `box-shadow`: " + formas.maisUsados["box-shadow"].slice(0, 10).map((x) => `\`${x.valor}\` ×${x.vezes}`).join(", ") + ".", "");
md.push("**Breakpoints** (`:root`): " + Object.keys(root).filter((n) => /^--breakpoint-[a-z]/.test(n)).map((n) => `\`${n}\` ${root[n]}`).join(", ") + ".", "");
md.push("Media queries mais frequentes no CSS:", "");
for (const x of formas.mediaQueries.slice(0, 15)) md.push(`- \`${x.valor}\` ×${x.vezes}`);
md.push("", "`max-width: 485px` é o corte de celular das telas de autenticação/convite (e `max-height: 550px`).", "");

fs.writeFileSync(path.join(BASE, "VARIAVEIS.md"), md.join("\n") + "\n");
console.log("VARIAVEIS.md:", md.length, "linhas; principais:", totalPrincipais, "; semânticos:", nomesTema.size);
