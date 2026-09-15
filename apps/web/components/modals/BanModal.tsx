"use client";

import { useState } from "react";
import {
  MAX_MODERATION_REASON,
  PURGE_WINDOWS,
  displayNameOf,
  type PublicUser,
} from "@streamz/shared";
import Dialog, { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import { Rotulo, SliderMarcas } from "@/components/ui/controls";
import { TextInput } from "@/components/ui/primitivos";
import { api } from "@/lib/api";
import { useGuilds } from "@/stores/guilds";
import { errorMessage } from "@/stores/socket-adapter";
import { ui, useUI } from "@/stores/ui";

/**
 * Banimento com motivo e limpeza opcional das mensagens recentes.
 *
 * A limpeza é a parte perigosa e por isso vem desligada por padrão ("Não apagar
 * mensagens"): apagar 7 dias de conversa por engano não tem desfazer.
 */
/**
 * Paradas do deslizador de limpeza.
 *
 * O Discord oferece três ("não apagar", "24 horas", "7 dias"); a "última hora"
 * do contrato fica de fora aqui porque num deslizador de quatro paradas ela vira
 * um passo quase idêntico ao vizinho — o campo continua aceitando o valor.
 */
const JANELAS = PURGE_WINDOWS.filter((w) => w.hours !== 1).map((w) => ({
  valor: w.hours,
  label: w.label,
}));

export default function BanModal({ guildId, user }: { guildId: string; user: PublicUser }) {
  const closeModal = useUI((s) => s.closeModal);
  const guild = useGuilds((s) => s.guilds.find((g) => g.id === guildId) ?? null);
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState(0);
  const [saving, setSaving] = useState(false);
  const nome = displayNameOf(user);

  async function submit() {
    if (saving) return;
    setSaving(true);
    try {
      await api.banWithReason(guildId, user.id, {
        reason: reason.trim() || undefined,
        deleteMessageHours: hours,
      });
      // a lista de membros também some pelo `member.left`, mas a resposta já
      // chegou: tirar aqui evita o membro piscar de volta em conexão lenta
      useGuilds.setState((s) => ({ members: s.members.filter((m) => m.user.id !== user.id) }));
      ui.toast(`${nome} foi banido.`);
      closeModal();
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível banir"), "error");
      setSaving(false);
    }
  }

  return (
    <Dialog
      title={`Banir '${nome}' de ${guild?.name ?? "este servidor"}`}
      description="Essa pessoa sai do servidor e não consegue voltar, nem com um novo convite."
      onClose={closeModal}
      footer={
        <>
          <PrimaryButton danger disabled={saving} onClick={() => void submit()}>
            {saving ? "Banindo…" : "Banir"}
          </PrimaryButton>
          <SecondaryButton autoFocus onClick={closeModal}>
            Cancelar
          </SecondaryButton>
        </>
      }
    >
      <Rotulo htmlFor="ban-reason">Motivo do banimento</Rotulo>
      <TextInput
        id="ban-reason"
        value={reason}
        maxLength={MAX_MODERATION_REASON}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Ex.: divulgação em massa"
        autoFocus
      />
      <p className="mt-1 text-xs text-text-muted">
        O motivo vai para o registro de auditoria, para a lista de banimentos e para o aviso que
        essa pessoa recebe na conversa direta.
      </p>

      <div className="mt-5">
        <SliderMarcas
          legenda="Apagar mensagens recentes"
          opcoes={JANELAS}
          indice={Math.max(
            0,
            JANELAS.findIndex((j) => j.valor === hours),
          )}
          onChange={(i) => setHours(JANELAS[i].valor)}
        />
      </div>
    </Dialog>
  );
}
