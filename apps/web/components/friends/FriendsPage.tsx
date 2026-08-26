"use client";

import { useEffect, type ReactNode } from "react";
import { Check, MessageSquare, UserMinus, UserX, Users, X } from "lucide-react";
import { displayNameOf } from "@streamz/shared";
import AddFriend from "@/components/friends/AddFriend";
import FriendRow, { RowAction } from "@/components/friends/FriendRow";
import HeaderBar from "@/components/chat/HeaderBar";
import { useDMs } from "@/stores/dms";
import { useFriends, type FriendsTab } from "@/stores/friends";
import { resolveStatus, usePresence } from "@/stores/presence";
import { ui, type MenuItem } from "@/stores/ui";

const ABAS: { id: FriendsTab; label: string }[] = [
  { id: "online", label: "Online" },
  { id: "todos", label: "Todos" },
  { id: "pendentes", label: "Pendentes" },
  { id: "bloqueados", label: "Bloqueados" },
];

/** Estado vazio ilustrado: círculo com o ícone, título e a explicação. */
function Vazio({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="mt-16 grid place-items-center px-8 text-center">
      <div className="grid h-[68px] w-[68px] place-items-center rounded-full bg-[#41434a] text-txt-secondary">
        {icon}
      </div>
      <h3 className="mt-4 text-lg font-semibold text-txt-primary">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-txt-muted">{text}</p>
    </div>
  );
}

/** Título de seção da lista ("ONLINE — 3"). */
function Secao({ label, count }: { label: string; count: number }) {
  return (
    <h3 className="mx-[30px] mb-2 mt-4 text-xs font-semibold uppercase tracking-[0.02em] text-txt-muted">
      {label} — {count}
    </h3>
  );
}

/**
 * A home do modo DM: a página Amigos do Discord.
 *
 * Ocupa a coluna 3 no lugar da conversa (`DMView` decide qual mostrar). As abas
 * são só filtros sobre as listas que a store já tem — trocar de aba não vai ao
 * servidor. "Atividade" não existe aqui: o MVP não tem atividade de jogo.
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

  useEffect(() => {
    void load();
  }, [load]);

  const online = friends.filter((f) => resolveStatus(statuses, f) !== "OFFLINE");
  const pendentes = incoming.length + outgoing.length;

  function menuDeAmigo(user: (typeof friends)[number]): MenuItem[] {
    return [
      { label: "Perfil", onSelect: () => ui.openModal({ kind: "userProfile", userId: user.id }) },
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

  function listaDeAmigos(itens: typeof friends, rotulo: string) {
    if (itens.length === 0) {
      return (
        <Vazio
          icon={<MessageSquare size={32} />}
          title={rotulo === "Online" ? "Ninguém por perto" : "Você ainda não tem amigos"}
          text={
            rotulo === "Online"
              ? "Quando um amigo ficar online, ele aparece aqui."
              : "Use a aba “Adicionar amigo” para mandar um pedido pelo nome de usuário."
          }
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
      <HeaderBar
        icon={<Users size={24} />}
        title="Amigos"
        searchLabel="Buscar amigos"
        onSearch={() => setTab("todos")}
        tools={
          <div className="flex items-center gap-1">
            <span aria-hidden="true" className="mx-2 h-6 w-px bg-[#3f4147]" />
            {ABAS.map((a) => (
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
            <button
              type="button"
              aria-pressed={tab === "adicionar"}
              onClick={() => setTab("adicionar")}
              className={`ml-1 h-6 rounded-[4px] px-2 text-sm font-medium transition ${
                tab === "adicionar"
                  ? "bg-green/20 text-green"
                  : "bg-green text-white hover:bg-green/80"
              }`}
            >
              Adicionar amigo
            </button>
          </div>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {loading && !loaded && <p className="px-[30px] py-6 text-sm text-txt-muted">Carregando…</p>}

        {tab === "adicionar" && <AddFriend />}
        {tab === "online" && listaDeAmigos(online, "Online")}
        {tab === "todos" && listaDeAmigos(friends, "Todos os amigos")}

        {tab === "pendentes" &&
          (pendentes === 0 ? (
            <Vazio
              icon={<Check size={32} />}
              title="Nada pendente"
              text="Quando alguém te mandar um pedido de amizade, ele aparece aqui."
            />
          ) : (
            <>
              {incoming.length > 0 && <Secao label="Recebidos" count={incoming.length} />}
              <div role="list">
                {incoming.map((r) => (
                  <FriendRow
                    key={r.id}
                    user={r.user}
                    subtitle="Pedido de amizade recebido"
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
              {outgoing.length > 0 && <Secao label="Enviados" count={outgoing.length} />}
              <div role="list">
                {outgoing.map((r) => (
                  <FriendRow
                    key={r.id}
                    user={r.user}
                    subtitle="Pedido de amizade enviado"
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
          (blocked.length === 0 ? (
            <Vazio
              icon={<UserX size={32} />}
              title="Ninguém bloqueado"
              text="Você não bloqueou ninguém. Quem for bloqueado não abre conversa com você."
            />
          ) : (
            <>
              <Secao label="Bloqueados" count={blocked.length} />
              <div role="list">
                {blocked.map((u) => (
                  <FriendRow
                    key={u.id}
                    user={u}
                    subtitle="Bloqueado"
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
