// Helpers puros do `SelectDeBot` (onda 3, cartão 3d-selects): valores
// iniciais, limites de seleção, busca dentro da lista e resolução do emoji
// parcial que o bot manda numa opção. Sem React nem DOM — testados em
// `select-opcoes.test.ts`; quem desenha (`SelectDeBot.tsx`) só chama.
//
// A forma do componente é a do Discord (`ComponenteDeSelect`, de
// `@streamz/shared`): `type` 3 (texto, com `options` do próprio bot), 5
// (usuário), 6 (cargo), 7 (mencionável) e 8 (canal) — os quatro últimos não
// trazem opções, só `default_values` (cuids, já traduzidos do snowflake do
// Discord pelo DTO da API); quem preenche a lista é o servidor (as stores de
// membros/cargos/canais que já existem), não o bot.

import type { CustomEmoji, EmojiParcial, SelectDeBot as ComponenteDeSelect } from "@streamz/shared";

/** `true` quando o componente aceita mais de uma escolha (`max_values > 1`). */
export function multiploDoComponente(componente: Pick<ComponenteDeSelect, "max_values">): boolean {
  return (componente.max_values ?? 1) > 1;
}

/**
 * `min_values`/`max_values` efetivos. O Discord aplica 1 e 1 quando o bot
 * omite os dois campos (`components/reference.mdx`, "default 1 for both") —
 * o schema (`camposDeSelect`) só valida a faixa, não aplica esse padrão.
 */
export function limitesDoComponente(
  componente: Pick<ComponenteDeSelect, "min_values" | "max_values">,
): { min: number; max: number } {
  return { min: componente.min_values ?? 1, max: componente.max_values ?? 1 };
}

/** A contagem `qtd` cabe entre `min` e `max` (inclusive)? */
export function dentroDoLimite(qtd: number, min: number, max: number): boolean {
  return qtd >= min && qtd <= max;
}

/**
 * O que já vem marcado ao abrir a mensagem: no `type` 3 são as `options` com
 * `default: true`; nos outros quatro, `default_values` — ambos já em cuid, a
 * mesma forma que `escolherNoSelect` espera de volta.
 */
export function valoresIniciais(componente: ComponenteDeSelect): string[] {
  if (componente.type === 3) {
    return componente.options.filter((o) => o.default).map((o) => o.value);
  }
  return (componente.default_values ?? []).map((v) => v.id);
}

/** `s` sem espaço nas pontas e em minúsculas pt-BR — o mesmo corte do `Select` primitivo. */
export function normalizarBusca(s: string): string {
  return s.trim().toLocaleLowerCase("pt-BR");
}

/** Filtra `lista` pelo texto que `extrai` devolve de cada item; `busca` vazia devolve tudo. */
export function filtrarPorTexto<T>(lista: readonly T[], busca: string, extrai: (item: T) => string): T[] {
  if (!busca.trim()) return [...lista];
  const alvo = normalizarBusca(busca);
  return lista.filter((item) => normalizarBusca(extrai(item)).includes(alvo));
}

/** Texto do placeholder quando o bot não mandou um. Decisão deste cartão — o Discord não documenta um padrão; não é medida. */
export function placeholderPadrao(type: ComponenteDeSelect["type"]): string {
  switch (type) {
    case 3:
      return "Selecione uma opção";
    case 5:
      return "Selecione um usuário";
    case 6:
      return "Selecione um cargo";
    case 7:
      return "Selecione um usuário ou cargo";
    case 8:
      return "Selecione um canal";
  }
}

export type EmojiDeOpcaoResolvido =
  | { tipo: "personalizado"; url: string; animado: boolean; alt: string }
  | { tipo: "unicode"; caractere: string }
  /** emoji personalizado que não existe mais (ou de outro servidor): sobra o nome, como o Discord. */
  | { tipo: "nome"; texto: string };

/**
 * `emoji` de uma opção/botão do bot → o que dá para desenhar. O DTO da API já
 * troca o `id` de snowflake por cuid (contrato da onda 3, §"O DTO sempre
 * traz..."), então basta procurar em `emojisDoServidor` (`todosOsEmojis` da
 * store `emojis`); sem `id`, `name` é o caractere Unicode (o bot manda o
 * emoji "cru", sem `:` — como o Discord).
 */
export function resolverEmojiDeOpcao(
  emoji: EmojiParcial | null | undefined,
  emojisDoServidor: readonly CustomEmoji[],
): EmojiDeOpcaoResolvido | null {
  if (!emoji) return null;
  if (emoji.id) {
    const achado = emojisDoServidor.find((e) => e.id === emoji.id);
    if (achado) return { tipo: "personalizado", url: achado.url, animado: achado.animated, alt: achado.name };
    return emoji.name ? { tipo: "nome", texto: emoji.name } : null;
  }
  if (emoji.name) return { tipo: "unicode", caractere: emoji.name };
  return null;
}
