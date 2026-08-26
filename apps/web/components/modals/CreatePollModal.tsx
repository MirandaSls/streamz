"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import {
  MAX_POLL_OPTION,
  MAX_POLL_OPTIONS,
  MAX_POLL_QUESTION,
  MIN_POLL_OPTIONS,
  POLL_DURATIONS,
} from "@newdisc/shared";
import Dialog, { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import Tooltip from "@/components/ui/Tooltip";
import { criarEnquete } from "@/stores/polls";
import { useUI } from "@/stores/ui";

/** Criação de enquete: pergunta, de 2 a 10 opções, duração e múltipla escolha. */
export default function CreatePollModal({ channelId }: { channelId: string }) {
  const closeModal = useUI((s) => s.closeModal);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multi, setMulti] = useState(false);
  const [hours, setHours] = useState<number>(POLL_DURATIONS[3].hours);

  const preenchidas = options.map((o) => o.trim()).filter(Boolean);
  const podeCriar = question.trim().length > 0 && preenchidas.length >= MIN_POLL_OPTIONS;

  function setOption(index: number, value: string) {
    setOptions((prev) => prev.map((o, i) => (i === index ? value : o)));
  }

  function submit() {
    if (!podeCriar) return;
    criarEnquete({
      channelId,
      question: question.trim(),
      options: preenchidas,
      multi,
      // a última opção da lista é "sem prazo" quando o valor é 0
      durationHours: hours > 0 ? hours : undefined,
    });
    closeModal();
  }

  return (
    <Dialog
      title="Criar enquete"
      description="A enquete aparece como uma mensagem no canal e os votos aparecem ao vivo."
      onClose={closeModal}
      className="w-[460px]"
      footer={
        <>
          <PrimaryButton disabled={!podeCriar} onClick={submit}>
            Criar enquete
          </PrimaryButton>
          <SecondaryButton onClick={closeModal}>Cancelar</SecondaryButton>
        </>
      }
    >
      <label
        htmlFor="poll-question"
        className="mb-2 block text-xs font-bold uppercase tracking-[0.02em] text-txt-secondary"
      >
        Pergunta
      </label>
      <input
        id="poll-question"
        value={question}
        maxLength={MAX_POLL_QUESTION}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Ex.: Qual dia fica melhor?"
        className="h-10 w-full rounded-[3px] bg-rail px-2.5 text-txt-normal outline-none placeholder:text-txt-muted"
        autoFocus
      />

      <p className="mb-2 mt-5 text-xs font-bold uppercase tracking-[0.02em] text-txt-secondary">
        Opções
      </p>
      <div className="flex flex-col gap-2">
        {options.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={o}
              maxLength={MAX_POLL_OPTION}
              onChange={(e) => setOption(i, e.target.value)}
              aria-label={`Opção ${i + 1}`}
              placeholder={`Opção ${i + 1}`}
              className="h-10 min-w-0 flex-1 rounded-[3px] bg-rail px-2.5 text-txt-normal outline-none placeholder:text-txt-muted"
            />
            {options.length > MIN_POLL_OPTIONS && (
              <Tooltip label="Remover opção">
                <button
                  type="button"
                  onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                  aria-label={`Remover opção ${i + 1}`}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded text-txt-muted hover:text-red"
                >
                  <X size={18} />
                </button>
              </Tooltip>
            )}
          </div>
        ))}
      </div>
      {options.length < MAX_POLL_OPTIONS && (
        <button
          type="button"
          onClick={() => setOptions((prev) => [...prev, ""])}
          className="mt-2 flex items-center gap-1.5 text-sm font-medium text-txt-link hover:underline"
        >
          <Plus size={16} aria-hidden="true" />
          Adicionar opção
        </button>
      )}

      <label
        htmlFor="poll-duration"
        className="mb-2 mt-5 block text-xs font-bold uppercase tracking-[0.02em] text-txt-secondary"
      >
        Duração
      </label>
      <select
        id="poll-duration"
        value={hours}
        onChange={(e) => setHours(Number(e.target.value))}
        className="h-10 w-full rounded-[3px] bg-rail px-2 text-txt-normal outline-none"
      >
        {POLL_DURATIONS.map((d) => (
          <option key={d.hours} value={d.hours}>
            {d.label}
          </option>
        ))}
        <option value={0}>Sem prazo</option>
      </select>

      <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-txt-normal">
        <input
          type="checkbox"
          checked={multi}
          onChange={(e) => setMulti(e.target.checked)}
          className="accent-accent"
        />
        Permitir escolher mais de uma opção
      </label>
    </Dialog>
  );
}
