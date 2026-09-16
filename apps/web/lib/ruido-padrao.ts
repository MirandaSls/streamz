/**
 * A supressão de ruído vem ligada por padrão no nível `avancada` (RNNoise).
 *
 * É o nível que o botão "Supressão de ruído" da barra de voz mostra como
 * ligado (`PopoverDeRuido`): com o padrão antigo (`padrao`, a do navegador)
 * o botão aparecia desligado para todo mundo, e o pedido de 2026-09-16 foi
 * que ele viesse ativo.
 *
 * Quem já tinha preferência salva passa por esta migração **uma vez** (a
 * marca fica em `MARCA_DA_MIGRACAO`): quem estava no padrão antigo sobe para
 * `avancada`; quem escolheu `off` ou já estava em `avancada` fica como está.
 * Sem a marca, quem desligasse de novo seria religado a cada abertura.
 */
export type NivelDeRuidoSalvo = "off" | "padrao" | "avancada";

export const RUIDO_PADRAO: NivelDeRuidoSalvo = "avancada";
export const MARCA_DA_MIGRACAO = "voiceRuidoPadraoAvancada";

export function migrarRuido(
  nivel: NivelDeRuidoSalvo,
  jaMigrado: boolean,
): { nivel: NivelDeRuidoSalvo; mudou: boolean } {
  if (jaMigrado || nivel !== "padrao") return { nivel, mudou: false };
  return { nivel: RUIDO_PADRAO, mudou: true };
}
