"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import Dialog, { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import { Image as IconeImagem } from "@/components/ui/icones";
import { Button } from "@/components/ui/primitivos";
import {
  FORMATOS,
  ZOOM_MAX,
  ZOOM_MIN,
  limitarEnquadramento,
  molduraDoFormato,
  recorteEmPixels,
  tamanhoDeSaida,
  tamanhoNaTela,
  type Enquadramento,
  type Tamanho,
} from "@/lib/recorte";
import { ui, type Modal } from "@/stores/ui";

/**
 * Escolher **que pedaço** da imagem vira a foto de perfil ou o banner.
 *
 * Antes o arquivo ia cru para a API e o `object-fit: cover` decidia sozinho:
 * quem mandava uma foto em pé virava avatar de barriga, e num banner
 * panorâmico o meio raramente era o assunto. Aqui a moldura é fixa (o
 * quadrado do avatar, a faixa 5:2 do banner) e a pessoa move a imagem atrás
 * dela — arrastando, com a roda do mouse, pelo deslizador ou pelas setas.
 *
 * O recorte é feito **no cliente**, num canvas: a API guarda os bytes como
 * vêm, sem `sharp`, então mandar a imagem inteira e um retângulo não teria
 * quem recortasse do outro lado. De quebra o upload encolhe — o que sobe é a
 * moldura, não a foto de 12 MP.
 *
 * **GIF não chega aqui.** Canvas desenha um quadro só, e recortar devolveria a
 * animação parada; quem desvia é o `recortarImagem` da store de interface, que
 * manda o arquivo inteiro para a API (`lib/imagem-de-perfil.ts`).
 *
 * A conta que traduz "arrastei até aqui" em retângulo de origem mora em
 * `lib/recorte.ts`, testada à parte.
 */

/** Lado da moldura na tela. O avatar é menor porque é quadrado e o banner deita. */
const LARGURA_NA_TELA = { avatar: 256, banner: 420 } as const;
const PASSO_DA_SETA = 8;
const PASSO_DA_RODA = 1.12;

export default function RecortarImagemModal({
  modal,
}: {
  modal: Extract<Modal, { kind: "recortarImagem" }>;
}) {
  const { arquivo, formato, resolve } = modal;
  const { redondo, titulo, larguraDeSaida } = FORMATOS[formato];
  const moldura = useMemo(
    () => molduraDoFormato(formato, LARGURA_NA_TELA[formato]),
    [formato],
  );

  const [url, setUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<Tamanho | null>(null);
  const [erro, setErro] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [enquadramento, setEnquadramento] = useState<Enquadramento>({ zoom: 1, x: 0, y: 0 });

  const imagemRef = useRef<HTMLImageElement>(null);
  const molduraRef = useRef<HTMLDivElement>(null);
  // o arrasto guarda de onde partiu: somar deltas quadro a quadro acumula erro
  // e faz a imagem escorregar do cursor
  const arrasto = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const objeto = URL.createObjectURL(arquivo);
    setUrl(objeto);
    return () => URL.revokeObjectURL(objeto);
  }, [arquivo]);

  const ajustar = useCallback(
    (mudanca: Partial<Enquadramento>) => {
      setEnquadramento((atual) =>
        natural ? limitarEnquadramento({ ...atual, ...mudanca }, moldura, natural) : atual,
      );
    },
    [moldura, natural],
  );

  // roda do mouse: listener nativo porque o React registra `wheel` como
  // passivo e o `preventDefault` de lá não impediria a página de rolar junto
  useEffect(() => {
    const alvo = molduraRef.current;
    if (!alvo || !natural) return;
    const aoRolar = (e: WheelEvent) => {
      e.preventDefault();
      setEnquadramento((atual) =>
        limitarEnquadramento(
          { ...atual, zoom: atual.zoom * (e.deltaY < 0 ? PASSO_DA_RODA : 1 / PASSO_DA_RODA) },
          moldura,
          natural,
        ),
      );
    };
    alvo.addEventListener("wheel", aoRolar, { passive: false });
    return () => alvo.removeEventListener("wheel", aoRolar);
  }, [moldura, natural]);

  function aoPressionar(e: ReactPointerEvent<HTMLDivElement>) {
    if (!natural) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    arrasto.current = { px: e.clientX, py: e.clientY, x: enquadramento.x, y: enquadramento.y };
  }

  function aoMover(e: ReactPointerEvent<HTMLDivElement>) {
    const inicio = arrasto.current;
    if (!inicio) return;
    ajustar({ x: inicio.x + (e.clientX - inicio.px), y: inicio.y + (e.clientY - inicio.py) });
  }

  function aoSoltar(e: ReactPointerEvent<HTMLDivElement>) {
    arrasto.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  // sem teclado a moldura seria mouse-only: o deslizador dá o zoom, as setas o
  // enquadramento
  function aoTeclar(e: ReactKeyboardEvent<HTMLDivElement>) {
    const passo = e.shiftKey ? PASSO_DA_SETA * 3 : PASSO_DA_SETA;
    const mapa: Record<string, Partial<Enquadramento>> = {
      ArrowLeft: { x: enquadramento.x - passo },
      ArrowRight: { x: enquadramento.x + passo },
      ArrowUp: { y: enquadramento.y - passo },
      ArrowDown: { y: enquadramento.y + passo },
      "+": { zoom: enquadramento.zoom + 0.1 },
      "=": { zoom: enquadramento.zoom + 0.1 },
      "-": { zoom: enquadramento.zoom - 0.1 },
    };
    const mudanca = mapa[e.key];
    if (!mudanca) return;
    e.preventDefault();
    ajustar(mudanca);
  }

  async function aplicar() {
    const imagem = imagemRef.current;
    if (!imagem || !natural) return;
    setGerando(true);
    try {
      const recorte = recorteEmPixels(enquadramento, moldura, natural);
      const saida = tamanhoDeSaida(recorte, larguraDeSaida);
      const canvas = document.createElement("canvas");
      canvas.width = saida.largura;
      canvas.height = saida.altura;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas indisponível");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        imagem,
        recorte.sx,
        recorte.sy,
        recorte.largura,
        recorte.altura,
        0,
        0,
        saida.largura,
        saida.altura,
      );
      // webp segura transparência e sai bem menor; navegador que não conheça o
      // formato devolve png sozinho, e o nome do arquivo segue o que veio
      const blob = await new Promise<Blob | null>((pronto) =>
        canvas.toBlob(pronto, "image/webp", 0.92),
      );
      if (!blob) throw new Error("recorte vazio");
      const extensao = blob.type === "image/webp" ? "webp" : "png";
      resolve(new File([blob], `${formato}.${extensao}`, { type: blob.type }));
    } catch {
      ui.toast("Não foi possível recortar a imagem.", "error");
      setGerando(false);
    }
  }

  const tela = natural ? tamanhoNaTela(moldura, natural, enquadramento.zoom) : null;

  // "Reset" do Discord (16.png, "Edit Image"): volta ao enquadramento inicial
  // — zoom 1 (o "cobrir" exato) centralizado — e some quando não há nada para
  // desfazer, mesmo comportamento do zoom desabilitado em nao_verificado.
  const podeRedefinir =
    !!natural && (enquadramento.zoom !== 1 || enquadramento.x !== 0 || enquadramento.y !== 0);
  function redefinir() {
    ajustar({ zoom: 1, x: 0, y: 0 });
  }

  return (
    <Dialog
      telaCheiaNoCelular
      title={titulo}
      description="Arraste a imagem para escolher o enquadramento e use o zoom para aproximar."
      onClose={() => resolve(null)}
      className="w-[520px]"
      footer={
        // "Redefinir" na ponta esquerda, Cancelar/Aplicar na direita — o
        // `flex-row-reverse` do `Modal` só empacota os filhos do lado direito,
        // então o layout de duas pontas do Discord (16.png) precisa do
        // próprio `justify-between` aqui dentro, num único filho.
        <div className="flex w-full items-center justify-between">
          <Button variante="neutro" tamanho="sm" className="px-3" disabled={!podeRedefinir} onClick={redefinir}>
            Redefinir
          </Button>
          <div className="flex items-center gap-2">
            <SecondaryButton onClick={() => resolve(null)}>Cancelar</SecondaryButton>
            <PrimaryButton onClick={() => void aplicar()} disabled={!natural || erro || gerando}>
              {gerando ? "Aplicando…" : "Aplicar"}
            </PrimaryButton>
          </div>
        </div>
      }
    >
      {erro ? (
        <p className="rounded border border-border-subtle p-3 text-sm text-text-muted">
          Não foi possível abrir esta imagem. Tente outro arquivo (PNG, JPEG, GIF ou WebP).
        </p>
      ) : (
        <div className="flex flex-col items-center">
          <div
            ref={molduraRef}
            role="group"
            aria-label="Área de enquadramento — arraste para mover, setas ajustam"
            tabIndex={0}
            onPointerDown={aoPressionar}
            onPointerMove={aoMover}
            onPointerUp={aoSoltar}
            onPointerCancel={aoSoltar}
            onKeyDown={aoTeclar}
            style={{ width: moldura.largura, height: moldura.altura }}
            className="relative touch-none select-none overflow-hidden rounded bg-background-scrim outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            {url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                ref={imagemRef}
                src={url}
                alt=""
                draggable={false}
                onLoad={(e) =>
                  setNatural({
                    largura: e.currentTarget.naturalWidth,
                    altura: e.currentTarget.naturalHeight,
                  })
                }
                onError={() => setErro(true)}
                style={
                  tela
                    ? {
                        width: tela.largura,
                        height: tela.altura,
                        transform: `translate(-50%, -50%) translate(${enquadramento.x}px, ${enquadramento.y}px)`,
                      }
                    : { visibility: "hidden" }
                }
                className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
              />
            )}
            {/* a máscara mostra o resultado no formato em que ele vai aparecer:
                o avatar é redondo em toda a interface, o banner é a faixa toda */}
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-0 ${redondo ? "rounded-full" : ""}`}
              style={{
                boxShadow: redondo
                  ? "0 0 0 9999px rgba(0,0,0,.6), inset 0 0 0 1px rgba(255,255,255,.5)"
                  : "inset 0 0 0 1px rgba(255,255,255,.35)",
              }}
            />
            {!natural && (
              <p className="absolute inset-0 grid place-items-center text-sm text-text-muted">
                Carregando imagem…
              </p>
            )}
          </div>

          {/*
            Deslizador de zoom sem rótulo, ladeado pelo ícone de imagem em dois
            tamanhos (o "diminuir"/"aumentar" do Discord: mesmo glifo, 16 e
            20 — 16.png, "Edit Image"). Diferente do `Slider` de
            `ui/controls.tsx` (rótulo, marcas, borda embaixo, feito para lista
            de preferência): aqui é só o trilho, como no catálogo — sem texto
            "Zoom" nem número embaixo. Reaproveita o trilho/polegar do
            `Slider` (mesmas classes, ver o cabeçalho de lá) para não abrir um
            terceiro desenho de slider no app; só a moldura ao redor muda.
          */}
          <div className="mt-3 flex w-full max-w-[420px] items-center gap-3">
            <IconeImagem size={16} aria-hidden="true" className="shrink-0 text-text-muted" />
            <div className="relative h-5 flex-1">
              <div className="absolute inset-x-0 top-1.5 h-2 rounded-full bg-slider-track-background" aria-hidden="true" />
              <div
                className="absolute left-0 top-1.5 h-2 rounded-full bg-brand-500"
                style={{ width: `${((enquadramento.zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN)) * 100}%` }}
                aria-hidden="true"
              />
              <input
                type="range"
                min={ZOOM_MIN}
                max={ZOOM_MAX}
                step={0.01}
                value={enquadramento.zoom}
                onChange={(e) => ajustar({ zoom: Number(e.target.value) })}
                disabled={!natural}
                aria-label="Zoom"
                className="absolute inset-0 w-full cursor-pointer appearance-none bg-transparent outline-none disabled:cursor-not-allowed [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-moz-range-track]:bg-transparent [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_2px_6px_rgba(0,0,0,0.45)]"
              />
            </div>
            <IconeImagem size={20} aria-hidden="true" className="shrink-0 text-text-muted" />
          </div>
        </div>
      )}
    </Dialog>
  );
}
