/**
 * A parte pura do histórico de navegação: uma pilha de lugares visitados e um
 * cursor. Sem React, sem stores — é o que as setas ← → da barra de título do
 * desktop percorrem, e o que o teste cobre.
 *
 * "Lugar" é o que identifica uma tela do app: a página Amigos, uma conversa
 * direta, ou um servidor (com o canal aberto nele, quando já há um). É a
 * mesma tríade que `messages-navigate` usa para "ir para a mensagem".
 */
export type Lugar =
  | { tipo: "amigos" }
  | { tipo: "conversa"; channelId: string }
  | { tipo: "servidor"; guildId: string; channelId: string | null };

export interface Historico {
  pilha: Lugar[];
  /** posição atual na pilha; -1 enquanto nada foi visitado. */
  indice: number;
}

/** Quantos lugares lembrar. Além disso o "voltar" vira arqueologia. */
export const LIMITE = 50;

export const VAZIO: Historico = { pilha: [], indice: -1 };

export function mesmoLugar(a: Lugar | undefined, b: Lugar | undefined): boolean {
  if (!a || !b) return false;
  if (a.tipo !== b.tipo) return false;
  if (a.tipo === "amigos") return true;
  if (a.tipo === "conversa" && b.tipo === "conversa") return a.channelId === b.channelId;
  if (a.tipo === "servidor" && b.tipo === "servidor") {
    return a.guildId === b.guildId && a.channelId === b.channelId;
  }
  return false;
}

export function atual(h: Historico): Lugar | undefined {
  return h.pilha[h.indice];
}

export function podeVoltar(h: Historico): boolean {
  return h.indice > 0;
}

export function podeAvancar(h: Historico): boolean {
  return h.indice >= 0 && h.indice < h.pilha.length - 1;
}

/**
 * Registra o lugar em que o app está agora.
 *
 * Três regras, todas do navegador:
 * - o mesmo lugar de novo não empilha (a store dispara em qualquer mudança,
 *   e a maioria delas não é de tela);
 * - registrar depois de ter voltado descarta o "avançar" — o ramo abandonado
 *   deixa de existir;
 * - abrir um servidor passa por dois estados: primeiro só o servidor (os canais
 *   ainda carregando), depois o servidor com o canal. O segundo **substitui**
 *   o primeiro, senão cada troca de servidor custaria dois "voltar".
 */
export function registrar(h: Historico, lugar: Lugar): Historico {
  const corrente = atual(h);
  if (mesmoLugar(corrente, lugar)) return h;

  const substitui =
    corrente?.tipo === "servidor" &&
    lugar.tipo === "servidor" &&
    corrente.guildId === lugar.guildId &&
    corrente.channelId === null;

  const base = h.pilha.slice(0, substitui ? h.indice : h.indice + 1);
  const pilha = [...base, lugar].slice(-LIMITE);
  return { pilha, indice: pilha.length - 1 };
}

export function voltar(h: Historico): Historico {
  return podeVoltar(h) ? { ...h, indice: h.indice - 1 } : h;
}

export function avancar(h: Historico): Historico {
  return podeAvancar(h) ? { ...h, indice: h.indice + 1 } : h;
}
