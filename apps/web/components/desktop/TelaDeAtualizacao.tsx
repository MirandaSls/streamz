"use client";

import IconeAnimado from "@/components/ui/IconeAnimado";
import type { Atualizacao } from "./useAtualizacao";

/**
 * A tela cheia de "Atualizando o Streamz" do app de desktop — a do Discord.
 *
 * Antes disto, atualizar era: a setinha verde virava um anel de progresso de
 * 24px na barra de título e, no fim, a janela do instalador NSIS aparecia por
 * cima do app (`installMode: "passive"`). Agora o instalador roda em silêncio
 * (`"quiet"`) e **quem mostra o progresso é o app**, que é o único jeito de
 * isso parecer parte do produto e não um programa de terceiros.
 *
 * Fica acima de tudo (`z-[110]`), inclusive da barra de título: durante a
 * atualização não há app para usar, e a janela do atualizador do Discord também
 * não tem controles. O que continua funcionando é o arrasto
 * (`data-tauri-drag-region` no fundo inteiro, para a janela poder sair da
 * frente) e o menu da bandeja, que tem "Sair". Só o erro oferece saída pela
 * própria tela — ninguém fica preso numa atualização que não vai acontecer.
 *
 * Os estados vêm inteiros de `useAtualizacao`; aqui não há lógica de rede, só a
 * tradução de estado em frase. Ver lá por que `"reiniciando"` quase nunca
 * aparece no Windows.
 */
export default function TelaDeAtualizacao({
  atualizacao,
  onFechar,
}: {
  atualizacao: Atualizacao;
  /** Fecha a tela e devolve o app — só oferecido no erro. */
  onFechar: () => void;
}) {
  const { estado, versao, progresso, iniciar } = atualizacao;
  const porcentagem = Math.round(progresso * 100);
  const falhou = estado === "erro";
  const instalada = estado === "pronta";

  const titulo = falhou
    ? "Não foi possível atualizar"
    : instalada
      ? "Atualização instalada"
      : "Atualizando o Streamz";

  const subtexto = falhou
    ? "A atualização não terminou. Verifique sua conexão e tente de novo."
    : instalada
      ? `A versão ${versao ?? "nova"} está instalada. Reinicie para começar a usar.`
      : estado === "instalando"
        ? "Instalando…"
        : estado === "reiniciando"
          ? "Reiniciando…"
          : `Baixando a versão ${versao ?? "nova"}…`;

  // a barra some no erro (não há o que medir) e no "pronta" (acabou)
  const mostrarBarra = !falhou && !instalada;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      data-tauri-drag-region
      className="anim-overlay fixed inset-0 z-[110] flex select-none flex-col items-center justify-center gap-8 bg-chat px-8"
    >
      <IconeAnimado size={96} />

      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-xl font-semibold text-txt-primary">{titulo}</h1>
        <p aria-live="polite" className="text-sm text-txt-muted">
          {subtexto}
        </p>
      </div>

      {mostrarBarra && (
        <div className="flex w-[320px] flex-col items-center gap-2">
          {/* trilho no tom do composer, preenchimento no limão da marca — os
              mesmos tokens do resto do app, sem cor nova */}
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={porcentagem}
            aria-label="Progresso da atualização"
            className="h-1.5 w-full overflow-hidden rounded-full bg-input"
          >
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-150 ease-linear"
              style={{ width: `${porcentagem}%` }}
            />
          </div>
          <span className="text-xs tabular-nums text-txt-muted">{porcentagem}%</span>
        </div>
      )}

      {(falhou || instalada) && (
        <div className="flex items-center gap-3">
          {falhou && (
            <button
              type="button"
              onClick={onFechar}
              className="h-9 rounded-[3px] px-4 text-sm text-txt-normal underline-offset-2 transition hover:underline"
            >
              Agora não
            </button>
          )}
          <button
            type="button"
            onClick={() => void iniciar()}
            className="h-9 rounded-[3px] bg-accent px-5 text-sm font-medium text-accent-ink transition hover:bg-accent-hover"
          >
            {falhou ? "Tentar de novo" : "Reiniciar agora"}
          </button>
        </div>
      )}
    </div>
  );
}
