"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import {
  Angry,
  Annoyed,
  CirclePlus,
  FileText,
  Hash,
  Laugh,
  MessageSquarePlus,
  Paperclip,
  Smile,
  Sticker as StickerIcon,
  Upload,
  Vote,
  X,
} from "lucide-react";
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_ATTACHMENT_SIZE,
  MAX_MESSAGE_LENGTH,
  Permission,
  SPOILER_PREFIX,
  displayNameOf,
  mentionsEveryone,
  type Attachment,
  type Sticker,
} from "@newdisc/shared";
import Autocomplete, { type ItemAutocomplete } from "@/components/chat/Autocomplete";
import GifPicker from "@/components/media/GifPicker";
import StickerPicker from "@/components/media/StickerPicker";
import Avatar from "@/components/ui/Avatar";
import EmojiPicker from "@/components/ui/EmojiPicker";
import Tooltip from "@/components/ui/Tooltip";
import { api } from "@/lib/api";
import { aplicarEscolha, detectarGatilho, mover, type Gatilho } from "@/lib/composer-autocomplete";
import { buscarComandos, interpretarComando } from "@/lib/comandos-barra";
import { buscarEmojisUnicode } from "@/lib/emojis-unicode";
import { lerRascunho, limparRascunho, salvarRascunho } from "@/lib/rascunhos";
import { useAuth } from "@/stores/auth";
import { useChannels } from "@/stores/channels";
import { aplicarEmojisPersonalizados, todosOsEmojis, useEmojis } from "@/stores/emojis";
import { useGuilds } from "@/stores/guilds";
import { useCan } from "@/stores/permissions";
import { useSettings } from "@/stores/settings";
import { errorMessage } from "@/stores/socket-adapter";
import { emitTyping } from "@/stores/typing";
import { ui, type MenuItem } from "@/stores/ui";

/** Altura máxima do campo antes de virar rolagem interna (~8 linhas). */
const MAX_HEIGHT_PX = 200;
/** A contagem de caracteres só aparece quando começa a importar (Discord: 1800). */
const COUNTER_THRESHOLD = 0.9;
/** Sugestões mostradas de uma vez em cada gatilho. */
const MAX_SUGESTOES = 10;

/** Um arquivo escolhido, ainda não enviado — dá para renomear e marcar spoiler. */
interface AnexoLocal {
  id: string;
  file: File;
  /** nome editável, sem o prefixo de spoiler (que entra na hora do envio). */
  nome: string;
  spoiler: boolean;
  /** URL local para a prévia de imagem (revogada ao remover). */
  previewUrl?: string;
  /** 0–100 enquanto sobe; -1 antes de começar. */
  progresso: number;
}

let seqAnexo = 0;

/** Ícones que o botão de emoji alterna no hover (o easter egg do Discord). */
const CARINHAS = [Smile, Laugh, Angry, Annoyed];

/** Botão de ícone à direita do composer (GIF, figurinha, emoji). */
function SideButton({
  label,
  onClick,
  disabled = false,
  onMouseEnter,
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  onMouseEnter?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={disabled ? `${label} (em breve)` : label}>
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        aria-label={label}
        aria-disabled={disabled}
        className={`grid h-11 w-8 place-items-center text-txt-secondary transition ${
          disabled ? "cursor-not-allowed opacity-60" : "hover:text-txt-primary"
        }`}
      >
        {children}
      </button>
    </Tooltip>
  );
}

/**
 * Campo de envio de mensagem, no leiaute do Discord.
 *
 * Além do texto, é daqui que saem anexo, GIF, figurinha, emoji e os comandos de
 * barra. Duas decisões que valem registro:
 *
 * - **O arquivo só sobe no envio.** Enquanto está na prévia dá para renomear e
 *   marcar como spoiler, e o nome é justamente o que carrega essa marca
 *   (`SPOILER_`, como no Discord) — subir antes obrigaria a reenviar o arquivo
 *   a cada mudança de ideia. A barra de progresso aparece nesse momento.
 * - **O rascunho é por canal e sobrevive à troca de canal e ao reload**
 *   (`localStorage`), porque o componente é remontado a cada canal e perder o
 *   que estava escrito por clicar no canal errado é o tipo de coisa que só se
 *   percebe quando acontece.
 */
export default function Composer({
  channelId,
  placeholder,
  onSend,
  allowAttachments = false,
  compact = false,
  ariaLabel,
  channelName,
  draftKey,
  ultimaMinhaMensagem,
  onEditMessage,
  onCreateThread,
}: {
  /** canal em que se está digitando — para o aviso de "digitando…". */
  channelId?: string;
  placeholder: string;
  onSend: (content: string, attachments: Attachment[], sticker?: Sticker) => void;
  allowAttachments?: boolean;
  /** variação enxuta usada no painel de thread. */
  compact?: boolean;
  ariaLabel: string;
  /** nome do canal, para o overlay de arrastar ("Solte para enviar em #canal"). */
  channelName?: string;
  /** chave do rascunho; o painel de thread usa uma própria para não colidir. */
  draftKey?: string;
  /** última mensagem minha neste canal — `↑` no campo vazio abre a edição. */
  ultimaMinhaMensagem?: () => { id: string; content: string } | null;
  onEditMessage?: (id: string, content: string) => void;
  /** menu do "+": criar thread a partir da conversa. */
  onCreateThread?: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [pendentes, setPendentes] = useState<AnexoLocal[]>([]);
  const [prontos, setProntos] = useState<Attachment[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [aberto, setAberto] = useState<"emoji" | "gif" | "figurinha" | null>(null);
  const [termoGif, setTermoGif] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [carinha, setCarinha] = useState(0);
  const sendMode = useSettings((s) => s.sendMode);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const me = useAuth((s) => s.user);
  const membros = useGuilds((s) => s.members);
  const canais = useChannels((s) => s.channels);
  const emojisPorGuild = useEmojis((s) => s.guilds);
  // @everyone/@here é MENTION_EVERYONE na permissão efetiva do canal (ADR-0002)
  const podeMencionarTodos = useCan(Permission.MENTION_EVERYONE, channelId);

  // ── rascunho por canal ──
  const chaveRascunho = draftKey ?? channelId;
  useEffect(() => {
    if (!chaveRascunho) return;
    const salvo = lerRascunho(chaveRascunho);
    if (salvo) setDraft(salvo);
  }, [chaveRascunho]);

  useEffect(() => {
    if (!chaveRascunho) return;
    salvarRascunho(chaveRascunho, draft);
  }, [chaveRascunho, draft]);

  // cresce com o conteúdo e volta a encolher quando o texto some
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [draft]);

  // As prévias locais são URLs de objeto e precisam ser revogadas ao desmontar.
  // A lista vive numa ref porque a limpeza tem de rodar **só** no desmonte: com
  // `pendentes` na lista de dependências, cada anexo novo revogaria as prévias
  // dos anteriores e elas virariam imagem quebrada.
  const pendentesRef = useRef<AnexoLocal[]>([]);
  pendentesRef.current = pendentes;
  useEffect(
    () => () => {
      for (const a of pendentesRef.current) if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    },
    [],
  );

  // ── autocomplete ──
  const [caret, setCaret] = useState(0);
  const [selecionado, setSelecionado] = useState(0);
  const gatilho = useMemo<Gatilho | null>(() => detectarGatilho(draft, caret), [draft, caret]);
  const sugestoes = useMemo(
    () => montarSugestoes(gatilho, { membros, canais, emojisPorGuild }),
    [gatilho, membros, canais, emojisPorGuild],
  );
  useEffect(() => setSelecionado(0), [gatilho?.tipo, gatilho?.termo]);

  const restante = MAX_MESSAGE_LENGTH - draft.length;
  const mostrarContador = draft.length >= MAX_MESSAGE_LENGTH * COUNTER_THRESHOLD;
  const totalAnexos = pendentes.length + prontos.length;
  const podeEnviar = (draft.trim().length > 0 || totalAnexos > 0) && !enviando;

  function atualizarTexto(valor: string, novoCaret?: number) {
    setDraft(valor);
    if (novoCaret !== undefined) setCaret(novoCaret);
    if (channelId && valor.trim()) emitTyping(channelId);
  }

  function escolherSugestao(item: ItemAutocomplete) {
    if (!gatilho) return;
    const r = aplicarEscolha(draft, gatilho, item.valor);
    atualizarTexto(r.texto, r.caret);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(r.caret, r.caret);
    });
  }

  // ── envio ──
  async function submit() {
    if (!podeEnviar) return;

    // edição de mensagem própria (aberta com ↑ no campo vazio)
    if (editandoId) {
      const texto = draft.trim();
      if (texto) onEditMessage?.(editandoId, aplicarEmojisPersonalizados(texto, todosOsEmojis(emojisPorGuild)));
      cancelarEdicao();
      return;
    }

    const comando = interpretarComando(draft.trim());
    if (comando.tipo === "desconhecido") {
      ui.toast(`Não conheço o comando /${comando.nome}.`, "error");
      return;
    }
    if (comando.tipo === "gif") {
      setTermoGif(comando.termo);
      setAberto("gif");
      setDraft("");
      return;
    }
    if (comando.tipo === "apelido") {
      // apelido por servidor exige uma coluna em GuildMember que nenhuma frente
      // da rodada 2 criou; ver "Pós-integração r2" em PENDENCIAS.md
      ui.toast("Apelido por servidor ainda não está disponível.", "error");
      return;
    }

    let texto = comando.tipo === "enviar" ? comando.content : draft.trim();
    texto = aplicarEmojisPersonalizados(texto, todosOsEmojis(emojisPorGuild));
    if (!podeMencionarTodos && mentionsEveryone(texto)) {
      // sem permissão a menção vai como texto puro: a barra invertida é o mesmo
      // escape que o nosso markdown já entende, e `mentionsEveryone` o respeita
      texto = texto.replace(/(^|[^\w.\\])@(everyone|here)\b/gi, "$1\\@$2");
      ui.toast("Você não pode mencionar todos aqui — a menção foi enviada como texto.");
    }

    setEnviando(true);
    try {
      const enviados = await subirPendentes();
      onSend(texto, [...prontos, ...enviados]);
      setDraft("");
      setPendentes([]);
      setProntos([]);
      if (chaveRascunho) limparRascunho(chaveRascunho);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível enviar os anexos"), "error");
    } finally {
      setEnviando(false);
    }
  }

  /** Sobe os arquivos da prévia, um a um, mostrando o progresso de cada um. */
  async function subirPendentes(): Promise<Attachment[]> {
    const enviados: Attachment[] = [];
    for (const anexo of pendentes) {
      const arquivo = comNomeFinal(anexo);
      const attachment = await api.uploadFileComProgresso(arquivo, (p) =>
        setPendentes((prev) => prev.map((a) => (a.id === anexo.id ? { ...a, progresso: p } : a))),
      );
      enviados.push(attachment);
    }
    return enviados;
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setDraft("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // com o popup aberto, as setas e o Enter pertencem à lista
    if (gatilho && sugestoes.length > 0) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setSelecionado((i) => mover(i, event.key === "ArrowDown" ? 1 : -1, sugestoes.length));
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        escolherSugestao(sugestoes[selecionado]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setCaret(-1); // fecha o popup sem mexer no texto
        return;
      }
    }

    if (event.key === "Escape" && editandoId) {
      event.preventDefault();
      cancelarEdicao();
      return;
    }

    // ↑ no campo vazio abre a última mensagem minha para editar (como no Discord)
    if (event.key === "ArrowUp" && !draft && ultimaMinhaMensagem) {
      const ultima = ultimaMinhaMensagem();
      if (ultima) {
        event.preventDefault();
        setEditandoId(ultima.id);
        setDraft(ultima.content);
        return;
      }
    }

    if (event.key !== "Enter" || event.shiftKey) return;
    // ── e-configuracoes ── quem prefere Ctrl+Enter usa o Enter para quebrar linha
    if (sendMode === "ctrl-enter" && !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    void submit();
  }

  function inserirTexto(texto: string) {
    const el = textareaRef.current;
    const inicio = el?.selectionStart ?? draft.length;
    const fim = el?.selectionEnd ?? draft.length;
    const proximo = draft.slice(0, inicio) + texto + draft.slice(fim);
    atualizarTexto(proximo, inicio + texto.length);
    setAberto(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(inicio + texto.length, inicio + texto.length);
    });
  }

  function adicionarArquivos(files: FileList | File[]) {
    const lista = Array.from(files);
    if (lista.length === 0) return;
    const espaco = MAX_ATTACHMENTS_PER_MESSAGE - totalAnexos;
    if (espaco <= 0) {
      ui.toast(`Máximo de ${MAX_ATTACHMENTS_PER_MESSAGE} anexos por mensagem.`, "error");
      return;
    }
    const novos: AnexoLocal[] = [];
    for (const file of lista.slice(0, espaco)) {
      if (file.size > MAX_ATTACHMENT_SIZE) {
        ui.toast(
          `${file.name} tem ${formatBytes(file.size)} — o limite é ${formatBytes(MAX_ATTACHMENT_SIZE)}.`,
          "error",
        );
        continue;
      }
      novos.push({
        id: `a${++seqAnexo}`,
        file,
        nome: file.name,
        spoiler: false,
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
        progresso: -1,
      });
    }
    if (novos.length) setPendentes((prev) => [...prev, ...novos]);
  }

  function removerPendente(id: string) {
    setPendentes((prev) => {
      const alvo = prev.find((a) => a.id === id);
      if (alvo?.previewUrl) URL.revokeObjectURL(alvo.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (!allowAttachments) return;
    const files = Array.from(event.clipboardData.files);
    if (files.length === 0) return;
    event.preventDefault();
    adicionarArquivos(files);
  }

  function abrirMenuMais(event: MouseEvent<HTMLButtonElement>) {
    const items: MenuItem[] = [
      {
        label: "Enviar arquivo",
        icon: <Paperclip size={18} />,
        onSelect: () => fileInputRef.current?.click(),
      },
    ];
    if (onCreateThread) {
      items.push({
        label: "Criar thread",
        icon: <MessageSquarePlus size={18} />,
        onSelect: onCreateThread,
      });
    }
    items.push({
      label: "Criar enquete",
      icon: <Vote size={18} />,
      disabled: true,
      onSelect: () => undefined,
    });
    const r = event.currentTarget.getBoundingClientRect();
    ui.openContextMenu(r.left, r.top, items);
  }

  const Carinha = CARINHAS[carinha];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onDragOver={
        allowAttachments
          ? (e) => {
              e.preventDefault();
              setDragging(true);
            }
          : undefined
      }
      onDragLeave={allowAttachments ? () => setDragging(false) : undefined}
      onDrop={
        allowAttachments
          ? (e) => {
              e.preventDefault();
              setDragging(false);
              if (e.dataTransfer.files.length) adicionarArquivos(e.dataTransfer.files);
            }
          : undefined
      }
      className="relative shrink-0 px-4"
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-x-4 bottom-0 top-[-140px] z-[65] grid place-items-center rounded-lg border-2 border-dashed border-accent bg-accent/20">
          <span className="flex items-center gap-2 text-lg font-bold text-white">
            <Upload size={28} aria-hidden="true" />
            Solte para enviar em {channelName ? `#${channelName}` : "esta conversa"}
          </span>
        </div>
      )}

      {editandoId && (
        <p className="mb-1 text-xs text-txt-muted">
          Editando a mensagem — <kbd>esc</kbd> cancela, <kbd>enter</kbd> salva.
        </p>
      )}

      <div className="rounded-lg bg-input">
        {(pendentes.length > 0 || prontos.length > 0) && (
          <div className="flex flex-wrap gap-4 border-b border-black/20 px-3 py-4">
            {pendentes.map((anexo) => (
              <PreviaAnexo
                key={anexo.id}
                anexo={anexo}
                onRemover={() => removerPendente(anexo.id)}
                onRenomear={async () => {
                  const nome = await ui.prompt({
                    title: "Nome do arquivo",
                    initial: anexo.nome,
                    confirmLabel: "Renomear",
                  });
                  if (!nome) return;
                  setPendentes((prev) =>
                    prev.map((a) => (a.id === anexo.id ? { ...a, nome } : a)),
                  );
                }}
                onSpoiler={() =>
                  setPendentes((prev) =>
                    prev.map((a) => (a.id === anexo.id ? { ...a, spoiler: !a.spoiler } : a)),
                  )
                }
              />
            ))}
            {prontos.map((a) => (
              <div key={a.id} className="relative h-[184px] w-[184px] rounded-lg bg-panel p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.url} alt={a.filename} className="h-full w-full rounded object-contain" />
                {/* quem sai do fluxo é este span: o wrapper do Tooltip já é
                    `relative`, então nem o botão de dentro nem a classe dele
                    conseguiriam se posicionar no canto do cartão */}
                <span className="absolute -right-2 -top-2">
                  <Tooltip label="Remover">
                    <button
                      type="button"
                      onClick={() => setProntos((prev) => prev.filter((x) => x.id !== a.id))}
                      aria-label={`Remover ${a.filename}`}
                      className="grid h-8 w-8 place-items-center rounded bg-panel text-red shadow-high hover:bg-hov"
                    >
                      <X size={18} />
                    </button>
                  </Tooltip>
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-start">
          {allowAttachments ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files?.length) adicionarArquivos(e.target.files);
                  e.target.value = "";
                }}
              />
              <Tooltip label="Anexar, criar thread ou enquete">
                <button
                  type="button"
                  onClick={abrirMenuMais}
                  aria-label="Mais opções de envio"
                  className="grid h-11 w-14 place-items-center text-txt-secondary transition hover:text-txt-primary"
                >
                  <CirclePlus size={24} />
                </button>
              </Tooltip>
            </>
          ) : (
            <span className="w-4" aria-hidden="true" />
          )}

          <textarea
            ref={textareaRef}
            rows={1}
            value={draft}
            maxLength={MAX_MESSAGE_LENGTH}
            onChange={(e) => atualizarTexto(e.target.value, e.target.selectionStart)}
            onKeyUp={(e) => setCaret(e.currentTarget.selectionStart)}
            onClick={(e) => setCaret(e.currentTarget.selectionStart)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            aria-label={ariaLabel}
            // `aria-autocomplete` vale para textbox; `aria-expanded` não — quem
            // anuncia a lista é o próprio popup, que é um `listbox` rotulado
            aria-autocomplete="list"
            placeholder={placeholder}
            className="min-h-11 flex-1 resize-none bg-transparent py-[11px] text-txt-normal outline-none placeholder:text-txt-muted"
          />

          <div className="flex items-center pr-2">
            {!compact && (
              <>
                <SideButton
                  label="GIF"
                  onClick={() => setAberto((a) => (a === "gif" ? null : "gif"))}
                >
                  <span className="rounded-[3px] border-2 border-current px-0.5 text-[10px] font-bold leading-3">
                    GIF
                  </span>
                </SideButton>
                <SideButton
                  label="Figurinha"
                  onClick={() => setAberto((a) => (a === "figurinha" ? null : "figurinha"))}
                >
                  <StickerIcon size={24} />
                </SideButton>
              </>
            )}
            <SideButton
              label="Emoji"
              onClick={() => setAberto((a) => (a === "emoji" ? null : "emoji"))}
              // o ícone troca de carinha a cada passada do mouse, como no Discord
              onMouseEnter={() => setCarinha((c) => (c + 1) % CARINHAS.length)}
            >
              <Carinha size={24} />
            </SideButton>
          </div>
        </div>
      </div>

      {gatilho && sugestoes.length > 0 && (
        <Autocomplete
          titulo={TITULO_GATILHO[gatilho.tipo]}
          itens={sugestoes}
          selecionado={selecionado}
          onEscolher={escolherSugestao}
          onPassarMouse={setSelecionado}
        />
      )}

      {aberto === "emoji" && (
        <EmojiPicker
          className="absolute bottom-full right-4 mb-2"
          onClose={() => setAberto(null)}
          // no composer entra `:nome:`: é o que a pessoa lê e consegue editar;
          // a forma interna `<:nome:id>` é aplicada no envio
          onPick={(texto, custom) => inserirTexto(custom ? `:${custom.name}:` : texto)}
        />
      )}

      {aberto === "gif" && (
        <GifPicker
          className="absolute bottom-full right-4 mb-2"
          termoInicial={termoGif}
          onClose={() => setAberto(null)}
          onEscolher={(attachment) => {
            setProntos((prev) => [...prev, attachment]);
            setAberto(null);
          }}
        />
      )}

      {aberto === "figurinha" && (
        <StickerPicker
          className="absolute bottom-full right-4 mb-2"
          onClose={() => setAberto(null)}
          onEscolher={(sticker) => {
            setAberto(null);
            // figurinha é a mensagem inteira, como no Discord
            onSend("", [], sticker);
            setDraft("");
            if (chaveRascunho) limparRascunho(chaveRascunho);
          }}
        />
      )}

      {mostrarContador && (
        <span
          aria-live="polite"
          className={`absolute bottom-1 right-6 text-xs ${restante <= 0 ? "text-red" : "text-txt-muted"}`}
        >
          {restante}
        </span>
      )}
    </form>
  );
}

const TITULO_GATILHO: Record<Gatilho["tipo"], string> = {
  ":": "Emojis",
  "@": "Membros",
  "#": "Canais de texto",
  "/": "Comandos",
};

/** Prévia de um arquivo ainda não enviado, com nome, spoiler e progresso. */
function PreviaAnexo({
  anexo,
  onRemover,
  onRenomear,
  onSpoiler,
}: {
  anexo: AnexoLocal;
  onRemover: () => void;
  onRenomear: () => void;
  onSpoiler: () => void;
}) {
  return (
    <div className="relative flex h-[184px] w-[184px] flex-col rounded-lg bg-panel p-2">
      {anexo.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={anexo.previewUrl}
          alt={anexo.nome}
          className={`min-h-0 flex-1 rounded object-contain ${anexo.spoiler ? "blur-lg" : ""}`}
        />
      ) : (
        <div className="grid min-h-0 flex-1 place-items-center text-txt-muted" aria-hidden="true">
          <FileText size={64} strokeWidth={1} />
        </div>
      )}

      <button
        type="button"
        onClick={onRenomear}
        title="Renomear"
        className="mt-2 truncate text-left text-sm text-txt-normal hover:underline"
      >
        {anexo.nome}
      </button>
      <div className="flex items-center justify-between gap-1 text-[11px] text-txt-muted">
        <span className="truncate">{formatBytes(anexo.file.size)}</span>
        <label className="flex shrink-0 cursor-pointer items-center gap-1">
          <input
            type="checkbox"
            checked={anexo.spoiler}
            onChange={onSpoiler}
            className="accent-accent"
          />
          spoiler
        </label>
      </div>

      {anexo.progresso >= 0 && (
        <div
          role="progressbar"
          aria-valuenow={anexo.progresso}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Enviando ${anexo.nome}`}
          className="mt-1 h-1 overflow-hidden rounded bg-rail"
        >
          <div className="h-full bg-accent transition-all" style={{ width: `${anexo.progresso}%` }} />
        </div>
      )}

      <span className="absolute -right-2 -top-2">
        <Tooltip label="Remover anexo">
          <button
            type="button"
            onClick={onRemover}
            aria-label={`Remover ${anexo.nome}`}
            className="grid h-8 w-8 place-items-center rounded bg-panel text-red shadow-high hover:bg-hov"
          >
            <X size={18} />
          </button>
        </Tooltip>
      </span>
    </div>
  );
}

/** Arquivo com o nome final: o prefixo de spoiler é parte do nome, como no Discord. */
function comNomeFinal(anexo: AnexoLocal): File {
  const nome = anexo.spoiler ? `${SPOILER_PREFIX}${anexo.nome}` : anexo.nome;
  if (nome === anexo.file.name) return anexo.file;
  return new File([anexo.file], nome, { type: anexo.file.type });
}

/** Candidatos do popup, conforme o gatilho ativo. */
function montarSugestoes(
  gatilho: Gatilho | null,
  fontes: {
    membros: { user: { id: string; username: string; displayName: string | null; avatarUrl: string | null; status: string } }[];
    canais: { id: string; name: string | null; type: string }[];
    emojisPorGuild: { emojis: { id: string; name: string; url: string }[] }[];
  },
): ItemAutocomplete[] {
  if (!gatilho) return [];
  const q = gatilho.termo.toLowerCase();

  if (gatilho.tipo === ":") {
    const custom = fontes.emojisPorGuild
      .flatMap((g) => g.emojis)
      .filter((e) => e.name.includes(q))
      .slice(0, MAX_SUGESTOES)
      .map<ItemAutocomplete>((e) => ({
        chave: `c${e.id}`,
        valor: `:${e.name}:`,
        rotulo: `:${e.name}:`,
        detalhe: "do servidor",
        icone: (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={e.url} alt="" className="h-5 w-5 object-contain" />
        ),
      }));
    const unicode = buscarEmojisUnicode(q, MAX_SUGESTOES - custom.length).map<ItemAutocomplete>(
      (e) => ({
        chave: `u${e.nome}`,
        valor: e.char,
        rotulo: `:${e.nome}:`,
        icone: <span className="text-lg">{e.char}</span>,
      }),
    );
    return [...custom, ...unicode];
  }

  if (gatilho.tipo === "@") {
    const alcance: ItemAutocomplete[] = [
      { chave: "everyone", valor: "@everyone", rotulo: "@everyone", detalhe: "avisa todo mundo" },
      { chave: "here", valor: "@here", rotulo: "@here", detalhe: "avisa quem está online" },
    ].filter((i) => i.rotulo.slice(1).startsWith(q));

    const pessoas = fontes.membros
      .filter(
        (m) =>
          m.user.username.toLowerCase().includes(q) ||
          displayNameOf(m.user).toLowerCase().includes(q),
      )
      .slice(0, MAX_SUGESTOES - alcance.length)
      .map<ItemAutocomplete>((m) => ({
        chave: m.user.id,
        // a menção grava o username: é o que o `mentionsUser` do contrato casa
        valor: `@${m.user.username}`,
        rotulo: displayNameOf(m.user),
        detalhe: m.user.username,
        icone: <Avatar user={m.user as never} size="sm" />,
      }));
    return [...alcance, ...pessoas];
  }

  if (gatilho.tipo === "#") {
    return fontes.canais
      .filter((c) => c.type === "TEXT" && (c.name ?? "").toLowerCase().includes(q))
      .slice(0, MAX_SUGESTOES)
      .map<ItemAutocomplete>((c) => ({
        chave: c.id,
        valor: `#${c.name}`,
        rotulo: `#${c.name}`,
        icone: <Hash size={16} className="text-txt-faint" />,
      }));
  }

  return buscarComandos(gatilho.termo)
    .slice(0, MAX_SUGESTOES)
    .map<ItemAutocomplete>((c) => ({
      chave: c.nome,
      valor: `/${c.nome}`,
      rotulo: `/${c.nome}`,
      detalhe: c.descricao,
    }));
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
