/**
 * Tenho o que "Parar de assistir" aqui?
 *
 * É tela alheia (nunca a minha, nem a minha captura nativa — essa sai por
 * "Ocultar prévia", não por aqui) e eu escolhi vê-la (`assistindo`). Pura e
 * num arquivo próprio — sem import de React nem do SDK — porque as três
 * superfícies do controle precisam da mesma resposta a partir de estados
 * diferentes, e testar a regra isolada evita que uma delas divirja quando só
 * outra for mexida:
 *
 * - o botão do hover e o item do menu de contexto do tile (`TileDeVoz`);
 * - o item do menu de contexto da linha na barra lateral
 *   (`VoiceChannelMembers`), que lê `VoiceStateEvent.screen`, não `Tile.tela`.
 */
export function podePararDeAssistir(estado: {
  tela: boolean;
  assistindo: boolean;
  sou: boolean;
  minhaTelaNativa?: boolean;
}): boolean {
  return estado.tela && estado.assistindo && !estado.sou && !estado.minhaTelaNativa;
}
