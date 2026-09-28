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

/** `null` e o apelido `"default"` são a saída padrão do sistema. */
export function saidaEscolhida(outputId: string | null | undefined): outputId is string {
  return !!outputId && outputId !== "default";
}

/**
 * Se o áudio de uma faixa deve passar pelo grafo do Web Audio (o `GainNode`
 * que deixa o volume passar de 100%).
 *
 * Só vale a pena montar acima de 100% — até lá o `volume` do elemento basta e
 * é o caminho que menos pode dar errado. Depois de montado, voltar para ≤100%
 * **mantém** o grafo (o ganho vira o próprio volume): desmontar e remontar a
 * cada arrasto do controle abriria e fecharia `AudioContext` à toa.
 *
 * O grafo toca por `ctx.destination`, que é a saída **padrão** do sistema.
 * Com um dispositivo escolhido nas configurações, isso só é aceitável se o
 * contexto souber apontar para ele (`AudioContext.setSinkId`, Chromium 110+).
 * Sem isso a resposta é "não": ficar limitado a 100% no dispositivo certo é
 * melhor que um volume maior saindo na caixa de som errada. Pelo mesmo motivo,
 * se o grafo já falhou uma vez (`recusado` — criar deu erro, ou o `setSinkId`
 * do contexto rejeitou), não se tenta de novo.
 */
export function usarGrafoDeGanho(p: {
  volume: number;
  outputId: string | null;
  temWebAudio: boolean;
  contextoTemSinkId: boolean;
  grafoExiste: boolean;
  recusado: boolean;
}): boolean {
  if (!p.temWebAudio || p.recusado) return false;
  if (saidaEscolhida(p.outputId) && !p.contextoTemSinkId) return false;
  return p.grafoExiste || p.volume > 1;
}

/**
 * Como o `<audio>` e o `GainNode` ficam para um volume/estado.
 *
 * Com o grafo **tocando** (`grafoTocando`: existe e o contexto está
 * `running`), o elemento só consome a stream — no Chromium o áudio remoto do
 * WebRTC não flui para o Web Audio se nenhum elemento a consumir —, então fica
 * mudo e todo o som (volume e silêncio) passa pelo ganho. Se não, quem toca é
 * o elemento, com o volume limitado a 1, e o ganho fica em 0: um contexto
 * suspenso que volte a rodar entre um evento e outro não pode somar o som dele
 * ao do elemento. É isso que impede o contexto suspenso de calar a pessoa.
 */
export function mixDaFaixa(p: { calado: boolean; volume: number; grafoTocando: boolean }): {
  muted: boolean;
  volumeDoElemento: number;
  ganho: number;
} {
  const volume = Math.max(0, p.volume);
  if (p.calado) return { muted: true, volumeDoElemento: 0, ganho: 0 };
  if (p.grafoTocando) return { muted: true, volumeDoElemento: 0, ganho: volume };
  return { muted: false, volumeDoElemento: Math.min(1, volume), ganho: 0 };
}
