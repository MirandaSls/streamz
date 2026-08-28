"use client";

import { useEffect, useState, type WheelEvent } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";
import Tooltip from "@/components/ui/Tooltip";
import { useUI } from "@/stores/ui";

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
  const [zoom, setZoom] = useState(ZOOM_MIN);

  const total = urls.length;
  const url = urls[i];
  const alt = alts[i] ?? "Imagem";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return closeModal();
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
  }, [closeModal, total]);

  if (!url) return null;

  function rolar(e: WheelEvent<HTMLDivElement>) {
    setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z - e.deltaY / 500)));
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
      {/* topo: contador à esquerda do X, ambos colados na borda da janela */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-end gap-4 p-4">
        {total > 1 && (
          <span aria-live="polite" className="text-sm font-medium text-white/70">
            {i + 1} de {total}
          </span>
        )}
        <button
          type="button"
          onClick={closeModal}
          aria-label="Fechar"
          className="grid h-9 w-9 place-items-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
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
            style={{ transform: `scale(${zoom})`, transformOrigin: "center top" }}
            className={`max-h-[80vh] max-w-[85vw] rounded object-contain transition-transform ${
              zoom > ZOOM_MIN ? "cursor-zoom-out" : "cursor-zoom-in"
            }`}
          />
        </div>

        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-sm font-medium text-white/70 transition hover:text-white hover:underline"
        >
          <ExternalLink size={16} aria-hidden="true" />
          Abrir no navegador
        </a>
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
        className={`absolute top-1/2 grid h-16 w-16 -translate-y-1/2 place-items-center text-white/60 transition hover:text-white ${
          lado === "esquerda" ? "left-0" : "right-0"
        }`}
      >
        {lado === "esquerda" ? <ChevronLeft size={40} /> : <ChevronRight size={40} />}
      </button>
    </Tooltip>
  );
}
