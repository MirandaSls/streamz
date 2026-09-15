"use client";

import type { PublicUser } from "@streamz/shared";
import TooltipReacao from "@/components/chat/TooltipReacao";
import { EmojiDaReacao, rotuloDaReacao } from "@/components/chat/EmojiDeReacao";
import { alturaDoChipDeReacao, useSettings } from "@/stores/settings";

/**
 * A pílula de uma reação embaixo da mensagem, com a dica de quem reagiu.
 *
 * Mora aqui para as três listas de reação desenharem a mesma peça: a mensagem
 * comum (`MessageItem`), a narração do canal (`SystemMessageItem`) e o
 * visualizador de imagem no computador (`ImageModal`). Antes eram três cópias,
 * e a da narração já tinha divergido (altura fixa de 24 e emoji de 18).
 *
 * **Medidas** (print 1:1 `2026-08-31 124022.png`, linha y=322): a pílula
 * reagida vai de x=458 a x=509 (52px), com emoji de 20px e altura de 30 — os
 * dois já batem com `alturaDoChipDeReacao` e o tamanho padrão do emoji. A área
 * do número ocupa x=485–508 (24px): sem largura mínima o "1" ficava com a
 * largura do glifo e a pílula encolhia para ~20px de número. `min-w-3`
 * (12px) com `text-center` segura a caixa do número de um dígito; o resto dos
 * 24px é o `gap` e o `padding` que a pílula já tinha.
 *
 * **Cor do número** (`.reactionCount_f8896c`, `css-bruto`): `--text-subtle` em
 * repouso, `--reaction-text-hover` no `:hover` da pílula e
 * `--reaction-text-reacted-default` na reação minha (`.reactionMe`). No mesmo
 * print, o "1" da pílula reagida mede `#b6c5fb`, o tom claro da marca — por
 * isso o número não herda mais `text-strong`/`text-default` da pílula.
 */
export default function PilulaDeReacao({
  emoji,
  count,
  userIds,
  minha,
  conhecidos,
  onClick,
}: {
  emoji: string;
  count: number;
  userIds: string[];
  /** a reação inclui a minha (`.reactionMe`). */
  minha: boolean;
  /** quem pode aparecer na dica de "Fulano reagiu com…". */
  conhecidos: Map<string, PublicUser>;
  onClick: () => void;
}) {
  // o tamanho do emoji é preferência do usuário (aba Acessibilidade)
  const tamanhoEmoji = useSettings((s) => s.emojiSize);
  return (
    <TooltipReacao emoji={emoji} userIds={userIds} conhecidos={conhecidos}>
      <button
        type="button"
        aria-pressed={minha}
        aria-label={`${rotuloDaReacao(emoji)}, ${count} ${count === 1 ? "reação" : "reações"}`}
        onClick={onClick}
        style={{ height: alturaDoChipDeReacao(tamanhoEmoji) }}
        /* `min-h` (e não uma altura fixa) no celular: ele vence a altura em
           linha sem apagá-la, então quem aumentou o tamanho do emoji nas
           configurações continua com o chip maior — e quem está no padrão
           ganha os 44px de alvo que o dedo pede. */
        className={`group/reacao flex items-center gap-1.5 rounded-lg border px-1.5 transition celular:min-h-[44px] celular:px-3 ${
          minha
            ? "border-brand-500 bg-brand-500/20"
            : "border-transparent bg-background-base-lowest hover:border-border-normal"
        }`}
      >
        <EmojiDaReacao emoji={emoji} tamanho={tamanhoEmoji} />
        <span
          className={`min-w-3 text-center text-sm font-semibold leading-none ${
            minha
              ? "text-reaction-text-reacted-default"
              : "text-text-subtle group-hover/reacao:text-reaction-text-hover"
          }`}
        >
          {count}
        </span>
      </button>
    </TooltipReacao>
  );
}
