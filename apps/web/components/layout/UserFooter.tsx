"use client";

import { Headphones, HeadphoneOff, Mic, MicOff, Settings } from "lucide-react";
import { customStatusOf, displayNameOf } from "@streamz/shared";
import Avatar, { STATUS_LABEL } from "@/components/ui/Avatar";
import Tooltip from "@/components/ui/Tooltip";
import VoiceConnectedBar from "@/components/voice/VoiceConnectedBar";
import { useAuth } from "@/stores/auth";
import { resolveStatus, resolveUser, usePresence } from "@/stores/presence";
import { anchorOf, useUI } from "@/stores/ui";
import { useVoicePrefs } from "@/stores/voicePrefs";

/** Botão de ícone do rodapé (32px, hover claro; vermelho quando desligado). */
function FooterButton({
  label,
  onClick,
  off = false,
  children,
}: {
  label: string;
  onClick: () => void;
  off?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={off}
        className={`grid h-8 w-8 place-items-center rounded-[4px] transition hover:bg-hov ${
          off ? "text-red" : "text-txt-secondary hover:text-txt-primary"
        }`}
      >
        {children}
      </button>
    </Tooltip>
  );
}

/**
 * Rodapé das colunas laterais — o "painel do usuário" do Discord: avatar com
 * status, nome, e os três botões de microfone, áudio e configurações.
 */
export default function UserFooter() {
  const user = useAuth((s) => s.user);
  const statuses = usePresence((s) => s.statuses);
  const profiles = usePresence((s) => s.profiles);
  const openProfile = useUI((s) => s.openProfile);
  const openModal = useUI((s) => s.openModal);
  const muted = useVoicePrefs((s) => s.muted);
  const deafened = useVoicePrefs((s) => s.deafened);
  const toggleMute = useVoicePrefs((s) => s.toggleMute);
  const toggleDeafen = useVoicePrefs((s) => s.toggleDeafen);

  if (!user) return null;
  // o status personalizado chega por presença, não pelo `user` da sessão
  const vivo = resolveUser(profiles, user);
  const status = resolveStatus(statuses, vivo);

  return (
    <>
      {/* f-voz: a barra da call fica colada acima do painel, como no Discord */}
      <VoiceConnectedBar />
      <div className="flex h-[52px] shrink-0 items-center gap-1 bg-footer px-2">
        <button
          type="button"
          onClick={(e) => openProfile(user, anchorOf(e.currentTarget))}
          aria-label="Meu perfil"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-[4px] py-1 pl-0.5 pr-2 text-left transition hover:bg-hov"
        >
          <Avatar user={vivo} size="md" status={status} surface="border-footer" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold leading-[18px] text-txt-primary">
              {displayNameOf(user)}
            </span>
            {/* o status personalizado tem prioridade sobre o rótulo do estado:
                é o que o Discord mostra quando a pessoa escreveu algo */}
            <span className="block truncate text-xs leading-[13px] text-txt-muted">
              {customStatusOf(vivo) ?? STATUS_LABEL[status]}
            </span>
          </span>
        </button>

        <FooterButton label={muted ? "Desativar mudo" : "Silenciar"} off={muted} onClick={toggleMute}>
          {muted ? <MicOff size={20} /> : <Mic size={20} />}
        </FooterButton>
        <FooterButton
          label={deafened ? "Reativar áudio" : "Desativar áudio"}
          off={deafened}
          onClick={toggleDeafen}
        >
          {deafened ? <HeadphoneOff size={20} /> : <Headphones size={20} />}
        </FooterButton>
        <FooterButton label="Configurações do usuário" onClick={() => openModal({ kind: "settings" })}>
          <Settings size={20} />
        </FooterButton>
      </div>
    </>
  );
}
