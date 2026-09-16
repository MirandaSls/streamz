"use client";

import { useEffect, useState } from "react";
import Dialog, { SecondaryButton } from "@/components/modals/Dialog";
import { LinhaDeControle, Switch } from "@/components/ui/primitivos";
import { useGuilds } from "@/stores/guilds";
import { useModeration } from "@/stores/moderation";
import { errorMessage } from "@/stores/socket-adapter";
import { ui, useUI } from "@/stores/ui";

/**
 * "Config. de privacidade" do menu do ícone do servidor (ESPEC p5, item 7;
 * `docs/CONTRATO-MENUS.md` §6): hoje só o interruptor "Mensagens diretas" —
 * o Discord tem mais opções aqui (varredura de conteúdo, DM em servidores
 * novos por padrão) que este produto não implementa.
 *
 * Este menu abre para **qualquer** servidor da barra, não só o aberto no
 * momento (é o mesmo botão direito que abre "Sair do servidor" e "Config. do
 * servidor" para qualquer item dela) — por isso o valor não vem direto de
 * `useModeration.membership` (que só guarda o servidor ativo): quando bate
 * com o servidor aberto, usa o que já está em memória; senão, busca com
 * `membershipDe`. Mesma estrutura em `PerfilPorServidorModal.tsx`.
 *
 * O interruptor salva sozinho ao alternar — sem botão "Salvar" — como no
 * Discord: otimista (a UI já vira) com reversão e toast se a API recusar.
 * "Concluído" só fecha; não há nada pendente para descartar.
 */
export default function PrivacidadeDoServidorModal({ guildId }: { guildId: string }) {
  const closeModal = useUI((s) => s.closeModal);
  const guild = useGuilds((s) => s.guilds.find((g) => g.id === guildId));
  const membershipAtivo = useModeration((s) => s.membership);
  const membershipDe = useModeration((s) => s.membershipDe);
  const editarAssociacao = useModeration((s) => s.editarAssociacao);

  const jaTenho = membershipAtivo?.guildId === guildId ? membershipAtivo : null;
  const [permitir, setPermitir] = useState<boolean | null>(
    jaTenho ? (jaTenho.permitirDmsDoServidor ?? true) : null,
  );
  const [erroAoCarregar, setErroAoCarregar] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (jaTenho) return;
    let cancelado = false;
    membershipDe(guildId)
      .then((m) => {
        if (!cancelado) setPermitir(m.permitirDmsDoServidor ?? true);
      })
      .catch(() => {
        if (!cancelado) setErroAoCarregar(true);
      });
    return () => {
      cancelado = true;
    };
    // só na entrada: `jaTenho` só serve para o valor inicial
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId]);

  async function onMudar(novo: boolean) {
    if (permitir === null || salvando) return;
    const anterior = permitir;
    setPermitir(novo);
    setSalvando(true);
    try {
      await editarAssociacao(guildId, { permitirDmsDoServidor: novo });
    } catch (e) {
      setPermitir(anterior);
      ui.toast(errorMessage(e, "Não foi possível salvar a configuração de privacidade"), "error");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog
      title="Configurações de privacidade"
      description={guild?.name}
      onClose={closeModal}
      footer={
        <SecondaryButton full onClick={closeModal}>
          Concluído
        </SecondaryButton>
      }
    >
      {permitir === null ? (
        erroAoCarregar ? (
          <p className="py-3 text-sm text-text-muted">
            Não foi possível carregar as configurações de privacidade.
          </p>
        ) : (
          <p className="py-3 text-sm text-text-muted">Carregando…</p>
        )
      ) : (
        <LinhaDeControle
          semDivisoria
          htmlFor="permitir-dms-do-servidor"
          rotulo="Mensagens diretas"
          descricao={
            <>
              Permitir mensagens diretas de membros do servidor.
              <br />
              Esta configuração é aplicada quando você entra em um servidor. Ela
              não se aplica a conversas que já existem.
            </>
          }
          controle={
            <Switch
              id="permitir-dms-do-servidor"
              rotulo="Permitir mensagens diretas de membros do servidor"
              marcado={permitir}
              desabilitado={salvando}
              aoMudar={onMudar}
            />
          }
        />
      )}
    </Dialog>
  );
}
