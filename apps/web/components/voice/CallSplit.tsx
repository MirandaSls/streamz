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
import PainelDeChatDaCall from "@/components/voice/PainelDeChatDaCall";
import {
  LARGURA_MIN,
  LARGURA_PADRAO,
  larguraDoChat,
  larguraGuardavel,
  tetoDoChat,
} from "@/components/voice/call-split-layout";

/**
 * Chamada à esquerda, conversa à direita — a divisão do Discord quando voz e
 * texto dividem a mesma coluna (chamada em conversa direta).
 *
 * **Era empilhado, e estava errado.** Palco em cima e conversa embaixo dava ao
 * palco uma faixa de ~215px: uma transmissão em 16:9 virava miniatura, e a
 * timeline virava tira. Na print `2026-09-03 203909` o Discord põe a conversa
 * numa coluna de 450 à direita e deixa o palco com toda a altura da janela —
 * que é o que uma call precisa, porque tile é uma área e não uma linha.
 *
 * A largura é arrastável e lembrada entre sessões: a proporção certa é a do
 * uso, não a da chamada. Guardada em pixel (ver `call-split-layout.ts`).
 *
 * A tela cheia (ver `fullscreen.ts`) não tem nada a ver com esta divisão: o
 * elemento em tela cheia é promovido pelo compositor e ignora a largura daqui.
 */

const PASSO_TECLADO = 24;

/** Largura da conversa, em pixel. */
const CHAVE_LARGURA = "streamz:largura-chamada";
/** Chaves da divisão vertical antiga — lidas só para serem apagadas. */
const CHAVES_MORTAS = ["streamz:proporcao-chamada", "streamz:altura-chamada"];

function lerLargura(): number | null {
  if (typeof window === "undefined") return null;
  try {
    for (const morta of CHAVES_MORTAS) window.localStorage?.removeItem(morta);
    const bruto = window.localStorage?.getItem(CHAVE_LARGURA);
    return bruto === null || bruto === undefined ? null : larguraGuardavel(Number(bruto));
  } catch {
    return null;
  }
}

function guardarLargura(px: number) {
  try {
    window.localStorage?.setItem(CHAVE_LARGURA, String(Math.round(px)));
  } catch {
    // storage indisponível: a largura vale só nesta sessão
  }
}

export default function CallSplit({
  chamada,
  chat,
  titulo,
  onFecharChat,
}: {
  chamada: ReactNode;
  chat: ReactNode;
  /** nome que vai no cabeçalho do painel (o da conversa). */
  titulo: string;
  onFecharChat: () => void;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  /** Largura real da coluna; recalculada a cada mudança de tamanho. */
  const [disponivel, setDisponivel] = useState(0);
  const [desejada, setDesejada] = useState<number | null>(null);

  // a coluna muda de tamanho com a janela, com o abrir/fechar de painéis e no
  // zoom do navegador: medir só na montagem era o que congelava o painel no
  // tamanho da primeira renderização
  useEffect(() => {
    const el = raiz.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entrada]) => setDisponivel(entrada.contentRect.width));
    ro.observe(el);
    setDisponivel(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // a preferência só existe no browser: decidir depois da primeira medição
  // evita que o HTML do servidor e o da hidratação discordem
  useEffect(() => {
    if (desejada !== null) return;
    setDesejada(lerLargura() ?? LARGURA_PADRAO);
  }, [desejada]);

  const disponivelRef = useRef(disponivel);
  disponivelRef.current = disponivel;

  const largura = larguraDoChat(desejada ?? LARGURA_PADRAO, disponivel);

  /** Aplica (e talvez guarde) a largura pedida pelo arraste ou pelo teclado. */
  const aplicar = useCallback((px: number, persistir: boolean) => {
    const nova = larguraDoChat(px, disponivelRef.current);
    setDesejada(nova);
    if (persistir) guardarLargura(nova);
  }, []);

  const comecarArraste = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const direita = raiz.current?.getBoundingClientRect().right ?? 0;
      const mover = (ev: PointerEvent) => aplicar(direita - ev.clientX, false);
      const soltar = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", mover);
        window.removeEventListener("pointerup", soltar);
        document.body.style.cursor = "";
        aplicar(direita - ev.clientX, true);
      };
      document.body.style.cursor = "col-resize";
      window.addEventListener("pointermove", mover);
      window.addEventListener("pointerup", soltar);
    },
    [aplicar],
  );

  const pelasTeclas = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      // seta para a esquerda alarga a conversa: ela cresce **para** a esquerda
      const delta = e.key === "ArrowLeft" ? PASSO_TECLADO : e.key === "ArrowRight" ? -PASSO_TECLADO : 0;
      if (delta === 0) return;
      e.preventDefault();
      aplicar(largura + delta, true);
    },
    [largura, aplicar],
  );

  return (
    <div ref={raiz} className="flex min-h-0 min-w-0 flex-1 bg-chat">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">{chamada}</div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionar a conversa"
        aria-valuenow={Math.round(largura)}
        aria-valuemin={LARGURA_MIN}
        aria-valuemax={Math.round(tetoDoChat(disponivel || LARGURA_PADRAO * 3))}
        tabIndex={0}
        onPointerDown={comecarArraste}
        onKeyDown={pelasTeclas}
        className="w-px shrink-0 cursor-col-resize border-x-2 border-transparent bg-border bg-clip-content transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
      />

      <PainelDeChatDaCall titulo={titulo} largura={largura} onFechar={onFecharChat}>
        {chat}
      </PainelDeChatDaCall>
    </div>
  );
}
