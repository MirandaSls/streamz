import { describe, expect, it } from "vitest";
import { caminhoDoInstalador } from "./arquivo";

const DIR = "/app/updates";

describe("caminhoDoInstalador", () => {
  it("aceita o instalador esperado", () => {
    expect(caminhoDoInstalador(DIR, "Streamz_0.0.3_x64-setup.exe")).toBe(
      "/app/updates/Streamz_0.0.3_x64-setup.exe",
    );
  });

  it("recusa subir de diretório", () => {
    // o caso que a rota existe para não permitir
    expect(caminhoDoInstalador(DIR, "../../etc/passwd")).toBeNull();
    expect(caminhoDoInstalador(DIR, "../secrets.exe")).toBe("/app/updates/secrets.exe");
  });

  it("recusa extensão que não é instalador", () => {
    expect(caminhoDoInstalador(DIR, "app.sh")).toBeNull();
    expect(caminhoDoInstalador(DIR, ".env")).toBeNull();
  });

  it("aceita .msi além de .exe", () => {
    expect(caminhoDoInstalador(DIR, "Streamz.msi")).toBe("/app/updates/Streamz.msi");
  });
});
