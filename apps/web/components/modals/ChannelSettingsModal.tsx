"use client";

import { useState } from "react";
import { Hash, Lock, Megaphone, Shield, Sliders, Trash2, Volume2 } from "lucide-react";
import {
  MAX_CHANNEL_TOPIC,
  SLOWMODE_PRESETS,
  slowmodeLabel,
  type Channel,
} from "@newdisc/shared";
import Dialog, { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import { ChannelAccessList } from "@/components/modals/ChannelAccessModal";
import { useChannels, type UpdateChannelInput } from "@/stores/channels";
import { useUI } from "@/stores/ui";

type Aba = "geral" | "permissoes" | "apagar";

/** Ícone do canal na barra de abas, para o modal não parecer genérico. */
function iconeDoCanal(channel: Channel) {
  if (channel.type === "VOICE") return <Volume2 size={20} aria-hidden="true" />;
  if (channel.type === "ANNOUNCEMENT") return <Megaphone size={20} aria-hidden="true" />;
  if (channel.private) return <Lock size={20} aria-hidden="true" />;
  return <Hash size={20} aria-hidden="true" />;
}

function BotaoAba({
  ativa,
  onClick,
  icon,
  children,
  danger = false,
}: {
  ativa: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativa}
      className={`flex h-8 w-full items-center gap-2 rounded-[4px] px-2 text-left text-sm font-medium transition ${
        ativa
          ? "bg-sel text-txt-primary"
          : danger
            ? "text-red hover:bg-hov"
            : "text-txt-faint hover:bg-hov hover:text-txt-normal"
      }`}
    >
      {icon}
      <span className="truncate">{children}</span>
    </button>
  );
}

/**
 * Configurações do canal, com abas à esquerda como no Discord: Visão geral
 * (nome, tópico, modo lento, NSFW e somente-leitura), Permissões (privacidade e
 * allowlist) e Apagar canal.
 *
 * O formulário é local até "Salvar": trocar de aba não perde o que foi digitado
 * e nada vai para a API antes da confirmação.
 */
export default function ChannelSettingsModal({
  channelId,
  tab = "geral",
}: {
  channelId: string;
  tab?: "geral" | "permissoes";
}) {
  const closeModal = useUI((s) => s.closeModal);
  const channel = useChannels((s) => s.channels.find((c) => c.id === channelId));
  const update = useChannels((s) => s.update);
  const remove = useChannels((s) => s.remove);

  const [aba, setAba] = useState<Aba>(tab);
  const [name, setName] = useState(channel?.name ?? "");
  const [topic, setTopic] = useState(channel?.topic ?? "");
  const [slowmode, setSlowmode] = useState(channel?.slowmodeSeconds ?? 0);
  const [nsfw, setNsfw] = useState(channel?.nsfw ?? false);
  const [readOnly, setReadOnly] = useState(channel?.readOnly ?? false);
  const [isPrivate, setPrivate] = useState(channel?.private ?? false);
  const [saving, setSaving] = useState(false);

  if (!channel) return null;
  const voz = channel.type === "VOICE";
  const anuncio = channel.type === "ANNOUNCEMENT";

  const patch: UpdateChannelInput = {};
  if (name.trim() && name.trim() !== channel.name) patch.name = name.trim();
  if ((topic.trim() || null) !== channel.topic) patch.topic = topic.trim() || null;
  if (slowmode !== channel.slowmodeSeconds) patch.slowmodeSeconds = slowmode;
  if (nsfw !== channel.nsfw) patch.nsfw = nsfw;
  if (readOnly !== channel.readOnly) patch.readOnly = readOnly;
  if (isPrivate !== channel.private) patch.isPrivate = isPrivate;
  const dirty = Object.keys(patch).length > 0;

  async function salvar() {
    if (!dirty || saving) return;
    setSaving(true);
    const ok = await update(channelId, patch);
    setSaving(false);
    if (ok) closeModal();
  }

  return (
    <Dialog
      title={`Configurações de #${channel.name ?? "canal"}`}
      onClose={closeModal}
      className="w-[560px]"
      footer={
        aba === "apagar" ? (
          <SecondaryButton full onClick={closeModal}>
            Fechar
          </SecondaryButton>
        ) : (
          <>
            <PrimaryButton disabled={!dirty || saving} onClick={salvar}>
              {saving ? "Salvando…" : "Salvar"}
            </PrimaryButton>
            <SecondaryButton onClick={closeModal}>Cancelar</SecondaryButton>
          </>
        )
      }
    >
      <div className="flex gap-4">
        <nav aria-label="Seções" className="w-40 shrink-0 space-y-0.5">
          <BotaoAba ativa={aba === "geral"} onClick={() => setAba("geral")} icon={iconeDoCanal(channel)}>
            Visão geral
          </BotaoAba>
          <BotaoAba
            ativa={aba === "permissoes"}
            onClick={() => setAba("permissoes")}
            icon={<Shield size={20} aria-hidden="true" />}
          >
            Permissões
          </BotaoAba>
          <BotaoAba
            ativa={aba === "apagar"}
            onClick={() => setAba("apagar")}
            icon={<Trash2 size={20} aria-hidden="true" />}
            danger
          >
            Apagar canal
          </BotaoAba>
        </nav>

        <div className="min-w-0 flex-1">
          {aba === "geral" && (
            <div className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-[0.02em] text-txt-muted">
                  Nome do canal
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={64}
                  className="w-full rounded bg-rail px-3 py-2 text-sm text-txt-normal outline-none"
                />
              </label>

              {!voz && (
                <label className="block">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-[0.02em] text-txt-muted">
                    Tópico do canal
                  </span>
                  <textarea
                    value={topic}
                    onChange={(e) => setTopic(e.target.value.slice(0, MAX_CHANNEL_TOPIC))}
                    rows={3}
                    placeholder="Sobre o que é este canal?"
                    className="w-full resize-none rounded bg-rail px-3 py-2 text-sm text-txt-normal outline-none placeholder:text-txt-muted"
                  />
                  <span className="mt-1 block text-right text-xs text-txt-muted">
                    {MAX_CHANNEL_TOPIC - topic.length}
                  </span>
                </label>
              )}

              {!voz && (
                <label className="block">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-[0.02em] text-txt-muted">
                    Modo lento — {slowmodeLabel(slowmode)}
                  </span>
                  <select
                    value={slowmode}
                    onChange={(e) => setSlowmode(Number(e.target.value))}
                    className="w-full rounded bg-rail px-3 py-2 text-sm text-txt-normal outline-none"
                  >
                    {SLOWMODE_PRESETS.map((s) => (
                      <option key={s} value={s}>
                        {slowmodeLabel(s)}
                      </option>
                    ))}
                  </select>
                  <span className="mt-2 block text-xs text-txt-muted">
                    Membros só podem enviar uma mensagem a cada intervalo. Moderadores
                    não são afetados.
                  </span>
                </label>
              )}

              {!voz && (
                <label className="flex cursor-pointer items-start gap-2 text-sm text-txt-normal">
                  <input
                    type="checkbox"
                    checked={nsfw}
                    onChange={(e) => setNsfw(e.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    Canal com conteúdo sensível
                    <span className="mt-0.5 block text-xs text-txt-muted">
                      Quem abrir o canal vê um aviso e precisa confirmar a entrada.
                    </span>
                  </span>
                </label>
              )}

              {!voz && !anuncio && (
                <label className="flex cursor-pointer items-start gap-2 text-sm text-txt-normal">
                  <input
                    type="checkbox"
                    checked={readOnly}
                    onChange={(e) => setReadOnly(e.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    Somente leitura
                    <span className="mt-0.5 block text-xs text-txt-muted">
                      Só moderadores enviam mensagens.
                    </span>
                  </span>
                </label>
              )}

              {anuncio && (
                <p className="rounded bg-rail/50 px-3 py-2 text-xs text-txt-muted">
                  Canal de anúncios: só a moderação publica. Seguir o canal em outro
                  servidor ainda não está disponível.
                </p>
              )}
            </div>
          )}

          {aba === "permissoes" && (
            <div className="space-y-4">
              <label className="flex cursor-pointer items-start gap-2 text-sm text-txt-normal">
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => setPrivate(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  Canal privado
                  <span className="mt-0.5 block text-xs text-txt-muted">
                    Só moderadores e os membros marcados abaixo enxergam o canal.
                  </span>
                </span>
              </label>

              <div>
                <span className="mb-2 block text-xs font-bold uppercase tracking-[0.02em] text-txt-muted">
                  Membros com acesso
                </span>
                <ChannelAccessList channelId={channelId} />
                <p className="mt-2 text-xs text-txt-muted">
                  A marcação vale na hora — não depende do botão Salvar.
                </p>
              </div>
            </div>
          )}

          {aba === "apagar" && (
            <div className="space-y-4">
              <p className="text-sm text-txt-normal">
                Apagar <span className="font-semibold">#{channel.name ?? "canal"}</span> remove
                todas as mensagens dele. Não dá para desfazer.
              </p>
              <PrimaryButton
                danger
                onClick={async () => {
                  await remove(channel);
                  closeModal();
                }}
              >
                <span className="flex items-center gap-2">
                  <Trash2 size={18} aria-hidden="true" />
                  Apagar canal
                </span>
              </PrimaryButton>
            </div>
          )}
        </div>
      </div>

      {aba === "geral" && !voz && (
        <p className="mt-4 flex items-center gap-2 text-xs text-txt-muted">
          <Sliders size={14} aria-hidden="true" />
          Permissões por cargo entram nesta aba quando os cargos existirem.
        </p>
      )}
    </Dialog>
  );
}
