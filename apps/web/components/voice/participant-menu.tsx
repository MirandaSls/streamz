"use client";

import {
  Permission,
  computePermissions,
  hasPermission,
  highestPosition,
  type PermissionMember,
  type PublicUser,
} from "@streamz/shared";
import { MENU_WIDTH_WIDE } from "@/components/ui/ContextMenu";
import { mencionar as entregarMencao } from "@/lib/mencoes";
import {
  garantirComandosDeContexto,
  iniciarChamadaComUsuario,
  itemAdicionarNota,
  itemBloquear,
  itemDesfazerAmizade,
  itemIgnorar,
  submenuAppsDeUsuario,
  submenuConvidarParaOServidor,
} from "@/lib/menu-de-usuario";
import { lerRascunho, salvarRascunho } from "@/lib/rascunhos";
import { useAuth } from "@/stores/auth";
import { useChannels } from "@/stores/channels";
import { useDMs } from "@/stores/dms";
import { useFriends } from "@/stores/friends";
import { useGuilds } from "@/stores/guilds";
import { useNotas } from "@/stores/notas";
import { usePermissions } from "@/stores/permissions";
import { usePreferenciasPorParticipante } from "@/stores/preferencias-por-participante";
import { ui, type MenuItem } from "@/stores/ui";
import { useVoice } from "@/stores/voice";

/**
 * O menu de um participante da sala — o mesmo na barra lateral e no tile do
 * palco, para as duas listas não divergirem com o tempo.
 *
 * SEM ícones (ESPEC2 item N, prints s13/s14/s15): ao contrário do menu de
 * mensagem/DM, o menu de usuário desta leva é liso — igual ao menu de membro
 * (`MemberList.tsx`) e ao de `lib/menu-de-usuario.tsx`, de onde vêm os itens
 * sociais compartilhados (nota, Apps, convidar para o servidor, ignorar,
 * bloquear, desfazer amizade).
 *
 * "Volume do usuário" é a barra deslizante do próprio item (`slider`,
 * `semValor: true` — sem o "100%" ao lado, só o rótulo em cima e a barra na
 * cor da marca embaixo), não mais um submenu de degraus: o menu de contexto
 * do app desenha ações, não controles contínuos, mas o Discord resolve o
 * volume ali mesmo, sem abrir nada.
 *
 * "Silenciar transmissão" só aparece com a pessoa transmitindo tela agora
 * (`VoiceStateEvent.screen` de `voz.statesOf`, não `opcoes.tela` — esse só
 * existe quando o menu abriu **de cima da própria tela** e eu já a assisto;
 * aqui a checagem vale também vindo da barra lateral, de longe). É outro
 * eixo de "Silenciar": aquele cala a voz da pessoa, este só o som da
 * transmissão dela (`telaSilenciada` em `stores/voice.ts`) — quem assiste a
 * uma transmissão com música alta quer calar a música, não a pessoa.
 *
 * "Silenciar efeitos sonoros" e "Desativar vídeo" são preferências **deste
 * navegador sobre esta pessoa** (`stores/preferencias-por-participante.ts`) —
 * cada uma com efeito num lugar diferente: a primeira faz `soundboard.ts`
 * recusar o som que ela dispara (`stores/soundboard.ts`); a segunda faz o
 * palco tratar a câmera dela como inexistente (`VoiceGrid.tsx`).
 *
 * "Cargos" só aparece com o servidor da sala carregado (`usePermissions`
 * pareado com `useGuilds.activeGuildId`) e permissão de gerenciar cargos — a
 * mesma conta de `MemberList.tsx`, reimplementada aqui porque este arquivo não
 * é um componente (abre por `onContextMenu`, sem hooks disponíveis).
 */

/** Quem abre o slider fino de volume (registrado pelo host, ver VoiceGrid). */
export let abrirVolumeDe: (x: number, y: number, userId: string, nome: string) => void = () => {};

export function registrarVolumePopover(fn: typeof abrirVolumeDe) {
  abrirVolumeDe = fn;
}

export function abrirMenuDeParticipante(
  x: number,
  y: number,
  user: PublicUser,
  opcoes: {
    sou: boolean;
    channelId: string;
    /**
     * Presente só quando o menu abriu a partir do tile de uma tela que eu
     * assisto agora (nunca a minha própria). É o mesmo botão do hover do tile
     * (`TileDeVoz`) — no celular, sem hover, este menu (toque longo) é o único
     * caminho até ele.
     */
    tela?: { onPararDeAssistir: () => void };
  },
) {
  const voz = useVoice.getState();
  const volume = user.id in voz.volumes ? voz.volumes[user.id] : 1;
  const silenciado = !!voz.silenciados[user.id];
  const telaSilenciada = !!voz.telaSilenciada[user.id];
  const estaTransmitindo = voz.statesOf(opcoes.channelId).some((e) => e.user.id === user.id && e.screen);
  const prefs = usePreferenciasPorParticipante.getState();

  // o canal manda no servidor: DM/grupo não tem `guildId`, e aí Apps, convite
  // por servidor e cargos se comportam de acordo (ver os itens abaixo)
  const canal = useChannels.getState().channels.find((c) => c.id === opcoes.channelId) ?? null;
  const guildId = canal?.guildId ?? null;
  if (guildId) garantirComandosDeContexto(guildId);

  const itens: MenuItem[] = [
    {
      label: "Perfil",
      onSelect: () => ui.openProfile(user, { x, y, width: 0, height: 0 }),
    },
    {
      label: "Mencionar",
      onSelect: () => mencionar(opcoes.channelId, user),
    },
  ];

  // "Parar de assistir": único jeito de sair de uma tela pelo menu no celular
  // (o botão do hover não existe lá — ver `TileDeVoz`). Vem antes dos itens
  // sociais porque é a ação que o próprio tile anunciou ao abrir este menu.
  if (opcoes.tela) {
    itens.push({ separator: true });
    itens.push({ label: "Parar de assistir", onSelect: opcoes.tela.onPararDeAssistir });
  }

  if (opcoes.sou) {
    if (guildId) {
      itens.push({ separator: true });
      itens.push({
        label: "Editar perfil por servidor",
        onSelect: () => ui.openModal({ kind: "perfilPorServidor", guildId }),
      });
      itens.push(submenuAppsDeUsuario(guildId, opcoes.channelId, user.id));
    }
  } else {
    const friends = useFriends.getState();
    const souAmigo = friends.friends.some((f) => f.id === user.id);
    const bloqueado = friends.blocked.some((b) => b.id === user.id);
    const ignorado = friends.ignored?.some((u) => u.id === user.id) ?? false;
    const notaExistente = useNotas.getState().minhasNotas[user.id];

    itens.push({ label: "Mensagem", onSelect: () => void useDMs.getState().openWith(user.id) });
    itens.push({ label: "Iniciar chamada", onSelect: () => void iniciarChamadaComUsuario(user.id) });
    itens.push(itemAdicionarNota(user.id, notaExistente));
    itens.push({ separator: true });
    // barra arrastável ali mesmo, como no Discord: degraus fixos obrigavam a
    // escolher entre 100% e 150% sem nada no meio
    itens.push({
      label: "Volume do usuário",
      slider: {
        value: Math.round(volume * 100),
        min: 0,
        max: 200,
        step: 5,
        onChange: (pct) => useVoice.getState().setVolume(user.id, pct / 100),
        semValor: true,
      },
    });
    itens.push({ separator: true });
    itens.push({
      label: silenciado ? "Reativar áudio" : "Silenciar",
      checked: silenciado,
      control: "checkbox",
      onSelect: () => useVoice.getState().toggleSilenciado(user.id),
    });
    if (estaTransmitindo) {
      itens.push({
        label: telaSilenciada ? "Reativar som da transmissão" : "Silenciar transmissão",
        checked: telaSilenciada,
        control: "checkbox",
        onSelect: () => useVoice.getState().alternarTelaSilenciada(user.id),
      });
    }
    itens.push({
      label: "Silenciar efeitos sonoros",
      checked: prefs.efeitosSilenciados(user.id),
      control: "checkbox",
      onSelect: () => usePreferenciasPorParticipante.getState().alternarEfeitosSilenciados(user.id),
    });
    itens.push({
      label: "Desativar vídeo",
      checked: prefs.videoDesativado(user.id),
      control: "checkbox",
      onSelect: () => usePreferenciasPorParticipante.getState().alternarVideoDesativado(user.id),
    });
    itens.push(submenuAppsDeUsuario(guildId, opcoes.channelId, user.id));
    itens.push(submenuConvidarParaOServidor(user.id, useGuilds.getState().guilds));
    itens.push(
      souAmigo
        ? itemDesfazerAmizade(user, friends.remove)
        : { label: "Adicionar amigo", onSelect: () => void useFriends.getState().send(user.username) },
    );
    itens.push(itemIgnorar(user.id, ignorado, friends.ignorar, friends.deixarDeIgnorar));
    itens.push(itemBloquear(user, bloqueado, friends.block, friends.unblock));
  }

  const cargos = submenuCargos(guildId, user.id);
  if (cargos) {
    itens.push({ separator: true });
    itens.push(cargos);
  }

  // (itens de moderação de voz do servidor — silenciar/ensurdecer, mover,
  // desconectar — entrariam aqui, "mantidos"; não há nenhum hoje neste menu)

  ui.openContextMenu(x, y, itens, MENU_WIDTH_WIDE);
}

/**
 * "Cargos" — bolinha colorida + nome, com checkbox de atribuição só para quem
 * pode gerenciar cargos (mesma regra de `MemberList.tsx`, §J). `null` quando
 * o servidor da sala não é o carregado (`usePermissions`/`useGuilds` só
 * conhecem o servidor **ativo**) ou quando ninguém pode atribuir nada.
 */
function submenuCargos(guildId: string | null, targetUserId: string): MenuItem | null {
  if (!guildId) return null;
  const guildsState = useGuilds.getState();
  const permsState = usePermissions.getState();
  if (guildsState.activeGuildId !== guildId || permsState.guildId !== guildId) return null;

  const meId = useAuth.getState().user?.id;
  const guild = guildsState.guilds.find((g) => g.id === guildId);
  const meuMembro = guildsState.members.find((m) => m.user.id === meId);
  const alvoMembro = guildsState.members.find((m) => m.user.id === targetUserId);
  const meuPM: PermissionMember = { isOwner: !!guild && guild.ownerId === meId, roleIds: meuMembro?.roleIds ?? [] };
  const meuTeto = highestPosition(meuPM, permsState.roles);
  const podeCargos = hasPermission(
    computePermissions(meuPM, permsState.roles, []),
    Permission.MANAGE_ROLES,
  );
  const atribuiveis = permsState.roles
    .filter((r) => !r.isDefault && r.position < meuTeto)
    .sort((a, b) => b.position - a.position);
  if (!podeCargos || atribuiveis.length === 0) return null;

  return {
    label: "Cargos",
    submenu: atribuiveis.map((r) => ({
      label: r.name,
      control: "checkbox" as const,
      checked: alvoMembro?.roleIds.includes(r.id) ?? false,
      dot: r.color ?? undefined,
      onSelect: () =>
        void guildsState.toggleRole(targetUserId, r.id, !(alvoMembro?.roleIds.includes(r.id) ?? false)),
    })),
  };
}

/**
 * Mencionar avisa o composer que estiver montado (`lib/mencoes`) e, se não
 * houver nenhum — do palco de voz o campo de texto só aparece quando a conversa
 * abre —, cai no rascunho do canal, que sobrevive até ele montar.
 */
function mencionar(channelId: string, user: PublicUser) {
  if (entregarMencao(user)) return;
  const atual = lerRascunho(channelId);
  const prefixo = atual && !atual.endsWith(" ") ? `${atual} ` : atual;
  // a menção é `@username` em texto puro: é assim que o contrato a reconhece
  salvarRascunho(channelId, `${prefixo}@${user.username} `);
  ui.toast(`@${user.username} foi para a caixa de mensagem`);
}
