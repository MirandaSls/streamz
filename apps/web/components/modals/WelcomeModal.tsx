"use client";

import { ChevronRight, Compass, Hash, Megaphone, Volume2 } from "@/components/ui/icones";
import Dialog from "@/components/modals/Dialog";
import { useChannels } from "@/stores/channels";
import { useGuilds } from "@/stores/guilds";
import { useModeration } from "@/stores/moderation";
import { useUI } from "@/stores/ui";

/**
 * Tela de boas-vindas do servidor: aparece uma vez, ao entrar, com o ícone do
 * servidor, o título, a descrição escrita pelo dono e os canais em destaque.
 *
 * Não tem rodapé: o botão de ação é o **próprio cartão** que se clica: cada
 * destaque leva direto para o canal. É o objetivo dela, encurtar o "e agora,
 * por onde começo?".
 *
 * **Redesenho (cartão 7h).** A versão anterior pintava uma faixa de 120px em
 * `bg-brand-500` atrás do ícone do servidor, com as iniciais em
 * `accent-ink` por cima — um cabeçalho decorativo que o Discord não tem aqui.
 * A referência real do runtime welcome screen (não a tela de configuração:
 * `docs/referencias-discord/suporte/imagens/server-settings/
 * 360043913591-community-server-welcome-screen/04.png`, "Welcome to Wumpus
 * Land") mostra o ícone do servidor solto no topo do cartão — sem faixa de
 * cor —, "Bem-vindo a" em cinza e o nome do servidor em branco/negrito,
 * título grande centralizado, descrição centralizada, e SÓ a lista de canais
 * em destaque (sem um item de "explorar" fixo). Catálogo, não print 1:1: dá
 * presença e proporção dos elementos, nunca px — por isso o espaçamento
 * abaixo usa a escala já existente no app (4/8/16/24/32), não um número
 * novo tirado da imagem (ver "nao_verificado").
 *
 * O ícone do servidor sem foto segue o mesmo padrão do cartão de convite
 * (`InviteEmbed.tsx`: caixa `rounded-2xl bg-input-background-default` com as
 * iniciais) — não `bg-brand-500`: o limão é para controle interativo e marca,
 * não decoração atrás de cada ícone de servidor sem capa.
 */
export default function WelcomeModal({ guildId }: { guildId: string }) {
  const closeModal = useUI((s) => s.closeModal);
  const membership = useModeration((s) => s.membership);
  const dismiss = useModeration((s) => s.dismissWelcome);
  const guild = useGuilds((s) => s.guilds.find((g) => g.id === guildId) ?? null);
  const select = useChannels((s) => s.select);
  const channels = useChannels((s) => s.channels);

  const destaques = membership?.guildId === guildId ? membership.welcomeChannels : [];
  const nome = guild?.name ?? "este servidor";

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
    <Dialog title={`Bem-vindo a ${nome}!`} hideHeader semPadding onClose={fechar} className="w-[460px]">
      <div className="flex flex-col items-center px-6 pb-6 pt-8 text-center">
        {/* ícone do servidor: solto no topo, sem faixa de cor atrás (04.png) */}
        <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-2xl bg-input-background-default text-2xl font-extrabold text-text-strong">
          {guild?.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={guild.iconUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            iniciais(nome)
          )}
        </div>

        <h2 className="mt-4 text-balance font-headline text-heading-xxl font-extrabold">
          <span className="text-text-muted">Bem-vindo a </span>
          <span className="text-text-strong">{nome}</span>
          <span className="text-text-strong">!</span>
        </h2>

        <p className="mt-2 max-w-[380px] break-words text-text-sm text-text-muted">
          {membership?.onboarding.welcomeDescription ||
            "Dê uma olhada nos canais e apresente-se quando quiser."}
        </p>

        <div className="mt-6 w-full">
          {destaques.length > 0 && (
            <p className="mb-2 text-left text-xs font-bold uppercase tracking-wide text-text-muted">
              Principais coisas para fazer aqui
            </p>
          )}
          <div className="flex flex-col gap-2">
            {destaques.length > 0 ? (
              destaques.map((d) => {
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
              })
            ) : (
              // vazio: nenhum canal em destaque configurado — o Discord nem
              // mostra esta tela nesse caso (a exige para habilitar a tela),
              // mas a nossa pode abrir sem nenhum destaque ainda escolhido, e
              // sem saída a pessoa ficaria presa no modal
              <Cartao
                icone={<Compass size={20} />}
                titulo="Explorar por conta própria"
                descricao="Ver todos os canais do servidor."
                onClick={fechar}
              />
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/** Iniciais do nome, como o rail e o cartão de convite fazem sem ícone. */
function iniciais(nome: string): string {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
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
      className="flex items-center gap-3 rounded-lg bg-background-base-lowest p-3 text-left transition hover:bg-interactive-background-hover"
    >
      <span
        aria-hidden="true"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-input-background-default text-text-subtle"
      >
        {icone}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-text-strong">{titulo}</span>
        <span className="block truncate text-sm text-text-muted">{descricao}</span>
      </span>
      <ChevronRight size={20} aria-hidden="true" className="shrink-0 text-text-muted" />
    </button>
  );
}
