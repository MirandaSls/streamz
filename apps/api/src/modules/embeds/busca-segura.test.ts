import { afterEach, describe, expect, it } from "vitest";
import { createServer, type RequestListener, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { buscarHtml, criarLookupSeguro, ehIpPrivado, exigirHostPublico } from "./busca-segura";

/**
 * Os servidores de teste ficam em 127.0.0.1, que a regra de verdade recusa (e
 * tem de recusar). Por isso `buscarHtml` recebe aqui um `ipPermitido` que abre
 * exceção só para o loopback: tudo mais — inclusive o destino de um
 * redirecionamento — continua passando pela conferência real.
 */
const SO_LOOPBACK = (ip: string) => ip === "127.0.0.1";

let servidor: Server | null = null;

async function subir(handler: RequestListener): Promise<string> {
  const s = createServer(handler);
  await new Promise<void>((pronto) => s.listen(0, "127.0.0.1", pronto));
  servidor = s;
  return `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
}

afterEach(async () => {
  const s = servidor;
  servidor = null;
  if (s) await new Promise<void>((pronto) => s.close(() => pronto()));
});

describe("buscarHtml", () => {
  it("lê a página quando o destino é público e devolve HTML", async () => {
    const base = await subir((_req, res) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end("<title>ok</title>");
    });
    expect(await buscarHtml(new URL(base), { ipPermitido: SO_LOOPBACK })).toBe("<title>ok</title>");
  });

  /**
   * O ataque: o site do atacante responde 200 na conferência e 302 para o
   * serviço de metadados da nuvem. Com `redirect: "follow"` o cliente ia atrás
   * sem conferir nada e o <title>/og:description de qualquer painel interno
   * voltava dentro da prévia.
   */
  it("recusa redirecionamento para IP privado", async () => {
    const base = await subir((_req, res) => {
      res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
      res.end();
    });
    await expect(buscarHtml(new URL(base), { ipPermitido: SO_LOOPBACK })).rejects.toThrow(/ip privado 169\.254\.169\.254/);
  });

  it("recusa redirecionamento relativo que cai em host interno", async () => {
    const base = await subir((req, res) => {
      if (req.url === "/") {
        res.writeHead(302, { location: "//10.0.0.5/painel" });
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<title>interno</title>");
    });
    await expect(buscarHtml(new URL(base), { ipPermitido: SO_LOOPBACK })).rejects.toThrow(/ip privado 10\.0\.0\.5/);
  });

  it("para no teto de saltos em vez de girar no laço do atacante", async () => {
    let pedidos = 0;
    const base = await subir((_req, res) => {
      pedidos += 1;
      res.writeHead(302, { location: "/vai" });
      res.end();
    });
    await expect(buscarHtml(new URL(base), { ipPermitido: SO_LOOPBACK })).rejects.toThrow(/redirecionamentos demais/);
    // 1 pedido original + 3 saltos: o quarto redirecionamento não é seguido.
    expect(pedidos).toBe(4);
  });

  it("respeita um teto de saltos menor", async () => {
    let pedidos = 0;
    const base = await subir((_req, res) => {
      pedidos += 1;
      res.writeHead(302, { location: "/vai" });
      res.end();
    });
    await expect(buscarHtml(new URL(base), { ipPermitido: SO_LOOPBACK, maxSaltos: 1 })).rejects.toThrow(
      /redirecionamentos demais/,
    );
    expect(pedidos).toBe(2);
  });

  it("segue redirecionamentos dentro do teto", async () => {
    const base = await subir((req, res) => {
      if (req.url !== "/fim") {
        res.writeHead(302, { location: "/fim" });
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<title>chegou</title>");
    });
    expect(await buscarHtml(new URL(base), { ipPermitido: SO_LOOPBACK })).toBe("<title>chegou</title>");
  });

  it("recusa redirecionamento para esquema que não é http(s)", async () => {
    const base = await subir((_req, res) => {
      res.writeHead(302, { location: "file:///etc/passwd" });
      res.end();
    });
    await expect(buscarHtml(new URL(base), { ipPermitido: SO_LOOPBACK })).rejects.toThrow(/esquema file:/);
  });

  it("recusa resposta que não é HTML", async () => {
    const base = await subir((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    });
    await expect(buscarHtml(new URL(base), { ipPermitido: SO_LOOPBACK })).rejects.toThrow(/resposta 200/);
  });

  it("corta a leitura no teto de bytes", async () => {
    const base = await subir((_req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.write("a".repeat(4096));
      res.end("b".repeat(4096));
    });
    const html = await buscarHtml(new URL(base), { ipPermitido: SO_LOOPBACK, maxBytes: 1024 });
    expect(html.length).toBeLessThan(9000);
    expect(html.startsWith("a")).toBe(true);
  });

  it("desiste no tempo limite quando a página nunca responde", async () => {
    const base = await subir(() => undefined);
    await expect(buscarHtml(new URL(base), { ipPermitido: SO_LOOPBACK, timeoutMs: 200 })).rejects.toThrow();
  });
});

describe("exigirHostPublico", () => {
  it("recusa nomes internos e IPs privados", async () => {
    await expect(exigirHostPublico("localhost")).rejects.toThrow(/host interno/);
    await expect(exigirHostPublico("painel.internal")).rejects.toThrow(/host interno/);
    await expect(exigirHostPublico("nas.local")).rejects.toThrow(/host interno/);
    await expect(exigirHostPublico("169.254.169.254")).rejects.toThrow(/ip privado/);
    // hostname de URL com IPv6 vem entre colchetes; sem tirá-los, escaparia.
    await expect(exigirHostPublico("[::1]")).rejects.toThrow(/ip privado/);
  });
});

describe("criarLookupSeguro", () => {
  /**
   * É esta a defesa contra DNS rebinding: quem responde ao `net.connect` é
   * este lookup, então não sobra janela entre conferir o nome e conectar nele.
   */
  it("barra a conexão quando o nome resolve para IP interno", async () => {
    const lookup = criarLookupSeguro();
    const erro = await new Promise<Error | null>((pronto) => {
      lookup("localhost", { all: true }, (e) => pronto(e));
    });
    expect(erro?.message).toMatch(/ip privado 127\.0\.0\.1|ip privado ::1/);
  });

  it("deixa passar o que o filtro aceita", async () => {
    const lookup = criarLookupSeguro(() => true);
    const erro = await new Promise<Error | null>((pronto) => {
      lookup("localhost", { all: true }, (e) => pronto(e));
    });
    expect(erro).toBeNull();
  });
});

describe("ehIpPrivado", () => {
  it("recusa as faixas que já eram recusadas", () => {
    for (const ip of ["10.1.2.3", "127.0.0.1", "0.0.0.0", "169.254.169.254", "172.16.0.1", "172.31.255.254", "192.168.1.1"]) {
      expect(ehIpPrivado(ip), ip).toBe(true);
    }
    for (const ip of ["::1", "fd00::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1"]) {
      expect(ehIpPrivado(ip), ip).toBe(true);
    }
  });

  it("recusa também CGNAT, 192.0.0.0/24, 198.18.0.0/15, multicast e reservados", () => {
    for (const ip of [
      "100.64.0.1", // CGNAT: dentro da operadora, alcança equipamento de rede
      "100.127.255.254",
      "192.0.0.1",
      "198.18.0.1",
      "198.19.255.254",
      "224.0.0.1", // multicast
      "239.255.255.250",
      "240.0.0.1",
      "255.255.255.255",
    ]) {
      expect(ehIpPrivado(ip), ip).toBe(true);
    }
    expect(ehIpPrivado("::")).toBe(true);
    expect(ehIpPrivado("ff02::1")).toBe(true);
  });

  it("nega o que nem IP é, em vez de deixar passar", () => {
    expect(ehIpPrivado("nao-e-ip")).toBe(true);
    expect(ehIpPrivado("")).toBe(true);
  });

  it("aceita endereço público", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "100.63.255.255", "99.255.255.255", "192.0.1.1", "198.17.0.1", "223.255.255.255", "2606:4700::1111"]) {
      expect(ehIpPrivado(ip), ip).toBe(false);
    }
  });
});
