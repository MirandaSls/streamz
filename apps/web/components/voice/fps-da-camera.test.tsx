import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CameraFps } from "@streamz/shared";

/*
 * Render sem DOM, como `lib/__tests__/markdown.test.tsx`: `renderToStaticMarkup`
 * para o que aparece, e a árvore de elementos percorrida à mão para achar o
 * `onClick` de um segmento — não há DOM para clicar. A store da voz é trocada
 * por uma falsa (a de verdade puxa LiveKit e socket) e o `useEhMobile` por
 * `false`, o que deixa `Segmento` sem hook nenhum e chamável como função.
 */

const falsas = vi.hoisted(() => {
  const voz = { cameraFps: 30 as CameraFps, setCameraFps: vi.fn() };
  const hook = <T,>(sel: (s: typeof voz) => T): T => sel(voz);
  return { voz, useVoice: Object.assign(hook, { getState: () => voz }) };
});

vi.mock("@/stores/voice", () => ({ useVoice: falsas.useVoice }));
vi.mock("@/hooks/useEhMobile", () => ({ useEhMobile: () => false }));

import { SeletorDeFpsDaCamera, fpsDoValor, restricoesDaPrevia } from "./fps-da-camera";

/** Expande componentes-função e junta os `<button>` que sobram. */
function botoes(no: ReactNode): ReactElement<{ onClick: () => void; children: ReactNode }>[] {
  if (Array.isArray(no)) return no.flatMap(botoes);
  if (!isValidElement(no)) return [];
  const el = no as ReactElement<{ children?: ReactNode }>;
  if (typeof el.type === "function") {
    return botoes((el.type as (p: unknown) => ReactNode)(el.props));
  }
  const proprios = el.type === "button" ? [el as never] : [];
  return [...proprios, ...botoes(el.props.children)];
}

beforeEach(() => {
  falsas.voz.cameraFps = 30;
  falsas.voz.setCameraFps.mockReset();
});

describe("SeletorDeFpsDaCamera", () => {
  it("mostra as quatro taxas e marca a atual", () => {
    const html = renderToStaticMarkup(<SeletorDeFpsDaCamera />);
    for (const fps of [15, 24, 30, 60]) expect(html).toContain(`>${fps} fps</button>`);
    expect(html).toContain('aria-label="Taxa de quadros da câmera"');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-pressed="true"[^>]*>30 fps</);
  });

  it("acompanha a store quando a taxa muda", () => {
    falsas.voz.cameraFps = 60;
    expect(renderToStaticMarkup(<SeletorDeFpsDaCamera />)).toMatch(
      /aria-pressed="true"[^>]*>60 fps</,
    );
  });

  it("clicar num segmento chama setCameraFps com o número", () => {
    const lista = botoes(<SeletorDeFpsDaCamera />);
    expect(lista).toHaveLength(4);
    lista.find((b) => b.props.children === "24 fps")!.props.onClick();
    expect(falsas.voz.setCameraFps).toHaveBeenCalledWith(24);
  });
});

describe("fpsDoValor", () => {
  it("só aceita as taxas oferecidas", () => {
    expect(fpsDoValor("15")).toBe(15);
    expect(fpsDoValor("45")).toBeNull();
  });
});

describe("restricoesDaPrevia", () => {
  it("pede a taxa como ideal, sem resolução abaixo de 60", () => {
    expect(restricoesDaPrevia(null, 30)).toEqual({ frameRate: { ideal: 30 } });
  });

  it("com 60 pede 1280×720 e mantém o aparelho escolhido", () => {
    expect(restricoesDaPrevia("cam-1", 60)).toEqual({
      deviceId: { exact: "cam-1" },
      frameRate: { ideal: 60 },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    });
  });
});
