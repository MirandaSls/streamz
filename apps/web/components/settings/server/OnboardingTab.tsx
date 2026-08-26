"use client";

import { useEffect, useState } from "react";
import {
  MAX_GUILD_DESCRIPTION,
  MAX_WELCOME_CHANNELS,
  MAX_WELCOME_DESCRIPTION,
  type GuildOnboarding,
} from "@newdisc/shared";
import { api } from "@/lib/api";
import { useChannels } from "@/stores/channels";
import { useModeration } from "@/stores/moderation";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

const rotulo = "mb-2 block text-xs font-bold uppercase tracking-[0.02em] text-txt-secondary";
const campo = "h-10 w-full rounded-[3px] bg-rail px-2.5 text-txt-normal outline-none placeholder:text-txt-muted";

/**
 * Entrada no servidor: canal de sistema ("X entrou"), canal de regras com
 * aceite obrigatório, tela de boas-vindas e a chave de "Descobrir".
 *
 * Tudo aqui é opcional — um servidor sem nada configurado se comporta como
 * antes, e é por isso que cada campo aceita "Nenhum".
 */
export default function OnboardingTab({ guildId }: { guildId: string }) {
  const channels = useChannels((s) => s.channels);
  const loadMembership = useModeration((s) => s.loadMembership);
  const textos = channels.filter((c) => c.type === "TEXT");

  const [form, setForm] = useState<GuildOnboarding | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let ativo = true;
    void api
      .onboarding(guildId)
      .then((o) => ativo && setForm(o))
      .catch((e) => ativo && ui.toast(errorMessage(e, "Não foi possível carregar"), "error"));
    return () => {
      ativo = false;
    };
  }, [guildId]);

  function patch(p: Partial<GuildOnboarding>) {
    setForm((f) => (f ? { ...f, ...p } : f));
  }

  function toggleDestaque(channelId: string) {
    if (!form) return;
    const atuais = form.welcomeChannelIds;
    if (atuais.includes(channelId)) {
      patch({ welcomeChannelIds: atuais.filter((id) => id !== channelId) });
      return;
    }
    if (atuais.length >= MAX_WELCOME_CHANNELS) {
      ui.toast(`No máximo ${MAX_WELCOME_CHANNELS} canais em destaque.`, "error");
      return;
    }
    patch({ welcomeChannelIds: [...atuais, channelId] });
  }

  async function salvar() {
    if (!form || saving) return;
    setSaving(true);
    try {
      const salvo = await api.updateOnboarding(guildId, form);
      setForm(salvo);
      await loadMembership(guildId);
      ui.toast("Configuração salva.");
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível salvar"), "error");
    } finally {
      setSaving(false);
    }
  }

  if (!form) return <p className="text-sm text-txt-muted">Carregando…</p>;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pr-1">
      <label htmlFor="system-channel" className={rotulo}>
        Canal de mensagens do sistema
      </label>
      <select
        id="system-channel"
        value={form.systemChannelId ?? ""}
        onChange={(e) => patch({ systemChannelId: e.target.value || null })}
        className={`${campo} px-2`}
      >
        <option value="">Nenhum</option>
        {textos.map((c) => (
          <option key={c.id} value={c.id}>
            #{c.name}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-txt-muted">
        É onde entra o &quot;fulano entrou no servidor&quot; a cada pessoa nova.
      </p>

      <label htmlFor="rules-channel" className={`${rotulo} mt-5`}>
        Canal de regras
      </label>
      <select
        id="rules-channel"
        value={form.rulesChannelId ?? ""}
        onChange={(e) => patch({ rulesChannelId: e.target.value || null })}
        className={`${campo} px-2`}
      >
        <option value="">Nenhum</option>
        {textos.map((c) => (
          <option key={c.id} value={c.id}>
            #{c.name}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-txt-muted">
        Com um canal de regras, quem chega precisa aceitá-las antes de escrever. Quem administra o
        servidor não fica preso por elas.
      </p>

      <label htmlFor="welcome-description" className={`${rotulo} mt-5`}>
        Tela de boas-vindas
      </label>
      <textarea
        id="welcome-description"
        rows={3}
        value={form.welcomeDescription ?? ""}
        maxLength={MAX_WELCOME_DESCRIPTION}
        onChange={(e) => patch({ welcomeDescription: e.target.value })}
        placeholder="Conte em uma frase do que é este servidor."
        className="w-full resize-none rounded-[3px] bg-rail px-2.5 py-2 text-txt-normal outline-none placeholder:text-txt-muted"
      />

      <p className={`${rotulo} mt-4`}>Canais em destaque (até {MAX_WELCOME_CHANNELS})</p>
      <div className="flex flex-col gap-1">
        {textos.length === 0 && <p className="text-sm text-txt-muted">Nenhum canal de texto ainda.</p>}
        {textos.map((c) => (
          <label
            key={c.id}
            className="flex h-9 cursor-pointer items-center gap-2 rounded-[3px] px-2 text-sm text-txt-normal hover:bg-hov"
          >
            <input
              type="checkbox"
              checked={form.welcomeChannelIds.includes(c.id)}
              onChange={() => toggleDestaque(c.id)}
              className="accent-accent"
            />
            #{c.name}
          </label>
        ))}
      </div>

      <label htmlFor="guild-description" className={`${rotulo} mt-5`}>
        Descrição do servidor
      </label>
      <textarea
        id="guild-description"
        rows={2}
        value={form.description ?? ""}
        maxLength={MAX_GUILD_DESCRIPTION}
        onChange={(e) => patch({ description: e.target.value })}
        placeholder="Aparece no convite e em Descobrir."
        className="w-full resize-none rounded-[3px] bg-rail px-2.5 py-2 text-txt-normal outline-none placeholder:text-txt-muted"
      />

      <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-txt-normal">
        <input
          type="checkbox"
          checked={form.discoverable}
          onChange={(e) => patch({ discoverable: e.target.checked })}
          className="accent-accent"
        />
        Mostrar este servidor em &quot;Descobrir&quot;
      </label>
      <p className="mt-1 text-xs text-txt-muted">
        Qualquer pessoa poderá encontrar e entrar no servidor sem convite.
      </p>

      <button
        type="button"
        disabled={saving}
        onClick={() => void salvar()}
        className="mt-6 h-[38px] rounded-[3px] bg-accent px-4 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-50"
      >
        {saving ? "Salvando…" : "Salvar alterações"}
      </button>
    </div>
  );
}
