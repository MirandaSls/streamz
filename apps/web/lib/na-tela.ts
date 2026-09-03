/**
 * "Este canal está na tela agora?" — a decisão pura, sem store e sem DOM.
 *
 * Existe porque `useMessages.activeChannelId` **não** responde a essa pergunta.
 * A sala de uma conversa direta é `sticky` (ver `stores/messages.ts` e o `show`
 * de `stores/dms.ts`): ela continua aberta depois que o usuário sai dela, de
 * propósito — é assim que a DM continua chegando ao vivo enquanto se navega
 * pelo servidor. O efeito colateral era grave: sair da conversa clicando em
 * Amigos ou num servidor deixava `activeChannelId` apontando para a DM, e a
 * mensagem que chegasse depois era marcada como **lida** sem ninguém ter lido.
 *
 * O que decide é o que a interface está de fato mostrando na coluna 3:
 *
 * - conversa direta: modo `dm`, página Amigos fechada e a conversa selecionada
 *   (as duas disputam a mesma coluna — ver `DMView`);
 * - canal de servidor: modo `guild`, os canais carregados são os do servidor da
 *   mensagem e o canal ativo é o dela.
 *
 * Sobre isso vem a camada que já existia: a janela precisa estar visível e com
 * foco. Atrás de outro app a mensagem conta como não lida e notifica, como no
 * Discord; ao voltar o foco, o canal exibido é lido (`lerCanalNaTela`).
 */

/** Qual coluna 3 está montada (`stores/ui`). */
export type Visao = "guild" | "dm";

/** O canal de que se fala: `guildId` nulo é conversa direta. */
export interface CanalDaMensagem {
  channelId: string;
  guildId: string | null;
}

/** O recorte das stores que decide o que está exibido. */
export interface EstadoDaInterface {
  /** modo de visão (`useUI.view`). */
  view: Visao;
  /** a página Amigos está aberta? (`useFriends.open`) — ela cobre a conversa. */
  amigosAberta: boolean;
  /** conversa selecionada (`useDMs.activeId`). */
  dmAtiva: string | null;
  /** canal de servidor selecionado (`useChannels.activeChannelId`). */
  canalAtivo: string | null;
  /** servidor cujos canais estão carregados (`useChannels.guildId`). */
  guildDosCanais: string | null;
}

/** A janela do app, para a segunda metade da pergunta. */
export interface EstadoDaJanela {
  visivel: boolean;
  comFoco: boolean;
}

/**
 * A interface está mostrando este canal? (sem olhar a janela)
 *
 * É esta a função que substitui a comparação com `activeChannelId`.
 */
export function canalExibido(canal: CanalDaMensagem, estado: EstadoDaInterface): boolean {
  if (canal.guildId) {
    return (
      estado.view === "guild" &&
      estado.guildDosCanais === canal.guildId &&
      estado.canalAtivo === canal.channelId
    );
  }
  return estado.view === "dm" && !estado.amigosAberta && estado.dmAtiva === canal.channelId;
}

/**
 * O canal está na tela **e** o usuário está olhando: é o gate de "marcar como
 * lido sem passar pela lista".
 */
export function canalNaTela(
  canal: CanalDaMensagem,
  estado: EstadoDaInterface,
  janela: EstadoDaJanela,
): boolean {
  return canalExibido(canal, estado) && janela.visivel && janela.comFoco;
}

/**
 * Qual canal está exibido agora, se algum — a mesma regra vista do outro lado.
 * Serve a quem precisa agir sobre o canal da tela sem ter uma mensagem em mãos
 * (voltar o foco para a janela).
 */
export function canalExibidoAgora(estado: EstadoDaInterface): CanalDaMensagem | null {
  if (estado.view === "dm") {
    if (estado.amigosAberta || !estado.dmAtiva) return null;
    return { channelId: estado.dmAtiva, guildId: null };
  }
  if (!estado.canalAtivo || !estado.guildDosCanais) return null;
  return { channelId: estado.canalAtivo, guildId: estado.guildDosCanais };
}
