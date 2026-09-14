"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { AtSign, Crown, MessageSquare, User, UserMinus, UserPlus, UserX } from "@/components/ui/icones";
import {
  displayNameOf,
  isGroupChannel,
  MAX_DM_GROUP_INVITEES,
  type DMChannelView,
  type PublicUser,
} from "@streamz/shared";
import Avatar from "@/components/ui/Avatar";
import TagDeBot from "@/components/ui/TagDeBot";
import Tooltip from "@/components/ui/Tooltip";
import { MENU_WIDTH } from "@/components/ui/ContextMenu";
import { BotaoDeIcone, Button } from "@/components/ui/primitivos";
import { api } from "@/lib/api";
import { mencionar } from "@/lib/mencoes";
import { useAuth } from "@/stores/auth";
import { useDMs } from "@/stores/dms";
import { useFriends } from "@/stores/friends";
import { resolveStatus, resolveUser, usePresence } from "@/stores/presence";
import { useSettings } from "@/stores/settings";
import { anchorOf, ui, type MenuItem } from "@/stores/ui";

/**
 * Coluna 4 no modo DM: os participantes da conversa.
 *
 * O botão de membros do cabeçalho da DM alterna esta coluna, como faz a lista
 * de membros do servidor. A lista vem do servidor (`GET /dms/:id/members`) e é
 * recarregada quando a conversa muda de participantes — a store só guarda os
 * "outros", que não bastam para mostrar o dono e a mim mesmo na ordem certa.
 *
 * Medidas (sem print 1:1 de grupo com a lista aberta — o painel é o mesmo
 * componente do Discord por trás, então a origem é o CSS bruto dele):
 * - **267px → 264px**: `--custom-member-list-width` (VARIAVEIS.md linha 1369;
 *   `css-bruto/245758…css` `.membersWrap_c8ffbb{min-width:var(--custom-member-list-width)}`).
 *   Era uma contagem solta de pixel no print antigo, sem token — a mesma
 *   correção que `MemberList.tsx` (lista de membros do servidor) já fez.
 * - **Fundo `-lowest` → `-lower`**: `.container_c8ffbb{background:var(--background-gradient-chat,var(--custom-channel-members-bg))}`
 *   com `--custom-channel-members-bg:var(--background-base-lower)` no mesmo
 *   arquivo — é a MESMA superfície da lista de membros do servidor, não a do
 *   rail/coluna de canais.
 * - **Linha do membro**: `css-bruto/40791.c561f069b6270133.css` tem
 *   `.member__5d473`/`.icon__5d473`/`.offline__5d473`/`.ownerIcon__5d473` — o
 *   módulo da linha (`max-width:calc(var(--custom-member-list-width) - 16px)`,
 *   `.offline{opacity:.3}`, ícone `14×14`) bate exatamente com o que já
 *   tínhamos (linha `opacity-30`, `Crown size={14}`), com uma exceção: a coroa
 *   é `color: var(--text-feedback-warning)` lá, não `--status-warning` (os
 *   dois têm valor diferente — `#ea9800` × `#fdb833`).
 * - **Cabeçalho "MEMBROS — N"**: não há print do grupo aberto nem classe de
 *   texto no CSS capturado (só o contêiner `.membersGroupHeader_c8ffbb`/
 *   `.membersGroupName_c8ffbb`, sem tipografia). O rótulo e o "— N" vêm do
 *   cartão; o tamanho/peso seguem a legenda medida do Discord
 *   (`.eyebrow_…{font-size:12px;font-weight:700;letter-spacing:.02em;
 *   line-height:1.333;text-transform:uppercase}`, `css-bruto/121046…css`) —
 *   é o mesmo padrão de caixa-alta que o resto do app usa para cabeçalho de
 *   lista (`text-xs font-bold uppercase tracking-[0.02em]`). O `pt-5` (20px)
 *   vem de `--space-lg` em `.membersGroup_c8ffbb{padding-block:var(--space-lg) …}`.
 *   **Não medido**: se o Discord real usa "Membros" aqui ou nenhum cabeçalho
 *   nesta tela específica (grupo pequeno, sem seção por cargo) — ver "faltando".
 */
export default function DMMemberList({ dm }: { dm: DMChannelView }) {
  const me = useAuth((s) => s.user);
  const [members, setMembers] = useState<PublicUser[]>([]);
  // `carregando` no primeiro fetch e em cada nova tentativa; `erro` quando o
  // servidor não responde (o catch antigo virava lista vazia igual a "sem
  // ninguém", e as duas coisas são estados diferentes: um pede "tentar de
  // novo", o outro não pede nada).
  const [estado, setEstado] = useState<"carregando" | "erro" | "pronto">("carregando");
  const [tentativa, setTentativa] = useState(0);
  const statuses = usePresence((s) => s.statuses);
  const profiles = usePresence((s) => s.profiles);
  const openWith = useDMs((s) => s.openWith);
  const removeMember = useDMs((s) => s.removeMember);
  const block = useFriends((s) => s.block);
  const remove = useFriends((s) => s.remove);
  const friends = useFriends((s) => s.friends);
  const send = useFriends((s) => s.send);
  const developerMode = useSettings((s) => s.developerMode);

  const grupo = isGroupChannel(dm);
  const souDono = grupo && dm.ownerId === me?.id;
  // "Group DMs support up to 10 members total (including yourself)"
  // (suporte/api/artigos.json #223657667) — qualquer membro pode convidar até
  // o teto, não só o dono. `MAX_DM_GROUP_INVITEES` é de `packages/shared`
  // (fora desta lista de arquivos); ver "faltando" sobre o valor dele.
  const capacidadeTotal = MAX_DM_GROUP_INVITEES + 1;
  const grupoCheio = grupo && members.length >= capacidadeTotal;

  // a chave é a lista de participantes: adicionar/remover muda `others`
  const chave = dm.others.map((u) => u.id).join(",");
  useEffect(() => {
    let vivo = true;
    setEstado("carregando");
    api
      .dmMembers(dm.id)
      .then((rows) => {
        if (!vivo) return;
        setMembers(rows);
        setEstado("pronto");
      })
      .catch(() => {
        if (!vivo) return;
        setMembers([]);
        setEstado("erro");
      });
    return () => {
      vivo = false;
    };
  }, [dm.id, chave, tentativa]);

  function abrirMenu(e: MouseEvent, user: PublicUser, linha?: HTMLElement | null) {
    e.preventDefault();
    const euMesmo = user.id === me?.id;
    const jaAmigo = friends.some((f) => f.id === user.id);
    const items: MenuItem[] = [
      {
        label: "Perfil",
        icon: <User size={18} />,
        // popout ancorada na linha, como na lista de membros do servidor
        onSelect: () =>
          ui.openProfile(
            user,
            linha ? anchorOf(linha) : { x: e.clientX, y: e.clientY, width: 0, height: 0 },
          ),
      },
    ];
    if (!euMesmo) {
      items.push({
        label: "Mencionar",
        icon: <AtSign size={18} />,
        onSelect: () => mencionar(user),
      });
      items.push({
        label: "Mensagem",
        icon: <MessageSquare size={18} />,
        onSelect: () => void openWith(user.id),
      });
      items.push({ separator: true });
      if (jaAmigo) {
        items.push({
          label: "Remover amigo",
          icon: <UserMinus size={18} />,
          danger: true,
          onSelect: () => void remove(user),
        });
      } else {
        items.push({
          label: "Adicionar amigo",
          icon: <UserPlus size={18} />,
          onSelect: () => void send(user.username),
        });
      }
      items.push({
        label: "Bloquear",
        icon: <UserX size={18} />,
        danger: true,
        onSelect: () => void block(user),
      });
      if (souDono) {
        items.push({ separator: true });
        items.push({
          label: "Remover do grupo",
          icon: <UserMinus size={18} />,
          danger: true,
          onSelect: () => void removeMember(dm.id, user),
        });
      }
    }
    if (developerMode) {
      items.push({ separator: true });
      items.push({
        label: "Copiar ID do usuário",
        onSelect: () => void navigator.clipboard?.writeText(user.id),
      });
    }
    ui.openContextMenu(e.clientX, e.clientY, items, MENU_WIDTH);
  }

  return (
    <aside aria-label="Membros da conversa" className="flex w-[264px] shrink-0 flex-col bg-background-base-lower">
      <div className="flex-1 overflow-y-auto pb-4">
        <div className="flex items-center justify-between px-4 pb-1 pt-5">
          <h3 className="text-xs font-bold uppercase tracking-[0.02em] text-text-muted">
            Membros — {members.length}
          </h3>
          {grupo && (
            <BotaoDeIcone
              rotulo="Adicionar pessoas ao grupo"
              icone={<UserPlus size={16} />}
              tamanho="sm"
              desabilitado={grupoCheio}
              motivoDesabilitado={
                grupoCheio ? `O grupo já está no limite de ${capacidadeTotal} pessoas.` : undefined
              }
              onClick={() => ui.openModal({ kind: "addGroupMembers", channelId: dm.id })}
              className="celular:-mr-2 celular:h-[44px] celular:w-[44px]"
            />
          )}
        </div>

        {/* Carregando: três linhas de esqueleto na forma da linha real (avatar
            circular + barra de nome), pulsando — não há `.memberGroupsPlaceholder_c8ffbb`
            com tipografia própria no CSS capturado, só a barra cinza medida
            (`css-bruto/245758…css`: `background-color:var(--background-base-low);
            border-radius:8px;height:12px;width:40%`); o círculo do avatar é
            complemento nosso, sem par medido — "não medido" na forma exata. */}
        {estado === "carregando" && (
          <div role="list" aria-label="Carregando participantes">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                aria-hidden="true"
                className="mx-2 flex h-[42px] animate-pulse items-center gap-3 rounded px-2 celular:h-[60px]"
              >
                <span className="h-8 w-8 shrink-0 rounded-full bg-background-base-low" />
                <span className="h-3 w-2/5 rounded-lg bg-background-base-low" />
              </div>
            ))}
          </div>
        )}

        {estado === "erro" && (
          <div className="flex flex-col items-start gap-2 px-4 py-3">
            <p className="text-sm text-text-muted">Não foi possível carregar os participantes.</p>
            <Button variante="link" tamanho="sm" onClick={() => setTentativa((n) => n + 1)}>
              Tentar novamente
            </Button>
          </div>
        )}

        {estado === "pronto" && members.length === 0 && (
          <p className="px-4 py-3 text-sm text-text-muted">Nenhum participante por aqui.</p>
        )}

        {estado === "pronto" && members.length > 0 && (
        <div role="list">
          {members.map((raw) => {
            const user = resolveUser(profiles, raw);
            const status = resolveStatus(statuses, user);
            const nome = displayNameOf(user);
            const dono = grupo && dm.ownerId === user.id;
            return (
              <div
                key={user.id}
                role="listitem"
                onContextMenu={(e) => abrirMenu(e, user, e.currentTarget)}
                /* 60px no celular, como na lista de membros do servidor:
                   `docs/Reference/mobile/MEDIDAS.md` §10 mede 59,9pt no
                   Discord do telefone. */
                className={`group mx-2 flex h-[42px] items-center gap-3 rounded px-2 hover:bg-interactive-background-hover celular:h-[60px] ${
                  status === "OFFLINE" ? "opacity-30 hover:opacity-100" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={(e) => ui.openProfile(user, anchorOf(e.currentTarget))}
                  aria-label={`Perfil de ${nome}`}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <Avatar user={user} size="md" status={status} surface="border-background-base-lower" />
                  <span className="flex min-w-0 items-center gap-1">
                    <span className="truncate font-medium text-channels-default group-hover:text-text-default">
                      {nome}
                    </span>
                    {/* ── j-bots ── antes da coroa, como na lista de membros do
                        servidor: a pílula é do nome, o selo é do papel. */}
                    {user.bot && <TagDeBot />}
                    {dono && (
                      <Tooltip label="Criou o grupo">
                        {/* `.ownerIcon__5d473{color:var(--text-feedback-warning)}`
                            (css-bruto/40791…css, o módulo da linha do membro) —
                            era `text-status-warning` (#fdb833), o token errado:
                            o medido é `#ea9800`. */}
                        <Crown size={14} className="shrink-0 text-text-feedback-warning" aria-label="Criou o grupo" />
                      </Tooltip>
                    )}
                  </span>
                </button>

                {souDono && user.id !== me?.id && (
                  <Tooltip label="Remover do grupo">
                    <button
                      type="button"
                      onClick={() => void removeMember(dm.id, user)}
                      aria-label={`Remover ${nome} do grupo`}
                      /* sempre à mostra no celular: sem hover e sem botão direito, "remover
                         do grupo" não tinha caminho nenhum a partir daqui. Cor do hover:
                         `--icon-feedback-critical` (#f87e7a), o par medido de
                         `.actionDeny_f8fa06:hover` (item 7 do cabeçalho de
                         `BotaoDeIcone.tsx`) — não `--status-danger` (#da3e44, mais
                         escuro, não é o que o Discord usa em ícone de linha). */
                      className="hidden h-7 w-7 place-items-center rounded text-text-muted hover:text-icon-feedback-critical group-focus-within:grid group-hover:grid celular:grid celular:h-[44px] celular:w-[44px]"
                    >
                      <UserMinus size={16} />
                    </button>
                  </Tooltip>
                )}
              </div>
            );
          })}
        </div>
        )}
      </div>
    </aside>
  );
}
