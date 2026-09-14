"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent,
} from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Link2,
  SmilePlus,
  X,
} from "@/components/ui/icones";
import { Permission, displayNameOf, type PublicUser } from "@streamz/shared";
import { BotaoDeIcone, Tooltip } from "@/components/ui/primitivos";
import Avatar from "@/components/ui/Avatar";
import EmojiPicker from "@/components/ui/EmojiPicker";
import PainelFlutuante from "@/components/chat/PainelFlutuante";
import TooltipReacao from "@/components/chat/TooltipReacao";
import { EmojiDaReacao, rotuloDaReacao } from "@/components/chat/EmojiDeReacao";
import { registrarUsoDeReacao } from "@/components/chat/reacoes-rapidas";
import { itensDaImagem } from "@/components/media/menu-da-imagem";
import {
  abrirImagemNoNavegador,
  copiarImagem,
  copiarLinkDaImagem,
  salvarImagem,
} from "@/lib/imagem-arquivo";
import { useAuth } from "@/stores/auth";
import { useMessages } from "@/stores/messages";
import { useCan } from "@/stores/permissions";
import { alturaDoChipDeReacao, useSettings } from "@/stores/settings";
import { anchorOf, ui, useUI, type Anchor } from "@/stores/ui";
import { useEhMobile } from "@/hooks/useEhMobile";
import { useVoltarNoCelular } from "@/hooks/useVoltarNoCelular";

/** Limites do zoom por rolagem, em múltiplos do tamanho ajustado à tela. */
const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
/** Quanto o dedo precisa correr para trocar de imagem. */
const LIMIAR_DE_TROCA = 60;
/** Quanto o dedo precisa descer para fechar. */
const LIMIAR_DE_FECHO = 110;

/**
 * "01/11/2022, 14:04" — data completa do cabeçalho do autor, medida no print
 * `2026-08-31 120919.png` (canto superior esquerdo do visualizador, avatar +
 * "Md" + esta data). Formato próprio porque é diferente dos de
 * `lib/format.ts`: aquele arquivo não é desta lista de cartão, e nenhuma das
 * suas funções produz "dd/mm/aaaa **vírgula** hh:mm" (a mais próxima,
 * `horaCompleta`, vira "Hoje às…" para o dia de hoje — o cabeçalho da foto
 * mostra sempre a data absoluta, como no print).
 */
const FORMATO_DATA_CABECALHO = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Lightbox de imagem.
 *
 * Recebe a lista inteira de imagens (a mensagem toda, ou a galeria do canal) e
 * o índice de onde abrir: é o que permite ← → passarem de uma para a outra sem
 * fechar e reabrir — como no visualizador do Discord. Com uma imagem só, as
 * setas simplesmente não aparecem.
 *
 * O fundo é quase opaco (não o `black/85` dos modais): aqui a interface atrás
 * não é contexto, é distração. O zoom é por rolagem e por clique, **sem**
 * mostrar a porcentagem — o Discord não tem essa barra.
 *
 * ## A barra de ações
 *
 * Medida no print `2026-08-31 120919.png` (visualizador do Discord aberto,
 * janela de 1919 de largura), **remedida** nesta rodada de correção com
 * `medir.py` direto sobre o mesmo arquivo (`coluna`/`linha`, x=1715..1770,
 * y=20..90): a barra é uma **pílula de 148×40 e raio 8** encostada no alto à
 * direita (borda a borda: x 1696..1843, y 37..76 — os 40px batem com a régua
 * antiga; a rodada de divergências media 34/38, número que esta remedição não
 * reproduziu, então fica a medida nova, tirada agora e à vista no comentário),
 * com quatro botões lado a lado — centros em x=1715, 1752, 1787 e 1823, ou
 * seja um passo de ~36px — e o ícone dentro medindo 13 a 14px de tinta, em
 * `#9d9ea5`. Ao lado dela, separado por 12px, o **X sozinho num quadrado de 40
 * (x 1856..1895) com o mesmo raio 8**, a 24px da borda direita da janela. O
 * fundo da pílula e do X é **`#1E1F22`** (preenchimento sólido entre as duas
 * bordas de 1px, tanto na linha quanto na coluna medidas) — é o
 * `--primary-700` de `tokens.css:1313`; a versão anterior usava
 * `bg-background-base-lower` (`#1a1a1e`) como aproximação por não termos
 * conferido que o nome exato já existe gerado. A borda (`#313237` no print)
 * continua `border-border-subtle`, que sobre este fundo resolve bem perto
 * disso (blend de `#94949c` a 12% sobre `#1e1f22` ≈ `#2c2d31`, dentro da
 * franja de antisserrilhado do print). A cor do ícone (`#9d9ea5`) não tem
 * token com esse nome semântico — só `--icon-status-offline`/
 * `--text-status-offline`, que por acaso resolvem o mesmo hex mas mentiriam
 * sobre o que representam — então o ícone continua na tinta que o primitivo
 * já usa (`--interactive-text-default`, `#abacb2`, 16 de distância em R):
 * divergência registrada, não escondida atrás de um nome errado.
 *
 * As **ações** não são as mesmas do Discord (lá a pílula tem zoom, encaminhar,
 * abrir e "…", com copiar e salvar escondidos dentro do "…"): aqui as cinco
 * que o usuário pediu ficam à vista, porque é justamente o que faltava.
 *
 * ## O cabeçalho do autor
 *
 * Canto superior esquerdo, sobre o véu: avatar de 40 (`Avatar size="lg"`,
 * mesmo tamanho do avatar de mensagem) + nome em negrito + data completa
 * embaixo — medido no mesmo print (avatar em x≈20–61 y≈33–76; "Md" e
 * "01/11/2022, 14:04" começam em x≈77, uma linha por cima da outra). Só
 * aparece quando a imagem pertence a uma mensagem (mesma regra de `messageId`
 * que decide a fileira de reações, abaixo) — sem mensagem não há autor nem
 * data para mostrar, e inventar um seria pior que omitir. Não medido no
 * celular: nenhum print de referência mostra o visualizador em 390px, então o
 * celular fica sem este bloco (ver "não verificado" da entrega).
 *
 * ## Reagir
 *
 * Reagir é sobre a **mensagem** da imagem, não sobre o arquivo; por isso o
 * modal recebe `messageId` e fala com `stores/messages`. Sem ele (galeria do
 * canal, prévia de link solta) o botão de reação e a fileira de reações não
 * aparecem — não há a que reagir. **Estado "sem permissão":** com mensagem de
 * servidor, o botão de reagir (o da pílula e o do menu de contexto) some
 * quando o cargo não tem `ADD_REACTIONS` no canal (`useCan`, a mesma conta de
 * `MessageItem.tsx`) — escondido, não desabilitado, porque é a convenção que
 * o resto do app já usa para esta mesma permissão (`podeReagir` em
 * `MessageItem.tsx`), e o Discord também simplesmente não desenha o botão
 * para quem não pode.
 *
 * ## Carregando, erro e vazio
 *
 * A imagem grande não tinha nenhum tratamento de carga: sem isso o buraco
 * branco do navegador aparece por um instante (ou pior, indefinidamente numa
 * URL quebrada) sem seguir nem o acervo de ícones nem o vocabulário de cor —
 * o mesmo raciocínio do "erro" de `components/media/StickerView.tsx`, cujo
 * padrão (girador enquanto carrega, cartão com ícone quando falha) é o que
 * este componente reaproveita. Não é medido em nenhum print — é estado de
 * falha, não tela do Discord. Com a imagem em erro, "Copiar imagem" e
 * "Salvar imagem" ficam **desabilitados** (não há bytes válidos para copiar
 * ou salvar) tanto na pílula quanto no menu de contexto; "Copiar link" e
 * "Abrir no navegador" continuam ativos, porque não dependem do `<img>` ter
 * decodificado nada. Com a lista de imagens vazia (`urls.length === 0`, que
 * não deveria acontecer, mas o modal não confiava nisso: antes disso
 * retornava `null` e sumia sem fechar nem avisar nada) o modal mostra um
 * aviso em vez de desaparecer — continua fechável pelo X e pelo Esc.
 */
export default function ImageModal({
  urls,
  alts,
  indice,
  messageId,
}: {
  urls: string[];
  alts: string[];
  indice: number;
  /** mensagem dona da imagem, quando há uma: é o que habilita reagir. */
  messageId?: string;
}) {
  const closeModal = useUI((s) => s.closeModal);
  const [i, setI] = useState(Math.min(Math.max(indice, 0), Math.max(urls.length - 1, 0)));
  const [zoom, setZoom] = useState(ZOOM_MIN);
  const [picker, setPicker] = useState<Anchor | null>(null);
  // estado da imagem grande (desktop): reseta a cada troca de foto pela
  // dependência em `url` — ver o "carregando, erro e vazio" no cabeçalho.
  const [estadoImagem, setEstadoImagem] = useState<"carregando" | "carregada" | "erro">(
    "carregando",
  );
  const ehMobile = useEhMobile();

  useVoltarNoCelular(ehMobile, closeModal);

  const eu = useAuth((s) => s.user);
  const meuId = eu?.id;
  const tamanhoEmoji = useSettings((s) => s.emojiSize);
  const toggleReaction = useMessages((s) => s.toggleReaction);
  // a mensagem vem da store para as reações acompanharem quem reage enquanto o
  // visualizador está aberto; `find` devolve a mesma referência enquanto a
  // lista do canal não muda, então isto não re-renderiza à toa
  const mensagem = useMessages((s) => {
    if (!messageId) return null;
    const doCanal = s.activeChannelId ? s.byChannel[s.activeChannelId]?.items : undefined;
    return (
      doCanal?.find((m) => m.id === messageId) ??
      s.threadItems.find((m) => m.id === messageId) ??
      null
    );
  });

  const total = urls.length;
  const url = urls[i];
  const alt = alts[i] ?? "Imagem";
  const reacoes = mensagem?.reactions ?? [];

  // "sem permissão": em canal de servidor, reagir exige ADD_REACTIONS — a
  // mesma conta de `podeReagir` em `MessageItem.tsx` (§ "Reagir" do
  // cabeçalho). Em DM (`guildId` nulo) não há cargo para checar, então libera.
  const podeReagirNoCanal = useCan(Permission.ADD_REACTIONS, mensagem?.channelId);
  const emServidor = mensagem !== null && mensagem.guildId !== null;
  const podeReagir = Boolean(messageId) && (!emServidor || podeReagirNoCanal);

  // quem reagiu, para o tooltip do chip: o autor da mensagem e eu bastam aqui
  // — o visualizador não tem a lista de membros do servidor à mão, e o
  // tooltip já sabe cair em "e mais N" para quem ele não conhece
  const conhecidos = useMemo(() => {
    const map = new Map<string, PublicUser>();
    if (mensagem) map.set(mensagem.author.id, mensagem.author);
    if (eu) map.set(eu.id, eu);
    return map;
  }, [mensagem, eu]);

  // reseta o carregando/erro a cada foto — key={url} já faz isso no
  // `VisorTatil` do celular (ele remonta), mas a imagem grande do desktop é
  // o mesmo `<img>` reaproveitado entre trocas.
  useEffect(() => {
    setEstadoImagem("carregando");
  }, [url]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // o menu de contexto fecha sozinho com Esc; se o modal fechasse junto,
        // um Esc levaria os dois de uma vez
        if (useUI.getState().contextMenu) return;
        if (picker) return setPicker(null);
        return closeModal();
      }
      if (e.key === "ArrowRight" && total > 1) {
        setI((v) => (v + 1) % total);
        setZoom(ZOOM_MIN);
      }
      if (e.key === "ArrowLeft" && total > 1) {
        setI((v) => (v - 1 + total) % total);
        setZoom(ZOOM_MIN);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeModal, total, picker]);

  // "vazio": lista sem imagem nenhuma. Não deveria acontecer (quem abre o
  // modal sempre manda pelo menos uma URL), mas o modal não confiava nisso —
  // `if (!url) return null` fazia ele sumir sem véu, sem X e sem aviso, só
  // deixando o Esc (o listener acima já estava de pé) para quem soubesse que
  // havia algo para fechar. Agora mostra o aviso e continua fechável.
  const vazio = !url;

  function rolar(e: WheelEvent<HTMLDivElement>) {
    setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z - e.deltaY / 500)));
  }

  function reagir(emoji: string) {
    if (!messageId) return;
    registrarUsoDeReacao(emoji);
    toggleReaction(messageId, emoji, meuId);
  }

  function abrirSeletor(e: MouseEvent<HTMLElement>) {
    setPicker(anchorOf(e.currentTarget));
  }

  /**
   * Botão direito sobre a imagem. No app de desktop o menu nativo do WebView2
   * está bloqueado (#138), então sem este `preventDefault` mais o menu do app
   * o clique direito não faria nada lá.
   */
  function abrirMenu(e: MouseEvent) {
    if (!url) return; // sem imagem (vazio) não há o que o menu ofereça
    e.preventDefault();
    e.stopPropagation();
    const ancora: Anchor = { x: e.clientX, y: e.clientY, width: 0, height: 0 };
    ui.openContextMenu(
      e.clientX,
      e.clientY,
      itensDaImagem({
        url,
        alt,
        onReagir: podeReagir ? () => setPicker(ancora) : undefined,
        indisponivel: estadoImagem === "erro",
      }),
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      // z-[110]: mais alto que qualquer sobreposição do resto do app (o teto
      // hoje é o z-[100] da dica de reação, `TooltipReacao.tsx`) — era z-50,
      // o mesmo nível de popout/tooltip/modal comuns, e uma dica de reação
      // deixada aberta na mensagem por baixo (o `fixed z-[100]` dela não some
      // sozinho se o ponteiro não sai de cima) pintava por cima do véu. O
      // visualizador é a peça mais "em cima" que existe no app — nada deveria
      // empilhar acima dele — por isso ganha o teto, e não só um degrau.
      className={`fixed inset-0 z-[110] grid anim-overlay ${
        ehMobile
          ? "grid-rows-1 bg-mobile-background-scrim-opaque"
          : "place-items-center bg-background-scrim-lightbox"
      }`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      {/*
        topo: autor à esquerda, contador + pílula de ações + X à direita,
        todos colados na borda — medidas do print no comentário do componente.
        `justify-between` com os dois grupos sempre presentes (mesmo vazios)
        garante que o grupo da direita não recentralize quando não há autor.

        No celular a pílula sai do topo e vai para o **rodapé**, acima da área
        segura: cinco alvos de 44px não cabem numa linha de 390 ao lado do
        contador e do X, e no alto ficam justamente onde o polegar não chega.
        O cabeçalho do autor também não entra no celular — não medido lá.
      */}
      <div
        className={`absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 ${
          ehMobile ? "px-2 pt-[calc(env(safe-area-inset-top)+4px)]" : "p-4"
        }`}
      >
        <div className="flex min-w-0 items-center gap-3">
          {!ehMobile && mensagem && (
            <>
              <Avatar user={mensagem.author} size="lg" />
              <div className="flex min-w-0 flex-col leading-tight">
                {/* sem classe de tamanho: 16px (a base do corpo), igual ao nome
                    de autor em `MessageItem.tsx` (cozy) — não medi o glifo do
                    "Md" no print a ponto de escolher entre 14/16, então reuso
                    a mesma convenção de username já estabelecida em vez de
                    inventar um tamanho novo. */}
                <span className="truncate font-semibold text-text-overlay-light">
                  {displayNameOf(mensagem.author)}
                </span>
                {/* data: mesma dupla tamanho/peso do timestamp de
                    `MessageItem.tsx` (`text-xs font-medium`). */}
                <span className="truncate text-text-xs font-medium text-text-overlay-light/70">
                  {FORMATO_DATA_CABECALHO.format(new Date(mensagem.createdAt))}
                </span>
              </div>
            </>
          )}
          {ehMobile && total > 1 && (
            <span aria-live="polite" className="pl-3 text-sm font-medium text-text-overlay-light/70">
              {i + 1} de {total}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {!ehMobile && total > 1 && (
            <span aria-live="polite" className="mr-1 text-sm font-medium text-text-overlay-light/70">
              {i + 1} de {total}
            </span>
          )}

          {!ehMobile && !vazio && (
            <div className="flex h-[40px] items-center rounded-lg border border-border-subtle bg-primary-700">
              <BarraDeAcoes
                url={url}
                alt={alt}
                podeReagir={podeReagir}
                comErro={estadoImagem === "erro"}
                onReagir={abrirSeletor}
                tamanho={36}
              />
            </div>
          )}

          <BotaoDeIcone
            rotulo="Fechar"
            icone={<X size={24} />}
            tamanho="lg"
            comFundo
            onClick={closeModal}
            // pílula própria (fundo + borda sempre visível), diferente do ícone
            // "flutuante" padrão do primitivo — a caixa é a medida no print
            // (40 no desktop, 44 de alvo de toque no celular), fundo
            // `primary-700` (`#1e1f22`, ver o cabeçalho do componente).
            style={{ height: ehMobile ? 44 : 40, width: ehMobile ? 44 : 40 }}
            className="border border-border-subtle bg-primary-700"
          />
        </div>
      </div>

      {total > 1 && (
        <>
          <Seta
            lado="esquerda"
            grande={ehMobile}
            onClick={() => {
              setI((v) => (v - 1 + total) % total);
              setZoom(ZOOM_MIN);
            }}
          />
          <Seta
            lado="direita"
            grande={ehMobile}
            onClick={() => {
              setI((v) => (v + 1) % total);
              setZoom(ZOOM_MIN);
            }}
          />
        </>
      )}

      {ehMobile && !vazio && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2 px-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
          {messageId && reacoes.length > 0 && (
            <div className="flex max-w-full flex-wrap justify-center gap-1">
              {reacoes.map((r) => {
                const minha = meuId ? r.userIds.includes(meuId) : false;
                return (
                  <button
                    key={r.emoji}
                    type="button"
                    aria-pressed={minha}
                    aria-label={`${rotuloDaReacao(r.emoji)}, ${r.count} ${
                      r.count === 1 ? "reação" : "reações"
                    }`}
                    onClick={() => reagir(r.emoji)}
                    style={{ height: alturaDoChipDeReacao(tamanhoEmoji) }}
                    className={`flex items-center gap-1.5 rounded-lg border px-1.5 ${
                      minha
                        ? "border-brand-500 bg-brand-500/20 text-text-strong"
                        : "border-transparent bg-background-base-lowest text-text-default"
                    }`}
                  >
                    <EmojiDaReacao emoji={r.emoji} tamanho={tamanhoEmoji} />
                    <span className="text-sm font-semibold leading-none">{r.count}</span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex items-center rounded-2xl border border-border-subtle bg-primary-700/95 px-1">
            <BarraDeAcoes
              url={url}
              alt={alt}
              podeReagir={podeReagir}
              comErro={estadoImagem === "erro"}
              onReagir={abrirSeletor}
              tamanho={44}
            />
          </div>
        </div>
      )}

      {vazio ? (
        // "vazio": sem imagem nenhuma na lista — ver o comentário de `vazio`
        // acima. Cartão simples, no vocabulário de `StickerView.tsx` (o outro
        // estado de falha do app que não é tela do Discord, então não é
        // medido em print nenhum). `m-auto`, e não só o `place-items-center`
        // do container: no celular a raiz é `grid-rows-1` sem centralização
        // nenhuma (o `VisorTatil` se posiciona sozinho com `absolute inset-0`
        // nesse caso) — a margem automática centraliza nas duas grades, com
        // ou sem `place-items-center` no pai.
        <div
          role="status"
          className="m-auto flex flex-col items-center gap-2 rounded-lg border border-border-subtle bg-background-base-lower px-6 py-5 text-text-muted"
        >
          <AlertTriangle size={32} aria-hidden="true" />
          <p className="text-text-sm">Nenhuma imagem para mostrar.</p>
        </div>
      ) : ehMobile ? (
        <VisorTatil
          key={url}
          url={url}
          alt={alt}
          podeTrocar={total > 1}
          onAnterior={() => {
            setI((v) => (v - 1 + total) % total);
            setZoom(ZOOM_MIN);
          }}
          onProxima={() => {
            setI((v) => (v + 1) % total);
            setZoom(ZOOM_MIN);
          }}
          onFechar={closeModal}
          onMenu={abrirMenu}
        />
      ) : (
        <div className="flex max-h-full flex-col items-start gap-2 anim-modal">
          <div
            className="relative flex max-h-[80vh] min-h-[120px] max-w-[85vw] min-w-[120px] items-center justify-center overflow-auto"
            onWheel={rolar}
          >
            {estadoImagem !== "erro" && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={url}
                alt={alt}
                onClick={() => setZoom((z) => (z > ZOOM_MIN ? ZOOM_MIN : 2))}
                onContextMenu={abrirMenu}
                onLoad={() => setEstadoImagem("carregada")}
                onError={() => setEstadoImagem("erro")}
                style={{ transform: `scale(${zoom})`, transformOrigin: "center top" }}
                className={`max-h-[80vh] max-w-[85vw] rounded object-contain transition ${
                  zoom > ZOOM_MIN ? "cursor-zoom-out" : "cursor-zoom-in"
                } ${estadoImagem === "carregada" ? "opacity-100" : "opacity-0"}`}
              />
            )}

            {/* "carregando": mesmo girador de `MessageList.tsx`/`QuickSwitcher.
                tsx`, na tinta clara sobre véu (`text-overlay-light`) em vez de
                `text-muted` — aqui não há superfície embaixo, só o véu. */}
            {estadoImagem === "carregando" && (
              // sem `absolute`: fora do fluxo ele ignoraria o `items-center
              // justify-center` do container (que só centraliza filhos no
              // fluxo) e caía no canto. Como só um destes três (img, girador,
              // cartão de erro) importa por vez, deixar todos no fluxo é o
              // que os centraliza de verdade.
              <span
                role="status"
                aria-label="Carregando imagem"
                className="h-8 w-8 animate-spin rounded-full border-2 border-text-overlay-light/30 border-t-text-overlay-light"
              />
            )}

            {/* "erro": mesmo cartão de `StickerView.tsx` — não vaza o ícone de
                imagem quebrada cru do navegador. */}
            {estadoImagem === "erro" && (
              <div
                role="alert"
                className="flex flex-col items-center gap-2 rounded-lg border border-border-subtle bg-background-base-lower px-6 py-5 text-text-muted"
              >
                <AlertTriangle size={32} aria-hidden="true" />
                <p className="text-text-sm">Não foi possível carregar esta imagem.</p>
              </div>
            )}
          </div>

          {/*
            As reações da mensagem, embaixo da imagem e clicáveis: quem abriu a
            foto em tela cheia é justamente quem quer reagir a ela, e voltar
            para a conversa só para clicar num chip era o caminho todo de volta.
          */}
          {messageId && reacoes.length > 0 && (
            <div className="flex max-w-[85vw] flex-wrap gap-1">
              {reacoes.map((r) => {
              const minha = meuId ? r.userIds.includes(meuId) : false;
              return (
                <TooltipReacao
                  key={r.emoji}
                  emoji={r.emoji}
                  userIds={r.userIds}
                  conhecidos={conhecidos}
                >
                  <button
                    type="button"
                    aria-pressed={minha}
                    aria-label={`${rotuloDaReacao(r.emoji)}, ${r.count} ${
                      r.count === 1 ? "reação" : "reações"
                    }`}
                    onClick={() => reagir(r.emoji)}
                    style={{ height: alturaDoChipDeReacao(tamanhoEmoji) }}
                    className={`flex items-center gap-1.5 rounded-lg border px-1.5 transition ${
                      minha
                        ? "border-brand-500 bg-brand-500/20 text-text-strong"
                        : "border-transparent bg-background-base-lowest text-text-default hover:border-border-normal"
                    }`}
                  >
                    <EmojiDaReacao emoji={r.emoji} tamanho={tamanhoEmoji} />
                    <span className="text-sm font-semibold leading-none">{r.count}</span>
                  </button>
                </TooltipReacao>
              );
            })}
            </div>
          )}
        </div>
      )}

      {picker && (
        <PainelFlutuante ancora={picker} onClose={() => setPicker(null)}>
          <EmojiPicker
            placeholder="Encontre a reação perfeita"
            onClose={() => setPicker(null)}
            onPick={(texto) => {
              reagir(texto);
              setPicker(null);
            }}
          />
        </PainelFlutuante>
      )}
    </div>
  );
}

/** As cinco ações da pílula — as mesmas no topo do desktop e no rodapé do celular. */
function BarraDeAcoes({
  url,
  alt,
  podeReagir,
  comErro,
  onReagir,
  tamanho,
}: {
  url: string;
  alt: string;
  /** já resolvido pelo chamador: tem mensagem **e** ADD_REACTIONS no canal. */
  podeReagir: boolean;
  /** imagem em erro (ver "carregando, erro e vazio" no cabeçalho): desabilita
   *  copiar/salvar, que dependem dos bytes decodificados. */
  comErro: boolean;
  onReagir: (e: MouseEvent<HTMLElement>) => void;
  /** 36 no desktop (medido no print), 44 no celular (alvo de toque). */
  tamanho: 36 | 44;
}) {
  return (
    <>
      {podeReagir && (
        <BotaoDaBarra label="Reagir" tamanho={tamanho} onClick={onReagir}>
          <SmilePlus size={20} />
        </BotaoDaBarra>
      )}
      <BotaoDaBarra
        label="Copiar imagem"
        tamanho={tamanho}
        onClick={() => void copiarImagem(url)}
        desabilitado={comErro}
        motivoDesabilitado="Esta imagem não carregou"
      >
        <Copy size={20} />
      </BotaoDaBarra>
      <BotaoDaBarra
        label="Salvar imagem"
        tamanho={tamanho}
        onClick={() => void salvarImagem(url, alt)}
        desabilitado={comErro}
        motivoDesabilitado="Esta imagem não carregou"
      >
        <Download size={20} />
      </BotaoDaBarra>
      <BotaoDaBarra label="Copiar link" tamanho={tamanho} onClick={() => copiarLinkDaImagem(url)}>
        <Link2 size={20} />
      </BotaoDaBarra>
      <BotaoDaBarra
        label="Abrir no navegador"
        tamanho={tamanho}
        onClick={() => void abrirImagemNoNavegador(url)}
      >
        <ExternalLink size={20} />
      </BotaoDaBarra>
    </>
  );
}

/**
 * Um botão da pílula: 36×36 com o ícone de 20, o passo medido no print (uma
 * pílula de 40 de altura com 2px de folga em volta dos botões). No celular o
 * mesmo botão vai a 44, que é o alvo de toque do leiaute móvel.
 */
function BotaoDaBarra({
  label,
  onClick,
  tamanho = 36,
  desabilitado,
  motivoDesabilitado,
  children,
}: {
  label: string;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  tamanho?: 36 | 44;
  /** estado "desabilitado" (ver o cabeçalho do componente): cinza, sem
   *  clique, dica continua explicando por quê — comportamento do próprio
   *  primitivo (`BotaoDeIcone`, item 8 do cabeçalho dele). */
  desabilitado?: boolean;
  motivoDesabilitado?: string;
  children: ReactNode;
}) {
  return (
    <BotaoDeIcone
      rotulo={label}
      icone={children}
      comFundo
      onClick={onClick}
      desabilitado={desabilitado}
      motivoDesabilitado={motivoDesabilitado}
      // 36/44 medidos (ver o comentário do componente) não batem com nenhum
      // dos tamanhos padrão do primitivo (24/32/40): a caixa vem por style.
      style={{ height: tamanho, width: tamanho }}
    />
  );
}

function Seta({
  lado,
  grande = false,
  onClick,
}: {
  lado: "esquerda" | "direita";
  /** no celular a seta ganha alvo e um disco atrás: o dedo não mira em 40px de glifo solto. */
  grande?: boolean;
  onClick: () => void;
}) {
  const label = lado === "esquerda" ? "Imagem anterior" : "Próxima imagem";
  return (
    <Tooltip rotulo={label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={`absolute top-1/2 z-20 grid -translate-y-1/2 place-items-center transition ${
          grande
            ? "h-[48px] w-[48px] rounded-full bg-control-overlay-secondary-background-default text-control-overlay-secondary-icon-default active:bg-control-overlay-secondary-background-active"
            : "h-16 w-16 text-icon-overlay-light/60 hover:text-icon-overlay-light"
        } ${lado === "esquerda" ? (grande ? "left-2" : "left-0") : grande ? "right-2" : "right-0"}`}
      >
        {lado === "esquerda" ? (
          <ChevronLeft size={grande ? 32 : 40} />
        ) : (
          <ChevronRight size={grande ? 32 : 40} />
        )}
      </button>
    </Tooltip>
  );
}

/** Estado do gesto: quanto a imagem está ampliada e para onde foi arrastada. */
interface Transformacao {
  escala: number;
  x: number;
  y: number;
}

const PARADA: Transformacao = { escala: 1, x: 0, y: 0 };

/**
 * A imagem em tela cheia do celular, com **pinça, arrasto e os dois gestos de
 * saída**: puxar para baixo fecha, correr para o lado troca de imagem.
 *
 * ## Por que os gestos são nossos, e não do navegador
 *
 * O app **não** trava o zoom da página (`app/layout.tsx` explica por quê), então
 * a pinça nativa existe — só que ela amplia a *página*, e uma sobreposição
 * `fixed` ampliada arrasta junto o cabeçalho, a pílula de ações e o X. O que se
 * espera de um visualizador de foto é ampliar **a foto**. Por isso a área da
 * imagem declara `touch-action: none` e os três gestos são interpretados aqui:
 * o `touch-action` continua livre em todo o resto do app, inclusive na barra de
 * ações desta mesma tela.
 *
 * A conta é a de sempre num visualizador: com dois dedos, a razão entre a
 * distância atual e a inicial é a escala, e o ponto médio entre eles é o que
 * fica parado embaixo dos dedos. Com um dedo, ampliado, arrasta-se a imagem;
 * sem ampliação, o eixo que domina decide se é troca (horizontal) ou saída
 * (vertical para baixo) — nunca os dois ao mesmo tempo, que é o que faz um
 * carrossel parecer escorregadio.
 */
function VisorTatil({
  url,
  alt,
  podeTrocar,
  onAnterior,
  onProxima,
  onFechar,
  onMenu,
}: {
  url: string;
  alt: string;
  podeTrocar: boolean;
  onAnterior: () => void;
  onProxima: () => void;
  onFechar: () => void;
  onMenu: (e: MouseEvent) => void;
}) {
  const [t, setT] = useState<Transformacao>(PARADA);
  /** deslocamento do gesto em curso, ainda sem decisão (troca ou saída). */
  const [gesto, setGesto] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const [comAnimacao, setComAnimacao] = useState(true);
  // "carregando"/"erro" (ver o cabeçalho de `ImageModal`): o pai remonta este
  // componente a cada troca de foto (`key={url}`), então o estado nasce
  // limpo sozinho — sem precisar de um `useEffect` como o do desktop.
  const [estado, setEstado] = useState<"carregando" | "carregada" | "erro">("carregando");

  const dedos = useRef(new Map<number, { x: number; y: number }>());
  const base = useRef<{ dist: number; t: Transformacao; cx: number; cy: number } | null>(null);
  const inicio = useRef<{ x: number; y: number; t: Transformacao; ms: number } | null>(null);
  const eixo = useRef<"livre" | "x" | "y" | "arrastar">("livre");

  const centro = () => {
    const p = [...dedos.current.values()];
    return { cx: (p[0].x + p[1].x) / 2, cy: (p[0].y + p[1].y) / 2 };
  };
  const distancia = () => {
    const p = [...dedos.current.values()];
    return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
  };

  function aoDescer(e: ReactPointerEvent<HTMLDivElement>) {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setComAnimacao(false);
    if (dedos.current.size === 2) {
      base.current = { dist: distancia(), t, ...centro() };
      inicio.current = null;
      eixo.current = "livre";
      return;
    }
    inicio.current = { x: e.clientX, y: e.clientY, t, ms: Date.now() };
    eixo.current = t.escala > 1 ? "arrastar" : "livre";
  }

  function aoMover(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dedos.current.has(e.pointerId)) return;
    dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (dedos.current.size >= 2 && base.current) {
      const b = base.current;
      const escala = Math.min(ZOOM_MAX, Math.max(0.5, (b.t.escala * distancia()) / b.dist));
      const c = centro();
      setT({ escala, x: b.t.x + (c.cx - b.cx), y: b.t.y + (c.cy - b.cy) });
      return;
    }

    const i = inicio.current;
    if (!i) return;
    const dx = e.clientX - i.x;
    const dy = e.clientY - i.y;

    if (eixo.current === "arrastar") {
      setT({ escala: i.t.escala, x: i.t.x + dx, y: i.t.y + dy });
      return;
    }
    if (eixo.current === "livre") {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      eixo.current = Math.abs(dx) > Math.abs(dy) && podeTrocar ? "x" : "y";
    }
    setGesto(eixo.current === "x" ? { dx, dy: 0 } : { dx: 0, dy });
  }

  function aoSubir(e: ReactPointerEvent<HTMLDivElement>) {
    dedos.current.delete(e.pointerId);
    setComAnimacao(true);

    if (dedos.current.size >= 1) {
      // sobrou um dedo: recomeça o arrasto a partir de onde ele está
      const [p] = [...dedos.current.values()];
      base.current = null;
      inicio.current = { x: p.x, y: p.y, t, ms: Date.now() };
      eixo.current = t.escala > 1 ? "arrastar" : "livre";
      return;
    }

    if (base.current) {
      // fim da pinça: abaixo de 1× a imagem volta a caber na tela
      base.current = null;
      if (t.escala <= 1) setT(PARADA);
      return;
    }

    const i = inicio.current;
    inicio.current = null;
    const antes = eixo.current;
    eixo.current = "livre";

    if (antes === "arrastar") return;
    if (antes === "x") {
      if (gesto.dx <= -LIMIAR_DE_TROCA) onProxima();
      else if (gesto.dx >= LIMIAR_DE_TROCA) onAnterior();
      setGesto({ dx: 0, dy: 0 });
      return;
    }
    if (antes === "y") {
      if (gesto.dy >= LIMIAR_DE_FECHO) return onFechar();
      setGesto({ dx: 0, dy: 0 });
      return;
    }
    // não houve gesto: um toque. Perto do centro, amplia/reduz; um toque curto
    // sem movimento é o "voltar" mais rápido que existe num visualizador.
    if (i && Date.now() - i.ms < 400) {
      setT((v) => (v.escala > 1 ? PARADA : { escala: 2, x: 0, y: 0 }));
    }
  }

  const puxando = gesto.dy > 0;

  return (
    <div
      // `touch-action: none` só aqui: sem isso o navegador rola/amplia a página
      // e cancela os ponteiros no meio do gesto
      onPointerDown={aoDescer}
      onPointerMove={aoMover}
      onPointerUp={aoSubir}
      onPointerCancel={aoSubir}
      onContextMenu={onMenu}
      style={{ opacity: puxando ? Math.max(0.3, 1 - gesto.dy / 400) : 1 }}
      className="absolute inset-0 z-10 grid touch-none place-items-center overflow-hidden"
    >
      {estado !== "erro" && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={url}
          alt={alt}
          draggable={false}
          onLoad={() => setEstado("carregada")}
          onError={() => setEstado("erro")}
          style={{
            transform: `translate(${t.x + gesto.dx}px, ${t.y + gesto.dy}px) scale(${t.escala})`,
            // opacidade sempre anima (o carregando→carregada não tem gesto em
            // curso pra atrapalhar); o transform só anima fora do gesto, como
            // já era — `style` vence classe pra `transition`, então as duas
            // propriedades têm de vir juntas aqui, não numa `transition-*`.
            transition: comAnimacao ? "transform .18s ease-out, opacity .15s ease-out" : "opacity .15s ease-out",
          }}
          className={`max-h-[100dvh] max-w-full select-none object-contain ${
            estado === "carregada" ? "opacity-100" : "opacity-0"
          }`}
        />
      )}

      {estado === "carregando" && (
        // sem `absolute`: o grid `place-items-center` do container só
        // centraliza item de grade, e um filho fora do fluxo não é um.
        <span
          role="status"
          aria-label="Carregando imagem"
          className="h-8 w-8 animate-spin rounded-full border-2 border-text-overlay-light/30 border-t-text-overlay-light"
        />
      )}

      {estado === "erro" && (
        <div
          role="alert"
          className="flex flex-col items-center gap-2 rounded-lg border border-border-subtle bg-background-base-lower px-6 py-5 text-text-muted"
        >
          <AlertTriangle size={32} aria-hidden="true" />
          <p className="text-text-sm">Não foi possível carregar esta imagem.</p>
        </div>
      )}
    </div>
  );
}
