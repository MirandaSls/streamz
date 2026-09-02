"use client";

import { ChevronRight, Compass, Hash, Megaphone, Volume2 } from "@/components/ui/icones";
import Dialog from "@/components/modals/Dialog";
import { useChannels } from "@/stores/channels";
import { useGuilds } from "@/stores/guilds";
import { useModeration } from "@/stores/moderation";
import { useUI } from "@/stores/ui";

/**
 * Tela de boas-vindas do servidor: aparece uma vez, ao entrar, com a arte do
 * servidor no topo, a descrição escrita pelo dono e os canais em destaque.
 *
 * Não tem rodapé: o botão de ação é o **próprio cartão** que se clica: cada
 * destaque leva direto para o canal, e o último cartão fecha a tela. É o
 * objetivo dela, encurtar o "e agora, por onde começo?".
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
      hideHeader
      semPadding
      onClose={fechar}
      className="w-[460px]"
    >
      <div>
        {/* arte do servidor no topo, no lugar do ícone decorativo de antes */}
        <div className="relative h-[120px] bg-accent">
          {guild?.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={guild.iconUrl} alt="" className="h-full w-full object-cover opacity-60" />
          ) : null}
          <span
            aria-hidden="true"
            className="absolute inset-0 grid place-items-center font-display text-3xl font-extrabold tracking-title text-accent-ink"
          >
            {guild?.name?.slice(0, 2).toUpperCase()}
          </span>
        </div>

        <div className="p-4">
          <h2 className="font-display text-xl font-bold tracking-title text-txt-primary">
            Bem-vindo a {guild?.name ?? "este servidor"}!
          </h2>
          <p className="mt-1 break-words text-sm text-txt-normal">
            {membership?.onboarding.welcomeDescription ||
              "Dê uma olhada nos canais e apresente-se quando quiser."}
          </p>

          <div className="mt-4 flex flex-col gap-2">
            {destaques.map((d) => {
              const canal = channels.find((c) => c.id === d.id) ?? null;
              const Icone =
                canal?.type === "VOICE"
                  ? Volume2
                  : canal?.type === "ANNOUNCEMENT"
                    ? Megaphone
                    : Hash;
              return (
                <Cartao
                  key={d.id}
                  icone={<Icone size={20} />}
                  titulo={d.name ?? "canal"}
                  descricao={canal?.topic ?? "Comece a conversa por aqui."}
                  onClick={() => abrir(d.id)}
                />
              );
            })}
            <Cartao
              icone={<Compass size={20} />}
              titulo="Explorar por conta própria"
              descricao="Ver todos os canais do servidor."
              onClick={fechar}
            />
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function Cartao({
  icone,
  titulo,
  descricao,
  onClick,
}: {
  icone: React.ReactNode;
  titulo: string;
  descricao: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-[8px] bg-panel p-3 text-left transition hover:bg-hov"
    >
      <span
        aria-hidden="true"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-rail text-txt-secondary"
      >
        {icone}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-txt-primary">{titulo}</span>
        <span className="block truncate text-sm text-txt-muted">{descricao}</span>
      </span>
      <ChevronRight size={20} aria-hidden="true" className="shrink-0 text-txt-muted" />
    </button>
  );
}
