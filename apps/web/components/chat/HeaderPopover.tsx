"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { HeaderIcon } from "@/components/chat/HeaderBar";

/**
 * Botão da toolbar do cabeçalho que abre um painel ancorado abaixo dele —
 * o padrão das fixadas, das threads e da caixa de entrada no Discord.
 *
 * Três decisões que vieram da comparação com o original:
 *
 * - **Altura fixa** (600px, limitada pela janela). Com `max-h` o painel mudava
 *   de tamanho a cada item que chegava; no Discord ele tem sempre a mesma
 *   caixa e é o conteúdo que rola dentro.
 * - **Caret**: a setinha que liga o painel ao ícone que o abriu. Sem ela o
 *   painel parece solto no cabeçalho.
 * - **Espelho horizontal**: um painel de 420–440px alinhado à direita vaza pela
 *   esquerda em janela estreita; quando não cabe, ele alinha pela esquerda do
 *   botão.
 *
 * Fecha no Esc e no clique fora; `onOpen` é onde o conteúdo carrega, para a
 * lista só ir ao servidor quando alguém realmente abre o painel.
 */

const FOCALIZAVEL =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** folga entre o ícone e o painel (a do Discord). */
const FOLGA = 8;
/** margem mínima até a borda da janela. */
const BORDA = 8;

export default function HeaderPopover({
  label,
  icon,
  title,
  tituloControle,
  contagem,
  action,
  busca,
  largura = 420,
  onOpen,
  children,
}: {
  label: string;
  icon: ReactNode;
  /** título do painel — vira o rótulo acessível quando há `tituloControle`. */
  title: string;
  /** substitui o título escrito (o seletor "Threads Ativas ▾"). */
  tituloControle?: (fechar: () => void) => ReactNode;
  /** número ao lado do título (fixadas, threads). */
  contagem?: number;
  /** botão à direita do título (ex.: "marcar tudo como lido"). */
  action?: ReactNode;
  /** campo de busca do cabeçalho do painel. */
  busca?: { valor: string; aoMudar: (valor: string) => void; placeholder: string };
  largura?: number;
  onOpen?: () => void;
  /** recebe o fechador para que um item da lista possa fechar o painel. */
  children: (fechar: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  /** null enquanto não medimos: o painel nasce alinhado à direita do botão. */
  const [alinharEsquerda, setAlinharEsquerda] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);
  const botaoRef = useRef<HTMLElement | null>(null);

  const fechar = useCallback(() => setOpen(false), []);

  // alinhado à direita do botão; se o painel vazasse pela esquerda, à esquerda
  useLayoutEffect(() => {
    if (!open) return;
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return;
    setAlinharEsquerda(r.right - largura < BORDA);
  }, [open, largura]);

  useEffect(() => {
    if (!open) return;
    // quem tinha o foco volta a tê-lo quando o painel fecha
    botaoRef.current = document.activeElement as HTMLElement | null;
    // o campo de busca, quando existe; senão o próprio painel — cair no
    // primeiro focável levaria o foco para um botão que só existe no hover
    const alvo = painelRef.current?.querySelector<HTMLElement>("[data-autofocus]");
    (alvo ?? painelRef.current)?.focus();
    return () => botaoRef.current?.focus?.();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function aoTeclar(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function aoClicar(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", aoTeclar);
    // captura: um clique em algo que remonta a árvore ainda fecha o painel
    window.addEventListener("mousedown", aoClicar, true);
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      window.removeEventListener("mousedown", aoClicar, true);
    };
  }, [open]);

  /** Tab preso dentro do painel, como num diálogo. */
  function prenderFoco(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab") return;
    const nos = Array.from(
      painelRef.current?.querySelectorAll<HTMLElement>(FOCALIZAVEL) ?? [],
    ).filter((no) => no.offsetParent !== null);
    if (nos.length === 0) return;
    const primeiro = nos[0];
    const ultimo = nos[nos.length - 1];
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <HeaderIcon
        label={label}
        active={open}
        semTooltip={open}
        onClick={() => {
          const proximo = !open;
          setOpen(proximo);
          if (proximo) onOpen?.();
        }}
      >
        {icon}
      </HeaderIcon>

      {open && (
        <>
          {/* caret: liga o painel ao ícone que o abriu */}
          <span
            aria-hidden="true"
            style={{
              borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent",
              borderBottom: "6px solid #050507",
            }}
            className="absolute left-1/2 top-full z-40 -ml-1.5 mt-0.5 h-0 w-0"
          />
          <div
            ref={painelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            onKeyDown={prenderFoco}
            style={{ width: largura, top: `calc(100% + ${FOLGA}px)` }}
            className={`absolute z-30 flex h-[600px] max-h-[calc(100vh-80px)] flex-col overflow-hidden rounded-md bg-overlay shadow-high outline-none anim-menu ${
              alinharEsquerda ? "left-0" : "right-0"
            }`}
          >
            <header className="shrink-0 shadow-header">
              <div className="flex h-12 items-center gap-2 px-4">
                <span aria-hidden="true" className="shrink-0 text-txt-secondary">
                  {icon}
                </span>
                {tituloControle ? (
                  tituloControle(fechar)
                ) : (
                  <h2 className="min-w-0 truncate font-semibold text-txt-primary">{title}</h2>
                )}
                {contagem !== undefined && contagem > 0 && (
                  <span className="shrink-0 rounded-full bg-rail px-1.5 text-xs font-semibold text-txt-muted">
                    {contagem}
                  </span>
                )}
                {action && <span className="ml-auto shrink-0">{action}</span>}
              </div>
              {busca && (
                <div className="px-4 pb-2">
                  <input
                    data-autofocus
                    value={busca.valor}
                    onChange={(e) => busca.aoMudar(e.target.value)}
                    type="search"
                    aria-label={busca.placeholder}
                    placeholder={busca.placeholder}
                    className="h-7 w-full rounded-[4px] bg-rail px-2 text-sm text-txt-normal outline-none placeholder:text-txt-muted"
                  />
                </div>
              )}
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">{children(fechar)}</div>
          </div>
        </>
      )}
    </div>
  );
}
