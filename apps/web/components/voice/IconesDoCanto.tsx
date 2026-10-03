"use client";

import { ExternalLink, Maximize, Minimize } from "@/components/ui/icones";
import { BotaoDeIcone } from "@/components/ui/primitivos";
import { podeAbrirJanelaSolta } from "@/lib/janela-solta";
import { classeDaMoldura } from "@/components/voice/moldura-animada";
import type { PropsDaMoldura } from "@/components/voice/useOcultarInativo";

/**
 * Os ícones do canto inferior direito do palco.
 *
 * No Discord são dois — abrir a call numa janela à parte e tela cheia — e ficam
 * **soltos**, fora de qualquer cápsula: são ações sobre a janela, não sobre a
 * chamada, e misturá-las com o microfone confundiria as duas coisas.
 *
 * **São dois, e continuam dois.** Expandir o palco dentro da janela (o modo
 * `ui.palcoExpandido`) é ação sobre o leiaute, não sobre a janela, e por isso
 * tem canto próprio — a seta do canto inferior **esquerdo**, que é onde o
 * Discord põe a dele (`BotaoDeExpandir`, em `CallStage.tsx`, com a medida).
 * Um terceiro ícone aqui desmancharia o par que o print 101857 mediu, e
 * deixaria dois glifos parecidos ("expandir" e "tela cheia") colados, com a
 * dica como única diferença entre duas ações que não são a mesma.
 *
 * Medido na print `2026-08-31 101857` (1:1, 1918×905):
 * - glifo de **20px** nos dois (pop-out x=1829–1849 / y=856–875; tela cheia
 *   x=1877–1896 / y=857–874) → `BotaoDeIcone` `md` (caixa 32, ícone 20);
 * - centros em x≈1839 e x≈1886,5: 47,5 entre eles, isto é, 16 de vão entre
 *   caixas de 32 (`gap-4`);
 * - centro vertical em y≈865,5 no Discord — mas o alvo aqui não é essa medida
 *   fixa: é o centro da cápsula de desligar que o usuário escolheu (`Capsula`,
 *   `controles-de-chamada.tsx`).
 * O lugar deste par — canto direito, centro vertical alinhado à cápsula, 16px
 * da borda — não é mais desta peça: quem posiciona é `FileiraDeControles`
 * (grid `1fr auto 1fr`), que também esconde o par quando falta largura, antes
 * de ele encostar na cápsula.
 * A cor do glifo na print é `#9d9ea5`, entre `--icon-muted` (`#96979e`, o
 * repouso do primitivo) e `--icon-subtle`; fica a do primitivo.
 *
 * O pop-out abre a chamada inteira numa janela solta (`lib/janela-solta.ts`) e
 * some onde a plataforma não abre janela (app de celular).
 */
export default function IconesDoCanto({
  telaCheia,
  onTelaCheia,
  visivel,
  moldura,
  emJanela,
  onAbrirEmJanela,
}: {
  telaCheia: boolean;
  onTelaCheia: () => void;
  visivel: boolean;
  moldura?: PropsDaMoldura;
  emJanela: boolean;
  onAbrirEmJanela: () => void;
}) {
  return (
    <div
      {...moldura}
      className={`flex items-center gap-4 ${classeDaMoldura(visivel, "baixo")}`}
    >
      {podeAbrirJanelaSolta() && (
        <BotaoDeIcone
          rotulo={emJanela ? "Voltar para a chamada" : "Abrir em janela à parte"}
          icone={<ExternalLink size={24} />}
          tamanho="lg"
          comFundo
          onClick={onAbrirEmJanela}
        />
      )}
      <BotaoDeIcone
        rotulo={telaCheia ? "Sair da tela cheia" : "Tela cheia"}
        icone={telaCheia ? <Minimize size={24} /> : <Maximize size={24} />}
        tamanho="lg"
        ativo={telaCheia}
        comFundo
        onClick={onTelaCheia}
      />
    </div>
  );
}
