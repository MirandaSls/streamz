"use client";

import { useRef, useState } from "react";
import { ChevronDown, Headphones, HeadphoneOff, Mic, MicOff, Settings } from "lucide-react";
import { customStatusOf, displayNameOf } from "@streamz/shared";
import Avatar, { STATUS_LABEL } from "@/components/ui/Avatar";
import PopoverFlutuante from "@/components/ui/PopoverFlutuante";
import Tooltip from "@/components/ui/Tooltip";
import VoiceConnectedBar from "@/components/voice/VoiceConnectedBar";
import { ListaDeMicrofones, ListaDeSaidas } from "@/components/voice/listas-de-dispositivos";
import { useAuth } from "@/stores/auth";
import { resolveStatus, resolveUser, usePresence } from "@/stores/presence";
import { anchorOf, useUI } from "@/stores/ui";
import { useVoicePrefs } from "@/stores/voicePrefs";

/** Botão de ícone do rodapé (32px, hover claro). */
function FooterButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="grid h-8 w-8 place-items-center rounded-[4px] text-txt-secondary transition hover:bg-hov hover:text-txt-primary"
      >
        {children}
      </button>
    </Tooltip>
  );
}

/**
 * Microfone e áudio: o botão e, colada nele, a seta que escolhe o aparelho.
 *
 * Desligado é **ícone vermelho sobre véu vermelho**, não ícone vermelho solto.
 * O véu é o que diferencia "está desligado" de "passar o mouse aqui desliga" —
 * sem ele, mudo e não-mudo têm a mesma silhueta e a cor sozinha precisa fazer
 * todo o trabalho, o que falha para quem não distingue vermelho.
 */
function FooterSplit({
  label,
  labelDaSeta,
  off,
  onClick,
  menu,
  children,
}: {
  label: string;
  labelDaSeta: string;
  off: boolean;
  onClick: () => void;
  /** função, e não nó pronto: listar aparelhos pede permissão de mídia. */
  menu: () => React.ReactNode;
  children: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const seta = useRef<HTMLButtonElement>(null);

  const cor = off
    ? "bg-red/15 text-red hover:bg-red/25"
    : "text-txt-secondary hover:bg-hov hover:text-txt-primary";

  return (
    <div className="flex items-center">
      <Tooltip label={label}>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          aria-pressed={off}
          className={`grid h-8 w-8 place-items-center rounded-l-[4px] rounded-r-[1px] transition ${cor}`}
        >
          {children}
        </button>
      </Tooltip>
      <Tooltip label={labelDaSeta}>
        <button
          ref={seta}
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-label={labelDaSeta}
          aria-expanded={aberto}
          className={`grid h-8 w-4 place-items-center rounded-r-[4px] rounded-l-[1px] transition ${cor}`}
        >
          <ChevronDown size={12} />
        </button>
      </Tooltip>

      <PopoverFlutuante
        ancora={seta}
        aberto={aberto}
        onFechar={() => setAberto(false)}
        rotulo={labelDaSeta}
        largura={288}
        denso
      >
        <div role="menu" aria-label={labelDaSeta} onClick={() => setAberto(false)}>
          {menu()}
        </div>
      </PopoverFlutuante>
    </div>
  );
}

/**
 * Rodapé das colunas laterais — o "painel do usuário" do Discord: avatar com
 * status, nome, e os controles de microfone, áudio e configurações.
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
      <div className="flex h-[52px] shrink-0 items-center gap-0.5 bg-footer px-2">
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

        <FooterSplit
          label={muted ? "Desativar mudo" : "Silenciar"}
          labelDaSeta="Escolher microfone"
          off={muted}
          onClick={toggleMute}
          menu={() => <ListaDeMicrofones />}
        >
          {muted ? <MicOff size={20} /> : <Mic size={20} />}
        </FooterSplit>

        <FooterSplit
          label={deafened ? "Reativar áudio" : "Desativar áudio"}
          labelDaSeta="Escolher saída de áudio"
          off={deafened}
          onClick={toggleDeafen}
          menu={() => <ListaDeSaidas />}
        >
          {deafened ? <HeadphoneOff size={20} /> : <Headphones size={20} />}
        </FooterSplit>

        <FooterButton
          label="Configurações do usuário"
          onClick={() => openModal({ kind: "settings" })}
        >
          <Settings size={20} />
        </FooterButton>
      </div>
    </>
  );
}
