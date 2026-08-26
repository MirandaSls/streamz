"use client";

import { useState } from "react";
import { SmilePlus, X } from "lucide-react";
import {
  CUSTOM_STATUS_DURATIONS,
  MAX_CUSTOM_STATUS,
  type CustomStatusDuration,
} from "@newdisc/shared";
import Dialog, { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import EmojiPicker from "@/components/ui/EmojiPicker";
import Tooltip from "@/components/ui/Tooltip";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { errorMessage } from "@/stores/socket-adapter";
import { ui, useUI } from "@/stores/ui";

/**
 * "Definir status personalizado": emoji, texto e por quanto tempo vale.
 *
 * O prazo é escolhido aqui e calculado no servidor pela mesma função do
 * contrato (`customStatusExpiry`) — a tela e o banco concordam por construção.
 */
export default function CustomStatusModal() {
  const closeModal = useUI((s) => s.closeModal);
  const me = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);

  const [emoji, setEmoji] = useState<string | null>(me?.customStatusEmoji ?? null);
  const [text, setText] = useState(me?.customStatusText ?? "");
  const [duration, setDuration] = useState<CustomStatusDuration>("never");
  const [escolhendo, setEscolhendo] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const tinha = Boolean(me?.customStatusText || me?.customStatusEmoji);

  async function salvar(limpar = false) {
    if (salvando) return;
    setSalvando(true);
    try {
      setUser(
        await api.updateCustomStatus({
          text: limpar ? null : text.trim() || null,
          emoji: limpar ? null : emoji,
          duration: limpar ? "never" : duration,
        }),
      );
      closeModal();
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível salvar o status"), "error");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog
      title="Definir status personalizado"
      onClose={closeModal}
      className="w-[440px]"
      footer={
        <>
          <PrimaryButton disabled={salvando} onClick={() => void salvar()}>
            {salvando ? "Salvando…" : "Salvar"}
          </PrimaryButton>
          {tinha && (
            <button
              type="button"
              onClick={() => void salvar(true)}
              className="h-[38px] rounded-[3px] px-4 text-sm font-medium text-red transition hover:underline"
            >
              Limpar status
            </button>
          )}
          <SecondaryButton onClick={closeModal}>Cancelar</SecondaryButton>
        </>
      }
    >
      <label htmlFor="statusText" className="mb-2 block text-xs font-bold uppercase text-txt-secondary">
        O que está acontecendo?
      </label>
      <div className="relative flex items-center gap-2 rounded-[3px] bg-rail px-2">
        <Tooltip label="Escolher emoji">
          <button
            type="button"
            onClick={() => setEscolhendo((v) => !v)}
            aria-label="Escolher emoji do status"
            className="grid h-8 w-8 shrink-0 place-items-center rounded text-txt-secondary hover:text-txt-primary"
          >
            {emoji ? <span className="text-lg leading-none">{emoji}</span> : <SmilePlus size={18} />}
          </button>
        </Tooltip>
        <input
          id="statusText"
          value={text}
          maxLength={MAX_CUSTOM_STATUS}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void salvar();
            }
          }}
          placeholder="Suporte a texto"
          className="h-10 min-w-0 flex-1 bg-transparent text-txt-normal outline-none placeholder:text-txt-muted"
        />
        {emoji && (
          <button
            type="button"
            onClick={() => setEmoji(null)}
            aria-label="Remover emoji"
            className="grid h-6 w-6 shrink-0 place-items-center rounded text-txt-muted hover:text-txt-primary"
          >
            <X size={14} />
          </button>
        )}
        {escolhendo && (
          <EmojiPicker
            className="absolute left-0 top-11 z-10"
            onClose={() => setEscolhendo(false)}
            onPick={(e) => {
              setEmoji(e);
              setEscolhendo(false);
            }}
          />
        )}
      </div>
      <p className="mt-1 text-xs text-txt-muted">
        {text.length}/{MAX_CUSTOM_STATUS}
      </p>

      <fieldset className="mt-5">
        <legend className="mb-2 text-xs font-bold uppercase text-txt-secondary">Limpar depois de</legend>
        <div className="flex flex-col gap-0.5">
          {CUSTOM_STATUS_DURATIONS.map((d) => (
            <label
              key={d.value}
              className={`flex cursor-pointer items-center gap-3 rounded-[3px] px-2 py-1.5 text-sm transition hover:bg-hov ${
                duration === d.value ? "text-txt-primary" : "text-txt-normal"
              }`}
            >
              <input
                type="radio"
                name="duration"
                checked={duration === d.value}
                onChange={() => setDuration(d.value)}
                className="accent-accent"
              />
              {d.label}
            </label>
          ))}
        </div>
      </fieldset>
    </Dialog>
  );
}
