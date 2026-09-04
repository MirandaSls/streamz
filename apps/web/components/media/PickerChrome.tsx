"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Search } from "@/components/ui/icones";

/**
 * Peças que os três seletores (emoji, GIF, figurinha) desenham igual: a caixa
 * flutuante, o campo de busca com a lupa dentro, a coluna lateral de atalhos e
 * o rodapé.
 *
 * Existem aqui porque cada seletor pode aparecer de dois jeitos: **sozinho**,
 * como popover próprio (a reação de uma mensagem abre só o de emoji), ou
 * **embutido** no `PickerPanel`, que já é a caixa e já cuida do Escape e do
 * clique fora. Sem esta separação cada seletor teria que repetir a caixa e
 * registrar um segundo listener de `mousedown` dentro do painel — dois
 * listeners concorrendo é exatamente como o clique numa aba fecharia o painel.
 */

/** Largura do painel, igual à do Discord. */
export const LARGURA_PICKER = 424;
/** Altura do painel inteiro (abas incluídas). */
export const ALTURA_PICKER = 420;

/** Fecha ao apertar Escape ou clicar fora — só quando o seletor é o dono da caixa. */
export function useFecharFora(
  ref: React.RefObject<HTMLElement | null>,
  onClose: () => void,
  ativo = true,
): void {
  useEffect(() => {
    if (!ativo) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [ref, onClose, ativo]);
}

/** A caixa flutuante do seletor quando ele não está dentro do `PickerPanel`. */
export function CaixaPicker({
  rotulo,
  onClose,
  className = "",
  children,
}: {
  rotulo: string;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFecharFora(ref, onClose);
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={rotulo}
      style={{ width: LARGURA_PICKER, height: ALTURA_PICKER }}
      className={`anim-menu z-[70] flex flex-col overflow-hidden rounded-lg bg-panel shadow-high ${className}`}
    >
      {children}
    </div>
  );
}

/** Campo de busca com a lupa **dentro** do campo, como no Discord. */
export function BuscaPicker({
  valor,
  onChange,
  placeholder,
  rotulo,
  autoFocus = false,
  children,
}: {
  valor: string;
  onChange: (v: string) => void;
  placeholder: string;
  rotulo: string;
  autoFocus?: boolean;
  /** botão opcional à esquerda do campo (o "voltar" do seletor de GIF). */
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 p-2">
      {children}
      <div className="relative flex-1">
        <Search
          size={14}
          aria-hidden="true"
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-txt-muted"
        />
        <input
          autoFocus={autoFocus}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={rotulo}
          className="h-8 w-full rounded bg-void pl-7 pr-2 text-sm text-txt-normal outline-none placeholder:text-txt-muted"
        />
      </div>
    </div>
  );
}

/** Coluna vertical de atalhos à esquerda da grade. */
export function ColunaLateral({ children, rotulo }: { children: ReactNode; rotulo: string }) {
  return (
    <nav
      aria-label={rotulo}
      className="flex w-11 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-black/30 py-2"
    >
      {children}
    </nav>
  );
}

export function BotaoLateral({
  rotulo,
  ativo,
  onClick,
  children,
}: {
  rotulo: string;
  ativo: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={rotulo}
      aria-label={rotulo}
      aria-current={ativo || undefined}
      onClick={onClick}
      className={`grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded transition ${
        ativo ? "bg-sel text-accent" : "text-txt-muted hover:bg-hov hover:text-txt-normal"
      }`}
    >
      {children}
    </button>
  );
}

/** Ícone do servidor na coluna lateral: a imagem ou a sigla do nome. */
export function IconeServidor({ nome, iconUrl }: { nome: string; iconUrl: string | null }) {
  if (iconUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={iconUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
    );
  }
  return (
    <span className="grid h-6 w-6 place-items-center rounded-full bg-void text-[9px] font-semibold text-txt-normal">
      {sigla(nome)}
    </span>
  );
}

/** Iniciais das palavras do nome, no máximo duas — igual ao rail de servidores. */
export function sigla(nome: string): string {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** Divisória fina entre os grupos da coluna lateral. */
export function DivisoriaLateral() {
  return <div aria-hidden="true" className="my-1 h-px w-6 shrink-0 rounded bg-border" />;
}

export function RodapePicker({ children }: { children: ReactNode }) {
  return (
    <footer className="flex h-11 shrink-0 items-center gap-2 border-t border-black/30 bg-void/40 px-3">
      {children}
    </footer>
  );
}
