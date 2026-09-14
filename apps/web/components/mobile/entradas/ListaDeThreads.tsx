"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { Archive, ArchiveRestore, MessagesSquare, Pencil, Plus, Search } from "@/components/ui/icones";
import { displayNameOf, type ThreadView } from "@streamz/shared";
import { EstadoCarregando, EstadoVazio } from "@/components/mobile/entradas/pecas";
import Avatar from "@/components/ui/Avatar";
import { Tabs, TextInput } from "@/components/ui/primitivos";
import { horaCompleta } from "@/lib/format";
import { normalize } from "@/lib/quick-switcher";
import { useAuth } from "@/stores/auth";
import { useMessages } from "@/stores/messages";
import { useThreads } from "@/stores/messages-threads";
import { ui, type MenuItem } from "@/stores/ui";

type Filtro = "ativas" | "arquivadas";

/**
 * A aba "Threads" dos detalhes do canal no celular.
 *
 * Mesmos dados e mesmas ações do `ThreadsPopover` do desktop — a store
 * `useThreads`, a busca por nome, "ativas"/"arquivadas", criar, renomear e
 * arquivar —, num corpo de aba em vez da caixa pendurada no cabeçalho (o
 * popover é um botão com painel, e não expõe o conteúdo; ver "faltando").
 *
 * O que muda para o dedo:
 *
 * - o seletor "Threads Ativas ▾" do título vira as **duas pílulas** do primitivo
 *   `Tabs` (a variante de Amigos): um menu para escolher entre duas opções custa
 *   dois toques onde um basta;
 * - renomear e arquivar continuam **no toque longo** da linha, como o menu de
 *   contexto do desktop — o `AreaDeToqueLongo` do shell dispara o mesmo
 *   `contextmenu`;
 * - a linha tem no mínimo 60 de altura: a de membro do Discord no celular
 *   (`MEDIDAS.md` §10, passo de 59,9pt), a lista de nomes com avatar mais
 *   parecida que o acervo mede. O leiaute da linha de thread do Discord no
 *   celular **não está no acervo** (`threads-faq/*.png` são recortes de 181px
 *   sem escala) — o conteúdo é o do painel do desktop.
 *
 * Estado de erro: igual às fixadas, a store não distingue falha de lista vazia
 * (`stores/messages-threads.ts`, `load`) — "faltando".
 */
export default function ListaDeThreads({
  channelId,
  podeGerenciar,
}: {
  channelId: string;
  /** moderação do canal: renomeia e arquiva a thread de qualquer um. */
  podeGerenciar: boolean;
}) {
  const [filtro, setFiltro] = useState<Filtro>("ativas");
  const [busca, setBusca] = useState("");
  const me = useAuth((s) => s.user);
  const items = useThreads((s) => s.items);
  const loading = useThreads((s) => s.loading);
  const doCanal = useThreads((s) => s.channelId === channelId);
  // a thread nasce de uma mensagem raiz: sem mensagem no canal não há o que criar
  const ultimaMensagem = useMessages((s) => {
    const itens = s.byChannel[channelId]?.items ?? [];
    for (let i = itens.length - 1; i >= 0; i--) {
      if (!itens[i].pending && !itens[i].failed) return itens[i];
    }
    return null;
  });

  useEffect(() => {
    void useThreads.getState().load(channelId);
  }, [channelId]);

  const lista = useMemo(() => {
    const alvo = normalize(busca);
    return items
      .filter((t) => (filtro === "ativas" ? !t.archived : t.archived))
      .filter((t) => !alvo || normalize(t.name).includes(alvo));
  }, [items, filtro, busca]);

  function abrirMenu(e: MouseEvent, t: ThreadView) {
    e.preventDefault();
    const podeMexer = podeGerenciar || t.createdBy.id === me?.id;
    if (!podeMexer) return;
    const threads = useThreads.getState();
    const itens: MenuItem[] = [
      { label: "Renomear", icon: <Pencil size={18} />, onSelect: () => void threads.rename(channelId, t) },
      {
        label: t.archived ? "Reabrir" : "Arquivar",
        icon: t.archived ? <ArchiveRestore size={18} /> : <Archive size={18} />,
        onSelect: () => void threads.setArchived(channelId, t, !t.archived),
      },
    ];
    ui.openContextMenu(e.clientX, e.clientY, itens);
  }

  const carregando = loading || !doCanal;

  return (
    <div className="flex flex-col gap-3 px-4 pb-4 pt-4">
      <div className="flex items-center gap-2">
        {/* 44 de altura: piso de toque; o campo de busca de lista do desktop
            (`sm`, 32) seria o único alvo abaixo do piso nesta tela */}
        <TextInput
          tamanho={44}
          classeDaCaixa="min-w-0 flex-1 rounded-full"
          prefixo={<Search size={16} aria-hidden="true" className="shrink-0 text-input-icon-default" />}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          type="search"
          enterKeyHint="search"
          aria-label="Buscar threads"
          placeholder="Buscar threads"
        />
        <button
          type="button"
          disabled={!ultimaMensagem}
          onClick={() => {
            if (!ultimaMensagem) return;
            void useThreads.getState().create(channelId, ultimaMensagem.id, ultimaMensagem.content);
          }}
          aria-label="Criar thread"
          /* primário do Discord com a regra da marca: limão e tinta escura */
          className="grid h-[44px] w-[44px] shrink-0 place-items-center rounded-full bg-control-primary-background-default text-control-primary-text-default active:bg-control-primary-background-active disabled:opacity-50"
        >
          <Plus size={20} aria-hidden="true" />
        </button>
      </div>

      <Tabs
        variante="pilula"
        rotulo="Filtrar threads"
        valor={filtro}
        aoMudar={setFiltro}
        abas={[
          { valor: "ativas", rotulo: "Ativas" },
          { valor: "arquivadas", rotulo: "Arquivadas" },
        ]}
        /* a pílula mede 32 (Amigos, print 101638); o alvo cresce para 44 por
           fora do desenho só no celular, sem mexer no primitivo */
        className="[&>[role=tab]]:h-[44px]"
      />

      {carregando ? (
        <EstadoCarregando texto="Carregando threads…" />
      ) : lista.length === 0 ? (
        <EstadoVazio
          icone={<MessagesSquare size={40} />}
          titulo={
            busca
              ? "Nenhuma thread com esse nome."
              : filtro === "ativas"
                ? "Nenhuma thread ativa."
                : "Nenhuma thread arquivada."
          }
          dica={!busca && filtro === "ativas" ? "Segure uma mensagem e toque em Criar Tópico." : undefined}
        />
      ) : (
        <ul role="list" className="flex flex-col">
          {lista.map((t) => (
            <li key={t.id} onContextMenu={(e) => abrirMenu(e, t)}>
              <button
                type="button"
                onClick={() => void useMessages.getState().openThread(channelId, { id: t.id })}
                className="flex min-h-[60px] w-full flex-col justify-center rounded-lg px-2 py-2 text-left active:bg-interactive-background-hover"
              >
                <span className="block truncate font-medium text-text-strong">{t.name}</span>
                <span className="mt-0.5 flex min-w-0 items-center gap-2 text-text-xs text-text-muted">
                  <span className="flex shrink-0 -space-x-1.5" aria-hidden="true">
                    {t.participants.slice(0, 3).map((p) => (
                      <Avatar key={p.id} user={p} size="xs" className="ring-2 ring-background-base-lowest" />
                    ))}
                  </span>
                  <span className="min-w-0 truncate font-medium text-text-subtle">{displayNameOf(t.createdBy)}</span>
                  <span className="shrink-0">
                    {t.messageCount} {t.messageCount === 1 ? "mensagem" : "mensagens"}
                  </span>
                  <span className="ml-auto shrink-0 text-channels-default">
                    {horaCompleta(t.lastMessageAt ?? t.createdAt)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
