"use client";

import type { MouseEvent } from "react";
import {
  Crown,
  ShieldCheck,
  Timer,
  Volume2,
} from "@/components/ui/icones";
import {
  Permission,
  TIMEOUT_PRESETS,
  colorRoleOf,
  highestPosition,
  isTimedOut,
  nomeParaMim,
  type GuildMemberView,
  type Role,
} from "@streamz/shared";
import Avatar from "@/components/ui/Avatar";
import TagDeBot from "@/components/ui/TagDeBot";
import { MENU_WIDTH } from "@/components/ui/ContextMenu";
import { Tooltip } from "@/components/ui/primitivos";
import { AnelDeFala, ENCOLHE_AO_FALAR } from "@/components/voice/pecas-de-voz";
import { api } from "@/lib/api";
import { mencionar as inserirMencao } from "@/lib/mencoes";
import {
  garantirComandosDeContexto,
  iniciarChamadaComUsuario,
  itemAdicionarNota,
  itemApelidoDeAmigo,
  itemBloquear,
  itemDesfazerAmizade,
  itemIgnorar,
  submenuAppsDeUsuario,
  submenuConvidarParaOServidor,
} from "@/lib/menu-de-usuario";
import { useAuth } from "@/stores/auth";
import { useChannels } from "@/stores/channels";
import { useDMs } from "@/stores/dms";
import { useFriends } from "@/stores/friends";
import { useGuilds } from "@/stores/guilds";
import { useNotas } from "@/stores/notas";
import { useCan, usePermissions } from "@/stores/permissions";
import { resolveStatus, resolveUser, usePresence } from "@/stores/presence";
import { useSettings } from "@/stores/settings";
import { errorMessage } from "@/stores/socket-adapter";
import { anchorOf, ui, type MenuItem } from "@/stores/ui";
import { useVoice } from "@/stores/voice";

/**
 * Título de seção da lista ("Disponível — 1").
 *
 * Medido no print 1:1 do Discord (180835, x1668–1790 y232–248 e x1668–1790
 * y26–42 na captura canal-texto): 14px, caixa mista, semibold, SEMPRE
 * `--channels-default` (#81828a) — inclusive na seção de um cargo hoisted
 * ("Administrador — 1" no nosso app saía na cor do cargo, #e74c3c; no Discord
 * o cabeçalho fica cinza igual ao de "Offline"; só o NOME do membro dentro da
 * seção herda a cor do cargo). Por isso este componente não recebe mais cor:
 * era `text-text-muted` (#96979e, tom errado) com a cor do cargo passada por
 * fora — as duas coisas divergiam do print. Texto a 20px da borda do painel
 * (o avatar das linhas fica a 18). Era 12px em caixa alta, o que dava um
 * rótulo de categoria de canal, e não o do Discord.
 */
function Section({ label, count }: { label: string; count: number }) {
  return (
    <h3 className="mt-6 pb-1 pl-5 pr-2 text-sm font-semibold leading-5 text-channels-default">
      {label} — {count}
    </h3>
  );
}

/** Um membro já resolvido com presença ao vivo. */
interface Linha {
  m: GuildMemberView;
  status: ReturnType<typeof resolveStatus>;
}

/**
 * Coluna 4: membros do servidor.
 *
 * O agrupamento é o do Discord: primeiro uma seção por **cargo com "exibir
 * separadamente"** (`hoist`), do mais alto para o mais baixo, com quem está
 * online; depois "Disponível" (os demais) e "Offline". Um membro aparece na seção
 * do seu cargo hoisted mais alto, e em nenhuma outra.
 *
 * O nome vai na cor do cargo mais alto que tenha cor. Ações de gestão
 * (expulsar, banir, cargos) aparecem conforme a permissão de quem olha.
 */
export default function MemberList() {
  const user = useAuth((s) => s.user);
  // ── menus de contexto ── apelido de amigo (qualquer contexto) tem
  // precedência sobre o apelido no servidor, que já vem em `m.nickname` —
  // ver `nomeParaMim` (`docs/CONTRATO-MENUS.md` §3/§5). Um hook só aqui em
  // cima: `renderMember` é chamado num `.map`, e um hook por linha variaria
  // de contagem a cada render (a lista de membros muda de tamanho).
  const apelidosDeAmigo = useFriends((s) => s.apelidos);
  const members = useGuilds((s) => s.members);
  const kick = useGuilds((s) => s.kick);
  const ban = useGuilds((s) => s.ban);
  const toggleRole = useGuilds((s) => s.toggleRole);
  const roles = usePermissions((s) => s.roles);
  const podeExpulsar = useCan(Permission.KICK_MEMBERS);
  const podeBanir = useCan(Permission.BAN_MEMBERS);
  const podeCargos = useCan(Permission.MANAGE_ROLES);
  // Teto de quem olha — mesma conta de `assertPodeMexerNoCargo`: só cargo
  // estritamente abaixo do meu mais alto entra no submenu (dono vê todos).
  const meuMembro = members.find((m) => m.user.id === user?.id);
  const meuTeto = highestPosition(
    { isOwner: meuMembro?.role === "OWNER", roleIds: meuMembro?.roleIds ?? [] },
    roles,
  );
  // ── h-moderacao ── castigo é MODERATE_MEMBERS na permissão efetiva
  const podeCastigar = useCan(Permission.MODERATE_MEMBERS);
  // ── j-membro ── "Alterar apelido" só para quem tem a permissão nova
  // (`MANAGE_NICKNAMES`, criada por outro cartão desta leva em
  // `packages/shared/src/permissoes.ts`); no meu próprio menu o item some e
  // vira "Editar perfil por servidor" (mesmo `PerfilPorServidorModal` do menu
  // do servidor).
  const podeAlterarApelido = useCan(Permission.MANAGE_NICKNAMES);
  const timeout = useGuilds((s) => s.timeout);
  const applyTimeout = useGuilds((s) => s.applyTimeout);
  const removeTimeout = useGuilds((s) => s.removeTimeout);
  const openWith = useDMs((s) => s.openWith);
  const developerMode = useSettings((s) => s.developerMode);
  const activeChannelId = useChannels((s) => s.activeChannelId);
  const meusServidores = useGuilds((s) => s.guilds);
  // ── menus de contexto ── itens sociais compartilhados com `DMList`
  // (`docs/CONTRATO-MENUS.md` §2, §3, §4), via `lib/menu-de-usuario.tsx`
  const minhasNotas = useNotas((s) => s.minhasNotas);
  const friendsList = useFriends((s) => s.friends);
  const blockedList = useFriends((s) => s.blocked);
  const ignoredList = useFriends((s) => s.ignored);
  const removeFriend = useFriends((s) => s.remove);
  const blockFriend = useFriends((s) => s.block);
  const unblockFriend = useFriends((s) => s.unblock);
  const ignorarUsuario = useFriends((s) => s.ignorar);
  const deixarDeIgnorarUsuario = useFriends((s) => s.deixarDeIgnorar);
  // o status/perfil ao vivo vem da store de presença; a lista é só o do REST
  const statuses = usePresence((s) => s.statuses);
  const profiles = usePresence((s) => s.profiles);
  // quem está numa sala de voz DESTE servidor ganha a sub-linha "Em voz", como
  // no Discord. A store guarda estados por canal; o evento traz o `guildId`,
  // então basta juntar os canais do servidor ativo — sem depender da sidebar.
  const activeGuildId = useGuilds((s) => s.activeGuildId);
  const voiceStates = useVoice((s) => s.states);
  // e quem, dentre eles, está falando agora: o mesmo conjunto que o palco e a
  // lista do canal leem (ver `stores/voice-falantes.ts`)
  const falando = useVoice((s) => s.falando);
  const emVoz = new Set<string>();
  for (const lista of Object.values(voiceStates)) {
    for (const e of lista) if (e.connected && e.guildId === activeGuildId) emVoz.add(e.user.id);
  }

  const live: Linha[] = members.map((m) => {
    const u = resolveUser(profiles, m.user);
    return { m: { ...m, user: u }, status: resolveStatus(statuses, u) };
  });
  const online = live.filter((x) => x.status !== "OFFLINE");
  const offline = live.filter((x) => x.status === "OFFLINE");

  // seções por cargo hoisted, do mais alto para o mais baixo; quem sobra cai
  // em "Disponível". Offline nunca hoista — é assim no Discord.
  const hoisted = roles
    .filter((r) => r.hoist && !r.isDefault)
    .sort((a, b) => b.position - a.position);
  const usados = new Set<string>();
  const secoes = hoisted
    .map((r) => {
      const gente = online.filter((x) => !usados.has(x.m.user.id) && x.m.roleIds.includes(r.id));
      for (const x of gente) usados.add(x.m.user.id);
      return { role: r, gente };
    })
    .filter((s) => s.gente.length > 0);
  const restoOnline = online.filter((x) => !usados.has(x.m.user.id));

  function podeAgirSobre(m: GuildMemberView): boolean {
    return m.user.id !== user?.id && m.role !== "OWNER";
  }

  /**
   * "Alterar apelido" (outro membro, com `MANAGE_NICKNAMES`): mesmo prompt de
   * texto do resto do app, iniciado com o apelido atual; string vazia apaga
   * (`api.alterarApelidoDeMembro`, `docs/CONTRATO-MENUS.md` §5 — a rota já é
   * a mesma de "Editar perfil por servidor", só que para outro `userId`).
   */
  async function alterarApelido(guildId: string, m: GuildMemberView, nome: string) {
    const valor = await ui.prompt({
      title: `Alterar apelido de ${nome}`,
      label: "APELIDO NO SERVIDOR",
      initial: m.nickname ?? "",
      placeholder: m.user.username,
      confirmLabel: "Salvar",
    });
    if (valor === null) return;
    try {
      await api.alterarApelidoDeMembro(guildId, m.user.id, valor.trim() ? valor.trim() : null);
      ui.toast("Apelido alterado.");
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível alterar o apelido"), "error");
    }
  }

  /**
   * Botão direito num membro (`docs/CONTRATO-MENUS.md` item J).
   *
   * SEM ícones — ao contrário do menu de mensagem/DM, a ESPEC desta leva pede
   * o menu de usuário liso. Cargos e castigo continuam em **submenu**, como
   * no Discord — antes cada cargo era um item solto no menu raiz, o que num
   * servidor com dez cargos empurrava expulsar/banir para fora da tela.
   * "Tornar administrador" e "Transferir posse" saíram: no Discord admin é
   * cargo, e transferir posse mora em Configurações do Servidor › Membros.
   */
  function openMenu(e: MouseEvent, m: GuildMemberView, linha?: HTMLElement | null) {
    e.preventDefault();
    const isMe = m.user.id === user?.id;
    const nome = nomeParaMim(m.user, {
      apelidoDeAmigo: apelidosDeAmigo?.[m.user.id],
      apelidoNoServidor: m.nickname,
    });
    garantirComandosDeContexto(activeGuildId);

    const items: MenuItem[] = [
      {
        label: "Perfil",
        // ancora na LINHA do membro, não no ponto do clique
        onSelect: () =>
          ui.openProfile(
            m.user,
            linha ? anchorOf(linha) : { x: e.clientX, y: e.clientY, width: 0, height: 0 },
          ),
      },
      { label: "Mencionar", onSelect: () => inserirMencao(m.user) },
    ];

    if (isMe) {
      items.push({ separator: true });
      items.push({
        label: "Editar perfil por servidor",
        onSelect: () => (activeGuildId ? ui.openModal({ kind: "perfilPorServidor", guildId: activeGuildId }) : undefined),
      });
      items.push(submenuAppsDeUsuario(activeGuildId, activeChannelId, m.user.id));
    } else {
      const notaExistente = minhasNotas[m.user.id];
      const souAmigo = friendsList.some((f) => f.id === m.user.id);
      const bloqueado = blockedList.some((b) => b.id === m.user.id);
      const ignorado = ignoredList?.some((u) => u.id === m.user.id) ?? false;

      items.push({ label: "Mensagem", onSelect: () => void openWith(m.user.id) });
      items.push({ label: "Iniciar chamada", onSelect: () => void iniciarChamadaComUsuario(m.user.id) });
      items.push(itemAdicionarNota(m.user.id, notaExistente));
      if (souAmigo) {
        items.push(itemApelidoDeAmigo(m.user.id, apelidosDeAmigo?.[m.user.id]));
      }

      items.push({ separator: true });
      if (podeAlterarApelido && activeGuildId) {
        items.push({ label: "Alterar apelido", onSelect: () => void alterarApelido(activeGuildId, m, nome) });
      }
      items.push(submenuAppsDeUsuario(activeGuildId, activeChannelId, m.user.id));
      items.push(submenuConvidarParaOServidor(m.user.id, meusServidores));
      if (souAmigo) {
        items.push(itemDesfazerAmizade(m.user, removeFriend));
      }
      items.push(itemIgnorar(m.user.id, ignorado, ignorarUsuario, deixarDeIgnorarUsuario));
      items.push(itemBloquear(m.user, bloqueado, blockFriend, unblockFriend));
    }

    const atribuiveis = roles
      .filter((r) => !r.isDefault && r.position < meuTeto)
      .sort((a, b) => b.position - a.position);
    // Vestir cargo em mim mesmo é permitido (a API não bloqueia alvo == ator
    // aqui — só em castigo/expulsão/banimento, que têm `assertCanActOn`).
    if (podeCargos && atribuiveis.length > 0) {
      items.push({ separator: true });
      items.push({
        label: "Cargos",
        submenu: atribuiveis.map((r) => ({
          label: r.name,
          control: "checkbox" as const,
          checked: m.roleIds.includes(r.id),
          dot: r.color ?? undefined,
          onSelect: () => void toggleRole(m.user.id, r.id, !m.roleIds.includes(r.id)),
        })),
      });
    }

    // ── h-moderacao ── "Abrir na visualização de moderador" vale até para
    // mim mesmo (não depende de `podeAgirSobre`); castigo/expulsão/banimento
    // continuam exigindo alvo diferente de mim e de quem é dono.
    const podeAgirAqui = podeAgirSobre(m) && (podeExpulsar || podeBanir || podeCastigar);
    if (podeCastigar || podeAgirAqui) {
      items.push({ separator: true });
      if (podeCastigar) {
        items.push({
          label: "Abrir na visualização de moderador",
          onSelect: () =>
            activeGuildId
              ? ui.openModal({ kind: "visaoDeModerador", guildId: activeGuildId, userId: m.user.id })
              : undefined,
        });
      }
      if (podeAgirAqui && podeCastigar) {
        if (isTimedOut(m.timeoutUntil)) {
          items.push({ label: "Remover castigo", onSelect: () => void removeTimeout(m.user.id) });
        } else {
          items.push({
            label: `Castigar ${nome}`,
            danger: true,
            submenu: [
              ...TIMEOUT_PRESETS.map((p) => ({
                label: p.label,
                onSelect: () => void applyTimeout(m.user.id, p.minutes),
              })),
              { separator: true as const },
              { label: "Duração personalizada…", onSelect: () => timeout(m.user.id) },
            ],
          });
        }
      }
      if (podeAgirAqui && podeExpulsar) {
        items.push({ label: `Expulsar ${nome}`, danger: true, onSelect: () => kick(m.user.id) });
      }
      if (podeAgirAqui && podeBanir) {
        items.push({ label: `Banir ${nome}`, danger: true, onSelect: () => ban(m.user.id) });
      }
    }

    if (developerMode) {
      items.push({ separator: true });
      items.push({
        label: "Copiar ID do usuário",
        onSelect: () => void navigator.clipboard?.writeText(m.user.id),
      });
    }
    ui.openContextMenu(e.clientX, e.clientY, items, MENU_WIDTH);
  }

  function renderMember({ m, status }: Linha) {
    const offline = status === "OFFLINE";
    // ausente e calado esmaece — quem fala prova presença e não esmaece
    const ausente = status === "IDLE" && !falando.has(m.user.id);
    const nome = nomeParaMim(m.user, {
      apelidoDeAmigo: apelidosDeAmigo?.[m.user.id],
      apelidoNoServidor: m.nickname,
    });
    const cor = colorRoleOf(m.roleIds, roles)?.color ?? null;
    const destaque = !!cor || m.role === "OWNER" || m.role === "ADMIN";
    return (
      <div
        key={m.user.id}
        role="listitem"
        onContextMenu={(e) => openMenu(e, m, e.currentTarget)}
        /* 60px no celular: é a medida do Discord no telefone
           (`docs/Reference/mobile/MEDIDAS.md` §10 — 118px a 1,9707 px/pt =
           59,9pt de passo entre linhas de membro). Os 42 do desktop nascem de
           uma coluna que se navega com o mouse; no dedo ficam abaixo do piso
           de 44 e a lista vira uma faixa de alvos colados. */
        className={`group mx-2.5 flex h-[42px] items-center gap-3 rounded-lg px-2 hover:bg-interactive-background-hover celular:h-[60px] ${
          offline
            ? "opacity-30 hover:opacity-100"
            : ausente
              ? "opacity-60 hover:opacity-100 transition-opacity"
              : ""
        }`}
      >
        <button
          type="button"
          onClick={(e) => ui.openProfile(m.user, anchorOf(e.currentTarget))}
          aria-label={`Perfil de ${nome}`}
          className="flex h-full min-w-0 flex-1 items-center gap-3 text-left"
        >
          {/* o anel verde de fala é o mesmo do palco e da lista do canal —
              no Discord ele acende aqui também, e não só lá dentro */}
          <span className="relative inline-grid shrink-0 rounded-full">
            <Avatar
              user={m.user}
              size="md"
              status={status}
              surface="border-background-base-lowest"
              className={`transition-transform ${falando.has(m.user.id) ? ENCOLHE_AO_FALAR : ""}`}
            />
            {falando.has(m.user.id) && <AnelDeFala />}
          </span>
          {/* nome em 16px: em repouso já é `text-default` (#efeff1), medido
              pixel a pixel no print 1:1 ("Md", x1710 y172–178 do 180835) — não
              é um cinza "muted" que clareia só no hover, como o item de canal.
              O hover, então, não muda a cor do nome (só o fundo da linha). A
              sub-linha "Em voz" em 12px com o alto-falante verde continua; sem
              atividade/jogo, que não existe aqui (ADR-0009 §8). */}
          <span className="flex min-w-0 flex-col">
            <span className="flex min-w-0 items-center gap-1 text-base leading-5">
              <span
                style={cor ? { color: cor } : undefined}
                className={`truncate font-medium ${destaque ? "text-text-strong" : "text-text-default"}`}
              >
                {nome}
              </span>
              {/* ── j-bots ── a pílula vem **antes** dos selos: no Discord ela
                  encosta no nome, e os selos de cargo ficam depois dela. */}
              {m.user.bot && <TagDeBot />}
              {m.role === "OWNER" && (
                <Tooltip rotulo="Dono do servidor">
                  <Crown size={14} className="shrink-0 text-status-warning" aria-label="Dono do servidor" />
                </Tooltip>
              )}
              {m.role === "ADMIN" && (
                <Tooltip rotulo="Administrador">
                  <ShieldCheck size={14} className="shrink-0 text-brand-500" aria-label="Administrador" />
                </Tooltip>
              )}
              {/* h-moderacao: relógio marca quem está de castigo agora */}
              {isTimedOut(m.timeoutUntil) && (
                <Tooltip rotulo="De castigo — não pode enviar mensagens">
                  <Timer size={14} className="shrink-0 text-status-danger" aria-label="De castigo" />
                </Tooltip>
              )}
            </span>
            {emVoz.has(m.user.id) && (
              <span className="flex items-center gap-1 text-xs leading-4 text-text-muted">
                <Volume2 size={12} className="shrink-0 text-status-positive" aria-hidden="true" />
                Em voz
              </span>
            )}
          </span>
        </button>
      </div>
    );
  }

  function renderSecao(role: Role, gente: Linha[]) {
    return (
      <div key={role.id}>
        {/* sem `color`: o cabeçalho de grupo de cargo é cinza igual aos
            demais — ver comentário de Section */}
        <Section label={role.name} count={gente.length} />
        {gente.map(renderMember)}
      </div>
    );
  }

  return (
    // 264px = `--custom-member-list-width` (VARIAVEIS.md); era 267 (contagem
    // solta de pixel no print, sem token — a régua de tudo que o Discord
    // define é a variável, não o resultado de antisserrilhado na borda).
    <aside aria-label="Membros" className="flex w-[264px] shrink-0 flex-col bg-background-base-lower">
      <div role="list" className="flex-1 overflow-y-auto pb-4">
        {members.length === 0 && (
          <p className="px-4 py-3 text-sm text-text-muted">Nenhum membro por aqui.</p>
        )}
        {secoes.map((s) => renderSecao(s.role, s.gente))}
        {restoOnline.length > 0 && <Section label="Disponível" count={restoOnline.length} />}
        {restoOnline.map(renderMember)}
        {offline.length > 0 && <Section label="Offline" count={offline.length} />}
        {offline.map(renderMember)}
      </div>
    </aside>
  );
}
