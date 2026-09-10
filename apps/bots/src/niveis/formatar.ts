/**
 * O texto do bot de níveis: a barra de progresso, os números e a leitura de
 * quem/qual cargo o comando recebeu.
 *
 * Puro de ponta a ponta. É a parte que aparece na tela de todo mundo e a que
 * mais barato se conserta com um teste — a barra que sai com um caractere a
 * mais ou o `1.204` que sai `1204` não quebram nada, só ficam feios para sempre.
 */

/** A largura padrão da barra do `/nivel`. Doze cabe no celular sem quebrar. */
export const LARGURA_DA_BARRA = 12;

const CHEIO = "▰";
const VAZIO = "▱";

/**
 * A barra de progresso em texto: `▰▰▰▰▱▱▱▱▱▱▱▱`.
 *
 * Blocos e não `█`/`░` porque estes dois têm larguras diferentes em boa parte
 * das fontes de sistema e a barra sai torta no meio. A fração é grampeada em
 * `[0, 1]`: um XP editado na mão no arquivo pode passar do custo do nível, e a
 * barra não pode nascer com 13 caracteres por causa disso.
 */
export function barraDeProgresso(fracao: number, largura: number = LARGURA_DA_BARRA): string {
  const total = Math.max(1, Math.floor(largura));
  const f = Number.isFinite(fracao) ? Math.min(Math.max(fracao, 0), 1) : 0;
  const cheios = Math.min(total, Math.round(f * total));
  return CHEIO.repeat(cheios) + VAZIO.repeat(total - cheios);
}

/** `1204` → `1.204`. Separador de milhar em português, que é a língua do bot. */
export function formatarNumero(n: number): string {
  const inteiro = Number.isFinite(n) ? Math.floor(n) : 0;
  return inteiro.toLocaleString("pt-BR");
}

/** Medalha para o pódio, `#4` daí para baixo. */
export function medalha(posicao: number): string {
  if (posicao === 1) return "🥇";
  if (posicao === 2) return "🥈";
  if (posicao === 3) return "🥉";
  return `\`#${String(posicao).padStart(2, " ")}\``;
}

/**
 * Escapa o markdown de um nome que a pessoa escolheu.
 *
 * Um apelido `**mods**` sairia em negrito na mensagem do bot, e um
 * `[clique](http://…)` viraria link clicável que o bot não escreveu. Mesma
 * regra do bot de música para títulos vindos da internet.
 */
export function escaparMarkdown(texto: string): string {
  return texto.replace(/([\\`*_~|>[\]()])/g, "\\$1");
}

/** Corta em caracteres (não em bytes: os limites do Discord são em caracteres). */
export function truncar(texto: string, limite: number): string {
  if (texto.length <= limite) return texto;
  return `${texto.slice(0, Math.max(limite - 1, 0))}…`;
}

// ── Ler o alvo de um comando ────────────────────────────────────────────────

/**
 * O que veio numa opção que aponta para alguém ou para um cargo.
 *
 * ## Por que isto existe (e por que as opções são de **texto**)
 *
 * O Discord tem tipos de opção para usuário (6), canal (7) e cargo (8), e a
 * primeira versão deste bot os usava. Duas coisas impedem:
 *
 * 1. **O `Contexto` do runtime — que é intocável — só expõe `texto()` e
 *    `numero()`**, e `texto()` é `interaction.options.getString()`. O
 *    discord.js **lança** `CommandInteractionOptionType` quando o nome existe
 *    com outro tipo: um `/nivel` declarado com tipo 6 estouraria dentro da lib
 *    em vez de responder.
 * 2. **O composer do Streamz ainda não tem seletor de alvo** (ver
 *    `converterOpcao` em `apps/web/lib/comandos-barra.ts`): tipos 6, 7 e 8
 *    chegam com o texto cru que a pessoa digitou. Declarar o tipo "certo" não
 *    traria um id — traria a mesma string, com um estouro de brinde.
 *
 * Então a opção é texto e **esta** função entende as formas que uma pessoa
 * escreve de verdade: o id, a menção do Discord (`<@123>`, `<@&123>`, `<#123>`)
 * e o nome. Quem resolve nome → id é o serviço, contra o cache do servidor;
 * aqui só se decide **o que** foi digitado.
 */
export interface Alvo {
  tipo: "id" | "nome";
  valor: string;
}

/** Tira `<@…>`, `<@!…>`, `<@&…>`, `<#…>` e o `@`/`#` solto da frente. */
function desembrulhar(bruto: string): string {
  const texto = bruto.trim();
  const mencao = /^<(?:@[!&]?|#)([A-Za-z0-9_-]{1,64})>$/.exec(texto);
  if (mencao) return mencao[1]!;
  return texto.replace(/^[@#]/, "").trim();
}

/**
 * Um id do Streamz é um cuid ou um snowflake; um nome pode ser qualquer coisa.
 *
 * A regra prática: só dígitos (um snowflake) ou um cuid (`c` seguido de 24+
 * caracteres de base36) contam como id. Qualquer outra coisa é nome. Errar para
 * o lado de "nome" é barato — a busca por nome não acha e o bot diz que não
 * achou; errar para o lado de "id" faria o bot procurar um id que não existe e
 * dizer que a pessoa não existe, quando ela existe e só se chama `12345`.
 */
export function analisarAlvo(bruto: string | null | undefined): Alvo | null {
  if (!bruto) return null;
  const valor = desembrulhar(bruto);
  if (valor === "") return null;
  const ehId = /^\d{5,}$/.test(valor) || /^c[a-z0-9]{20,}$/i.test(valor);
  return { tipo: ehId ? "id" : "nome", valor };
}

/**
 * A menção a alguém, **no formato do Streamz**: `@usuario`, texto puro.
 *
 * Não é `<@id>`. O `<@…>` é do Discord, e a nossa casca não traduz menção de
 * usuário: o `MESSAGE_CREATE` sai com `mentions: []` e o texto guarda
 * `@fulano` (ver `traducao/mensagem.ts`). Quem decide se alguém foi mencionado
 * é `mentionsUser` do `@streamz/shared`, que procura `@username` com limite de
 * palavra — então **este** é o formato que notifica. Um `<@snowflake>` numa
 * mensagem do bot apareceria cru na tela e não avisaria ninguém.
 *
 * Sem escapar, e de propósito: `usuarioSchema` do `@streamz/shared` limita o
 * nome a `[a-zA-Z0-9_.-]`, então não há markdown para desarmar — e escapar
 * quebraria a menção (`\_` não casa com `_`).
 */
export function mencaoDoUsuario(username: string): string {
  return `@${username}`;
}

/**
 * O texto de um anúncio de subida de nível.
 *
 * Sem `@everyone`, sem embed e com o nome escapado: o anúncio nasce no canal
 * onde a pessoa estava conversando, e um bot que grite no meio de uma conversa
 * é o primeiro a ser removido do servidor.
 */
export function textoDaSubida(mencao: string, nivel: number): string {
  return `🎉 ${mencao} chegou ao **nível ${nivel}**!`;
}
