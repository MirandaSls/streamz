import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as PointerEventReact, RefObject } from "react";
import {
  AJUSTE_INICIAL,
  comBotao,
  comPan,
  comZoom,
  ehOriginal,
  fatorDaRoda,
  limitar,
  percentualDe,
  podeAmpliar as podeAmpliarAjuste,
  podeReduzir as podeReduzirAjuste,
  transformDe,
  type Ajuste,
  type Ponto,
  type Viewport,
} from "@/components/voice/zoom-de-video";

/**
 * Zoom com roda/arrasto na transmissão de tela em desktop/web (o irmão
 * mouse-e-teclado do gesto de pinça do celular em `TelaCheiaDeVideo.tsx` —
 * mesma aritmética de `zoom-de-video.ts`, gesto diferente).
 *
 * A roda usa um listener **nativo** de `wheel`, e não `onWheel` do React: o
 * React registra esse handler como passivo, e um listener passivo não pode
 * chamar `preventDefault` — a rolagem da página (ou de uma lista por trás do
 * palco) andaria junto com o zoom.
 *
 * `acabouDeArrastar` existe porque o mesmo elemento serve dois gestos que
 * competem: o `TileDeVoz` usa 1 clique para focar e 2 para tela cheia, e um
 * arrasto que termina embaixo do ponteiro dispara um `click` do próprio DOM
 * (não é um gesto novo, é o navegador interpretando o pointerup como clique).
 * Sem separar os dois, arrastar a imagem ampliada roubaria o foco do palco ou
 * abriria a tela cheia. Por isso a função **lê e zera**: o tile só precisa
 * saber, no seu `onClick`/`onDoubleClick`, se o gesto que acabou de terminar
 * foi arrasto — e só uma vez, senão o próximo clique de verdade herdaria a
 * resposta do arrasto anterior.
 */
export function useZoomDaTransmissao(
  caixa: RefObject<HTMLElement | null>,
  ativo: boolean,
  /** muda quando a transmissão muda (ex.: trackSid); zera o zoom */
  chave?: string,
): {
  ajuste: Ajuste;
  ampliado: boolean;
  percentual: number;
  podeAmpliar: boolean;
  podeReduzir: boolean;
  estilo: CSSProperties;
  ampliar: () => void;
  reduzir: () => void;
  redefinir: () => void;
  acabouDeArrastar: () => boolean;
  onPointerDown: (e: PointerEventReact) => void;
} {
  const [ajuste, setAjuste] = useState<Ajuste>(AJUSTE_INICIAL);
  const [emArrasto, setEmArrasto] = useState(false);

  const viewportAtual = useCallback((): Viewport => {
    const r = caixa.current?.getBoundingClientRect();
    return { largura: r?.width ?? 1, altura: r?.height ?? 1 };
  }, [caixa]);

  // troca de transmissão ou saída do modo com zoom: volta ao repouso, senão o
  // próximo vídeo herdaria a ampliação e o deslocamento do anterior
  useEffect(() => {
    setAjuste(AJUSTE_INICIAL);
  }, [chave]);
  useEffect(() => {
    if (!ativo) setAjuste(AJUSTE_INICIAL);
  }, [ativo]);

  // a caixa muda de tamanho (redimensionar janela, sair/entrar em tela cheia)
  // sem que ninguém rode a roda: sem isto a imagem ampliada podia ficar
  // deslocada para fora do novo tamanho, e `limitar` é justamente o que a
  // traz de volta para dentro
  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setAjuste((a) => limitar(a, { largura: r.width, altura: r.height }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [caixa]);

  // listener nativo (ver comentário de topo) — só existe enquanto `ativo`
  useEffect(() => {
    const el = caixa.current;
    if (!el || !ativo) return;
    const aoRodar = (e: WheelEvent) => {
      // sempre prevenir enquanto ativo: senão a página (ou uma lista atrás do
      // palco) rola junto com o zoom
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const foco: Ponto = { x: e.clientX - r.left, y: e.clientY - r.top };
      const viewport: Viewport = { largura: r.width, altura: r.height };
      // `ctrlKey` não é filtrado: é assim que a pinça de trackpad chega ao
      // Chrome, e deve ampliar no cursor igual à roda comum
      const fator = fatorDaRoda(e.deltaY, e.deltaMode);
      setAjuste((a) => comZoom(a, fator, foco, viewport));
    };
    el.addEventListener("wheel", aoRodar, { passive: false });
    return () => el.removeEventListener("wheel", aoRodar);
  }, [caixa, ativo]);

  // arrasto: os listeners de move/up vivem na `window` (não em props React),
  // porque o ponteiro pode sair da caixa em pleno gesto — `setPointerCapture`
  // garante que os eventos continuem chegando mesmo assim
  const pararArrasto = useRef<(() => void) | null>(null);
  useEffect(() => () => pararArrasto.current?.(), []);

  const acabouDeArrastarRef = useRef(false);
  const acabouDeArrastar = useCallback(() => {
    const valor = acabouDeArrastarRef.current;
    acabouDeArrastarRef.current = false;
    return valor;
  }, []);

  const onPointerDown = useCallback(
    (e: PointerEventReact) => {
      if (!ativo || ehOriginal(ajuste)) return; // só arrasta o que está ampliado
      if (e.button !== 0) return; // só botão esquerdo
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return; // toque é do celular
      const alvo = e.target as HTMLElement | null;
      // os controles de dentro do tile (fixar, tela cheia, menu) não podem
      // virar arrasto — mas sem `stopPropagation`, para eles continuarem
      // recebendo o próprio pointerdown normalmente
      if (alvo?.closest?.("button, [role='menu'], a")) return;

      const pointerId = e.pointerId;
      const alvoDoArrasto = e.currentTarget as HTMLElement;
      alvoDoArrasto.setPointerCapture?.(pointerId);

      const inicio: Ponto = { x: e.clientX, y: e.clientY };
      let ultimo = inicio;
      let passouDoLimiar = false;
      setEmArrasto(true);

      const aoMover = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        const atual: Ponto = { x: ev.clientX, y: ev.clientY };
        const dx = atual.x - ultimo.x;
        const dy = atual.y - ultimo.y;
        ultimo = atual;
        if (!passouDoLimiar) {
          // 4px: abaixo disso é a trepidação normal de um clique, não arrasto
          const total = Math.hypot(atual.x - inicio.x, atual.y - inicio.y);
          if (total <= 4) return;
          passouDoLimiar = true;
        }
        setAjuste((a) => comPan(a, dx, dy, viewportAtual()));
      };

      const encerrar = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        limpar();
      };

      function limpar() {
        window.removeEventListener("pointermove", aoMover);
        window.removeEventListener("pointerup", encerrar);
        window.removeEventListener("pointercancel", encerrar);
        pararArrasto.current = null;
        setEmArrasto(false);
        // só marca "acabou de arrastar" se de fato passou do limiar — um
        // clique rápido (sem soltar acima de 4px) precisa continuar sendo
        // clique para o tile
        if (passouDoLimiar) acabouDeArrastarRef.current = true;
      }

      window.addEventListener("pointermove", aoMover);
      window.addEventListener("pointerup", encerrar);
      window.addEventListener("pointercancel", encerrar);
      pararArrasto.current = limpar;
    },
    [ativo, ajuste, viewportAtual],
  );

  const ampliar = useCallback(() => {
    setAjuste((a) => comBotao(a, 1, viewportAtual()));
  }, [viewportAtual]);
  const reduzir = useCallback(() => {
    setAjuste((a) => comBotao(a, -1, viewportAtual()));
  }, [viewportAtual]);
  const redefinir = useCallback(() => setAjuste(AJUSTE_INICIAL), []);

  const ampliado = !ehOriginal(ajuste);
  const estilo: CSSProperties = {
    transform: transformDe(ajuste),
    transformOrigin: "center",
    ...(ampliado ? { willChange: "transform", cursor: emArrasto ? "grabbing" : "grab" } : {}),
  };

  return {
    ajuste,
    ampliado,
    percentual: percentualDe(ajuste),
    podeAmpliar: podeAmpliarAjuste(ajuste),
    podeReduzir: podeReduzirAjuste(ajuste),
    estilo,
    ampliar,
    reduzir,
    redefinir,
    acabouDeArrastar,
    onPointerDown,
  };
}
