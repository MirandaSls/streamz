import { describe, expect, it } from "vitest";
import { aparelhosReais, explicarMidia, nomeEscolhido, opcoesDe } from "./voiceDevices";

const d = (deviceId: string, label: string, kind: MediaDeviceKind = "audioinput") =>
  ({ deviceId, label, kind, groupId: "g", toJSON: () => ({}) }) as MediaDeviceInfo;

describe("opcoesDe", () => {
  it("usa o nome do aparelho quando ele veio", () => {
    expect(opcoesDe([d("a", "Fone (Realtek)")], "Microfone")).toEqual([
      { id: "a", nome: "Fone (Realtek)" },
    ]);
  });

  it("numera só quando o navegador escondeu o nome", () => {
    // é o caso da lista anônima: uma linha em branco não diria nada
    expect(opcoesDe([d("", ""), d("b", "")], "Saída")).toEqual([
      { id: "", nome: "Saída 1" },
      { id: "b", nome: "Saída 2" },
    ]);
  });
});

describe("nomeEscolhido", () => {
  const lista = [d("a", "Fone (Realtek)"), d("b", "Webcam")];

  it("sem escolha é o padrão do sistema", () => {
    expect(nomeEscolhido(lista, null, "Microfone")).toBe("Padrão do sistema");
  });

  it("um id que sumiu da lista volta ao padrão em vez de virar linha vazia", () => {
    expect(nomeEscolhido(lista, "sumiu", "Microfone")).toBe("Padrão do sistema");
  });

  it("acha o escolhido", () => {
    expect(nomeEscolhido(lista, "b", "Microfone")).toBe("Webcam");
  });
});

describe("aparelhosReais", () => {
  it("tira os apelidos do Chromium: 'Padrão do sistema' já é essa linha", () => {
    const lista = [
      d("default", "Padrão - Fone (Realtek)"),
      d("communications", "Comunicações - Fone (Realtek)"),
      d("abc", "Fone (Realtek)"),
    ];
    expect(aparelhosReais(lista).map((x) => x.deviceId)).toEqual(["abc"]);
  });
});

describe("explicarMidia", () => {
  it("captura aceita mas sem nomes não é 'permissão negada'", () => {
    // no desktop não há cadeado nenhum para mandar o usuário procurar
    expect(explicarMidia("sem-rotulos")).toMatch(/nome dos aparelhos/);
    expect(explicarMidia("sem-rotulos")).not.toMatch(/cadeado/);
  });

  it("tudo certo não vira aviso", () => {
    expect(explicarMidia("ok")).toBeNull();
  });
});
