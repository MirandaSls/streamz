"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { Attachment, GifCategory, GifResult } from "@streamz/shared";
import { api } from "@/lib/api";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

/** Espera antes de buscar enquanto se digita (o provedor cobra por chamada). */
const DEBOUNCE_MS = 350;

/**
 * Seletor de GIF (Tenor).
 *
 * Sem `TENOR_API_KEY` no servidor a resposta vem com `configured: false` e a
 * caixa mostra o estado "não configurado" em vez de um erro — o mesmo
 * tratamento que voz dá à falta de LiveKit. O botão do composer continua
 * existindo: quem configurar a chave passa a ter a busca sem mudar mais nada.
 *
 * O GIF escolhido vira anexo por URL: nada é copiado para o nosso storage
 * (ver `POST /uploads/external`), então este caminho funciona mesmo sem R2.
 */
export default function GifPicker({
  onEscolher,
  onClose,
  termoInicial = "",
  className = "",
}: {
  onEscolher: (attachment: Attachment) => void;
  onClose: () => void;
  /** termo já digitado (veio de `/giphy termo`). */
  termoInicial?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [termo, setTermo] = useState(termoInicial);
  const [resultados, setResultados] = useState<GifResult[]>([]);
  const [categorias, setCategorias] = useState<GifCategory[]>([]);
  const [configurado, setConfigurado] = useState<boolean | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [anexando, setAnexando] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  // categorias abrem a caixa; a busca substitui a grade quando há termo
  useEffect(() => {
    let vivo = true;
    void api
      .gifCategories()
      .then((r) => {
        if (!vivo) return;
        setConfigurado(r.configured);
        setCategorias(r.categories);
      })
      .catch(() => vivo && setConfigurado(false));
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    const timer = setTimeout(() => {
      void api
        .searchGifs(termo.trim())
        .then((r) => {
          if (!vivo) return;
          setConfigurado(r.configured);
          setResultados(r.results);
        })
        .catch(() => vivo && setResultados([]))
        .finally(() => vivo && setCarregando(false));
    }, DEBOUNCE_MS);
    return () => {
      vivo = false;
      clearTimeout(timer);
    };
  }, [termo]);

  async function escolher(gif: GifResult) {
    setAnexando(true);
    try {
      const attachment = await api.createExternalAttachment({
        url: gif.url,
        filename: `${(gif.description || "gif").slice(0, 40).replace(/[^\w-]+/g, "_")}.gif`,
        width: gif.width || undefined,
        height: gif.height || undefined,
      });
      onEscolher(attachment);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível anexar o GIF"), "error");
    } finally {
      setAnexando(false);
    }
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Escolher GIF"
      className={`z-[70] flex h-[420px] w-[352px] flex-col overflow-hidden rounded-lg bg-panel shadow-high ${className}`}
    >
      <div className="flex items-center gap-2 p-2">
        <Search size={16} className="text-txt-muted" aria-hidden="true" />
        <input
          autoFocus
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Buscar no Tenor"
          aria-label="Buscar GIF"
          className="h-8 flex-1 rounded bg-rail px-2 text-sm text-txt-normal outline-none placeholder:text-txt-muted"
        />
      </div>

      {configurado === false ? (
        <div className="grid flex-1 place-items-center px-6 text-center">
          <div>
            <p className="font-medium text-txt-normal">GIFs não configurados</p>
            <p className="mt-1 text-sm text-txt-muted">
              Defina <code className="rounded bg-rail px-1">TENOR_API_KEY</code> no servidor para
              habilitar a busca. Ver PENDENCIAS.md.
            </p>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {!termo.trim() && categorias.length > 0 && (
            <section className="mb-2">
              <h3 className="px-1 py-1 text-xs font-semibold uppercase text-txt-muted">
                Categorias
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {categorias.slice(0, 8).map((c) => (
                  <button
                    key={c.searchTerm}
                    type="button"
                    onClick={() => setTermo(c.searchTerm)}
                    className="relative h-20 overflow-hidden rounded"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.previewUrl} alt="" className="h-full w-full object-cover" />
                    <span className="absolute inset-0 grid place-items-center bg-black/40 text-sm font-bold text-white">
                      {c.name}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {carregando && resultados.length === 0 ? (
            <p className="py-8 text-center text-sm text-txt-muted">Carregando…</p>
          ) : resultados.length === 0 ? (
            <p className="py-8 text-center text-sm text-txt-muted">
              {termo.trim() ? "Nenhum GIF para esse termo." : "Nada por aqui ainda."}
            </p>
          ) : (
            <div className="columns-2 gap-2">
              {resultados.map((gif) => (
                <button
                  key={gif.id}
                  type="button"
                  disabled={anexando}
                  onClick={() => void escolher(gif)}
                  aria-label={gif.description}
                  className="mb-2 block w-full overflow-hidden rounded disabled:opacity-50"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={gif.previewUrl}
                    alt={gif.description}
                    loading="lazy"
                    className="w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
