"use client";

import { useState } from "react";
import { SmilePlus, X } from "@/components/ui/icones";
import {
  CUSTOM_STATUS_DURATIONS,
  MAX_CUSTOM_STATUS,
  type CustomStatusDuration,
} from "@streamz/shared";
import Dialog, { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import { Select } from "@/components/ui/controls";
import { BotaoDeIcone, Campo, TextInput } from "@/components/ui/primitivos";
import EmojiPicker from "@/components/ui/EmojiPicker";
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
      title="Definir um status personalizado"
      onClose={closeModal}
      footer={
        <>
          <PrimaryButton disabled={salvando} onClick={() => void salvar()}>
            {salvando ? "Salvando…" : "Salvar"}
          </PrimaryButton>
          <SecondaryButton onClick={closeModal}>Cancelar</SecondaryButton>
          {/* "Limpar" é destrutivo e fica isolado à esquerda: entre os outros
              dois ele viraria mais um botão de confirmação */}
          {tinha && (
            <button
              type="button"
              onClick={() => void salvar(true)}
              className="mr-auto h-[38px] rounded-[3px] px-2 text-sm font-medium text-status-danger transition hover:underline"
            >
              Limpar status
            </button>
          )}
        </>
      }
    >
      <Campo rotulo="Status personalizado" htmlFor="statusText">
        <div className="relative">
          <TextInput
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
            placeholder="O que está acontecendo?"
            prefixo={
              <BotaoDeIcone
                rotulo="Escolher emoji do status"
                icone={emoji ? <span className="text-lg leading-none">{emoji}</span> : <SmilePlus size={18} />}
                tamanho="md"
                className="celular:h-[44px] celular:w-[44px]"
                onClick={() => setEscolhendo((v) => !v)}
              />
            }
            sufixo={
              emoji ? (
                // 24px sobre a cápsula de 40 (44 empurraria o campo); o alvo de
                // toque cresce por um pseudo-elemento invisível
                <BotaoDeIcone
                  rotulo="Remover emoji"
                  icone={<X size={14} />}
                  tamanho="sm"
                  className="celular:before:absolute celular:before:-inset-[10px] celular:before:content-['']"
                  onClick={() => setEmoji(null)}
                />
              ) : undefined
            }
          />
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
      </Campo>
      <p className="mt-1 text-xs text-text-muted">
        {text.length}/{MAX_CUSTOM_STATUS}
      </p>

      <div className="mt-5">
        {/* do prazo mais longo para o mais curto, como no Discord ("Hoje"
            antes de "1 hora"); a ordem do contrato é a inversa */}
        <Select
          semDivisoria
          label="Limpar depois de"
          value={duration}
          options={[...CUSTOM_STATUS_DURATIONS]
            .reverse()
            .map((d) => ({ value: d.value, label: d.label }))}
          onChange={(v) => setDuration(v as CustomStatusDuration)}
        />
      </div>
    </Dialog>
  );
}
