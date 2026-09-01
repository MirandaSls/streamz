"use client";

import { Maximize, Minimize } from "lucide-react";
import Tooltip from "@/components/ui/Tooltip";

/**
 * Os ícones do canto inferior direito do palco.
 *
 * No Discord são dois — abrir a call numa janela à parte e tela cheia — e ficam
 * **soltos**, fora de qualquer cápsula: são ações sobre a janela, não sobre a
 * chamada, e misturá-las com o microfone confundiria as duas coisas. Era esse o
 * erro de manter "Tela cheia" dentro do menu "…", onde ela também custava dois
 * cliques.
 *
 * O pop-out ainda não existe aqui: na web ele depende da API de
 * document-picture-in-picture, que é outro trabalho. Um ícone que não faz nada
 * seria pior que a falta dele.
 */
export default function IconesDoCanto({
  telaCheia,
  onTelaCheia,
  visivel,
  moldura,
}: {
  telaCheia: boolean;
  onTelaCheia: () => void;
  visivel: boolean;
  moldura?: { onPointerEnter: () => void; onPointerLeave: () => void };
}) {
  return (
    <div
      {...moldura}
      className={`absolute bottom-7 right-6 z-10 flex items-center gap-2 transition-opacity duration-200 ${
        visivel ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <Tooltip label={telaCheia ? "Sair da tela cheia" : "Tela cheia"}>
        <button
          type="button"
          onClick={onTelaCheia}
          aria-label={telaCheia ? "Sair da tela cheia" : "Tela cheia"}
          aria-pressed={telaCheia}
          className="grid h-9 w-9 place-items-center rounded-[4px] text-txt-secondary transition hover:bg-white/10 hover:text-txt-primary"
        >
          {telaCheia ? <Minimize size={22} /> : <Maximize size={22} />}
        </button>
      </Tooltip>
    </div>
  );
}
