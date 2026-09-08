"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TrackPublication } from "livekit-client";
import { X } from "@/components/ui/icones";
import {
  AJUSTE_INICIAL,
  DUPLO_TOQUE_MS,
  aoDuploToque,
  centro,
  comPan,
  comZoom,
  distancia,
  ehOriginal,
  transformDe,
  type Ajuste,
  type Ponto,
} from "@/components/voice/zoom-de-video";

/**
 * Uma transmissão (ou câmera) ocupando a tela inteira do telefone, com pinça
 * para ampliar.
 *
 * ## Por que não é só `requestFullscreen`
 *
 * No Chrome do Android a Fullscreen API funciona em qualquer elemento, e é ela
 * que esconde a barra de endereço — vale a pena pedir. **No Safari do iOS não
 * existe**: `element.requestFullscreen` não é implementado, e o único caminho
 * nativo é o `webkitEnterFullscreen()` do próprio `<video>`, que entrega o
 * player do sistema — sem o nosso botão de fechar, sem o nosso zoom e sem o
 * resto da chamada por baixo. Então o container é sempre um `position: fixed`
 * cobrindo o viewport, e a Fullscreen API é um **acréscimo** quando existe.
 *
 * `100dvh`, e não `100vh` nem `inset-0`: no iOS a barra do Safari entra e sai
 * durante o uso, e `100vh` é a altura *sem* ela — o rodapé do vídeo ficaria
 * atrás da barra, junto com o botão de fechar se ele estivesse embaixo.
 *
 * ## O zoom
 *
 * `touch-action: none` no container é o que permite receber os `pointermove`
 * dos dois dedos: sem isso o navegador engole o gesto para rolar a página (que
 * aqui não rola) e a pinça nunca chega ao JS. O zoom nativo do documento não
 * serviria de qualquer forma — a página tem `overflow: hidden` e o
 * `interactiveWidget` do `layout.tsx`, então o que o dedo ampliaria seria o
 * app inteiro, não o vídeo. A conta está em `zoom-de-video.ts`.
 *
 * O quadro é `object-contain`: girar para paisagem preenche a tela **sem
 * cortar e sem esticar**, que é a diferença para `cover`. O que sobra é preto,
 * como em qualquer player.
 */
export default function TelaCheiaDeVideo({
  publication,
  titulo,
  espelhar = false,
  onFechar,
}: {
  publication: TrackPublication;
  titulo: string;
  /** a minha própria câmera aparece espelhada, como no tile. */
  espelhar?: boolean;
  onFechar: () => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [ajuste, setAjuste] = useState<Ajuste>(AJUSTE_INICIAL);

  const track = publication.track;
  useEffect(() => {
    const el = video.current;
    if (el && track) track.attach(el);
    return () => {
      if (el && track) track.detach(el);
    };
  }, [track]);

  // Esc fecha (teclado num tablet, e o Esc que a própria Fullscreen API manda)
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onFechar();
    };
    window.addEventListener("keydown", aoTeclar, true);
    return () => window.removeEventListener("keydown", aoTeclar, true);
  }, [onFechar]);

  /**
   * A tela cheia do navegador, **quando ela existe**. O `catch` é o caso comum
   * no iOS, não uma exceção: lá a promessa nem chega a ser criada e o container
   * fixo já está cobrindo tudo de qualquer maneira.
   */
  useEffect(() => {
    const el = caixa.current;
    if (!el || typeof document === "undefined") return;
    if (!document.fullscreenEnabled || typeof el.requestFullscreen !== "function") return;
    let vivo = true;
    void el.requestFullscreen().catch(() => {});
    // sair pelo gesto do sistema (Esc, botão do Android) fecha a vista junto —
    // senão sobraria o `fixed` na tela sem ninguém ter pedido para ficar
    const aoTrocar = () => {
      if (vivo && !document.fullscreenElement) onFechar();
    };
    document.addEventListener("fullscreenchange", aoTrocar);
    return () => {
      vivo = false;
      document.removeEventListener("fullscreenchange", aoTrocar);
      if (document.fullscreenElement === el) void document.exitFullscreen().catch(() => {});
    };
  }, [onFechar]);

  // ── gestos ───────────────────────────────────────────────────────────────
  // Os dedos vivem num `ref` e não em estado: eles mudam a cada `pointermove`,
  // e re-renderizar a 120Hz para guardar duas coordenadas derrubaria o vídeo.
  const dedos = useRef(new Map<number, Ponto>());
  const pinca = useRef<{ distancia: number; ajuste: Ajuste } | null>(null);
  const ultimoToque = useRef(0);

  const viewport = useCallback(() => {
    const r = caixa.current?.getBoundingClientRect();
    return { largura: r?.width ?? 1, altura: r?.height ?? 1 };
  }, []);

  /** Coordenadas dentro da caixa, que é a origem que a conta do zoom espera. */
  const relativo = useCallback((p: Ponto): Ponto => {
    const r = caixa.current?.getBoundingClientRect();
    return { x: p.x - (r?.left ?? 0), y: p.y - (r?.top ?? 0) };
  }, []);

  function aoPressionar(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const lista = [...dedos.current.values()];
    if (lista.length === 2) {
      pinca.current = { distancia: distancia(lista[0], lista[1]), ajuste };
      return;
    }
    // duplo-toque: amplia no ponto, ou volta ao original se já ampliado
    const agora = Date.now();
    if (lista.length === 1 && agora - ultimoToque.current < DUPLO_TOQUE_MS) {
      ultimoToque.current = 0;
      setAjuste(aoDuploToque(ajuste, relativo({ x: e.clientX, y: e.clientY }), viewport()));
      return;
    }
    ultimoToque.current = agora;
  }

  function aoMover(e: React.PointerEvent) {
    const anterior = dedos.current.get(e.pointerId);
    if (!anterior) return;
    const atual = { x: e.clientX, y: e.clientY };
    dedos.current.set(e.pointerId, atual);
    const lista = [...dedos.current.values()];

    if (lista.length >= 2 && pinca.current) {
      const nova = distancia(lista[0], lista[1]);
      if (pinca.current.distancia <= 0) return;
      const fator = nova / pinca.current.distancia;
      setAjuste(comZoom(pinca.current.ajuste, fator, relativo(centro(lista[0], lista[1])), viewport()));
      return;
    }

    // um dedo só arrasta o que está ampliado; no repouso o `limitar` zera o
    // deslocamento e a imagem não se mexe (é o que evita "a tela escorregou")
    setAjuste((a) => comPan(a, atual.x - anterior.x, atual.y - anterior.y, viewport()));
  }

  function aoSoltar(e: React.PointerEvent) {
    dedos.current.delete(e.pointerId);
    if (dedos.current.size < 2) pinca.current = null;
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={caixa}
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      onPointerDown={aoPressionar}
      onPointerMove={aoMover}
      onPointerUp={aoSoltar}
      onPointerCancel={aoSoltar}
      // `touchAction: "none"` só aqui dentro: é o preço de tratar a pinça, e
      // vale enquanto esta vista existe — o resto do app continua rolando
      style={{ height: "100dvh", touchAction: "none" }}
      className="fixed inset-x-0 top-0 z-[96] flex touch-none items-center justify-center overflow-hidden bg-black"
    >
      <video
        ref={video}
        autoPlay
        playsInline
        muted
        style={{ transform: transformDe(ajuste), transformOrigin: "center center" }}
        className={`h-full w-full object-contain ${espelhar ? "-scale-x-100" : ""}`}
      />

      {/* Fechar no alto, à direita, **abaixo do entalhe**: `env(safe-area-inset-top)`
          é o que impede o botão de nascer sob a câmera do iPhone em paisagem,
          onde a área segura muda de lado. 44px de alvo, como o resto. */}
      <button
        type="button"
        onClick={onFechar}
        aria-label="Sair da tela cheia"
        style={{
          top: "calc(env(safe-area-inset-top, 0px) + 8px)",
          right: "calc(env(safe-area-inset-right, 0px) + 8px)",
        }}
        className="absolute grid h-11 w-11 place-items-center rounded-full bg-black/60 text-white backdrop-blur transition active:bg-black/80"
      >
        <X size={24} />
      </button>

      {/* A dica só existe enquanto ninguém ampliou nada: depois do primeiro
          gesto ela é ruído sobre a imagem. */}
      {ehOriginal(ajuste) && (
        <span
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
          className="pointer-events-none absolute rounded-full bg-black/50 px-3 py-1.5 text-xs text-white/80"
        >
          Pinça para ampliar · toque duas vezes para voltar
        </span>
      )}
    </div>,
    document.body,
  );
}
