"use client";

import { useMemo } from "react";
import { displayNameOf, type TextDisplay } from "@streamz/shared";
import { Markdown } from "@/lib/markdown";
import { useAuth } from "@/stores/auth";
import { useGuilds } from "@/stores/guilds";
import { usePermissions } from "@/stores/permissions";

/** Sem cargos: referência estável, para o seletor do zustand não oscilar. */
const SEM_CARGOS: string[] = [];

/**
 * ── onda 3 (cartão 3e) ── Text Display (`type: 10`): markdown **completo**,
 * igual ao `content` de uma mensagem comum — não o corpo 14px/pre-line do
 * embed. `desenvolvedores/imagens/componentes/v2-text-display.webp` mostra
 * título `#`, parágrafo, lista, bloco de código, link e emoji dentro do mesmo
 * text display: é exatamente a gramática que `parseBlocks`/`Markdown` (`lib/
 * markdown-core.ts`, `lib/markdown.tsx`) já cobrem para o composer normal, sem
 * nenhuma classe extra — por isso este componente não redefine tamanho de
 * fonte nem entrelinha (ao contrário de `EmbedDeBot`, que sobrescreve para o
 * corpo 14px do embed). `Markdown` devolve `<span class="contents">`, então o
 * `<div>` daqui é só a caixa de bloco que os vizinhos (`Section`, `Container`)
 * empilham.
 *
 * As opções de markdown (nomes de exibição, cor de cargo) são as mesmas que
 * `EmbedDeBot.tsx` já monta (`useOpcoesDoMarkdown`, não exportado de lá) —
 * duplicado aqui porque o cartão só pode tocar `v2/**`; é o mesmo padrão, não
 * uma decisão nova.
 */
export default function TextDisplayDeBot({ componente }: { componente: TextDisplay }) {
  const opcoes = useOpcoesDoMarkdown();
  return (
    <div className="min-w-0 break-words">
      <Markdown text={componente.content} {...opcoes} />
    </div>
  );
}

function useOpcoesDoMarkdown() {
  const me = useAuth((s) => s.user);
  const roles = usePermissions((s) => s.roles);
  const members = useGuilds((s) => s.members);
  const meusCargos = useGuilds((s) => s.members.find((m) => m.user.id === me?.id)?.roleIds ?? SEM_CARGOS);
  const displayNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of members) map[m.user.username.toLowerCase()] = displayNameOf(m.user);
    return map;
  }, [members]);
  return useMemo(
    () => ({ meUsername: me?.username, displayNames, roles, myRoleIds: meusCargos }),
    [me?.username, displayNames, roles, meusCargos],
  );
}
