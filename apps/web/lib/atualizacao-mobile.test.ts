/**
 * A decisão do card de atualização do celular, sem rede.
 *
 * O caso que estes testes travam é o "meio manifesto": a rota é a mesma do
 * atualizador do Tauri e o corpo pode vir sem a chave da nossa plataforma (por
 * exemplo se um dia alguém publicar só `windows-x86_64`). Um card com botão que
 * não leva a lugar nenhum é pior que card nenhum.
 */
import { describe, expect, it } from "vitest";
import { checarAtualizacaoDoAndroid, novidadeDoManifesto } from "./atualizacao-mobile";

const MANIFESTO = {
  version: "1.2.0",
  notes: "Correções e melhorias.",
  pub_date: "2026-09-09T00:00:00.000Z",
  platforms: {
    "android-universal": { signature: "", url: "https://streamz.chat/download" },
  },
};

describe("novidadeDoManifesto", () => {
  it("vira card quando há versão e URL", () => {
    expect(novidadeDoManifesto(MANIFESTO)).toEqual({
      versao: "1.2.0",
      notas: "Correções e melhorias.",
      url: "https://streamz.chat/download",
    });
  });

  it("assinatura vazia não atrapalha: no Android não há nada a verificar", () => {
    expect(novidadeDoManifesto(MANIFESTO)?.url).toBe("https://streamz.chat/download");
  });

  it("sem a chave da nossa plataforma, não há card", () => {
    const soWindows = {
      ...MANIFESTO,
      platforms: { "windows-x86_64": { signature: "s", url: "https://exemplo/app.exe" } },
    };
    expect(novidadeDoManifesto(soWindows)).toBeNull();
  });

  it("sem URL, não há card", () => {
    const semUrl = {
      ...MANIFESTO,
      platforms: { "android-universal": { signature: "", url: "   " } },
    };
    expect(novidadeDoManifesto(semUrl)).toBeNull();
  });

  it("nada vira nada", () => {
    expect(novidadeDoManifesto(null)).toBeNull();
    expect(novidadeDoManifesto({ version: "" })).toBeNull();
  });

  it("notas em branco viram null, não string vazia", () => {
    expect(novidadeDoManifesto({ ...MANIFESTO, notes: "   " })?.notas).toBeNull();
  });
});

describe("checarAtualizacaoDoAndroid", () => {
  const resposta = (status: number, corpo?: unknown) =>
    ({
      status,
      ok: status >= 200 && status < 300,
      json: async () => corpo,
    }) as Response;

  it("devolve a novidade quando a API oferece uma", async () => {
    const novidade = await checarAtualizacaoDoAndroid("1.1.0", async () =>
      resposta(200, MANIFESTO),
    );
    expect(novidade?.versao).toBe("1.2.0");
  });

  it("204 é 'está em dia'", async () => {
    expect(await checarAtualizacaoDoAndroid("1.2.0", async () => resposta(204))).toBeNull();
  });

  it("erro de rede não derruba nada", async () => {
    const explodir = async () => {
      throw new Error("sem rede");
    };
    expect(await checarAtualizacaoDoAndroid("1.1.0", explodir)).toBeNull();
  });

  it("corpo que não é JSON não derruba nada", async () => {
    const lixo = async () =>
      ({
        status: 200,
        ok: true,
        json: async () => {
          throw new SyntaxError("não é JSON");
        },
      }) as unknown as Response;
    expect(await checarAtualizacaoDoAndroid("1.1.0", lixo)).toBeNull();
  });

  it("sem saber a versão instalada, nem pergunta", async () => {
    let chamou = false;
    await checarAtualizacaoDoAndroid("", async () => {
      chamou = true;
      return resposta(200, MANIFESTO);
    });
    expect(chamou).toBe(false);
  });
});
