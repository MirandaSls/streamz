"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useArrastoDeFolha } from "@/hooks/useArrastoDeFolha";
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
 * - **A altura cheia para 36px abaixo da área segura do topo**, e o corpo rola
 *   por dentro. Medido em `discord-mobile-membros.png` (1,9707 px/pt, a única
 *   folha do acervo com escala conhecida e tema Dark canônico): a borda de cima
 *   da folha cai em y=157,5 px = 80 pt, sob uma barra de status de 44 pt. A
 *   folha de membros ali está na altura cheia (a lista continua por baixo da
 *   borda da tela), então 80 − 44 = 36 é o respiro da parada cheia. Antes era
 *   `85dvh`, número nosso.
 * - **Arrastar pela alça fecha**, com a folha acompanhando o dedo e o véu
 *   clareando junto (`hooks/useArrastoDeFolha`). `paradas` liga pontos de
 *   parada intermediários; o padrão é só a altura cheia, porque o acervo não
 *   tem folha do Discord parada a meia altura para medir.
 * - **`env(safe-area-inset-bottom)`** no rodapé: o último item de uma lista não
 *   pode cair atrás da barra de gestos.
 * - **`overscroll-contain`**: rolar até o fim da folha não pode arrastar a
 *   página atrás dela.
 * - O véu fecha ao toque, e o Esc também (teclado externo existe em tablet).
 * - **A alça do topo é botão**, com rótulo "Fechar": o arrasto é o gesto de
 *   quem já conhece o padrão, e o Esc não existe num telefone. É a mesma saída
 *   visível que a folha do menu de contexto tem (`components/ui/ContextMenu.tsx`).
 * - **O "voltar" do Android desfaz a folha**, pelo mesmo hook de todas as
 *   camadas do celular. Sem ele o voltar atravessava a folha e desfazia a tela
 *   de baixo, deixando a folha no ar por cima de outra coisa.
 *
 * Nenhum chamador hoje: este arquivo é a moldura de referência das folhas do
 * app, e as que existem (menu de contexto, popover ancorado, cartão de perfil,
 * seletor de emoji) pintam a própria por já terem moldura anterior. As regras
 * acima valem para todas, e é por isso que elas moram aqui.
 */
export default function FolhaInferior({
  rotulo,
  titulo,
  onFechar,
  paradas,
  paradaInicial,
  children,
}: {
  /** rótulo acessível — a folha é um `dialog` que pode não ter título escrito. */
  rotulo: string;
  titulo?: ReactNode;
  onFechar: () => void;
  /** frações da altura da folha onde ela para (ver `useArrastoDeFolha`). */
  paradas?: readonly number[];
  paradaInicial?: number;
  children: ReactNode;
}) {
  // `ehMobile` e não `true`: a folha é de celular por construção, mas o hook do
  // "voltar" empurra uma entrada no histórico, e sequestrar o botão de voltar de
  // um navegador de mesa por engano é caro demais para se apoiar na convenção
  // do nome do arquivo.
  const ehMobile = useEhMobile();
  const veu = useRef<HTMLDivElement>(null);
  const folha = useRef<HTMLDivElement>(null);
  const alca = useRef<HTMLDivElement>(null);

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

  // `ligado` só no cliente: no servidor não há portal, e as refs ficam vazias
  const noCliente = typeof document !== "undefined";
  useArrastoDeFolha({
    ligado: noCliente,
    folha,
    veu,
    alca,
    paradas,
    paradaInicial,
    aoFechar: onFechar,
  });

  if (!noCliente) return null;

  return createPortal(
    <div
      ref={veu}
      className="anim-overlay fixed inset-0 z-[95] flex flex-col justify-end bg-background-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div
        ref={folha}
        role="dialog"
        aria-modal="true"
        aria-label={rotulo}
        /* raio de 32: ajuste de arco em quatro pontos da borda de cima de
           `discord-mobile-membros.png` (y = 160, 165, 170, 180 px) dá 60,7 a
           62,5 px = 30,8 a 31,7 pt; o antisserrilhado puxa a borda para dentro,
           e 32 é o valor redondo que cobre a faixa. Era `rounded-t-2xl` (16). */
        className="anim-folha flex max-h-[calc(100dvh_-_env(safe-area-inset-top)_-_36px)] flex-col overflow-hidden rounded-t-[32px] bg-background-surface-higher pb-[env(safe-area-inset-bottom)] shadow-popout will-change-transform"
      >
        {/*
          A zona de pegar é a alça **e** o título: é onde o dedo procura a folha,
          e as duas não rolam, então podem ter `touch-action: none` e ficar com
          o arrasto inteiro (o corpo não pode, ver `useArrastoDeFolha`).
        */}
        <div ref={alca} className="shrink-0 touch-none select-none">
          {/*
            A alça continua **botão**, para quem não conhece o gesto ter uma
            saída de verdade. O desenho é o de `discord-mobile-membros.png`
            (1,9707 px/pt): cápsula de 61×8 px = 31×4 pt, 8 px = 4 pt abaixo
            da borda da folha (y 157,5 → 165,5). Era 36×4 a 10 do topo.

            A caixa do botão fica nos 28px de antes, abaixo do piso de 44:
            subir para 44 empurraria o conteúdo 16px para baixo sem medida que
            sustente o respiro. A tensão fica registrada; o alvo é a largura
            toda da folha, e com título a zona de arrasto soma a altura dele.
          */}
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="flex h-[28px] w-full items-start justify-center pt-[4px]"
          >
            <span aria-hidden="true" className="h-[4px] w-[31px] rounded-full bg-border-normal" />
          </button>
          {titulo && (
            <h2 className="px-5 pb-1 pt-3 text-base font-semibold text-text-strong">{titulo}</h2>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
