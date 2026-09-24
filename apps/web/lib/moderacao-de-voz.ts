import {
  Permission,
  computePermissions,
  hasPermission,
  highestPosition,
  type PermissionMember,
  type Role,
} from "@streamz/shared";
import { api } from "@/lib/api";
import { errorMessage } from "@/stores/socket-adapter";
import { useAuth } from "@/stores/auth";
import { useGuilds } from "@/stores/guilds";
import { usePermissions } from "@/stores/permissions";
import { ui } from "@/stores/ui";

/**
 * "Silenciar voz no servidor" / "Desativar áudio no servidor" — o
 * mute/deafen que um moderador aplica a outra pessoa (distinto do que a
 * própria pessoa liga em si, `useVoicePrefs`).
 *
 * A regra é a mesma do servidor (`GuildsService.assertCanModerarVoz`,
 * `apps/api/src/modules/guilds/guilds.service.ts`): contra **si mesmo**, só o
 * bit (`MUTE_MEMBERS`/`DEAFEN_MEMBERS`) — automutar é uso normal, não abuso de
 * hierarquia. Contra **outra pessoa**, bit **e** hierarquia (meu cargo mais
 * alto estritamente acima do dela). Dono e `ADMINISTRATOR` já vêm com tudo
 * ligado por `computePermissions`, então passam pelo bit sem precisar de caso
 * especial aqui; ninguém — a não ser ele mesmo — age sobre o dono, porque
 * `highestPosition` do dono é `Number.MAX_SAFE_INTEGER`.
 *
 * Reaproveita `computePermissions`/`highestPosition` de `@streamz/shared` —
 * as mesmas que `stores/permissions.ts` e `participant-menu.tsx` usam — para
 * não duplicar o cálculo de "o que eu posso" nem o de hierarquia.
 */

/** O que as funções puras abaixo precisam de cada lado (eu e o alvo). */
export interface MembroDeVoz extends PermissionMember {
  userId: string;
}

function podeModerarVozBit(
  eu: MembroDeVoz,
  alvo: MembroDeVoz,
  roles: readonly Role[],
  bit: number,
): boolean {
  const meusBits = computePermissions(eu, roles, []);
  if (!hasPermission(meusBits, bit)) return false;
  // contra mim mesmo: só o bit importa (automutar não é hierarquia)
  if (eu.userId === alvo.userId) return true;
  return highestPosition(eu, roles) > highestPosition(alvo, roles);
}

/** Posso silenciar (mute) esta pessoa na voz do servidor? */
export function podeSilenciarNoServidor(
  eu: MembroDeVoz,
  alvo: MembroDeVoz,
  roles: readonly Role[],
): boolean {
  return podeModerarVozBit(eu, alvo, roles, Permission.MUTE_MEMBERS);
}

/** Posso ensurdecer (deafen) esta pessoa na voz do servidor? */
export function podeEnsurdecerNoServidor(
  eu: MembroDeVoz,
  alvo: MembroDeVoz,
  roles: readonly Role[],
): boolean {
  return podeModerarVozBit(eu, alvo, roles, Permission.DEAFEN_MEMBERS);
}

/**
 * `{ silenciar, ensurdecer }` para o alvo, a partir do que já está carregado
 * nas stores (mesmo padrão conservador de `usePermissions`/`participant-menu`:
 * servidor pedido diferente do carregado → `false` nos dois, porque sem
 * cargos na mão não há como saber e esconder é o lado seguro).
 */
export function usePodeModerarVoz(
  alvoId: string,
  guildId: string | null,
): { silenciar: boolean; ensurdecer: boolean } {
  const meId = useAuth((s) => s.user?.id);
  const guildsCarregado = useGuilds((s) => s.activeGuildId);
  const guilds = useGuilds((s) => s.guilds);
  const members = useGuilds((s) => s.members);
  const permsCarregado = usePermissions((s) => s.guildId);
  const roles = usePermissions((s) => s.roles);

  const NADA = { silenciar: false, ensurdecer: false };
  if (!guildId || !meId) return NADA;
  if (guildsCarregado !== guildId || permsCarregado !== guildId) return NADA;
  const guild = guilds.find((g) => g.id === guildId);
  if (!guild) return NADA;

  const meuMembro = members.find((m) => m.user.id === meId);
  const alvoMembro = members.find((m) => m.user.id === alvoId);
  const eu: MembroDeVoz = {
    userId: meId,
    isOwner: guild.ownerId === meId,
    roleIds: meuMembro?.roleIds ?? [],
  };
  const alvo: MembroDeVoz = {
    userId: alvoId,
    isOwner: guild.ownerId === alvoId,
    roleIds: alvoMembro?.roleIds ?? [],
  };

  return {
    silenciar: podeSilenciarNoServidor(eu, alvo, roles),
    ensurdecer: podeEnsurdecerNoServidor(eu, alvo, roles),
  };
}

/**
 * Alterna o mute de servidor de alguém (`POST /guilds/:id/voice/moderar`).
 *
 * Não toca em estado local: quem redesenha o checkbox/ícone é o `voice.state`
 * que o gateway manda de volta (mesmo padrão de `moverParaCanalDeVoz` em
 * `ChannelSidebar.tsx`) — aqui só confirma a ação e, se a API recusar
 * (permissão, hierarquia, alvo que já saiu da voz), avisa por toast.
 */
export async function alternarSilencioDoServidor(
  guildId: string,
  userId: string,
  atual: boolean,
): Promise<void> {
  try {
    await api.moderarVoz(guildId, { userId, mute: !atual });
  } catch (e) {
    ui.toast(errorMessage(e, "Não foi possível silenciar esta pessoa"), "error");
  }
}

/** O mesmo de `alternarSilencioDoServidor`, para o "Desativar áudio no servidor". */
export async function alternarSurdezDoServidor(
  guildId: string,
  userId: string,
  atual: boolean,
): Promise<void> {
  try {
    await api.moderarVoz(guildId, { userId, deaf: !atual });
  } catch (e) {
    ui.toast(errorMessage(e, "Não foi possível desativar o áudio desta pessoa"), "error");
  }
}
