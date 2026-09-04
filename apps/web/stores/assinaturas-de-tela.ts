import { VideoQuality } from "livekit-client";

/**
 * Quais transmissões de tela o meu cliente baixa, e em que qualidade.
 *
 * O LiveKit assina tudo por padrão, o que numa sala com três transmissões
 * significa baixar três vídeos em alta para desenhar três quadradinhos. Desde o
 * PR #108 a regra é explícita — mas ela tinha um furo que apagava a tela de
 * quem transmite:
 *
 * **No desktop a minha própria tela é um participante remoto.** A captura é
 * nativa (Rust) e entra na sala como `<userId>#tela`; do ponto de vista do meu
 * cliente ela é uma publicação como a de qualquer outro. A regra antiga
 * assinava só quem estivesse em `assistindo`, e ninguém entra em `assistindo`
 * pela própria tela (o botão "Assistir" não aparece no próprio tile) — então o
 * cliente mandava `setSubscribed(false)` na própria transmissão, o SFU parava
 * de encaminhá-la, `pub.track` ficava `undefined` e o tile do palco ficava
 * **preto**, com o nome e o selo "Ao vivo" por cima. O Rust seguia publicando o
 * tempo todo: o quadro morria no cliente, não na captura.
 *
 * As três regras, então:
 *
 * 1. **A minha tela é sempre assinada.** No Discord você vê a sua própria
 *    transmissão no palco, e é a única forma de conferir o que está no ar.
 *    (No navegador a faixa é local e nem passa por aqui — faixa local não se
 *    assina; ver `aplicarAssinaturasDeTela`.)
 * 2. **Tela escolhida** (`assistindo`) e **miniatura aberta** (`previa`) são
 *    assinadas. O resto — tela que tem tile mas mostra só o convite "Assistir
 *    transmissão" — fica desassinado, que é o ganho do #108.
 * 3. **A qualidade segue o tamanho do tile**: alta no destaque do palco e na
 *    grade sem foco; baixa quando o tile é uma miniatura — a faixa embaixo do
 *    destaque, ou o pop-up do hover.
 *
 * Este módulo é a regra inteira e não fala com o SDK: quem tem `Room` é a
 * store. Assim ela é testável com participantes de mentira, inclusive o
 * `#tela`, que é onde o defeito morava.
 */

/** O mínimo de uma publicação remota que a regra precisa ler e mexer. */
export interface FaixaDeTelaRemota {
  trackSid: string;
  isSubscribed: boolean;
  setSubscribed(assinar: boolean): void;
  setVideoQuality(qualidade: VideoQuality): void;
}

/** O mínimo de uma publicação de áudio remota (a tela leva som do sistema). */
export interface FaixaRemota {
  isSubscribed: boolean;
  setSubscribed(assinar: boolean): void;
}

/** Um participante da sala reduzido ao que decide assinatura de tela. */
export interface ParticipanteDeTela {
  /** `userId` do dono — o `#tela` já vem resolvido por `donoDaIdentidade`. */
  dono: string;
  /** publicações de vídeo de tela **remotas** (a local não se assina). */
  telas: FaixaDeTelaRemota[];
  /** publicações de áudio de tela remotas. */
  audios: FaixaRemota[];
}

/** O que a store sabe sobre o que estou olhando agora. */
export interface EstadoDeAssistir {
  /** meu `userId` na sala; null antes de conectar. */
  meuId: string | null;
  /** donos das telas que escolhi assistir. */
  assistindo: ReadonlySet<string>;
  /** dono da tela cuja miniatura do hover está aberta. */
  previa: string | null;
  /** chave do tile no destaque do palco (null = grade). */
  focado: string | null;
}

export interface Assinatura {
  assinar: boolean;
  /** null quando não se assina — não há o que pedir ao servidor. */
  qualidade: VideoQuality | null;
}

/**
 * A chave do tile de uma tela no palco.
 *
 * Mora aqui, e não na grade, porque a regra de qualidade compara `focado` com
 * ela: se as duas fórmulas divergissem, a tela no destaque seria pedida em
 * baixa para sempre, sem ninguém notar.
 */
export function chaveDoTileDeTela(dono: string, trackSid: string): string {
  return `${dono}:${trackSid}`;
}

/** A decisão para uma publicação de tela. Ver o cabeçalho do módulo. */
export function assinaturaDaTela(
  dono: string,
  chave: string,
  { meuId, assistindo, previa, focado }: EstadoDeAssistir,
): Assinatura {
  const minha = !!meuId && dono === meuId;
  const assistida = minha || assistindo.has(dono);
  const assinar = assistida || previa === dono;
  if (!assinar) return { assinar: false, qualidade: null };
  // só a miniatura do hover: 240×135 não pede mais que a camada baixa
  if (!assistida) return { assinar: true, qualidade: VideoQuality.LOW };
  // com alguém no destaque, todo o resto é miniatura de 188×106 na faixa
  const naFaixa = focado !== null && focado !== chave;
  return { assinar: true, qualidade: naFaixa ? VideoQuality.LOW : VideoQuality.HIGH };
}

/**
 * Aplica a decisão em todo mundo.
 *
 * O áudio da minha própria tela é o único que se desassina de propósito: ele
 * volta do SFU sem ter quem o toque (`AudioRemotoHost` não desenha `<audio>`
 * para mim, senão eu ouviria o meu som duas vezes), então baixá-lo é banda
 * paga por silêncio. O áudio dos outros continua com a assinatura automática:
 * quem está numa call ouve a tela de quem transmite mesmo sem assistir.
 */
export function aplicarAssinaturas(
  participantes: readonly ParticipanteDeTela[],
  estado: EstadoDeAssistir,
): void {
  for (const p of participantes) {
    for (const pub of p.telas) {
      const { assinar, qualidade } = assinaturaDaTela(
        p.dono,
        chaveDoTileDeTela(p.dono, pub.trackSid),
        estado,
      );
      if (pub.isSubscribed !== assinar) pub.setSubscribed(assinar);
      if (qualidade !== null) pub.setVideoQuality(qualidade);
    }
    if (estado.meuId && p.dono === estado.meuId) {
      for (const pub of p.audios) if (pub.isSubscribed) pub.setSubscribed(false);
    }
  }
}
