"use client";

import { useState } from "react";
import {
  MAX_MODERATION_REASON,
  TIMEOUT_PRESETS,
  displayNameOf,
  type PublicUser,
} from "@streamz/shared";
import Dialog, { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import { RadioCards, Select } from "@/components/ui/controls";
import { TextInput } from "@/components/ui/primitivos";
import { api } from "@/lib/api";
import { errorMessage } from "@/stores/socket-adapter";
import { ui, useUI } from "@/stores/ui";

/**
 * Motivos prontos do modo de espera.
 *
 * São os do Discord: quem modera raramente escreve um motivo, e sem sugestão o
 * registro de auditoria fica vazio. "Outro" devolve o campo livre.
 */
const MOTIVOS = [
  "Conteúdo impróprio",
  "Assédio ou perseguição",
  "Spam ou divulgação em massa",
  "Desrespeito às regras do servidor",
  "Outro",
] as const;

/**
 * Modo de espera: escolhe a duração num dos presets do Discord e diz o motivo.
 *
 * Quem está de castigo continua lendo tudo — só não escreve nem reage. O texto
 * do modal diz isso porque é a diferença entre castigo e expulsão.
 */
export default function TimeoutModal({ guildId, user }: { guildId: string; user: PublicUser }) {
  const closeModal = useUI((s) => s.closeModal);
  const [minutes, setMinutes] = useState(TIMEOUT_PRESETS[1].minutes);
  const [motivo, setMotivo] = useState<string>(MOTIVOS[0]);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const nome = displayNameOf(user);
  const outro = motivo === "Outro";

  async function submit() {
    if (saving) return;
    setSaving(true);
    const texto = (outro ? reason.trim() : motivo).slice(0, MAX_MODERATION_REASON);
    try {
      await api.timeoutMember(guildId, user.id, { minutes, reason: texto || undefined });
      ui.toast(`${nome} está em modo de espera.`);
      closeModal();
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível aplicar o modo de espera"), "error");
      setSaving(false);
    }
  }

  return (
    <Dialog
      title={`Colocar '${nome}' em modo de espera`}
      description="Durante o modo de espera essa pessoa continua vendo o servidor, mas não pode enviar mensagens nem reagir."
      onClose={closeModal}
      footer={
        <>
          <PrimaryButton danger disabled={saving} onClick={() => void submit()}>
            {saving ? "Aplicando…" : "Colocar em modo de espera"}
          </PrimaryButton>
          <SecondaryButton autoFocus onClick={closeModal}>
            Cancelar
          </SecondaryButton>
        </>
      }
    >
      {/*
       * Durações em cartões, não em lista: o Discord mostra as seis paradas
       * lado a lado, duas por linha (cartão 7g-modais-de-moderacao). O valor
       * viaja como string porque `RadioCards<T extends string>` é genérico em
       * texto — a conversão de volta a minutos fica só no `onChange`.
       */}
      <RadioCards
        legend="Duração"
        value={String(minutes)}
        options={TIMEOUT_PRESETS.map((p) => ({ value: String(p.minutes), label: p.label }))}
        onChange={(v) => setMinutes(Number(v))}
      />

      {/*
       * Sem `mt-5` aqui: o `fieldset` do `RadioCards` já fecha com `py-3` e
       * uma divisória (o mesmo respiro que `Section`/`Row` usam entre blocos
       * do formulário) — outro `mt-5` por cima duplicaria o vão.
       */}
      <Select
        semDivisoria
        label="Motivo"
        value={motivo}
        options={MOTIVOS.map((m) => ({ value: m, label: m }))}
        onChange={setMotivo}
      />

      {outro && (
        <TextInput
          value={reason}
          maxLength={MAX_MODERATION_REASON}
          onChange={(e) => setReason(e.target.value)}
          aria-label="Motivo do modo de espera"
          placeholder="Ex.: spam no canal geral"
          classeDaCaixa="mt-2"
        />
      )}

      <p className="mt-2 text-xs text-text-muted">
        O motivo fica registrado no registro de auditoria do servidor.
      </p>
    </Dialog>
  );
}
