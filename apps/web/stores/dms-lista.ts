import type { DMChannelView } from "@streamz/shared";

/**
 * As regras de ordem da coluna "Mensagens diretas", separadas da store porque
 * são puras — e porque foi aqui que a conversa aberta sumia.
 */

/** A conversa em primeiro, sem duplicar (é o "subiu para o topo" do Discord). */
export function noTopo(lista: DMChannelView[], dm: DMChannelView): DMChannelView[] {
  return [dm, ...lista.filter((d) => d.id !== dm.id)];
}

/**
 * A lista que o servidor devolveu, **sem perder a conversa aberta**.
 *
 * `GET /dms` troca a lista inteira, e havia duas janelas em que ela voltava sem
 * a conversa que está na tela: a resposta que foi montada antes de a conversa
 * existir (abrir por perfil/busca enquanto a lista carregava) e a conversa
 * fechada que outro caminho reabriu só do lado do cliente. Nos dois casos a
 * coluna ficava sem a conversa aberta até chegar mensagem nova — o único
 * evento que recarregava a lista de novo.
 *
 * Aberta = na lista, como no Discord: a conversa ativa volta em primeiro
 * quando o servidor não a trouxe.
 */
export function comAConversaAberta(
  doServidor: DMChannelView[],
  activeId: string | null,
  locais: DMChannelView[],
): DMChannelView[] {
  if (!activeId || doServidor.some((d) => d.id === activeId)) return doServidor;
  const aberta = locais.find((d) => d.id === activeId);
  return aberta ? [aberta, ...doServidor] : doServidor;
}
