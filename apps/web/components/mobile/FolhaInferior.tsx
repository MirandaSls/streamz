"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useEhMobile } from "@/hooks/useEhMobile";
import { useVoltarNoCelular } from "@/hooks/useVoltarNoCelular";

/**
 * Folha inferior (*bottom sheet*) — o que um popover ancorado vira no celular.
 *
 * No desktop uma caixa nasce colada ao botão que a abriu, porque o ponteiro
 * está ali e a tela é grande. No celular as duas premissas caem: o dedo cobre o
 * botão, e uma caixa de 300px ancorada num botão do topo fica fora do alcance
 * do polegar. O padrão das duas plataformas é o mesmo — a caixa sobe do fundo,
 * ocupando a largura inteira, com o conteúdo perto de onde a mão está.
 *
 * Regras que valem para todas as folhas do app:
 *
 * - **Nunca passa de 85% da altura**, e o corpo rola por dentro. Uma folha do
 *   tamanho da tela é um modal disfarçado, e perde o "ainda estou na conversa".
 * - **`env(safe-area-inset-bottom)`** no rodapé: o último item de uma lista não
 *   pode cair atrás da barra de gestos.
 * - **`overscroll-contain`**: rolar até o fim da folha não pode arrastar a
 *   página atrás dela.
 * - O véu fecha ao toque, e o Esc também (teclado externo existe em tablet).
 * - **A alça do topo é botão**, com rótulo "Fechar": o véu é o gesto de quem já
 *   conhece o padrão, e o Esc não existe num telefone. É a mesma saída visível
 *   que a folha do menu de contexto tem (`components/ui/ContextMenu.tsx`).
 * - **O "voltar" do Android desfaz a folha**, pelo mesmo hook de todas as
 *   camadas do celular. Sem ele o voltar atravessava a folha e desfazia a tela
 *   de baixo, deixando a folha no ar por cima de outra coisa.
 *
 * Nenhum chamador hoje: este arquivo é a moldura de referência das folhas do
 * app, e as três que existem (menu de contexto, popover ancorado e cartão de
 * perfil) pintam a própria por já terem moldura anterior. As regras acima
 * valem para as quatro, e é por isso que elas moram aqui.
 */
export default function FolhaInferior({
  rotulo,
  titulo,
  onFechar,
  children,
}: {
  /** rótulo acessível — a folha é um `dialog` que pode não ter título escrito. */
  rotulo: string;
  titulo?: ReactNode;
  onFechar: () => void;
  children: ReactNode;
}) {
  // `ehMobile` e não `true`: a folha é de celular por construção, mas o hook do
  // "voltar" empurra uma entrada no histórico, e sequestrar o botão de voltar de
  // um navegador de mesa por engano é caro demais para se apoiar na convenção
  // do nome do arquivo.
  const ehMobile = useEhMobile();

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onFechar();
    };
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  }, [onFechar]);

  useVoltarNoCelular(ehMobile, onFechar);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="anim-overlay fixed inset-0 z-[95] flex flex-col justify-end bg-background-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={rotulo}
        className="anim-folha flex max-h-[85dvh] flex-col overflow-hidden rounded-t-2xl bg-background-surface-higher pb-[env(safe-area-inset-bottom)] shadow-popout"
      >
        {/* a alça: não arrasta (ainda), mas é o sinal de "isto sobe do fundo e
            fecha para baixo" que todo mundo já conhece de outros apps — e é
            **botão**, para quem não conhece o gesto ter uma saída de verdade */}
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar"
          className="flex h-[28px] w-full shrink-0 items-center justify-center pt-2.5"
        >
          <span aria-hidden="true" className="h-1 w-9 rounded-full bg-border-normal" />
        </button>
        {titulo && (
          <h2 className="shrink-0 px-5 pb-1 pt-3 text-base font-semibold text-text-strong">
            {titulo}
          </h2>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
