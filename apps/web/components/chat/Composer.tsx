"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import {
  Angry,
  Annoyed,
  Apps,
  Camera,
  Gif,
  Gift,
  Image as ImageIcon,
  Laugh,
  MessageSquarePlus,
  Paperclip,
  Smile,
  Sticker as StickerIcon,
  Vote,
} from "@/components/ui/icones";
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_ATTACHMENT_SIZE,
  MAX_MESSAGE_LENGTH,
  Permission,
  mentionsEveryone,
  type Attachment,
  type EscolhaDeAutocomplete,
  type OpcaoDeComando,
  type Sticker,
} from "@streamz/shared";
import Autocomplete, { type ItemAutocomplete } from "@/components/chat/Autocomplete";
import { AreaDeAnexos, comNomeFinal, type AnexoLocal } from "@/components/chat/composer/anexos";
import AvisoDeModoLento from "@/components/chat/composer/AvisoDeModoLento";
import BarraDoComando from "@/components/chat/composer/BarraDoComando";
import { BotaoEnviar, BotaoLateral, BotaoMais } from "@/components/chat/composer/BotoesDoComposer";
import OverlayArrastar from "@/components/chat/composer/OverlayArrastar";
import SeletorDeComandos from "@/components/chat/composer/SeletorDeComandos";
import {
  TITULO_GATILHO,
  montarSugestoes,
  nomeDaEscolha,
  sugestoesDeOpcao,
  sugestoesDoBot,
} from "@/components/chat/composer/sugestoes";
import PickerPanel, { type PickerTab } from "@/components/media/PickerPanel";
import { formatBytes } from "@/lib/format";
import { api } from "@/lib/api";
import {
  ESPERA_DO_AUTOCOMPLETE_MS,
  aplicarEscolha,
  detectarGatilho,
  estadoDaListaDoBot,
  mover,
} from "@/lib/composer-autocomplete";
import {
  acrescentarOpcao,
  agruparComandos,
  aplicarValorDeOpcao,
  chaveDeEscolha,
  estadoDoComando,
  interpretarComando,
  pedidoDeAutocomplete,
  textoAoEscolherComando,
  type ComandoListavel,
  type EscolhaFeita,
} from "@/lib/comandos-barra";
import { EVENTO_PAINEL_DO_COMPOSER, type DetalhePainelDoComposer } from "@/lib/eventos-do-composer";
import { EVENTO_MENCAO, type DetalheMencao } from "@/lib/mencoes";
import { lerRascunho, limparRascunho, salvarRascunho } from "@/lib/rascunhos";
import { useEhMobile } from "@/hooks/useEhMobile";
import { useChannels } from "@/stores/channels";
import { useComandosDeApp } from "@/stores/comandos-de-app";
import { aplicarEmojisPersonalizados, todosOsEmojis, useEmojis } from "@/stores/emojis";
import { useGuilds } from "@/stores/guilds";
import { useInteracoesDeBot } from "@/stores/interacoes-de-bot";
import { useMessages } from "@/stores/messages";
import { useCan, usePermissions } from "@/stores/permissions";
import { useSettings } from "@/stores/settings";
import { errorMessage } from "@/stores/socket-adapter";
import { emitTyping } from "@/stores/typing";
import { ui, type MenuItem } from "@/stores/ui";

/** Altura máxima do campo antes de virar rolagem interna (~8 linhas). Não medido. */
const MAX_HEIGHT_PX = 200;
/**
 * No celular o teto é uma **fração da janela**, não os 200px do desktop.
 *
 * Com o teclado aberto a janela do telefone encolhe para ~460px de altura
 * (`interactiveWidget: "resizes-content"`, ver `app/layout.tsx`), e um campo de
 * 200 comia 200 dos 460. 30% deixa o campo crescer até ~6 linhas com o teclado
 * aberto e continua batendo nos mesmos 200px com o teclado fechado.
 */
const FRACAO_MAX_MOBILE = 0.3;
/** Piso do teto acima: três linhas, para o campo nunca virar uma fresta. */
const MIN_MAX_MOBILE = 84;

/** Até onde o campo pode crescer agora, na janela de agora. */
function tetoDoCampo(ehMobile: boolean): number {
  if (!ehMobile || typeof window === "undefined") return MAX_HEIGHT_PX;
  return Math.max(MIN_MAX_MOBILE, Math.min(MAX_HEIGHT_PX, Math.round(window.innerHeight * FRACAO_MAX_MOBILE)));
}
/**
 * Altura do campo com uma linha: **56**, não 58.
 *
 * Print 1:1 `docs/Reference/Captura de tela 2026-09-02 180835.png`, coluna
 * x=700: borda 1px em y=964, miolo `#222327` de y=965 a 1020 (56), borda em
 * y=1021. Os 58 que tínhamos eram a caixa inteira sem borda. Bate com o CSS:
 * `--custom-channel-textarea-text-area-height:56px` e
 * `.textArea__74017{padding:calc((56px - var(--chat-markup-line-height))/2) 0}`
 * = (56 − 22) / 2 = 17 em cima e embaixo.
 */
const ALTURA_UMA_LINHA = 56;
/**
 * A mesma coisa no celular: a cápsula do composer do Discord mede **40pt**
 * (`docs/Reference/mobile/discord-mobile-chat-canal-2024.png`, `MEDIDAS.md` §7),
 * com 9px de respiro de cada lado de uma linha de 22.
 */
const ALTURA_UMA_LINHA_MOBILE = 40;
/** A contagem de caracteres só aparece quando começa a importar (Discord: 1800). */
const COUNTER_THRESHOLD = 0.9;
/** Altura aproximada de um item do menu de contexto, para abri-lo para cima. */
const ALTURA_ITEM = 32;
const ALTURA_SEPARADOR = 9;

let seqAnexo = 0;

/** Lista vazia estável, para o `useMemo` das sugestões do bot não recalcular à toa. */
const NENHUMA_ESCOLHA: readonly EscolhaDeAutocomplete[] = [];
/**
 * Textos do popout de valores quando quem sugere é o bot. **Não medidos**: não
 * há print nem imagem do autocomplete de opção do Discord nas referências
 * (`desenvolvedores/README.md` lista a lacuna), então são as palavras do
 * Streamz para os mesmos estados. O "Carregando…" é o do próprio `Autocomplete`.
 */
const TEXTO_FALHOU_AUTOCOMPLETE = "Não foi possível carregar as opções.";
const TEXTO_VAZIO_AUTOCOMPLETE = "Nenhuma opção corresponde à sua pesquisa.";

/** Ícones que o botão de emoji alterna no hover (o easter egg do Discord). */
const CARINHAS = [Smile, Laugh, Angry, Annoyed];

/**
 * Campo de envio de mensagem, no leiaute do Discord.
 *
 * Caixa (print 1:1 `180835.png` + `css-bruto/962953.69892aacbc3b8e17.css`,
 * módulo `__74017`):
 * - 58 de altura com a borda de 1px `--border-subtle` (`#27282b` sobre
 *   `#1a1a1e`; `.refresh-fast-follow-distinct-borders .channelTextArea__74017`),
 *   raio 8 (`--radius-sm`), fundo `--chat-background-default`;
 * - a 10px das bordas da coluna (caixa em x 385–1640, coluna 375–1650);
 * - **sem anel de foco**: `.channelTextArea__74017:focus-within{border-color:
 *   var(--border-subtle);box-shadow:none}` — a borda nem muda de cor (o
 *   `--app-frame-border` da variante nova resolve o mesmo `#94949c1f`). O campo
 *   leva `data-sem-anel` para o anel limão genérico do `globals.css` não
 *   desenhar em volta da caixa, que era o que a revisão visual registrou;
 * - com barra empilhada acima (resposta), perde o raio de cima
 *   (`.hasStackedBar__74017`);
 * - com o contador visível, o miolo cresce para 56 + 32
 *   (`.charCountShowing__74017 .inner__74017`), e o número vai no canto:
 *   `.characterCount_fcde1f{bottom:12px;inset-inline-end:14px;font-family:
 *   var(--font-code);font-size:12px;color:var(--text-muted)}`.
 *
 * Além do texto, é daqui que saem anexo, GIF, figurinha, emoji e os comandos de
 * barra. Três decisões que valem registro:
 *
 * - **O arquivo só sobe no envio.** Enquanto está na prévia dá para renomear e
 *   marcar como spoiler, e o nome é justamente o que carrega essa marca
 *   (`SPOILER_`, como no Discord).
 * - **O rascunho é por canal e sobrevive à troca de canal e ao reload**
 *   (`localStorage`), porque o componente é remontado a cada canal.
 * - **O `↑` não edita aqui dentro.** Ele abre a edição *na própria mensagem*, na
 *   timeline: no Discord o composer não muda de papel.
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
  /**
   * Modo lento do canal: o aviso e a contagem vivem colados na caixa. O campo
   * **continua digitável** durante a espera, como no Discord; quem barra o
   * envio é o `onSend` do `ChatView`. Não existe mais a prop `desabilitado`:
   * nenhuma tela a passava, e sem permissão de enviar as telas trocam o
   * composer inteiro pelo aviso.
   */
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
   * texto em 390px de tela), e ganha um **botão de enviar**, porque o Enter ali
   * é quebra de linha.
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

  const membros = useGuilds((s) => s.members);
  const canais = useChannels((s) => s.channels);
  const emojisPorGuild = useEmojis((s) => s.guilds);
  // cargos do servidor aberto: os mencionáveis entram no autocomplete do "@"
  const cargos = usePermissions((s) => s.roles);
  // ── j-bots ── os comandos de barra dos bots deste servidor
  const comandosDeApp = useComandosDeApp((s) => s.comandos);
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
      // **Campo vazio tem altura fixa de uma linha.** Com o valor vazio quem o
      // Chrome mede no `scrollHeight` é o **placeholder**, e um placeholder que
      // quebra em duas linhas (composer estreito) devolvia 80 ou 102px.
      if (!draft) {
        campo.style.height = `${ehMobileRef.current ? ALTURA_UMA_LINHA_MOBILE : ALTURA_UMA_LINHA}px`;
        return;
      }
      campo.style.height = "auto";
      campo.style.height = `${Math.min(campo.scrollHeight, tetoDoCampo(ehMobileRef.current))}px`;
    }

    medir();

    // **O teclado abrindo é um `resize` da janela, não do campo** — ver `tetoDoCampo`.
    window.addEventListener("resize", medir);

    // Mudar de largura requebra o texto: sem remedir, a altura calculada na
    // largura antiga fica congelada até a próxima tecla.
    if (typeof ResizeObserver === "undefined") {
      return () => window.removeEventListener("resize", medir);
    }
    let larguraAnterior = -1;
    const observador = new ResizeObserver(([entrada]) => {
      // só a largura interessa — reagir à altura seria reagir ao próprio ajuste
      if (entrada.contentRect.width === larguraAnterior) return;
      larguraAnterior = entrada.contentRect.width;
      medir();
    });
    observador.observe(el);
    return () => {
      window.removeEventListener("resize", medir);
      observador.disconnect();
    };
  }, [draft, ehMobile]);

  // As prévias locais são URLs de objeto e precisam ser revogadas ao desmontar.
  // A lista vive numa ref porque a limpeza tem de rodar **só** no desmonte.
  const pendentesRef = useRef<AnexoLocal[]>([]);
  pendentesRef.current = pendentes;
  useEffect(
    () => () => {
      for (const a of pendentesRef.current) if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    },
    [],
  );

  // ── listas acima do campo ──
  //
  // Três listas disputam o mesmo lugar, e só uma aparece por vez: o seletor de
  // comandos (`/` no começo), o autocomplete de `:` `@` `#`, e os valores da
  // opção de comando que se está preenchendo (escolhas, usuário, canal, cargo).
  // As teclas são sempre do campo; a lista só desenha.
  const [caret, setCaret] = useState(0);
  const [selecionado, setSelecionado] = useState(0);
  /** o Esc fecha a lista **neste** texto e cursor; digitar reabre. */
  const [fechadaEm, setFechadaEm] = useState<string | null>(null);
  /** a obrigatória que ficou em branco no último Enter — pinta o chip de erro. */
  const [opcaoComErro, setOpcaoComErro] = useState<string | null>(null);

  const gatilho = useMemo(() => detectarGatilho(draft, caret), [draft, caret]);
  const grupos = useMemo(
    () => (gatilho?.tipo === "/" ? agruparComandos(gatilho.termo, comandosDeApp) : []),
    [gatilho, comandosDeApp],
  );
  const comandosPlanos = useMemo(() => grupos.flatMap((g) => g.comandos), [grupos]);
  const sugestoes = useMemo(
    () => montarSugestoes(gatilho, { membros, canais, emojisPorGuild, cargos, podeMencionarTodos }),
    [gatilho, membros, canais, emojisPorGuild, cargos, podeMencionarTodos],
  );
  const estado = useMemo(
    () => (gatilho?.tipo === "/" ? null : estadoDoComando(draft, caret, comandosDeApp)),
    [gatilho, draft, caret, comandosDeApp],
  );
  const sugestoesOpcao = useMemo(
    () =>
      !gatilho && estado?.ativa ? sugestoesDeOpcao(estado.ativa, estado.termoAtivo, { membros, canais, cargos }) : [],
    [gatilho, estado, membros, canais, cargos],
  );

  const chaveDaLista = `${draft} ${caret}`;
  const listaFechada = fechadaEm === chaveDaLista;

  // ── onda 3 · opção com `autocomplete: true` (callback 8) ──
  //
  // Quem sugere é o bot: o campo pede (`pedirAutocomplete` da store, com a
  // opção em foco e as já preenchidas), a resposta volta pelo socket e a store
  // descarta a de pedido velho. Escolhas fixas (`choices`) continuam locais,
  // em `sugestoesOpcao`. Com a lista fechada (Esc, ou logo depois de escolher)
  // não se pede nada: seria uma interação e um `INTERACTION_CREATE` para uma
  // lista que ninguém vai ver.
  /** escolhas pegas na lista do bot: o campo mostra o `name`, o envio manda o `value`. */
  const [escolhasFeitas, setEscolhasFeitas] = useState<ReadonlyMap<string, EscolhaFeita>>(() => new Map());
  const autocompleteDoBot = useInteracoesDeBot((s) => s.autocomplete);
  const pedido = useMemo(
    () =>
      !gatilho && estado && channelId && !listaFechada ? pedidoDeAutocomplete(draft, estado, escolhasFeitas) : null,
    [gatilho, estado, channelId, listaFechada, draft, escolhasFeitas],
  );
  // "o bot não achou nada" contra "falhou" é a store quem sabe
  // (`autocomplete.falhou`, ver `estadoDaListaDoBot`)
  const listaDoBot = pedido ? estadoDaListaDoBot(pedido.chave, autocompleteDoBot) : null;
  const escolhasDoBot =
    listaDoBot === "pronto" && autocompleteDoBot ? autocompleteDoBot.escolhas : NENHUMA_ESCOLHA;
  const opcaoDoBot = pedido !== null;
  const itensDaOpcao = useMemo(
    () => (opcaoDoBot ? sugestoesDoBot(escolhasDoBot) : sugestoesOpcao),
    [opcaoDoBot, escolhasDoBot, sugestoesOpcao],
  );

  // O pedido em si, com *debounce*. A assinatura é o corpo inteiro: mover o
  // cursor dentro do mesmo valor não pede de novo, e mudar outra opção já
  // preenchida pede (o bot recebe as duas). Trocar de opção pede **na hora** —
  // a lista abre em "Carregando…" e não há digitação para esperar. O HTTP do
  // pedido anterior ainda em voo é abortado pela store ao trocar o `nonce`, e
  // a resposta de um pedido que já chegou ao servidor é descartada ao chegar.
  const assinaturaDoPedido = pedido ? JSON.stringify(pedido) : null;
  const pedidoRef = useRef(pedido);
  pedidoRef.current = pedido;
  /** o `nonce` do último pedido **deste** composer: só ele pode ser limpo daqui. */
  const nonceDoPedidoRef = useRef<string | null>(null);
  useEffect(() => {
    const atual = pedidoRef.current;
    const loja = useInteracoesDeBot.getState();
    if (!atual || !channelId) {
      if (nonceDoPedidoRef.current && loja.autocomplete?.nonce === nonceDoPedidoRef.current) {
        loja.limparAutocomplete();
      }
      nonceDoPedidoRef.current = null;
      return;
    }
    const trocouDeOpcao = loja.autocomplete?.chave !== atual.chave;
    const relogio = setTimeout(
      () => {
        void useInteracoesDeBot.getState().pedirAutocomplete(channelId, atual.commandId, atual.options);
        // `pedirAutocomplete` grava o nonce novo antes do primeiro `await`
        nonceDoPedidoRef.current = useInteracoesDeBot.getState().autocomplete?.nonce ?? null;
      },
      trocouDeOpcao ? 0 : ESPERA_DO_AUTOCOMPLETE_MS,
    );
    return () => clearTimeout(relogio);
  }, [assinaturaDoPedido, channelId]);
  // desmontar (trocar de canal, fechar a thread) não deixa lista órfã na store
  useEffect(
    () => () => {
      const loja = useInteracoesDeBot.getState();
      if (nonceDoPedidoRef.current && loja.autocomplete?.nonce === nonceDoPedidoRef.current) {
        loja.limparAutocomplete();
      }
    },
    [],
  );
  // campo vazio (enviou, apagou tudo): as escolhas de antes não valem mais
  useEffect(() => {
    if (!draft) setEscolhasFeitas((m) => (m.size > 0 ? new Map() : m));
  }, [draft]);

  const lista: "comandos" | "gatilho" | "opcao" | null = listaFechada
    ? null
    : comandosPlanos.length > 0
      ? "comandos"
      : sugestoes.length > 0
        ? "gatilho"
        : // a opção do bot abre a lista mesmo sem itens: é onde moram o
          // "Carregando…", o vazio e a falha
          itensDaOpcao.length > 0 || opcaoDoBot
          ? "opcao"
          : null;
  const tamanhoDaLista =
    lista === "comandos"
      ? comandosPlanos.length
      : lista === "gatilho"
        ? sugestoes.length
        : lista === "opcao"
          ? itensDaOpcao.length
          : 0;

  useEffect(
    () => setSelecionado(0),
    // `escolhasDoBot`: resposta nova do bot é lista nova, a seleção volta ao topo
    [lista, gatilho?.tipo, gatilho?.termo, estado?.ativa?.name, estado?.termoAtivo, escolhasDoBot],
  );
  useEffect(() => setOpcaoComErro(null), [draft]);

  const restante = MAX_MESSAGE_LENGTH - draft.length;
  const mostrarContador = draft.length >= MAX_MESSAGE_LENGTH * COUNTER_THRESHOLD;
  const totalAnexos = pendentes.length + prontos.length;
  const podeEnviar = (draft.trim().length > 0 || totalAnexos > 0) && !enviando;

  function atualizarTexto(valor: string, novoCaret?: number) {
    setDraft(valor);
    if (novoCaret !== undefined) setCaret(novoCaret);
    if (channelId && valor.trim()) emitTyping(channelId);
  }

  function focar(posicao: number) {
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(posicao, posicao);
    });
  }

  function escolherSugestao(item: ItemAutocomplete) {
    if (!gatilho) return;
    const r = aplicarEscolha(draft, gatilho, item.valor);
    atualizarTexto(r.texto, r.caret);
    focar(r.caret);
  }

  function escolherComando(comando: ComandoListavel) {
    if (!gatilho) return;
    const inserido = textoAoEscolherComando(comando);
    const novo = inserido + draft.slice(gatilho.fim).replace(/^\s+/, "");
    atualizarTexto(novo, inserido.length);
    focar(inserido.length);
  }

  function escolherValorDeOpcao(item: ItemAutocomplete) {
    if (!estado || item.desabilitado) return;
    const r = aplicarValorDeOpcao(draft, caret, estado, item.valor);
    if (pedido && estado.ativa) {
      const escolha = escolhasDoBot[itensDaOpcao.indexOf(item)];
      if (escolha) {
        const chave = chaveDeEscolha(pedido.commandId, estado.ativa.name);
        setEscolhasFeitas((m) => new Map(m).set(chave, { name: nomeDaEscolha(escolha), value: escolha.value }));
      }
      // Texto livre continua ativo depois do espaço (`estadoDoComando`): sem
      // fechar, a lista reabriria sobre o nome recém-escolhido e o Enter
      // seguinte escolheria de novo em vez de enviar. Digitar reabre. Se a
      // escolha já levou o cursor à próxima obrigatória, a lista dela abre.
      const ativaDepois = estadoDoComando(r.texto, r.caret, comandosDeApp)?.ativa;
      if (ativaDepois?.name === estado.ativa.name) setFechadaEm(`${r.texto} ${r.caret}`);
    }
    atualizarTexto(r.texto, r.caret);
    focar(r.caret);
  }

  function acrescentar(opcao: OpcaoDeComando) {
    const r = acrescentarOpcao(draft, opcao);
    atualizarTexto(r.texto, r.caret);
    focar(r.caret);
  }

  // ── envio ──
  async function submit() {
    if (!podeEnviar) return;

    const comando = interpretarComando(draft.trim(), comandosDeApp, escolhasFeitas);
    // ── j-bots ── comando de bot: vira interação, **antes** do "desconhecido".
    // Nada é escrito no canal por quem digitou: a resposta chega pelo socket.
    if (comando.tipo === "faltaOpcao") {
      // o chip da opção fica vermelho (`.error_a19535`); o toast diz qual é,
      // para quem não está olhando a barra
      setOpcaoComErro(comando.opcao);
      ui.toast(`/${comando.comando} precisa de "${comando.opcao}".`, "error");
      return;
    }
    if (comando.tipo === "interacao") {
      if (!channelId) return;
      setEnviando(true);
      try {
        // pela store, e não direto pela `api`: é ela que gera o `nonce` e guarda
        // a interação pendente, para o modal de um comando que responde com
        // callback 9 (`interaction.modal`) abrir nesta sessão
        await useInteracoesDeBot.getState().usarComando(channelId, comando.commandId, comando.opcoes);
        setDraft("");
        if (chaveRascunho) limparRascunho(chaveRascunho);
      } catch (e) {
        ui.toast(errorMessage(e, "Não foi possível usar o comando"), "error");
      } finally {
        setEnviando(false);
      }
      return;
    }
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
    // com uma lista aberta, as setas, o Enter, o Tab e o Esc pertencem a ela
    if (lista && tamanhoDaLista > 0) {
      // linha desabilitada (`ItemAutocomplete.desabilitado`) não recebe seleção
      const itens = lista === "gatilho" ? sugestoes : lista === "opcao" ? itensDaOpcao : null;
      const selecionavel = itens ? (j: number) => !itens[j]?.desabilitado : undefined;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setSelecionado((i) => mover(i, event.key === "ArrowDown" ? 1 : -1, tamanhoDaLista, selecionavel));
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        const i = Math.min(selecionado, tamanhoDaLista - 1);
        if (lista === "comandos") escolherComando(comandosPlanos[i]);
        else if (lista === "gatilho") {
          if (!sugestoes[i].desabilitado) escolherSugestao(sugestoes[i]);
        } else escolherValorDeOpcao(itensDaOpcao[i]);
        return;
      }
    }
    // o Esc vale também com a lista do bot ainda sem itens (carregando, vazia,
    // falhou) — senão ela só sumiria apagando o que foi digitado
    if (lista && event.key === "Escape") {
      event.preventDefault();
      setFechadaEm(chaveDaLista); // fecha a lista sem mexer no texto
      return;
    }

    // Tab dentro de um comando de bot pula para a próxima opção que ainda não
    // está no campo — obrigatória antes de opcional —, como no Discord
    if (event.key === "Tab" && !event.shiftKey && estado && !estado.comando.nativo) {
      const falta = (o: OpcaoDeComando) => !estado.marcadas.has(o.name.toLowerCase());
      const proxima =
        estado.comando.opcoes.find((o) => o.required && falta(o)) ?? estado.comando.opcoes.find(falta);
      if (proxima) {
        event.preventDefault();
        acrescentar(proxima);
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
    // botão ao lado: no teclado virtual não existe Shift+Enter.
    if (ehMobile && !(event.ctrlKey || event.metaKey)) return;
    // ── e-configuracoes ── quem prefere Ctrl+Enter usa o Enter para quebrar linha
    if (sendMode === "ctrl-enter" && !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    void submit();
  }

  /**
   * Abre (ou fecha) a folha de emoji/GIF/figurinha. **No celular ela começa
   * tirando o foco do campo**: a folha é `60dvh`, e `dvh` com o teclado aberto
   * é a janela encolhida.
   */
  function alternarPainel(destinoDoPainel: PickerTab) {
    if (ehMobile) textareaRef.current?.blur();
    setAberto((a) => (a === destinoDoPainel ? null : destinoDoPainel));
  }

  function inserirTexto(texto: string) {
    const el = textareaRef.current;
    const inicio = el?.selectionStart ?? draft.length;
    const fim = el?.selectionEnd ?? draft.length;
    const proximo = draft.slice(0, inicio) + texto + draft.slice(fim);
    atualizarTexto(proximo, inicio + texto.length);
    setAberto(null);
    focar(inicio + texto.length);
  }

  // "Mencionar" dos menus de contexto: quem menciona não sabe qual composer
  // está montado, então o evento é global e quem está na tela resolve.
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

  // Emoji, GIF, figurinha e anexar pedidos de fora (os atalhos de teclado, ver
  // `lib/eventos-do-composer`). Só o composer principal da conversa atende:
  // - o da thread fica de fora — ele é o único que recebe `draftKey`
  //   (`ThreadPanel.tsx`), e com a thread aberta os dois abririam juntos;
  // - sem permissão de enviar (somente leitura, castigo, regras a aceitar) o
  //   `ChatView` e o `ThreadPanel` montam o aviso no lugar do composer, então
  //   não há quem ouça;
  // - composer montado mas fora da tela (`display:none`) também não atende.
  const atendePainel = !draftKey;
  useEffect(() => {
    if (!atendePainel) return;
    function aoPedirPainel(e: Event) {
      const acao = (e as CustomEvent<DetalhePainelDoComposer>).detail?.acao;
      const campo = textareaRef.current;
      if (!acao || !campo || campo.getClientRects().length === 0) return;
      if (acao === "anexar") {
        if (allowAttachments) fileInputRef.current?.click();
        return;
      }
      alternarPainel(acao);
    }
    window.addEventListener(EVENTO_PAINEL_DO_COMPOSER, aoPedirPainel);
    return () => window.removeEventListener(EVENTO_PAINEL_DO_COMPOSER, aoPedirPainel);
  });

  function adicionarArquivos(files: FileList | File[]) {
    const arquivos = Array.from(files);
    if (arquivos.length === 0) return;
    const espaco = MAX_ATTACHMENTS_PER_MESSAGE - totalAnexos;
    if (espaco <= 0) {
      ui.toast(`Máximo de ${MAX_ATTACHMENTS_PER_MESSAGE} anexos por mensagem.`, "error");
      return;
    }
    const novos: AnexoLocal[] = [];
    for (const file of arquivos.slice(0, espaco)) {
      if (file.size > MAX_ATTACHMENT_SIZE) {
        ui.toast(`${file.name} tem ${formatBytes(file.size)} — o limite é ${formatBytes(MAX_ATTACHMENT_SIZE)}.`, "error");
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

  async function renomearPendente(anexo: AnexoLocal) {
    const nome = await ui.prompt({ title: "Nome do arquivo", initial: anexo.nome, confirmLabel: "Renomear" });
    if (!nome) return;
    setPendentes((prev) => prev.map((a) => (a.id === anexo.id ? { ...a, nome } : a)));
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
      (`capture="environment"`). São inputs separados porque `capture` é lido
      quando o seletor abre, e alternar o atributo do input compartilhado deixava
      a próxima escolha com o modo da anterior em alguns WebViews.
    */
    if (ehMobile) {
      items.push({ label: "Galeria", icon: <ImageIcon size={18} />, onSelect: () => galeriaInputRef.current?.click() });
      items.push({ label: "Tirar foto", icon: <Camera size={18} />, onSelect: () => cameraInputRef.current?.click() });
    }
    items.push({ label: "Enviar arquivo", icon: <Paperclip size={18} />, onSelect: () => fileInputRef.current?.click() });
    if (onCreateThread) {
      items.push({ label: "Criar thread", icon: <MessageSquarePlus size={18} />, onSelect: onCreateThread });
    }
    // "Criar enquete" só entra quando há para onde ir; "Mensagem de voz" e
    // "Criar evento" ainda não aparecem (não há backend para nenhum dos dois)
    if (onCreatePoll) {
      items.push({ label: "Criar enquete", icon: <Vote size={18} />, onSelect: onCreatePoll });
    }
    const r = event.currentTarget.getBoundingClientRect();
    // abre **para cima**, alinhado à borda esquerda do botão
    const altura = items.reduce((h, i) => h + ("separator" in i ? ALTURA_SEPARADOR : ALTURA_ITEM), 0) + 16;
    ui.openContextMenu(r.left, Math.max(8, r.top - 8 - altura), items);
  }

  const Carinha = CARINHAS[carinha];

  /**
   * Arrastar-e-soltar é do computador. No telefone não há de onde arrastar, e um
   * WebView que emitisse `dragover` num gesto de rolagem cobria a conversa com o
   * overlay sem ninguém ter arrastado nada.
   */
  const podeArrastar = allowAttachments && !ehMobile;
  const temAnexos = pendentes.length > 0 || prontos.length > 0;
  const temTexto = draft.trim().length > 0 || temAnexos;

  const botaoMais = <BotaoMais ehMobile={ehMobile} onClick={abrirMenuMais} />;

  function aoEscolherArquivos(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) adicionarArquivos(e.target.files);
    e.target.value = "";
  }

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onDragOver={
        podeArrastar
          ? (e) => {
              e.preventDefault();
              setDragging(true);
            }
          : undefined
      }
      onDragLeave={podeArrastar ? () => setDragging(false) : undefined}
      onDrop={
        podeArrastar
          ? (e) => {
              e.preventDefault();
              setDragging(false);
              if (e.dataTransfer.files.length) adicionarArquivos(e.dataTransfer.files);
            }
          : undefined
      }
      // `px-2.5`: a caixa a 10px das bordas da coluna (print 1:1 `180835.png`,
      // x 385 numa coluna que começa em 375 e 1640 numa que acaba em 1650)
      className={`relative shrink-0 ${ehMobile ? "px-3 pb-1" : "px-2.5"}`}
    >
      {dragging && <OverlayArrastar alvo={formRef.current} destino={destino} />}

      {/* a aba do modo lento divide o espaço acima da caixa com as listas e a
          barra do comando; enquanto elas estão abertas, a aba sai */}
      {modoLento && !lista && !estado && (
        <AvisoDeModoLento segundos={modoLento.segundos} restante={modoLento.restante} bloqueado={modoLento.bloqueado} />
      )}

      <div className={ehMobile ? "flex items-end gap-2" : ""}>
        {ehMobile && allowAttachments && botaoMais}
        {/* Cápsula de 40pt no celular (raio 20, sem borda, margens de 12 —
            `discord-mobile-chat-canal-2024.png`). No desktop, a caixa medida
            descrita no cabeçalho do componente. */}
        <div
          className={
            ehMobile
              ? "min-w-0 flex-1 rounded-[20px] bg-chat-background-default"
              : "rounded-lg border border-border-subtle bg-chat-background-default [.barra-empilhada~*_&]:rounded-t-none"
          }
        >
          {temAnexos && (
            <AreaDeAnexos
              pendentes={pendentes}
              prontos={prontos}
              compacto={ehMobile}
              onRemoverPendente={removerPendente}
              onRenomear={(anexo) => void renomearPendente(anexo)}
              onSpoiler={(id) =>
                setPendentes((prev) => prev.map((a) => (a.id === id ? { ...a, spoiler: !a.spoiler } : a)))
              }
              onRemoverPronto={(id) => setProntos((prev) => prev.filter((x) => x.id !== id))}
            />
          )}

          <div className={`relative flex items-start ${!ehMobile && mostrarContador ? "min-h-[88px]" : ""}`}>
            {allowAttachments ? (
              <>
                <input ref={fileInputRef} type="file" multiple hidden onChange={aoEscolherArquivos} />
                {/* Os dois caminhos de imagem do celular. Montados aqui (e não
                    ao lado do "+", que no telefone mora fora da cápsula) porque
                    quem os aciona é o menu do "+", pela `ref`. */}
                {ehMobile && (
                  <>
                    <input
                      ref={galeriaInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      hidden
                      onChange={aoEscolherArquivos}
                    />
                    {/* sem `multiple`: uma foto por vez é o que a câmera devolve */}
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      hidden
                      onChange={aoEscolherArquivos}
                    />
                  </>
                )}
                {!ehMobile && botaoMais}
              </>
            ) : (
              // sem o "+": `.sansAttachButton__74017{padding-inline-start:
              // calc(var(--space-16) - 1px)}` = 15. No celular o "+" já está fora.
              !ehMobile && <span className="w-[15px] shrink-0" aria-hidden="true" />
            )}

            <textarea
              ref={textareaRef}
              /* o Discord não marca o composer em foco — ver o cabeçalho */
              data-sem-anel
              rows={1}
              value={draft}
              maxLength={MAX_MESSAGE_LENGTH}
              onChange={(e) => atualizarTexto(e.target.value, e.target.selectionStart)}
              onKeyUp={(e) => setCaret(e.currentTarget.selectionStart)}
              onClick={(e) => setCaret(e.currentTarget.selectionStart)}
              onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              aria-label={ariaLabel}
              // `aria-autocomplete` vale para textbox; quem anuncia a lista é o
              // próprio popup, que é um `listbox` rotulado
              aria-autocomplete="list"
              aria-busy={enviando || undefined}
              placeholder={placeholder}
              // `.textArea__74017`: 16px, entrelinha 22, `--text-default`,
              // placeholder `--text-muted`, `padding-inline: 0 10px`
              className={`min-w-0 flex-1 resize-none bg-transparent text-[1rem] leading-[1.375rem] text-text-default outline-none placeholder:text-text-muted ${
                ehMobile ? "min-h-[40px] py-[9px] pl-4" : "min-h-[56px] py-[17px] pr-2.5"
              }`}
            />

            {/* `.buttons__74017{display:flex;gap:var(--space-8);height:56px;
                position:sticky;top:0}`. O recuo da direita sai do print: o
                centro do último ícone está a 27,5px da borda externa da caixa
                (1612,5 contra 1640) → 11px de folga dentro da borda. */}
            <div
              className={
                ehMobile ? "flex items-center pr-2" : "sticky top-0 flex h-[56px] shrink-0 items-center gap-2 pr-[11px]"
              }
            >
              {/* Ordem do Discord, os cinco: presente → GIF → figurinha → emoji
                  → apps. No celular a fileira não cabe inteira e presente,
                  figurinha e apps são os que saem. */}
              {!ehMobile && <BotaoLateral rotulo="Presente" icone={<Gift size={20} />} emBreve />}
              <BotaoLateral
                rotulo="GIF"
                baixo={ehMobile}
                aberto={aberto === "gif"}
                onClick={() => alternarPainel("gif")}
                // o ativo do Discord, não `<span>GIF</span>` com borda: texto
                // muda de peso com a fonte do sistema e nunca casa com os vizinhos
                icone={<Gif size={20} />}
              />
              {!ehMobile && (
                <BotaoLateral
                  rotulo="Figurinha"
                  aberto={aberto === "figurinha"}
                  onClick={() => alternarPainel("figurinha")}
                  icone={<StickerIcon size={20} />}
                />
              )}
              <BotaoLateral
                rotulo="Emoji"
                baixo={ehMobile}
                aberto={aberto === "emoji"}
                onClick={() => alternarPainel("emoji")}
                // o ícone troca de carinha a cada passada do mouse, como no Discord
                onMouseEnter={() => setCarinha((c) => (c + 1) % CARINHAS.length)}
                // 16: a carinha tem 16px de tinta no print (x 1564–1579 na
                // linha do centro, y=992); com 18 a nossa media 18 (1568–1585)
                //
                // `pointer-events-none` no invólucro: cada carinha é um `<svg>`
                // novo, e com o ponteiro caindo nele a troca do `onMouseEnter`
                // arrancava do DOM o nó do `mousedown` antes do `mouseup` — o
                // navegador então não dispara `click`, e o seletor não abria
                // (reproduzido na bancada em 2026-09-14: `click()` por JS abria,
                // o clique do mouse parado sobre o botão não)
                icone={
                  <span className="pointer-events-none grid place-items-center">
                    <Carinha size={16} />
                  </span>
                }
              />
              {!ehMobile && <BotaoLateral rotulo="Apps" icone={<Apps size={20} />} emBreve />}
              {ehMobile && temTexto && <BotaoEnviar ocupado={enviando} />}
            </div>

            {mostrarContador && (
              <span
                aria-live="polite"
                className={`pointer-events-none absolute bottom-3 right-[14px] font-mono text-text-xs tabular-nums ${
                  restante <= 0 ? "text-text-feedback-critical" : "text-text-muted"
                }`}
              >
                {restante}
              </span>
            )}
          </div>
        </div>
      </div>

      {lista === "comandos" && (
        <SeletorDeComandos
          grupos={grupos}
          selecionado={selecionado}
          onEscolher={escolherComando}
          onPassarMouse={setSelecionado}
        />
      )}

      {lista === "gatilho" && gatilho && (
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

      {estado && lista !== "comandos" && lista !== "gatilho" && (
        <BarraDoComando estado={estado} opcaoComErro={opcaoComErro} onAcrescentarOpcao={acrescentar}>
          {lista === "opcao" && estado.ativa && (
            <Autocomplete
              titulo={`Valores para ${estado.ativa.name}`}
              itens={itensDaOpcao}
              selecionado={selecionado}
              onEscolher={escolherValorDeOpcao}
              onPassarMouse={setSelecionado}
              carregando={listaDoBot === "carregando"}
              erro={listaDoBot === "falhou" ? TEXTO_FALHOU_AUTOCOMPLETE : undefined}
              mensagemVazia={opcaoDoBot ? TEXTO_VAZIO_AUTOCOMPLETE : undefined}
            />
          )}
        </BarraDoComando>
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
    </form>
  );
}
