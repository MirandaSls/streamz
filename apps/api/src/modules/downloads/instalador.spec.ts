import { describe, expect, it } from "vitest";
import { escolherInstalador, type EntradaInstalador } from "./instalador";

function entrada(nome: string, mtime: string, tamanho = 1): EntradaInstalador {
  return { nome, mtime: new Date(mtime), tamanho };
}

describe("escolherInstalador", () => {
  it("preferência vence mtime: .deb mais novo que .AppImage, mas AppImage ganha", () => {
    const entradas = [
      entrada("Streamz_1.2.0_amd64.deb", "2026-09-15T12:00:00Z"),
      entrada("Streamz_1.1.0_amd64.AppImage", "2026-09-10T12:00:00Z"),
    ];
    const escolhido = escolherInstalador(entradas, [".appimage", ".deb", ".rpm"]);
    expect(escolhido?.nome).toBe("Streamz_1.1.0_amd64.AppImage");
  });

  it("dentro da mesma extensão, o mais recente decide", () => {
    const entradas = [
      entrada("Streamz_1.0.0_amd64.AppImage", "2026-09-01T12:00:00Z"),
      entrada("Streamz_1.2.0_amd64.AppImage", "2026-09-15T12:00:00Z"),
      entrada("Streamz_1.1.0_amd64.AppImage", "2026-09-10T12:00:00Z"),
    ];
    const escolhido = escolherInstalador(entradas, [".appimage", ".deb", ".rpm"]);
    expect(escolhido?.nome).toBe("Streamz_1.2.0_amd64.AppImage");
  });

  it("extensão em caixa mista é reconhecida", () => {
    const entradas = [entrada("Streamz_1.2.0_amd64.AppImage", "2026-09-15T12:00:00Z")];
    const escolhido = escolherInstalador(entradas, [".appimage", ".deb", ".rpm"]);
    expect(escolhido?.nome).toBe("Streamz_1.2.0_amd64.AppImage");
  });

  it("ignora .AppImage.sig e .app.tar.gz do atualizador", () => {
    const entradas = [
      entrada("Streamz_1.2.0_amd64.AppImage.sig", "2026-09-16T12:00:00Z"),
      entrada("Streamz_1.2.0_amd64.app.tar.gz", "2026-09-16T12:00:00Z"),
      entrada("Streamz_1.1.0_amd64.AppImage", "2026-09-10T12:00:00Z"),
    ];
    const escolhido = escolherInstalador(entradas, [".appimage", ".deb", ".rpm"]);
    expect(escolhido?.nome).toBe("Streamz_1.1.0_amd64.AppImage");
  });

  it("lista vazia devolve null", () => {
    expect(escolherInstalador([], [".exe", ".msi"])).toBeNull();
  });

  it("nenhum candidato bate com nenhuma extensão da preferência devolve null", () => {
    const entradas = [entrada("README.txt", "2026-09-15T12:00:00Z")];
    expect(escolherInstalador(entradas, [".exe", ".msi"])).toBeNull();
  });

  it("windows: .exe (NSIS) vence .msi mais novo", () => {
    const entradas = [
      entrada("Streamz_1.2.0_x64-setup.msi", "2026-09-15T12:00:00Z"),
      entrada("Streamz_1.1.0_x64-setup.exe", "2026-09-10T12:00:00Z"),
    ];
    const escolhido = escolherInstalador(entradas, [".exe", ".msi"]);
    expect(escolhido?.nome).toBe("Streamz_1.1.0_x64-setup.exe");
  });
});
