/**
 * Rascunho do composer, por canal, no `localStorage`.
 *
 * Por que persistir e não guardar numa store: o composer é remontado a cada
 * troca de canal (`key` no ChatView) e a página inteira some num F5 — as duas
 * situações em que perder o que estava escrito é mais irritante. Ficando no
 * `localStorage`, o texto volta nos dois casos.
 *
 * Um rascunho é texto de conversa: se o armazenamento estiver bloqueado (aba
 * anônima com cookies desligados), a falha é engolida — vale menos que a tela
 * funcionando.
 */

const PREFIXO = "streamz:rascunho:";
/** Rascunhos guardados de uma vez; acima disso, os mais antigos saem. */
const MAX_RASCUNHOS = 30;

export function lerRascunho(channelId: string): string {
  try {
    return localStorage.getItem(PREFIXO + channelId) ?? "";
  } catch {
    return "";
  }
}

export function salvarRascunho(channelId: string, texto: string): void {
  try {
    if (!texto.trim()) {
      localStorage.removeItem(PREFIXO + channelId);
      return;
    }
    localStorage.setItem(PREFIXO + channelId, texto);
    podar();
  } catch {
    /* armazenamento indisponível ou cheio — seguir sem rascunho */
  }
}

export function limparRascunho(channelId: string): void {
  try {
    localStorage.removeItem(PREFIXO + channelId);
  } catch {
    /* idem */
  }
}

/**
 * Mantém o número de rascunhos sob controle. Sem uma data por entrada, a ordem
 * de remoção é a do próprio `localStorage` — o que sobra é arbitrário, mas o
 * objetivo aqui é só não crescer para sempre.
 */
function podar(): void {
  const chaves: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(PREFIXO)) chaves.push(k);
  }
  for (const k of chaves.slice(0, Math.max(0, chaves.length - MAX_RASCUNHOS))) {
    localStorage.removeItem(k);
  }
}
