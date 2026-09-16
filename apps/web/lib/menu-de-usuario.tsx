"use client";

/**
 * Itens de menu de clique direito em cima de uma PESSOA, fora do menu de
 * mensagem — compartilhados entre a lista de membros (`MemberList.tsx`,
 * `docs/CONTRATO-MENUS.md` item J) e, mais tarde, o participante de canal de
 * voz (item N da mesma ESPEC), que repete os mesmos itens sociais.
 *
 * Referência pronta (só lida, não editada por este cartão): `DMList.tsx` já
 * monta nota, apelido de amigo, ignorar, bloquear, convidar para o servidor e
 * Apps para a conversa 1-a-1 — mas resolve tudo a partir do `dm`/`other` dela.
 * Aqui os mesmos itens viram funções puras que recebem o estado já resolvido
 * pelo chamador (quem é amigo, quem está bloqueado etc.), para servir a
 * qualquer tela que tenha um `userId` e não necessariamente uma DM aberta.
 *
 * SEM ícones — ao contrário do menu de mensagem/DM, o contrato desta leva
 * (ESPEC item J) pede os itens de usuário sem `icon`.
 */
import {
  TIPO_DE_COMANDO_DE_APP,
  WS_EVENTS,
  type ComandoDeApp,
  type Guild,
  type PublicUser,
} from "@streamz/shared";
import { api } from "@/lib/api";
import { urlDeConvite } from "@/lib/links-de-convite";
import { useComandosDeContexto } from "@/stores/comandos-de-contexto";
import { useInteracoesDeBot } from "@/stores/interacoes-de-bot";
import { emit, errorMessage } from "@/stores/socket-adapter";
import { ui, type MenuItem } from "@/stores/ui";
import { useVoice } from "@/stores/voice";

const SEM_NENHUM: MenuItem = { label: "Nenhum app disponível", disabled: true, onSelect: () => {} };
const SEM_SERVIDOR: MenuItem = { label: "Nenhum servidor disponível", disabled: true, onSelect: () => {} };

/** "Adicionar nota" / "Editar nota" — descrição fixa (`docs/CONTRATO-MENUS.md` §2). */
export function itemAdicionarNota(userId: string, notaExistente: string | undefined): MenuItem {
  return {
    label: notaExistente ? "Editar nota" : "Adicionar nota",
    description: "Visível apenas para você",
    onSelect: () => ui.openModal({ kind: "notaDeUsuario", userId }),
  };
}

/** "Adicionar apelido de amigo" / "Editar apelido de amigo" — só empilhar quando for amigo (§3). */
export function itemApelidoDeAmigo(userId: string, apelidoExistente: string | undefined): MenuItem {
  return {
    label: apelidoExistente ? "Editar apelido de amigo" : "Adicionar apelido de amigo",
    onSelect: () => ui.openModal({ kind: "apelidoDeAmigo", userId }),
  };
}

/** "Desfazer amizade" — branco no Discord; só "Bloquear" é vermelho. */
export function itemDesfazerAmizade(
  user: PublicUser,
  removeFriend: (user: PublicUser) => Promise<void>,
): MenuItem {
  return { label: "Desfazer amizade", onSelect: () => void removeFriend(user) };
}

/** "Ignorar" / "Deixar de ignorar" (§4) — nunca vermelho. */
export function itemIgnorar(
  userId: string,
  ignorado: boolean,
  ignorar: (userId: string) => Promise<void>,
  deixarDeIgnorar: (userId: string) => Promise<void>,
): MenuItem {
  return {
    label: ignorado ? "Deixar de ignorar" : "Ignorar",
    onSelect: () => void (ignorado ? deixarDeIgnorar(userId) : ignorar(userId)),
  };
}

/** "Bloquear" (vermelho) / "Desbloquear". */
export function itemBloquear(
  user: PublicUser,
  bloqueado: boolean,
  block: (user: PublicUser) => Promise<void>,
  unblock: (userId: string) => Promise<void>,
): MenuItem {
  return {
    label: bloqueado ? "Desbloquear" : "Bloquear",
    danger: !bloqueado,
    onSelect: () => void (bloqueado ? unblock(user.id) : block(user)),
  };
}

async function usarComandoDeContextoDeUsuario(
  channelId: string,
  comando: ComandoDeApp,
  targetId: string,
) {
  try {
    await useInteracoesDeBot.getState().usarComandoDeContexto(channelId, comando.id, targetId);
  } catch (e) {
    ui.toast(errorMessage(e, "Não foi possível usar o comando"), "error");
  }
}

/**
 * Submenu "Apps >" de contexto de USUÁRIO (tipo 2, `docs/CONTRATO-MENUS.md`
 * §7) — mesmo caminho do tipo 3 no menu de mensagem (`MessageItem.tsx`,
 * `usarComandoDeContextoNoMenu`), com `targetId = userId`. Sem servidor, sem
 * canal ativo ou sem nenhum comando cadastrado, um único item desabilitado.
 */
export function submenuAppsDeUsuario(
  guildId: string | null,
  channelId: string | null,
  userId: string,
): MenuItem {
  if (!guildId || !channelId) return { label: "Apps", submenu: [SEM_NENHUM] };
  const comandos = useComandosDeContexto
    .getState()
    .doTipo(guildId, TIPO_DE_COMANDO_DE_APP.USER);
  const itens: MenuItem[] =
    comandos.length > 0
      ? comandos.map((c) => ({
          label: c.name,
          onSelect: () => void usarComandoDeContextoDeUsuario(channelId, c, userId),
        }))
      : [SEM_NENHUM];
  return { label: "Apps", submenu: itens };
}

/** Dispara a carga dos comandos de contexto do servidor, se ainda não houver cache. */
export function garantirComandosDeContexto(guildId: string | null | undefined): void {
  if (guildId) useComandosDeContexto.getState().garantir(guildId);
}

/**
 * Manda o convite deste servidor pela DM com a pessoa (abre/reabre a
 * conversa do meu lado, como `DMList.enviarConviteNaConversa`, mas a partir
 * de um `userId` solto — aqui não existe uma conversa já aberta de onde
 * partir).
 */
async function enviarConviteParaUsuario(userId: string, guildId: string) {
  try {
    const [dm, invite] = await Promise.all([api.openDM(userId), api.createInvite(guildId)]);
    emit(WS_EVENTS.MESSAGE_CREATE, { channelId: dm.id, content: urlDeConvite(invite.code) });
    ui.toast("Convite enviado");
  } catch (e) {
    ui.toast(errorMessage(e, "Não foi possível enviar o convite"), "error");
  }
}

/** Submenu "Convidar para o servidor >" — um item por servidor meu. */
export function submenuConvidarParaOServidor(
  userId: string,
  meusServidores: readonly Guild[],
): MenuItem {
  if (meusServidores.length === 0) {
    return { label: "Convidar para o servidor", submenu: [SEM_SERVIDOR] };
  }
  return {
    label: "Convidar para o servidor",
    submenu: meusServidores.map((g) => ({
      label: g.name,
      onSelect: () => void enviarConviteParaUsuario(userId, g.id),
    })),
  };
}

/** "Iniciar chamada" a partir de um `userId` solto: abre/reabre a DM e liga. */
export async function iniciarChamadaComUsuario(userId: string): Promise<void> {
  try {
    const dm = await api.openDM(userId);
    await useVoice.getState().startCall(dm.id, false);
  } catch (e) {
    ui.toast(errorMessage(e, "Não foi possível iniciar a chamada"), "error");
  }
}
