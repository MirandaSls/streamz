/**
 * A decisão do atualizador do celular, sem rede e sem DOM.
 *
 * Dois casos justificam o arquivo:
 *
 * 1. **O "meio manifesto".** A rota é a mesma do atualizador do Tauri e o corpo
 *    pode vir sem a chave da nossa plataforma, sem URL — ou, o que passou a
 *    importar de verdade, **sem o sha256**. Desde que o card deixou de só
 *    avisar e passou a instalar, um manifesto sem digest não é "um card meio
 *    inútil": é um `.apk` entregue ao instalador sem ninguém ter conferido o
 *    conteúdo. Por isso ele é tratado como manifesto inválido, e não como
 *    detalhe faltando.
 * 2. **Abertura × app aberto.** É a regra que o usuário pediu com essas
 *    palavras, e ela não tem como ser vista num teste de componente sem
 *    emulador: quem abriu o app agora não estava fazendo nada e pode baixar
 *    sozinho; quem já está dentro pode estar numa chamada, e aí se oferece.
 */
import { describe, expect, it } from "vitest";
import {
  checarAtualizacaoDoAndroid,
  decidirAtualizacao,
  novidadeDoManifesto,
  type NovidadeDeAtualizacao,
} from "./atualizacao-mobile";

const SHA = "a".repeat(64);
const APK = "https://api.streamz.chat/api/updates/arquivo/Streamz_1.2.0_android.apk";

const MANIFESTO = {
  version: "1.2.0",
  notes: "Correções e melhorias.",
  pub_date: "2026-09-09T00:00:00.000Z",
  platforms: {
    "android-universal": { signature: "", url: APK, sha256: SHA },
  },
};

describe("novidadeDoManifesto", () => {
  it("vira novidade quando há versão, URL e digest", () => {
    expect(novidadeDoManifesto(MANIFESTO)).toEqual({
      versao: "1.2.0",
      notas: "Correções e melhorias.",
      url: APK,
      sha256: SHA,
    });
  });

  it("assinatura vazia não atrapalha: no Android quem protege é o digest", () => {
    expect(novidadeDoManifesto(MANIFESTO)?.sha256).toBe(SHA);
  });

  it("SEM SHA256 NÃO HÁ ATUALIZAÇÃO — instalar sem conferir é o que não pode", () => {
    const semDigest = {
      ...MANIFESTO,
      platforms: { "android-universal": { signature: "", url: APK } },
    };
    expect(novidadeDoManifesto(semDigest)).toBeNull();
  });

  it("digest torto também não passa", () => {
    for (const ruim of ["a".repeat(63), "a".repeat(65), "z".repeat(64), "  ", "0x" + "a".repeat(62)]) {
      const torto = {
        ...MANIFESTO,
        platforms: { "android-universal": { signature: "", url: APK, sha256: ruim } },
      };
      expect(novidadeDoManifesto(torto), ruim).toBeNull();
    }
  });

  it("digest em maiúsculas é aceito e normalizado", () => {
    const maiusculo = {
      ...MANIFESTO,
      platforms: { "android-universal": { signature: "", url: APK, sha256: SHA.toUpperCase() } },
    };
    expect(novidadeDoManifesto(maiusculo)?.sha256).toBe(SHA);
  });

  it("sem a chave da nossa plataforma, não há atualização", () => {
    const soWindows = {
      ...MANIFESTO,
      platforms: { "windows-x86_64": { signature: "s", url: "https://exemplo/app.exe" } },
    };
    expect(novidadeDoManifesto(soWindows)).toBeNull();
  });

  it("sem URL, não há atualização", () => {
    const semUrl = {
      ...MANIFESTO,
      platforms: { "android-universal": { signature: "", url: "   ", sha256: SHA } },
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

describe("decidirAtualizacao — abertura × app já aberto", () => {
  const novidade: NovidadeDeAtualizacao = {
    versao: "1.2.0",
    notas: null,
    url: APK,
    sha256: SHA,
  };
  const parado = { abertura: false, dispensada: null, ocupado: false };

  it("na abertura, baixa sozinho", () => {
    expect(decidirAtualizacao(novidade, { ...parado, abertura: true })).toBe("baixar");
  });

  it("com o app já aberto, só avisa", () => {
    expect(decidirAtualizacao(novidade, parado)).toBe("avisar");
  });

  it("sem novidade, nada — em qualquer dos dois momentos", () => {
    expect(decidirAtualizacao(null, { ...parado, abertura: true })).toBe("nada");
    expect(decidirAtualizacao(null, parado)).toBe("nada");
  });

  it("ocupado vence tudo: a checagem de 30 min não reinicia um download em curso", () => {
    expect(decidirAtualizacao(novidade, { ...parado, ocupado: true })).toBe("nada");
    expect(decidirAtualizacao(novidade, { abertura: true, dispensada: null, ocupado: true })).toBe(
      "nada",
    );
  });

  it("dispensar cala o aviso desta versão, com o app aberto", () => {
    expect(decidirAtualizacao(novidade, { ...parado, dispensada: "1.2.0" })).toBe("nada");
  });

  it("dispensar a 1.2.0 não cala a 1.3.0 — é outra informação", () => {
    expect(decidirAtualizacao({ ...novidade, versao: "1.3.0" }, { ...parado, dispensada: "1.2.0" })).toBe(
      "avisar",
    );
  });

  it("dispensar não sobrevive a reabrir o app", () => {
    // o caso do "não me avise mais" que o usuário desliga sem saber que
    // desligou: na abertura seguinte a atualização volta a acontecer
    expect(
      decidirAtualizacao(novidade, { abertura: true, dispensada: "1.2.0", ocupado: false }),
    ).toBe("baixar");
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
    expect(novidade?.sha256).toBe(SHA);
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
