"use client";

import { ChevronRight, HeadphoneOff, MicOff, UserPlus, Video } from "lucide-react";
import { displayNameOf } from "@streamz/shared";
import Avatar from "@/components/ui/Avatar";
import { abrirMenuDeParticipante } from "@/components/voice/participant-menu";
import { useAuth } from "@/stores/auth";
import { anchorOf, ui } from "@/stores/ui";
import { useVoice } from "@/stores/voice";

/**
 * Quem está num canal de voz, listado sob ele na barra lateral.
 *
 * É a leitura do `voice.state` do gateway — o mesmo evento que a barra lateral
 * consome. Fica num componente próprio para que a `ChannelSidebar` precise
 * apenas montá-lo: a regra de quem aparece (e com quais ícones) mora aqui,
 * junto do resto da voz.
 *
 * Três detalhes que parecem cosméticos e não são:
 *
 * - O avatar alinha com o **ícone** do canal, não com o texto. É o que faz a
 *   lista ler como "dentro" do canal, e não como uma segunda lista solta.
 * - Mudo é só o ícone de microfone cortado. Esmaecer o nome de quem está mudo
 *   diria "esta pessoa está ausente", que é outra coisa — o esmaecimento fica
 *   reservado a quem está com o áudio desativado (não escuta ninguém).
 * - Transmissão vira pílula "AO VIVO", que é o convite para assistir; um ícone
 *   verde a mais no meio dos outros passa despercebido.
 */
export default function VoiceChannelMembers({
  channelId,
  guildId,
}: {
  channelId: string;
  /** só para o convite; sem ele a linha "Convidar para voz" não aparece. */
  guildId?: string | null;
}) {
  const estados = useVoice((s) => s.statesOf(channelId));
  const falando = useVoice((s) => s.falando);
  const estouAqui = useVoice((s) => s.channelId === channelId);
  const meId = useAuth((s) => s.user?.id);
  if (estados.length === 0) return null;

  return (
    <ul aria-label="Na sala de voz" className="mb-1 ml-3 mr-2 mt-0.5 space-y-0.5">
      {estados.map((e) => {
        const nome = displayNameOf(e.user);
        // quem está mudo nunca "fala": o anel tem de contar a mesma história
        const ativo = !e.muted && falando.includes(e.user.id);
        return (
          <li key={e.user.id} data-voice-member={e.user.id}>
            <button
              type="button"
              onClick={(ev) => ui.openProfile(e.user, anchorOf(ev.currentTarget))}
              onContextMenu={(ev) => {
                ev.preventDefault();
                abrirMenuDeParticipante(ev.clientX, ev.clientY, e.user, {
                  sou: e.user.id === meId,
                  channelId,
                });
              }}
              className={`flex h-[26px] w-full items-center gap-1.5 rounded-[4px] px-1 text-left text-sm hover:bg-hov hover:text-txt-normal ${
                e.deafened ? "text-txt-faint opacity-30" : "text-txt-faint"
              }`}
            >
              {/* 20px é o tamanho do Discord aqui, e a escala do Avatar salta de
                  16 para 24: o ajuste vai por className no invólucro, que é o
                  que evita inventar um sexto tamanho global por um caso só */}
              <Avatar
                user={e.user}
                size="sm"
                surface="border-panel"
                className={`h-5 w-5 rounded-full [&>img]:h-5 [&>img]:w-5 [&>span]:h-5 [&>span]:w-5 [&>span]:text-[9px] ${
                  ativo ? "ring-2 ring-green" : ""
                }`}
              />
              <span className="min-w-0 flex-1 truncate">{nome}</span>
              {e.screen ? (
                <span className="shrink-0 rounded-[3px] bg-red px-1 text-[10px] font-bold uppercase leading-4 tracking-[0.02em] text-white">
                  Ao vivo
                </span>
              ) : (
                e.video && <Video size={14} className="shrink-0 text-txt-muted" aria-label="Com câmera" />
              )}
              {e.deafened ? (
                <HeadphoneOff size={14} className="shrink-0 text-red" aria-label="Sem áudio" />
              ) : (
                e.muted && <MicOff size={14} className="shrink-0 text-red" aria-label="Mudo" />
              )}
            </button>
          </li>
        );
      })}

      {/* Só para quem está dentro: de fora, a linha seria um convite para uma
          sala em que você não está, e o caminho de entrar é clicar no canal.
          O chevron é o do print — ele abre a escolha de quem convidar. */}
      {estouAqui && guildId && (
        <li>
          <button
            type="button"
            onClick={() => ui.openModal({ kind: "invite", guildId })}
            className="flex h-[26px] w-full items-center gap-1.5 rounded-[4px] px-1 text-left text-sm text-txt-faint transition hover:bg-hov hover:text-txt-normal"
          >
            <span className="grid h-5 w-5 shrink-0 place-items-center">
              <UserPlus size={14} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1 truncate">Convidar para voz</span>
            <ChevronRight size={14} className="shrink-0" aria-hidden="true" />
          </button>
        </li>
      )}
    </ul>
  );
}
