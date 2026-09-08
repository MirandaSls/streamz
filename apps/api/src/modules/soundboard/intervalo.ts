/**
 * O teto de "um som por segundo, por pessoa".
 *
 * Parte pura, separada do service, porque é a regra que precisa de teste e a
 * única coisa que pode estar errada aqui é a comparação de relógio. Guardar o
 * último instante e comparar é trivial; o que não é trivial e já mordeu outros
 * limitadores é o **relógio andando para trás** (ajuste de NTP, container
 * migrado): com `agora - anterior < janela` cru, um salto para trás bloquearia
 * a pessoa até o relógio alcançar de novo — podendo ser minutos.
 *
 * O throttler do Nest não serve aqui: ele conta **por IP**, e numa casa com
 * duas pessoas na mesma chamada isso somaria os dois cliques num teto só.
 */
export function intervaloRespeitado(
  ultimoEm: number | undefined,
  agora: number,
  janelaMs: number,
): boolean {
  if (ultimoEm === undefined) return true;
  const decorrido = agora - ultimoEm;
  // relógio para trás: solta, e o próximo `set` volta a ancorar no tempo atual
  if (decorrido < 0) return true;
  return decorrido >= janelaMs;
}
