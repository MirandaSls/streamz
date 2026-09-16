"use client";

/**
 * "Falar mensagem" (ESPEC p1/p3, item 11): lê a mensagem em voz alta com a
 * `SpeechSynthesis` do navegador — sem servidor, sem dependência nova.
 *
 * A limpeza do texto é a mesma ideia de `semMarcacao` (`@streamz/shared`,
 * prévia de notificação): tira marcação do Discord antes de entregar o texto.
 * Aqui a saída é para o ouvido, não para uma linha só, então a menção crua
 * (`<@id>`, `<@&id>`, `<#id>`) vira uma palavra falável em vez de "@cargo" —
 * ler "arroba cargo" em voz alta soa pior do que "um cargo".
 */

/** Texto pronto para a fala: sem marcação, sem id cru de menção. */
export function limparTextoParaFala(texto: string): string {
  return texto
    // bloco de código: o conteúdo não ajuda quem só está ouvindo
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    // imagem markdown e link mascarado: só o texto visível fica
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    // link cru sem prévia: `<https://…>` -> a própria URL
    .replace(/<(https?:\/\/[^\s>]+)>/g, "$1")
    // emoji personalizado `<:nome:id>`/`<a:nome:id>` -> só o nome
    .replace(/<a?:([a-z0-9_]{2,32}):[A-Za-z0-9_-]{1,64}>/g, "$1")
    // carimbo de data `<t:unix>`/`<t:unix:estilo>` -> data por extenso
    .replace(/<t:(-?\d+)(?::[a-zA-Z])?>/g, (_m, unix: string) =>
      new Date(Number(unix) * 1000).toLocaleString("pt-BR"),
    )
    // menção crua: cargo/usuário/canal viram palavra, o id não diz nada a quem ouve
    .replace(/<@&[A-Za-z0-9_-]{1,64}>/g, "um cargo")
    .replace(/<@!?[A-Za-z0-9_-]{1,64}>/g, "alguém")
    .replace(/<#[A-Za-z0-9_-]{1,64}>/g, "um canal")
    // início de linha: título, subtexto, citação, item de lista
    .replace(/^[ \t]{0,3}(?:>{1,3}[ \t]?|#{1,3}[ \t]+|-#[ \t]+|[-*][ \t]+|\d+\.[ \t]+)/gm, "")
    // ênfase (mais específico primeiro, para `***` não sobrar como `*`)
    .replace(/(?<!\\)(\*\*\*|\*\*|__|~~|\|\||\*|_)/g, "")
    // escapes (`\*`, `\_`…): sobra só o caractere
    .replace(/\\([*_~`|>#\\])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** O item do menu fica desabilitado sem a API do navegador ou sem o que falar. */
export function podeFalarMensagem(texto: string): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    limparTextoParaFala(texto).length > 0
  );
}

/**
 * Fala "`<autor>` disse `<texto>`", em pt-BR, cancelando qualquer fala em
 * andamento — sem isso, escolher "Falar mensagem" em duas mensagens seguidas
 * empilhava as duas falas em vez de trocar uma pela outra.
 */
export function falarMensagem(autor: string, texto: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const limpo = limparTextoParaFala(texto);
  if (!limpo) return;
  window.speechSynthesis.cancel();
  const fala = new SpeechSynthesisUtterance(`${autor} disse ${limpo}`);
  fala.lang = "pt-BR";
  window.speechSynthesis.speak(fala);
}
