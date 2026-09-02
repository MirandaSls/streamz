/**
 * O que acontece ao deixar a sala de voz atual, conforme o **motivo**.
 *
 * Fechar a sala de mídia e zerar a minha conexão é igual em todos os casos.
 * O que muda é o resto — e foi o resto que quebrava:
 *
 * - **Avisar o gateway** (`voice.leave` + `call.end`): sim quando a saída é
 *   minha; não quando foi o servidor que me tirou (`expulso`) — ele já sabe, e
 *   um `voice.leave` a mais derrubaria a conexão nova da conta.
 * - **Fechar a coluna do canal de voz** (`useChannels.leaveVoice`): sim quando
 *   a chamada acabou para mim; **não** quando estou trocando para outro canal
 *   de voz de servidor — é o painel do canal de destino que acabou de disparar
 *   o `connect`, e fechá-lo deixava a conexão viva com a coluna central caída
 *   no chat. Trocar para uma chamada em conversa, por outro lado, fecha: um
 *   painel de servidor deixado aberto reconectaria no canal antigo assim que o
 *   usuário voltasse ao servidor, derrubando a chamada.
 */
export type MotivoDeSaida =
  /** botão de sair, Ctrl+Shift+K, "desligar". */
  | "usuario"
  /** o servidor encerrou a chamada em que eu estava. */
  | "fim-da-chamada"
  /** a conta entrou na voz de outro aparelho. */
  | "expulso"
  /** vou entrar em outra sala (canal de voz ou chamada). */
  | "troca-de-sala";

export interface DecisaoDeSaida {
  avisaGateway: boolean;
  fechaColuna: boolean;
}

/** `destinoEmServidor` só importa na troca: para onde a conexão vai. */
export function decidirSaida(motivo: MotivoDeSaida, destinoEmServidor = false): DecisaoDeSaida {
  switch (motivo) {
    case "usuario":
    case "fim-da-chamada":
      return { avisaGateway: true, fechaColuna: true };
    case "expulso":
      return { avisaGateway: false, fechaColuna: true };
    case "troca-de-sala":
      return { avisaGateway: true, fechaColuna: !destinoEmServidor };
  }
}
