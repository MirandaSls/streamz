"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ScreenQuality } from "@streamz/shared";
import Dialog from "@/components/modals/Dialog";
import { ehMobileAgora } from "@/hooks/useEhMobile";
import { AppWindow, Monitor } from "@/components/ui/icones";
import { Checkbox } from "@/components/ui/primitivos";
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
 * **Medidas** (prints `2026-08-31 123946` e `124000`, janela do Discord de
 * 1283×718, conferidas 1:1 pelo avatar de 32 da lista de DMs, pela rail de
 * 40+10 e pela barra de tarefas de 48 do print de tela cheia — nenhum fator de
 * escala): modal 960×606 = **75% da largura e 85% da altura da janela**; barra
 * de abas 40 (segmento 32, raio 8 por fora e 6 por dentro); grade de
 * **auto-fill** com miniatura mínima de 300, 16 entre colunas, quadro 16:9 raio
 * 8 (440×247 nas duas colunas daquela janela) e o nome logo abaixo com ícone de
 * 16; padding de 24 em volta, 24 entre as abas e a grade.
 *
 * Por isso a grade aqui **não é de duas colunas fixas**: numa janela de 1283 dá
 * 2×441 como no print, e numa de 1920 dá 4×322 — as miniaturas menores
 * que o usuário vê no Discord dele. O modal acompanha (75vw/85vh) com teto de
 * 1400×888, que é o maior modal do Discord já medido aqui (janela de
 * configurações, prints `2026-09-01 1143–1146`, janela de 1920×1032), e piso de
 * 880 para o rodapé não quebrar — o piso é nosso, não medido.
 *
 * Os segmentos do rodapé repetem a forma das abas, com o acento limão na opção
 * ativa.
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
  const prepararTelaNativa = useVoice((s) => s.prepararTelaNativa);
  const descartarTelaNativa = useVoice((s) => s.descartarTelaNativa);

  useEffect(() => {
    let vivo = true;
    void capacidadesDeTela().then((c) => {
      if (vivo) setCapacidades(c);
    });
    return () => {
      vivo = false;
    };
  }, []);

  /**
   * O `#tela` entra na sala **agora**, sem publicar nada, e o clique na
   * miniatura só terá de publicar. O handshake do LiveKit (mais o
   * `POST /tela-token`) é a etapa mais cara de ir ao ar, e ela não depende da
   * fonte escolhida: pagá-la enquanto o usuário olha a grade é tempo que ele
   * já ia gastar. Ver `prepararTelaNativa` na store.
   */
  useEffect(() => {
    if (!capacidades?.nativo) return;
    void prepararTelaNativa();
  }, [capacidades?.nativo, prepararTelaNativa]);

  // Fechou sem escolher: o `#tela` não pode ficar na sala sem publicar nada.
  // Se foi ao ar, a conexão virou a transmissão e não há o que descartar.
  useEffect(
    () => () => {
      if (!useVoice.getState().screenOn) void descartarTelaNativa();
    },
    [descartarTelaNativa],
  );

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
      /*
        O × existe **no celular**: sem cabeçalho e sem ele, a única saída é o
        toque no véu, que numa caixa que ocupa quase a tela inteira é uma faixa
        estreita — e não há tecla Esc num telefone. No computador segue sem ×,
        como estava (o Esc e o clique fora bastam, e o print do Discord não tem).
      */
      showClose={ehMobileAgora()}
      className="h-[888px] w-[min(1400px,max(75vw,880px))]"
      bodyClassName="flex flex-col px-6 pb-6 pt-6"
    >
      <BarraDeAbas aba={aba} onAba={setAba} />

      <div className="mt-6 min-h-0 flex-1 overflow-y-auto pr-4">
        {capacidades === null ? (
          <p className="pt-10 text-center text-sm text-text-muted">Procurando janelas…</p>
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
      className="flex h-10 shrink-0 gap-1 rounded-lg bg-input-background-default p-1"
    >
      {abas.map(([id, rotulo, icone]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={aba === id}
          onClick={() => onAba(id)}
          // Anel de foco azul (`border-focus`), o mesmo token dos primitivos
          // (`Tabs`, `Checkbox`, `Radio`) — estava faltando aqui: a barra era
          // navegável por teclado sem nenhuma marca visível de onde o foco
          // estava.
          className={`flex h-8 flex-1 items-center justify-center gap-2 rounded-md text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus ${
            aba === id
              ? "bg-background-base-lower text-text-strong"
              : "text-text-subtle hover:bg-interactive-background-hover hover:text-text-strong"
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
    // Parar de relistar enquanto a transmissão começa: enumerar janelas abre e
    // decodifica o ícone de cada executável, e nesse instante toda a máquina
    // deveria estar servindo a captura que acabou de ser pedida. A lista que
    // já está na tela continua desenhada — nada some.
    if (iniciando) return;
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
  }, [iniciando]);

  const visiveis = useMemo(() => fontesDaAba(fontes ?? [], aba), [fontes, aba]);
  const ids = visiveis.map((f) => f.id).join("\n");

  // Miniaturas ao vivo: a próxima varredura só depois de a anterior voltar —
  // é o ritmo natural, e nunca há duas capturas da mesma janela ao mesmo tempo.
  //
  // **`iniciando` para o laço**, e isso é metade da correção do atraso. Este
  // modal só fecha depois de a transmissão ir ao ar, então antes o laço
  // continuava varrendo durante todo o início da captura definitiva: uma
  // sessão de captura por janela, inclusive na janela recém-escolhida,
  // disputando o mesmo alvo com quem estava tentando transmitir. (O Rust
  // também se defende sozinho — ver `SemMiniaturas` em `tela/mod.rs` —, mas
  // não pedir é mais barato que cancelar.)
  useEffect(() => {
    if (!ids || iniciando) return;
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
  }, [ids, iniciando]);

  if (fontes === null) {
    return <p className="pt-10 text-center text-sm text-text-muted">Procurando janelas…</p>;
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
      {aviso && <p className="mb-3 text-xs text-text-muted">{aviso}</p>}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-x-4 gap-y-4">
        {visiveis.map((f) => (
          <Miniatura
            key={f.id}
            rotulo={rotuloDaFonte(f)}
            icone={
              f.icone ? (
                // eslint-disable-next-line @next/next/no-img-element -- data URL vinda do Rust
                <img src={f.icone} alt="" className="h-4 w-4 shrink-0 object-contain" />
              ) : f.tipo === "monitor" ? (
                <Monitor size={16} className="shrink-0 text-text-subtle" />
              ) : (
                <AppWindow size={16} className="shrink-0 text-text-subtle" />
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
              <Monitor size={48} className="text-text-muted" />
            ) : (
              <AppWindow size={48} className="text-text-muted" />
            )}
          </Miniatura>
        ))}
      </div>
    </div>
  );
}

/**
 * Um cartão da grade: quadro 16:9 raio 8 sobre preto, e o nome embaixo com o
 * ícone de 16. A largura vem da coluna (`auto-fill`), não de um número fixo —
 * era o `w-[440px]` que deixava a miniatura grande demais em janela larga.
 */
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
      className="group flex w-full flex-col text-left outline-none disabled:cursor-wait"
    >
      {/* Anel de foco azul (`border-focus`), não limão: no Discord o anel de
          foco de teclado não é marca (ADR-0009 §3.2, `design.md` "Link, anel
          de foco de teclado e cores ANSI continuam azuis"). Só o hover do
          mouse usa `border-strong`, a mesma vizinhança neutra do resto do
          seletor. */}
      <div className="grid aspect-video w-full place-items-center overflow-hidden rounded-lg bg-black transition group-hover:ring-2 group-hover:ring-border-strong group-focus-visible:ring-2 group-focus-visible:ring-border-focus">
        {children}
      </div>
      <div className="mt-2 flex h-6 w-full items-center gap-2">
        {icone}
        <span className="truncate text-sm font-semibold text-text-strong">{rotulo}</span>
      </div>
    </button>
  );
}

function EstadoVazio({ icone, texto }: { icone: ReactNode; texto: string }) {
  return (
    <div className="flex h-full min-h-[248px] flex-col items-center justify-center gap-3 text-text-muted">
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
        <Checkbox marcado={audio} aoMudar={onAudio} rotulo="Compartilhar áudio do sistema" />
        {/* O custo de subida é a única coisa que o usuário não consegue deduzir
            sozinho, e é o que decide se 1440p vai funcionar na conexão dele. */}
        <p className="truncate text-xs leading-4 text-text-muted">
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
