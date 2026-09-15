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

  it("aceita o pacote do updater do macOS, com o sufixo composto", () => {
    expect(caminhoDoInstalador(DIR, "Streamz.app.tar.gz")).toBe("/app/updates/Streamz.app.tar.gz");
    expect(caminhoDoInstalador(DIR, "Streamz_1.2.0_universal.app.tar.gz")).toBe(
      "/app/updates/Streamz_1.2.0_universal.app.tar.gz",
    );
  });

  it("não abre a pasta para qualquer .gz ou .tar.gz", () => {
    // `extname` destes é `.gz`, igual ao do pacote do mac: é o caso que a
    // comparação por sufixo existe para recusar
    expect(caminhoDoInstalador(DIR, "x.gz")).toBeNull();
    expect(caminhoDoInstalador(DIR, "backup.tar.gz")).toBeNull();
    expect(caminhoDoInstalador(DIR, "dump.sql.gz")).toBeNull();
    // nem o nome que é só o sufixo
    expect(caminhoDoInstalador(DIR, ".app.tar.gz")).toBeNull();
  });

  it("aceita o AppImage sem diferenciar caixa", () => {
    expect(caminhoDoInstalador(DIR, "Streamz_1.2.0_amd64.AppImage")).toBe(
      "/app/updates/Streamz_1.2.0_amd64.AppImage",
    );
    expect(caminhoDoInstalador(DIR, "streamz.appimage")).toBe("/app/updates/streamz.appimage");
    expect(caminhoDoInstalador(DIR, "Streamz.APP.TAR.GZ")).toBe("/app/updates/Streamz.APP.TAR.GZ");
  });

  it("não serve a assinatura nem o que só parece AppImage", () => {
    // o `.sig` vai no manifesto, lido do ambiente; o cliente nunca o baixa daqui
    expect(caminhoDoInstalador(DIR, "Streamz.AppImage.sig")).toBeNull();
    expect(caminhoDoInstalador(DIR, "Streamz.app.tar.gz.sig")).toBeNull();
    expect(caminhoDoInstalador(DIR, "AppImage")).toBeNull();
  });

  it("os sufixos novos também não sobem de diretório", () => {
    // mesma semântica do `.exe`: o `basename` descarta o `../`, e o que sobra
    // continua dentro da pasta — nunca o arquivo de cima
    expect(caminhoDoInstalador(DIR, "../a.AppImage")).toBe("/app/updates/a.AppImage");
    expect(caminhoDoInstalador(DIR, "../../etc/Streamz.app.tar.gz")).toBe(
      "/app/updates/Streamz.app.tar.gz",
    );
    expect(caminhoDoInstalador(DIR, "../")).toBeNull();
  });
});
