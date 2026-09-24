import {
  Permission,
  computePermissions,
  hasPermission,
  highestPosition,
  type PermissionMember,
  type PermissionOverwrite,
  type Role,
} from "@streamz/shared";
import { api } from "@/lib/api";
import { errorMessage } from "@/stores/socket-adapter";
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
  regras: readonly PermissionOverwrite[] = [],
): boolean {
  const meusBits = computePermissions(eu, roles, regras);
  if (!hasPermission(meusBits, bit)) return false;
  // contra mim mesmo: só o bit importa (automutar não é hierarquia)
  if (eu.userId === alvo.userId) return true;
  return highestPosition(eu, roles) > highestPosition(alvo, roles);
}

/**
 * Posso silenciar (mute) esta pessoa na voz do servidor?
 *
 * `regras` são os overrides que valem para mim **no canal de voz do alvo**
 * (`overridesEfetivos` já resolvido por quem chama) — sem argumento, o cálculo
 * cai no que vale fora de canal, igual antes.
 */
export function podeSilenciarNoServidor(
  eu: MembroDeVoz,
  alvo: MembroDeVoz,
  roles: readonly Role[],
  regras: readonly PermissionOverwrite[] = [],
): boolean {
  return podeModerarVozBit(eu, alvo, roles, Permission.MUTE_MEMBERS, regras);
}

/**
 * Posso ensurdecer (deafen) esta pessoa na voz do servidor?
 *
 * `regras` = overrides que me valem no canal de voz do alvo — ver
 * `podeSilenciarNoServidor`.
 */
export function podeEnsurdecerNoServidor(
  eu: MembroDeVoz,
  alvo: MembroDeVoz,
  roles: readonly Role[],
  regras: readonly PermissionOverwrite[] = [],
): boolean {
  return podeModerarVozBit(eu, alvo, roles, Permission.DEAFEN_MEMBERS, regras);
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
