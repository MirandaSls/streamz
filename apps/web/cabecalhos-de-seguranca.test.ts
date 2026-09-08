import { describe, expect, it } from "vitest";

// JS puro, compartilhado com o `next.config.mjs` — que não consegue importar
// `.ts`. Daí a extensão.
import { CABECALHOS_DE_SEGURANCA, CSP } from "./cabecalhos-de-seguranca.mjs";

/**
 * Regressão da auditoria de 2026-09-08: a web subiu para produção sem nenhum
 * cabeçalho de segurança. Como nenhuma camada acima do Next os acrescenta (o
 * Traefik não tem middleware `headers`, o Caddyfile de exemplo só faz
 * `reverse_proxy`), sumir com esta lista é sumir com a proteção inteira — e
 * `curl -I` não faz parte de nenhum teste. Daí travar aqui.
 */

const porNome = (nome: string) =>
  (CABECALHOS_DE_SEGURANCA as Array<{ key: string; value: string }>).find(
    (h) => h.key === nome,
  );

describe("cabeçalhos de segurança da web", () => {
  it("cobre os seis cabeçalhos que faltavam em produção", () => {
    const nomes = (CABECALHOS_DE_SEGURANCA as Array<{ key: string }>).map((h) => h.key);
    expect(nomes).toEqual([
      "Content-Security-Policy",
      "Strict-Transport-Security",
      "X-Frame-Options",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Permissions-Policy",
    ]);
  });

  it("proíbe enquadrar o app em iframe pelos dois caminhos", () => {
    // CSP nível 2 para navegador atual...
    expect(CSP).toContain("frame-ancestors 'none'");
    // ...e o cabeçalho antigo para quem não implementa.
    expect(porNome("X-Frame-Options")?.value).toBe("DENY");
  });

  it("fecha base-uri, object-src e form-action", () => {
    expect(CSP).toContain("base-uri 'self'");
    expect(CSP).toContain("object-src 'none'");
    expect(CSP).toContain("form-action 'self'");
  });

  it("não restringe origem de script, estilo, imagem ou conexão", () => {
    // Estas diretivas ficaram de fora de propósito: fechá-las sem inventariar
    // Giphy, R2 e LiveKit derrubaria mídia e voz. Se alguém as acrescentar,
    // que seja com a interface conferida — e este teste atualizado junto.
    for (const diretiva of ["script-src", "style-src", "img-src", "connect-src", "default-src"]) {
      expect(CSP).not.toContain(diretiva);
    }
  });

  it("mantém câmera, microfone e captura de tela liberados para a própria origem", () => {
    // Sem isto o canal de voz e o compartilhamento de tela param de funcionar.
    const pp = porNome("Permissions-Policy")?.value ?? "";
    expect(pp).toContain("camera=(self)");
    expect(pp).toContain("microphone=(self)");
    expect(pp).toContain("display-capture=(self)");
    // E o que a app não usa continua fechado.
    expect(pp).toContain("geolocation=()");
    expect(pp).toContain("payment=()");
  });

  it("manda HSTS longo com subdomínios e sem preload", () => {
    const hsts = porNome("Strict-Transport-Security")?.value ?? "";
    expect(hsts).toContain("includeSubDomains");
    // `preload` é irreversível na prática — decisão do dono do domínio, não do
    // código.
    expect(hsts).not.toContain("preload");
    const idade = Number(/max-age=(\d+)/.exec(hsts)?.[1] ?? 0);
    expect(idade).toBeGreaterThanOrEqual(31536000);
  });

  it("não vaza o caminho da URL para link externo", () => {
    // Num app de chat o caminho carrega id de servidor e de canal.
    expect(porNome("Referrer-Policy")?.value).toBe("strict-origin-when-cross-origin");
  });
});
