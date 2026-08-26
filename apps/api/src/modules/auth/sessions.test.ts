import { describe, expect, it } from "vitest";
import {
  MAX_IP,
  MAX_USER_AGENT,
  ehDispositivoMovel,
  normalizarIp,
  normalizarUserAgent,
  resumoDoDispositivo,
  toSessaoView,
  type LinhaDeSessao,
} from "./sessions";

const linha: LinhaDeSessao = {
  id: "sess_1",
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0 Safari/537.36",
  ip: "203.0.113.7",
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

describe("resumoDoDispositivo", () => {
  it.each([
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
      "Chrome · Windows",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36 Edg/128.0",
      "Edge · Windows",
    ],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
      "Safari · macOS",
    ],
    ["Mozilla/5.0 (X11; Linux x86_64; rv:129.0) Gecko/20100101 Firefox/129.0", "Firefox · Linux"],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
      "Safari · iOS",
    ],
    [
      "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36",
      "Chrome · Android",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/128.0 Safari/537.36 OPR/113.0",
      "Opera · Windows",
    ],
  ])("resume %s", (ua, esperado) => {
    expect(resumoDoDispositivo(ua)).toBe(esperado);
  });

  it("reconhece o app antes de tentar adivinhar o navegador", () => {
    expect(resumoDoDispositivo("StreamzDesktop/1.0 Tauri/2.0")).toBe("App do Streamz");
  });

  it("degrada sem esconder que não sabe", () => {
    expect(resumoDoDispositivo(null)).toBe("Dispositivo desconhecido");
    expect(resumoDoDispositivo("")).toBe("Dispositivo desconhecido");
    expect(resumoDoDispositivo("curl/8.7.1")).toBe("Navegador · Sistema desconhecido");
  });
});

describe("ehDispositivoMovel", () => {
  it("separa celular de desktop", () => {
    expect(ehDispositivoMovel("Mozilla/5.0 (Linux; Android 14) Mobile Safari")).toBe(true);
    expect(ehDispositivoMovel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5)")).toBe(true);
    expect(ehDispositivoMovel("Mozilla/5.0 (Windows NT 10.0) Chrome/128.0")).toBe(false);
    expect(ehDispositivoMovel(null)).toBe(false);
  });
});
