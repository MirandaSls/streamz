"use client";

import { CirclePlus } from "@/components/ui/icones";

/**
 * O balão de status personalizado do cartão de perfil — o "pensamento" que
 * sai do avatar, com as duas bolinhas que o ligam a ele.
 *
 * Medidas (CSS `css-bruto/853855.4346d2b716193468.css`, `.container_ab8609`,
 * `.outer_ab8609`, `.inner_ab8609`, confirmadas no print 1:1
 * `2026-08-31 101804`):
 *
 * - posição: `left 105`, `top banner − 7` = 98 (`.user-profile-popout
 *   .container_ab8609`). No print o balão começa em x=1449 = 1344 + 105 e em
 *   y=229 = 131 + 98;
 * - largura máxima 181 e mínima 42 (`.outer`); no print, x=1449–1629 = 181;
 * - fundo `--background-surface-highest` (#2c2d32 no print), borda 1px
 *   `--border-muted`, raio `--radius-lg` (16), `--shadow-low`;
 * - respiro 8 × 12 (`.inner`) e no máximo duas linhas (`.content`,
 *   `-webkit-line-clamp: 2`). Com duas linhas o print dá 54 de altura (y=229–282)
 *   = 8 + 2 × 18 + 8 + 2 de borda, que é a entrelinha de 18 do `text-text-sm`;
 * - as bolinhas: 20px em `left 10, top −8` (`.outer:before`) e 10px em
 *   `left −3, top −15` (`.outer:after`), com o mesmo fundo, borda e sombra.
 *
 * As bolinhas são pintadas **por cima** da borda do balão e **por baixo** do
 * miolo (`.inner` tem `position: relative` e fundo próprio): é isso que funde a
 * de 20px no balão sem o traço da borda atravessando. Aqui a ordem é a mesma —
 * elas vêm depois da caixa no DOM e o miolo sobe com `z-[1]`.
 *
 * O convite para mim (sem status definido) é o `.addStatusPrompt`: itálico em
 * `--text-muted` (#96979e no print, linha y=247, x=1484–1487). O ícone do CSS é
 * `--text-muted`, mas o print mede #abacb2 (x=1463–1476, glifo de 14px), que é
 * o `--icon-subtle`; vale o print. A caixa de 16 é a do acervo para esse glifo
 * de 14 — o tamanho da caixa não foi medido.
 *
 * O hover do balão editável do Discord soma 4% de branco ao fundo
 * (`.container_ab8609.editable_ab8609:hover`, `css-bruto/853855…css`) — o
 * `0.04` é literal no CSS deles, sem token; aqui entra como uma segunda
 * camada (`background-image`) por cima da cor sólida (`background-color`),
 * em `group-hover` e não em `hover`: só o balão CLICÁVEL — o meu — tem o
 * `.group` (no `<button>` do ramo `aoClicar`), então no balão de outra
 * pessoa (a `<div>` sem essa classe) o seletor nunca casa. Vale para a caixa
 * e para as duas bolinhas da cauda, que usam o mesmo fundo (`CONTORNO`); o
 * convite também muda de cor, como o `.outer:hover .addStatusPrompt` pede.
 */

/**
 * As frases do convite que aparecem nos prints 1:1: `101804`, `113533`,
 * `113603` e `180020`. O Discord sorteia; aqui a escolha é estável por usuário,
 * para o texto não trocar a cada vez que o cartão abre.
 */
const CONVITES = [
  "Pensamento de chuveiro?",
  "Acabei de subir de nível em...",
  "Qual a sua obsessão atualmente?",
  "Emoji mais usado ultimamente?",
];

function conviteDe(chave: string): string {
  let h = 0;
  for (let i = 0; i < chave.length; i++) h = (h * 31 + chave.charCodeAt(i)) >>> 0;
  return CONVITES[h % CONVITES.length];
}

/**
 * Os 4% de branco do hover editável (ver o comentário do topo do arquivo) —
 * uma segunda camada de fundo, então soma à cor sólida em vez de substituí-la.
 */
const HOVER_EDITAVEL = "group-hover:bg-[linear-gradient(rgb(255_255_255/0.04),rgb(255_255_255/0.04))]";

/** Fundo, borda e sombra são os mesmos na caixa e nas duas bolinhas. */
const CONTORNO = `border border-border-muted bg-background-surface-highest shadow-shadow-low ${HOVER_EDITAVEL}`;

export interface BalaoDeStatusProps {
  /** Texto do status. `null` com `aoClicar` desenha o convite; sem os dois, nada. */
  texto: string | null;
  /** Semente estável do convite (o id do usuário). */
  chave: string;
  /** Só no meu próprio cartão: o balão inteiro vira botão que edita o status. */
  aoClicar?: () => void;
  /**
   * Cópia invisível no fluxo, que reserva a altura do balão no cabeçalho
   * (`.referenceContainer_ab8609`: `visibility: hidden`, `margin-top −10`,
   * `margin-inline 109 12`). O balão de verdade é absoluto e não empurra nada;
   * sem a reserva o nome subiria por baixo dele.
   */
  reserva?: boolean;
}

export function BalaoDeStatus({ texto, chave, aoClicar, reserva = false }: BalaoDeStatusProps) {
  if (!texto && !aoClicar) return null;

  const conteudo = texto ? (
    <span className="line-clamp-2 break-words text-text-sm text-text-default">{texto}</span>
  ) : (
    <span className="line-clamp-2 text-text-sm text-text-muted transition-colors group-hover:text-text-default">
      <CirclePlus
        size={16}
        aria-hidden="true"
        className="mr-1 inline align-middle text-icon-subtle transition-colors group-hover:text-text-default"
      />
      <span className="pb-px pr-px align-middle italic">{conviteDe(chave)}</span>
    </span>
  );

  if (reserva) {
    // o `max-w-[155px]` do conteúdo é o `.referenceContainer > … > .content`:
    // 181 − 2 × 12 de respiro − 2 de borda, a mesma quebra de linha do balão
    return (
      <div aria-hidden="true" className="invisible pointer-events-none -mt-[10px] ml-[109px] mr-3 w-fit">
        <div className="min-w-[42px] border border-transparent px-3 py-2">
          <div className="max-w-[155px]">{conteudo}</div>
        </div>
      </div>
    );
  }

  const caixa = (
    <>
      <span
        className={`block min-w-[42px] max-w-[181px] overflow-hidden rounded-2xl border border-border-muted bg-background-surface-highest shadow-shadow-low ${HOVER_EDITAVEL}`}
      >
        <span className={`relative z-[1] mx-auto block w-fit bg-background-surface-highest px-3 py-2 ${HOVER_EDITAVEL}`}>
          {conteudo}
        </span>
      </span>
      <span aria-hidden="true" className={`absolute -top-2 left-[10px] h-5 w-5 rounded-full ${CONTORNO}`} />
      <span aria-hidden="true" className={`absolute -left-[3px] -top-[15px] h-2.5 w-2.5 rounded-full ${CONTORNO}`} />
    </>
  );

  if (aoClicar) {
    return (
      <button
        type="button"
        onClick={aoClicar}
        aria-label={texto ? `Editar status personalizado: ${texto}` : "Definir status personalizado"}
        className="group absolute left-[105px] top-[98px] z-[2] rounded-2xl text-left"
      >
        {caixa}
      </button>
    );
  }

  return <div className="absolute left-[105px] top-[98px] z-[2]">{caixa}</div>;
}
