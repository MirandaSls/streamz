import { VideoQuality } from "livekit-client";
import { create } from "zustand";

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
 * **Mas assinar a própria tela de volta custa caro.** Em HIGH ela é a camada
 * de 1440p30 (até 9 Mbps) que o SFU devolve para a mesma máquina que acabou
 * de codificá-la — e o webview decodifica isso o tempo todo, junto com a
 * câmera e a captura. Era uma das causas do "compartilhar tela + câmera deixa
 * o PC lento". O Discord não faz isso: a sua transmissão aparece como um aviso
 * "Você está compartilhando sua tela", e o vídeo só vem quando você pede.
 *
 * As regras, então:
 *
 * 1. **A minha tela não se assina por padrão.** O tile dela mostra o aviso e o
 *    botão "Ver prévia" (a tela não fica preta: ela não finge ter vídeo). Ela
 *    se assina, **sempre em LOW**, só quando eu peço: a prévia do tile
 *    (`previaDaMinhaTela`, a chave do tile), o palco focado nela por clique
 *    (`focado === chave`) ou a miniatura do hover (`previa`). `assistindo` não
 *    conta para a minha tela: é um conjunto que sobrevive ao fim da
 *    transmissão, e a próxima nasceria assinada. (No navegador a faixa é
 *    local e nem passa por aqui — faixa local não se assina; ver
 *    `aplicarAssinaturasDeTela`.)
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
  /**
   * Chave do tile da **minha** tela cuja prévia pedi ("Ver prévia"). Omitido,
   * vale o que está em `usePreviaDaMinhaTela` — é assim que a store de voz,
   * que não sabe desta escolha, a enxerga.
   */
  previaDaMinhaTela?: string | null;
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

/**
 * A escolha "Ver prévia" no tile da minha própria tela, só em memória.
 *
 * Guarda a **chave do tile** (`dono:trackSid`), e não um booleano: uma nova
 * transmissão tem outro `trackSid`, então uma prévia esquecida ligada nunca
 * faz a próxima nascer assinada. E `aplicarAssinaturas` a apaga assim que a
 * tela some da sala.
 */
export const usePreviaDaMinhaTela = create<{ chave: string | null }>(() => ({ chave: null }));

/** A decisão para uma publicação de tela. Ver o cabeçalho do módulo. */
export function assinaturaDaTela(
  dono: string,
  chave: string,
  { meuId, assistindo, previa, focado, previaDaMinhaTela = null }: EstadoDeAssistir,
): Assinatura {
  if (meuId && dono === meuId) {
    // a minha: só quando eu pedi, e nunca além da camada baixa — conferir o
    // que está no ar não pede 1440p decodificados na mesma máquina que captura
    const pedi = previaDaMinhaTela === chave || focado === chave || previa === dono;
    return pedi ? { assinar: true, qualidade: VideoQuality.LOW } : { assinar: false, qualidade: null };
  }
  const assistida = assistindo.has(dono);
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
  estadoDaStore: EstadoDeAssistir,
): void {
  const guardada = usePreviaDaMinhaTela.getState().chave;
  const estado: EstadoDeAssistir = {
    ...estadoDaStore,
    previaDaMinhaTela:
      estadoDaStore.previaDaMinhaTela === undefined ? guardada : estadoDaStore.previaDaMinhaTela,
  };
  // A transmissão acabou (ou saí da sala): a prévia vai junto. A faixa em si
  // já some com a publicação — o que sobraria é só esta escolha.
  if (guardada !== null) {
    const aindaNoAr =
      !!estado.meuId &&
      participantes.some(
        (p) =>
          p.dono === estado.meuId &&
          p.telas.some((pub) => chaveDoTileDeTela(p.dono, pub.trackSid) === guardada),
      );
    if (!aindaNoAr) usePreviaDaMinhaTela.setState({ chave: null });
  }
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
