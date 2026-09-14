"use client";

import type { MouseEvent, ReactNode } from "react";
import {
  CornerUpLeft,
  CornerUpRight,
  MoreHorizontal,
  Pencil,
  SmilePlus,
} from "@/components/ui/icones";
import { EmojiDaReacao, rotuloDaReacao } from "@/components/chat/EmojiDeReacao";
import { BotaoDeIcone } from "@/components/ui/primitivos";

type Clique = (e: MouseEvent<HTMLButtonElement>) => void;

/**
 * Um botão da barra. 28×28 com raio 6.
 *
 * O lado vem do **print**, não do CSS: em `2026-08-31 111402.png` a barra mede
 * 34px de altura (coluna x=1568: borda em y=465, miolo 466–497, borda em 498)
 * = borda 1 + respiro 2 + botão 28 + respiro 2 + borda 1, e os emoji andam de
 * 28 em 28px (glifos em x=1371, 1398, 1426). O `.hoverBarButton_f84418` do CSS
 * capturado dá 24 (padding 2 + ícone 20); quando os dois divergem vale o print
 * (ADR-0009 §7). O raio de 6px e o glifo de 20px são do mesmo seletor.
 *
 * `tamanho={28}` põe a caixa em `style`, que nenhuma classe sobrescreve, e
 * `rounded-[6px]` vence o `rounded-lg` do lado numérico do primitivo por ser
 * valor arbitrário (o Tailwind emite os arbitrários depois dos nomeados).
 */
function Acao({ rotulo, onClick, children }: { rotulo: string; onClick: Clique; children: ReactNode }) {
  return (
    <BotaoDeIcone
      rotulo={rotulo}
      icone={children}
      onClick={onClick}
      tamanho={28}
      fundo="hover"
      className="rounded-[6px]"
    />
  );
}

/**
 * A barra de ações que aparece no hover da mensagem.
 *
 * **Ordem e conteúdo** (print 1:1 `2026-08-31 111402.png`, mensagem de outra
 * pessoa, barra em x 1363–1573): três reações rápidas, um separador, "Adicionar
 * reação", "Responder", "Encaminhar" e "Mais". Largura conferida pela conta:
 * 1 + 2 + 28×3 + (4 + 1 + 4) + 28×4 + 2 + 1 = 211px = 1573 − 1363 + 1.
 * Na mensagem própria o "Responder" dá lugar ao "Editar" (sem print da barra
 * sobre mensagem própria — mantido do comportamento anterior, não medido).
 *
 * **Caixa** (`.popover_f84418`, `css-bruto/sob-demanda/982186.7b5a8*.css`):
 * `background: --background-surface-high` — confirmado no print, o miolo
 * amostra `#242429` —, raio 8, `padding: 2px`, `box-shadow: --shadow-low` e, no
 * hover da própria barra, `--shadow-medium`. A borda do CSS é `--border-muted`
 * (4%), mas o print mostra `#303035` sobre o miolo `#242429` (124022, coluna
 * x=1105, y=391), que é o `--border-subtle` (12%) composto — print vence.
 *
 * **Separador** (`.separator_f84418`): 1×24px, `margin: 2px 4px`, raio pleno,
 * `--border-subtle` (no print, `#323237` em x=1454).
 *
 * **Posição** (`.container__040f0`, que embrulha a barra):
 * `position:absolute; inset-inline-end:0; top:-25px; padding-inline:32px 14px`.
 * Os 32px da esquerda não pintam nada: são área de hover, para a barra não
 * sumir quando o ponteiro atravessa a folga entre o texto e ela. Confere com o
 * print 124022 (barra começa em y=391, 25px acima da linha em y=416; termina
 * 14px antes da borda direita da linha).
 *
 * No primeiro item da lista ela desce para dentro da linha: subindo, seria
 * cortada pelo topo da área rolável.
 *
 * **Sem permissão:** quem não pode reagir não vê as reações nem o "Adicionar
 * reação" (e com eles some o separador, que separa justamente esses dois
 * grupos); quem não pode escrever no canal não vê o "Responder". É o que a UI
 * faz em todo o app — esconder o que a API recusaria.
 */
export default function BarraDeAcoes({
  primeiro,
  rapidas,
  propria,
  podeReagir,
  podeResponder,
  onReagir,
  onAbrirSeletor,
  onEditar,
  onResponder,
  onEncaminhar,
  onMais,
}: {
  /** primeiro item desenhado na lista: a barra não pode sair por cima. */
  primeiro: boolean;
  /** as reações rápidas (o Discord mostra três). */
  rapidas: readonly string[];
  propria: boolean;
  podeReagir: boolean;
  podeResponder: boolean;
  onReagir: (emoji: string) => void;
  onAbrirSeletor: Clique;
  onEditar: () => void;
  onResponder: () => void;
  onEncaminhar: Clique;
  onMais: Clique;
}) {
  return (
    <div
      // `block` e não `flex` no invólucro: quem é flex é a caixa de dentro; o
      // invólucro só carrega a posição e a área de hover dos 32px
      className={`absolute right-0 z-[1] hidden pl-8 pr-[14px] group-focus-within:block group-hover:block ${
        primeiro ? "top-0.5" : "top-[-25px]"
      }`}
    >
      <div
        role="group"
        aria-label="Ações da mensagem"
        className="flex items-center rounded-lg border border-border-subtle bg-background-surface-high p-0.5 shadow-shadow-low hover:shadow-shadow-medium"
      >
        {podeReagir && (
          <>
            {rapidas.map((emoji) => (
              <Acao key={emoji} rotulo={`Reagir com ${rotuloDaReacao(emoji)}`} onClick={() => onReagir(emoji)}>
                <EmojiDaReacao emoji={emoji} tamanho={20} />
              </Acao>
            ))}
            {rapidas.length > 0 && (
              <span aria-hidden="true" className="mx-1 my-0.5 h-6 w-px shrink-0 rounded-full bg-border-subtle" />
            )}
            <Acao rotulo="Adicionar reação" onClick={onAbrirSeletor}>
              <SmilePlus size={20} />
            </Acao>
          </>
        )}
        {propria ? (
          <Acao rotulo="Editar" onClick={onEditar}>
            <Pencil size={20} />
          </Acao>
        ) : (
          podeResponder && (
            <Acao rotulo="Responder" onClick={onResponder}>
              <CornerUpLeft size={20} />
            </Acao>
          )
        )}
        <Acao rotulo="Encaminhar" onClick={onEncaminhar}>
          <CornerUpRight size={20} />
        </Acao>
        <Acao rotulo="Mais" onClick={onMais}>
          <MoreHorizontal size={20} />
        </Acao>
      </div>
    </div>
  );
}
