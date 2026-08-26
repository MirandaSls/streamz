"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Video } from "lucide-react";
import { Section, Slider } from "@/components/settings/controls";
import VoiceSettingsPanel from "@/components/voice/VoiceSettingsPanel";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/stores/settings";
import { useVoiceDevices } from "@/stores/voiceDevices";

/**
 * Voz e vídeo: dispositivos, volumes, modo de transmissão, teste de microfone
 * e prévia da câmera.
 *
 * A escolha de dispositivo e o apertar-para-falar são o `VoiceSettingsPanel` da
 * voz, montado aqui dentro: é o mesmo painel que abre durante a chamada, e é
 * ele que escreve nas stores que os atalhos e os controles de voz leem. Esta
 * aba acrescenta o que só faz sentido nas configurações — volumes e os dois
 * testes ao vivo.
 *
 * Toda trilha aberta aqui é parada ao sair da aba: um microfone que fica
 * gravando depois de fechar a tela é o tipo de bug que ninguém percebe.
 */
export default function VozTab() {
  const t = useT();
  const s = useSettings();
  const devices = useVoiceDevices();
  const { refresh } = devices;

  const [erro, setErro] = useState<string | null>(null);
  const [nivel, setNivel] = useState(0);
  const [testando, setTestando] = useState(false);
  const [camera, setCamera] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const micStream = useRef<MediaStream | null>(null);
  const camStream = useRef<MediaStream | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const pararMic = useCallback(() => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
    micStream.current?.getTracks().forEach((track) => track.stop());
    micStream.current = null;
    void audioCtx.current?.close();
    audioCtx.current = null;
    setNivel(0);
    setTestando(false);
  }, []);

  const pararCamera = useCallback(() => {
    camStream.current?.getTracks().forEach((track) => track.stop());
    camStream.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamera(false);
  }, []);

  // sair da aba (ou do modal) tem de fechar microfone e câmera
  useEffect(() => () => {
    pararMic();
    pararCamera();
  }, [pararMic, pararCamera]);

  async function testarMicrofone() {
    if (testando) {
      pararMic();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: devices.inputId ? { deviceId: { exact: devices.inputId } } : true,
      });
      micStream.current = stream;
      setErro(null);
      setTestando(true);
      // rótulos de dispositivo só existem depois da permissão
      void refresh();

      const contexto = new AudioContext();
      audioCtx.current = contexto;
      const analisador = contexto.createAnalyser();
      analisador.fftSize = 512;
      contexto.createMediaStreamSource(stream).connect(analisador);
      const amostras = new Uint8Array(analisador.frequencyBinCount);

      const medir = () => {
        analisador.getByteTimeDomainData(amostras);
        // RMS em torno do silêncio (128) — pico puro pisca demais para virar barra
        let soma = 0;
        for (const amostra of amostras) soma += (amostra - 128) ** 2;
        const rms = Math.sqrt(soma / amostras.length) / 128;
        setNivel(Math.min(1, rms * 3));
        raf.current = requestAnimationFrame(medir);
      };
      medir();
    } catch {
      setErro(t("voz.semPermissao"));
      pararMic();
    }
  }

  async function alternarCamera() {
    if (camera) {
      pararCamera();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: devices.cameraId ? { deviceId: { exact: devices.cameraId } } : true,
      });
      camStream.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setErro(null);
      setCamera(true);
      void refresh();
    } catch {
      setErro(t("voz.semPermissao"));
      pararCamera();
    }
  }

  return (
    <>
      <Section title={t("voz.dispositivos")}>
        <div className="py-3">
          <VoiceSettingsPanel />
        </div>
        <Slider
          label={t("voz.volumeEntrada")}
          value={s.inputVolume}
          min={0}
          max={100}
          format={(v) => `${v}%`}
          onChange={(inputVolume) => s.set({ inputVolume })}
        />
        <Slider
          label={t("voz.volumeSaida")}
          value={s.outputVolume}
          min={0}
          max={100}
          format={(v) => `${v}%`}
          onChange={(outputVolume) => s.set({ outputVolume })}
        />
      </Section>

      <Section title={t("voz.testarMic")}>
        <div className="flex items-center gap-3 py-3">
          <button
            type="button"
            onClick={() => void testarMicrofone()}
            className="flex h-9 items-center gap-2 rounded-[3px] bg-accent px-3 text-sm font-medium text-accent-ink hover:bg-accent-hover"
          >
            <Mic size={16} aria-hidden="true" />
            {testando ? t("voz.parar") : t("voz.testar")}
          </button>
          <div
            role="meter"
            aria-label={t("voz.volumeEntrada")}
            aria-valuenow={Math.round(nivel * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-2 flex-1 overflow-hidden rounded-full bg-rail"
          >
            <div
              className="h-full rounded-full bg-green transition-[width] duration-75"
              style={{ width: `${Math.round(nivel * 100)}%` }}
            />
          </div>
        </div>
      </Section>

      <Section title={t("voz.previaCamera")}>
        <div className="py-3">
          <div className="mb-2 grid aspect-video w-full max-w-[420px] place-items-center overflow-hidden rounded-lg bg-rail">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              aria-label={t("voz.previaCamera")}
              className={`h-full w-full object-cover ${camera ? "" : "hidden"}`}
            />
            {!camera && <Video size={40} className="text-txt-faint" aria-hidden="true" />}
          </div>
          <button
            type="button"
            onClick={() => void alternarCamera()}
            className="h-9 rounded-[3px] bg-border-strong px-3 text-sm font-medium text-txt-normal hover:bg-border-strong-hover"
          >
            {camera ? t("voz.desligarCamera") : t("voz.ligarCamera")}
          </button>
        </div>
      </Section>

      {erro && <p className="text-sm text-red">{erro}</p>}
    </>
  );
}
