/**
 * O cronômetro da entrada na call.
 *
 * Existe porque "está demorando para entrar" não é diagnosticável sem número:
 * o caminho do clique até a mídia fluir passa por seis coisas — o token, o
 * `Room.connect` (que carrega o ICE), a saída de áudio, o `getUserMedia`, a
 * cadeia de captura e o `publishTrack` —, e qualquer uma delas pode ser a
 * lenta, em máquinas que ninguém aqui tem na mão.
 *
 * Medido em produção (logs do `streamz-livekit`, 168 h, 213 entradas), o
 * intervalo entre a sessão RTC começar e o microfone ser publicado tem
 * **p50 de 457 ms, p75 de 833 ms, p90 de 3,5 s e p95 de 12,3 s**. Antes do
 * #144 esse intervalo inteiro era tela de espera: a store só dizia
 * `connected` depois de o microfone estar no ar. Os marcos abaixo são o que
 * permite ver, na máquina de quem reclama, qual etapa comeu o tempo.
 *
 * Fica ligado em produção de propósito: `console.debug` não aparece no nível
 * padrão do console e custa uma chamada de função por entrada na sala.
 */

/** Relógio monotônico quando existe; `Date.now()` no ambiente de teste. */
function agora(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

export interface CronometroDeVoz {
  /** Marca o fim de uma etapa e imprime quanto ela levou (e o total até aqui). */
  etapa(nome: string): void;
  /** Milissegundos desde a criação do cronômetro. */
  total(): number;
}

/**
 * Um cronômetro por entrada na sala. Cada `etapa` imprime o tempo **daquela**
 * etapa e o acumulado — sem o acumulado não dá para dizer se a soma fecha com
 * o que a pessoa sentiu.
 */
export function cronometroDeVoz(rotulo: string): CronometroDeVoz {
  const inicio = agora();
  let anterior = inicio;
  return {
    etapa(nome) {
      const t = agora();
      const desta = Math.round(t - anterior);
      const acumulado = Math.round(t - inicio);
      anterior = t;
      console.debug(`[voz] ${rotulo} · ${nome}: ${desta}ms (total ${acumulado}ms)`);
    },
    total: () => Math.round(agora() - inicio),
  };
}
