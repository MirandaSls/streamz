import { describe, expect, it, vi } from "vitest";
import {
  aparelhosReais,
  escolhaDeSaida,
  explicarMidia,
  nomeEscolhido,
  opcoesDe,
  useVoiceDevicesStore,
} from "./voiceDevices";

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

describe("escolhaDeSaida", () => {
  const outputs = [d("fone", "Fone (Realtek)", "audiooutput"), d("hdmi", "Monitor", "audiooutput")];

  it("com setSinkId a lista é oferecida inteira, e sem recado nenhum", () => {
    const escolha = escolhaDeSaida(
      { outputs, outputId: "hdmi", saidaSelecionavel: true },
      "macos-chromium",
    );
    expect(escolha.opcoes).toEqual([
      { id: "fone", nome: "Fone (Realtek)" },
      { id: "hdmi", nome: "Monitor" },
    ]);
    expect(escolha.escolhido).toBe("hdmi");
    expect(escolha.motivoFixo).toBeNull();
  });

  it("sem setSinkId não oferece lista e diz onde trocar — o caso do Mac", () => {
    // é o relato "não consigo alterar o dispositivo de saída": escolher aqui
    // não mexia no som, porque `aplicarSaida` volta em silêncio sem a API
    const escolha = escolhaDeSaida(
      { outputs, outputId: "hdmi", saidaSelecionavel: false },
      "macos-webkit",
    );
    expect(escolha.opcoes).toEqual([]);
    // nada de escolha mentirosa: o que vale é a saída do sistema
    expect(escolha.escolhido).toBeNull();
    expect(escolha.motivoFixo).toMatch(/Ajustes do Sistema ▸ Som/);
  });

  it("some com a lista, mas nunca em silêncio — em qualquer sistema", () => {
    for (const sistema of ["windows", "macos-webkit", "macos-chromium", "outro", null] as const) {
      const escolha = escolhaDeSaida({ outputs, outputId: null, saidaSelecionavel: false }, sistema);
      expect(escolha.motivoFixo, `sistema ${sistema}`).toBeTruthy();
    }
  });
});

describe("detecção de setSinkId no refresh", () => {
  /** Lista pronta e com rótulo: o caminho que não pede permissão nenhuma. */
  function listar(devices: MediaDeviceInfo[]) {
    vi.stubGlobal("navigator", { mediaDevices: { enumerateDevices: async () => devices } });
  }

  const lista = [d("mic", "Microfone USB"), d("fone", "Fone (Realtek)", "audiooutput")];

  it("navegador sem a API: a saída deixa de ser selecionável", async () => {
    listar(lista);
    // o dublê só precisa do protótipo: é nele que a detecção olha
    vi.stubGlobal("HTMLMediaElement", { prototype: {} });
    await useVoiceDevicesStore.getState().refresh(true);
    expect(useVoiceDevicesStore.getState().saidaSelecionavel).toBe(false);
    // e a lista de entrada continua inteira: `getUserMedia({deviceId})` não
    // depende de `setSinkId` e funciona em todo navegador
    expect(useVoiceDevicesStore.getState().inputs).toHaveLength(1);
  });

  it("navegador com a API: volta a ser selecionável", async () => {
    listar(lista);
    vi.stubGlobal("HTMLMediaElement", { prototype: { setSinkId: async () => {} } });
    await useVoiceDevicesStore.getState().refresh(true);
    expect(useVoiceDevicesStore.getState().saidaSelecionavel).toBe(true);
    expect(useVoiceDevicesStore.getState().outputs).toHaveLength(1);
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
