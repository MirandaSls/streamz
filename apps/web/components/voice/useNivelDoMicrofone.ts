"use client";

import { useEffect, useState } from "react";
import { faixaDeMonitoracao } from "@/lib/microfone";
import { liberarContextoDeCaptura, usarContextoDeCaptura } from "@/lib/supressor-ruido";
import { devolverAtenuacao, suspenderAtenuacaoDaCaptura, useVoiceDevicesStore } from "@/stores/voiceDevices";

const INTERVALO_MS = 50;

/** RMS de amostras float (-1..1). Mesma escala do `rmsDeAmostras`, sem a quantização de 8 bits. */
function rmsFloat(amostras: Float32Array): number {
  if (amostras.length === 0) return 0;
  let soma = 0;
  for (let i = 0; i < amostras.length; i += 1) soma += amostras[i] * amostras[i];
  return Math.sqrt(soma / amostras.length);
}

/**
 * Nível do microfone (0–1) **só para olhar**, enquanto `ativo`.
 *
 * Não é o `useTesteDeMicrofone`: aquele muta e ensurdece de verdade e devolve o
 * som da própria voz, o que seria absurdo só por abrir um menu. Aqui nada é
 * publicado nem tocado. Numa call lê a faixa que o dono do microfone já tem
 * aberta (`faixaDeMonitoracao`); fora dela abre uma captura crua curta.
 *
 * Com `ativo` falso (menu fechado) o efeito não roda: sem stream, sem
 * listener, sem timer. O cleanup para tudo, e a captura própria é sempre
 * parada — microfone aberto depois de a caixa sumir é o bug que ninguém vê.
 */
export function useNivelDoMicrofone(ativo: boolean): number {
  const inputId = useVoiceDevicesStore((s) => s.inputId);
  const [nivel, setNivel] = useState(0);

  useEffect(() => {
    if (!ativo) return;
    let cancelado = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let atenuacaoSuspensa = false;
    let ctx: AudioContext | null = null;
    let fonte: MediaStreamAudioSourceNode | null = null;
    let analisador: AnalyserNode | null = null;
    let ligada: MediaStreamTrack | null = null;

    try {
      ctx = usarContextoDeCaptura();
    } catch {
      return; // sem Web Audio não há medidor; o menu segue funcionando
    }
    const contexto = ctx;
    const an = contexto.createAnalyser();
    an.fftSize = 1024;
    analisador = an;

    const ligarEm = (faixa: MediaStreamTrack) => {
      fonte?.disconnect();
      fonte = contexto.createMediaStreamSource(new MediaStream([faixa]));
      fonte.connect(an);
      ligada = faixa;
    };

    void (async () => {
      let faixa = faixaDeMonitoracao();
      if (!faixa) {
        // captura do Chromium é stream de comunicações: suspende a atenuação
        // dos outros apps antes, como o teste de microfone faz
        atenuacaoSuspensa = true;
        await suspenderAtenuacaoDaCaptura();
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: inputId ? { exact: inputId } : undefined },
          });
        } catch (e) {
          // aparelho salvo sumiu (desplugado): cai no padrão do sistema em vez
          // de deixar o medidor zerado
          const sumiu = e instanceof DOMException && (e.name === "OverconstrainedError" || e.name === "NotFoundError");
          if (!inputId || !sumiu) return;
          try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          } catch {
            return;
          }
        }
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        faixa = stream.getAudioTracks()[0] ?? null;
      }
      if (cancelado || !faixa) return;
      ligarEm(faixa);
      const amostras = new Float32Array(an.fftSize);
      timer = setInterval(() => {
        if (!stream) {
          // a call pode trocar a faixa debaixo de nós (mudar a supressão)
          const atual = faixaDeMonitoracao();
          if (atual && atual !== ligada) ligarEm(atual);
        }
        an.getFloatTimeDomainData(amostras);
        // ×3: fala normal tem RMS baixo; mesmo ganho visual do teste
        setNivel(Math.min(1, rmsFloat(amostras) * 3));
      }, INTERVALO_MS);
    })();

    return () => {
      cancelado = true;
      if (timer) clearInterval(timer);
      fonte?.disconnect();
      analisador?.disconnect();
      stream?.getTracks().forEach((t) => t.stop());
      if (atenuacaoSuspensa) devolverAtenuacao();
      // o contexto que ESTE hook tomou, não o que o módulo achar que é
      liberarContextoDeCaptura(contexto);
      setNivel(0);
    };
  }, [ativo, inputId]);

  return ativo ? nivel : 0;
}
