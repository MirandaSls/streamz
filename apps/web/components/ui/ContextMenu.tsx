"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronRight } from "lucide-react";
import { isReacoes, isSlider, isSubmenu, useUI, type MenuItem } from "@/stores/ui";

/**
 * Barra arrastável dentro do menu (o volume de um participante).
 *
 * O menu não fecha ao mexer: arrastar é um ajuste contínuo, e fechar a cada
 * movimento tornaria impossível ouvir o resultado enquanto se regula.
 */
function ItemDeslizante({ item }: { item: Extract<MenuItem, { slider: object }> }) {
  const { min, max, step, onChange, format } = item.slider;
  // estado local: os itens do menu são montados uma vez, então o `value` da
  // definição está congelado no momento em que o menu abriu — sem isso a barra
  // não andaria enquanto o mouse arrasta
  const [value, setValue] = useState(item.slider.value);
  return (
    <div
      className="px-2 py-1.5"
      // o menu-pai fecha no mousedown de fora; aqui o arraste é "dentro"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mb-1 flex items-center justify-between gap-2 text-sm font-medium text-txt-secondary">
        <span className="flex items-center gap-2">
          {item.icon ? <span className="shrink-0 opacity-80">{item.icon as ReactNode}</span> : null}
          {item.label}
        </span>
        <span className="tabular-nums text-txt-muted">
          {format ? format(value) : String(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step ?? 1}
        value={value}
        aria-label={item.label}
        onChange={(e) => {
          const v = Number(e.target.value);
          setValue(v);
          onChange(v);
        }}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-border accent-accent"
      />
    </div>
  );
}

/** Largura padrão — a dos menus de mensagem, canal e membro do Discord. */
export const MENU_WIDTH = 188;
/** Menus com rótulos longos (dropdown do servidor). */
export const MENU_WIDTH_WIDE = 220;

const EDGE = 8;
/** o submenu abre depois de uma pausa: passar o mouse por cima não dispara. */
const SUBMENU_DELAY = 120;

interface Colocacao {
  x: number;
  y: number;
  /** origem da animação, para o menu crescer a partir do ponto de ancoragem. */
  origem: string;
}

/**
 * Coloca a caixa dentro da janela **invertendo** o lado quando não couber, em
 * vez de só empurrar: perto da borda de baixo, empurrar faria o menu cobrir o
 * próprio cursor. `alternativoX` é para onde o menu vai quando espelha — o
 * cursor no caso do menu raiz, a borda esquerda do item no caso de um submenu.
 */
function colocar(
  x: number,
  y: number,
  largura: number,
  altura: number,
  alternativoX: number,
): Colocacao {
  let espelhaX = false;
  let espelhaY = false;
  let px = x;
  let py = y;

  if (px + largura > window.innerWidth - EDGE) {
    px = alternativoX - largura;
    espelhaX = true;
    if (px < EDGE) px = Math.max(EDGE, window.innerWidth - largura - EDGE);
  }
  if (py + altura > window.innerHeight - EDGE) {
    py = y - altura;
    espelhaY = true;
    if (py < EDGE) py = Math.max(EDGE, window.innerHeight - altura - EDGE);
  }
  return {
    x: Math.max(EDGE, px),
    y: Math.max(EDGE, py),
    origem: `${espelhaX ? "right" : "left"} ${espelhaY ? "bottom" : "top"}`,
  };
}

/** Índice do próximo item selecionável na direção dada (dá a volta). */
function proximo(items: MenuItem[], de: number, passo: number): number {
  for (let i = 1; i <= items.length; i++) {
    const idx = (de + passo * i + items.length * 2) % items.length;
    const item = items[idx];
    // separador, barra deslizante e fileira de reações não são alvos de seta:
    // a fileira anda com Tab, que é como se percorre um grupo horizontal
    if ("separator" in item || isSlider(item) || isReacoes(item)) continue;
    if (!item.disabled) return idx;
  }
  return de;
}

/**
 * A fileira de reações rápidas do topo do menu.
 *
 * Botão quadrado, sem rótulo e sem o hover de accent dos itens de texto: aqui o
 * realce precisa deixar o emoji visível, e um fundo limão embaixo de um emoji
 * colorido tira a legibilidade dos dois.
 */
function FileiraDeReacoes({
  item,
  onClose,
}: {
  item: Extract<MenuItem, { reacoes: unknown[] }>;
  onClose: () => void;
}) {
  return (
    <div role="group" aria-label="Reações rápidas" className="mb-1 flex items-center gap-1 px-1 py-1">
      {item.reacoes.map((r) => (
        <button
          key={r.chave}
          type="button"
          role="menuitem"
          aria-label={`Reagir com ${r.rotulo}`}
          onClick={() => {
            onClose();
            r.onSelect();
          }}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-[3px] outline-none transition hover:bg-hov focus-visible:bg-hov"
        >
          {r.nodo as React.ReactNode}
        </button>
      ))}
    </div>
  );
}

function Painel({
  items,
  largura,
  x,
  y,
  alternativoX,
  onClose,
  autoFoco,
}: {
  items: MenuItem[];
  largura: number;
  x: number;
  y: number;
  alternativoX: number;
  onClose: () => void;
  autoFoco: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);
  const [pos, setPos] = useState<Colocacao | null>(null);
  const [foco, setFoco] = useState<number>(-1);
  const [aberto, setAberto] = useState<number | null>(null);
  const [ancora, setAncora] = useState<DOMRect | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 0;
    setPos(colocar(x, y, largura, h, alternativoX));
  }, [x, y, largura, alternativoX, items]);

  useEffect(() => {
    if (!autoFoco) return;
    const primeiro = proximo(items, -1, 1);
    setFoco(primeiro);
  }, [autoFoco, items]);

  useEffect(() => {
    if (foco >= 0) botoes.current[foco]?.focus();
  }, [foco]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const agendarSubmenu = useCallback((i: number, el: HTMLElement, temFilho: boolean) => {
    window.clearTimeout(timer.current);
    if (!temFilho) {
      timer.current = window.setTimeout(() => setAberto(null), SUBMENU_DELAY);
      return;
    }
    const r = el.getBoundingClientRect();
    timer.current = window.setTimeout(() => {
      setAncora(r);
      setAberto(i);
    }, SUBMENU_DELAY);
  }, []);

  function aoTeclado(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      setFoco((f) => proximo(items, f, e.key === "ArrowDown" ? 1 : -1));
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      e.stopPropagation();
      setFoco(proximo(items, e.key === "Home" ? -1 : 0, e.key === "Home" ? 1 : -1));
    } else if (e.key === "ArrowRight") {
      const item = items[foco];
      if (item && isSubmenu(item) && !item.disabled) {
        e.preventDefault();
        e.stopPropagation();
        const el = botoes.current[foco];
        if (el) setAncora(el.getBoundingClientRect());
        setAberto(foco);
      }
    } else if (e.key === "ArrowLeft") {
      if (aberto !== null) {
        e.preventDefault();
        e.stopPropagation();
        setAberto(null);
        botoes.current[foco]?.focus();
      }
    }
  }

  return (
    <>
      <div
        ref={ref}
        role="menu"
        onKeyDown={aoTeclado}
        style={{
          left: pos?.x ?? x,
          top: pos?.y ?? y,
          width: largura,
          transformOrigin: pos?.origem ?? "left top",
        }}
        className={`fixed z-[80] rounded-md border border-border/70 bg-overlay p-1.5 shadow-high anim-menu ${
          pos ? "" : "invisible"
        }`}
        onContextMenu={(e) => e.preventDefault()}
      >
        {items.map((item, i) => {
          if ("separator" in item) {
            return <div key={i} role="separator" className="my-1 h-px bg-border" />;
          }
          if (isSlider(item)) {
            return <ItemDeslizante key={i} item={item} />;
          }
          if (isReacoes(item)) {
            return <FileiraDeReacoes key={i} item={item} onClose={onClose} />;
          }
          const filho = isSubmenu(item);
          const marcado = !filho && item.checked === true;
          const controle = !filho ? item.control : undefined;
          const cor = item.danger
            ? "text-red hover:bg-red hover:text-white focus:bg-red focus:text-white"
            : !filho && item.highlight
              ? "text-accent hover:bg-accent hover:text-accent-ink focus:bg-accent focus:text-accent-ink"
              : "text-txt-secondary hover:bg-accent hover:text-accent-ink focus:bg-accent focus:text-accent-ink";
          return (
            <button
              key={i}
              ref={(el) => {
                botoes.current[i] = el;
              }}
              type="button"
              role={
                controle === "radio"
                  ? "menuitemradio"
                  : controle === "checkbox"
                    ? "menuitemcheckbox"
                    : "menuitem"
              }
              aria-checked={controle ? marcado : undefined}
              aria-haspopup={filho ? "menu" : undefined}
              aria-expanded={filho ? aberto === i : undefined}
              tabIndex={foco === i ? 0 : -1}
              disabled={item.disabled}
              onPointerEnter={(e) => {
                setFoco(i);
                agendarSubmenu(i, e.currentTarget, filho && !item.disabled);
              }}
              onClick={(e) => {
                if (filho) {
                  setAncora(e.currentTarget.getBoundingClientRect());
                  setAberto((a) => (a === i ? null : i));
                  return;
                }
                onClose();
                item.onSelect();
              }}
              className={`flex h-8 w-full items-center gap-2 whitespace-nowrap rounded-[3px] px-2 text-left text-sm font-medium outline-none disabled:opacity-40 ${cor} ${
                aberto === i ? "bg-accent text-accent-ink" : ""
              }`}
            >
              {controle === "checkbox" && (
                <span
                  aria-hidden="true"
                  className={`grid h-4 w-4 shrink-0 place-items-center rounded-[3px] border-2 ${
                    marcado ? "border-current bg-current" : "border-current opacity-60"
                  }`}
                >
                  {marcado && (
                    <svg viewBox="0 0 12 12" className="h-3 w-3 text-overlay">
                      <path
                        d="M2.5 6.2 4.8 8.5 9.5 3.8"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
              )}
              {!filho && item.dot && (
                <span
                  aria-hidden="true"
                  style={{ backgroundColor: item.dot }}
                  className="h-2 w-2 shrink-0 rounded-full"
                />
              )}
              <span className="flex-1">{item.label}</span>
              {controle === "radio" && (
                <span
                  aria-hidden="true"
                  className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 border-current ${
                    marcado ? "" : "opacity-60"
                  }`}
                >
                  {marcado && <span className="h-2 w-2 rounded-full bg-current" />}
                </span>
              )}
              {filho ? (
                <ChevronRight size={16} className="shrink-0 opacity-80" />
              ) : item.icon ? (
                <span className="shrink-0 opacity-80">{item.icon as ReactNode}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      {aberto !== null && ancora && isSubmenu(items[aberto]) && (
        <Painel
          items={(items[aberto] as Extract<MenuItem, { submenu: MenuItem[] }>).submenu}
          largura={largura}
          // submenu encosta no item, com 4px de sobreposição, como no Discord
          x={ancora.right - 4}
          y={ancora.top - 6}
          alternativoX={ancora.left + 4}
          onClose={onClose}
          autoFoco={false}
        />
      )}
    </>
  );
}

/**
 * Menu de contexto (botão direito) no estilo do Discord: caixa escura, itens
 * de 32px, hover cheio, submenus com chevron. Um só na tela, aberto por
 * `ui.openContextMenu(x, y, items, largura)`.
 *
 * Fecha com Esc, clique fora, rolagem ou redimensionamento — qualquer coisa que
 * deixaria o menu solto longe do que o abriu.
 */
export default function ContextMenuHost() {
  const menu = useUI((s) => s.contextMenu);
  const close = useUI((s) => s.closeContextMenu);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onDown = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu, close]);

  if (!menu) return null;

  return (
    <div ref={raiz}>
      <Painel
        items={menu.items}
        largura={menu.width ?? MENU_WIDTH}
        x={menu.x}
        y={menu.y}
        alternativoX={menu.x}
        onClose={close}
        autoFoco
      />
    </div>
  );
}
