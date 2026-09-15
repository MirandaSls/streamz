/**
 * Fundo da linha de mensagem por estado, e a faixa de 2px à esquerda que
 * acompanha os estados "chamando atenção".
 *
 * Tudo sai de `css-bruto/524434.02151*.css` (módulo `__5126c`, o `.message__`
 * da lista do chat):
 *
 * | estado | repouso | hover | faixa (`:before`, 2px) |
 * |---|---|---|---|
 * | comum | — | `--message-background-hover` | — |
 * | menção a mim (`.mentioned`) | `--message-mentioned-background-default` | `--message-mentioned-background-hover` | `--icon-feedback-warning` |
 * | destaque do "ir para" (`.highlighted`) | `--message-highlight-background-default` | `--message-highlight-background-hover` | `--text-brand` |
 * | alvo da resposta em curso (`.replying`) | `--message-highlight-background-default` | `--brand-10a` | `--brand-500` |
 * | efêmera (`.ephemeral`) | `--brand-05a` | `--brand-10a` | `--brand-500` |
 *
 * A faixa é `position:absolute; inset-inline-start:0; top:0; bottom:0;
 * width:2px` (a mesma regra para os cinco estados) — não uma borda: borda
 * empurraria o conteúdo 2px para a direita só nas mensagens marcadas, e o
 * texto deixaria de alinhar com o das vizinhas.
 *
 * `--brand-10a` não existe no `tokens.css` gerado; é o `--brand-500` a 10%
 * (blurple → limão pela regra mecânica da ADR-0009 §3.1), daí `bg-brand-500/10`.
 * A efêmera usa `efem`/`efemhov` (`tailwind.config.ts`). O repouso, 4% do limão,
 * saiu do print de `docs/Reference/efemeras/` — print vence CSS (ADR-0009 §7) e
 * o `--brand-05a` do CSS daria 5%. O hover não tem print: fica nos 10% do
 * `--brand-10a` que o `.ephemeral__5126c:hover` declara.
 *
 * **Selecionada** (menu de contexto aberto sobre a mensagem): o Discord mantém
 * a linha com o fundo de hover enquanto o menu dela está aberto, mesmo com o
 * ponteiro fora — sem faixa. Vem depois de destaque, resposta e menção (esses
 * já pintam um fundo próprio que diz mais) e antes da efêmera, que não tem menu.
 *
 * A ordem das perguntas repete a cascata do CSS: `.highlighted,.replying` são
 * declarados depois de `.mentioned`, então ganham quando os dois valem.
 */
export interface EstadoDaLinha {
  destacada: boolean;
  respondendo: boolean;
  mencionada: boolean;
  /** o menu de contexto desta mensagem está aberto. */
  selecionada: boolean;
  efemera: boolean;
}

export interface FundoDaLinha {
  /** classes de fundo (repouso + hover) da linha inteira. */
  fundo: string;
  /** classe de cor da faixa de 2px, ou `null` quando o estado não tem faixa. */
  faixa: string | null;
}

export function fundoDaLinha(e: EstadoDaLinha): FundoDaLinha {
  if (e.destacada) {
    return {
      fundo: "bg-message-highlight-background-default hover:bg-message-highlight-background-hover",
      faixa: "bg-text-brand",
    };
  }
  if (e.respondendo) {
    return {
      fundo: "bg-message-highlight-background-default hover:bg-brand-500/10",
      faixa: "bg-brand-500",
    };
  }
  if (e.mencionada) {
    return {
      fundo: "bg-message-mentioned-background-default hover:bg-message-mentioned-background-hover",
      faixa: "bg-icon-feedback-warning",
    };
  }
  if (e.selecionada) {
    return { fundo: "bg-message-background-hover", faixa: null };
  }
  if (e.efemera) {
    return { fundo: "bg-efem hover:bg-efemhov", faixa: "bg-brand-500" };
  }
  return { fundo: "hover:bg-message-background-hover", faixa: null };
}
