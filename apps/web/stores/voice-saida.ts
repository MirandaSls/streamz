/**
 * O que acontece ao deixar a sala de voz atual, conforme o **motivo**.
 *
 * Fechar a sala de mídia e zerar a minha conexão é igual em todos os casos.
 * O que muda é o resto — e foi o resto que quebrava:
 *
 * - **Avisar o gateway** (`voice.leave` + `call.end`): sim quando a saída é
 *   minha; não quando foi o servidor que me tirou (`expulso`, `movido`) — ele
 *   já sabe, e um `voice.leave` a mais derrubaria a conexão nova da conta (ou,
 *   no caso do `movido`, desfaria o move que acabou de acontecer).
 * - **Fechar a coluna do canal de voz** (`useChannels.leaveVoice`): sim quando
 *   a chamada acabou para mim e não há mais canal de voz na tela; **não**
 *   quando estou trocando para outro canal de voz de servidor — é o painel do
 *   canal de destino que acabou de disparar o `connect`, e fechá-lo deixava a
 *   conexão viva com a coluna central caída no chat. Trocar para uma chamada em
 *   conversa, por outro lado, fecha: um painel de servidor deixado aberto
 *   reconectaria no canal antigo assim que o usuário voltasse ao servidor,
 *   derrubando a chamada.
 *
 * **Desligar num canal de voz de servidor que continua aberto não fecha mais a
 * coluna.** Fechá-la mandava a pessoa para o `ChatView` de largura inteira do
 * mesmo canal — uma tela que ela não pediu, e sem caminho de volta a não ser
 * clicar no canal outra vez. Desde o #131 existe para onde voltar: a
 * `VistaDoCanalDeVoz`, com o nome do canal, quem ficou lá e o botão de entrar
 * de novo. É o que o Discord mostra depois de desligar, e é também o único
 * lugar em que a vista aparece sem que ninguém tenha pedido a conversa.
 */
export type MotivoDeSaida =
  /** botão de sair, Ctrl+Shift+K, "desligar". */
  | "usuario"
  /** o servidor encerrou a chamada em que eu estava. */
  | "fim-da-chamada"
  /** a conta entrou na voz de outro aparelho. */
  | "expulso"
  /** vou entrar em outra sala (canal de voz ou chamada). */
  | "troca-de-sala"
  /** alguém com "mover membros" me arrastou para outro canal de voz. */
  | "movido";

export interface DecisaoDeSaida {
  avisaGateway: boolean;
  fechaColuna: boolean;
}

/** O que a store sabe da saída além do motivo. Tudo opcional, tudo `false`. */
export interface ContextoDaSaida {
  /** troca de sala: o destino é canal de voz **de servidor**. */
  destinoEmServidor?: boolean;
  /**
   * O canal que estou deixando é de servidor **e** continua sendo o canal
   * aberto na coluna — ou seja, há uma vista para onde voltar. Falso quando a
   * chamada é de conversa direta (não há coluna de canal) ou quando a pessoa já
   * navegou para outro canal enquanto falava (aí a coluna nem está nele).
   */
  canalDeServidorAberto?: boolean;
}

export function decidirSaida(
  motivo: MotivoDeSaida,
  { destinoEmServidor = false, canalDeServidorAberto = false }: ContextoDaSaida = {},
): DecisaoDeSaida {
  switch (motivo) {
    case "usuario":
    case "fim-da-chamada":
      // o canal continua na tela: a coluna fica de pé e vira a vista do canal
      return { avisaGateway: true, fechaColuna: !canalDeServidorAberto };
    case "expulso":
      // aqui a coluna fecha mesmo com o canal aberto: quem me tirou foi a minha
      // outra conexão, e ficar na vista do canal que acabei de perder seria um
      // convite a reentrar e derrubar o aparelho novo
      return { avisaGateway: false, fechaColuna: true };
    case "troca-de-sala":
      return { avisaGateway: true, fechaColuna: !destinoEmServidor };
    case "movido":
      // como o `expulso`: o servidor já me tirou do canal antigo, e um
      // `voice.leave` chegando depois do move desfaria o move. A coluna fica de
      // pé porque o destino é sempre canal de voz de servidor — é o mesmo caso
      // da troca de sala, só que quem decidiu foi outra pessoa
      return { avisaGateway: false, fechaColuna: false };
  }
}
