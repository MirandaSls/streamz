"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SCREEN_QUALITY, type ScreenQuality } from "@streamz/shared";
import Dialog from "@/components/modals/Dialog";
import { ehMobileAgora } from "@/hooks/useEhMobile";
import { AppWindow, Monitor, MonitorUp } from "@/components/ui/icones";
import { Button, Checkbox } from "@/components/ui/primitivos";
import { SegmentosDeQualidade } from "@/components/voice/qualidade-de-tela";
import { capturarTelaNoNavegador, suportaCapturaDeTela } from "@/lib/captura-de-tela";
import {
  capacidadesDeTela,
  fontesDeTela,
  isTauri,
  miniaturasDeTela,
  type CapacidadesDeTela,
} from "@/lib/desktop";
import {
  ehCancelamento,
  estimativaDeBanda,
  fontesDaAba,
  mensagemDeErro,
  rotuloDaFonte,
  type Aba,
  type FonteDeTela,
} from "@/lib/seletor-de-tela";
import { ui } from "@/stores/ui";
import { useVoice } from "@/stores/voice";

/**
 * Seletor de transmissão — o modal do Discord: duas abas no topo
 * ("Aplicativos" e "Tela Inteira", repartindo a largura), a grade de
 * miniaturas no corpo e, no rodapé, a qualidade inteira à mostra.
 *
 * **Duas origens para a grade, um modal só.**
 *
 * - No **app de desktop** as fontes vêm do Rust (`fontes_de_tela` +
 *   `miniaturas_de_tela`, captura nativa sem a borda amarela) e clicar numa
 *   miniatura **já transmite**, como no Discord — não há prévia nem "Ao vivo"
 *   para confirmar.
 * - No **navegador** uma página **não pode** listar telas e janelas: a única
 *   API que enumera é `getDisplayMedia`, e ela abre o diálogo do próprio
 *   browser/sistema, dentro do gesto do usuário. Isso não tem contorno, e o
 *   Discord web passa pelo mesmo — na print `p2` quem avisa "O discord.com
 *   está compartilhando sua tela" é a barra do Chrome, não o Discord. Então o
 *   que este modal faz aqui é o que ele pode fazer: decidir **qualidade, taxa
 *   de quadros e áudio do sistema** antes, dar a dica de qual painel do
 *   diálogo abrir (a aba escolhida vira `displaySurface`) e receber de volta a
 *   captura como a única miniatura da grade, que é onde se clica para ir ao
 *   ar. **O diálogo do navegador continua existindo** — nenhuma linha daqui o
 *   faz sumir.
 *
 * **Qualidade sem etapa.** O alternador SD/HD e a engrenagem viravam uma
 * segunda tela para responder "em que resolução isto vai?" — pergunta que se
 * responde olhando. No lugar deles, dois segmentos sempre visíveis no rodapé
 * (`SegmentosDeQualidade`, os mesmos das configurações), com a estimativa de
 * banda e o áudio do sistema à esquerda, na mesma altura. Os mesmos segmentos
 * seguem na aba Voz das configurações porque este modal só existe **antes** de
 * ir ao ar: com a transmissão no ar, trocar o preset só tem lugar lá.
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
 * **Sem a grade nativa o modal é menor** (955×560, a medida que ele tinha antes
 * da grade de auto-fill): no navegador o corpo são dois cartões, e o modal
 * grande virava moldura vazia em volta deles.
 *
 * Os segmentos do rodapé repetem a forma das abas, com o acento limão na opção
 * ativa.
 */
export default function ScreenSharePicker({ onClose }: { onClose: () => void }) {
  const [aba, setAba] = useState<Aba>("aplicativos");
  // null = ainda não perguntamos ao Rust; fora do Tauri a resposta é sabida na
  // hora, e assim o modal já nasce no tamanho certo em vez de encolher depois
  const [capacidades, setCapacidades] = useState<CapacidadesDeTela | null>(
    isTauri()
      ? null
      : {
          nativo: false,
          backend: null,
          janelaRecortada: false,
          audioDoSistema: false,
          permissao: "naoPrecisa",
        },
  );
  // captura do navegador à espera do clique (só fora da captura nativa)
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

  const nativo = capacidades?.nativo ?? false;

  /**
   * O `#tela` entra na sala **agora**, sem publicar nada, e o clique na
   * miniatura só terá de publicar. O handshake do LiveKit (mais o
   * `POST /tela-token`) é a etapa mais cara de ir ao ar, e ela não depende da
   * fonte escolhida: pagá-la enquanto o usuário olha a grade é tempo que ele
   * já ia gastar. Ver `prepararTelaNativa` na store.
   */
  useEffect(() => {
    if (!nativo) return;
    void prepararTelaNativa();
  }, [nativo, prepararTelaNativa]);

  // Fechou sem escolher: o `#tela` não pode ficar na sala sem publicar nada.
  // Se foi ao ar, a conexão virou a transmissão e não há o que descartar.
  useEffect(() => {
    if (!nativo) return;
    return () => {
      if (!useVoice.getState().screenOn) void descartarTelaNativa();
    };
  }, [nativo, descartarTelaNativa]);

  // Fechar sem ir ao ar também não pode deixar a captura do navegador viva: o
  // browser seguiria mostrando "compartilhando" com ninguém do outro lado.
  useEffect(
    () => () => {
      if (!publicado.current) stream?.getTracks().forEach((t) => t.stop());
    },
    [stream],
  );

  function aplicarQualidade(q: ScreenQuality) {
    setQuality(q);
    // prévia do navegador no ar: reconstrange a faixa em vez de recapturar
    // (recapturar reabriria o diálogo, e a escolha já foi feita)
    const faixa = stream?.getVideoTracks()[0];
    const p = SCREEN_QUALITY[q];
    void faixa
      ?.applyConstraints({ width: p.width, height: p.height, frameRate: p.frameRate })
      .catch(() => {
        // fonte que não aceita a restrição: ela vai como está, e é melhor assim
      });
  }

  /**
   * Abre o diálogo do navegador. Chamada **direto do clique**: nenhum `await`
   * a precede, porque `getDisplayMedia` só vale dentro do gesto do usuário.
   */
  async function capturarNoNavegador(tipo: Aba) {
    setCapturando(true);
    try {
      const novo = await capturarTelaNoNavegador(quality, audio, tipo);
      if (!novo) {
        ui.toast("Este navegador não permite compartilhar a tela", "error");
        return;
      }
      stream?.getTracks().forEach((t) => t.stop());
      setStream(novo);
    } catch (e) {
      // cancelar o diálogo é uma decisão, não um erro: nada acontece, sem aviso
      if (!ehCancelamento(e)) ui.toast(mensagemDeErro(e), "error");
    } finally {
      setCapturando(false);
    }
  }

  /** Vai ao ar com a captura que o diálogo do navegador devolveu. */
  async function irAoVivoCom(captura: MediaStream) {
    if (iniciando) return;
    setIniciando(true);
    publicado.current = true;
    await publicarTela(captura);
    // a store avisa o erro em toast e já encerra as faixas; só fecha se foi ao ar
    if (useVoice.getState().screenOn) onClose();
    else {
      publicado.current = false;
      setStream(null);
      setIniciando(false);
    }
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
      /*
        O × existe **no celular**: sem cabeçalho e sem ele, a única saída é o
        toque no véu, que numa caixa que ocupa quase a tela inteira é uma faixa
        estreita — e não há tecla Esc num telefone. No computador segue sem ×,
        como estava (o Esc e o clique fora bastam, e o print do Discord não tem).
      */
      showClose={ehMobileAgora()}
      className={
        // a grade nativa pede o modal medido; a escolha do navegador são dois
        // cartões, e cabe nos 955×560 de sempre
        capacidades === null || nativo
          ? "h-[888px] w-[min(1400px,max(75vw,880px))]"
          : "h-[560px] w-[955px]"
      }
      bodyClassName="flex flex-col px-6 pb-6 pt-6"
    >
      <BarraDeAbas aba={aba} onAba={setAba} />

      <div className="mt-6 min-h-0 flex-1 overflow-y-auto pr-4">
        {capacidades === null ? (
          <p className="pt-10 text-center text-sm text-text-muted">Procurando janelas…</p>
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
        ) : suportaCapturaDeTela() ? (
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
        ) : (
          // Nem captura nativa (o Rust disse que não sabe, ou não estamos no
          // app) nem `getDisplayMedia`: não há como capturar nada aqui, e
          // dizer isso é melhor do que um modal vazio.
          <EstadoVazio
            icone={<Monitor size={32} />}
            texto="A captura de tela não está disponível neste sistema"
          />
        )}
      </div>

      <Rodape quality={quality} audio={audio} onQualidade={aplicarQualidade} onAudio={setAudio} />
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
      <Grade>
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
      </Grade>
    </div>
  );
}

/** A grade de `auto-fill` do corpo, a mesma nas duas origens. */
function Grade({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-x-4 gap-y-4">
      {children}
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

// ── navegador: o seletor do próprio browser ────────────────────────────────

/**
 * O corpo do modal no navegador: um cartão que abre o diálogo do browser e,
 * quando ele volta com uma captura, a miniatura dela ao lado — clicar nela é
 * o "ir ao ar".
 *
 * O cartão existe porque a lista de janelas **não é nossa** e não pode ser:
 * `getDisplayMedia` é a única API que enumera, ela só responde dentro do gesto
 * do usuário e devolve já uma fonte escolhida. O que sobra para nós é o que
 * está nesta tela — as abas (que viram a dica `displaySurface`), a qualidade e
 * o áudio do rodapé — e o texto do cartão diz isso em voz alta, para o diálogo
 * do sistema não parecer um acidente.
 */
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
    <Grade>
      {stream && (
        <Miniatura
          rotulo={stream.getVideoTracks()[0]?.label || "Captura do navegador"}
          icone={
            aba === "telas" ? (
              <Monitor size={16} className="shrink-0 text-text-subtle" />
            ) : (
              <AppWindow size={16} className="shrink-0 text-text-subtle" />
            )
          }
          onClick={onIrAoVivo}
          disabled={iniciando}
        >
          <video ref={video} autoPlay playsInline muted className="h-full w-full object-contain" />
        </Miniatura>
      )}
      <div className="flex w-full flex-col">
        <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-strong px-8 text-center">
          <MonitorUp size={32} className="text-text-muted" aria-hidden="true" />
          <p className="text-sm text-text-muted">
            {stream
              ? "Clique na miniatura para ir ao ar, ou escolha outra fonte."
              : aba === "telas"
                ? "O navegador abre o seletor de telas; a escolhida aparece aqui."
                : "O navegador abre o seletor de janelas; a escolhida aparece aqui."}
          </p>
          <Button
            variante="secundario"
            tamanho="sm"
            onClick={onEscolher}
            disabled={capturando || iniciando}
          >
            {capturando ? "Aguardando…" : stream ? "Trocar fonte" : rotuloDoBotao}
          </Button>
        </div>
        {/* espelha a linha do nome da miniatura, para os dois cartões da
            grade terminarem na mesma altura */}
        <div className="mt-2 h-6" aria-hidden="true" />
      </div>
    </Grade>
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
        {/* No desktop o som vem do loopback do Windows (tudo o que está
            tocando), pelo WASAPI do Rust — não da fonte escolhida. No
            navegador ele é um **pedido**: quem decide é a caixa "compartilhar
            áudio" do diálogo do browser, que só existe para aba e tela
            inteira. */}
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
