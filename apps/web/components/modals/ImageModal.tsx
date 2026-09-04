"use client";

import {
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
  type ReactNode,
  type WheelEvent,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Link2,
  SmilePlus,
  X,
} from "@/components/ui/icones";
import type { PublicUser } from "@streamz/shared";
import Tooltip from "@/components/ui/Tooltip";
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
import { alturaDoChipDeReacao, useSettings } from "@/stores/settings";
import { anchorOf, ui, useUI, type Anchor } from "@/stores/ui";

/** Limites do zoom por rolagem, em múltiplos do tamanho ajustado à tela. */
const ZOOM_MIN = 1;
const ZOOM_MAX = 4;

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
 * janela de 1919 de largura): a barra é uma **pílula de 148×40 e raio 8**
 * encostada no alto à direita (x 1696..1843, y 37..76), com quatro botões lado
 * a lado — centros em x=1715, 1752, 1787 e 1823, ou seja um passo de ~36px — e
 * o ícone dentro medindo 13 a 14px de tinta. Ao lado dela, separado por 12px,
 * o **X sozinho num quadrado de 40 (x 1856..1895) com o mesmo raio 8**, a 24px
 * da borda direita da janela. O fundo da pílula é #1E1F22 com borda 1px mais
 * clara (#313137); usamos os tokens mais próximos que já existem — `bg-chat`
 * com `border-border`, a mesma dupla da mini-barra da mensagem.
 *
 * As **ações** não são as mesmas do Discord (lá a pílula tem zoom, encaminhar,
 * abrir e "…", com copiar e salvar escondidos dentro do "…"): aqui as cinco
 * que o usuário pediu ficam à vista, porque é justamente o que faltava.
 *
 * ## Reagir
 *
 * Reagir é sobre a **mensagem** da imagem, não sobre o arquivo; por isso o
 * modal recebe `messageId` e fala com `stores/messages`. Sem ele (galeria do
 * canal, prévia de link solta) o botão de reação e a fileira de reações não
 * aparecem — não há a que reagir.
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

  // quem reagiu, para o tooltip do chip: o autor da mensagem e eu bastam aqui
  // — o visualizador não tem a lista de membros do servidor à mão, e o
  // tooltip já sabe cair em "e mais N" para quem ele não conhece
  const conhecidos = useMemo(() => {
    const map = new Map<string, PublicUser>();
    if (mensagem) map.set(mensagem.author.id, mensagem.author);
    if (eu) map.set(eu.id, eu);
    return map;
  }, [mensagem, eu]);

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

  if (!url) return null;

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
    e.preventDefault();
    e.stopPropagation();
    const ancora: Anchor = { x: e.clientX, y: e.clientY, width: 0, height: 0 };
    ui.openContextMenu(
      e.clientX,
      e.clientY,
      itensDaImagem({
        url,
        alt,
        onReagir: messageId ? () => setPicker(ancora) : undefined,
      }),
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className="fixed inset-0 z-50 grid place-items-center bg-black/90 anim-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      {/*
        topo: contador, a pílula de ações e o X, todos colados na borda —
        medidas do print no comentário do componente.
      */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-end gap-3 p-4">
        {total > 1 && (
          <span aria-live="polite" className="mr-1 text-sm font-medium text-white/70">
            {i + 1} de {total}
          </span>
        )}

        <div className="flex h-[40px] items-center rounded-lg border border-border bg-chat">
          {messageId && (
            <BotaoDaBarra label="Reagir" onClick={abrirSeletor}>
              <SmilePlus size={20} />
            </BotaoDaBarra>
          )}
          <BotaoDaBarra label="Copiar imagem" onClick={() => void copiarImagem(url)}>
            <Copy size={20} />
          </BotaoDaBarra>
          <BotaoDaBarra label="Salvar imagem" onClick={() => void salvarImagem(url, alt)}>
            <Download size={20} />
          </BotaoDaBarra>
          <BotaoDaBarra label="Copiar link" onClick={() => copiarLinkDaImagem(url)}>
            <Link2 size={20} />
          </BotaoDaBarra>
          <BotaoDaBarra label="Abrir no navegador" onClick={() => void abrirImagemNoNavegador(url)}>
            <ExternalLink size={20} />
          </BotaoDaBarra>
        </div>

        <button
          type="button"
          onClick={closeModal}
          aria-label="Fechar"
          className="grid h-[40px] w-[40px] place-items-center rounded-lg border border-border bg-chat text-txt-secondary transition hover:bg-hov hover:text-txt-primary"
        >
          <X size={24} />
        </button>
      </div>

      {total > 1 && (
        <>
          <Seta
            lado="esquerda"
            onClick={() => {
              setI((v) => (v - 1 + total) % total);
              setZoom(ZOOM_MIN);
            }}
          />
          <Seta
            lado="direita"
            onClick={() => {
              setI((v) => (v + 1) % total);
              setZoom(ZOOM_MIN);
            }}
          />
        </>
      )}

      <div className="flex max-h-full flex-col items-start gap-2 anim-modal">
        <div className="max-h-[80vh] max-w-[85vw] overflow-auto" onWheel={rolar}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={alt}
            onClick={() => setZoom((z) => (z > ZOOM_MIN ? ZOOM_MIN : 2))}
            onContextMenu={abrirMenu}
            style={{ transform: `scale(${zoom})`, transformOrigin: "center top" }}
            className={`max-h-[80vh] max-w-[85vw] rounded object-contain transition-transform ${
              zoom > ZOOM_MIN ? "cursor-zoom-out" : "cursor-zoom-in"
            }`}
          />
        </div>

        {/*
          As reações da mensagem, embaixo da imagem e clicáveis: quem abriu a
          foto em tela cheia é justamente quem quer reagir a ela, e voltar para
          a conversa só para clicar num chip era o caminho todo de volta.
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
                        ? "border-accent bg-accent/20 text-txt-primary"
                        : "border-transparent bg-panel text-txt-normal hover:border-border-strong"
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

/**
 * Um botão da pílula: 36×36 com o ícone de 20, o passo medido no print (uma
 * pílula de 40 de altura com 2px de folga em volta dos botões).
 */
function BotaoDaBarra({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="grid h-[36px] w-[36px] place-items-center rounded-md text-txt-secondary transition hover:bg-hov hover:text-txt-primary"
      >
        {children}
      </button>
    </Tooltip>
  );
}

function Seta({ lado, onClick }: { lado: "esquerda" | "direita"; onClick: () => void }) {
  const label = lado === "esquerda" ? "Imagem anterior" : "Próxima imagem";
  return (
    <Tooltip label={label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={`absolute top-1/2 grid h-16 w-16 -translate-y-1/2 place-items-center text-white/60 transition hover:text-white ${
          lado === "esquerda" ? "left-0" : "right-0"
        }`}
      >
        {lado === "esquerda" ? <ChevronLeft size={40} /> : <ChevronRight size={40} />}
      </button>
    </Tooltip>
  );
}
