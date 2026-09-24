"use client";

import { useEffect, useRef } from "react";
import { CALL_RING_TIMEOUT_MS } from "@streamz/shared";
import AudioRemotoHost from "@/components/voice/AudioRemotoHost";
import IncomingCallModal from "@/components/voice/IncomingCallModal";
import JanelasDeVoz from "@/components/voice/JanelasDeVoz";
import VoiceHotkeys from "@/components/voice/VoiceHotkeys";
import { VoiceVolumePopoverHost } from "@/components/voice/VoiceGrid";
import { pararToque, prepararToque, ringbackUrl, tocarToque } from "@/lib/ringtone";
import { useAuth } from "@/stores/auth";
import { toqueExpirou } from "@/stores/call-machine";
import { useDMs } from "@/stores/dms";
import { useGuilds } from "@/stores/guilds";
import { preaquecerCadeiaDeVoz, useVoice } from "@/stores/voice";
import { salaLembrada } from "@/stores/voice-retomada";

/**
 * As peças de voz que precisam existir com o app inteiro, não só com o painel
 * aberto: o áudio dos outros participantes, atalhos de teclado, o cartão de
 * chamada recebida, o popover de volume e a carga do estado de voz dos
 * servidores.
 *
 * O áudio vem primeiro na lista porque é o motivo de a camada existir: a
 * chamada continua enquanto o usuário navega, e o que ele ouve não pode
 * depender de qual tela está aberta (ver `AudioRemotoHost`).
 *
 * O estado de voz precisa vir uma vez por servidor (`GET /guilds/:id/
 * voice-states`) porque o `voice.state` só conta o que muda **daqui para a
 * frente** — sem essa carga inicial quem entrasse depois não veria ninguém nas
 * salas. A carga é acumulativa: `loadGuild` troca só os canais do servidor
 * pedido e preserva o cache dos demais, então voltar a um servidor já visitado
 * mostra as salas cheias na hora, sem piscar vazio enquanto o fetch volta.
 *
 * A conversa aberta tem a mesma carga (`GET /dms/:id/voice-states`): sem ela,
 * uma chamada que já estava rolando só aparecia para quem recebeu o toque. E no
 * boot a sala que **esta aba** lembra é carregada também — é assim que um F5 no
 * meio da chamada volta a ela sozinho (ver `voice-retomada.ts`).
 */
export default function VoiceLayer() {
  const guildId = useGuilds((s) => s.activeGuildId);
  const dmId = useDMs((s) => s.activeId);
  const userId = useAuth((s) => s.user?.id);
  const fase = useVoice((s) => s.call.phase);
  const ringback = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (guildId) void useVoice.getState().loadGuild(guildId);
  }, [guildId]);

  useEffect(() => {
    if (dmId) void useVoice.getState().loadDM(dmId);
  }, [dmId]);

  // boot: a sala em que esta aba estava antes de recarregar. A carga termina em
  // `retomarSeReconectando`, que decide se ainda há o que retomar
  useEffect(() => {
    if (!userId) return;
    const lembrada = salaLembrada();
    if (!lembrada) return;
    const voice = useVoice.getState();
    void (lembrada.guildId ? voice.loadGuild(lembrada.guildId) : voice.loadDM(lembrada.channelId));
  }, [userId]);

  /**
   * Pré-aquece a cadeia de captura enquanto ninguém espera por ela.
   *
   * O chunk do RNNoise, os dois `.wasm` e o `addModule` são caros uma vez por
   * aba, e eram pagos no meio da entrada na call — com a pessoa olhando a tela
   * de espera. Aqui saem do caminho crítico. `requestIdleCallback` para não
   * disputar com o primeiro render; `setTimeout` onde ele não existe (Safari).
   * Só vale para quem escolheu a supressão "Avançada" (ver
   * `preaquecerCadeiaDeVoz`); os outros não baixam nada.
   */
  useEffect(() => {
    if (!userId) return;
    const ocioso = window.requestIdleCallback;
    if (ocioso) {
      const id = ocioso(() => preaquecerCadeiaDeVoz());
      return () => window.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(preaquecerCadeiaDeVoz, 2000);
    return () => window.clearTimeout(id);
  }, [userId]);

  /**
   * Ringback: quem liga também precisa ouvir alguma coisa — silêncio absoluto
   * do lado de cá é indistinguível de chamada que não saiu.
   *
   * Duas coisas seguram este som, e as duas já falharam:
   *
   * 1. **A fase tem de continuar `outgoing` até o outro atender.** É elemento
   *    próprio (não passa pelo `tocarArquivo` nem pela guarda de 300 ms por
   *    arquivo, então dividir o `chamada.mp3` com o toque de quem recebe é
   *    seguro), mas ele só toca enquanto a fase for `outgoing`. Até o PR desta
   *    correção, `applyState` lia o **meu próprio** estado de voz como "alguém
   *    entrou na chamada" e a fase pulava para `active` no mesmo instante: o
   *    som começava e morria dentro da mesma requisição.
   * 2. **O gesto já foi dado**: quem liga acabou de clicar no telefone, então o
   *    documento tem ativação e o `play()` passa. A rede de segurança do
   *    `toque-com-gesto` fica para o toque de quem **recebe**, que é o que
   *    chega sem ninguém ter encostado na janela.
   *
   * A dependência é a fase (um primitivo), e não `call`: a máquina troca o
   * objeto a cada evento, e reiniciar o áudio a cada troca faria o toque gaguejar.
   */
  useEffect(() => {
    const el = ringback.current;
    if (!el) return;
    if (fase === "outgoing" && prepararToque(el)) tocarToque(el);
    else pararToque(el);
  }, [fase]);

  /**
   * Rede de segurança do timeout de quem **liga**.
   *
   * A autoridade é o `call.ended` do servidor — o relógio de 30 s de
   * `calls.service.ts`. Este `setTimeout` não substitui aquele: existe só para
   * o caso de o evento nunca chegar (o processo caiu, o socket caiu e não
   * reconectou a tempo etc.), que é o defeito que travava quem ligava em
   * "Chamando…" para sempre. Quem **recebe** já tinha essa rede
   * (`IncomingCallModal`); faltava pendurar a mesma para quem liga.
   *
   * A folga de 5 s sobre `CALL_RING_TIMEOUT_MS` é de propósito: com os dois
   * relógios rodando, o desfecho real (`call.ended` do servidor, chegando
   * pela rede) tem de ganhar da rede de segurança local — senão o cliente
   * encerraria a chamada sozinho um instante antes do servidor confirmar, e o
   * motivo mostrado na UI seria "expirou" quando na verdade era o desfecho
   * normal do servidor. 5 s cobre a viagem de ida e volta do evento com folga
   * generosa sem fazer quem ligou esperar muito mais que os 30 s nominais.
   *
   * `toqueExpirou` (e não um `dispatchCall({ type: "timeout" })` cego) é quem
   * decide se ainda vale o disparo: lê o estado **no instante em que o
   * relógio estoura**, não o `fase` capturado no fechamento — se a chamada já
   * saiu de `outgoing` (atendida, recusada, `ended` do servidor) o disparo
   * também já teria sido cancelado pela limpeza abaixo, mas essa segunda
   * checagem é o que impede um relógio atrasado de derrubar uma chamada que
   * já está `active`, que seria o defeito oposto e pior.
   */
  useEffect(() => {
    if (fase !== "outgoing") return;
    const id = window.setTimeout(() => {
      const voice = useVoice.getState();
      if (toqueExpirou(voice.call, Date.now())) voice.dispatchCall({ type: "timeout" });
    }, CALL_RING_TIMEOUT_MS + 5000);
    return () => window.clearTimeout(id);
  }, [fase]);

  return (
    <>
      <AudioRemotoHost />
      {/* as janelas soltas da chamada vivem aqui, e não no palco: trocar de
          tela na aba principal desmonta o palco, e a janela tem de seguir */}
      <JanelasDeVoz />
      <VoiceHotkeys />
      <VoiceVolumePopoverHost />
      <IncomingCallModal />
      <audio ref={ringback} src={ringbackUrl()} preload="auto" loop />
    </>
  );
}
