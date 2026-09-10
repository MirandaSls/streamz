/**
 * Como `/painel` lê o que a pessoa digitou — puro, sem rede.
 *
 * ## Por que `/painel <acao> <alvo> <argumentos>` e não `/painel criar …`
 *
 * Porque **subcomando não existe** na nossa casca: o `PUT` de registro recusa
 * os tipos 1 e 2 com `50035` (§9 do documento; `runtime/tipos.ts` só declara os
 * sete tipos que passam). Um `/painel` com sete comandos separados
 * (`/painel-criar`, `/painel-adicionar`, …) encheria o composer de linhas quase
 * iguais; um comando só com uma opção `acao` de escolha fixa é o que mais se
 * parece com o que foi pedido, e no prefixo `!` lê-se exatamente igual:
 * `!painel criar #geral Cargos do servidor`.
 *
 * O preço é que só a **última** opção pode ter espaço (é a regra do
 * `restoDaLinha`, `runtime/argumentos.ts`). Daí o desenho: `acao` e `alvo` são
 * sempre uma palavra, e tudo que tem espaço vive em `argumentos`, repartido
 * aqui — de um jeito diferente por ação, e testado.
 */

/** `<#1414…>` ou `1414…` → o snowflake. Devolve `null` se não é nem um nem outro. */
export function lerMencaoDeCanal(bruto: string | null | undefined): string | null {
  const texto = (bruto ?? "").trim();
  const mencao = /^<#(\d{1,20})>$/.exec(texto);
  if (mencao) return mencao[1]!;
  return /^\d{1,20}$/.test(texto) ? texto : null;
}

/** `<@&1414…>` ou `1414…` → o snowflake. */
export function lerMencaoDeCargo(bruto: string | null | undefined): string | null {
  const texto = (bruto ?? "").trim();
  const mencao = /^<@&(\d{1,20})>$/.exec(texto);
  if (mencao) return mencao[1]!;
  return /^\d{1,20}$/.test(texto) ? texto : null;
}

/**
 * `Cargos do servidor | Escolha os seus` → título e descrição.
 *
 * A barra é o separador porque é o único caractere que não aparece por acidente
 * num título e que não exige aspas — e aspas num campo de texto de comando de
 * barra são o tipo de coisa que ninguém acerta na primeira vez.
 */
export function separarTituloEDescricao(bruto: string | null | undefined): {
  titulo: string;
  descricao: string;
} {
  const texto = (bruto ?? "").trim();
  const barra = texto.indexOf("|");
  if (barra === -1) return { titulo: texto, descricao: "" };
  return {
    titulo: texto.slice(0, barra).trim(),
    descricao: texto.slice(barra + 1).trim(),
  };
}

/** O que `/painel adicionar` espera depois do id: `<emoji> <cargo> [rótulo]`. */
export interface ArgumentosDeAdicionar {
  emoji: string;
  cargo: string;
  rotulo: string;
}

/**
 * `👍 <@&1414…> Quero receber avisos` → as três partes.
 *
 * Duas palavras e o resto: o emoji nunca tem espaço, a menção de cargo nunca
 * tem espaço, e o rótulo quase sempre tem. Devolve `null` quando falta uma das
 * duas primeiras — recusar cedo evita criar um item de painel pela metade.
 */
export function lerArgumentosDeAdicionar(
  bruto: string | null | undefined,
): ArgumentosDeAdicionar | null {
  const partes = (bruto ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length < 2) return null;
  const [emoji, cargo, ...resto] = partes;
  return { emoji: emoji!, cargo: cargo!, rotulo: resto.join(" ") };
}
