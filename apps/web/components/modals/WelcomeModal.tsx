"use client";

import { Hash, PartyPopper } from "lucide-react";
import Dialog, { PrimaryButton } from "@/components/modals/Dialog";
import { useChannels } from "@/stores/channels";
import { useGuilds } from "@/stores/guilds";
import { useModeration } from "@/stores/moderation";
import { useUI } from "@/stores/ui";

/**
 * Tela de boas-vindas do servidor: aparece uma vez, ao entrar, com a descrição
 * escrita pelo dono e os canais em destaque. Clicar num destaque leva direto
 * para lá — é o objetivo dela, encurtar o "e agora, por onde começo?".
 */
export default function WelcomeModal({ guildId }: { guildId: string }) {
  const closeModal = useUI((s) => s.closeModal);
  const membership = useModeration((s) => s.membership);
  const dismiss = useModeration((s) => s.dismissWelcome);
  const guild = useGuilds((s) => s.guilds.find((g) => g.id === guildId) ?? null);
  const select = useChannels((s) => s.select);
  const channels = useChannels((s) => s.channels);

  const destaques = membership?.guildId === guildId ? membership.welcomeChannels : [];

  function fechar() {
    void dismiss();
    closeModal();
  }

  function abrir(channelId: string) {
    const canal = channels.find((c) => c.id === channelId);
    if (canal) select(canal);
    fechar();
  }

  return (
    <Dialog
      title={`Bem-vindo a ${guild?.name ?? "este servidor"}!`}
      onClose={fechar}
      className="w-[460px]"
      footer={
        <PrimaryButton autoFocus onClick={fechar}>
          Começar a conversar
        </PrimaryButton>
      }
    >
      <div className="mb-4 flex items-start gap-3">
        <PartyPopper size={24} className="mt-0.5 shrink-0 text-yellow" aria-hidden="true" />
        <p className="min-w-0 flex-1 break-words text-txt-normal">
          {membership?.onboarding.welcomeDescription ||
            "Dê uma olhada nos canais e apresente-se quando quiser."}
        </p>
      </div>

      {destaques.length > 0 && (
        <>
          <p className="mb-2 font-display text-xs font-bold uppercase tracking-[0.02em] text-txt-secondary">
            Comece por aqui
          </p>
          <div className="flex flex-col gap-1">
            {destaques.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => abrir(c.id)}
                className="flex h-10 items-center gap-2 rounded-[4px] bg-rail px-3 text-left text-txt-normal transition hover:bg-hov"
              >
                <Hash size={18} className="shrink-0 text-txt-faint" aria-hidden="true" />
                <span className="truncate font-medium">{c.name ?? "canal"}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </Dialog>
  );
}
