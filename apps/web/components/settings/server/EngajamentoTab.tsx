"use client";

import { MAX_WELCOME_CHANNELS, MAX_WELCOME_DESCRIPTION } from "@streamz/shared";
import { Select } from "@/components/ui/controls";
import { Campo, Checkbox, TextArea } from "@/components/ui/primitivos";
import { ESTILO_ROTULO } from "@/components/settings/campos";
import { TituloDaPagina } from "@/components/settings/server/pagina";
import { useOnboarding } from "@/components/settings/server/onboarding-form";
import { useChannels } from "@/stores/channels";
import { ui } from "@/stores/ui";

/**
 * "Engajamento": o que o servidor faz por conta própria quando alguém chega —
 * a mensagem do sistema e a tela de boas-vindas.
 *
 * É a página `Engajamento` dos prints `docs/Reference/Captura de tela
 * 2026-09-04 100608/100615.png` reduzida ao que existe aqui. O print tem, e nós
 * **não** criamos: os interruptores de mensagem do sistema por tipo (impulso,
 * dica de resposta), o feed do servidor, a notificação padrão do servidor (a
 * nossa preferência de notificação é por usuário, em `NotificationSetting`), o
 * canal de ausentes com limite e o widget. Nenhum tem contrato na API, e um
 * controle que não grava nada é pior que a ausência dele.
 *
 * O canal de mensagens do sistema vinha da antiga "Visão geral" e a tela de
 * boas-vindas da antiga "Entrada e regras": são o mesmo recurso
 * (`GET/PATCH /guilds/:id/onboarding`) e agora a mesma página, que é onde o
 * Discord os põe.
 */
export default function EngajamentoTab({ guildId }: { guildId: string }) {
  const channels = useChannels((s) => s.channels);
  const textos = channels.filter((c) => c.type === "TEXT");
  const { form, patch } = useOnboarding(guildId);

  if (!form) {
    return (
      <>
        <TituloDaPagina titulo="Engajamento" />
        <p className="text-sm text-text-muted">Carregando…</p>
      </>
    );
  }

  function alternarDestaque(channelId: string) {
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

  return (
    <>
      <TituloDaPagina
        titulo="Engajamento"
        subtitulo="O que o servidor mostra e diz sozinho para quem acabou de chegar."
      />

      <h2 className="text-base font-semibold text-text-strong">Mensagens do sistema</h2>
      <div className="mt-2">
        <Select
          semDivisoria
          label="Canal de mensagens do sistema"
          value={form.systemChannelId ?? ""}
          options={textos.map((c) => ({ value: c.id, label: `#${c.name}` }))}
          onChange={(id) => patch({ systemChannelId: id || null })}
          emptyLabel="Nenhum"
          hint="É onde entra o “fulano entrou no servidor” a cada pessoa nova."
        />
      </div>

      <div aria-hidden="true" className="mt-10 h-px bg-border-subtle" />

      <h2 className="mt-10 text-base font-semibold text-text-strong">Tela de boas-vindas</h2>
      <Campo rotulo="Mensagem de abertura" htmlFor="welcome-description" className="mt-4">
        <TextArea
          id="welcome-description"
          rows={3}
          value={form.welcomeDescription ?? ""}
          maxLength={MAX_WELCOME_DESCRIPTION}
          onChange={(e) => patch({ welcomeDescription: e.target.value })}
          placeholder="Conte em uma frase do que é este servidor."
        />
      </Campo>

      <p className={`${ESTILO_ROTULO} mt-6`}>Canais em destaque (até {MAX_WELCOME_CHANNELS})</p>
      <div className="flex flex-col gap-1">
        {textos.length === 0 && (
          <p className="text-sm text-text-muted">Nenhum canal de texto ainda.</p>
        )}
        {textos.map((c) => (
          <Checkbox
            key={c.id}
            marcado={form.welcomeChannelIds.includes(c.id)}
            aoMudar={() => alternarDestaque(c.id)}
            rotulo={`#${c.name}`}
            className="rounded-lg px-2 py-1.5 hover:bg-interactive-background-hover"
          />
        ))}
      </div>
    </>
  );
}
