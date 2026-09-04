import type { VoiceStatus } from "@/stores/voice";

/**
 * O microfone ainda está subindo?
 *
 * Desde o #144 entrar na sala **não espera** pela faixa de microfone: quem
 * clica entra, ouve e vê o palco, e o `getUserMedia` + `publishTrack` correm
 * atrás (medido em produção, esse par tem p90 de 3,5 s). Entre um e outro
 * existe um intervalo em que a pessoa está na call e ainda não pode falar — e
 * a barra de controles precisa dizer isso, em vez de mostrar um microfone
 * aberto que não existe.
 *
 * A regra mora aqui, e não no componente, por causa do caso que ela erraria
 * sozinha: uma instalação **sem LiveKit** (`midiaDisponivel: false`, ver
 * `ResultadoMidia`) nunca vai publicar faixa nenhuma, e um `!microfonePronto`
 * solto deixaria o rótulo preso em "Ativando microfone…" para sempre. Por isso
 * a mídia entra na conta: ou a conexão ainda está em curso (`connecting`), ou
 * ela terminou **com** mídia e a faixa é só uma questão de tempo.
 */
export function microfoneAbrindo(estado: {
  status: VoiceStatus;
  midiaDisponivel: boolean;
  microfonePronto: boolean;
}): boolean {
  if (estado.microfonePronto) return false;
  return estado.status === "connecting" || estado.midiaDisponivel;
}
