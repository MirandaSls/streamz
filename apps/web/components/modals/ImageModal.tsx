"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, ExternalLink, ZoomIn, ZoomOut } from "lucide-react";
import Tooltip from "@/components/ui/Tooltip";
import { useUI } from "@/stores/ui";

/** Passos de zoom do lightbox, em múltiplos do tamanho ajustado à tela. */
const ZOOMS = [1, 1.5, 2, 3];

/**
 * Lightbox de imagem.
 *
 * Recebe a lista inteira de imagens (a mensagem toda, ou a galeria do canal) e
 * o índice de onde abrir: é o que permite ← → passarem de uma para a outra sem
 * fechar e reabrir — como no visualizador do Discord. Com uma imagem só, as
 * setas simplesmente não aparecem.
 */
export default function ImageModal({
  urls,
  alts,
  indice,
}: {
  urls: string[];
  alts: string[];
  indice: number;
}) {
  const closeModal = useUI((s) => s.closeModal);
  const [i, setI] = useState(Math.min(Math.max(indice, 0), Math.max(urls.length - 1, 0)));
  const [zoom, setZoom] = useState(0);

  const total = urls.length;
  const url = urls[i];
  const alt = alts[i] ?? "Imagem";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return closeModal();
      if (e.key === "ArrowRight" && total > 1) {
        setI((v) => (v + 1) % total);
        setZoom(0);
      }
      if (e.key === "ArrowLeft" && total > 1) {
        setI((v) => (v - 1 + total) % total);
        setZoom(0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeModal, total]);

  if (!url) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      {total > 1 && (
        <>
          <Seta
            lado="esquerda"
            onClick={() => {
              setI((v) => (v - 1 + total) % total);
              setZoom(0);
            }}
          />
          <Seta
            lado="direita"
            onClick={() => {
              setI((v) => (v + 1) % total);
              setZoom(0);
            }}
          />
        </>
      )}

      <div className="flex max-h-full flex-col items-center gap-2">
        <div className="max-h-[80vh] max-w-[90vw] overflow-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={alt}
            onClick={() => setZoom((z) => (z + 1) % ZOOMS.length)}
            style={{ transform: `scale(${ZOOMS[zoom]})`, transformOrigin: "center top" }}
            className={`max-h-[80vh] max-w-[90vw] rounded object-contain transition-transform ${
              zoom === ZOOMS.length - 1 ? "cursor-zoom-out" : "cursor-zoom-in"
            }`}
          />
        </div>

        <div className="flex items-center gap-4 text-sm font-medium text-txt-secondary">
          {total > 1 && (
            <span aria-live="polite" className="text-txt-muted">
              {i + 1} de {total}
            </span>
          )}
          <Acao
            label={zoom === ZOOMS.length - 1 ? "Reduzir" : "Ampliar"}
            onClick={() => setZoom((z) => (z + 1) % ZOOMS.length)}
          >
            {zoom === ZOOMS.length - 1 ? <ZoomOut size={16} /> : <ZoomIn size={16} />}
            {Math.round(ZOOMS[zoom] * 100)}%
          </Acao>
          <a
            href={url}
            download={alt}
            className="flex items-center gap-1.5 hover:text-txt-primary hover:underline"
          >
            <Download size={16} aria-hidden="true" />
            Baixar
          </a>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 hover:text-txt-primary hover:underline"
          >
            <ExternalLink size={16} aria-hidden="true" />
            Abrir original
          </a>
        </div>
      </div>
    </div>
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
        className={`absolute top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white transition hover:bg-black/70 ${
          lado === "esquerda" ? "left-4" : "right-4"
        }`}
      >
        {lado === "esquerda" ? <ChevronLeft size={28} /> : <ChevronRight size={28} />}
      </button>
    </Tooltip>
  );
}

function Acao({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex items-center gap-1.5 hover:text-txt-primary"
    >
      {children}
    </button>
  );
}
