"use client";

import { useEffect } from "react";
import { Check } from "@/components/ui/icones";
import { displayNameOf } from "@streamz/shared";
import Dialog, { SecondaryButton } from "@/components/modals/Dialog";
import Avatar from "@/components/ui/Avatar";
import { useChannels } from "@/stores/channels";
import { useGuilds } from "@/stores/guilds";
import { useUI } from "@/stores/ui";

/**
 * Allowlist de um canal privado. Moderadores entram sempre; membros, na marca.
 *
 * A lista é um componente à parte porque ela aparece em dois lugares: neste
 * modal (atalho do menu de contexto) e como a aba "Permissões" das
 * configurações do canal — mesma allowlist, mesma store, um código só.
 *
 * A linha e o indicador de marcado são os de `CreateGroupDMModal.tsx`
 * ("Selecionar amigos", o único multi-seletor de pessoas com referência
 * medida no app — ver o cabeçalho de lá): avatar `md`, nome de exibição em
 * negrito com o username embaixo em `text-xs`, quadrado de 20px raio 4
 * (`.checkboxOption__714a9`, o mesmo do `Checkbox` de `primitivos`, redesenhado
 * aqui à mão pelo mesmo motivo de lá — "o checkbox nativo não segue o tema").
 * O círculo com borda de 2px que estava aqui não tinha essa origem: nenhum
 * outro seletor de pessoas do app usa círculo, e o comentário que o justificava
 * ("mesmo círculo do 'selecionar amigos'") não batia com o `CreateGroupDMModal`
 * real, que é quadrado — era engano, não uma segunda convenção.
 */
export function ChannelAccessList({ channelId }: { channelId: string }) {
  const guildId = useGuilds((s) => s.activeGuildId);
  const members = useGuilds((s) => s.members);
  const access = useChannels((s) => s.access);
  const loadAccess = useChannels((s) => s.loadAccess);
  const toggleAccess = useChannels((s) => s.toggleAccess);
  const clearAccess = useChannels((s) => s.clearAccess);

  useEffect(() => {
    if (!guildId) return;
    void loadAccess(guildId, channelId);
    return () => clearAccess();
  }, [guildId, channelId, loadAccess, clearAccess]);

  const plainMembers = members.filter((m) => m.role === "MEMBER");
  const ready = access.channelId === channelId && !access.loading;

  return (
    <div className="max-h-64 overflow-y-auto rounded-lg bg-background-base-lowest p-1">
      {!ready ? (
        <p className="px-3 py-3 text-sm text-text-muted">Carregando…</p>
      ) : plainMembers.length === 0 ? (
        <p className="px-3 py-3 text-sm text-text-muted">
          Nenhum membro comum neste servidor.
        </p>
      ) : (
        plainMembers.map((m) => {
          const marcado = access.allowed.includes(m.user.id);
          return (
            <button
              key={m.user.id}
              type="button"
              role="checkbox"
              aria-checked={marcado}
              onClick={() => guildId && toggleAccess(guildId, channelId, m.user.id)}
              className="flex h-12 w-full items-center gap-3 rounded-lg px-2 text-left transition hover:bg-interactive-background-hover"
            >
              <Avatar user={m.user} size="md" surface="border-background-base-lower" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-semibold leading-5 text-text-strong">
                  {displayNameOf(m.user)}
                </span>
                <span className="block truncate text-xs leading-4 text-text-muted">{m.user.username}</span>
              </span>
              {/* o quadrado de 20px do Discord; o checkbox nativo não segue o tema */}
              <span
                aria-hidden="true"
                className={`grid h-5 w-5 shrink-0 place-items-center rounded-[4px] border transition ${
                  marcado ? "border-brand-500 bg-brand-500 text-control-primary-text-default" : "border-channels-default"
                }`}
              >
                {marcado && <Check size={14} />}
              </span>
            </button>
          );
        })
      )}
    </div>
  );
}

export default function ChannelAccessModal({ channelId }: { channelId: string }) {
  const closeModal = useUI((s) => s.closeModal);
  const channel = useChannels((s) => s.channels.find((c) => c.id === channelId));

  return (
    <Dialog
      title={`Acesso a #${channel?.name ?? "canal"}`}
      description="Moderadores sempre têm acesso. Marque os membros liberados."
      onClose={closeModal}
      className="w-[380px]"
      footer={<SecondaryButton full onClick={closeModal}>Fechar</SecondaryButton>}
    >
      <ChannelAccessList channelId={channelId} />
    </Dialog>
  );
}
