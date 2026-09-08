"use client";

import { useRef, useState } from "react";
import {
  MAX_SOUNDBOARD_DURACAO_MS,
  MAX_SOUNDBOARD_SIZE,
  MAX_SOUNDBOARD_POR_GUILD,
} from "@streamz/shared";
import Dialog, { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import { Rotulo } from "@/components/ui/controls";
import { Upload } from "@/components/ui/icones";
import EmojiPicker from "@/components/ui/EmojiPicker";
import PopoverFlutuante from "@/components/ui/PopoverFlutuante";
import { api } from "@/lib/api";
import { duracaoDoArquivo } from "@/lib/soundboard-audio";
import { useSoundboard } from "@/stores/soundboard";
import { errorMessage } from "@/stores/socket-adapter";
import { ui, useUI } from "@/stores/ui";

/** Segundos, com uma casa, do teto de duração — para escrever no texto de ajuda. */
const SEGUNDOS = (MAX_SOUNDBOARD_DURACAO_MS / 1000).toFixed(1).replace(".", ",");
const KILOBYTES = Math.round(MAX_SOUNDBOARD_SIZE / 1024);

/**
 * "Adicionar som" — o modal do botão da seção do servidor no painel de efeitos
 * sonoros.
 *
 * A **duração** é conferida aqui, e não na API: sem decodificador de áudio no
 * servidor não há como ler os segundos de um MP3 (é a mesma limitação que faz o
 * emoji não ser reamostrado — ver `emojis/imagem.ts`). O navegador de quem
 * envia tem um decodificador à mão, então é ele quem mede; o servidor continua
 * barrando tipo e tamanho, que são as guardas que ninguém contorna.
 *
 * Se o navegador não conseguir ler a duração (arquivo estranho, formato que ele
 * não toca), o envio **segue**: recusar por não conseguir medir seria barrar
 * arquivos válidos por causa de um `<audio>` que não quis colaborar.
 */
export default function AdicionarSomModal({ guildId }: { guildId: string }) {
  const closeModal = useUI((s) => s.closeModal);
  const sonsDoServidor = useSoundboard(
    (s) => s.guilds.find((g) => g.guildId === guildId)?.sounds.length ?? 0,
  );

  const [file, setFile] = useState<File | null>(null);
  const [nome, setNome] = useState("");
  const [emoji, setEmoji] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [emojiAberto, setEmojiAberto] = useState(false);

  const arquivoRef = useRef<HTMLInputElement>(null);
  const botaoDoEmoji = useRef<HTMLButtonElement>(null);

  const cheio = sonsDoServidor >= MAX_SOUNDBOARD_POR_GUILD;

  async function escolher(escolhido: File) {
    if (escolhido.size > MAX_SOUNDBOARD_SIZE) {
      ui.toast(`O arquivo tem mais de ${KILOBYTES} KB.`, "error");
      return;
    }
    const ms = await duracaoDoArquivo(escolhido);
    if (ms !== null && ms > MAX_SOUNDBOARD_DURACAO_MS) {
      ui.toast(`O som tem ${(ms / 1000).toFixed(1)}s: o máximo é ${SEGUNDOS}s.`, "error");
      return;
    }
    setFile(escolhido);
    // o nome do arquivo sem a extensão é um bom primeiro palpite, e é o que o
    // Discord faz — quem quiser trocar já tem o campo preenchido para editar
    if (!nome.trim()) setNome(escolhido.name.replace(/\.[^.]+$/, "").slice(0, 32));
  }

  async function enviar() {
    if (!file || !nome.trim()) return;
    setEnviando(true);
    try {
      await api.createSound(guildId, nome.trim(), emoji, file);
      ui.toast(`Som "${nome.trim()}" adicionado.`);
      closeModal();
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível adicionar o som"), "error");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog
      telaCheiaNoCelular
      title="Adicionar som"
      description={`MP3, OGG ou WAV de até ${KILOBYTES} KB e ${SEGUNDOS} segundos. Até ${MAX_SOUNDBOARD_POR_GUILD} sons por servidor.`}
      onClose={closeModal}
      footer={
        <>
          <PrimaryButton disabled={!file || !nome.trim() || enviando || cheio} onClick={enviar}>
            {enviando ? "Enviando…" : "Adicionar"}
          </PrimaryButton>
          <SecondaryButton onClick={closeModal}>Cancelar</SecondaryButton>
        </>
      }
    >
      {cheio && (
        <p className="mb-4 rounded-[3px] bg-red/15 px-3 py-2 text-sm text-red">
          Este servidor já tem {MAX_SOUNDBOARD_POR_GUILD} sons. Remova um antes de enviar outro.
        </p>
      )}

      <input
        ref={arquivoRef}
        type="file"
        accept="audio/mpeg,audio/ogg,audio/wav,.mp3,.ogg,.wav"
        hidden
        onChange={(e) => {
          const escolhido = e.target.files?.[0];
          e.target.value = "";
          if (escolhido) void escolher(escolhido);
        }}
      />

      <Rotulo>Arquivo</Rotulo>
      <button
        type="button"
        onClick={() => arquivoRef.current?.click()}
        className="flex h-10 w-full items-center gap-2 rounded-[3px] bg-void px-2.5 text-left text-sm text-txt-normal transition hover:bg-hov"
      >
        <Upload size={18} className="shrink-0 text-txt-muted" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">
          {file ? file.name : "Escolher um arquivo de áudio"}
        </span>
        {file && (
          <span className="shrink-0 text-xs text-txt-muted">
            {Math.round(file.size / 1024)} KB
          </span>
        )}
      </button>

      <div className="mt-5">
        <Rotulo htmlFor="novo-som-nome">Nome</Rotulo>
        <div className="flex h-10 items-center gap-1 rounded-[3px] bg-void px-2.5">
          <button
            ref={botaoDoEmoji}
            type="button"
            onClick={() => setEmojiAberto((v) => !v)}
            aria-label="Escolher emoji do som"
            aria-expanded={emojiAberto}
            className="grid h-7 w-7 shrink-0 place-items-center rounded text-base leading-none transition hover:bg-hov"
          >
            {emoji || "🔊"}
          </button>
          <input
            id="novo-som-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void enviar();
              }
            }}
            maxLength={32}
            placeholder="airhorn"
            className="min-w-0 flex-1 bg-transparent text-txt-normal outline-none placeholder:text-txt-muted"
          />
        </div>
        <p className="mt-1 text-xs text-txt-muted">
          O emoji é o que aparece no card, ao lado do nome.
        </p>
      </div>

      <PopoverFlutuante
        ancora={botaoDoEmoji}
        aberto={emojiAberto}
        onFechar={() => setEmojiAberto(false)}
        rotulo="Escolher emoji do som"
        largura={424}
        semRespiro
      >
        {/* `embutido`: quem é a caixa, o Escape e o clique fora é o
            `PopoverFlutuante`. Sem isso o seletor registraria um **segundo**
            ouvinte de `mousedown` e o primeiro clique fecharia tudo. */}
        <div className="h-[420px] overflow-hidden rounded-lg bg-panel">
          {/* só o emoji unicode interessa aqui: o card do som é um `<span>` de
              texto, não um `<img>` — um emoji personalizado não caberia */}
          <EmojiPicker
            embutido
            guildId={guildId}
            placeholder="Encontre o emoji perfeito"
            onClose={() => setEmojiAberto(false)}
            onPick={(texto, custom) => {
              if (custom) {
                ui.toast("Use um emoji comum: o card do som não mostra imagem.", "error");
                return;
              }
              setEmoji(texto);
              setEmojiAberto(false);
            }}
          />
        </div>
      </PopoverFlutuante>
    </Dialog>
  );
}
