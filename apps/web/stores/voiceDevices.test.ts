import { describe, expect, it, vi } from "vitest";
import {
  aparelhosReais,
  escolhaDeSaida,
  explicarMidia,
  nomeEscolhido,
  opcoesDe,
  resolverEntradaPadrao,
  useVoiceDevicesStore,
} from "./voiceDevices";

const d = (
  deviceId: string,
  label: string,
  kind: MediaDeviceKind = "audioinput",
  groupId = "g",
) => ({ deviceId, label, kind, groupId, toJSON: () => ({}) }) as MediaDeviceInfo;

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

describe("resolverEntradaPadrao", () => {
  it("acha o físico pelo groupId do apelido 'default'", () => {
    const lista = [
      d("default", "Padrão - Fone (Realtek)", "audioinput", "g1"),
      d("abc", "Fone (Realtek)", "audioinput", "g1"),
      d("xyz", "Webcam Mic", "audioinput", "g2"),
    ];
    expect(resolverEntradaPadrao(lista)).toBe("abc");
  });

  it("ignora audiooutput do mesmo groupId: o grupo é compartilhado com a saída", () => {
    const lista = [
      d("default", "Padrão - Fone (Realtek)", "audioinput", "g1"),
      d("saida-fone", "Fone (Realtek)", "audiooutput", "g1"),
      d("mic-real", "Fone (Realtek)", "audioinput", "g1"),
    ];
    expect(resolverEntradaPadrao(lista)).toBe("mic-real");
  });

  it("sem entrada 'default' na lista é null — o caso do Firefox e do Safari", () => {
    const lista = [d("abc", "Fone (Realtek)", "audioinput", "g1")];
    expect(resolverEntradaPadrao(lista)).toBeNull();
  });

  it("grupo só com 'communications' ou vazio também é null: não chuta o primeiro da lista", () => {
    const lista = [
      d("default", "Padrão - Fone (Realtek)", "audioinput", "g1"),
      d("communications", "Comunicações - Fone (Realtek)", "audioinput", "g1"),
      d("", "", "audioinput", "g1"),
    ];
    expect(resolverEntradaPadrao(lista)).toBeNull();
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

describe("a escolha de aparelho sobrevive ao aparelho sumir", () => {
  /*
    O defeito que este teste tranca: a varredura comparava o id escolhido com a
    lista do momento e, não achando, **gravava `null`** — apagando a preferência.
    Bastava abrir o app com o fone Bluetooth desligado (ou antes de conceder a
    permissão, quando o navegador devolve a lista sem ids) para a escolha morrer,
    e religar o fone já não a trazia de volta porque ela não existia mais.
    Era o "sempre ter que selecionar o microfone e o fone de novo".
  */
  function listar(devices: MediaDeviceInfo[]) {
    vi.stubGlobal("navigator", { mediaDevices: { enumerateDevices: async () => devices } });
  }
  const comFone = [d("mic", "Microfone USB"), d("fone", "Fone Bluetooth", "audiooutput")];
  const semFone = [d("mic", "Microfone USB")];

  it("cai para o padrão do sistema enquanto ele falta, e volta sozinha quando ele volta", async () => {
    vi.stubGlobal("HTMLMediaElement", { prototype: { setSinkId: async () => {} } });
    listar(comFone);
    await useVoiceDevicesStore.getState().refresh(true);
    useVoiceDevicesStore.getState().setOutput("fone");
    expect(useVoiceDevicesStore.getState().outputId).toBe("fone");

    // fone desligado: o efetivo cede, porque insistir num aparelho ausente é
    // ficar sem som
    listar(semFone);
    await useVoiceDevicesStore.getState().refresh(true);
    expect(useVoiceDevicesStore.getState().outputId).toBeNull();

    // e aqui está o conserto: a escolha não foi apagada, só suspensa
    listar(comFone);
    await useVoiceDevicesStore.getState().refresh(true);
    expect(useVoiceDevicesStore.getState().outputId).toBe("fone");
  });
});
