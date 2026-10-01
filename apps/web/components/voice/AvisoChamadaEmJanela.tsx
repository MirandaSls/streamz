"use client";

import { CHAVE_DA_JANELA_DA_CHAMADA, useJanelasDeVoz } from "@/stores/janelas-de-voz";

/**
 * Ocupa o lugar do grid no palco da aba principal enquanto a chamada está numa
 * janela solta: o vídeo é desenhado lá, e desenhar de novo aqui duplicaria
 * `<video>` e assinaturas. A barra de controles da aba continua funcionando.
 */
export default function AvisoChamadaEmJanela() {
  return (
    <div className="grid h-full w-full place-items-center px-4 text-center">
      <div className="flex flex-col items-center gap-3">
        <p className="text-sm text-text-default">Esta chamada está aberta em outra janela</p>
        <button
          type="button"
          onClick={() => useJanelasDeVoz.getState().fechar(CHAVE_DA_JANELA_DA_CHAMADA)}
          className="rounded-[3px] bg-white/15 px-3 py-1.5 text-sm font-semibold transition hover:bg-white/25"
        >
          Trazer de volta
        </button>
      </div>
    </div>
  );
}
