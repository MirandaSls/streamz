"use client";

import { useState, type MouseEvent } from "react";
import { Download, EyeOff, FileText } from "@/components/ui/icones";
import {
  attachmentDisplayName,
  isAudioAttachment,
  isImageAttachment,
  isPdfAttachment,
  isSpoilerAttachment,
  isVideoAttachment,
  type Attachment,
} from "@streamz/shared";
import EmojiPicker from "@/components/ui/EmojiPicker";
import PainelFlutuante from "@/components/chat/PainelFlutuante";
import { registrarUsoDeReacao } from "@/components/chat/reacoes-rapidas";
import { itensDaImagem } from "@/components/media/menu-da-imagem";
import { useAuth } from "@/stores/auth";
import { useMessages } from "@/stores/messages";
import { ui, type Anchor } from "@/stores/ui";

/**
 * Os anexos de uma mensagem.
 *
 * Uma imagem sozinha ocupa o tamanho natural (até o teto); duas ou mais entram
 * numa grade de duas colunas, como o Discord — quatro fotos viram 2×2 em vez de
 * uma coluna de quatro que empurraria a conversa toda para cima. Vídeo e áudio
 * tocam na própria mensagem; PDF e o resto viram cartão com nome e tamanho.
 *
 * Clicar numa imagem abre o lightbox já sabendo de todas as imagens da
 * mensagem, que é o que faz ← → funcionarem lá dentro. O **botão direito**
 * abre o menu do app com copiar/salvar/copiar link/abrir e, quando a imagem
 * pertence a uma mensagem confirmada (`mensagemId`), também "Adicionar
 * Reação" — no desktop o menu nativo do WebView2 está bloqueado (#138), então
 * sem este menu o clique direito sobre uma foto não fazia nada lá.
 */
export default function MediaGroup({
  attachments,
  mensagemId,
}: {
  attachments: Attachment[];
  /** mensagem dona dos anexos; sem ela não há a que reagir (prévia, rascunho). */
  mensagemId?: string;
}) {
  // o seletor de emoji aberto pelo menu de contexto da imagem; a âncora é o
  // ponto do clique, como no menu que o chamou
  const [picker, setPicker] = useState<Anchor | null>(null);
  const meuId = useAuth((s) => s.user?.id);
  const toggleReaction = useMessages((s) => s.toggleReaction);

  if (attachments.length === 0) return null;

  const imagens = attachments.filter(isImageAttachment);
  const outros = attachments.filter((a) => !isImageAttachment(a));

  function reagir(emoji: string) {
    if (!mensagemId) return;
    registrarUsoDeReacao(emoji);
    toggleReaction(mensagemId, emoji, meuId);
  }

  function abrirMenu(e: MouseEvent, anexo: Attachment) {
    e.preventDefault();
    e.stopPropagation();
    const ancora: Anchor = { x: e.clientX, y: e.clientY, width: 0, height: 0 };
    ui.openContextMenu(
      e.clientX,
      e.clientY,
      itensDaImagem({
        url: anexo.url,
        alt: attachmentDisplayName(anexo),
        onReagir: mensagemId ? () => setPicker(ancora) : undefined,
      }),
    );
  }

  return (
    <div className="mt-1 flex flex-col gap-2">
      {imagens.length > 0 && (
        <div
          className={
            imagens.length === 1
              ? "flex"
              : "grid max-w-[550px] grid-cols-2 gap-1 [&>*]:aspect-video"
          }
        >
          {imagens.map((a, i) => (
            <Imagem
              key={a.id}
              anexo={a}
              sozinha={imagens.length === 1}
              onMenu={(e) => abrirMenu(e, a)}
              onAbrir={() =>
                ui.openModal({
                  kind: "galeria",
                  urls: imagens.map((x) => x.url),
                  alts: imagens.map((x) => attachmentDisplayName(x)),
                  indice: i,
                  messageId: mensagemId,
                })
              }
            />
          ))}
        </div>
      )}

      {outros.map((a) =>
        isVideoAttachment(a) ? (
          <Video key={a.id} anexo={a} />
        ) : isAudioAttachment(a) ? (
          <Audio key={a.id} anexo={a} />
        ) : (
          <Arquivo key={a.id} anexo={a} />
        ),
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

/** Imagem, com a cortina de spoiler quando o nome vem marcado. */
function Imagem({
  anexo,
  sozinha,
  onAbrir,
  onMenu,
}: {
  anexo: Attachment;
  sozinha: boolean;
  onAbrir: () => void;
  onMenu: (e: MouseEvent) => void;
}) {
  const [revelado, setRevelado] = useState(!isSpoilerAttachment(anexo));
  const nome = attachmentDisplayName(anexo);

  if (!revelado) {
    return (
      <button
        type="button"
        onClick={() => setRevelado(true)}
        aria-label={`Spoiler: mostrar ${nome}`}
        className="relative block w-fit overflow-hidden rounded-lg"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={anexo.url}
          alt=""
          aria-hidden="true"
          className={`blur-2xl ${sozinha ? "max-h-[350px] max-w-[min(550px,100%)]" : "h-full w-full"} object-cover`}
        />
        <span className="absolute inset-0 grid place-items-center">
          <span className="flex items-center gap-1.5 rounded-full bg-background-scrim px-3 py-1 text-sm font-bold uppercase text-text-overlay-light">
            <EyeOff size={16} aria-hidden="true" />
            Spoiler
          </span>
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onAbrir}
      onContextMenu={onMenu}
      aria-label={`Abrir imagem ${nome}`}
      className={`block cursor-zoom-in overflow-hidden rounded-lg ${sozinha ? "w-fit" : "h-full w-full"}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={anexo.url}
        alt={nome}
        width={anexo.width ?? undefined}
        height={anexo.height ?? undefined}
        loading="lazy"
        className={
          sozinha
            ? "max-h-[350px] max-w-[min(550px,100%)] object-contain"
            : "h-full w-full object-cover"
        }
      />
    </button>
  );
}

/**
 * Vídeo anexado. `preload="metadata"` para a primeira imagem aparecer sem
 * baixar o arquivo inteiro; toca ao passar o mouse e volta ao início quando o
 * mouse sai — o mesmo comportamento do GIF/vídeo curto no Discord.
 */
function Video({ anexo }: { anexo: Attachment }) {
  return (
    <video
      src={anexo.url}
      controls
      preload="metadata"
      onMouseEnter={(e) => void e.currentTarget.play().catch(() => undefined)}
      onMouseLeave={(e) => {
        e.currentTarget.pause();
        e.currentTarget.currentTime = 0;
      }}
      aria-label={attachmentDisplayName(anexo)}
      className="max-h-[350px] max-w-[min(550px,100%)] rounded-lg bg-black"
    />
  );
}

function Audio({ anexo }: { anexo: Attachment }) {
  return (
    <div className="w-[432px] max-w-full rounded-lg border border-border-subtle bg-background-base-lowest p-3">
      <span className="mb-2 block truncate text-sm font-medium text-text-default">
        {attachmentDisplayName(anexo)}
      </span>
      <audio src={anexo.url} controls preload="metadata" className="w-full" />
    </div>
  );
}

/** PDF e qualquer outro arquivo: ícone, nome, tamanho e o link para abrir. */
function Arquivo({ anexo }: { anexo: Attachment }) {
  const nome = attachmentDisplayName(anexo);
  return (
    <div className="flex w-[432px] max-w-full items-center gap-3 rounded-lg border border-border-subtle bg-background-base-lowest p-4">
      <FileText
        size={40}
        strokeWidth={1.25}
        className={`shrink-0 ${isPdfAttachment(anexo) ? "text-status-danger" : "text-text-muted"}`}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <a
          href={anexo.url}
          target="_blank"
          rel="noreferrer"
          className="block truncate font-medium text-text-link hover:underline"
        >
          {nome}
        </a>
        <span className="text-xs text-text-muted">
          {isPdfAttachment(anexo) ? "PDF · " : ""}
          {formatBytes(anexo.size)}
        </span>
      </span>
      <a
        href={anexo.url}
        download={nome}
        aria-label={`Baixar ${nome}`}
        /* `h-8 w-8` mede 32 (a raiz do app é 16px, ADR-0009), e no telefone
           este é o único jeito de guardar o arquivo: o menu de toque longo da
           mensagem não tem "baixar anexo". 44 literais no celular, como o
           resto dos alvos de dedo do app.
           Fica `<a download>`, não `BotaoDeIcone`: o download nativo do
           navegador exige uma âncora, e o primitivo só renderiza `<button>`. */
        className="grid h-8 w-8 shrink-0 place-items-center rounded text-text-subtle hover:bg-interactive-background-hover hover:text-text-strong celular:h-[44px] celular:w-[44px]"
      >
        <Download size={20} />
      </a>
    </div>
  );
}

/** Tamanho legível; anexo externo (GIF do provedor) não tem bytes conhecidos. */
function formatBytes(n: number): string {
  if (n <= 0) return "arquivo externo";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
