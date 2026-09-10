/**
 * Como `#geral` e `@Membro` digitados por uma pessoa viram um id.
 *
 * ## Por que isto existe, em vez de uma opção de tipo canal
 *
 * O `Contexto` do runtime (`src/runtime/tipos.ts`) expõe `texto()` e
 * `numero()`, e mais nada — é o que faz `/comando` e `!comando` chegarem ao
 * mesmo `executar`. Uma opção declarada como `TIPO_CANAL` (7) ou `TIPO_CARGO`
 * (8) chega ao `interaction.options.getString()` como **erro**: o discord.js
 * confere o tipo (`_getTypedOption`) e lança. Então as opções deste bot são de
 * texto, e a resolução é aqui.
 *
 * Não é só contorno: com texto, `!boas-vindas canal #geral` e
 * `/boas-vindas canal:#geral` seguem exatamente o mesmo caminho, que é o que o
 * contrato pede de um comando escrito uma vez só.
 *
 * Tudo aqui é puro; quem varre o cache do servidor é `servico.ts`.
 */

/** `<#123>` ou `123` → `"123"`. Qualquer outra coisa → `null`. */
export function idDeCanal(bruto: string): string | null {
  const limpo = bruto.trim();
  const mencao = /^<#([0-9]{1,32})>$/.exec(limpo);
  if (mencao) return mencao[1]!;
  return /^[0-9]{1,32}$/.test(limpo) ? limpo : null;
}

/** `<@&123>` ou `123` → `"123"`. */
export function idDeCargo(bruto: string): string | null {
  const limpo = bruto.trim();
  const mencao = /^<@&([0-9]{1,32})>$/.exec(limpo);
  if (mencao) return mencao[1]!;
  return /^[0-9]{1,32}$/.test(limpo) ? limpo : null;
}

/**
 * O nome, sem o `#` ou o `@` que a pessoa digitou e sem caixa.
 *
 * Comparar sem caixa e sem acento seria mais generoso, mas o nome de canal do
 * Streamz já é minúsculo e a busca sem acento acertaria "geral" para "gerál" —
 * dois canais diferentes. Aqui, errar é responder "não achei", que é barato.
 */
export function nomeLimpo(bruto: string): string {
  return bruto.trim().replace(/^[#@]+/, "").trim().toLowerCase();
}

/**
 * Acha por id ou por nome, nesta ordem.
 *
 * Id primeiro porque é exato: um servidor onde alguém chamou um cargo de
 * "123456" não pode fazer `/autorole 123456` escolher o cargo errado quando
 * esse id existe de verdade.
 */
export function acharPorIdOuNome<T extends { id: string; name: string }>(
  itens: Iterable<T>,
  bruto: string,
  extrairId: (bruto: string) => string | null,
): T | null {
  const id = extrairId(bruto);
  const alvo = nomeLimpo(bruto);
  let porNome: T | null = null;
  for (const item of itens) {
    if (id !== null && item.id === id) return item;
    if (porNome === null && item.name.toLowerCase() === alvo) porNome = item;
  }
  return porNome;
}
