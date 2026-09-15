"use client";

import { useEffect, useRef, useState } from "react";
import {
  MAX_SOUNDBOARD_DURACAO_MS,
  MAX_SOUNDBOARD_SIZE,
  MAX_SOUNDBOARD_POR_GUILD,
} from "@streamz/shared";
import Dialog, { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import { Rotulo, Slider } from "@/components/ui/controls";
import { BotaoDeIcone, Campo, TextInput } from "@/components/ui/primitivos";
import { Play, Upload } from "@/components/ui/icones";
import EmojiPicker from "@/components/ui/EmojiPicker";
import PopoverFlutuante from "@/components/ui/PopoverFlutuante";
import { api } from "@/lib/api";
import { useEhMobile } from "@/hooks/useEhMobile";
import { duracaoDoArquivo, soltarElemento, tocarNaSaida } from "@/lib/soundboard-audio";
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
 *
 * **Estados** (cartão 4e): carregando e erro já existiam (`enviando` desabilita
 * o rodapé e troca o rótulo; o `catch` de `enviar` e de `escolher` vira toast).
 * Ganharam agora: **desabilitado** durante o envio nos três campos (arquivo,
 * nome, emoji — trocar o som no meio do upload confundia qual arquivo ia
 * subir), com `desabilitado` no `BotaoDeIcone` (não `disabled` — ele já lida
 * com manter hover/tooltip vivos) em vez de `disabled` cru só no botão de
 * emoji, e a mensagem de teto de servidor (`cheio`) já cobria "sem permissão
 * de continuar", embora a permissão de **abrir** este modal (`MANAGE_EMOJIS`)
 * seja checada por quem chama (`PainelDeSons`/`SoundboardTab`), não aqui.
 *
 * **Volume do som**: o modal do Discord tem "Sound Volume" abaixo de nome e
 * emoji, e um botão de tocar a prévia (catálogo,
 * `blog/imagens/2023-04-ready-your-airhorns-discord-soundboard-is-coming/
 * 02-editar-som.png` — imagem de catálogo, só ordem e presença, sem px). O
 * contrato já tinha `SoundboardSound.volume` (0 a 1) e a coluna já existia; o
 * que faltava era a API ler o campo do multipart (`volumeDoEnvio`, em
 * `apps/api/src/modules/soundboard/dto.ts`). Aqui o deslizador guarda 0 a 1 e
 * mostra 0 a 100%, e a prévia toca **nesse** volume, pela mesma saída de áudio
 * dos efeitos (`tocarNaSaida`) — sem a guarda de surdo, porque ouvir o arquivo
 * antes de enviar é gesto deliberado. O padrão é 100%, o mesmo `@default(1)` da
 * coluna: quem não mexe no controle envia o som como ele veio.
 *
 * A prévia toca um `blob:` do arquivo escolhido. Cada arquivo é uma URL nova,
 * então a troca (e o fechar do modal) solta o elemento em cache e revoga a URL
 * — ver `soltarElemento`.
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
  /** volume de referência do som, 0 a 1 — o que vai no envio. */
  const [volume, setVolume] = useState(1);
  const [urlDaPrevia, setUrlDaPrevia] = useState<string | null>(null);
  const previaRef = useRef<HTMLAudioElement | null>(null);
  const ehMobile = useEhMobile();

  const arquivoRef = useRef<HTMLInputElement>(null);
  const botaoDoEmoji = useRef<HTMLButtonElement>(null);

  const cheio = sonsDoServidor >= MAX_SOUNDBOARD_POR_GUILD;

  // uma URL por arquivo escolhido; trocar de arquivo ou fechar o modal para a
  // prévia, tira o elemento do cache e devolve a memória do blob
  useEffect(() => {
    if (!file || typeof URL === "undefined") {
      setUrlDaPrevia(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setUrlDaPrevia(url);
    return () => {
      previaRef.current = null;
      soltarElemento(url);
      URL.revokeObjectURL(url);
    };
  }, [file]);

  function tocarPrevia() {
    if (!urlDaPrevia) return;
    previaRef.current = tocarNaSaida(urlDaPrevia, volume);
  }

  function mudarVolume(v: number) {
    setVolume(v);
    // arrastar com a prévia tocando ajusta o que está saindo, para a pessoa
    // ouvir o efeito do controle sem apertar tocar de novo
    const el = previaRef.current;
    if (el && !el.paused) {
      if (v <= 0) el.pause();
      else el.volume = v;
    }
  }

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
      await api.createSound(guildId, nome.trim(), emoji, file, volume);
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
        <p className="mb-4 rounded-[3px] bg-status-danger/15 px-3 py-2 text-sm text-status-danger">
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
      {/* o botão de prévia fica ao lado, e não dentro, do seletor de arquivo:
          botão dentro de botão não é HTML válido. Aparece só com arquivo — antes
          disso não há o que ouvir. */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={enviando}
          onClick={() => arquivoRef.current?.click()}
          className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[3px] bg-input-background-default px-2.5 text-left text-sm text-text-default transition hover:bg-interactive-background-hover disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-input-background-default"
        >
          <Upload size={18} className="shrink-0 text-text-muted" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">
            {file ? file.name : "Escolher um arquivo de áudio"}
          </span>
          {file && (
            <span className="shrink-0 text-xs text-text-muted">
              {Math.round(file.size / 1024)} KB
            </span>
          )}
        </button>
        {file && (
          <BotaoDeIcone
            rotulo="Ouvir prévia"
            icone={<Play size={20} aria-hidden="true" />}
            tamanho={ehMobile ? 44 : 40}
            tamanhoDoIcone={20}
            comFundo
            desabilitado={!urlDaPrevia || volume <= 0}
            motivoDesabilitado={volume <= 0 ? "O volume do som está em 0%" : undefined}
            onClick={tocarPrevia}
          />
        )}
      </div>

      <div className="mt-5">
        <Campo rotulo="Nome" htmlFor="novo-som-nome">
          <TextInput
            id="novo-som-nome"
            value={nome}
            disabled={enviando}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void enviar();
              }
            }}
            maxLength={32}
            placeholder="airhorn"
            prefixo={
              <BotaoDeIcone
                ref={botaoDoEmoji}
                rotulo="Escolher emoji do som"
                icone={<span className="text-base leading-none">{emoji || "🔊"}</span>}
                tamanho="sm"
                desabilitado={enviando}
                aria-expanded={emojiAberto}
                onClick={() => setEmojiAberto((v) => !v)}
              />
            }
          />
        </Campo>
        <p className="mt-1 text-xs text-text-muted">
          O emoji é o que aparece no card, ao lado do nome.
        </p>
      </div>

      <div className="mt-2">
        <Slider
          label="Volume do som"
          hint="Quão alto este som toca para todo mundo, antes do volume de efeitos de cada um."
          value={Math.round(volume * 100)}
          min={0}
          max={100}
          step={1}
          format={(v) => `${v}%`}
          onChange={(v) => mudarVolume(v / 100)}
          disabled={enviando}
        />
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
        <div className="h-[420px] overflow-hidden rounded-lg bg-background-base-lowest">
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
