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
import { createPortal } from "react-dom";
import {
  Angry,
  Annoyed,
  Apps,
  Camera,
  Eye,
  EyeOff,
  FileText,
  Gif,
  Gift,
  Hash,
  Image as ImageIcon,
  Laugh,
  MessageSquarePlus,
  Paperclip,
  Pencil,
  Plus,
  SendHorizonal,
  Smile,
  Sticker as StickerIcon,
  Upload,
  Vote,
  X,
} from "@/components/ui/icones";
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_ATTACHMENT_SIZE,
  MAX_MESSAGE_LENGTH,
  Permission,
  SPOILER_PREFIX,
  colorRoleOf,
  displayNameOf,
  mentionsEveryone,
  slowmodeLabel,
  type Attachment,
  type Role,
  type Sticker,
} from "@streamz/shared";
import Autocomplete, { type ItemAutocomplete } from "@/components/chat/Autocomplete";
import PickerPanel, { type PickerTab } from "@/components/media/PickerPanel";
import Avatar from "@/components/ui/Avatar";
import Tooltip from "@/components/ui/Tooltip";
import { formatBytes } from "@/lib/format";
import { api } from "@/lib/api";
import { aplicarEscolha, detectarGatilho, mover, type Gatilho } from "@/lib/composer-autocomplete";
import { buscarComandos, interpretarComando } from "@/lib/comandos-barra";
import { buscarEmojisUnicode } from "@/lib/emojis-unicode";
import { EVENTO_MENCAO, type DetalheMencao } from "@/lib/mencoes";
import { lerRascunho, limparRascunho, salvarRascunho } from "@/lib/rascunhos";
import { useEhMobile } from "@/hooks/useEhMobile";
import { useAuth } from "@/stores/auth";
import { useChannels } from "@/stores/channels";
import { aplicarEmojisPersonalizados, todosOsEmojis, useEmojis } from "@/stores/emojis";
import { useGuilds } from "@/stores/guilds";
import { useMessages } from "@/stores/messages";
import { useCan, usePermissions } from "@/stores/permissions";
import { useSettings } from "@/stores/settings";
import { errorMessage } from "@/stores/socket-adapter";
import { emitTyping } from "@/stores/typing";
import { ui, type MenuItem } from "@/stores/ui";

/** Altura máxima do campo antes de virar rolagem interna (~8 linhas). */
const MAX_HEIGHT_PX = 200;
/**
 * Altura da caixa com uma linha (medida no Discord): os 22px da linha mais os
 * 18px de respiro de cada lado do `py-[18px]`. É o valor que o campo vazio
 * assume **sem perguntar ao layout** — ver `medir` no `useLayoutEffect`.
 */
const ALTURA_UMA_LINHA = 58;
/**
 * A mesma coisa no celular: a cápsula do composer do Discord mede **40pt**
 * (medido em `docs/Reference/mobile/discord-mobile-chat-canal-2024.png`,
 * 1px=1pt, `MEDIDAS.md` §7), com 9px de respiro de cada lado de uma linha de
 * 22. Sem esta constante o `min-h-[40px]` da classe não valia nada: quem
 * escreve a altura do campo vazio é o `style.height` daqui, e ele mandava 58 —
 * a cápsula media 58 num telefone, 45% mais alta que a do Discord.
 */
const ALTURA_UMA_LINHA_MOBILE = 40;
/** A contagem de caracteres só aparece quando começa a importar (Discord: 1800). */
const COUNTER_THRESHOLD = 0.9;
/** Sugestões mostradas de uma vez em cada gatilho. */
const MAX_SUGESTOES = 10;
/** Lado do cartão de prévia de anexo. */
const LADO_PREVIA = 216;
/** Altura aproximada de um item do menu de contexto, para abri-lo para cima. */
const ALTURA_ITEM = 32;
const ALTURA_SEPARADOR = 9;

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

/**
 * Botão de ícone à direita do composer (presente, GIF, figurinha, emoji, apps).
 *
 * `onClick` é opcional porque presente e apps **não fazem nada**: existem para
 * a fileira ter os cinco ícones do Discord, e um botão que abrisse um aviso de
 * "indisponível" seria pior que um botão calado.
 */
function SideButton({
  label,
  onClick,
  onMouseEnter,
  baixo = false,
  children,
}: {
  label: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
  /** 40px de altura em vez de 58: o composer do celular é uma cápsula de 40. */
  baixo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        aria-label={label}
        className={`grid w-10 place-items-center text-txt-secondary transition hover:text-txt-primary ${
          baixo ? "h-[40px]" : "h-[58px]"
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
 * barra. Três decisões que valem registro:
 *
 * - **O arquivo só sobe no envio.** Enquanto está na prévia dá para renomear e
 *   marcar como spoiler, e o nome é justamente o que carrega essa marca
 *   (`SPOILER_`, como no Discord) — subir antes obrigaria a reenviar o arquivo
 *   a cada mudança de ideia. A barra de progresso aparece nesse momento.
 * - **O rascunho é por canal e sobrevive à troca de canal e ao reload**
 *   (`localStorage`), porque o componente é remontado a cada canal e perder o
 *   que estava escrito por clicar no canal errado é o tipo de coisa que só se
 *   percebe quando acontece.
 * - **O `↑` não edita aqui dentro.** Ele abre a edição *na própria mensagem*, na
 *   timeline: no Discord o composer não muda de papel, e trocar o campo de envio
 *   por um campo de edição fazia sumir o que estava escrito.
 */
export default function Composer({
  channelId,
  guildId,
  placeholder,
  onSend,
  allowAttachments = false,
  ariaLabel,
  destino,
  draftKey,
  ultimaMinhaMensagem,
  onCreateThread,
  onCreatePoll,
  modoLento,
}: {
  /** canal em que se está digitando — para o aviso de "digitando…". */
  channelId?: string;
  /** servidor do canal (null em conversa direta) — os emojis do picker vêm dele. */
  guildId?: string | null;
  placeholder: string;
  onSend: (content: string, attachments: Attachment[], sticker?: Sticker) => void;
  allowAttachments?: boolean;
  ariaLabel: string;
  /** destino já formatado ("#geral", "@ana", "Grupo X") para o overlay de arrastar. */
  destino?: string;
  /** chave do rascunho; o painel de thread usa uma própria para não colidir. */
  draftKey?: string;
  /** última mensagem minha neste canal — `↑` no campo vazio abre a edição dela. */
  ultimaMinhaMensagem?: () => { id: string; content: string } | null;
  /** menu do "+": criar thread a partir da conversa. */
  onCreateThread?: () => void;
  /** menu do "+": criar enquete (h-moderacao). */
  onCreatePoll?: () => void;
  /** modo lento do canal: o aviso e a contagem vivem dentro do composer. */
  modoLento?: { segundos: number; restante: number; bloqueado: boolean };
}) {
  const [draft, setDraft] = useState("");
  const [pendentes, setPendentes] = useState<AnexoLocal[]>([]);
  const [prontos, setProntos] = useState<Attachment[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [aberto, setAberto] = useState<PickerTab | null>(null);
  const [termoGif, setTermoGif] = useState("");
  const [carinha, setCarinha] = useState(0);
  const sendMode = useSettings((s) => s.sendMode);
  /**
   * No celular o composer muda em duas coisas, e só nelas: a fileira de cinco
   * ícones vira duas (não cabem cinco alvos de 40px ao lado de um campo de
   * texto em 390px de tela — o rótulo do canal quebrava em três linhas), e
   * ganha um **botão de enviar**, porque o Enter ali é quebra de linha.
   */
  const ehMobile = useEhMobile();
  /** o `medir()` lê isto de dentro de um efeito que não depende do estado. */
  const ehMobileRef = useRef(ehMobile);
  ehMobileRef.current = ehMobile;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** só no celular: galeria de fotos e câmera (ver `abrirMenuMais`). */
  const galeriaInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const me = useAuth((s) => s.user);
  const membros = useGuilds((s) => s.members);
  const canais = useChannels((s) => s.channels);
  const emojisPorGuild = useEmojis((s) => s.guilds);
  // cargos do servidor aberto: os mencionáveis entram no autocomplete do "@"
  const cargos = usePermissions((s) => s.roles);
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

    function medir() {
      const campo = textareaRef.current;
      if (!campo) return;
      // **Campo vazio tem altura fixa de uma linha.** Não dá para perguntar ao
      // `scrollHeight`: com o valor vazio quem o Chrome mede é o
      // **placeholder**, e um placeholder que quebra em duas ou três linhas
      // (composer estreito, janela pequena, lista de membros aberta) devolvia
      // 80 ou 102px no lugar de 58. Pior: a medida ficava, porque isto só
      // rodava de novo quando o texto mudava — a caixa continuava alta depois
      // de alargar a janela, com o texto colado no topo e o resto morto.
      if (!draft) {
        campo.style.height = `${ehMobileRef.current ? ALTURA_UMA_LINHA_MOBILE : ALTURA_UMA_LINHA}px`;
        return;
      }
      campo.style.height = "auto";
      campo.style.height = `${Math.min(campo.scrollHeight, MAX_HEIGHT_PX)}px`;
    }

    medir();

    // Mudar de largura requebra o texto: sem remedir, a altura calculada na
    // largura antiga fica congelada até a próxima tecla.
    if (typeof ResizeObserver === "undefined") return;
    let larguraAnterior = -1;
    const observador = new ResizeObserver(([entrada]) => {
      // só a largura interessa — reagir à altura seria reagir ao próprio ajuste
      if (entrada.contentRect.width === larguraAnterior) return;
      larguraAnterior = entrada.contentRect.width;
      medir();
    });
    observador.observe(el);
    return () => observador.disconnect();
  }, [draft, ehMobile]);

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
    () => montarSugestoes(gatilho, { membros, canais, emojisPorGuild, cargos }),
    [gatilho, membros, canais, emojisPorGuild, cargos],
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
      // apelido por servidor exige uma coluna em GuildMember que ninguém criou
      // ainda; ver "Apelido por servidor" em PENDENCIAS.md
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

    // ↑ no campo vazio abre a edição **na mensagem**, não aqui (como no Discord)
    if (event.key === "ArrowUp" && !draft && ultimaMinhaMensagem) {
      const ultima = ultimaMinhaMensagem();
      if (ultima) {
        event.preventDefault();
        useMessages.getState().startEditing(ultima.id);
        return;
      }
    }

    if (event.key !== "Enter" || event.shiftKey) return;
    // No celular o Enter do teclado da tela **quebra linha**, e quem envia é o
    // botão ao lado. É a regra do Discord no telefone, e a razão é mecânica:
    // no teclado virtual não existe Shift+Enter, então um Enter que enviasse
    // tornaria impossível escrever duas linhas.
    if (ehMobile && !(event.ctrlKey || event.metaKey)) return;
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

  // "Mencionar" dos menus de contexto (lista de membros, participantes de voz,
  // cabeçalho de mensagem): quem menciona não sabe qual composer está montado,
  // então o evento é global e quem está na tela resolve. Ver `lib/mencoes`.
  useEffect(() => {
    function aoMencionar(e: Event) {
      const detalhe = (e as CustomEvent<DetalheMencao>).detail;
      if (!detalhe?.texto) return;
      // avisa quem disparou que este composer atendeu (ver `lib/mencoes`)
      e.preventDefault();
      inserirTexto(detalhe.texto);
    }
    window.addEventListener(EVENTO_MENCAO, aoMencionar);
    return () => window.removeEventListener(EVENTO_MENCAO, aoMencionar);
  });

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
    const items: MenuItem[] = [];
    /*
      No celular, os dois caminhos que o sistema oferece e o `<input type=file>`
      cru não pede: a **galeria** (`accept="image/*"`) e a **câmera**
      (`capture="environment"`, que faz o Android e o iOS abrirem a traseira
      direto, sem passar pelo seletor de arquivos).

      São inputs separados, e não atributos ligados e desligados no mesmo:
      `capture` é lido quando o seletor abre, e alternar o atributo do input
      compartilhado deixava a próxima escolha com o modo da anterior em alguns
      WebViews. Três inputs escondidos custam nada e cada um só sabe uma coisa.

      "Enviar arquivo" continua embaixo, e no desktop continua sendo o único —
      lá `capture` não existe e `accept` só atrapalharia quem quer mandar um zip.
    */
    if (ehMobile) {
      items.push({
        label: "Galeria",
        icon: <ImageIcon size={18} />,
        onSelect: () => galeriaInputRef.current?.click(),
      });
      items.push({
        label: "Tirar foto",
        icon: <Camera size={18} />,
        onSelect: () => cameraInputRef.current?.click(),
      });
    }
    items.push({
      label: "Enviar arquivo",
      icon: <Paperclip size={18} />,
      onSelect: () => fileInputRef.current?.click(),
    });
    if (onCreateThread) {
      items.push({
        label: "Criar thread",
        icon: <MessageSquarePlus size={18} />,
        onSelect: onCreateThread,
      });
    }
    // "Criar enquete" só entra quando há para onde ir; o Discord nunca mostra
    // item morto — o mesmo motivo pelo qual "Mensagem de voz" e "Criar evento"
    // ainda não aparecem aqui (não há backend para nenhum dos dois)
    if (onCreatePoll) {
      items.push({ label: "Criar enquete", icon: <Vote size={18} />, onSelect: onCreatePoll });
    }
    const r = event.currentTarget.getBoundingClientRect();
    // abre **para cima**, alinhado à borda esquerda do botão: para baixo o menu
    // cairia por cima do próprio composer
    const altura =
      items.reduce((h, i) => h + ("separator" in i ? ALTURA_SEPARADOR : ALTURA_ITEM), 0) + 16;
    ui.openContextMenu(r.left, Math.max(8, r.top - 8 - altura), items);
  }

  const Carinha = CARINHAS[carinha];

  return (
    <form
      ref={formRef}
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
      className={`relative shrink-0 ${ehMobile ? "px-3 pb-1" : "px-2.5"}`}
    >
      {dragging && <OverlayArrastar alvo={formRef.current} destino={destino} />}

      {/* Cápsula de 40pt no celular (raio 20, margens de 12) — medido em
          `docs/Reference/mobile/discord-mobile-chat-canal-2024.png`, 1px=1pt,
          `MEDIDAS.md` §7. No desktop segue o retângulo de raio 8 e 58 de altura
          medido no Discord do computador. */}
      <div className={ehMobile ? "rounded-[20px] bg-input" : "rounded-lg bg-input"}>
        {(pendentes.length > 0 || prontos.length > 0) && (
          // uma linha só, com rolagem horizontal: quebrar em várias linhas
          // empurrava a timeline para cima a cada arquivo
          <div className="flex gap-3 overflow-x-auto border-b border-black/20 px-4 py-4">
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
              <div
                key={a.id}
                style={{ height: LADO_PREVIA, width: LADO_PREVIA }}
                className="group/anexo relative shrink-0 rounded-lg bg-panel p-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.url} alt={a.filename} className="h-full w-full rounded object-contain" />
                <span className="absolute right-2 top-2 hidden group-hover/anexo:flex">
                  <BotaoCartao label={`Remover ${a.filename}`} danger onClick={() => setProntos((prev) => prev.filter((x) => x.id !== a.id))}>
                    <X size={16} />
                  </BotaoCartao>
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
              {ehMobile && (
                <>
                  <input
                    ref={galeriaInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(e) => {
                      if (e.target.files?.length) adicionarArquivos(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  {/* sem `multiple`: uma foto por vez é o que a câmera devolve */}
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    hidden
                    onChange={(e) => {
                      if (e.target.files?.length) adicionarArquivos(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </>
              )}
              {/* sem tooltip descritivo: o Discord não rotula o "+" com a lista
                  do que ele faz */}
              <button
                type="button"
                onClick={abrirMenuMais}
                aria-label="Mais opções de envio"
                // `ml-2.5` põe o glifo de 18 a 21px da borda esquerda da caixa,
                // que é onde ele fica no Discord: 10 de margem + os 11 que
                // sobram de cada lado dentro do alvo de 40
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-txt-secondary transition hover:text-txt-primary ${
                  ehMobile ? "mx-0.5" : "ml-2.5 mr-4 mt-[9px]"
                }`}
              >
                {/* `+` liso, não o `CirclePlus`: o do Discord é marca de traço,
                    sem o círculo cheio em volta */}
                {/* O `+` do Discord é desenhado pequeno dentro do próprio ativo: a tinta
              ocupa 58% do quadro, contra ~83% dos vizinhos. Então `size` aqui não
              é o tamanho do desenho — 30 × 0,58 ≈ 17,5, que é o glifo de 18
              medido no composer do Discord. */}
          <Plus size={30} />
              </button>
            </>
          ) : (
            // mesmo recuo do canal: sem isso o composer da thread ficava
            // desalinhado do resto da coluna
            <span className="w-14 shrink-0" aria-hidden="true" />
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
            className={`flex-1 resize-none bg-transparent text-txt-normal outline-none placeholder:text-txt-muted ${
              ehMobile ? "min-h-[40px] py-[9px]" : "min-h-[58px] py-[18px]"
            }`}
          />

          <div className="flex items-center pr-2">
            {modoLento && (
              <Tooltip label={`Modo lento ligado (${slowmodeLabel(modoLento.segundos)})`}>
                <span
                  aria-live="polite"
                  className={`px-2 text-xs tabular-nums ${
                    modoLento.bloqueado ? "text-txt-normal" : "text-txt-muted"
                  }`}
                >
                  {modoLento.bloqueado
                    ? `${modoLento.restante}s`
                    : slowmodeLabel(modoLento.segundos)}
                </span>
              </Tooltip>
            )}
            {/* Ordem do Discord, os cinco: presente → GIF → figurinha → emoji
                → apps. **Presente e apps são inertes de propósito**: não há o
                que presentear nem o que abrir, e eles estão aqui só para a
                fileira ter a forma da do Discord. Sem `onClick`, portanto — e
                sem inventar um modal que não existe. */}
            {/* GIF e figurinha existem também na thread: o composer da thread do
                Discord tem os mesmos botões do canal */}
            {/* `size={20}` para 18px de tinta: os ativos de `figma/` desenham
                o glifo em 83% do quadro. Medido no composer do Discord
                (`173327.png`, y≈992): presente, GIF, figurinha e apps com
                18px, carinha com 16, passo de 40 entre centros — o mesmo
                `w-10` do `SideButton`. */}
            {/* Presente e apps são os dois botões inertes da fileira (§6.6):
                no celular, onde a fileira já não cabe inteira, são também os
                dois primeiros a sair. */}
            {!ehMobile && (
              <SideButton label="Presente">
                <Gift size={20} />
              </SideButton>
            )}
            <SideButton
              label="GIF"
              baixo={ehMobile}
              onClick={() => setAberto((a) => (a === "gif" ? null : "gif"))}
            >
              {/* o ativo do Discord, não `<span>GIF</span>` com borda: texto
                  muda de peso com a fonte do sistema e nunca casa com os
                  vizinhos */}
              <Gif size={20} />
            </SideButton>
            {!ehMobile && (
              <SideButton
                label="Figurinha"
                onClick={() => setAberto((a) => (a === "figurinha" ? null : "figurinha"))}
              >
                <StickerIcon size={20} />
              </SideButton>
            )}
            <SideButton
              label="Emoji"
              baixo={ehMobile}
              onClick={() => setAberto((a) => (a === "emoji" ? null : "emoji"))}
              // o ícone troca de carinha a cada passada do mouse, como no Discord
              onMouseEnter={() => setCarinha((c) => (c + 1) % CARINHAS.length)}
            >
              {/* menor que os vizinhos: a carinha é o único glifo de 16px da
                  fileira no Discord. `size={18}` porque o círculo ocupa 92%
                  do quadro (o nosso print media 14px com `size={16}`) */}
              <Carinha size={18} />
            </SideButton>
            {!ehMobile && (
              <SideButton label="Apps">
                <Apps size={20} />
              </SideButton>
            )}
            {/* Enviar: só no celular, e só quando há o que enviar. No desktop o
                Enter é o botão, e um ícone permanente ali seria ruído. */}
            {ehMobile && (draft.trim().length > 0 || pendentes.length > 0 || prontos.length > 0) && (
              <button
                type="submit"
                disabled={enviando}
                aria-label="Enviar mensagem"
                className="mb-[9px] mr-[9px] mt-[9px] grid h-[40px] w-[40px] shrink-0 place-items-center self-end rounded-full bg-accent text-accent-ink transition disabled:opacity-50"
              >
                <SendHorizonal size={20} />
              </button>
            )}
          </div>
        </div>
      </div>

      {gatilho && sugestoes.length > 0 && (
        <Autocomplete
          titulo={TITULO_GATILHO[gatilho.tipo]}
          termo={gatilho.termo}
          gatilho={gatilho.tipo}
          itens={sugestoes}
          selecionado={selecionado}
          onEscolher={escolherSugestao}
          onPassarMouse={setSelecionado}
        />
      )}

      {/* emoji, GIF e figurinha são um painel só, com abas */}
      {aberto && (
        <PickerPanel
          tab={aberto}
          onTab={setAberto}
          className="absolute bottom-full right-2.5 mb-2"
          termoGif={termoGif}
          guildId={guildId}
          onClose={() => setAberto(null)}
          // no composer entra `:nome:`: é o que a pessoa lê e consegue editar;
          // a forma interna `<:nome:id>` é aplicada no envio
          onPickEmoji={(texto, custom) => inserirTexto(custom ? `:${custom.name}:` : texto)}
          onGif={(attachment) => {
            setProntos((prev) => [...prev, attachment]);
            setAberto(null);
          }}
          onSticker={(sticker) => {
            setAberto(null);
            // figurinha é a mensagem inteira, como no Discord
            onSend("", [], sticker);
            setDraft("");
            if (chaveRascunho) limparRascunho(chaveRascunho);
          }}
        />
      )}

      {/* No canto inferior direito da caixa, como o `characterCount` do
          Discord. Antes ficava na faixa de 24px abaixo do composer, que não
          existe mais (o "digitando…" flutua por cima da lista e o composer
          termina a 10px do fundo). Não colide com os botões: o contador só
          aparece a partir de 1800 caracteres, e com esse texto a caixa está
          na altura máxima, com a fileira de ícones presa ao topo. */}
      {mostrarContador && (
        <span
          aria-live="polite"
          className={`absolute bottom-1.5 right-[26px] text-xs tabular-nums ${
            restante <= 0 ? "text-red" : "text-txt-muted"
          }`}
        >
          {restante}
        </span>
      )}
    </form>
  );
}

/**
 * Overlay de arrastar: cobre **a área do chat inteira**, e não um retângulo
 * arbitrário acima do composer. A caixa é medida a partir do `<main>` que
 * contém o composer e desenhada em portal, porque um `absolute` dentro do form
 * nunca alcançaria a timeline.
 */
function OverlayArrastar({ alvo, destino }: { alvo: HTMLElement | null; destino?: string }) {
  const area = (alvo?.closest("main") ?? alvo)?.getBoundingClientRect();
  if (!area || typeof document === "undefined") return null;
  return createPortal(
    <div
      style={{ top: area.top + 8, left: area.left + 8, width: area.width - 16, height: area.height - 16 }}
      className="pointer-events-none fixed z-[65] grid place-items-center rounded-lg border-2 border-dashed border-accent bg-accent/20"
    >
      <span className="flex flex-col items-center gap-3 text-center">
        <Upload size={56} strokeWidth={1.5} aria-hidden="true" className="text-white" />
        <span className="text-2xl font-extrabold text-white">Arraste e solte para enviar</span>
        {destino && <span className="text-sm text-white/80">em {destino}</span>}
      </span>
    </div>,
    document.body,
  );
}

const TITULO_GATILHO: Record<Gatilho["tipo"], string> = {
  ":": "Emojis",
  "@": "Membros",
  "#": "Canais de texto",
  "/": "Comandos",
};

/** Botão de ícone no canto do cartão de prévia — só aparece no hover. */
function BotaoCartao({
  label,
  onClick,
  danger = false,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={`grid h-7 w-7 place-items-center rounded bg-void/90 transition hover:bg-hov ${
          danger ? "text-red" : "text-txt-normal hover:text-txt-primary"
        }`}
      >
        {children}
      </button>
    </Tooltip>
  );
}

/**
 * Prévia de um arquivo ainda não enviado.
 *
 * As três ações (spoiler, renomear, remover) são ícones no canto superior
 * direito e só aparecem no hover, como no Discord — o checkbox com a palavra
 * "spoiler" e o X sempre visível pesavam mais que a própria imagem.
 */
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
    <div
      style={{ height: LADO_PREVIA, width: LADO_PREVIA }}
      className="group/anexo relative flex shrink-0 flex-col rounded-lg bg-panel p-2"
    >
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

      <span className="mt-2 truncate text-sm text-txt-normal">{anexo.nome}</span>
      <span className="truncate text-[11px] text-txt-muted">{formatBytes(anexo.file.size)}</span>

      {anexo.progresso >= 0 && (
        <div
          role="progressbar"
          aria-valuenow={anexo.progresso}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Enviando ${anexo.nome}`}
          className="mt-1 h-1 overflow-hidden rounded bg-void"
        >
          <div className="h-full bg-accent transition-all" style={{ width: `${anexo.progresso}%` }} />
        </div>
      )}

      <span className="absolute right-2 top-2 hidden gap-1 group-hover/anexo:flex">
        <BotaoCartao
          label={anexo.spoiler ? "Não marcar como spoiler" : "Marcar como spoiler"}
          onClick={onSpoiler}
        >
          {anexo.spoiler ? <EyeOff size={16} /> : <Eye size={16} />}
        </BotaoCartao>
        <BotaoCartao label="Renomear" onClick={onRenomear}>
          <Pencil size={16} />
        </BotaoCartao>
        <BotaoCartao label={`Remover ${anexo.nome}`} danger onClick={onRemover}>
          <X size={16} />
        </BotaoCartao>
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
    membros: {
      user: { id: string; username: string; displayName: string | null; avatarUrl: string | null; status: string };
      roleIds: readonly string[];
    }[];
    canais: { id: string; name: string | null; type: string }[];
    emojisPorGuild: { emojis: { id: string; name: string; url: string }[] }[];
    cargos: readonly Role[];
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

    // ── c-cargos ── só cargo com `mentionable` aparece; o texto grava o id,
    // porque cargo é renomeável e o nome quebraria a menção depois
    const cargos = fontes.cargos
      .filter((r) => r.mentionable && r.name.toLowerCase().includes(q))
      .slice(0, MAX_SUGESTOES - alcance.length)
      .map<ItemAutocomplete>((r) => ({
        chave: `r${r.id}`,
        valor: `<@&${r.id}>`,
        rotulo: `@${r.name}`,
        detalhe: "cargo",
        cor: r.color ?? undefined,
        icone: (
          <span
            aria-hidden="true"
            style={{ backgroundColor: r.color ?? "#8a8a8e" }}
            className="h-3 w-3 rounded-full"
          />
        ),
      }));

    const pessoas = fontes.membros
      .filter(
        (m) =>
          m.user.username.toLowerCase().includes(q) ||
          displayNameOf(m.user).toLowerCase().includes(q),
      )
      .slice(0, MAX_SUGESTOES - alcance.length - cargos.length)
      .map<ItemAutocomplete>((m) => ({
        chave: m.user.id,
        // a menção grava o username: é o que o `mentionsUser` do contrato casa
        valor: `@${m.user.username}`,
        rotulo: displayNameOf(m.user),
        detalhe: m.user.username,
        // o nome do membro sai na cor do cargo mais alto, como na timeline
        cor: colorRoleOf(m.roleIds, fontes.cargos)?.color ?? undefined,
        icone: <Avatar user={m.user as never} size="sm" />,
      }));
    return [...alcance, ...cargos, ...pessoas];
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

