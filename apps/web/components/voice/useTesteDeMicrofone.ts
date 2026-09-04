"use client";

import { useEffect, useRef, useState } from "react";
import { Track } from "livekit-client";
import { faixaDeMonitoracao } from "@/lib/microfone";
import {
  cadeiaDoMicrofone,
  liberarContextoDeCaptura,
  usarContextoDeCaptura,
  type CadeiaDoMicrofone,
} from "@/lib/supressor-ruido";
import { rmsDeAmostras } from "@/stores/voice-falantes";
import { useVoice } from "@/stores/voice";
import { aplicarSaida, explicarMidia, motivoDaFalha, useVoiceDevicesStore } from "@/stores/voiceDevices";

/**
 * "Testar microfone" — o do popover de supressão de ruído e o da aba
 * "Voz e vídeo", com um dono só.
 *
 * O teste do Discord não é um medidor: é uma cabine. Enquanto ele corre você
 * fica **mudo e surdo** (não ouve ninguém e ninguém te ouve) e ouve a si
 * mesmo, com o mesmo processamento que o outro lado receberia. Só assim a
 * pergunta que levou a pessoa ali — "estou pegando o ventilador?" — tem
 * resposta: com a sala tocando por cima é impossível julgar o próprio som, e
 * com o microfone ainda publicado o teste vira um monólogo para a call.
 *
 * O mudo e o surdo são **de verdade**: os ícones do rodapé e da cápsula
 * mostram os dois, o gateway recebe as flags e os outros me veem como veriam
 * qualquer um que se ensurdeceu. Ao parar, o par de antes volta exatamente
 * como estava — a regra é `stores/teste-de-microfone.ts`.
 *
 * A divisão de trabalho:
 *
 * - o **estado** (`testandoMicrofone`) mora na store da voz, porque quem tem
 *   de respeitá-lo está fora daqui: a publicação do microfone (`voice.ts`) e o
 *   `<audio>` de cada participante remoto (`AudioRemotoHost`);
 * - a **mídia** (retorno e medidor) mora neste hook, montada enquanto o estado
 *   vale e desmontada quando ele cai. Sair da call derruba o estado
 *   (`sairDaSalaAtual`), e com ele o retorno.
 *
 * ## Numa call, o teste NÃO abre uma segunda captura
 *
 * Ele escuta a faixa que o dono do microfone (`lib/microfone.ts`) já tem
 * aberta — a mesma, com o mesmo supressor e o mesmo volume de entrada. O que o
 * teste faz na sala é **despublicá-la**, não fechá-la
 * (`definirMicrofoneEmTeste`): assim o retorno é literalmente o que a sala
 * ouviria, e não uma segunda opinião sobre o mesmo microfone. Abrir um
 * `getUserMedia` por cima do que a call já mantém aberto é o tipo de coisa que
 * no Windows produz um estalo — e, na melhor das hipóteses, mede outra coisa.
 *
 * É também por isso que o mudo do teste não emudece o retorno: mudo é
 * `enabled = false` na entrada da cadeia, e o dono da faixa mantém a captura
 * aberta enquanto o teste dura (`abertoDeFato`, em `lib/microfone.ts`). O
 * retorno ouve a cadeia inteira, antes do interruptor de mudo; a sala não ouve
 * nada porque a faixa saiu de lá.
 *
 * **Fora da call** não há faixa de ninguém, e aí o hook abre a captura dele,
 * montando a mesma cadeia (`cadeiaDoMicrofone`) para a resposta continuar
 * valendo. Nos dois caminhos a `AudioContext` é a única da aba
 * (`usarContextoDeCaptura`).
 *
 * Fechar o popover ou trocar de aba desmonta o hook, e desmontar para o teste
 * — o que também devolve mudo e surdo ao que eram: um microfone que continua
 * gravando (ou um surdo que ninguém pediu) depois de a caixa sumir é
 * exatamente o bug que ninguém percebe.
 */

/**
 * Quem está com o teste na mão.
 *
 * O popover e a aba podem estar montados ao mesmo tempo (o modal de
 * configurações cobre o painel da call, não o desmonta). Dois retornos
 * sobrepostos seriam dois `<audio>` tocando a mesma voz, então a primeira
 * instância que reivindica é a que toca o teste; a outra acompanha o botão, sem
 * medidor.
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
  const entrada = useVoice((s) => s.audio.entrada);
  const inputId = useVoiceDevicesStore((s) => s.inputId);
  const outputId = useVoiceDevicesStore((s) => s.outputId);
  const [nivel, setNivel] = useState(0);
  const [erro, setErro] = useState<string | null>(null);

  const token = useRef<symbol | null>(null);
  token.current ??= Symbol("teste-de-microfone");
  /** já fui o dono alguma vez? é quem pode encerrar o teste ao desmontar. */
  const fuiDono = useRef(false);
  /** a cadeia da captura própria (fora da call), para o volume valer na hora. */
  const cadeiaPropria = useRef<CadeiaDoMicrofone | null>(null);
  /** lido a cada montagem; nas dependências, arrastar o slider reabriria tudo. */
  const ganhoAtual = useRef(entrada);
  ganhoAtual.current = entrada;

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
    let cadeia: CadeiaDoMicrofone | null = null;
    let elemento: HTMLAudioElement | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let fonte: MediaStreamAudioSourceNode | null = null;
    let ligada: MediaStreamTrack | null = null;

    // tomar o contexto fora do fluxo assíncrono: se falhar, o teste nem começa
    // (e o `dono` é devolvido na hora, senão o outro montado ficaria travado)
    let ctx: AudioContext;
    try {
      ctx = usarContextoDeCaptura();
    } catch {
      dono = null;
      setErro("Este navegador não expõe o Web Audio, e sem ele não há teste.");
      return;
    }
    const analisador = ctx.createAnalyser();
    analisador.fftSize = 1024;
    const destino = ctx.createMediaStreamDestination();

    /** (Re)liga o medidor e o retorno a uma faixa. Trocar de faixa é barato. */
    const ligarEm = (faixa: MediaStreamTrack) => {
      fonte?.disconnect();
      fonte = ctx.createMediaStreamSource(new MediaStream([faixa]));
      fonte.connect(analisador);
      fonte.connect(destino);
      ligada = faixa;
    };

    void (async () => {
      let faixa = faixaDeMonitoracao();

      if (!faixa) {
        // fora de qualquer call: a captura é deste hook
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
        const crua = stream.getAudioTracks()[0];
        if (!crua) return;
        faixa = crua;
        try {
          cadeia = cadeiaDoMicrofone({
            supressao: ruido === "avancada",
            ganho: ganhoAtual.current,
          });
          await cadeia.init({ kind: Track.Kind.Audio, track: crua, audioContext: ctx });
          faixa = cadeia.processedTrack ?? crua;
          cadeiaPropria.current = cadeia;
        } catch {
          // sem o wasm o teste continua valendo, só sem a cadeia
          cadeia = null;
          cadeiaPropria.current = null;
        }
      }

      if (cancelado || !faixa) return;
      setErro(null);
      ligarEm(faixa);

      /*
        O retorno sai por um `<audio>`, e não por `ctx.destination`: só elemento
        de mídia tem `setSinkId`, e é ele que faz o teste tocar na **saída
        escolhida** — testar o microfone ouvindo pelo alto-falante errado não
        responde nada. O atraso é o do grafo (poucos ms), que é o que se quer:
        latência alta transforma o retorno em eco e a pessoa gagueja.
      */
      elemento = document.createElement("audio");
      elemento.autoplay = true;
      elemento.srcObject = destino.stream;
      elemento.style.display = "none";
      document.body.appendChild(elemento);
      await aplicarSaida(elemento, outputId);
      void elemento.play().catch(() => {});

      const amostras = new Uint8Array(analisador.fftSize);
      timer = setInterval(() => {
        // o dono da faixa pode trocá-la debaixo do teste (mudar a supressão
        // remonta a cadeia): sem religar, o medidor congelaria no silêncio
        if (!stream) {
          const atual = faixaDeMonitoracao();
          if (atual && atual !== ligada) ligarEm(atual);
        }
        analisador.getByteTimeDomainData(amostras);
        // ×3 porque fala normal fica em RMS baixo: sem o ganho visual a barra
        // mal sairia do lugar e o teste não provaria nada. O volume de entrada
        // já está no sinal — é a mesma cadeia que a sala ouviria
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
      fonte?.disconnect();
      analisador.disconnect();
      destino.disconnect();
      cadeiaPropria.current = null;
      void cadeia?.destroy().catch(() => {});
      stream?.getTracks().forEach((t) => t.stop());
      // o contexto é um por aba: devolve, não fecha
      liberarContextoDeCaptura();
      if (dono === token.current) dono = null;
      setNivel(0);
    };
  }, [testando, inputId, outputId, eco, ruido, ganho]);

  // o volume de entrada vale na hora nos dois caminhos: numa call quem o aplica
  // é o dono da faixa (`setAudioPref` → `atualizarMicrofone`); fora dela, aqui
  useEffect(() => {
    cadeiaPropria.current?.setGanho(entrada);
  }, [entrada]);

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
