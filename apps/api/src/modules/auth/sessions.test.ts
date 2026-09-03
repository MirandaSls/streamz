import { describe, expect, it } from "vitest";
import {
  MAX_CLIENTE,
  MAX_IP,
  MAX_USER_AGENT,
  classificarDispositivo,
  normalizarCliente,
  normalizarIp,
  normalizarUserAgent,
  tipoDeDispositivoDaRequisicao,
  toSessaoView,
  type LinhaDeSessao,
} from "./sessions";

/** O `User-Agent` do WebView2, que é o do Edge — o app de desktop manda este. */
const UA_WEBVIEW2 =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0";

const linha: LinhaDeSessao = {
  id: "sess_1",
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0 Safari/537.36",
  ip: "203.0.113.7",
  dispositivo: "navegador",
  createdAt: new Date("2026-08-20T10:00:00.000Z"),
  lastUsedAt: new Date("2026-08-26T09:30:00.000Z"),
  expiresAt: new Date("2026-09-02T09:30:00.000Z"),
};

describe("toSessaoView", () => {
  it("marca como atual só a sessão do `sid` do access token", () => {
    expect(toSessaoView(linha, "sess_1").current).toBe(true);
    expect(toSessaoView(linha, "sess_2").current).toBe(false);
    // token antigo, sem a claim: ninguém é marcado, e nada quebra
    expect(toSessaoView(linha, null).current).toBe(false);
  });

  it("serializa as datas em ISO", () => {
    const view = toSessaoView(linha, null);
    expect(view.createdAt).toBe("2026-08-20T10:00:00.000Z");
    expect(view.lastUsedAt).toBe("2026-08-26T09:30:00.000Z");
    expect(view.expiresAt).toBe("2026-09-02T09:30:00.000Z");
  });

  it("omite os campos desconhecidos em vez de mandar null", () => {
    const view = toSessaoView({ ...linha, userAgent: null, ip: null, lastUsedAt: null }, null);
    expect("userAgent" in view).toBe(false);
    expect("ip" in view).toBe(false);
    expect("lastUsedAt" in view).toBe(false);
    expect(view.id).toBe("sess_1");
  });

  it("leva o tipo guardado na linha — é o que separa desktop de navegador", () => {
    const desktop = toSessaoView({ ...linha, userAgent: UA_WEBVIEW2, dispositivo: "desktop" }, null);
    expect(desktop.dispositivo).toBe("desktop");
    // mesmíssimo User-Agent, sem a coluna: só dá para dizer "navegador"
    const navegador = toSessaoView({ ...linha, userAgent: UA_WEBVIEW2, dispositivo: null }, null);
    expect(navegador.dispositivo).toBe("navegador");
  });

  it("classifica a sessão antiga (coluna nula) pelo User-Agent", () => {
    const celular = toSessaoView(
      { ...linha, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5)", dispositivo: null },
      null,
    );
    expect(celular.dispositivo).toBe("celular");
    expect(toSessaoView({ ...linha, userAgent: null, dispositivo: null }, null).dispositivo).toBe(
      "desconhecido",
    );
  });

  it("nunca deixa o tipo fora do contrato, mesmo com lixo na coluna", () => {
    expect(toSessaoView({ ...linha, dispositivo: "geladeira" }, null).dispositivo).toBe(
      "navegador",
    );
  });
});

describe("normalizarUserAgent", () => {
  it("apara, recorta no teto da coluna e trata o que não é texto", () => {
    expect(normalizarUserAgent("  Chrome  ")).toBe("Chrome");
    expect(normalizarUserAgent("x".repeat(MAX_USER_AGENT + 50))).toHaveLength(MAX_USER_AGENT);
    expect(normalizarUserAgent("")).toBeNull();
    expect(normalizarUserAgent(undefined)).toBeNull();
    expect(normalizarUserAgent(42)).toBeNull();
  });
});

describe("normalizarIp", () => {
  it("pega o primeiro salto do x-forwarded-for", () => {
    expect(normalizarIp("203.0.113.7, 70.41.3.18, 150.172.238.178")).toBe("203.0.113.7");
  });

  it("aceita o header repetido (array) e usa o primeiro", () => {
    expect(normalizarIp(["203.0.113.7", "10.0.0.1"])).toBe("203.0.113.7");
  });

  it("desfaz o IPv4 mapeado que o Node entrega em socket dual-stack", () => {
    expect(normalizarIp("::ffff:127.0.0.1")).toBe("127.0.0.1");
  });

  it("preserva IPv6 de verdade e recorta no teto", () => {
    expect(normalizarIp("2001:db8::1")).toBe("2001:db8::1");
    expect(normalizarIp("a".repeat(MAX_IP + 10))).toHaveLength(MAX_IP);
  });

  it("devolve null para ausente ou vazio", () => {
    expect(normalizarIp(undefined)).toBeNull();
    expect(normalizarIp("   ")).toBeNull();
  });
});

describe("normalizarCliente", () => {
  it("apara, recorta no teto da coluna e ignora o que não é texto", () => {
    expect(normalizarCliente("  desktop/0.0.14  ")).toBe("desktop/0.0.14");
    expect(normalizarCliente("x".repeat(MAX_CLIENTE + 20))).toHaveLength(MAX_CLIENTE);
    expect(normalizarCliente("")).toBeNull();
    expect(normalizarCliente(undefined)).toBeNull();
    expect(normalizarCliente(7)).toBeNull();
  });

  it("aceita o cabeçalho repetido (array) e usa o primeiro", () => {
    expect(normalizarCliente(["desktop/0.0.14", "outro"])).toBe("desktop/0.0.14");
  });
});

describe("tipoDeDispositivoDaRequisicao", () => {
  it("acredita no cliente quando ele se declara — este é o bug que se conserta", () => {
    // o desktop manda exatamente o User-Agent do Edge; sem o cabeçalho, ele
    // seria classificado como navegador
    expect(tipoDeDispositivoDaRequisicao("desktop/0.0.14", UA_WEBVIEW2)).toBe("desktop");
    expect(tipoDeDispositivoDaRequisicao(null, UA_WEBVIEW2)).toBe("navegador");
  });

  it("aceita o cabeçalho sem versão (o primeiro login, antes de ler a versão)", () => {
    expect(tipoDeDispositivoDaRequisicao("desktop", UA_WEBVIEW2)).toBe("desktop");
  });

  it("não deixa o cliente inventar um tipo: cai no User-Agent", () => {
    expect(tipoDeDispositivoDaRequisicao("servidor/1.0", UA_WEBVIEW2)).toBe("navegador");
    expect(tipoDeDispositivoDaRequisicao("   ", UA_WEBVIEW2)).toBe("navegador");
  });

  it("sem cliente e sem User-Agent, admite que não sabe", () => {
    expect(tipoDeDispositivoDaRequisicao(null, null)).toBe("desconhecido");
  });
});

describe("classificarDispositivo", () => {
  it("rotula o app de desktop pelo sistema, e não pelo navegador embutido", () => {
    const d = classificarDispositivo({ cliente: "desktop/0.0.14", userAgent: UA_WEBVIEW2 });
    expect(d).toMatchObject({
      tipo: "desktop",
      rotulo: "Streamz para Windows",
      sistema: "Windows",
      navegador: null,
      versaoDoApp: "0.0.14",
    });
  });

  it("usa o tipo salvo quando o cabeçalho não está mais lá (a listagem)", () => {
    const d = classificarDispositivo({ userAgent: UA_WEBVIEW2, tipoSalvo: "desktop" });
    expect(d.rotulo).toBe("Streamz para Windows");
    expect(d.versaoDoApp).toBeNull();
  });

  it("o cabeçalho vence o tipo salvo (a sessão mudou de cliente)", () => {
    expect(
      classificarDispositivo({ cliente: "desktop/1.0", tipoSalvo: "navegador", userAgent: UA_WEBVIEW2 })
        .tipo,
    ).toBe("desktop");
  });

  it.each([
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
      "Chrome no Windows",
    ],
    [UA_WEBVIEW2, "Edge no Windows"],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
      "Safari no macOS",
    ],
    ["Mozilla/5.0 (X11; Linux x86_64; rv:129.0) Gecko/20100101 Firefox/129.0", "Firefox no Linux"],
    [
      "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/128.0 Safari/537.36 OPR/113.0",
      "Opera no Windows",
    ],
  ])("rotula o navegador %#", (ua, esperado) => {
    const d = classificarDispositivo({ userAgent: ua });
    expect(d.tipo).toBe("navegador");
    expect(d.rotulo).toBe(esperado);
  });

  it.each([
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
      "Safari no iOS",
    ],
    [
      "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36",
      "Chrome no Android",
    ],
  ])("separa o celular %#", (ua, esperado) => {
    const d = classificarDispositivo({ userAgent: ua });
    expect(d.tipo).toBe("celular");
    expect(d.rotulo).toBe(esperado);
  });

  it("reconhece o app antigo pelo User-Agent, sem cabeçalho nenhum", () => {
    expect(classificarDispositivo({ userAgent: "StreamzDesktop/1.0 Tauri/2.0" }).tipo).toBe(
      "desktop",
    );
  });

  it("degrada sem esconder que não sabe", () => {
    expect(classificarDispositivo({ userAgent: null }).rotulo).toBe("Dispositivo desconhecido");
    expect(classificarDispositivo({ userAgent: "curl/8.7.1" })).toMatchObject({
      tipo: "navegador",
      rotulo: "Dispositivo desconhecido",
    });
    expect(classificarDispositivo({ userAgent: "Mozilla/5.0 (Windows NT 10.0)" }).rotulo).toBe(
      "Navegador no Windows",
    );
    expect(classificarDispositivo({ cliente: "desktop/1.0", userAgent: "sei la" }).rotulo).toBe(
      "Streamz para computador",
    );
  });
});
