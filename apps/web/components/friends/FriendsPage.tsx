"use client";

import { useEffect, useState } from "react";
import {
  Amigos,
  Check,
  HelpCircle,
  MessageSquare,
  Search,
  UserMinus,
  UserPlus,
  UserX,
  X,
} from "@/components/ui/icones";
import { displayNameOf, type PublicUser } from "@streamz/shared";
import HeaderIcon from "@/components/chat/HeaderIcon";
import InboxPopover from "@/components/chat/InboxPopover";
import AddFriend from "@/components/friends/AddFriend";
import EstadoVazio from "@/components/friends/EstadoVazio";
import FriendRow, { RowAction } from "@/components/friends/FriendRow";
import { useDMs } from "@/stores/dms";
import { useFriends, type FriendsTab } from "@/stores/friends";
import { resolveStatus, usePresence } from "@/stores/presence";
import { ui, type MenuItem } from "@/stores/ui";

/**
 * Rótulos no singular, como no Discord em pt-BR: a aba nomeia o *estado* de uma
 * relação ("Pendente"), não o conjunto.
 */
const ABAS: { id: FriendsTab; label: string }[] = [
  { id: "online", label: "Disponível" },
  { id: "todos", label: "Todos" },
  { id: "pendentes", label: "Pendente" },
  { id: "bloqueados", label: "Bloqueado" },
];

/**
 * "Pendente" e "Bloqueado" só aparecem quando têm conteúdo.
 *
 * É o que o print mostra: com nenhum pedido e ninguém bloqueado, a fileira tem
 * só "Disponível" e "Todos". Aba que nunca vai a lugar nenhum é ruído — e as
 * duas passam a maior parte do tempo vazias, ao contrário das outras.
 */
function abasVisiveis(pendentes: number, bloqueados: number) {
  return ABAS.filter(
    (a) =>
      (a.id !== "pendentes" || pendentes > 0) && (a.id !== "bloqueados" || bloqueados > 0),
  );
}

/** Título de seção da lista ("DISPONÍVEL — 3"), com a linha que abre a lista. */
function Secao({ label, count }: { label: string; count: number }) {
  return (
    <h3 className="mx-[30px] mb-2 mt-6 border-b border-border pb-2 text-xs font-semibold uppercase tracking-[0.02em] text-txt-muted">
      {label} — {count}
    </h3>
  );
}

/**
 * A home do modo DM: a página Amigos.
 *
 * Ocupa a coluna 3 no lugar da conversa (`DMView` decide qual mostrar). As abas
 * são só filtros sobre as listas que a store já tem — trocar de aba não vai ao
 * servidor. "Atividade" não existe aqui: o MVP não tem atividade de jogo.
 *
 * O cabeçalho é desenhado aqui, e não com `HeaderBar`: lá as abas cairiam em
 * `tools`, que vive dentro de um `ml-auto` (empurraria tudo para a direita), e a
 * busca é obrigatória no componente — nesta página ela pertence ao corpo, acima
 * da lista, porque é ela que filtra a lista.
 */
export default function FriendsPage() {
  const { friends, incoming, outgoing, blocked, loading, loaded } = useFriends();
  const tab = useFriends((s) => s.tab);
  const setTab = useFriends((s) => s.setTab);
  const load = useFriends((s) => s.load);
  const accept = useFriends((s) => s.accept);
  const dismiss = useFriends((s) => s.dismiss);
  const remove = useFriends((s) => s.remove);
  const block = useFriends((s) => s.block);
  const unblock = useFriends((s) => s.unblock);
  const openWith = useDMs((s) => s.openWith);
  const statuses = usePresence((s) => s.statuses);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    void load();
  }, [load]);

  const consulta = busca.trim().toLowerCase();
  /** Filtra por nome de exibição **ou** usuário: os dois estão na linha. */
  function combina(u: PublicUser) {
    return (
      !consulta ||
      displayNameOf(u).toLowerCase().includes(consulta) ||
      u.username.toLowerCase().includes(consulta)
    );
  }

  const todos = friends.filter(combina);
  const online = todos.filter((f) => resolveStatus(statuses, f) !== "OFFLINE");
  const recebidos = incoming.filter((r) => combina(r.user));
  const enviados = outgoing.filter((r) => combina(r.user));
  const bloqueados = blocked.filter(combina);
  /** o badge da aba conta o total, não o resultado da busca */
  const pendentes = incoming.length + outgoing.length;

  function perfil(user: PublicUser): MenuItem {
    return {
      label: "Perfil",
      onSelect: () => ui.openModal({ kind: "userProfile", userId: user.id }),
    };
  }

  function menuDeAmigo(user: PublicUser): MenuItem[] {
    return [
      perfil(user),
      { label: "Mensagem", icon: <MessageSquare size={18} />, onSelect: () => void openWith(user.id) },
      { separator: true },
      {
        label: "Remover amigo",
        icon: <UserMinus size={18} />,
        danger: true,
        onSelect: () => void remove(user),
      },
      { label: "Bloquear", icon: <UserX size={18} />, danger: true, onSelect: () => void block(user) },
    ];
  }

  function menuDeRecebido(requestId: string, user: PublicUser): MenuItem[] {
    return [
      perfil(user),
      { label: "Aceitar", icon: <Check size={18} />, onSelect: () => void accept(requestId) },
      { label: "Recusar", icon: <X size={18} />, danger: true, onSelect: () => void dismiss(requestId) },
      { separator: true },
      { label: "Bloquear", icon: <UserX size={18} />, danger: true, onSelect: () => void block(user) },
    ];
  }

  function menuDeEnviado(requestId: string, user: PublicUser): MenuItem[] {
    return [
      perfil(user),
      {
        label: "Cancelar pedido",
        icon: <X size={18} />,
        danger: true,
        onSelect: () => void dismiss(requestId),
      },
      { label: "Bloquear", icon: <UserX size={18} />, danger: true, onSelect: () => void block(user) },
    ];
  }

  function menuDeBloqueado(user: PublicUser): MenuItem[] {
    return [
      perfil(user),
      { label: "Desbloquear", icon: <UserMinus size={18} />, onSelect: () => void unblock(user.id) },
    ];
  }

  /** Estado vazio de "a busca não achou nada" — distinto de "a lista é vazia". */
  function semResultado() {
    return (
      <EstadoVazio
        arte="busca"
        titulo="Nada encontrado"
        texto={`Ninguém com “${busca.trim()}” nesta aba. Confira o nome de usuário.`}
      />
    );
  }

  function listaDeAmigos(itens: PublicUser[], rotulo: string, vazio: "online" | "todos") {
    if (itens.length === 0) {
      if (consulta) return semResultado();
      return vazio === "online" ? (
        <EstadoVazio
          arte="online"
          titulo="Ninguém por perto"
          texto="Quando um amigo ficar disponível, ele aparece aqui."
        />
      ) : (
        <EstadoVazio
          arte="amigos"
          titulo="Você ainda não tem amigos"
          texto="Use “Adicionar amigo” para mandar um pedido pelo nome de usuário."
        />
      );
    }
    return (
      <>
        <Secao label={rotulo} count={itens.length} />
        <div role="list">
          {itens.map((u) => (
            <FriendRow
              key={u.id}
              user={u}
              menu={menuDeAmigo(u)}
              onOpen={() => void openWith(u.id)}
              actions={
                <RowAction label={`Conversar com ${displayNameOf(u)}`} onClick={() => void openWith(u.id)}>
                  <MessageSquare size={20} />
                </RowAction>
              }
            />
          ))}
        </div>
      </>
    );
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-chat">
      <header className="relative z-10 flex h-[49px] shrink-0 items-center gap-2 border-b border-border px-4 shadow-header">
        <span className="text-txt-muted" aria-hidden="true">
          <Amigos size={24} />
        </span>
        <h1 className="shrink-0 font-semibold text-txt-primary">Amigos</h1>
        <span aria-hidden="true" className="mx-2 h-6 w-px shrink-0 bg-border" />

        <nav aria-label="Filtrar amigos" className="flex items-center gap-1">
          {abasVisiveis(pendentes, blocked.length).map((a) => (
            <button
              key={a.id}
              type="button"
              aria-pressed={tab === a.id}
              onClick={() => setTab(a.id)}
              className={`flex h-6 items-center gap-1.5 rounded-[4px] px-2 text-sm font-medium transition ${
                tab === a.id ? "bg-sel text-txt-primary" : "text-txt-secondary hover:bg-hov hover:text-txt-primary"
              }`}
            >
              {a.label}
              {a.id === "pendentes" && pendentes > 0 && (
                <span className="grid h-4 min-w-4 place-items-center rounded-full bg-red px-1 text-[11px] font-bold leading-none text-white">
                  {pendentes}
                </span>
              )}
            </button>
          ))}
          {/* ação primária: 32px de altura e largura mínima, não um chip de aba */}
          <button
            type="button"
            aria-pressed={tab === "adicionar"}
            onClick={() => setTab("adicionar")}
            className={`ml-2 h-8 rounded-[4px] px-4 text-sm font-medium transition ${
              tab === "adicionar"
                ? "bg-green/20 text-green"
                : "bg-green text-accent-ink hover:bg-green/80"
            }`}
          >
            Adicionar amigo
          </button>
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-4">
          <HeaderIcon
            label="Nova mensagem de grupo"
            onClick={() => ui.openModal({ kind: "createGroupDM" })}
          >
            <UserPlus size={24} />
          </HeaderIcon>
          <InboxPopover />
          {/* sem central de ajuda no MVP: melhor o botão assumir isso que sumir */}
          <HeaderIcon label="Ajuda" disabled>
            <HelpCircle size={24} />
          </HeaderIcon>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {loading && !loaded && <p className="px-[30px] py-6 text-sm text-txt-muted">Carregando…</p>}

        {tab !== "adicionar" && (
          <div className="relative px-[30px] pt-4">
            {/* lupa à esquerda: é onde o print põe, e é onde o olho procura o
                que a caixa faz antes de começar a digitar */}
            <Search
              size={18}
              aria-hidden="true"
              className="pointer-events-none absolute left-[42px] top-[26px] text-txt-muted"
            />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              type="search"
              aria-label="Buscar amigos"
              placeholder="Buscar"
              className="h-10 w-full rounded-[4px] bg-rail pl-10 pr-3 text-sm text-txt-normal outline-none placeholder:text-txt-muted"
            />
          </div>
        )}

        {tab === "adicionar" && <AddFriend />}
        {tab === "online" && listaDeAmigos(online, "Online", "online")}
        {tab === "todos" && listaDeAmigos(todos, "Todos os amigos", "todos")}

        {tab === "pendentes" &&
          (recebidos.length + enviados.length === 0 ? (
            consulta ? (
              semResultado()
            ) : (
              <EstadoVazio
                arte="pendentes"
                titulo="Nada pendente"
                texto="Quando alguém te mandar um pedido de amizade, ele aparece aqui."
              />
            )
          ) : (
            <>
              {recebidos.length > 0 && <Secao label="Recebidos" count={recebidos.length} />}
              <div role="list">
                {recebidos.map((r) => (
                  <FriendRow
                    key={r.id}
                    user={r.user}
                    subtitle="Pedido de amizade recebido"
                    menu={menuDeRecebido(r.id, r.user)}
                    actions={
                      <>
                        <RowAction label="Aceitar" positive onClick={() => void accept(r.id)}>
                          <Check size={20} />
                        </RowAction>
                        <RowAction label="Recusar" danger onClick={() => void dismiss(r.id)}>
                          <X size={20} />
                        </RowAction>
                      </>
                    }
                  />
                ))}
              </div>
              {enviados.length > 0 && <Secao label="Enviados" count={enviados.length} />}
              <div role="list">
                {enviados.map((r) => (
                  <FriendRow
                    key={r.id}
                    user={r.user}
                    subtitle="Pedido de amizade enviado"
                    menu={menuDeEnviado(r.id, r.user)}
                    actions={
                      <RowAction label="Cancelar pedido" danger onClick={() => void dismiss(r.id)}>
                        <X size={20} />
                      </RowAction>
                    }
                  />
                ))}
              </div>
            </>
          ))}

        {tab === "bloqueados" &&
          (bloqueados.length === 0 ? (
            consulta ? (
              semResultado()
            ) : (
              <EstadoVazio
                arte="bloqueados"
                titulo="Ninguém bloqueado"
                texto="Você não bloqueou ninguém. Quem for bloqueado não abre conversa com você."
              />
            )
          ) : (
            <>
              <Secao label="Bloqueado" count={bloqueados.length} />
              <div role="list">
                {bloqueados.map((u) => (
                  <FriendRow
                    key={u.id}
                    user={u}
                    subtitle="Bloqueado"
                    menu={menuDeBloqueado(u)}
                    actions={
                      <RowAction label="Desbloquear" onClick={() => void unblock(u.id)}>
                        <UserMinus size={20} />
                      </RowAction>
                    }
                  />
                ))}
              </div>
            </>
          ))}
      </div>
    </main>
  );
}
