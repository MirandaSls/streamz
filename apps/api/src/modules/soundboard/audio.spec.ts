import { describe, expect, it } from "vitest";
import { extensaoDeAudio, sniffAudio, validarAudio } from "./audio";
import { intervaloRespeitado } from "./intervalo";

/** MP3 com tag ID3 na frente — o caso comum de um arquivo exportado. */
function mp3ComId3(bytes = 128): Buffer {
  const b = Buffer.alloc(bytes);
  b.write("ID3", 0, "ascii");
  return b;
}

/** MP3 "cru": começa direto num quadro (sincronismo `FF Ex`). */
function mp3CruDeQuadro(bytes = 128): Buffer {
  const b = Buffer.alloc(bytes);
  b[0] = 0xff;
  b[1] = 0xfb;
  return b;
}

function ogg(bytes = 128): Buffer {
  const b = Buffer.alloc(bytes);
  b.write("OggS", 0, "ascii");
  return b;
}

function wav(bytes = 128): Buffer {
  const b = Buffer.alloc(bytes);
  b.write("RIFF", 0, "ascii");
  b.write("WAVE", 8, "ascii");
  return b;
}

describe("sniffAudio", () => {
  it("reconhece os três formatos que o navegador toca sem plugin", () => {
    expect(sniffAudio(mp3ComId3())).toBe("audio/mpeg");
    expect(sniffAudio(mp3CruDeQuadro())).toBe("audio/mpeg");
    expect(sniffAudio(ogg())).toBe("audio/ogg");
    expect(sniffAudio(wav())).toBe("audio/wav");
  });

  it("não confunde WAV com os outros RIFF (WebP, AVI)", () => {
    const webp = Buffer.alloc(32);
    webp.write("RIFF", 0, "ascii");
    webp.write("WEBP", 8, "ascii");
    expect(sniffAudio(webp)).toBeNull();
  });

  it("recusa o arquivo de 0xFF cheio, que casaria com o sincronismo do MP3", () => {
    expect(sniffAudio(Buffer.alloc(64, 0xff))).toBeNull();
  });

  it("recusa o que não é áudio", () => {
    const png = Buffer.alloc(64);
    png.write("\x89PNG\r\n\x1a\n", 0, "binary");
    expect(sniffAudio(png)).toBeNull();
    expect(sniffAudio(Buffer.alloc(0))).toBeNull();
  });
});

describe("validarAudio", () => {
  it("aceita um MP3 dentro do teto", () => {
    expect(validarAudio(mp3ComId3(), 512 * 1024)).toEqual({ ok: true, mime: "audio/mpeg" });
  });

  it("marca `grande` quando passa do teto — é o que vira 413", () => {
    const r = validarAudio(mp3ComId3(2048), 1024);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.grande).toBe(true);
  });

  it("recusa arquivo vazio e formato desconhecido", () => {
    expect(validarAudio(Buffer.alloc(0), 1024).ok).toBe(false);
    expect(validarAudio(Buffer.from("nada disso"), 1024).ok).toBe(false);
  });
});

describe("extensaoDeAudio", () => {
  it("dá o sufixo da chave no bucket", () => {
    expect(extensaoDeAudio("audio/mpeg")).toBe("mp3");
    expect(extensaoDeAudio("audio/ogg")).toBe("ogg");
    expect(extensaoDeAudio("audio/wav")).toBe("wav");
  });
});

describe("intervaloRespeitado", () => {
  it("deixa passar o primeiro som", () => {
    expect(intervaloRespeitado(undefined, 1_000, 1_000)).toBe(true);
  });

  it("segura o segundo dentro da janela e libera depois dela", () => {
    expect(intervaloRespeitado(1_000, 1_500, 1_000)).toBe(false);
    expect(intervaloRespeitado(1_000, 1_999, 1_000)).toBe(false);
    expect(intervaloRespeitado(1_000, 2_000, 1_000)).toBe(true);
  });

  it("relógio que andou para trás não vira passe livre nem bloqueio eterno", () => {
    expect(intervaloRespeitado(5_000, 1_000, 1_000)).toBe(true);
  });
});
