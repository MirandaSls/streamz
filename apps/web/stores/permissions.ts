import { create } from "zustand";
import {
  ALL_PERMISSIONS,
  Permission,
  colorRoleOf,
  computePermissions,
  hasPermission,
  rolesOf,
  type ChannelOverride,
  type PermissionMember,
  type Role,
} from "@streamz/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { useChannels } from "@/stores/channels";
import { useGuilds } from "@/stores/guilds";

/**
 * Cargos e regras de canal do servidor ativo — e o cálculo de "o que eu posso".
 *
 * O cliente usa **a mesma** `computePermissions` da API (`@streamz/shared`), e
 * não uma segunda regra escrita à mão: assim o que a UI esconde é exatamente o
 * que a API recusaria, e a regra não envelhece em dois lugares (ADR-0002).
 *
 * Carregamos cargos e overrides de uma vez ao trocar de servidor porque a
 * pergunta "posso postar neste canal?" aparece em toda renderização — uma ida
 * ao servidor por canal seria inviável.
 *
 * Para os outros agentes: `useMyPermissions(guildId, channelId?)` devolve o
 * bitfield, e `useCan(Permission.X, channelId?)` o booleano.
 */

interface PermissionsState {
  guildId: string | null;
  roles: Role[];
  /** todas as regras dos canais visíveis do servidor ativo. */
  overrides: ChannelOverride[];
  loading: boolean;

  load: (guildId: string) => Promise<void>;
  clear: () => void;

  /** Eventos `role.*` do gateway. */
  handleRoleSaved: (role: Role) => void;
  handleRoleDeleted: (guildId: string, roleId: string) => void;
  handleOverrides: (guildId: string, channelId: string, overrides: ChannelOverride[]) => void;
}

let loadSeq = 0;

export const usePermissions = create<PermissionsState>((set, get) => ({
  guildId: null,
  roles: [],
  overrides: [],
  loading: false,

  load: async (guildId) => {
    const seq = ++loadSeq;
    set({ guildId, roles: [], overrides: [], loading: true });
    try {
      const [roles, overrides] = await Promise.all([
        api.listRoles(guildId),
        api.guildOverrides(guildId),
      ]);
      if (seq !== loadSeq) return; // trocaram de servidor no meio do fetch
      set({ roles, overrides, loading: false });
    } catch {
      if (seq !== loadSeq) return;
      // sem cargos a UI cai no conservador: só o dono vê o que é de moderação
      set({ roles: [], overrides: [], loading: false });
    }
  },

  clear: () => {
    ++loadSeq;
    set({ guildId: null, roles: [], overrides: [], loading: false });
  },

  handleRoleSaved: (role) => {
    if (get().guildId !== role.guildId) return;
    set((s) => ({
      roles: s.roles.some((r) => r.id === role.id)
        ? s.roles.map((r) => (r.id === role.id ? role : r))
        : [...s.roles, role].sort((a, b) => a.position - b.position),
    }));
  },

  handleRoleDeleted: (guildId, roleId) => {
    if (get().guildId !== guildId) return;
    set((s) => ({
      roles: s.roles.filter((r) => r.id !== roleId),
      overrides: s.overrides.filter((o) => o.roleId !== roleId),
    }));
  },

  handleOverrides: (guildId, channelId, overrides) => {
    if (get().guildId !== guildId) return;
    set((s) => ({
      overrides: [...s.overrides.filter((o) => o.channelId !== channelId), ...overrides],
    }));
  },
}));

/** Cargos do servidor ativo, do mais alto para o mais baixo (sem o @everyone). */
export function useRoles(): Role[] {
  return usePermissions((s) => s.roles);
}

/** O @everyone do servidor ativo (é nele que moram as regras padrão). */
export function useEveryoneRole(): Role | null {
  return usePermissions((s) => s.roles.find((r) => r.isDefault) ?? null);
}

/**
 * Permissão efetiva do usuário logado. Sem `channelId`, a do servidor; com ele,
 * a do canal (aplica os overrides).
 */
export function useMyPermissions(guildId?: string | null, channelId?: string | null): number {
  const meId = useAuth((s) => s.user?.id);
  const roles = usePermissions((s) => s.roles);
  const carregado = usePermissions((s) => s.guildId);
  const overrides = usePermissions((s) => s.overrides);
  const guild = useGuilds((s) =>
    s.guilds.find((g) => g.id === (guildId ?? s.activeGuildId)) ?? null,
  );
  const roleIds = useGuilds(
    (s) => s.members.find((m) => m.user.id === meId)?.roleIds ?? EMPTY,
  );

  if (!meId || !guild) return 0;
  const isOwner = guild.ownerId === meId;
  // o servidor pedido não é o que está carregado: só o dono é certeza
  if (carregado !== guild.id) return isOwner ? ALL_PERMISSIONS : 0;
  const member: PermissionMember = { isOwner, roleIds };
  const doCanal = channelId
    ? overrides.filter(
        (o) => o.channelId === channelId && (o.userId === null || o.userId === meId),
      )
    : [];
  return computePermissions(member, roles, doCanal);
}

/** `useCan(Permission.MANAGE_ROLES)` — a UI esconde o que o usuário não pode. */
export function useCan(permission: number, channelId?: string | null): boolean {
  return hasPermission(useMyPermissions(null, channelId), permission);
}

/** Posso escrever no canal aberto? É o que decide o composer bloqueado. */
export function useCanPostActiveChannel(): boolean {
  const channelId = useChannels((s) => s.activeChannelId);
  return useCan(Permission.SEND_MESSAGES, channelId);
}

/** Posso apagar mensagem dos outros no canal aberto? (MANAGE_MESSAGES) */
export function useCanModerateActiveChannel(): boolean {
  const channelId = useChannels((s) => s.activeChannelId);
  return useCan(Permission.MANAGE_MESSAGES, channelId);
}

/**
 * Posso editar o canal aberto? (MANAGE_CHANNELS)
 *
 * Não é o mesmo que moderar: apagar mensagem dos outros é `MANAGE_MESSAGES`, e
 * abrir as configurações do canal é `MANAGE_CHANNELS` — é a permissão que a
 * engrenagem da barra lateral já pede para o mesmo modal.
 */
export function useCanManageActiveChannel(): boolean {
  const channelId = useChannels((s) => s.activeChannelId);
  return useCan(Permission.MANAGE_CHANNELS, channelId);
}

/**
 * Cor do nome de um membro: a do seu cargo mais alto que tenha cor. `null`
 * quando ele não tem cargo colorido — aí o nome fica na cor padrão do tema.
 */
export function useRoleColor(roleIds: readonly string[] | undefined): string | null {
  const roles = usePermissions((s) => s.roles);
  if (!roleIds?.length) return null;
  return colorRoleOf(roleIds, roles)?.color ?? null;
}

/**
 * Cor do nome de um membro do servidor ativo, pelo id. É o que o autor da
 * mensagem usa: a lista de membros já traz os cargos de todo mundo.
 */
export function useAuthorColor(userId: string): string | null {
  const roles = usePermissions((s) => s.roles);
  const roleIds = useGuilds((s) => s.members.find((m) => m.user.id === userId)?.roleIds ?? EMPTY);
  if (roleIds.length === 0) return null;
  return colorRoleOf(roleIds, roles)?.color ?? null;
}

/** Cargos de um membro para exibir como chips (do mais alto para o mais baixo). */
export function useMemberRoles(roleIds: readonly string[] | undefined): Role[] {
  const roles = usePermissions((s) => s.roles);
  if (!roleIds?.length) return [];
  return rolesOf(roleIds, roles);
}

/** Referência estável: `[]` novo a cada render faria o zustand re-renderizar sempre. */
const EMPTY: string[] = [];
