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
import { Select, ToggleLinha } from "@/components/ui/controls";
import { BotaoDeIcone, Button, Campo, TextInput } from "@/components/ui/primitivos";
import EmojiPicker from "@/components/ui/EmojiPicker";
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
      telaCheiaNoCelular
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
      <Campo rotulo="Pergunta" htmlFor="poll-question">
        <div className="relative">
          <TextInput
            id="poll-question"
            value={question}
            maxLength={MAX_POLL_QUESTION}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ex.: Qual dia fica melhor?"
            autoFocus
            sufixo={
              <BotaoEmoji
                aberto={escolhendo === -1}
                onToggle={() => setEscolhendo((v) => (v === -1 ? null : -1))}
                label="Adicionar emoji à pergunta"
              />
            }
          />
          {escolhendo === -1 && (
            <EmojiPicker
              className="absolute right-0 top-11 z-10"
              onClose={() => setEscolhendo(null)}
              onPick={(e) => escolherEmoji(-1, e)}
            />
          )}
        </div>
      </Campo>

      <p className="mb-2 mt-5 text-xs font-bold uppercase tracking-[0.02em] text-text-subtle">
        Respostas
      </p>
      <div className="flex flex-col gap-2">
        {options.map((o, i) => (
          <div key={i} className="relative">
            <TextInput
              value={o}
              maxLength={MAX_POLL_OPTION}
              onChange={(e) => setOption(i, e.target.value)}
              aria-label={`Resposta ${i + 1}`}
              placeholder={`Resposta ${i + 1}`}
              prefixo={
                <BotaoEmoji
                  aberto={escolhendo === i}
                  emoji={emojis[i]}
                  onToggle={() => setEscolhendo((v) => (v === i ? null : i))}
                  label={`Emoji da resposta ${i + 1}`}
                />
              }
              sufixo={
                options.length > MIN_POLL_OPTIONS ? (
                  <BotaoDeIcone
                    rotulo={`Remover resposta ${i + 1}`}
                    icone={<X size={18} />}
                    perigo
                    onClick={() => {
                      setOptions((prev) => prev.filter((_, j) => j !== i));
                      setEmojis((prev) => prev.filter((_, j) => j !== i));
                    }}
                  />
                ) : undefined
              }
            />
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
        <Button
          variante="link"
          tamanho="sm"
          icone={<Plus size={16} aria-hidden="true" />}
          className="mt-2"
          onClick={() => {
            setOptions((prev) => [...prev, ""]);
            setEmojis((prev) => [...prev, null]);
          }}
        >
          Adicionar resposta
        </Button>
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

      <div className="mt-2 border-t border-border-subtle pt-1">
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
    <BotaoDeIcone
      rotulo={label}
      icone={emoji ? <span className="text-lg leading-none">{emoji}</span> : <SmilePlus size={18} />}
      aria-expanded={aberto}
      onClick={onToggle}
    />
  );
}
