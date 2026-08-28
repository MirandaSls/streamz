"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  ALTURA_MIN,
  PROPORCAO_PADRAO,
  PROPORCAO_TRANSMISSAO,
  alturaDoPalco,
  proporcaoDaAlturaAntiga,
  reservaDoChat,
  tetoDoPalco,
} from "@/components/voice/call-split-layout";
import { useVoice } from "@/stores/voice";

/**
 * Chamada em cima, conversa embaixo — a divisão do Discord quando voz e texto
 * dividem a mesma coluna (canal de voz de servidor e chamada em conversa).
 *
 * Empilhar, e não pôr lado a lado, é o que preserva a timeline: uma coluna de
 * conversa espremida ao lado do palco reflui toda mensagem com anexo e quebra o
 * ritmo de leitura, enquanto o palco só precisa de altura.
 *
 * A altura é arrastável e lembrada entre sessões porque a proporção certa é a
 * do uso, não a da chamada: quem assiste a uma transmissão quer o palco grande,
 * quem conversa quer o contrário, e essa escolha não muda a cada call.
 *
 * **Tudo aqui é proporção da coluna, não pixel.** Antes eram três constantes
 * absolutas, e o resultado é que a tela maior não dava mais palco: dava mais
 * chat. Num notebook o palco ficava com 56% da coluna e num monitor de 27" com
 * 34%, entregando à transmissão os mesmos poucos pixels nos dois. Os pixels que
 * sobraram são só piso de segurança. É o mesmo princípio do `grid-layout.ts`:
 * calcular a partir da área disponível em vez de tabelar breakpoints.
 *
 * A tela cheia (ver `fullscreen.ts`) não tem nada a ver com esta divisão: o
 * elemento em tela cheia é promovido pelo compositor e ignora a altura daqui.
 */

/** Enquanto a coluna não foi medida (primeiro quadro, SSR): evita salto visível. */
const ALTURA_ANTES_DE_MEDIR = 420;
const PASSO_TECLADO = 24;

/** Proporção 0–1 da coluna. */
const CHAVE_PROPORCAO = "streamz:proporcao-chamada";
/** Chave antiga, em PIXEL absoluto — migrada na primeira medição. */
const CHAVE_ALTURA_ANTIGA = "streamz:altura-chamada";

function lerProporcao(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const n = Number(window.localStorage?.getItem(CHAVE_PROPORCAO));
    return Number.isFinite(n) && n > 0 && n < 1 ? n : null;
  } catch {
    return null;
  }
}

/** Lê e consome a altura em pixel da versão antiga, se houver. */
function migrarAlturaAntiga(disponivel: number): number | null {
  if (typeof window === "undefined") return null;
  try {
    const bruto = window.localStorage?.getItem(CHAVE_ALTURA_ANTIGA);
    if (!bruto) return null;
    window.localStorage?.removeItem(CHAVE_ALTURA_ANTIGA);
    return proporcaoDaAlturaAntiga(Number(bruto), disponivel);
  } catch {
    return null;
  }
}

function guardarProporcao(proporcao: number) {
  try {
    window.localStorage?.setItem(CHAVE_PROPORCAO, proporcao.toFixed(4));
  } catch {
    // storage indisponível: a proporção vale só nesta sessão
  }
}

export default function CallSplit({ chamada, chat }: { chamada: ReactNode; chat: ReactNode }) {
  const raiz = useRef<HTMLDivElement>(null);
  /** Altura real da coluna; recalculada a cada mudança de tamanho, não só na montagem. */
  const [disponivel, setDisponivel] = useState(0);
  const [proporcao, setProporcao] = useState<number | null>(null);

  // alguém transmitindo pede palco maior — mas só decide a proporção INICIAL:
  // quem já arrastou o divisor mandou, e ligar uma transmissão não pode
  // desfazer a escolha da pessoa
  const transmitindo = useVoice((s) => {
    const id = s.channelId;
    return !!id && (s.states[id] ?? []).some((e) => e.screen);
  });
  const transmitindoRef = useRef(transmitindo);
  transmitindoRef.current = transmitindo;

  // a coluna muda de tamanho com a janela, com o abrir/fechar de painéis e no
  // zoom do navegador: medir só na montagem era o que congelava o palco no
  // tamanho da primeira renderização
  useEffect(() => {
    const el = raiz.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entrada]) => setDisponivel(entrada.contentRect.height));
    ro.observe(el);
    setDisponivel(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  // a preferência só existe no browser: decidir depois da primeira medição
  // evita que o HTML do servidor e o da hidratação discordem
  useEffect(() => {
    if (proporcao !== null || disponivel <= 0) return;
    setProporcao(
      lerProporcao() ??
        migrarAlturaAntiga(disponivel) ??
        (transmitindoRef.current ? PROPORCAO_TRANSMISSAO : PROPORCAO_PADRAO),
    );
  }, [disponivel, proporcao]);

  const disponivelRef = useRef(disponivel);
  disponivelRef.current = disponivel;

  const altura =
    disponivel > 0 && proporcao !== null
      ? alturaDoPalco(proporcao, disponivel)
      : ALTURA_ANTES_DE_MEDIR;

  /** Grava a nova altura como fração da coluna — é isso que viaja entre telas. */
  const aplicarAltura = useCallback((px: number, persistir: boolean) => {
    const total = disponivelRef.current;
    if (total <= 0) return;
    const nova = alturaDoPalco(px / total, total) / total;
    setProporcao(nova);
    if (persistir) guardarProporcao(nova);
  }, []);

  const comecarArraste = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const topo = raiz.current?.getBoundingClientRect().top ?? 0;
      const mover = (ev: PointerEvent) => aplicarAltura(ev.clientY - topo, false);
      const soltar = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", mover);
        window.removeEventListener("pointerup", soltar);
        document.body.style.cursor = "";
        aplicarAltura(ev.clientY - topo, true);
      };
      document.body.style.cursor = "row-resize";
      window.addEventListener("pointermove", mover);
      window.addEventListener("pointerup", soltar);
    },
    [aplicarAltura],
  );

  const pelasTeclas = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      const delta = e.key === "ArrowUp" ? -PASSO_TECLADO : e.key === "ArrowDown" ? PASSO_TECLADO : 0;
      if (delta === 0) return;
      e.preventDefault();
      aplicarAltura(altura + delta, true);
    },
    [altura, aplicarAltura],
  );

  return (
    <div ref={raiz} className="flex min-h-0 min-w-0 flex-1 flex-col bg-chat">
      <div
        // o `maxHeight` em CSS cobre o quadro entre a coluna encolher e o
        // observador reagir: sem ele a altura de uma tela grande engoliria o
        // chat por um instante
        style={{ height: altura, maxHeight: `calc(100% - ${Math.round(reservaDoChat(disponivel || ALTURA_ANTES_DE_MEDIR))}px)` }}
        className="relative flex min-h-0 shrink-0 flex-col"
      >
        {chamada}
      </div>

      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Redimensionar a chamada"
        aria-valuenow={Math.round(altura)}
        aria-valuemin={ALTURA_MIN}
        aria-valuemax={Math.round(tetoDoPalco(disponivel || ALTURA_ANTES_DE_MEDIR))}
        tabIndex={0}
        onPointerDown={comecarArraste}
        onKeyDown={pelasTeclas}
        className="h-px shrink-0 cursor-row-resize border-y-2 border-transparent bg-border bg-clip-content transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{chat}</div>
    </div>
  );
}
