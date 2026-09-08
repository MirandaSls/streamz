"use client";

import {
  Children,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, X } from "@/components/ui/icones";
import { useEhMobile } from "@/hooks/useEhMobile";
import { useVoltarNoCelular } from "@/hooks/useVoltarNoCelular";

/**
 * Caixa de diálogo acessível — a base de todos os modais do app.
 *
 * Os modais antigos eram `div`s soltas: sem papel semântico, sem foco, sem Esc.
 * Aqui o contrato é único: `role="dialog"` + `aria-modal`, foco inicial no
 * primeiro elemento útil, Tab preso dentro da caixa, Esc e clique fora fecham, e
 * o foco volta para quem abriu.
 *
 * **Sempre num portal para o `body`**, e isso não é preferência de organização:
 * `position: fixed` se mede pela viewport *só enquanto* nenhum ancestral tiver
 * `transform`, `filter`, `backdrop-filter`, `perspective` ou `contain` — nesse
 * caso o ancestral vira o bloco de contenção e o `inset-0` passa a valer para a
 * caixa dele. Foi o que aconteceu com o seletor de tela, aberto de dentro da
 * barra de controles da chamada (`-translate-x-1/2 backdrop-blur`): o modal
 * nascia ancorado na pílula de controles e saía da tela. Sair da árvore é o que
 * torna o centro do modal independente de onde ele foi aberto.
 *
 * Forma medida nos prints do Discord (`2026-08-31 124114`, confirmação, e
 * `2026-09-02 152402`, "Nova mensagem"): caixa de 480 com borda de 1px e raio
 * 8; padding de 24 em volta; título de 20/700, descrição de 16 em linha de 20
 * a 8 do título; "×" de 24 a 16 do canto; botões de 40 com raio 8 e 8 entre
 * eles, "Cancelar" com fundo cinza; rodapé na mesma cor do corpo, sem faixa.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Dialog({
  title,
  description,
  onClose,
  children,
  footer,
  hideHeader = false,
  showClose = true,
  align = "center",
  bodyClassName = "",
  semPadding = false,
  telaCheiaNoCelular = false,
  className = "w-[480px]",
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  /** esconde o cabeçalho visual mantendo o título para leitores de tela
   *  (quick switcher e perfil não têm título escrito no Discord). */
  hideHeader?: boolean;
  showClose?: boolean;
  /** o quick switcher fica no terço superior, não no centro. */
  align?: "center" | "top";
  bodyClassName?: string;
  /** o corpo sem padding nenhum: perfil e boas-vindas pintam a caixa inteira
   *  (faixa de cor até a borda) e cuidam do próprio respiro. */
  semPadding?: boolean;
  /**
   * No celular esta caixa vira **tela cheia**, com barra de 56 e seta de voltar.
   *
   * É um interruptor por modal, e não uma regra automática por largura, porque
   * a diferença é de conteúdo e não de aritmética: os modais largos (criar
   * canal, convite, perfil, recorte de imagem, emojis, enquete) são *tarefas* —
   * no Discord do celular ocupam a tela inteira e têm um "voltar". Os pequenos
   * (confirmar, prompt, expulsar, banir, castigo) são *perguntas de uma linha*:
   * viram cartão centrado nas duas plataformas, e esticá-los até 844px de
   * altura só afastaria a pergunta do botão que a responde.
   *
   * Só muda a moldura — o conteúdo de cada modal fica como está.
   */
  telaCheiaNoCelular?: boolean;
  /** largura da caixa: 480 medidos no Discord, borda de 1px incluída. */
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  /**
   * No celular a caixa ocupa a **largura inteira** e sobe o teto de altura.
   *
   * As larguras dos modais são medidas do Discord no desktop (480 na
   * confirmação, 960 no seletor de tela, 1400 nas configurações) e nenhuma cabe
   * num telefone de 390px. Em vez de uma largura por modal, uma regra só: no
   * celular a largura é a da tela menos a folga, e o `max-h-[85vh]` vira
   * `92dvh` — o `vh` do iOS conta a barra de endereço que já não está lá.
   *
   * A moldura continua sendo a mesma (título, X, corpo rolável, rodapé): o que
   * muda é o tamanho da caixa, não o conteúdo dela.
   */
  const ehMobile = useEhMobile();
  /** tela cheia mesmo: sem véu à volta, com barra de voltar e áreas seguras. */
  const cheio = ehMobile && telaCheiaNoCelular;
  const titleId = useId();
  const descriptionId = useId();
  // `document` não existe na pré-renderização; o portal só pode ser criado
  // depois de montar no cliente (a web é exportada estática para o desktop).
  const [montado, setMontado] = useState(false);

  useEffect(() => setMontado(true), []);

  // o "voltar" do Android fecha a tela cheia, como fecharia qualquer tela do
  // app; o cartão centrado continua só com o Esc e o toque no véu
  useVoltarNoCelular(cheio && montado, onClose);

  useEffect(() => {
    if (!montado) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    // `data-autofocus` deixa o modal escolher o alvo (ex.: um confirm
    // destrutivo abre com o foco em "Cancelar", não no botão que apaga)
    const target =
      panel?.querySelector<HTMLElement>("[data-autofocus]") ??
      panel?.querySelector<HTMLElement>(FOCUSABLE) ??
      panel;
    target?.focus();
    // devolve o foco para o botão que abriu o modal
    return () => previous?.focus?.();
    // depende de `montado` porque na primeira passada o painel ainda não existe
  }, [montado]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const nodes = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
    ).filter((node) => node.offsetParent !== null);
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!montado) return null;

  // sem corpo (um confirm sem prévia) a descrição encosta direto no rodapé;
  // `toArray` descarta `false`/`null` que um `{cond && ...}` deixa para trás
  const temCorpo = Children.toArray(children).length > 0;

  return createPortal(
    <div
      className={`fixed inset-0 z-50 grid bg-black/85 anim-overlay ${
        cheio
          ? // sem véu à volta e sem folga: a caixa É a tela
            "items-stretch justify-items-stretch"
          : `justify-items-center ${align === "top" ? "items-start" : "items-center"} ${
              ehMobile
                ? // as áreas seguras entram como folga: o topo do modal não pode
                  // cair atrás do entalhe nem o rodapé atrás da barra de gestos
                  "px-2 pb-[calc(env(safe-area-inset-bottom)+8px)] pt-[calc(env(safe-area-inset-top)+8px)]"
                : align === "top"
                  ? "p-4 pt-[10vh]"
                  : "p-4"
            }`
      }`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={`relative flex max-w-full flex-col overflow-hidden bg-chat outline-none anim-modal ${
          cheio
            ? "h-[100dvh] w-full pt-[env(safe-area-inset-top)]"
            : `rounded-lg border border-border shadow-high ${
                ehMobile ? "max-h-[92dvh] w-full" : `max-h-[85vh] ${className}`
              }`
        }`}
      >
        {/* cabeçalho fica fora da área rolável: no Discord ele não sobe junto */}
        {cheio ? (
          /* barra de 56 com a seta de voltar à esquerda — o cabeçalho de tela
             do app de celular (`components/mobile/pecas.tsx`), e não o título
             de 20/700 com o × no canto, que é a forma do cartão. Vale também
             para quem pediu `hideHeader`: sem barra não haveria como sair. */
          <header className="flex h-14 shrink-0 items-center gap-1 border-b border-border bg-panel pl-1 pr-2">
            <button
              type="button"
              onClick={onClose}
              aria-label="Voltar"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-txt-secondary transition active:bg-hov"
            >
              <ArrowLeft size={24} />
            </button>
            <h2
              id={titleId}
              className="min-w-0 flex-1 truncate text-base font-semibold text-txt-primary"
            >
              {title}
            </h2>
          </header>
        ) : hideHeader ? (
          <h2 id={titleId} className="sr-only">
            {title}
          </h2>
        ) : (
          <div className="shrink-0 px-6 pt-6">
            <h2
              id={titleId}
              className="pr-8 font-display text-xl font-bold tracking-title text-txt-primary"
            >
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-2 text-base leading-5 text-txt-muted">
                {description}
              </p>
            )}
          </div>
        )}
        {cheio && description && (
          <p id={descriptionId} className="shrink-0 px-4 pt-4 text-base leading-5 text-txt-muted">
            {description}
          </p>
        )}
        {showClose && !cheio && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="absolute right-4 top-4 z-10 grid h-6 w-6 place-items-center rounded text-txt-muted transition hover:text-txt-primary"
          >
            <X size={24} />
          </button>
        )}
        {/* só o corpo rola; o rodapé fica sempre à vista */}
        {/* sem cabeçalho o corpo mantém os 16 do quick switcher; quem pinta a
            caixa inteira pede `semPadding` em vez de anular com margem negativa
            (a margem dependia do padding daqui, e sobraria uma faixa de 8 de
            cada lado com o corpo em 24) */}
        {temCorpo && (
          <div
            className={`min-h-0 flex-1 overflow-y-auto ${
              cheio
                ? `overscroll-contain ${semPadding ? "" : "p-4"}`
                : semPadding
                  ? ""
                  : hideHeader
                    ? "p-4"
                    : "px-6 py-4"
            } ${bodyClassName}`}
          >
            {children}
          </div>
        )}
        {footer && (
          <div
            className={`flex shrink-0 flex-row-reverse items-center gap-2 ${
              cheio
                ? // rodapé colado no fim da tela, acima da barra de gestos, com
                  // os botões esticados: é onde o polegar está
                  "border-t border-border px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4 [&>button]:flex-1"
                : `px-6 pb-6 ${temCorpo ? "pt-2" : "pt-6"}`
            }`}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Botão primário do rodapé de um modal. */
export function PrimaryButton({
  children,
  disabled,
  onClick,
  type = "button",
  danger = false,
  autoFocus = false,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
  danger?: boolean;
  /** marca este botão como o alvo do foco inicial do modal. */
  autoFocus?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      data-autofocus={autoFocus ? "" : undefined}
      className={`h-10 min-w-24 rounded-lg px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
        danger
          ? "bg-red text-white hover:bg-red-hover"
          : "bg-accent text-accent-ink hover:bg-accent-hover"
      }`}
    >
      {children}
    </button>
  );
}

/** Botão secundário (cancelar/fechar): fundo cinza, como o "Cancelar" do Discord. */
export function SecondaryButton({
  children,
  onClick,
  full = false,
  autoFocus = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  full?: boolean;
  /** marca este botão como o alvo do foco inicial do modal. */
  autoFocus?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-autofocus={autoFocus ? "" : undefined}
      className={`h-10 min-w-24 rounded-lg bg-border-strong px-4 text-sm font-medium text-txt-normal transition hover:bg-border-strong-hover ${
        full ? "w-full" : ""
      }`}
    >
      {children}
    </button>
  );
}
