"use client";

import { useState } from "react";
import { Plus, SmilePlus, X } from "@/components/ui/icones";
import {
  MAX_POLL_OPTION,
  MAX_POLL_OPTIONS,
  MAX_POLL_QUESTION,
  MIN_POLL_OPTIONS,
  POLL_DURATIONS,
} from "@streamz/shared";
import Dialog, { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import { Rotulo, Select, ToggleLinha } from "@/components/ui/controls";
import EmojiPicker from "@/components/ui/EmojiPicker";
import Tooltip from "@/components/ui/Tooltip";
import { criarEnquete } from "@/stores/polls";
import { useUI } from "@/stores/ui";

/** "Sem prazo" é o valor 0; o contrato só lista as durações com prazo. */
const SEM_PRAZO = 0;

/** Criação de enquete: pergunta, de 2 a 10 opções, duração e múltipla escolha. */
export default function CreatePollModal({ channelId }: { channelId: string }) {
  const closeModal = useUI((s) => s.closeModal);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  /** emoji de cada resposta, na mesma posição da opção. */
  const [emojis, setEmojis] = useState<(string | null)[]>([null, null]);
  const [multi, setMulti] = useState(false);
  const [hours, setHours] = useState<number>(POLL_DURATIONS[3].hours);
  /** qual seletor de emoji está aberto: -1 é o da pergunta, null é nenhum. */
  const [escolhendo, setEscolhendo] = useState<number | null>(null);

  const preenchidas = options.map((o) => o.trim()).filter(Boolean);
  const podeCriar = question.trim().length > 0 && preenchidas.length >= MIN_POLL_OPTIONS;

  function setOption(index: number, value: string) {
    setOptions((prev) => prev.map((o, i) => (i === index ? value : o)));
  }

  function submit() {
    if (!podeCriar) return;
    // o emoji entra colado no texto da resposta: o contrato da enquete guarda só
    // a string da opção (ver relatório — falta um campo `emoji` em `PollOption`)
    const finais = options
      .map((o, i) => {
        const texto = o.trim();
        if (!texto) return "";
        const emoji = emojis[i];
        return emoji ? `${emoji} ${texto}`.slice(0, MAX_POLL_OPTION) : texto;
      })
      .filter(Boolean);
    criarEnquete({
      channelId,
      question: question.trim(),
      options: finais,
      multi,
      durationHours: hours > 0 ? hours : undefined,
    });
    closeModal();
  }

  function escolherEmoji(indice: number, emoji: string) {
    if (indice < 0) {
      setQuestion((q) => `${emoji} ${q}`.slice(0, MAX_POLL_QUESTION));
    } else {
      setEmojis((prev) => prev.map((e, i) => (i === indice ? emoji : e)));
    }
    setEscolhendo(null);
  }

  return (
    <Dialog
      title="Criar uma enquete"
      description="A enquete aparece como uma mensagem no canal e os votos aparecem ao vivo."
      onClose={closeModal}
      className="w-[460px]"
      footer={
        <>
          <PrimaryButton disabled={!podeCriar} onClick={submit}>
            Criar
          </PrimaryButton>
          <SecondaryButton onClick={closeModal}>Cancelar</SecondaryButton>
        </>
      }
    >
      <Rotulo htmlFor="poll-question">Pergunta</Rotulo>
      <div className="relative flex h-10 items-center gap-1 rounded-[3px] bg-void px-1.5">
        <input
          id="poll-question"
          value={question}
          maxLength={MAX_POLL_QUESTION}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ex.: Qual dia fica melhor?"
          className="min-w-0 flex-1 bg-transparent px-1 text-txt-normal outline-none placeholder:text-txt-muted"
          autoFocus
        />
        <BotaoEmoji
          aberto={escolhendo === -1}
          onToggle={() => setEscolhendo((v) => (v === -1 ? null : -1))}
          label="Adicionar emoji à pergunta"
        />
        {escolhendo === -1 && (
          <EmojiPicker
            className="absolute right-0 top-11 z-10"
            onClose={() => setEscolhendo(null)}
            onPick={(e) => escolherEmoji(-1, e)}
          />
        )}
      </div>

      <p className="mb-2 mt-5 text-xs font-bold uppercase tracking-[0.02em] text-txt-secondary">
        Respostas
      </p>
      <div className="flex flex-col gap-2">
        {options.map((o, i) => (
          <div key={i} className="relative flex h-10 items-center gap-1 rounded-[3px] bg-void px-1.5">
            <BotaoEmoji
              aberto={escolhendo === i}
              emoji={emojis[i]}
              onToggle={() => setEscolhendo((v) => (v === i ? null : i))}
              label={`Emoji da resposta ${i + 1}`}
            />
            <input
              value={o}
              maxLength={MAX_POLL_OPTION}
              onChange={(e) => setOption(i, e.target.value)}
              aria-label={`Resposta ${i + 1}`}
              placeholder={`Resposta ${i + 1}`}
              className="min-w-0 flex-1 bg-transparent text-txt-normal outline-none placeholder:text-txt-muted"
            />
            {options.length > MIN_POLL_OPTIONS && (
              <Tooltip label="Remover resposta">
                <button
                  type="button"
                  onClick={() => {
                    setOptions((prev) => prev.filter((_, j) => j !== i));
                    setEmojis((prev) => prev.filter((_, j) => j !== i));
                  }}
                  aria-label={`Remover resposta ${i + 1}`}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded text-txt-muted hover:text-red"
                >
                  <X size={18} />
                </button>
              </Tooltip>
            )}
            {escolhendo === i && (
              <EmojiPicker
                className="absolute left-0 top-11 z-10"
                onClose={() => setEscolhendo(null)}
                onPick={(e) => escolherEmoji(i, e)}
              />
            )}
          </div>
        ))}
      </div>
      {options.length < MAX_POLL_OPTIONS && (
        <button
          type="button"
          onClick={() => {
            setOptions((prev) => [...prev, ""]);
            setEmojis((prev) => [...prev, null]);
          }}
          className="mt-2 flex items-center gap-1.5 text-sm font-medium text-txt-link hover:underline"
        >
          <Plus size={16} aria-hidden="true" />
          Adicionar resposta
        </button>
      )}

      <div className="mt-5">
        <Select
          semDivisoria
          label="Duração"
          value={String(hours)}
          options={[
            ...POLL_DURATIONS.map((d) => ({ value: String(d.hours), label: d.label })),
            { value: String(SEM_PRAZO), label: "Sem prazo" },
          ]}
          onChange={(v) => setHours(Number(v))}
        />
      </div>

      <div className="mt-2 border-t border-border pt-1">
        <ToggleLinha
          checked={multi}
          onChange={setMulti}
          titulo="Permitir escolher mais de uma opção"
        />
      </div>
    </Dialog>
  );
}

function BotaoEmoji({
  aberto,
  emoji,
  onToggle,
  label,
}: {
  aberto: boolean;
  emoji?: string | null;
  onToggle: () => void;
  label: string;
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        onClick={onToggle}
        aria-label={label}
        aria-expanded={aberto}
        className="grid h-8 w-8 shrink-0 place-items-center rounded text-txt-secondary transition hover:text-txt-primary"
      >
        {emoji ? <span className="text-lg leading-none">{emoji}</span> : <SmilePlus size={18} />}
      </button>
    </Tooltip>
  );
}
