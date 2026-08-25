"use client";

import { useEffect } from "react";
import { useUI } from "@/stores/ui";

/** Lightbox de imagem: a imagem em tamanho grande sobre um fundo escuro. */
export default function ImageModal({ url, alt }: { url: string; alt: string }) {
  const closeModal = useUI((s) => s.closeModal);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeModal();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeModal]);

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
      <div className="flex flex-col items-start gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={alt} className="max-h-[85vh] max-w-[90vw] rounded object-contain" />
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium text-txt-secondary hover:underline"
        >
          Abrir original
        </a>
      </div>
    </div>
  );
}
