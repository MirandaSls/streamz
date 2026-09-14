"use client";

import { useEffect, useState } from "react";
import { isTauri } from "@/lib/desktop";
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
import FriendRow, { FriendRowEsqueleto, RowAction } from "@/components/friends/FriendRow";
import { Button, TextInput } from "@/components/ui/primitivos";
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

/**
 * Título de seção da lista ("Online — 5"), com a linha que abre a lista.
 *
 * Medido no print do Discord: 14px, caixa mista, semibold, na cor clara dos
 * títulos, a 24px da borda (onde a busca começa); a linha de 1px fica 14px
 * abaixo da caixa do texto, começa 6px mais para dentro que o texto, e a
 * primeira linha de amigo vem colada nela. Era 12px em caixa alta e muted.
 *
 * A margem da linha é **assimétrica**, não `mx-[30px]`: `.divider_cc6179`
 * (`docs/referencias-discord/tokens/css-bruto/979862.64f198e8e991d925.css`)
 * é `margin-inline:30px 20px` — 30 à esquerda (os "6px mais para dentro" do
 * texto acima, que já estavam certos), **20** à direita, não 30. O nosso
 * `mx-[30px]` empurrava a ponta direita 10px além da borda da linha de amigo
 * (que termina 20px do próprio limite, `.peopleListItem_cc6179`, ver
 * `FriendRow.tsx`).
 */
function Secao({ label, count }: { label: string; count: number }) {
  return (
    <>
      <h3 className="mx-6 mt-6 text-sm font-semibold leading-5 text-text-strong">
        {label} — {count}
      </h3>
      <div aria-hidden="true" className="ml-[30px] mr-5 mt-3.5 h-px bg-border-subtle" />
    </>
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
  // `isTauri()` só é verdadeiro no cliente: decidir no primeiro render faria o
  // servidor e o navegador desenharem coisas diferentes e a hidratação reclamar.
  // Mesmo padrão do `BarraDeTitulo`.
  const [noDesktop, setNoDesktop] = useState(false);
  useEffect(() => setNoDesktop(isTauri()), []);

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
    <main className="flex min-w-0 flex-1 flex-col bg-background-base-lower">
      {/* sem `shadow-elevation-low`: o cabeçalho do Discord tem borda e mais nada. Nós
          tínhamos a borda **e** 2px de sombra por baixo, o que engrossa a linha
          e faz a faixa parecer flutuar sobre o conteúdo. */}
      {/*
        No celular o cabeçalho **rola na horizontal** em vez de estourar.

        Medido em 390×844 antes desta mudança: a faixa media 553px de conteúdo
        numa tela de 390 e o shell do celular a cortava com `overflow-hidden` —
        "Adicionar amigo" saía pela metade e as abas "Pendente" e "Bloqueado",
        quando existiam, ficavam inteiramente fora da tela, sem nenhum jeito de
        alcançá-las. Três decisões, todas atrás de `celular:`:

        - **a identidade sai**: o título "Amigos" já está no cabeçalho de 48px
          da tela empilhada (`components/mobile/telas-de-conversa`), e repetido
          aqui gastava 100px da faixa dizendo o que já estava dito;
        - **o grupo da direita sai**: a caixa de entrada é uma aba do rodapé no
          celular e "Nova mensagem de grupo" é o "+" da lista de conversas —
          os dois botões existiam aqui em duplicata, e a ajuda é inerte;
        - **o que sobra rola**: `overflow-x-auto` na faixa, `snap` nos itens e
          alvos de 44px. Rolar uma fileira de abas é o gesto do próprio
          Discord no celular.
        No desktop nada disto se aplica: a faixa continua sendo a linha única
        de 48px com identidade, abas e o grupo da direita.
      */}
      <header className="relative z-10 flex h-12 shrink-0 items-center gap-[7px] border-b border-border-subtle pl-7 pr-5 celular:h-[56px] celular:gap-0 celular:px-0">
        <span className="text-text-muted celular:hidden" aria-hidden="true">
          <Amigos size={21} />
        </span>
        {/* mesmo tamanho das abas e do botão: no Discord todo texto desta faixa
            mede o mesmo, e só a cor os separa. O nosso título era maior. */}
        <h1 className="shrink-0 text-base font-semibold text-text-strong celular:hidden">Amigos</h1>
        {/* ponto, não traço: no Discord o separador do cabeçalho de Amigos é uma
            bolinha de 4px centrada na faixa. O traço vertical lia como divisória
            de seção, que é outra coisa. */}
        <span aria-hidden="true" className="mx-3 h-1 w-1 shrink-0 rounded-full bg-interactive-background-selected celular:hidden" />

        <nav
          aria-label="Filtrar amigos"
          className="flex items-center gap-4 celular:h-full celular:min-w-0 celular:flex-1 celular:snap-x celular:gap-2 celular:overflow-x-auto celular:px-3 celular:[scrollbar-width:none]"
        >
          {abasVisiveis(pendentes, blocked.length).map((a) => (
            <button
              key={a.id}
              type="button"
              aria-pressed={tab === a.id}
              onClick={() => setTab(a.id)}
              className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-base font-medium transition celular:h-[44px] celular:shrink-0 celular:snap-start ${
                tab === a.id ? "bg-interactive-background-selected text-text-strong" : "text-text-subtle hover:bg-interactive-background-hover hover:text-text-strong"
              }`}
            >
              {a.label}
              {a.id === "pendentes" && pendentes > 0 && (
                // texto claro sobre o vermelho de aviso: mesmo token que o botão
                // "crítico" usa para o par fundo/texto (rule 6 — nada de branco cru)
                <span className="grid h-4 min-w-4 place-items-center rounded-full bg-status-danger px-1 text-[11px] font-bold leading-none text-control-critical-primary-text-default">
                  {pendentes}
                </span>
              )}
            </button>
          ))}
          {/*
            Botão primário do primitivo (limão, texto escuro), não um chip de
            aba — o print real (`docs/Reference/Captura de tela 2026-08-31
            101638.png`, aba Amigos) não muda a cor deste botão quando ele está
            selecionado: em `…124052.png` (aba "Adicionar amigo" já ativa) ele
            continua com o mesmo preenchimento sólido. Por isso não há mais
            estado "ativo" em verde-de-status aqui — só o `Button` primário.

            Altura: medida agora em `…101638.png`, coluna x=780 (miolo do
            botão, longe de letra e canto) — sólido de y=47 a y=78 (32px, com
            a borda de 1px de cada lado incluída); a mesma medida sai da pílula
            selecionada "Disponível" ao lado (coluna x=520, mesmíssimo
            y=47–78). 32px bate exato com o degrau `sm` do `Button` (já medido
            e documentado no cabeçalho de `primitivos/Button.tsx` a partir de
            outro print), não com os 28px que a revisão apontou — por isso
            uso `sm`, não um número novo.
          */}
          <Button
            variante="primario"
            tamanho="sm"
            aria-pressed={tab === "adicionar"}
            onClick={() => setTab("adicionar")}
            className="celular:h-[44px] celular:shrink-0 celular:snap-start"
          >
            Adicionar amigo
          </Button>
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-4 celular:hidden">
          <HeaderIcon
            label="Nova mensagem de grupo"
            onClick={() => ui.openModal({ kind: "createGroupDM" })}
          >
            <UserPlus size={24} />
          </HeaderIcon>
          {/*
            No desktop a caixa de entrada e a ajuda vivem na barra de título
            (`components/desktop/BarraDeTitulo.tsx`), então repeti-las aqui seria
            o mesmo botão duas vezes na mesma tela. No navegador não há barra de
            título, e elas continuam aqui — é o que o Discord web faz.

            Se a barra de título deixar de carregar as duas, isto aqui vira um
            buraco: as opções somem do desktop sem substituto.
          */}
          {!noDesktop && (
            <>
              <InboxPopover />
              {/* sem central de ajuda no MVP: melhor o botão assumir isso que sumir */}
              <HeaderIcon label="Ajuda" disabled>
                <HelpCircle size={24} />
              </HeaderIcon>
            </>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {loading && !loaded && (
          <div role="list" aria-label="Carregando amigos">
            {Array.from({ length: 6 }).map((_, i) => (
              <FriendRowEsqueleto key={i} />
            ))}
          </div>
        )}

        {tab !== "adicionar" && (
          /* 12px entre a borda do cabeçalho e a busca (medido); era 16 */
          <div className="px-6 pt-3">
            <TextInput
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              type="search"
              aria-label="Buscar amigos"
              placeholder="Buscar"
              classeDaCaixa="w-full"
              // lupa à esquerda: é onde o print põe, e é onde o olho procura o
              // que a caixa faz antes de começar a digitar
              prefixo={<Search size={18} aria-hidden="true" className="shrink-0 text-text-muted" />}
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
