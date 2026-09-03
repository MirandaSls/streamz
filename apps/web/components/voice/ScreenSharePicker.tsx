"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SCREEN_QUALITY, type ScreenQuality } from "@streamz/shared";
import Dialog from "@/components/modals/Dialog";
import { AppWindow, Monitor, MonitorUp } from "@/components/ui/icones";
import {
  capacidadesDeTela,
  fontesDeTela,
  isTauri,
  miniaturasDeTela,
  type CapacidadesDeTela,
} from "@/lib/desktop";
import {
  RESOLUCOES,
  TAXAS,
  estimativaDeBanda,
  fontesDaAba,
  juntarPreset,
  rotuloDaFonte,
  separarPreset,
  type Aba,
  type FonteDeTela,
} from "@/lib/seletor-de-tela";
import { ui } from "@/stores/ui";
import { useVoice } from "@/stores/voice";

/**
 * Seletor de transmissão — o modal do Discord: duas abas no topo
 * ("Aplicativos" e "Tela Inteira", repartindo a largura), a grade de
 * miniaturas ao vivo no corpo e, no rodapé, a qualidade inteira à mostra.
 *
 * **Duas origens para a grade, um visual só.** No app de desktop as fontes
 * vêm do Rust (`fontes_de_tela` + `miniaturas_de_tela`, captura nativa sem a
 * borda amarela) e clicar numa miniatura **já transmite**, como no Discord —
 * não há prévia nem "Ao vivo" para confirmar. No navegador não existe listar
 * janelas (`getDisplayMedia` é uma API de gesto: abre o seletor do próprio
 * navegador e devolve uma captura escolhida), então a aba mostra um botão
 * "Escolher…", a captura vira a única miniatura da grade, e clicar nela vai ao
 * ar.
 *
 * **Qualidade sem etapa.** O alternador SD/HD e a engrenagem viravam uma
 * segunda tela para responder "em que resolução isto vai?" — pergunta que se
 * responde olhando. No lugar deles, dois segmentos sempre visíveis no rodapé
 * (resolução e taxa de quadros, as opções vindas de `SCREEN_QUALITY`), com a
 * estimativa de banda e o áudio do sistema à esquerda, na mesma altura.
 *
 * Medidas do print de referência: modal 955 de largura, barra de abas 40
 * (segmento 32, raio 8 por fora e 6 por dentro), miniatura 440×248 raio 8. Os
 * segmentos do rodapé repetem essa forma, com o acento limão na opção ativa.
 */
export default function ScreenSharePicker({ onClose }: { onClose: () => void }) {
  const [aba, setAba] = useState<Aba>("aplicativos");
  // null = ainda não perguntamos ao desktop; no navegador resolve na hora
  const [capacidades, setCapacidades] = useState<CapacidadesDeTela | null>(
    isTauri() ? null : { nativo: false, backend: null, janelaRecortada: false },
  );
  // captura do navegador à espera do clique (só fora do desktop)
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturando, setCapturando] = useState(false);
  const [iniciando, setIniciando] = useState(false);
  const publicado = useRef(false);

  const quality = useVoice((s) => s.screenQuality);
  const audio = useVoice((s) => s.screenAudio);
  const setQuality = useVoice((s) => s.setScreenQuality);
  const setAudio = useVoice((s) => s.setScreenAudio);
  const publicarTela = useVoice((s) => s.publicarTela);
  const publicarTelaNativa = useVoice((s) => s.publicarTelaNativa);

  useEffect(() => {
    let vivo = true;
    void capacidadesDeTela().then((c) => {
      if (vivo) setCapacidades(c);
    });
    return () => {
      vivo = false;
    };
  }, []);

  // fechar sem ir ao ar não pode deixar a captura viva (o navegador seguiria
  // mostrando "compartilhando" com ninguém do outro lado)
  useEffect(() => {
    return () => {
      if (!publicado.current) stream?.getTracks().forEach((t) => t.stop());
    };
  }, [stream]);

  const nativo = capacidades?.nativo ?? false;

  function aplicarQualidade(q: ScreenQuality) {
    setQuality(q);
    // prévia do navegador no ar: reconstrange a faixa em vez de recapturar
    const faixa = stream?.getVideoTracks()[0];
    const p = SCREEN_QUALITY[q];
    void faixa
      ?.applyConstraints({ width: p.width, height: p.height, frameRate: p.frameRate })
      .catch(() => {
        // fonte que não aceita a restrição: ela vai como está, e é melhor assim
      });
  }

  async function capturarNoNavegador(tipo: Aba) {
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : null;
    if (!md?.getDisplayMedia) {
      ui.toast("Este navegador não permite compartilhar a tela", "error");
      return;
    }
    setCapturando(true);
    const preset = SCREEN_QUALITY[quality];
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

  /** Vai ao ar com uma captura do navegador (janela/tela escolhida, ou câmera). */
  async function irAoVivoCom(captura: MediaStream) {
    if (iniciando) return;
    setIniciando(true);
    publicado.current = true;
    await publicarTela(captura);
    onClose();
  }

  /** Vai ao ar com uma fonte da captura nativa — o clique na miniatura. */
  async function irAoVivoNativo(fonteId: string) {
    if (iniciando) return;
    setIniciando(true);
    await publicarTelaNativa(fonteId);
    // a store avisa o erro em toast; só fecha se de fato foi ao ar
    if (useVoice.getState().screenOn) onClose();
    else setIniciando(false);
  }

  return (
    <Dialog
      title="Compartilhar sua tela"
      onClose={onClose}
      hideHeader
      showClose={false}
      className="h-[560px] w-[955px]"
      bodyClassName="flex flex-col px-[22px] pb-[22px] pt-[21px]"
    >
      <BarraDeAbas aba={aba} onAba={setAba} />

      <div className="-mr-3 mt-6 min-h-0 flex-1 overflow-y-auto pr-3">
        {capacidades === null ? (
          <p className="pt-10 text-center text-sm text-txt-muted">Procurando janelas…</p>
        ) : nativo ? (
          <GradeNativa
            aba={aba}
            aviso={
              aba === "aplicativos" && capacidades.janelaRecortada
                ? "Neste Windows, compartilhar uma janela mostra o que estiver por cima dela."
                : null
            }
            onEscolher={(id) => void irAoVivoNativo(id)}
            iniciando={iniciando}
          />
        ) : (
          <EscolhaDoNavegador
            aba={aba}
            stream={stream}
            capturando={capturando}
            iniciando={iniciando}
            onEscolher={() => void capturarNoNavegador(aba)}
            onIrAoVivo={() => {
              if (stream) void irAoVivoCom(stream);
            }}
          />
        )}
      </div>

      <Rodape
        quality={quality}
        audio={audio}
        onQualidade={aplicarQualidade}
        onAudio={setAudio}
      />
    </Dialog>
  );
}

// ── barra de abas ──────────────────────────────────────────────────────────

/**
 * Barra de abas do Discord, medida na print de referência: sulco escuro de
 * 40px com 4px de folga, segmentos de 32px repartindo a largura em partes
 * iguais, canto de 8px por fora e 6px por dentro. A aba ativa é preenchida
 * com a cor do **corpo do modal**, não com uma cor nova: o efeito é o fundo
 * emergindo do sulco, e é isso que dá o relevo sem precisar de borda. Sem
 * acento aqui de propósito: o limão deste modal mora nas pílulas de qualidade.
 *
 * São duas abas — cada uma com metade da largura (`flex-1`). Câmeras e placas
 * de captura não estão aqui: este modal compartilha *tela*, e a webcam tem o
 * botão dela nos controles da chamada.
 */
function BarraDeAbas({ aba, onAba }: { aba: Aba; onAba: (aba: Aba) => void }) {
  const abas = [
    ["aplicativos", "Aplicativos", <AppWindow key="a" size={20} />],
    ["telas", "Tela Inteira", <Monitor key="t" size={20} />],
  ] as const;
  return (
    <div
      role="tablist"
      aria-label="Tipo de fonte"
      className="flex h-10 shrink-0 gap-1 rounded-lg bg-rail p-1"
    >
      {abas.map(([id, rotulo, icone]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={aba === id}
          onClick={() => onAba(id)}
          className={`flex h-8 flex-1 items-center justify-center gap-2 rounded-md text-sm font-semibold transition ${
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
  );
}

// ── grade nativa (desktop) ─────────────────────────────────────────────────

/** Quanto esperar entre uma varredura de miniaturas e a próxima. */
const PAUSA_ENTRE_VARREDURAS_MS = 400;
/** Relistar janelas (abertas e fechadas desde a última vez) a cada tanto. */
const RELISTAR_MS = 3000;

function GradeNativa({
  aba,
  aviso,
  onEscolher,
  iniciando,
}: {
  aba: Aba;
  aviso: string | null;
  onEscolher: (fonteId: string) => void;
  iniciando: boolean;
}) {
  const [fontes, setFontes] = useState<FonteDeTela[] | null>(null);
  const [miniaturas, setMiniaturas] = useState<Record<string, string>>({});

  useEffect(() => {
    let vivo = true;
    const listar = () =>
      void fontesDeTela().then((f) => {
        if (vivo) setFontes(f);
      });
    listar();
    const timer = setInterval(listar, RELISTAR_MS);
    return () => {
      vivo = false;
      clearInterval(timer);
    };
  }, []);

  const visiveis = useMemo(() => fontesDaAba(fontes ?? [], aba), [fontes, aba]);
  const ids = visiveis.map((f) => f.id).join("\n");

  // Miniaturas ao vivo: a próxima varredura só depois de a anterior voltar —
  // é o ritmo natural, e nunca há duas capturas da mesma janela ao mesmo tempo.
  useEffect(() => {
    if (!ids) return;
    let vivo = true;
    const lista = ids.split("\n");
    void (async () => {
      while (vivo) {
        const resultado = await miniaturasDeTela(lista);
        if (!vivo) return;
        setMiniaturas((atual) => {
          const proximo = { ...atual };
          lista.forEach((id, i) => {
            const m = resultado[i];
            if (m) proximo[id] = m;
          });
          return proximo;
        });
        await new Promise((r) => setTimeout(r, PAUSA_ENTRE_VARREDURAS_MS));
      }
    })();
    return () => {
      vivo = false;
    };
  }, [ids]);

  if (fontes === null) {
    return <p className="pt-10 text-center text-sm text-txt-muted">Procurando janelas…</p>;
  }
  if (visiveis.length === 0) {
    return (
      <EstadoVazio
        icone={aba === "telas" ? <Monitor size={32} /> : <AppWindow size={32} />}
        texto={
          aba === "telas" ? "Nenhuma tela encontrada" : "Nenhuma janela aberta para compartilhar"
        }
      />
    );
  }

  return (
    <div>
      {aviso && <p className="mb-3 text-xs text-txt-muted">{aviso}</p>}
      <div className="grid grid-cols-2 gap-x-4 gap-y-4">
        {visiveis.map((f) => (
          <Miniatura
            key={f.id}
            rotulo={rotuloDaFonte(f)}
            icone={
              f.icone ? (
                // eslint-disable-next-line @next/next/no-img-element -- data URL vinda do Rust
                <img src={f.icone} alt="" className="h-4 w-4 shrink-0 object-contain" />
              ) : f.tipo === "monitor" ? (
                <Monitor size={16} className="shrink-0 text-txt-secondary" />
              ) : (
                <AppWindow size={16} className="shrink-0 text-txt-secondary" />
              )
            }
            onClick={() => onEscolher(f.id)}
            disabled={iniciando}
          >
            {miniaturas[f.id] ? (
              // eslint-disable-next-line @next/next/no-img-element -- quadro ao vivo, data URL
              <img src={miniaturas[f.id]} alt="" className="h-full w-full object-contain" />
            ) : f.icone ? (
              // janela que não deixa capturar (minimizada, conteúdo protegido):
              // o ícone do app no lugar do quadro
              // eslint-disable-next-line @next/next/no-img-element -- data URL vinda do Rust
              <img src={f.icone} alt="" className="h-12 w-12 object-contain" />
            ) : f.tipo === "monitor" ? (
              <Monitor size={48} className="text-txt-muted" />
            ) : (
              <AppWindow size={48} className="text-txt-muted" />
            )}
          </Miniatura>
        ))}
      </div>
    </div>
  );
}

/** Um cartão da grade: quadro 440×248 raio 8 sobre preto, e o nome embaixo. */
function Miniatura({
  rotulo,
  icone,
  onClick,
  disabled,
  children,
}: {
  rotulo: string;
  icone: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex w-[440px] max-w-full flex-col text-left outline-none disabled:cursor-wait"
    >
      <div className="grid h-[248px] w-full place-items-center overflow-hidden rounded-lg bg-black transition group-hover:ring-2 group-hover:ring-border-strong-hover group-focus-visible:ring-2 group-focus-visible:ring-accent">
        {children}
      </div>
      <div className="mt-2 flex h-6 w-full items-center gap-2">
        {icone}
        <span className="truncate text-sm font-semibold text-txt-primary">{rotulo}</span>
      </div>
    </button>
  );
}

function EstadoVazio({ icone, texto }: { icone: ReactNode; texto: string }) {
  return (
    <div className="flex h-full min-h-[248px] flex-col items-center justify-center gap-3 text-txt-muted">
      {icone}
      <p className="text-sm">{texto}</p>
    </div>
  );
}

// ── navegador: o seletor do próprio browser ────────────────────────────────

function EscolhaDoNavegador({
  aba,
  stream,
  capturando,
  iniciando,
  onEscolher,
  onIrAoVivo,
}: {
  aba: Aba;
  stream: MediaStream | null;
  capturando: boolean;
  iniciando: boolean;
  onEscolher: () => void;
  onIrAoVivo: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
  }, [stream]);

  const rotuloDoBotao = aba === "telas" ? "Escolher tela" : "Escolher janela";

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-4">
      {stream && (
        <Miniatura
          rotulo={stream.getVideoTracks()[0]?.label || "Captura do navegador"}
          icone={
            aba === "telas" ? (
              <Monitor size={16} className="shrink-0 text-txt-secondary" />
            ) : (
              <AppWindow size={16} className="shrink-0 text-txt-secondary" />
            )
          }
          onClick={onIrAoVivo}
          disabled={iniciando}
        >
          <video ref={video} autoPlay playsInline muted className="h-full w-full object-contain" />
        </Miniatura>
      )}
      <div className="flex w-[440px] max-w-full flex-col">
        <div className="flex h-[248px] w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-strong px-8 text-center">
          <MonitorUp size={32} className="text-txt-muted" aria-hidden="true" />
          <p className="text-sm text-txt-muted">
            {stream
              ? "Clique na miniatura para ir ao ar, ou escolha outra fonte."
              : aba === "telas"
                ? "O navegador abre o seletor de telas; a escolhida aparece aqui."
                : "O navegador abre o seletor de janelas; a escolhida aparece aqui."}
          </p>
          <button
            type="button"
            onClick={onEscolher}
            disabled={capturando || iniciando}
            className="h-9 rounded-[3px] bg-border-strong px-4 text-sm font-medium text-txt-primary transition hover:bg-border-strong-hover disabled:opacity-50"
          >
            {capturando ? "Aguardando…" : stream ? "Trocar fonte" : rotuloDoBotao}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── rodapé ─────────────────────────────────────────────────────────────────

/**
 * Rodapé de 40px, a mesma faixa de antes: à esquerda o áudio do sistema e o
 * custo de subida em duas linhas; à direita os dois seletores de qualidade,
 * lado a lado e sempre visíveis. O que era pílula SD/HD + engrenagem (e uma
 * segunda tela atrás dela) cabe aqui sem crescer o modal.
 */
function Rodape({
  quality,
  audio,
  onQualidade,
  onAudio,
}: {
  quality: ScreenQuality;
  audio: boolean;
  onQualidade: (q: ScreenQuality) => void;
  onAudio: (on: boolean) => void;
}) {
  const { resolucao, fps } = separarPreset(quality);
  return (
    <div className="mt-5 flex h-10 shrink-0 items-center justify-between gap-6">
      <div className="min-w-0">
        {/* No desktop o som vem do loopback do Windows (tudo o que está
            tocando); no navegador, do que o seletor do browser permitir. */}
        <label className="flex w-max cursor-pointer items-center gap-2 text-sm leading-5 text-txt-normal">
          <input
            type="checkbox"
            checked={audio}
            onChange={(e) => onAudio(e.target.checked)}
            className="accent-accent"
          />
          Compartilhar áudio do sistema
        </label>
        {/* O custo de subida é a única coisa que o usuário não consegue deduzir
            sozinho, e é o que decide se 1440p vai funcionar na conexão dele. */}
        <p className="truncate text-xs leading-4 text-txt-muted">
          Usa cerca de {estimativaDeBanda(quality)} da sua internet de subida
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-4">
        <Segmento
          rotulo="Resolução"
          opcoes={RESOLUCOES.map((r) => ({ valor: r, texto: r }))}
          atual={resolucao}
          onEscolher={(v) => onQualidade(juntarPreset(v, fps))}
        />
        <Segmento
          rotulo="Taxa de quadros"
          opcoes={TAXAS.map((f) => ({ valor: f, texto: `${f} fps` }))}
          atual={fps}
          onEscolher={(v) => onQualidade(juntarPreset(resolucao, v))}
        />
      </div>
    </div>
  );
}

/**
 * Controle segmentado de uma linha (rótulo à esquerda, opções à direita), na
 * mesma forma da barra de abas: sulco de 40px raio 8, segmentos de 32px. Dois
 * deles cabem lado a lado no rodapé; o rótulo em versalete é o que os separa
 * sem precisar de moldura.
 */
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
    <div className="flex items-center gap-2">
      <span className="whitespace-nowrap text-xs font-semibold uppercase tracking-[0.02em] text-txt-muted">
        {rotulo}
      </span>
      <div role="group" aria-label={rotulo} className="flex h-10 gap-1 rounded-lg bg-rail p-1">
        {opcoes.map((o) => (
          <button
            key={o.valor}
            type="button"
            aria-pressed={atual === o.valor}
            onClick={() => onEscolher(o.valor)}
            className={`h-8 rounded-md px-3 text-sm font-semibold transition ${
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
