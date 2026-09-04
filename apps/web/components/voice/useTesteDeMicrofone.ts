"use client";

import { useEffect, useRef, useState } from "react";
import { Track } from "livekit-client";
import { supressorDeRuido } from "@/lib/supressor-ruido";
import { rmsDeAmostras } from "@/stores/voice-falantes";
import { useVoice } from "@/stores/voice";
import { aplicarSaida, explicarMidia, motivoDaFalha, useVoiceDevicesStore } from "@/stores/voiceDevices";

/**
 * "Testar microfone" — o do popover de supressão de ruído e o da aba
 * "Voz e vídeo", com um dono só.
 *
 * O teste do Discord não é um medidor: é uma cabine. Enquanto ele corre você
 * fica **surdo dos dois lados** (não ouve ninguém e ninguém te ouve) e ouve a
 * si mesmo, com o mesmo processamento que o outro lado receberia. Só assim a
 * pergunta que levou a pessoa ali — "estou pegando o ventilador?" — tem
 * resposta: com a sala tocando por cima é impossível julgar o próprio som, e
 * com o microfone ainda publicado o teste vira um monólogo para a call.
 *
 * A divisão de trabalho:
 *
 * - o **estado** (`testandoMicrofone`) mora na store da voz, porque quem tem
 *   de respeitá-lo está fora daqui: a publicação do microfone (`voice.ts`) e o
 *   `<audio>` de cada participante remoto (`AudioRemotoHost`). Ele é
 *   transitório e sobrepõe as preferências sem escrevê-las — ver
 *   `stores/teste-de-microfone.ts`;
 * - a **mídia** (captura, retorno e medidor) mora neste hook, montada enquanto
 *   o estado vale e desmontada quando ele cai. Sair da call derruba o estado
 *   (`sairDaSalaAtual`), e com ele a captura — sem nenhum acoplamento a mais.
 *
 * Fechar o popover ou trocar de aba desmonta o hook, e desmontar para o teste:
 * um microfone que continua gravando depois de a caixa sumir é exatamente o
 * bug que ninguém percebe.
 */

/**
 * Quem está com a captura na mão.
 *
 * O popover e a aba podem estar montados ao mesmo tempo (o modal de
 * configurações cobre o painel da call, não o desmonta). Duas capturas do mesmo
 * microfone seriam dois pedidos de permissão e dois retornos sobrepostos, então
 * a primeira instância que reivindica é a que toca o teste; a outra acompanha o
 * botão, sem medidor.
 */
let dono: symbol | null = null;

/** ~20 leituras por segundo bastam para a barra e não custam quadro. */
const INTERVALO_MS = 50;

export interface TesteDeMicrofone {
  testando: boolean;
  /** 0–1, já com o ganho visual (fala normal fica em RMS baixo demais). */
  nivel: number;
  erro: string | null;
  alternar: () => void;
  parar: () => void;
}

export function useTesteDeMicrofone(): TesteDeMicrofone {
  const testando = useVoice((s) => s.testandoMicrofone);
  const iniciar = useVoice((s) => s.iniciarTesteDeMicrofone);
  const parar = useVoice((s) => s.pararTesteDeMicrofone);
  const processamento = useVoice((s) => s.audio.processamento);
  const inputId = useVoiceDevicesStore((s) => s.inputId);
  const outputId = useVoiceDevicesStore((s) => s.outputId);
  const [nivel, setNivel] = useState(0);
  const [erro, setErro] = useState<string | null>(null);

  const token = useRef<symbol | null>(null);
  token.current ??= Symbol("teste-de-microfone");
  /** já fui o dono alguma vez? é quem pode encerrar o teste ao desmontar. */
  const fuiDono = useRef(false);

  const { eco, ruido, ganho } = processamento;

  useEffect(() => {
    if (!testando) {
      setNivel(0);
      return;
    }
    if (dono !== null && dono !== token.current) return;
    dono = token.current;
    fuiDono.current = true;

    let cancelado = false;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let elemento: HTMLAudioElement | null = null;
    let supressor: ReturnType<typeof supressorDeRuido> | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: inputId ? { exact: inputId } : undefined,
            // o mesmo processamento que a call publicaria: um teste com outra
            // cadeia responderia sobre um microfone que não é o seu
            echoCancellation: eco,
            noiseSuppression: ruido === "padrao",
            autoGainControl: ganho,
          },
        });
      } catch {
        setErro(explicarMidia(motivoDaFalha()) ?? "Não foi possível abrir o microfone.");
        useVoice.getState().pararTesteDeMicrofone();
        return;
      }
      if (cancelado) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      setErro(null);

      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      // 48 kHz é a taxa que o RNNoise exige; pedir aqui evita que ele abra uma
      // segunda `AudioContext` só para converter
      ctx = new Ctor({ sampleRate: 48_000 });

      let faixa = stream.getAudioTracks()[0];
      if (ruido === "avancada" && faixa) {
        try {
          supressor = supressorDeRuido();
          await supressor.init({ kind: Track.Kind.Audio, track: faixa, audioContext: ctx });
          faixa = supressor.processedTrack ?? faixa;
        } catch {
          // sem o wasm o teste continua valendo, só sem a supressão avançada
          supressor = null;
        }
      }
      if (cancelado || !faixa) return;

      const fonte = ctx.createMediaStreamSource(new MediaStream([faixa]));
      const analisador = ctx.createAnalyser();
      analisador.fftSize = 1024;
      fonte.connect(analisador);

      /*
        O retorno sai por um `<audio>`, e não por `ctx.destination`: só elemento
        de mídia tem `setSinkId`, e é ele que faz o teste tocar na **saída
        escolhida** — testar o microfone ouvindo pelo alto-falante errado não
        responde nada. O atraso é o do grafo (poucos ms), que é o que se quer:
        latência alta transforma o retorno em eco e a pessoa gagueja.
      */
      const destino = ctx.createMediaStreamDestination();
      fonte.connect(destino);
      elemento = document.createElement("audio");
      elemento.autoplay = true;
      elemento.srcObject = destino.stream;
      elemento.style.display = "none";
      document.body.appendChild(elemento);
      await aplicarSaida(elemento, outputId);
      void elemento.play().catch(() => {});
      void ctx.resume().catch(() => {});

      const amostras = new Uint8Array(analisador.fftSize);
      timer = setInterval(() => {
        analisador.getByteTimeDomainData(amostras);
        // ×3 porque fala normal fica em RMS baixo: sem o ganho visual a barra
        // mal sairia do lugar e o teste não provaria nada
        setNivel(Math.min(1, rmsDeAmostras(amostras) * 3));
      }, INTERVALO_MS);
    })();

    return () => {
      cancelado = true;
      if (timer) clearInterval(timer);
      if (elemento) {
        elemento.pause();
        elemento.srcObject = null;
        elemento.remove();
      }
      void supressor?.destroy().catch(() => {});
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close().catch(() => {});
      if (dono === token.current) dono = null;
      setNivel(0);
    };
  }, [testando, inputId, outputId, eco, ruido, ganho]);

  // fechar o popover, trocar de aba ou fechar as configurações para o teste
  useEffect(
    () => () => {
      if (fuiDono.current) useVoice.getState().pararTesteDeMicrofone();
    },
    [],
  );

  return {
    testando,
    nivel,
    erro,
    alternar: () => (testando ? parar() : iniciar()),
    parar,
  };
}
