/**
 * Quem precisa de um `<audio>` na chamada em que estou.
 *
 * A lista nasce de **duas** fontes de propósito: o estado de voz do servidor
 * (quem o gateway diz que está na sala) e os participantes da sala de mídia
 * (quem o LiveKit diz que está publicando). Normalmente são as mesmas pessoas,
 * mas elas se descolam por instantes — a reconexão do socket zera o estado
 * antes de recarregá-lo, um `voice.state` pode chegar depois da faixa — e o
 * áudio não pode depender de a barra lateral estar em dia: a pessoa continua
 * falando enquanto isso.
 */
export function ouvintesRemotos(
  estados: readonly { user: { id: string } }[],
  identidades: readonly string[],
  meuId: string | undefined,
): string[] {
  const ids: string[] = [];
  for (const id of [...estados.map((e) => e.user.id), ...identidades]) {
    if (id === meuId || ids.includes(id)) continue;
    ids.push(id);
  }
  return ids;
}
