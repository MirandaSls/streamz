// Voz e vídeo (LiveKit).
//
// Parte do contrato de `@streamz/shared`. Importe sempre pelo pacote
// (`@streamz/shared`), nunca por este caminho: o índice é a fronteira.

// ── Voz (LiveKit) ────────────────────────────────────────────
export interface VoiceTokenResponse {
  token: string;
  url: string;
  room: string;
}

/**
 * Sufixo da identidade do participante que transmite a tela pelo app de
 * desktop.
 *
 * No desktop a captura e a codificação são nativas (Rust), e quem publica a
 * faixa na sala é um **segundo participante** do LiveKit, `<userId>#tela`, que
 * entra só enquanto a transmissão dura. Para todo o resto do sistema ele não
 * existe: a presença vem do gateway (por `userId`), e a web funde as faixas
 * dele no tile do dono. Estas duas funções são a regra inteira — quem precisa
 * saber de quem é uma identidade passa por aqui, e por mais lugar nenhum.
 */
export const SUFIXO_DE_TELA = "#tela";

/** Identidade do participante de tela de um usuário. */
export function identidadeDeTela(userId: string): string {
  return `${userId}${SUFIXO_DE_TELA}`;
}

/** O `userId` dono de uma identidade do LiveKit, com ou sem o sufixo de tela. */
export function donoDaIdentidade(identity: string): string {
  return identity.endsWith(SUFIXO_DE_TELA)
    ? identity.slice(0, -SUFIXO_DE_TELA.length)
    : identity;
}

/** É o participante de tela (e não a pessoa) de alguém? */
export function ehIdentidadeDeTela(identity: string): boolean {
  return identity.endsWith(SUFIXO_DE_TELA);
}

// ── f-voz ────────────────────────────────────────────────────
