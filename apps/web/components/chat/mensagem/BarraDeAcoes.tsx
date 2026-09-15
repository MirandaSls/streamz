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
 * hover da própria barra, `--shadow-medium`. Borda `--border-muted` (4%), a do
 * CSS: no print 111402 (hover simples) ela mede `#29292d` sobre o miolo
 * `#242429` (coluna x=1500, y=465 e y=498; linha y=480, x=1363), que é o
 * `--border-muted` composto. O `#303035` do print 124022 (coluna x=1105,
 * y=391), que tinha levado a borda para `--border-subtle`, é o estado com o
 * menu da mensagem aberto, não o hover.
 *
 * **Separador** (`.separator_f84418`): 1×24px, `margin: 2px 4px`, raio pleno,
 * `--border-subtle` (no print, `#323237` em x=1454).
 *
 * **Posição** (`.container__040f0`, que embrulha a barra):
 * `position:absolute; inset-inline-end:0; top:-25px; padding-inline:32px 14px`.
 * Os 32px da esquerda não pintam nada: são área de hover, para a barra não
 * sumir quando o ponteiro atravessa a folga entre o texto e ela. Os −25 conferem
 * com o print 124022 (barra começa em y=391, 25px acima da linha em y=416;
 * termina 14px antes da borda direita da linha), que é linha sem cabeçalho.
 * Na mensagem **com cabeçalho** (nome e hora) o print 111402 dá outra altura:
 * barra em y=465–498 sobre "elle", linha de base do nome em y=498 — o pé da
 * barra encosta na base do nome, 33px do topo da barra até ela. Com a base do
 * nome 18px abaixo do topo da linha (2 de respiro + a linha de 22), isso é
 * `top:-15px`; com −25 a nossa captura ficava 10px alta (base do nome em
 * y=524, barra em 481). Daí `cabecalho`.
 *
 * No primeiro item da lista ela desce para dentro da linha: subindo, seria
 * cortada pelo topo da área rolável.
 *
 * **Sem permissão:** quem não pode reagir não vê as reações nem o "Adicionar
 * reação" (e com eles some o separador, que separa justamente esses dois
 * grupos); quem não pode escrever no canal não vê o "Responder". É o que a UI
 * faz em todo o app — esconder o que a API recusaria. Só some com `false`:
 * `null` é "as permissões do servidor ainda estão carregando" (logo depois de
 * trocar de servidor), e esconder nesse meio-tempo fazia os botões piscarem.
 *
 * **Selecionada:** com o menu de contexto da mensagem aberto, a barra fica
 * visível mesmo sem o ponteiro em cima
 * (`.message__5126c.selected__5126c .buttons__5126c{opacity:1}`).
 *
 * **Narração** (`sistema`): a linha de sistema só tem "Adicionar reação" e
 * "Mais" — não se responde, edita nem encaminha um aviso do canal. Sem print
 * da barra sobre narração; a caixa e os botões são os mesmos.
 */
export default function BarraDeAcoes({
  primeiro,
  cabecalho = false,
  selecionada = false,
  sistema = false,
  rapidas = [],
  propria = false,
  podeReagir,
  podeResponder = null,
  onReagir,
  onAbrirSeletor,
  onEditar,
  onResponder,
  onEncaminhar,
  onMais,
}: {
  /** primeiro item desenhado na lista: a barra não pode sair por cima. */
  primeiro: boolean;
  /** a linha começa com nome e hora (cozy, início de grupo): a barra desce para −15. */
  cabecalho?: boolean;
  /** o menu de contexto desta mensagem está aberto: a barra fica à vista. */
  selecionada?: boolean;
  /** linha de narração: só "Adicionar reação" e "Mais". */
  sistema?: boolean;
  /** as reações rápidas (o Discord mostra três). */
  rapidas?: readonly string[];
  propria?: boolean;
  /** `null` = ainda não se sabe (permissões carregando): o botão fica. */
  podeReagir: boolean | null;
  podeResponder?: boolean | null;
  onReagir?: (emoji: string) => void;
  onAbrirSeletor: Clique;
  onEditar?: () => void;
  onResponder?: () => void;
  onEncaminhar?: Clique;
  onMais: Clique;
}) {
  const reacoes = podeReagir !== false;
  const topo = primeiro ? "top-0.5" : cabecalho ? "top-[-15px]" : "top-[-25px]";
  return (
    <div
      // `block` e não `flex` no invólucro: quem é flex é a caixa de dentro; o
      // invólucro só carrega a posição e a área de hover dos 32px
      className={`absolute right-0 z-[1] pl-8 pr-[14px] ${
        selecionada ? "block" : "hidden group-focus-within:block group-hover:block"
      } ${topo}`}
    >
      <div
        role="group"
        aria-label="Ações da mensagem"
        className="flex items-center rounded-lg border border-border-muted bg-background-surface-high p-0.5 shadow-shadow-low hover:shadow-shadow-medium"
      >
        {reacoes && !sistema && onReagir && (
          <>
            {rapidas.map((emoji) => (
              <Acao key={emoji} rotulo={`Reagir com ${rotuloDaReacao(emoji)}`} onClick={() => onReagir(emoji)}>
                <EmojiDaReacao emoji={emoji} tamanho={20} />
              </Acao>
            ))}
            {rapidas.length > 0 && (
              <span aria-hidden="true" className="mx-1 my-0.5 h-6 w-px shrink-0 rounded-full bg-border-subtle" />
            )}
          </>
        )}
        {reacoes && (
          <Acao rotulo="Adicionar reação" onClick={onAbrirSeletor}>
            <SmilePlus size={20} />
          </Acao>
        )}
        {!sistema &&
          (propria
            ? onEditar && (
                <Acao rotulo="Editar" onClick={onEditar}>
                  <Pencil size={20} />
                </Acao>
              )
            : podeResponder !== false &&
              onResponder && (
                <Acao rotulo="Responder" onClick={onResponder}>
                  <CornerUpLeft size={20} />
                </Acao>
              ))}
        {!sistema && onEncaminhar && (
          <Acao rotulo="Encaminhar" onClick={onEncaminhar}>
            <CornerUpRight size={20} />
          </Acao>
        )}
        <Acao rotulo="Mais" onClick={onMais}>
          <MoreHorizontal size={20} />
        </Acao>
      </div>
    </div>
  );
}
