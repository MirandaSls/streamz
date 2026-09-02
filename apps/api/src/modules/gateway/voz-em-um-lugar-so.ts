/**
 * Quem sai da voz quando a mesma conta entra de outro lugar.
 *
 * Separado do gateway porque a decisão é pura e o erro aqui é caro: escolher
 * errado significa a conexão que **acabou de entrar** se expulsar sozinha, e o
 * usuário nunca conseguir entrar em canal nenhum.
 */

/** O mínimo que a decisão precisa saber de um socket. */
export interface ConexaoDeVoz {
  id: string;
  voiceChannelId?: string;
}

/**
 * As conexões da conta que devem sair da voz agora.
 *
 * `manter` é o socket que acabou de entrar. Conexões sem canal de voz ficam de
 * fora: não estão na voz, não há o que expulsar — e mandar `VOICE_EVICTED` para
 * uma aba que só está lendo o chat mostraria um aviso do nada.
 */
export function conexoesAExpulsar<T extends ConexaoDeVoz>(conexoes: readonly T[], manter: string): T[] {
  return conexoes.filter((c) => c.id !== manter && !!c.voiceChannelId);
}
