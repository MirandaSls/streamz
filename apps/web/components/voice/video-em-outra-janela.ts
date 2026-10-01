"use client";

import type { ElementInfo, RemoteVideoTrack, Track } from "livekit-client";
import { livekitCarregado } from "@/lib/livekit";
import { janelaDe } from "@/lib/outra-janela";

/**
 * Prende um `<video>` que mora **noutra janela** (as janelas soltas da chamada)
 * ao `adaptiveStream` do LiveKit. Devolve a limpeza, que tem de rodar **antes**
 * do `detach`.
 *
 * Por que não basta o `attach`: com `adaptiveStream` ligado na sala
 * (`stores/voice.ts`), o `attach` cria um observador de visibilidade para o
 * elemento — um `IntersectionObserver` da **janela principal** — e o SDK pede
 * ao servidor para pausar a faixa quando nenhum elemento dela está visível. Um
 * elemento noutra janela nunca cruza o viewport da principal: o vídeo
 * congelaria no primeiro quadro (ou nem começaria). E mesmo visível, o SDK
 * pausa tudo quando a **aba principal** vai para segundo plano
 * (`pauseVideoInBackground`) — exatamente o momento em que alguém abre uma
 * janela solta.
 *
 * A saída é a API que o SDK tem para isso: `observeElementInfo` com um
 * `ElementInfo` nosso (`infoDaJanela`), que mede o elemento na janela dele e
 * responde à visibilidade **dela**. O do `attach` continua lá, dizendo
 * "invisível"; o SDK considera visível se **algum** estiver.
 *
 * O `attach` também decide `playsInline` e o empurrão de `play()` do Safari/
 * Firefox com `instanceof HTMLVideoElement` — falso para elemento de outro
 * realm. Os atributos vêm do JSX de quem chama; o `play()` vem daqui. Faixa
 * muda, sem áudio: o autoplay não é bloqueado.
 */
export function prenderVideoEmOutraJanela(track: Track, el: HTMLVideoElement): () => void {
  el.play().catch(() => {
    /* o `autoPlay` segue tentando; não há o que avisar */
  });

  // Faixa local (a minha câmera, a minha tela no navegador) não tem
  // adaptiveStream: nada a observar.
  if (!ehFaixaDeVideoRemota(track) || !track.isAdaptiveStream) return () => {};
  const info = infoDaJanela(el, janelaDe(el));
  track.observeElementInfo(info);
  // o `detach` também remove infos com `element === el`, e parar duas vezes é
  // inofensivo; deixar o nosso sem `stopObserving` vazaria o `ResizeObserver`
  // e o ouvinte de visibilidade da janela
  return () => track.stopObservingElementInfo(info);
}

/**
 * `track instanceof RemoteVideoTrack`, sem importar o SDK como valor (ver
 * `lib/livekit.ts`): sem ele carregado não há sala, e sem sala não há faixa
 * remota nenhuma — a resposta é `false`.
 */
export function ehFaixaDeVideoRemota(track: Track): track is RemoteVideoTrack {
  const lk = livekitCarregado();
  return !!lk && track instanceof lk.RemoteVideoTrack;
}

/**
 * O `ElementInfo` de um `<video>` que mora numa janela solta.
 *
 * - **Tamanho:** medido no próprio elemento, com um `ResizeObserver` **da
 *   janela solta** — é o tamanho dela que decide a camada do simulcast pedida
 *   (janela grande = camada alta). O `ResizeObserver` da principal não é
 *   garantido para elemento de outro documento.
 * - **Visível:** a janela não estar minimizada/oculta
 *   (`document.visibilityState` **dela**). Minimizar pausa de verdade — é
 *   banda que ninguém está vendo —, e voltar retoma.
 * - **`pictureInPicture` junto com `visible`:** é o único sinal que o SDK
 *   deixa passar por cima da pausa de segundo plano da aba **principal**
 *   (`updateVisibility`: `visível && !emSegundoPlano || pip`). Sem ele, a
 *   janela congelaria ao trocar de aba na principal.
 *
 * Vale para os dois modos (Document PiP e popup). No PiP o `attach` daria conta
 * sozinho, mas mede a visibilidade uma vez e depende de um evento `enter` que,
 * com a janela já aberta antes do portal, não vem mais. Um caminho só, que
 * funciona nos dois, é mais barato de manter do que dois que falham de jeitos
 * diferentes.
 */
function infoDaJanela(el: HTMLVideoElement, win: Window): ElementInfo {
  const doc = win.document;
  let observador: ResizeObserver | null = null;

  const aoMudarVisibilidade = () => {
    const visivel = doc.visibilityState !== "hidden";
    if (visivel === info.visible) return;
    info.visible = visivel;
    info.pictureInPicture = visivel;
    info.visibilityChangedAt = Date.now();
    info.handleVisibilityChanged?.();
  };

  const info: ElementInfo = {
    element: el,
    width: () => el.clientWidth,
    height: () => el.clientHeight,
    visible: doc.visibilityState !== "hidden",
    pictureInPicture: doc.visibilityState !== "hidden",
    visibilityChangedAt: undefined,
    observe() {
      // o construtor da própria janela: observador e elemento no mesmo realm
      const Construtor =
        (win as Window & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver ??
        ResizeObserver;
      observador = new Construtor(() => info.handleResize?.());
      observador.observe(el);
      doc.addEventListener("visibilitychange", aoMudarVisibilidade);
    },
    stopObserving() {
      observador?.disconnect();
      observador = null;
      doc.removeEventListener("visibilitychange", aoMudarVisibilidade);
    },
  };
  return info;
}
