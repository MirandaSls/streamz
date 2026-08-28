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
 * A tela cheia (ver `fullscreen.ts`) não tem nada a ver com esta divisão: o
 * elemento em tela cheia é promovido pelo compositor e ignora a altura daqui.
 */

/** O palco nunca some de vez: menos que isso não cabe nem um rosto. */
const ALTURA_MIN = 200;
const ALTURA_PADRAO = 420;
/** Reserva da conversa: sem ela o palco esmagaria o composer contra a timeline. */
const RESERVA_CHAT = 220;
const PASSO_TECLADO = 24;
const CHAVE_ALTURA = "streamz:altura-chamada";

function alturaSalva(): number {
  if (typeof window === "undefined") return ALTURA_PADRAO;
  try {
    const n = Number(window.localStorage?.getItem(CHAVE_ALTURA));
    return Number.isFinite(n) && n >= ALTURA_MIN ? n : ALTURA_PADRAO;
  } catch {
    return ALTURA_PADRAO;
  }
}

function guardarAltura(altura: number) {
  try {
    window.localStorage?.setItem(CHAVE_ALTURA, String(Math.round(altura)));
  } catch {
    // storage indisponível: a altura vale só nesta sessão
  }
}

export default function CallSplit({ chamada, chat }: { chamada: ReactNode; chat: ReactNode }) {
  const raiz = useRef<HTMLDivElement>(null);
  const [altura, setAltura] = useState(ALTURA_PADRAO);

  // a altura guardada só existe no browser: ler no primeiro efeito evita que o
  // HTML do servidor e o da hidratação discordem
  useEffect(() => setAltura(alturaSalva()), []);

  /** Teto atual: o que sobra da coluna depois da reserva da conversa. */
  const teto = useCallback(() => {
    const disponivel = raiz.current?.clientHeight ?? 0;
    return Math.max(ALTURA_MIN, disponivel - RESERVA_CHAT);
  }, []);

  const comecarArraste = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const topo = raiz.current?.getBoundingClientRect().top ?? 0;
      const mover = (ev: PointerEvent) =>
        setAltura(Math.min(teto(), Math.max(ALTURA_MIN, ev.clientY - topo)));
      const soltar = () => {
        window.removeEventListener("pointermove", mover);
        window.removeEventListener("pointerup", soltar);
        document.body.style.cursor = "";
        setAltura((a) => {
          guardarAltura(a);
          return a;
        });
      };
      document.body.style.cursor = "row-resize";
      window.addEventListener("pointermove", mover);
      window.addEventListener("pointerup", soltar);
    },
    [teto],
  );

  const pelasTeclas = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      const delta = e.key === "ArrowUp" ? -PASSO_TECLADO : e.key === "ArrowDown" ? PASSO_TECLADO : 0;
      if (delta === 0) return;
      e.preventDefault();
      setAltura((a) => {
        const nova = Math.min(teto(), Math.max(ALTURA_MIN, a + delta));
        guardarAltura(nova);
        return nova;
      });
    },
    [teto],
  );

  return (
    <div ref={raiz} className="flex min-h-0 min-w-0 flex-1 flex-col bg-chat">
      <div
        // o `maxHeight` em CSS é o que mantém a conversa visível quando a janela
        // encolhe: sem ele a altura guardada de uma tela grande engoliria o chat
        style={{ height: altura, maxHeight: `calc(100% - ${RESERVA_CHAT}px)` }}
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
        tabIndex={0}
        onPointerDown={comecarArraste}
        onKeyDown={pelasTeclas}
        className="h-px shrink-0 cursor-row-resize border-y-2 border-transparent bg-border bg-clip-content transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{chat}</div>
    </div>
  );
}
