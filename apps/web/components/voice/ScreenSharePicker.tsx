"use client";

import { useEffect, useRef, useState } from "react";
import { AppWindow, Monitor, MonitorUp } from "lucide-react";
import { SCREEN_QUALITY, type ScreenQuality } from "@streamz/shared";
import Dialog, { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import { ui } from "@/stores/ui";
import { useVoice } from "@/stores/voice";

/**
 * Seletor de transmissão — as abas "Aplicativos"/"Telas", a prévia ao vivo e a
 * qualidade num lugar só, como no Discord.
 *
 * **Por que a grade de miniaturas de janelas não existe aqui:** na web não há
 * como enumerar janelas ou telas. `getDisplayMedia` é uma API de *gesto*: ela
 * abre o seletor do próprio navegador/sistema e devolve **uma** captura já
 * escolhida — não existe "listar fontes" (isso é privilégio de aplicação
 * nativa; num Tauri/Electron viria de `desktopCapturer`). Enumerar janelas sem
 * consentimento vazaria o que o usuário tem aberto, e é por isso que a
 * plataforma não expõe.
 *
 * O que dá para reproduzir com honestidade — e é o que este modal faz — é o
 * resto do fluxo: escolher o *tipo* de fonte (o `displaySurface` é uma dica que
 * o navegador respeita), ver a **prévia ao vivo** do que será transmitido,
 * ajustar resolução e taxa de quadros antes de subir, e só então ir ao ar.
 */
export default function ScreenSharePicker({ onClose }: { onClose: () => void }) {
  const [aba, setAba] = useState<"aplicativos" | "telas">("aplicativos");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturando, setCapturando] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const publicado = useRef(false);

  const quality = useVoice((s) => s.screenQuality);
  const audio = useVoice((s) => s.screenAudio);
  const setQuality = useVoice((s) => s.setScreenQuality);
  const setAudio = useVoice((s) => s.setScreenAudio);
  const publicarTela = useVoice((s) => s.publicarTela);

  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
  }, [stream]);

  // fechar sem ir ao ar não pode deixar a captura viva (o navegador seguiria
  // mostrando "compartilhando" com ninguém do outro lado)
  useEffect(() => {
    return () => {
      if (!publicado.current) stream?.getTracks().forEach((t) => t.stop());
    };
  }, [stream]);

  const preset = SCREEN_QUALITY[quality];
  // a chave é `<resolução><fps>` ("1440p30"): separá-la deixa os dois controles
  // independentes, já que o contrato tem todas as combinações
  const fps = quality.endsWith("60") ? "60" : "30";
  const resolucao = quality.slice(0, -2);

  async function capturar(tipo: "aplicativos" | "telas") {
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : null;
    if (!md?.getDisplayMedia) {
      ui.toast("Este navegador não permite compartilhar a tela", "error");
      return;
    }
    setCapturando(true);
    try {
      const novo = await md.getDisplayMedia({
        video: {
          // dica de qual seletor abrir; o navegador pode ignorar, e tudo bem
          displaySurface: tipo === "telas" ? "monitor" : "window",
          width: preset.width,
          height: preset.height,
          frameRate: preset.frameRate,
        } as MediaTrackConstraints,
        // Estéreo de verdade exige desligar os processadores de voz: eles são
        // feitos para microfone e achatam música/jogo em mono abafado. Aqui a
        // fonte é o próprio sistema, então não há eco a cancelar.
        audio: audio
          ? ({
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
              channelCount: 2,
            } as MediaTrackConstraints)
          : false,
      });
      stream?.getTracks().forEach((t) => t.stop());
      setStream(novo);
    } catch (e) {
      if (ehCancelamento(e)) return;
      ui.toast(mensagemDeErro(e), "error");
    } finally {
      setCapturando(false);
    }
  }

  /** Trocar a qualidade com a prévia no ar não recaptura: reconstrange a faixa. */
  function aplicarQualidade(q: ScreenQuality) {
    setQuality(q);
    const faixa = stream?.getVideoTracks()[0];
    const p = SCREEN_QUALITY[q];
    void faixa
      ?.applyConstraints({ width: p.width, height: p.height, frameRate: p.frameRate })
      .catch(() => {
        // fonte que não aceita a restrição: ela vai como está, e é melhor assim
      });
  }

  async function irAoVivo() {
    if (!stream) return;
    publicado.current = true;
    await publicarTela(stream);
    onClose();
  }

  return (
    <Dialog
      title="Compartilhar sua tela"
      onClose={onClose}
      className="w-[640px]"
      footer={
        <>
          <PrimaryButton onClick={() => void irAoVivo()} disabled={!stream}>
            Ao vivo
          </PrimaryButton>
          <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
        </>
      }
    >
      {/*
       * Barra de abas do Discord, medida na print de referência: sulco escuro
       * de 40px com 4px de folga, segmentos de 32px repartindo a largura em
       * partes iguais, canto de 8px por fora e 6px por dentro.
       *
       * A aba ativa é preenchida com a cor do **corpo do modal**, não com uma
       * cor nova: o efeito é o fundo emergindo do sulco, e é isso que dá o
       * relevo sem precisar de borda.
       *
       * Sem acento aqui de propósito. No Discord esta barra não tem cor de
       * marca nenhuma, e o limão deste modal já mora nas pílulas de qualidade e
       * no botão "Ao vivo" — dois acentos na mesma tela enfraquecem os dois.
       */}
      <div
        role="tablist"
        aria-label="Tipo de fonte"
        className="mb-5 flex gap-1 rounded-lg bg-rail p-1"
      >
        {(
          [
            ["aplicativos", "Aplicativos", <AppWindow key="a" size={16} />],
            ["telas", "Telas", <Monitor key="t" size={16} />],
          ] as const
        ).map(([id, rotulo, icone]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={aba === id}
            onClick={() => setAba(id)}
            className={`flex h-8 flex-1 items-center justify-center gap-2 rounded-md text-sm font-medium transition ${
              aba === id
                ? "bg-chat text-txt-primary"
                : "text-txt-secondary hover:bg-hov hover:text-txt-primary"
            }`}
          >
            {icone}
            {rotulo}
          </button>
        ))}
      </div>

      <div className="grid aspect-video w-full place-items-center overflow-hidden rounded-lg bg-rail">
        {stream ? (
          <video ref={video} autoPlay playsInline muted className="h-full w-full object-contain" />
        ) : (
          <div className="flex flex-col items-center gap-3 px-8 text-center">
            <MonitorUp size={32} className="text-txt-muted" aria-hidden="true" />
            <p className="text-sm text-txt-muted">
              {aba === "telas"
                ? "Escolha a tela que todos vão ver. A prévia aparece aqui antes de você ir ao ar."
                : "Escolha a janela que todos vão ver. A prévia aparece aqui antes de você ir ao ar."}
            </p>
            <button
              type="button"
              onClick={() => void capturar(aba)}
              disabled={capturando}
              className="h-9 rounded-[3px] bg-border-strong px-4 text-sm font-medium text-txt-primary transition hover:bg-border-strong-hover disabled:opacity-50"
            >
              {capturando ? "Aguardando…" : aba === "telas" ? "Escolher tela" : "Escolher janela"}
            </button>
          </div>
        )}
      </div>

      {stream && (
        <button
          type="button"
          onClick={() => void capturar(aba)}
          className="mt-2 text-xs text-txt-muted transition hover:text-txt-primary hover:underline"
        >
          Trocar fonte
        </button>
      )}

      <div className="mt-4 space-y-3">
        <Segmento
          rotulo="Resolução"
          opcoes={[
            { valor: "720p", texto: "720p" },
            { valor: "1080p", texto: "1080p" },
            { valor: "1440p", texto: "1440p" },
          ]}
          atual={resolucao}
          onEscolher={(v) => aplicarQualidade(`${v}${fps}` as ScreenQuality)}
        />
        <Segmento
          rotulo="Taxa de quadros"
          opcoes={[
            { valor: "30", texto: "30 fps" },
            { valor: "60", texto: "60 fps" },
          ]}
          atual={fps}
          onEscolher={(v) => aplicarQualidade(`${resolucao}${v}` as ScreenQuality)}
        />
        {/* O custo de subida é a única coisa que o usuário não consegue deduzir
            sozinho, e é o que decide se 1440p vai funcionar na conexão dele. */}
        <p className="text-right text-xs text-txt-muted">
          Usa cerca de {(preset.maxBitrate / 1_000_000).toFixed(1).replace(".", ",")} Mbps da sua
          internet de subida
        </p>
      </div>

      <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-txt-normal">
        <input
          type="checkbox"
          checked={audio}
          onChange={(e) => setAudio(e.target.checked)}
          className="accent-accent"
        />
        Compartilhar áudio do sistema
      </label>
    </Dialog>
  );
}

/** Controle segmentado de uma linha (rótulo à esquerda, opções à direita). */
function Segmento({
  rotulo,
  opcoes,
  atual,
  onEscolher,
}: {
  rotulo: string;
  opcoes: { valor: string; texto: string }[];
  atual: string;
  onEscolher: (valor: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs font-semibold uppercase tracking-[0.02em] text-txt-muted">
        {rotulo}
      </span>
      <div role="group" aria-label={rotulo} className="flex gap-1 rounded-[4px] bg-rail p-1">
        {opcoes.map((o) => (
          <button
            key={o.valor}
            type="button"
            aria-pressed={atual === o.valor}
            onClick={() => onEscolher(o.valor)}
            className={`h-7 rounded-[3px] px-3 text-sm font-medium transition ${
              atual === o.valor
                ? "bg-accent text-accent-ink"
                : "text-txt-muted hover:bg-hov hover:text-txt-primary"
            }`}
          >
            {o.texto}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Cancelar o seletor e ter a permissão bloqueada chegam como o mesmo
 * `NotAllowedError` — só a mensagem distingue. Cancelar é uma decisão, e
 * decisão não vira aviso; bloqueio do sistema é um beco sem saída, e o usuário
 * precisa saber por que nada aconteceu.
 */
function ehCancelamento(e: unknown): boolean {
  if (!(e instanceof DOMException)) return false;
  return e.name === "NotAllowedError" && !/system|policy/i.test(e.message);
}

function mensagemDeErro(e: unknown): string {
  if (e instanceof DOMException) {
    if (e.name === "NotAllowedError") {
      return "O sistema bloqueou a captura de tela. Autorize o navegador nas permissões do sistema.";
    }
    if (e.name === "NotFoundError") return "Nenhuma fonte de captura disponível.";
    if (e.name === "NotReadableError") return "Outro aplicativo está usando essa fonte.";
  }
  return "Não foi possível iniciar o compartilhamento de tela.";
}
