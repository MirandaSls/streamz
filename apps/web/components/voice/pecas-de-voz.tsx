"use client";

import { useEffect, useState } from "react";
import { useVoice } from "@/stores/voice";

/**
 * Peças de voz usadas em mais de um lugar: o medidor do microfone, a barra que
 * o desenha e o interruptor.
 *
 * Elas moravam dentro do `VoiceSettingsPanel`, que era o único dono. Deixaram
 * de ser: o popover de supressão de ruído do painel "Voz conectada" tem o mesmo
 * teste de microfone, e duplicar a captura seria duplicar também o pedido de
 * permissão e o `AudioContext`.
 */

/**
 * Nível do microfone em tempo real (RMS do sinal).
 *
 * Abre uma captura **própria**, separada da call: o teste tem de funcionar sem
 * estar em nenhuma sala, que é justamente quando as pessoas conferem o
 * microfone.
 */
export function useNivelDoMicrofone(ativo: boolean, deviceId: string | null) {
  const [nivel, setNivel] = useState(0);
  const processamento = useVoice((s) => s.audio.processamento);

  useEffect(() => {
    if (!ativo || typeof navigator === "undefined" || !navigator.mediaDevices) {
      setNivel(0);
      return;
    }
    let parado = false;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let quadro = 0;

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: deviceId ? { exact: deviceId } : undefined,
            echoCancellation: processamento.eco,
            // o teste ouve a captura do navegador; a supressão avançada
            // acontece depois, no processador da faixa publicada
            noiseSuppression: processamento.ruido === "padrao",
            autoGainControl: processamento.ganho,
          },
        });
        if (parado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        ctx = new Ctor();
        const fonte = ctx.createMediaStreamSource(stream);
        const analisador = ctx.createAnalyser();
        analisador.fftSize = 1024;
        fonte.connect(analisador);
        const amostras = new Uint8Array(analisador.fftSize);
        const ler = () => {
          analisador.getByteTimeDomainData(amostras);
          let soma = 0;
          for (const v of amostras) {
            const x = (v - 128) / 128;
            soma += x * x;
          }
          // ×3 porque fala normal fica em RMS baixo: sem o ganho visual a barra
          // mal sairia do lugar e o teste não provaria nada
          setNivel(Math.min(1, Math.sqrt(soma / amostras.length) * 3));
          quadro = requestAnimationFrame(ler);
        };
        ler();
      } catch {
        // sem permissão de microfone não há o que medir
      }
    })();

    return () => {
      parado = true;
      cancelAnimationFrame(quadro);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close().catch(() => {});
      setNivel(0);
    };
  }, [ativo, deviceId, processamento.eco, processamento.ruido, processamento.ganho]);

  return nivel;
}

/** Barra de nível; com `limiar`, marca onde a voz passa a contar. */
export function BarraDeNivel({ nivel, limiar }: { nivel: number; limiar?: number }) {
  const acima = limiar === undefined || nivel >= limiar;
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-rail">
      <div
        className={`h-full rounded-full transition-[width] duration-75 ${acima ? "bg-accent" : "bg-txt-faint"}`}
        style={{ width: `${Math.round(nivel * 100)}%` }}
      />
      {limiar !== undefined && (
        <span
          aria-hidden="true"
          style={{ left: `${Math.round(limiar * 100)}%` }}
          className="absolute inset-y-0 w-0.5 bg-txt-primary"
        />
      )}
    </div>
  );
}

/** Interruptor do Discord: pílula que desliza, não caixa de seleção. */
export function Chave({
  rotulo,
  ligado,
  onChange,
}: {
  rotulo: string;
  ligado: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{rotulo}</span>
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        aria-label={rotulo}
        onClick={() => onChange(!ligado)}
        className={`relative h-6 w-10 shrink-0 rounded-full transition ${
          ligado ? "bg-accent" : "bg-border-strong"
        }`}
      >
        <span
          className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${
            ligado ? "left-5" : "left-1"
          }`}
        />
      </button>
    </div>
  );
}

