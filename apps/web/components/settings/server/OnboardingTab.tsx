"use client";

import { useEffect, useState } from "react";
import {
  MAX_WELCOME_CHANNELS,
  MAX_WELCOME_DESCRIPTION,
  type GuildOnboarding,
} from "@streamz/shared";
import { useAlteracoesNaoSalvas } from "@/components/ui/alteracoes";
import { Section, Select, Toggle } from "@/components/ui/controls";
import { ESTILO_AREA, ESTILO_ROTULO } from "@/components/settings/campos";
import { api } from "@/lib/api";
import { useChannels } from "@/stores/channels";
import { useModeration } from "@/stores/moderation";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

/**
 * Entrada no servidor: canal de regras com aceite obrigatório, tela de
 * boas-vindas e a chave de "Descobrir".
 *
 * Usa os mesmos `Section`/`Select`/`Toggle` das demais abas em vez de classes
 * soltas: rótulo e campo declarados como string local aqui eram a origem do
 * drift — bastava alguém ajustar o campo em `campos.tsx` para esta aba ficar
 * com dois pixels de diferença das outras.
 *
 * O canal de mensagens do sistema e a descrição moram em "Visão geral", que é
 * onde o Discord os mostra; aqui eles só viajam no mesmo `PATCH`.
 *
 * Tudo aqui é opcional — um servidor sem nada configurado se comporta como
 * antes, e é por isso que cada campo aceita "Nenhum".
 */
export default function OnboardingTab({ guildId }: { guildId: string }) {
  const channels = useChannels((s) => s.channels);
  const loadMembership = useModeration((s) => s.loadMembership);
  const textos = channels.filter((c) => c.type === "TEXT");

  const [form, setForm] = useState<GuildOnboarding | null>(null);
  const [salvo, setSalvo] = useState<GuildOnboarding | null>(null);

  useEffect(() => {
    let ativo = true;
    void api
      .onboarding(guildId)
      .then((o) => {
        if (!ativo) return;
        setForm(o);
        setSalvo(o);
      })
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

  const dirty = !!form && !!salvo && JSON.stringify(form) !== JSON.stringify(salvo);

  useAlteracoesNaoSalvas({
    dirty,
    salvar: async () => {
      if (!form) return;
      try {
        const gravado = await api.updateOnboarding(guildId, form);
        setForm(gravado);
        setSalvo(gravado);
        await loadMembership(guildId);
        ui.toast("Configuração salva.");
      } catch (e) {
        ui.toast(errorMessage(e, "Não foi possível salvar"), "error");
      }
    },
    redefinir: () => setForm(salvo),
  });

  if (!form) return <p className="text-sm text-txt-muted">Carregando…</p>;

  return (
    <>
      <Section title="Regras">
        <Select
          semDivisoria
          label="Canal de regras"
          value={form.rulesChannelId ?? ""}
          options={textos.map((c) => ({ value: c.id, label: `#${c.name}` }))}
          onChange={(id) => patch({ rulesChannelId: id || null })}
          emptyLabel="Nenhum"
          hint="Com um canal de regras, quem chega precisa aceitá-las antes de escrever. Quem administra o servidor não fica preso por elas."
        />
      </Section>

      <Section title="Tela de boas-vindas">
        <label htmlFor="welcome-description" className={ESTILO_ROTULO}>
          Mensagem de abertura
        </label>
        <textarea
          id="welcome-description"
          rows={3}
          value={form.welcomeDescription ?? ""}
          maxLength={MAX_WELCOME_DESCRIPTION}
          onChange={(e) => patch({ welcomeDescription: e.target.value })}
          placeholder="Conte em uma frase do que é este servidor."
          className={ESTILO_AREA}
        />

        {/* O toggle "mostrar em Descobrir" saiu junto com a tela de descoberta:
            este é um produto de uso interno, onde se entra por convite. O campo
            `discoverable` continua no contrato e mantém o valor que já tinha. */}
        <p className={`${ESTILO_ROTULO} mt-4`}>
          Canais em destaque (até {MAX_WELCOME_CHANNELS})
        </p>
        <div className="flex flex-col gap-1">
          {textos.length === 0 && (
            <p className="text-sm text-txt-muted">Nenhum canal de texto ainda.</p>
          )}
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
      </Section>
    </>
  );
}
