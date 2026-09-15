import { describe, expect, it } from "vitest";
import {
  CAMERA_FPS_OPCOES,
  CAMERA_FPS_PADRAO,
  CAMERA_QUALITY,
  MEDIA_QUALITY,
  SCREEN_QUALITY_PADRAO,
} from "@streamz/shared";
import {
  camadaBaixaDaCamera,
  capturaDaCamera,
  encodingsDaCamera,
  lerCameraFps,
  lerScreenQuality,
  mesclarEncodings,
  publicacaoDaCamera,
} from "./qualidade-de-camera";

describe("contrato da câmera", () => {
  it("o padrão de 30 fps é o mesmo teto de `MEDIA_QUALITY.camera`", () => {
    expect(CAMERA_FPS_PADRAO).toBe(30);
    expect(MEDIA_QUALITY.camera).toEqual(CAMERA_QUALITY[30]);
  });

  it("60 fps captura em 720p; o resto em 1080p", () => {
    expect(capturaDaCamera(60)).toEqual({ width: 1280, height: 720, frameRate: 60 });
    for (const fps of [15, 24, 30] as const) {
      expect(capturaDaCamera(fps)).toEqual({ width: 1920, height: 1080, frameRate: fps });
    }
  });

  it("menos quadros, menos bitrate", () => {
    expect(CAMERA_QUALITY[15].maxBitrate).toBeLessThan(CAMERA_QUALITY[24].maxBitrate);
    expect(CAMERA_QUALITY[24].maxBitrate).toBeLessThan(CAMERA_QUALITY[30].maxBitrate);
  });

  it("a padrão da tela é 1080p30", () => {
    expect(SCREEN_QUALITY_PADRAO).toBe("1080p30");
  });
});

describe("preferências guardadas", () => {
  it("lê o fps guardado e cai no padrão com lixo", () => {
    for (const fps of CAMERA_FPS_OPCOES) expect(lerCameraFps(String(fps))).toBe(fps);
    expect(lerCameraFps(null)).toBe(30);
    expect(lerCameraFps("")).toBe(30);
    expect(lerCameraFps("25")).toBe(30);
    expect(lerCameraFps("abc")).toBe(30);
    expect(lerCameraFps("\"60\"")).toBe(30);
  });

  it("lê o preset de tela guardado e cai no padrão com lixo", () => {
    expect(lerScreenQuality("1440p60")).toBe("1440p60");
    expect(lerScreenQuality("720p30")).toBe("720p30");
    expect(lerScreenQuality(null)).toBe("1080p30");
    expect(lerScreenQuality("4k60")).toBe("1080p30");
    // chave herdada do protótipo não é preset
    expect(lerScreenQuality("toString")).toBe("1080p30");
  });
});

describe("publicação", () => {
  it("declara só a camada de 360p: duas codificações, e não três", () => {
    const { videoEncoding, camadas } = publicacaoDaCamera(30);
    expect(videoEncoding).toEqual({ maxBitrate: 3_000_000, maxFramerate: 30 });
    expect(camadas).toHaveLength(1);
    expect(camadas[0]).toMatchObject({ width: 640, height: 360 });
  });

  it("a camada baixa nunca passa do fps escolhido", () => {
    expect(camadaBaixaDaCamera(15).frameRate).toBe(15);
    for (const fps of CAMERA_FPS_OPCOES) {
      expect(camadaBaixaDaCamera(fps).frameRate).toBeLessThanOrEqual(fps);
    }
  });
});

describe("encodings do sender", () => {
  it("sem alívio: a cheia com o teto do fps, a de 360p escalada do quadro real", () => {
    expect(encodingsDaCamera({ fps: 30, ladoMenor: 1080, quantidade: 2, aliviar: false })).toEqual([
      { maxBitrate: 450_000, maxFramerate: 20, scaleResolutionDownBy: 3 },
      { maxBitrate: 3_000_000, maxFramerate: 30, scaleResolutionDownBy: 1 },
    ]);
  });

  it("com a tela no ar: a cheia desce a 720p e 15 fps, e a baixa acompanha o fps", () => {
    expect(encodingsDaCamera({ fps: 30, ladoMenor: 1080, quantidade: 2, aliviar: true })).toEqual([
      { maxBitrate: 450_000, maxFramerate: 15, scaleResolutionDownBy: 3 },
      { maxBitrate: 1_000_000, maxFramerate: 15, scaleResolutionDownBy: 1.5 },
    ]);
  });

  it("60 fps já em 720p: o alívio só corta quadros", () => {
    const [baixa, cheia] = encodingsDaCamera({ fps: 60, ladoMenor: 720, quantidade: 2, aliviar: true });
    expect(cheia).toEqual({ maxBitrate: 1_000_000, maxFramerate: 15, scaleResolutionDownBy: 1 });
    expect(baixa).toMatchObject({ maxFramerate: 15, scaleResolutionDownBy: 2 });
  });

  it("60 fps sem alívio: a baixa fica nos 20 fps dela", () => {
    const [baixa, cheia] = encodingsDaCamera({ fps: 60, ladoMenor: 720, quantidade: 2, aliviar: false });
    expect(cheia).toEqual({ maxBitrate: 2_500_000, maxFramerate: 60, scaleResolutionDownBy: 1 });
    expect(baixa.maxFramerate).toBe(20);
  });

  it("15 fps escolhido: nenhuma camada acima de 15", () => {
    const camadas = encodingsDaCamera({ fps: 15, ladoMenor: 1080, quantidade: 2, aliviar: false });
    for (const c of camadas) expect(c.maxFramerate).toBeLessThanOrEqual(15);
  });

  it("webcam que entregou menos do que se pediu não é ampliada", () => {
    const [baixa, cheia] = encodingsDaCamera({ fps: 30, ladoMenor: 480, quantidade: 2, aliviar: true });
    expect(cheia.scaleResolutionDownBy).toBe(1);
    expect(baixa.scaleResolutionDownBy).toBeCloseTo(480 / 360);
  });

  it("sem simulcast (uma codificação) só a cheia", () => {
    expect(encodingsDaCamera({ fps: 24, ladoMenor: 1080, quantidade: 1, aliviar: false })).toEqual([
      { maxBitrate: 2_500_000, maxFramerate: 24, scaleResolutionDownBy: 1 },
    ]);
    expect(encodingsDaCamera({ fps: 24, ladoMenor: 1080, quantidade: 0, aliviar: false })).toEqual([]);
  });

  it("três codificações (publicação antiga): em ordem crescente e nenhuma acima da cheia", () => {
    const camadas = encodingsDaCamera({ fps: 30, ladoMenor: 1080, quantidade: 3, aliviar: true });
    expect(camadas.map((c) => c.scaleResolutionDownBy)).toEqual([6, 3, 1.5]);
    for (const c of camadas) expect(c.maxFramerate).toBeLessThanOrEqual(15);
  });

  it("lado desconhecido usa o do preset", () => {
    const [, cheia] = encodingsDaCamera({ fps: 30, ladoMenor: 0, quantidade: 2, aliviar: true });
    expect(cheia.scaleResolutionDownBy).toBe(1.5);
  });
});

describe("mesclarEncodings", () => {
  const ajustes = encodingsDaCamera({ fps: 30, ladoMenor: 1080, quantidade: 2, aliviar: true });

  it("mantém rid e active, troca só os três campos", () => {
    const r = mesclarEncodings(
      [
        { rid: "q", active: true, maxBitrate: 450_000, maxFramerate: 20, scaleResolutionDownBy: 3 },
        { rid: "h", active: false, maxBitrate: 3_000_000, maxFramerate: 30, scaleResolutionDownBy: 1 },
      ],
      ajustes,
    );
    expect(r).toEqual([
      { rid: "q", active: true, maxBitrate: 450_000, maxFramerate: 15, scaleResolutionDownBy: 3 },
      { rid: "h", active: false, maxBitrate: 1_000_000, maxFramerate: 15, scaleResolutionDownBy: 1.5 },
    ]);
  });

  it("não reacende a camada que o Firefox desligou", () => {
    const desligada = { rid: "q", active: false, maxBitrate: 10, scaleResolutionDownBy: 4 };
    const r = mesclarEncodings([desligada, { rid: "h" }], ajustes);
    expect(r?.[0]).toEqual(desligada);
  });

  it("número de camadas diferente não aplica nada", () => {
    expect(mesclarEncodings([{ rid: "q" }], ajustes)).toBeNull();
    expect(mesclarEncodings([], [])).toBeNull();
  });
});
