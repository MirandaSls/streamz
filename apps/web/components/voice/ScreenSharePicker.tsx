"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ScreenQuality } from "@streamz/shared";
import Dialog from "@/components/modals/Dialog";
import { AppWindow, Monitor } from "@/components/ui/icones";
import { SegmentosDeQualidade } from "@/components/voice/qualidade-de-tela";
import {
  capacidadesDeTela,
  fontesDeTela,
  miniaturasDeTela,
  type CapacidadesDeTela,
} from "@/lib/desktop";
import {
  estimativaDeBanda,
  fontesDaAba,
  rotuloDaFonte,
  type Aba,
  type FonteDeTela,
} from "@/lib/seletor-de-tela";
import { useVoice } from "@/stores/voice";

/**
 * Seletor de transmissão do **desktop** — o modal do Discord: duas abas no topo
 * ("Aplicativos" e "Tela Inteira", repartindo a largura), a grade de
 * miniaturas ao vivo no corpo e, no rodapé, a qualidade inteira à mostra.
 *
 * **Só no app de desktop.** As fontes vêm do Rust (`fontes_de_tela` +
 * `miniaturas_de_tela`, captura nativa sem a borda amarela) e clicar numa
 * miniatura **já transmite**, como no Discord — não há prévia nem "Ao vivo"
 * para confirmar. No navegador este modal não abre: lá não existe listar
 * janelas (`getDisplayMedia` é uma API de gesto, com seletor próprio do
 * browser), e o modal virava um passo a mais antes do diálogo que decide de
 * verdade — `ScreenShareButton` chama a captura direto, e a qualidade mora na
 * aba Voz das configurações.
 *
 * **Qualidade sem etapa.** O alternador SD/HD e a engrenagem viravam uma
 * segunda tela para responder "em que resolução isto vai?" — pergunta que se
 * responde olhando. No lugar deles, dois segmentos sempre visíveis no rodapé
 * (`SegmentosDeQualidade`, os mesmos das configurações), com a estimativa de
 * banda e o áudio do sistema à esquerda, na mesma altura.
 *
 * Medidas do print de referência: modal 955 de largura, barra de abas 40
 * (segmento 32, raio 8 por fora e 6 por dentro), miniatura 440×248 raio 8. Os
 * segmentos do rodapé repetem essa forma, com o acento limão na opção ativa.
 */
export default function ScreenSharePicker({ onClose }: { onClose: () => void }) {
  const [aba, setAba] = useState<Aba>("aplicativos");
  // null = ainda não perguntamos ao Rust
  const [capacidades, setCapacidades] = useState<CapacidadesDeTela | null>(null);
  const [iniciando, setIniciando] = useState(false);

  const quality = useVoice((s) => s.screenQuality);
  const audio = useVoice((s) => s.screenAudio);
  const setQuality = useVoice((s) => s.setScreenQuality);
  const setAudio = useVoice((s) => s.setScreenAudio);
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
        ) : capacidades.nativo ? (
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
          // O Rust respondeu que não sabe capturar aqui (backend ausente ou o
          // comando falhou). Sem grade não há o que clicar, e dizer isso é
          // melhor do que um modal vazio.
          <EstadoVazio
            icone={<Monitor size={32} />}
            texto="A captura de tela não está disponível neste sistema"
          />
        )}
      </div>

      <Rodape quality={quality} audio={audio} onQualidade={setQuality} onAudio={setAudio} />
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
  return (
    <div className="mt-5 flex h-10 shrink-0 items-center justify-between gap-6">
      <div className="min-w-0">
        {/* O som vem do loopback do Windows (tudo o que está tocando), pelo
            WASAPI do Rust — não da fonte escolhida. */}
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

      <SegmentosDeQualidade
        quality={quality}
        onQualidade={onQualidade}
        className="flex shrink-0 items-center gap-4"
      />
    </div>
  );
}
