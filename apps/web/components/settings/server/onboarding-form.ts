"use client";

import { useEffect, useState } from "react";
import type { GuildOnboarding } from "@streamz/shared";
import { useAlteracoesNaoSalvas } from "@/components/ui/alteracoes";
import { api } from "@/lib/api";
import { useModeration } from "@/stores/moderation";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

/**
 * O formulário de `GET/PATCH /guilds/:id/onboarding`, compartilhado pelas duas
 * páginas que mexem nele: "Engajamento" (canal do sistema, boas-vindas) e
 * "Acesso" (quem entra, canal de regras).
 *
 * Duas páginas, um recurso só. Se cada uma carregasse e gravasse o seu, salvar
 * numa delas apagaria o que a outra tivesse acabado de mudar — o `PATCH` manda
 * o objeto inteiro. Aqui cada página altera os campos que mostra e envia o
 * objeto completo que acabou de ler.
 */
export function useOnboarding(guildId: string) {
  const loadMembership = useModeration((s) => s.loadMembership);
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

  function patch(p: Partial<GuildOnboarding>) {
    setForm((f) => (f ? { ...f, ...p } : f));
  }

  return { form, patch };
}
