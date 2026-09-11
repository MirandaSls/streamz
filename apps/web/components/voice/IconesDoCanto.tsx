"use client";

import { Maximize, Minimize } from "@/components/ui/icones";
import { BotaoDeIcone } from "@/components/ui/primitivos";

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
      <BotaoDeIcone
        rotulo={telaCheia ? "Sair da tela cheia" : "Tela cheia"}
        icone={telaCheia ? <Minimize size={22} /> : <Maximize size={22} />}
        ativo={telaCheia}
        comFundo
        onClick={onTelaCheia}
      />
    </div>
  );
}
