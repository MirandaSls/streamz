import type { VoiceStateEvent } from "@streamz/shared";

/**
 * Voltar à chamada depois de recarregar a página.
 *
 * O gateway segura o usuário na sala por `VOICE_RECONNECT_GRACE_MS` depois de
 * o socket cair — um F5 no meio da chamada cabe folgado nessa janela. O que
 * faltava era o cliente **saber** que estava numa chamada: a store nasce vazia
 * e, sem esta peça, quem recarregava via a conversa sem faixa nem palco e só
 * voltava clicando no telefone.
 *
 * A sala é lembrada no `sessionStorage`, que é **desta aba** e sobrevive ao
 * recarregar: é o que separa "recarreguei a página" de "abri o app em outro
 * aparelho enquanto o primeiro oscila". No segundo caso eu também apareço como
 * `reconnecting` no estado da sala — e o aparelho novo entrar sozinho na
 * chamada expulsaria o primeiro (voz em um lugar só).
 */
export interface SalaLembrada {
  channelId: string;
  guildId: string | null;
  /** nome do canal de voz; vazio numa conversa (o título vem da lista de DMs). */
  name: string;
}

/**
 * A sala a retomar, ou null: só quando esta aba estava nela **e** o servidor
 * ainda me segura lá, reconectando. Já conectado em qualquer sala, nada a fazer.
 */
export function chamadaARetomar(args: {
  states: Record<string, VoiceStateEvent[]>;
  meuId: string | undefined;
  conectadoEm: string | null;
  lembrada: SalaLembrada | null;
}): SalaLembrada | null {
  const { states, meuId, conectadoEm, lembrada } = args;
  if (!lembrada || !meuId || conectadoEm) return null;
  const meuEstado = (states[lembrada.channelId] ?? []).find((e) => e.user.id === meuId);
  // sem a marca de reconectando ou eu já saí de vez (a carência acabou), ou
  // outra conexão da conta está inteira na sala — nas duas, entrar seria decidir
  // pelo usuário
  if (!meuEstado?.connected || !meuEstado.reconnecting) return null;
  return lembrada;
}

const CHAVE = "voz:salaAtual";

/** `sessionStorage` quando existe; null no servidor ou com storage bloqueado. */
function armazem(): Storage | null {
  try {
    return typeof window !== "undefined" ? (window.sessionStorage ?? null) : null;
  } catch {
    return null;
  }
}

export function lembrarSala(sala: SalaLembrada, storage: Storage | null = armazem()): void {
  try {
    storage?.setItem(CHAVE, JSON.stringify(sala));
  } catch {
    // sem storage a retomada simplesmente não existe nesta aba
  }
}

export function salaLembrada(storage: Storage | null = armazem()): SalaLembrada | null {
  try {
    const raw = storage?.getItem(CHAVE);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<SalaLembrada>;
    if (typeof v.channelId !== "string") return null;
    return { channelId: v.channelId, guildId: v.guildId ?? null, name: v.name ?? "" };
  } catch {
    return null;
  }
}

export function esquecerSala(storage: Storage | null = armazem()): void {
  try {
    storage?.removeItem(CHAVE);
  } catch {
    // idem
  }
}
