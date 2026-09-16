import type { ConfigService } from "@nestjs/config";
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { UpdatesService } from "./updates.service";

/**
 * `updates/macos.json` (gravado por `POST /updates/macos`) tem precedência
 * sobre `MACOS_UPDATE_*` do ambiente, é relido quando muda e, se inválido,
 * cai de volta no ambiente.
 */

let pasta = "";

function servico(ambiente: Record<string, string>): UpdatesService {
  const tudo = { UPDATE_DIR: pasta, ...ambiente };
  return new UpdatesService({ get: (k: string) => tudo[k as keyof typeof tudo] } as unknown as ConfigService);
}

const AMBIENTE = {
  MACOS_UPDATE_VERSION: "1.0.0",
  MACOS_UPDATE_URL: "https://api/env.app.tar.gz",
  MACOS_UPDATE_SIGNATURE: "sig-do-env",
};

function gravar(conteudo: unknown, mtime: number) {
  const caminho = join(pasta, "macos.json");
  writeFileSync(caminho, typeof conteudo === "string" ? conteudo : JSON.stringify(conteudo));
  utimesSync(caminho, mtime, mtime);
}

beforeEach(() => {
  pasta = mkdtempSync(join(tmpdir(), "manifesto-macos-"));
});
afterEach(() => rmSync(pasta, { recursive: true, force: true }));

describe("UpdatesService — manifesto publicado do macOS", () => {
  it("sem o arquivo, usa o ambiente (como antes)", () => {
    const s = servico(AMBIENTE);
    expect(s.manifesto("darwin-aarch64", "0.1.0")?.platforms["darwin-aarch64"].url).toBe(AMBIENTE.MACOS_UPDATE_URL);
    expect(s.estadoDoDesktop("MACOS")).toEqual({ ativo: true, versao: "1.0.0", origem: "ambiente" });
  });

  it("com o arquivo, ele vence o ambiente, nas duas arquiteturas", () => {
    gravar({ version: "1.2.0", url: "https://api/novo.app.tar.gz", signature: "sig-nova", notes: "n", pubDate: "2026-09-16T00:00:00.000Z" }, 1000);
    const s = servico(AMBIENTE);
    for (const p of ["darwin-aarch64", "darwin-x86_64"]) {
      expect(s.manifesto(p, "1.0.0")).toEqual({
        version: "1.2.0",
        notes: "n",
        pub_date: "2026-09-16T00:00:00.000Z",
        platforms: { [p]: { signature: "sig-nova", url: "https://api/novo.app.tar.gz" } },
      });
    }
    expect(s.isConfigured("MACOS")).toBe(true);
    expect(s.estadoDoDesktop("MACOS")).toEqual({ ativo: true, versao: "1.2.0", origem: "manifesto" });
    // não afeta os outros desktops
    expect(s.manifesto("linux-x86_64", "0.0.1")).toBeNull();
    expect(s.isConfigured()).toBe(false);
  });

  it("funciona sem nenhuma variável MACOS_UPDATE_*", () => {
    gravar({ version: "1.2.0", url: "u", signature: "s" }, 1000);
    const m = servico({}).manifesto("darwin-x86_64", "1.1.0");
    expect(m?.version).toBe("1.2.0");
    expect(m?.notes).toBe("Correções e melhorias.");
  });

  it("relê quando o arquivo muda, sem reiniciar", () => {
    const s = servico(AMBIENTE);
    gravar({ version: "1.2.0", url: "u", signature: "s" }, 1000);
    expect(s.manifesto("darwin-aarch64", "0.0.1")?.version).toBe("1.2.0");
    gravar({ version: "1.3.0", url: "u", signature: "s" }, 2000);
    expect(s.manifesto("darwin-aarch64", "0.0.1")?.version).toBe("1.3.0");
    rmSync(join(pasta, "macos.json"));
    expect(s.manifesto("darwin-aarch64", "0.0.1")?.version).toBe("1.0.0");
  });

  it("arquivo inválido cai de volta no ambiente", () => {
    const s = servico(AMBIENTE);
    gravar("{ isto não é json", 1000);
    expect(s.manifesto("darwin-aarch64", "0.0.1")?.version).toBe("1.0.0");
    gravar({ version: "1.2.0", url: "u" }, 2000); // sem assinatura
    expect(s.manifesto("darwin-aarch64", "0.0.1")?.version).toBe("1.0.0");
  });
});
