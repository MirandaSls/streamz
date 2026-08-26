"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { HeaderIcon } from "@/components/chat/HeaderBar";

/**
 * Botão da toolbar do cabeçalho que abre um painel ancorado abaixo dele —
 * o padrão das fixadas, das threads e da caixa de entrada no Discord.
 *
 * Fecha no Esc e no clique fora; `onOpen` é onde o conteúdo carrega, para a
 * lista só ir ao servidor quando alguém realmente abre o painel.
 */
export default function HeaderPopover({
  label,
  icon,
  title,
  action,
  width = "w-[420px]",
  onOpen,
  children,
}: {
  label: string;
  icon: ReactNode;
  title: string;
  /** botão à direita do título (ex.: "marcar tudo como lido"). */
  action?: ReactNode;
  width?: string;
  onOpen?: () => void;
  /** recebe o fechador para que um item da lista possa fechar o painel. */
  children: (fechar: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function aoTeclar(e: KeyboardEvent) {
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
        <div
          role="dialog"
          aria-label={title}
          className={`absolute right-0 top-[calc(100%+12px)] z-30 ${width} overflow-hidden rounded-md bg-overlay shadow-high`}
        >
          <header className="flex h-12 items-center gap-2 px-4 shadow-header">
            <h2 className="font-semibold text-txt-primary">{title}</h2>
            {action && <span className="ml-auto">{action}</span>}
          </header>
          <div className="max-h-[70vh] overflow-y-auto p-2">{children(() => setOpen(false))}</div>
        </div>
      )}
    </div>
  );
}
