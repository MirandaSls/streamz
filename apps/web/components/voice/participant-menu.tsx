"use client";

import { AtSign, Phone, User, Volume2, VolumeX } from "@/components/ui/icones";
import { displayNameOf, type PublicUser } from "@streamz/shared";
import { MENU_WIDTH_WIDE } from "@/components/ui/ContextMenu";
import { mencionar as entregarMencao } from "@/lib/mencoes";
import { lerRascunho, salvarRascunho } from "@/lib/rascunhos";
import { useDMs } from "@/stores/dms";
import { ui, type MenuItem } from "@/stores/ui";
import { useVoice } from "@/stores/voice";

/**
 * O menu de um participante da sala — o mesmo na barra lateral e no tile do
 * palco, para as duas listas não divergirem com o tempo.
 *
 * Volume é submenu (como no Discord) porque o menu de contexto do app desenha
 * ações, não controles contínuos: os degraus resolvem o caso comum num clique e
 * "Ajustar…" abre o slider fino para o resto.
 */

const DEGRAUS = [50, 100, 150, 200];

/** Quem abre o slider fino de volume (registrado pelo host, ver VoiceGrid). */
export let abrirVolumeDe: (x: number, y: number, userId: string, nome: string) => void = () => {};

export function registrarVolumePopover(fn: typeof abrirVolumeDe) {
  abrirVolumeDe = fn;
}

export function abrirMenuDeParticipante(
  x: number,
  y: number,
  user: PublicUser,
  opcoes: { sou: boolean; channelId: string },
) {
  const nome = displayNameOf(user);
  const voz = useVoice.getState();
  const volume = user.id in voz.volumes ? voz.volumes[user.id] : 1;
  const silenciado = !!voz.silenciados[user.id];

  const itens: MenuItem[] = [
    {
      label: "Perfil",
      icon: <User size={18} />,
      onSelect: () => ui.openProfile(user, { x, y, width: 0, height: 0 }),
    },
    {
      label: "Mencionar",
      icon: <AtSign size={18} />,
      onSelect: () => mencionar(opcoes.channelId, user),
    },
  ];

  if (!opcoes.sou) {
    itens.push({
      label: "Chamar",
      icon: <Phone size={18} />,
      onSelect: () => void chamar(user.id),
    });
    itens.push({ separator: true });
    // barra arrastável ali mesmo, como no Discord: degraus fixos obrigavam a
    // escolher entre 100% e 150% sem nada no meio
    itens.push({
      label: "Volume",
      icon: <Volume2 size={18} />,
      slider: {
        value: Math.round(volume * 100),
        min: 0,
        max: 200,
        step: 5,
        onChange: (pct) => useVoice.getState().setVolume(user.id, pct / 100),
        format: (pct) => `${pct}%`,
      },
    });
    itens.push({
      label: silenciado ? "Reativar áudio" : "Silenciar",
      icon: <VolumeX size={18} />,
      checked: silenciado,
      control: "checkbox",
      onSelect: () => useVoice.getState().toggleSilenciado(user.id),
    });
  }

  ui.openContextMenu(x, y, itens, MENU_WIDTH_WIDE);
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

/** Abre (ou cria) a conversa direta com a pessoa e liga para ela. */
async function chamar(userId: string) {
  await useDMs.getState().openWith(userId);
  const channelId = useDMs.getState().activeId;
  if (channelId) await useVoice.getState().startCall(channelId, false);
}
