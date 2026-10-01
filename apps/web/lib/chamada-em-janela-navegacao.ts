import { isTextChannel, Permission, type Category, type Channel } from "@streamz/shared";
import { useCanaisFixados, ordenarComFixados } from "@/stores/canais-fixados";
import { groupByCategory } from "@/stores/channel-order";
import { useCategories } from "@/stores/categories";
import { useChannels } from "@/stores/channels";
import { CHAVE_DA_JANELA_DA_CHAMADA, useJanelasDeVoz } from "@/stores/janelas-de-voz";
import { possoNoCanalAgora } from "@/stores/permissions";

/**
 * Primeiro canal de texto na ordem em que a barra lateral desenha (fixados no
 * topo, depois soltos, depois cada categoria). Pura para ter teste: o
 * `podeVer` é a mesma regra de permissão da barra, injetada de fora.
 */
export function primeiroCanalDeTexto(
  channels: Channel[],
  categories: Category[],
  fixados: string[],
  podeVer: (c: Channel) => boolean,
): Channel | null {
  const { fixados: topo, resto } = ordenarComFixados(channels, fixados);
  const ordenados = [...topo, ...groupByCategory(resto, categories).flatMap((g) => g.channels)];
  return ordenados.find((c) => isTextChannel(c) && podeVer(c)) ?? null;
}

/** Quanto esperar a janela (PiP abre assíncrono) aparecer antes de desistir e desfazer a navegação. */
const ESPERA_DA_JANELA_MS = 5000;

/**
 * Paridade com o Discord: ao soltar a chamada numa janela, a aba principal
 * vai para o primeiro canal de texto do servidor. Quando a janela fecha, volta
 * ao canal de voz — mas só se a pessoa não navegou para outro canal nesse meio
 * tempo. Chamar **depois** de `abrirJanelaDaChamada`, sem await antes dela
 * (gesto transitório). DM/grupo e servidor sem canal de texto visível: no-op.
 */
export function levarAbaParaTextoEnquantoJanelaAberta(canalDeVozId: string): void {
  const st = useChannels.getState();
  const voz = st.channels.find((c) => c.id === canalDeVozId);
  if (!voz?.guildId || st.guildId !== voz.guildId) return;

  const alvo = primeiroCanalDeTexto(
    st.channels,
    useCategories.getState().categories,
    useCanaisFixados.getState().fixados(voz.guildId),
    (c) => possoNoCanalAgora(Permission.VIEW_CHANNEL, voz.guildId as string, c.id),
  );
  if (!alvo) return;

  st.select(alvo);

  let apareceu = false;
  const viva = () => {
    const j = useJanelasDeVoz.getState().janelas[CHAVE_DA_JANELA_DA_CHAMADA];
    return !!j && !j.win.closed;
  };
  const encerrar = () => {
    cancelar();
    clearTimeout(timer);
    // a pessoa já foi para outro canal: não puxar de volta
    if (useChannels.getState().activeChannelId === alvo.id) useChannels.getState().select(voz);
  };
  const cancelar = useJanelasDeVoz.subscribe(() => {
    if (viva()) apareceu = true;
    else if (apareceu) encerrar();
  });
  const timer = setTimeout(() => {
    if (!apareceu) encerrar(); // janela bloqueada/nunca abriu: desfaz
  }, ESPERA_DA_JANELA_MS);
  if (viva()) apareceu = true;
}
