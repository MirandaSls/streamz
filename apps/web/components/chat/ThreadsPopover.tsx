"use client";

import { useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  MessagesSquare,
  Pencil,
  Plus,
} from "@/components/ui/icones";
import { displayNameOf, type ThreadView } from "@streamz/shared";
import HeaderPopover from "@/components/chat/HeaderPopover";
import Avatar from "@/components/ui/Avatar";
import { MENU_WIDTH } from "@/components/ui/ContextMenu";
import { horaCompleta } from "@/lib/format";
import { normalize } from "@/lib/quick-switcher";
import { useAuth } from "@/stores/auth";
import { useMessages } from "@/stores/messages";
import { useThreads } from "@/stores/messages-threads";
import { ui, type MenuItem } from "@/stores/ui";

/**
 * Botão "Threads" do cabeçalho e o painel que ele abre.
 *
 * O painel do Discord não tem abas: tem um **seletor** no título ("Threads
 * Ativas ▾"), a busca e o botão de criar. Renomear e arquivar não ficam
 * expostos na linha da thread — são o menu de contexto do item, como em toda
 * lista do app.
 */
type Aba = "ativas" | "arquivadas";

const ROTULO_DA_ABA: Record<Aba, string> = {
  ativas: "Threads Ativas",
  arquivadas: "Threads Arquivadas",
};

export default function ThreadsPopover({
  channelId,
  canManage,
}: {
  channelId: string;
  /** moderação do canal: pode renomear/arquivar thread de qualquer um. */
  canManage: boolean;
}) {
  const [aba, setAba] = useState<Aba>("ativas");
  const [busca, setBusca] = useState("");
  const me = useAuth((s) => s.user);
  const items = useThreads((s) => s.items);
  const loading = useThreads((s) => s.loading);
  const load = useThreads((s) => s.load);
  const criar = useThreads((s) => s.create);
  const rename = useThreads((s) => s.rename);
  const setArchived = useThreads((s) => s.setArchived);
  const openThread = useMessages((s) => s.openThread);
  // a thread nasce de uma mensagem raiz: sem mensagem no canal não há o que criar
  const ultimaMensagem = useMessages((s) => {
    const itens = s.byChannel[channelId]?.items ?? [];
    for (let i = itens.length - 1; i >= 0; i--) {
      if (!itens[i].pending && !itens[i].failed) return itens[i];
    }
    return null;
  });

  const lista = useMemo(() => {
    const alvo = normalize(busca);
    return items
      .filter((t) => (aba === "ativas" ? !t.archived : t.archived))
      .filter((t) => !alvo || normalize(t.name).includes(alvo));
  }, [items, aba, busca]);

  function abrirSeletor(x: number, y: number) {
    const itens: MenuItem[] = (["ativas", "arquivadas"] as const).map((k) => ({
      label: ROTULO_DA_ABA[k],
      control: "radio" as const,
      checked: aba === k,
      onSelect: () => setAba(k),
    }));
    ui.openContextMenu(x, y, itens);
  }

  function abrirMenuDaThread(t: ThreadView, x: number, y: number) {
    // renomear/arquivar: quem criou a thread ou a moderação do canal
    const podeMexer = canManage || t.createdBy.id === me?.id;
    if (!podeMexer) return;
    ui.openContextMenu(
      x,
      y,
      [
        {
          label: "Renomear",
          icon: <Pencil size={18} />,
          onSelect: () => void rename(channelId, t),
        },
        {
          label: t.archived ? "Reabrir" : "Arquivar",
          icon: t.archived ? <ArchiveRestore size={18} /> : <Archive size={18} />,
          onSelect: () => void setArchived(channelId, t, !t.archived),
        },
      ],
      MENU_WIDTH,
    );
  }

  return (
    <HeaderPopover
      label="Threads"
      title={ROTULO_DA_ABA[aba]}
      contagem={lista.length}
      // 21 para 18,2×18,4 de tinta (bbox do caminho: 69,2×70 do quadro de 80),
      // a mesma dos vizinhos do cabeçalho (`Users` a 22 → 18,3; Discord 18)
      icon={<MessagesSquare size={21} />}
      onOpen={() => void load(channelId)}
      busca={{ valor: busca, aoMudar: setBusca, placeholder: "Buscar threads" }}
      tituloControle={() => (
        <button
          type="button"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            abrirSeletor(r.left, r.bottom + 4);
          }}
          className="flex min-w-0 items-center gap-1 font-semibold text-txt-primary hover:text-accent"
        >
          <span className="truncate">{ROTULO_DA_ABA[aba]}</span>
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      )}
      action={
        <button
          type="button"
          disabled={!ultimaMensagem}
          onClick={() => {
            if (!ultimaMensagem) return;
            void criar(channelId, ultimaMensagem.id, ultimaMensagem.content);
          }}
          className="flex h-6 items-center gap-1 rounded-[3px] bg-accent px-2 text-xs font-medium text-accent-ink transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={14} aria-hidden="true" />
          Criar Thread
        </button>
      }
    >
      {(fechar) => (
        <>
          {loading && <p className="p-4 text-center text-sm text-txt-muted">Carregando…</p>}

          {!loading && lista.length === 0 && (
            <div className="p-6 text-center">
              <MessagesSquare size={32} aria-hidden="true" className="mx-auto mb-2 text-txt-faint" />
              <p className="text-sm text-txt-muted">
                {busca
                  ? "Nenhuma thread com esse nome."
                  : aba === "ativas"
                    ? "Nenhuma thread ativa. Crie uma a partir de uma mensagem."
                    : "Nenhuma thread arquivada."}
              </p>
            </div>
          )}

          {lista.map((t) => (
            <div
              key={t.id}
              onContextMenu={(e) => {
                e.preventDefault();
                abrirMenuDaThread(t, e.clientX, e.clientY);
              }}
              className="mb-1 rounded-[5px] last:mb-0 hover:bg-hov"
            >
              <button
                type="button"
                onClick={() => {
                  fechar();
                  void openThread(channelId, { id: t.id });
                }}
                className="w-full rounded-[5px] p-2 text-left"
              >
                <span className="block truncate font-medium text-txt-primary">{t.name}</span>
                <span className="mt-0.5 flex items-center gap-2 text-xs text-txt-muted">
                  <span className="flex -space-x-1.5" aria-hidden="true">
                    {t.participants.map((p) => (
                      <Avatar key={p.id} user={p} size="xs" className="ring-2 ring-overlay" />
                    ))}
                  </span>
                  <span className="shrink-0 font-medium text-txt-secondary">
                    {displayNameOf(t.createdBy)}
                  </span>
                  <span className="shrink-0">
                    {t.messageCount} {t.messageCount === 1 ? "mensagem" : "mensagens"}
                  </span>
                  <span className="ml-auto shrink-0 text-txt-faint">
                    {t.lastMessageAt ? horaCompleta(t.lastMessageAt) : horaCompleta(t.createdAt)}
                  </span>
                </span>
              </button>
            </div>
          ))}
        </>
      )}
    </HeaderPopover>
  );
}
