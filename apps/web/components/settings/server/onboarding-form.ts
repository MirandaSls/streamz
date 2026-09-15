"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
 *
 * **Estados de carga (cartão 6n-engajamento).** Antes, uma falha na busca
 * inicial só disparava um toast e deixava `form` em `null` para sempre — a
 * página ficava presa em "Carregando…" sem forma de sair, o mesmo defeito que
 * o cartão de `SessoesTab.tsx` já fechou lá. Agora `carregando`/
 * `falhouCarregar` distinguem os dois estados e `recarregar` é o mesmo
 * "Tentar de novo" do padrão do repositório (`SegurancaTab.tsx`,
 * `SessoesTab.tsx`): quem chama decide o desenho, o hook só garante que dá
 * para tentar de novo sem duplicar a lógica de busca.
 */
export function useOnboarding(guildId: string) {
  const loadMembership = useModeration((s) => s.loadMembership);
  const [form, setForm] = useState<GuildOnboarding | null>(null);
  const [salvo, setSalvo] = useState<GuildOnboarding | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [falhouCarregar, setFalhouCarregar] = useState(false);
  /** evita `setState` depois que a página trocou de servidor ou desmontou. */
  const vivo = useRef(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setFalhouCarregar(false);
    try {
      const o = await api.onboarding(guildId);
      if (!vivo.current) return;
      setForm(o);
      setSalvo(o);
    } catch (e) {
      if (!vivo.current) return;
      setFalhouCarregar(true);
      ui.toast(errorMessage(e, "Não foi possível carregar"), "error");
    } finally {
      if (vivo.current) setCarregando(false);
    }
  }, [guildId]);

  useEffect(() => {
    vivo.current = true;
    void carregar();
    return () => {
      vivo.current = false;
    };
  }, [carregar]);

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

  return { form, patch, carregando, falhouCarregar, recarregar: carregar };
}
