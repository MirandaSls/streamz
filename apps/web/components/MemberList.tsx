"use client";

import type { MouseEvent } from "react";
import {
  AtSign,
  Crown,
  Gavel,
  MessageSquare,
  Shield,
  ShieldCheck,
  Timer,
  TimerOff,
  User,
  UserX,
  Volume2,
} from "@/components/ui/icones";
import {
  Permission,
  TIMEOUT_PRESETS,
  colorRoleOf,
  displayNameOf,
  isTimedOut,
  type GuildMemberView,
  type Role,
} from "@streamz/shared";
import Avatar from "@/components/ui/Avatar";
import TagDeBot from "@/components/ui/TagDeBot";
import Tooltip from "@/components/ui/Tooltip";
import { MENU_WIDTH } from "@/components/ui/ContextMenu";
import { AnelDeFala, ENCOLHE_AO_FALAR } from "@/components/voice/pecas-de-voz";
import { mencionar as inserirMencao } from "@/lib/mencoes";
import { useAuth } from "@/stores/auth";
import { useDMs } from "@/stores/dms";
import { useGuilds } from "@/stores/guilds";
import { useCan, usePermissions } from "@/stores/permissions";
import { resolveStatus, resolveUser, usePresence } from "@/stores/presence";
import { useSettings } from "@/stores/settings";
import { anchorOf, ui, type MenuItem } from "@/stores/ui";
import { useVoice } from "@/stores/voice";

/**
 * Título de seção da lista ("Disponível — 1").
 *
 * Medido no print do Discord: 14px, caixa mista, semibold, na cor muted, com o
 * texto a 20px da borda do painel (o avatar das linhas fica a 18). Era 12px em
 * caixa alta, o que dava um rótulo de categoria de canal, e não o do Discord.
 */
function Section({ label, count, color }: { label: string; count: number; color?: string | null }) {
  return (
    <h3
      style={color ? { color } : undefined}
      className="mt-6 pb-1 pl-5 pr-2 text-sm font-semibold leading-5 text-txt-muted"
    >
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
  const members = useGuilds((s) => s.members);
  const kick = useGuilds((s) => s.kick);
  const ban = useGuilds((s) => s.ban);
  const toggleRole = useGuilds((s) => s.toggleRole);
  const roles = usePermissions((s) => s.roles);
  const podeExpulsar = useCan(Permission.KICK_MEMBERS);
  const podeBanir = useCan(Permission.BAN_MEMBERS);
  const podeCargos = useCan(Permission.MANAGE_ROLES);
  // ── h-moderacao ── castigo é MODERATE_MEMBERS na permissão efetiva
  const podeCastigar = useCan(Permission.MODERATE_MEMBERS);
  const timeout = useGuilds((s) => s.timeout);
  const applyTimeout = useGuilds((s) => s.applyTimeout);
  const removeTimeout = useGuilds((s) => s.removeTimeout);
  const openWith = useDMs((s) => s.openWith);
  const developerMode = useSettings((s) => s.developerMode);
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
   * Botão direito num membro.
   *
   * Cargos e castigo viram **submenu**, como no Discord — antes cada cargo era
   * um item solto no menu raiz, o que num servidor com dez cargos empurrava
   * expulsar/banir para fora da tela. "Tornar administrador" e "Transferir
   * posse" saíram: no Discord admin é cargo, e transferir posse mora em
   * Configurações do Servidor › Membros.
   */
  function openMenu(e: MouseEvent, m: GuildMemberView, linha?: HTMLElement | null) {
    e.preventDefault();
    const isMe = m.user.id === user?.id;
    const items: MenuItem[] = [
      {
        label: "Perfil",
        icon: <User size={18} />,
        // ancora na LINHA do membro, não no ponto do clique
        onSelect: () =>
          ui.openProfile(
            m.user,
            linha ? anchorOf(linha) : { x: e.clientX, y: e.clientY, width: 0, height: 0 },
          ),
      },
    ];
    if (!isMe) {
      items.push({
        label: "Mencionar",
        icon: <AtSign size={18} />,
        onSelect: () => inserirMencao(m.user),
      });
      items.push({
        label: "Mensagem",
        icon: <MessageSquare size={18} />,
        onSelect: () => void openWith(m.user.id),
      });
    }

    const atribuiveis = roles.filter((r) => !r.isDefault).sort((a, b) => b.position - a.position);
    if (podeCargos && !isMe && atribuiveis.length > 0) {
      items.push({ separator: true });
      items.push({
        label: "Cargos",
        icon: <Shield size={18} />,
        submenu: atribuiveis.map((r) => ({
          label: r.name,
          control: "checkbox" as const,
          checked: m.roleIds.includes(r.id),
          dot: r.color ?? undefined,
          onSelect: () => void toggleRole(m.user.id, r.id, !m.roleIds.includes(r.id)),
        })),
      });
    }

    if (podeAgirSobre(m) && (podeExpulsar || podeBanir || podeCastigar)) {
      items.push({ separator: true });
      // ── h-moderacao ──
      if (podeCastigar) {
        if (isTimedOut(m.timeoutUntil)) {
          items.push({
            label: "Remover modo de espera",
            icon: <TimerOff size={18} />,
            onSelect: () => void removeTimeout(m.user.id),
          });
        } else {
          items.push({
            label: "Modo de espera",
            icon: <Timer size={18} />,
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
      if (podeExpulsar) {
        items.push({ label: "Expulsar", icon: <UserX size={18} />, danger: true, onSelect: () => kick(m.user.id) });
      }
      if (podeBanir) {
        items.push({ label: "Banir", icon: <Gavel size={18} />, danger: true, onSelect: () => ban(m.user.id) });
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
    const isMe = m.user.id === user?.id;
    const offline = status === "OFFLINE";
    const nome = displayNameOf(m.user);
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
        className={`group mx-2.5 flex h-[42px] items-center gap-3 rounded-lg px-2 hover:bg-hov celular:h-[60px] ${
          offline ? "opacity-30 hover:opacity-100" : ""
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
              surface="border-panel"
              className={`transition-transform ${falando.has(m.user.id) ? ENCOLHE_AO_FALAR : ""}`}
            />
            {falando.has(m.user.id) && <AnelDeFala />}
          </span>
          {/* nome em 16px na cor muted (medido: o mesmo cinza do título da
              seção), e a sub-linha "Em voz" em 12px com o alto-falante verde.
              Sem atividade/jogo: não existe aqui. */}
          <span className="flex min-w-0 flex-col">
            <span className="flex min-w-0 items-center gap-1 text-base leading-5">
              <span
                style={cor ? { color: cor } : undefined}
                className={`truncate font-medium ${
                  destaque ? "text-txt-primary" : "text-txt-muted group-hover:text-txt-normal"
                }`}
              >
                {nome}
              </span>
              {/* ── j-bots ── a pílula vem **antes** dos selos: no Discord ela
                  encosta no nome, e os selos de cargo ficam depois dela. */}
              {m.user.bot && <TagDeBot />}
              {m.role === "OWNER" && (
                <Tooltip label="Dono do servidor">
                  <Crown size={14} className="shrink-0 text-yellow" aria-label="Dono do servidor" />
                </Tooltip>
              )}
              {m.role === "ADMIN" && (
                <Tooltip label="Administrador">
                  <ShieldCheck size={14} className="shrink-0 text-accent" aria-label="Administrador" />
                </Tooltip>
              )}
              {/* h-moderacao: relógio marca quem está de castigo agora */}
              {isTimedOut(m.timeoutUntil) && (
                <Tooltip label="De castigo — não pode enviar mensagens">
                  <Timer size={14} className="shrink-0 text-red" aria-label="De castigo" />
                </Tooltip>
              )}
            </span>
            {emVoz.has(m.user.id) && (
              <span className="flex items-center gap-1 text-xs leading-4 text-txt-muted">
                <Volume2 size={12} className="shrink-0 text-green" aria-hidden="true" />
                Em voz
              </span>
            )}
          </span>
        </button>

        {/*
          No celular a fileira é **sempre visível** — o dedo não paira —, mas só
          com "Mensagem": as três de moderação levariam 132px de uma linha de
          335 e o nome truncava em "betoxip…" (medido em 390×844). Elas
          continuam no menu de contexto, que no telefone abre pelo toque longo
          (`AreaDeToqueLongo` envolve o shell inteiro). No desktop nada muda.
        */}
        <div className="hidden shrink-0 gap-0.5 group-focus-within:flex group-hover:flex celular:flex">
          {!isMe && (
            <Tooltip label="Mensagem">
              <button
                type="button"
                onClick={() => void openWith(m.user.id)}
                aria-label={`Abrir conversa com ${nome}`}
                className="grid h-7 w-7 place-items-center rounded text-txt-muted hover:text-txt-primary celular:h-[44px] celular:w-[44px]"
              >
                <MessageSquare size={16} />
              </button>
            </Tooltip>
          )}
          {podeAgirSobre(m) && podeCastigar && (
            /* h-moderacao: castigo é a ação de moderação mais usada — fica no hover */
            <Tooltip label={isTimedOut(m.timeoutUntil) ? "Remover castigo" : "Colocar de castigo"}>
              <button
                type="button"
                onClick={() =>
                  isTimedOut(m.timeoutUntil) ? void removeTimeout(m.user.id) : timeout(m.user.id)
                }
                aria-label={`${isTimedOut(m.timeoutUntil) ? "Remover castigo de" : "Colocar de castigo"} ${nome}`}
                className="grid h-7 w-7 place-items-center rounded text-txt-muted hover:text-red celular:hidden"
              >
                {isTimedOut(m.timeoutUntil) ? <TimerOff size={16} /> : <Timer size={16} />}
              </button>
            </Tooltip>
          )}
          {podeAgirSobre(m) && podeExpulsar && (
            <Tooltip label="Expulsar">
              <button
                type="button"
                onClick={() => kick(m.user.id)}
                aria-label={`Expulsar ${nome}`}
                className="grid h-7 w-7 place-items-center rounded text-txt-muted hover:text-red celular:hidden"
              >
                <UserX size={16} />
              </button>
            </Tooltip>
          )}
          {podeAgirSobre(m) && podeBanir && (
            <Tooltip label="Banir">
              <button
                type="button"
                onClick={() => ban(m.user.id)}
                aria-label={`Banir ${nome}`}
                className="grid h-7 w-7 place-items-center rounded text-txt-muted hover:text-red celular:hidden"
              >
                <Gavel size={16} />
              </button>
            </Tooltip>
          )}
        </div>
      </div>
    );
  }

  function renderSecao(role: Role, gente: Linha[]) {
    return (
      <div key={role.id}>
        <Section label={role.name} count={gente.length} color={role.color} />
        {gente.map(renderMember)}
      </div>
    );
  }

  return (
    <aside aria-label="Membros" className="flex w-[267px] shrink-0 flex-col bg-panel">
      <div role="list" className="flex-1 overflow-y-auto pb-4">
        {members.length === 0 && (
          <p className="px-4 py-3 text-sm text-txt-muted">Nenhum membro por aqui.</p>
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
