/**
 * O manifesto de atualização, com os dois clientes que ele serve.
 *
 * O que estes testes travam é a separação: cada plataforma tem a **sua** prova
 * de integridade, e nenhuma herda a da outra. Os desktops (Windows, macOS,
 * Linux) exigem a assinatura minisign (o atualizador do Tauri instala sozinho e
 * é ela que impede um pacote de estranho); o Android exige o **sha256** (não há
 * verificador de minisign lá, e o app confere o digest antes de abrir o
 * instalador do sistema).
 *
 * Herdar seria defeito nos dois sentidos: com o `DESKTOP_UPDATE_SIGNATURE`
 * vazio o celular nunca receberia versão nova, e sem o `ANDROID_UPDATE_SHA256`
 * o app baixaria um `.apk` que ninguém conferiu — o segundo é o caso grave, e é
 * por isso que o teste "sem sha256 não oferece nada" existe.
 *
 * E, entre os desktops, cada um lê só as **próprias** variáveis: o pacote de um
 * sistema não instala no outro, então oferecê-lo seria um download inteiro
 * recusado a cada abertura do app.
 */
import { describe, expect, it } from "vitest";
import type { ConfigService } from "@nestjs/config";
import { UpdatesService } from "./updates.service";

/** `ConfigService` de mentira: só o `get`, que é tudo que o serviço usa. */
function servico(ambiente: Record<string, string>): UpdatesService {
  const config = {
    get: (chave: string) => ambiente[chave],
  } as unknown as ConfigService;
  return new UpdatesService(config);
}

const DESKTOP_COMPLETO = {
  DESKTOP_UPDATE_VERSION: "1.2.0",
  DESKTOP_UPDATE_URL: "https://api.streamz.chat/api/updates/arquivo/Streamz_1.2.0_x64-setup.exe",
  DESKTOP_UPDATE_SIGNATURE: "assinatura-minisign",
};

const MACOS_COMPLETO = {
  MACOS_UPDATE_VERSION: "1.2.0",
  MACOS_UPDATE_URL: "https://api.streamz.chat/api/updates/arquivo/Streamz.app.tar.gz",
  MACOS_UPDATE_SIGNATURE: "assinatura-do-mac",
};

const LINUX_COMPLETO = {
  LINUX_UPDATE_VERSION: "1.2.0",
  LINUX_UPDATE_URL: "https://api.streamz.chat/api/updates/arquivo/Streamz_1.2.0_amd64.AppImage",
  LINUX_UPDATE_SIGNATURE: "assinatura-do-linux",
};

/** 64 hexadecimais: o formato que o serviço exige e o app confere. */
const SHA256 = "a".repeat(64);

const ANDROID_COMPLETO = {
  ANDROID_UPDATE_VERSION: "1.2.0",
  ANDROID_UPDATE_URL: "https://api.streamz.chat/api/updates/arquivo/Streamz_1.2.0_android.apk",
  ANDROID_UPDATE_SHA256: SHA256,
};

describe("UpdatesService — Windows (atualizador do Tauri)", () => {
  it("oferece o manifesto assinado para quem está atrás", () => {
    const manifesto = servico(DESKTOP_COMPLETO).manifesto("windows-x86_64", "1.1.0");
    expect(manifesto?.version).toBe("1.2.0");
    expect(manifesto?.platforms["windows-x86_64"]).toEqual({
      signature: "assinatura-minisign",
      url: DESKTOP_COMPLETO.DESKTOP_UPDATE_URL,
    });
  });

  it("não oferece nada a quem já está em dia", () => {
    expect(servico(DESKTOP_COMPLETO).manifesto("windows-x86_64", "1.2.0")).toBeNull();
  });

  it("sem assinatura configurada não oferece nada — o Tauri recusaria o pacote", () => {
    const { DESKTOP_UPDATE_SIGNATURE: _, ...semAssinatura } = DESKTOP_COMPLETO;
    expect(servico(semAssinatura).manifesto("windows-x86_64", "1.1.0")).toBeNull();
  });

  it("bundle_type=msi também recebe o manifesto — o Windows escolhe o instalador pelos bytes, não pelo bundle_type", () => {
    // confirmado no tauri-plugin-updater 2.11.0 (updater.rs, extract →
    // extract_exe): quem instalou pelo MSI recebe o mesmo .exe NSIS
    // (DESKTOP_UPDATE_URL, acima) e o roda normalmente — infer::app::is_exe
    // decide pelos bytes baixados, o msiexec nunca entra em cena.
    expect(servico(DESKTOP_COMPLETO).manifesto("windows-x86_64", "1.1.0", "msi")?.version).toBe(
      "1.2.0",
    );
  });

  it("bundle_type=nsis, msi, ausente ou unknown continuam oferecendo o manifesto", () => {
    const s = servico(DESKTOP_COMPLETO);
    for (const tipo of ["nsis", "msi", "unknown", undefined]) {
      expect(s.manifesto("windows-x86_64", "1.1.0", tipo)?.version, String(tipo)).toBe("1.2.0");
    }
  });
});

describe("UpdatesService — Android (o atualizador do app)", () => {
  it("oferece o .apk com o sha256 e a assinatura vazia", () => {
    const manifesto = servico(ANDROID_COMPLETO).manifesto("android-universal", "1.1.0");
    expect(manifesto?.version).toBe("1.2.0");
    // a assinatura vai vazia de propósito: não há verificador de minisign no
    // Android, e fingir uma que ninguém confere seria pior que não ter nenhuma.
    // Quem faz o papel dela é o `sha256`, conferido pelo app antes de instalar.
    expect(manifesto?.platforms["android-universal"]).toEqual({
      signature: "",
      url: ANDROID_COMPLETO.ANDROID_UPDATE_URL,
      sha256: SHA256,
    });
  });

  it("sem sha256 não oferece nada — o app não teria como conferir o pacote", () => {
    const { ANDROID_UPDATE_SHA256: _, ...semDigest } = ANDROID_COMPLETO;
    expect(servico(semDigest).manifesto("android-universal", "1.1.0")).toBeNull();
  });

  it("recusa um sha256 que não é um sha256", () => {
    // truncado no copiar-e-colar: baixaria 40 MB e recusaria sempre, calado
    for (const ruim of ["a".repeat(63), "a".repeat(65), "z".repeat(64), "não é digest"]) {
      const manifesto = servico({ ...ANDROID_COMPLETO, ANDROID_UPDATE_SHA256: ruim }).manifesto(
        "android-universal",
        "1.1.0",
      );
      expect(manifesto, ruim).toBeNull();
    }
  });

  it("aceita o digest em maiúsculas e o entrega minúsculo", () => {
    // `sha256sum` sai minúsculo, mas colar de outra ferramenta não garante
    const manifesto = servico({
      ...ANDROID_COMPLETO,
      ANDROID_UPDATE_SHA256: SHA256.toUpperCase(),
    }).manifesto("android-universal", "1.1.0");
    expect(manifesto?.platforms["android-universal"].sha256).toBe(SHA256);
  });

  it("não depende das variáveis do desktop", () => {
    // este é o caso que o teste existe para travar: só o Android configurado
    const manifesto = servico(ANDROID_COMPLETO).manifesto("android-universal", "1.0.0");
    expect(manifesto).not.toBeNull();
  });

  it("não oferece nada a quem já está em dia", () => {
    expect(servico(ANDROID_COMPLETO).manifesto("android-universal", "1.2.0")).toBeNull();
  });

  it("sem configuração responde nada, como o desktop", () => {
    expect(servico({}).manifesto("android-universal", "1.0.0")).toBeNull();
  });
});

describe("UpdatesService — macOS (build universal)", () => {
  it("oferece o mesmo .app.tar.gz às duas arquiteturas", () => {
    // o binário universal tem uma fatia por arquitetura, e cada uma pede a sua
    // chave: Apple Silicon pede `darwin-aarch64`, Intel (ou Rosetta) pede
    // `darwin-x86_64`. O pacote é um só, e serve às duas.
    const s = servico(MACOS_COMPLETO);
    for (const plataforma of ["darwin-aarch64", "darwin-x86_64"]) {
      const manifesto = s.manifesto(plataforma, "1.1.0");
      expect(manifesto?.version, plataforma).toBe("1.2.0");
      expect(manifesto?.platforms, plataforma).toEqual({
        [plataforma]: { signature: "assinatura-do-mac", url: MACOS_COMPLETO.MACOS_UPDATE_URL },
      });
    }
  });

  it("usa as notas e a data do próprio prefixo", () => {
    const manifesto = servico({
      ...MACOS_COMPLETO,
      MACOS_UPDATE_NOTES: "novidades do mac",
      MACOS_UPDATE_DATE: "2026-09-01T00:00:00.000Z",
      DESKTOP_UPDATE_NOTES: "novidades do windows",
    }).manifesto("darwin-aarch64", "1.1.0");
    expect(manifesto?.notes).toBe("novidades do mac");
    expect(manifesto?.pub_date).toBe("2026-09-01T00:00:00.000Z");
  });

  it("não oferece nada a quem já está em dia", () => {
    expect(servico(MACOS_COMPLETO).manifesto("darwin-aarch64", "1.2.0")).toBeNull();
  });

  it("sem assinatura configurada não oferece nada — o Tauri recusaria o pacote", () => {
    const { MACOS_UPDATE_SIGNATURE: _, ...semAssinatura } = MACOS_COMPLETO;
    expect(servico(semAssinatura).manifesto("darwin-x86_64", "1.1.0")).toBeNull();
  });

  it("não responde por arquitetura que o build universal não cobre", () => {
    expect(servico(MACOS_COMPLETO).manifesto("darwin-universal", "1.1.0")).toBeNull();
    expect(servico(MACOS_COMPLETO).manifesto("darwin-i686", "1.1.0")).toBeNull();
  });

  it("ignora o bundle_type — o plugin sempre manda 'app' e não há formato alternativo", () => {
    const s = servico(MACOS_COMPLETO);
    for (const tipo of ["app", "unknown", undefined]) {
      expect(s.manifesto("darwin-aarch64", "1.1.0", tipo)?.version, String(tipo)).toBe("1.2.0");
    }
  });
});

describe("UpdatesService — Linux (AppImage)", () => {
  it("oferece o AppImage sob a chave do instalador AppImage", () => {
    const manifesto = servico(LINUX_COMPLETO).manifesto("linux-x86_64", "1.1.0");
    expect(manifesto?.version).toBe("1.2.0");
    // a chave é `linux-x86_64-appimage`, e só ela: quem instalou pelo `.deb`
    // procura `linux-x86_64-deb` e `linux-x86_64`, não acha, e não baixa um
    // AppImage que o instalador dele recusaria
    expect(manifesto?.platforms).toEqual({
      "linux-x86_64-appimage": {
        signature: "assinatura-do-linux",
        url: LINUX_COMPLETO.LINUX_UPDATE_URL,
      },
    });
  });

  it("não oferece nada a quem já está em dia", () => {
    expect(servico(LINUX_COMPLETO).manifesto("linux-x86_64", "1.2.0")).toBeNull();
  });

  it("sem assinatura configurada não oferece nada — o Tauri recusaria o pacote", () => {
    const { LINUX_UPDATE_SIGNATURE: _, ...semAssinatura } = LINUX_COMPLETO;
    expect(servico(semAssinatura).manifesto("linux-x86_64", "1.1.0")).toBeNull();
  });

  it("só x86_64: não há AppImage de ARM publicado", () => {
    expect(servico(LINUX_COMPLETO).manifesto("linux-aarch64", "1.1.0")).toBeNull();
  });

  it("bundle_type=deb ou rpm não oferece nada — o instalador deles não aplica um AppImage", () => {
    // hoje a proteção contra isso é indireta (a chave -appimage não bate com o
    // que o cliente do .deb/.rpm procura, e a checagem falha em erro); com o
    // bundle_type dá para responder "está em dia" de propósito
    const s = servico(LINUX_COMPLETO);
    expect(s.manifesto("linux-x86_64", "1.1.0", "deb")).toBeNull();
    expect(s.manifesto("linux-x86_64", "1.1.0", "rpm")).toBeNull();
  });

  it("bundle_type=appimage, ausente ou unknown continuam oferecendo o AppImage", () => {
    const s = servico(LINUX_COMPLETO);
    for (const tipo of ["appimage", "unknown", undefined]) {
      const manifesto = s.manifesto("linux-x86_64", "1.1.0", tipo);
      expect(manifesto?.platforms["linux-x86_64-appimage"]?.url, String(tipo)).toBe(
        LINUX_COMPLETO.LINUX_UPDATE_URL,
      );
    }
  });
});

describe("UpdatesService — isolamento entre os desktops", () => {
  it("cada sistema recebe o próprio pacote, e nunca o de outro", () => {
    const s = servico({ ...DESKTOP_COMPLETO, ...MACOS_COMPLETO, ...LINUX_COMPLETO });
    expect(s.manifesto("windows-x86_64", "1.0.0")?.platforms["windows-x86_64"].url).toBe(
      DESKTOP_COMPLETO.DESKTOP_UPDATE_URL,
    );
    expect(s.manifesto("darwin-aarch64", "1.0.0")?.platforms["darwin-aarch64"].url).toBe(
      MACOS_COMPLETO.MACOS_UPDATE_URL,
    );
    expect(s.manifesto("linux-x86_64", "1.0.0")?.platforms["linux-x86_64-appimage"].url).toBe(
      LINUX_COMPLETO.LINUX_UPDATE_URL,
    );
  });

  it("só o Windows configurado não oferece nada ao Mac nem ao Linux", () => {
    const s = servico({ ...DESKTOP_COMPLETO, ...ANDROID_COMPLETO });
    expect(s.manifesto("darwin-aarch64", "1.0.0")).toBeNull();
    expect(s.manifesto("darwin-x86_64", "1.0.0")).toBeNull();
    expect(s.manifesto("linux-x86_64", "1.0.0")).toBeNull();
  });

  it("só o Mac configurado não oferece nada ao Windows nem ao Linux", () => {
    const s = servico(MACOS_COMPLETO);
    expect(s.manifesto("windows-x86_64", "1.0.0")).toBeNull();
    expect(s.manifesto("linux-x86_64", "1.0.0")).toBeNull();
  });

  it("só o Linux configurado não oferece nada ao Windows nem ao Mac", () => {
    const s = servico(LINUX_COMPLETO);
    expect(s.manifesto("windows-x86_64", "1.0.0")).toBeNull();
    expect(s.manifesto("darwin-aarch64", "1.0.0")).toBeNull();
  });

  it("não se completa com variável de outro prefixo", () => {
    // Mac sem assinatura própria, com a do Windows no ambiente: continua sem
    // nada — a do Windows foi feita sobre outro arquivo e não confere
    const { MACOS_UPDATE_SIGNATURE: _, ...macSemAssinatura } = MACOS_COMPLETO;
    const s = servico({ ...DESKTOP_COMPLETO, ...macSemAssinatura });
    expect(s.manifesto("darwin-aarch64", "1.0.0")).toBeNull();
  });

  it("isConfigured sem argumento continua falando só do Windows", () => {
    expect(servico(DESKTOP_COMPLETO).isConfigured()).toBe(true);
    expect(servico({ ...MACOS_COMPLETO, ...LINUX_COMPLETO }).isConfigured()).toBe(false);
    expect(servico(MACOS_COMPLETO).isConfigured("MACOS")).toBe(true);
    expect(servico(LINUX_COMPLETO).isConfigured("LINUX")).toBe(true);
  });
});

/** As quatro plataformas configuradas ao mesmo tempo: o caso de produção. */
const TUDO = { ...DESKTOP_COMPLETO, ...ANDROID_COMPLETO, ...MACOS_COMPLETO, ...LINUX_COMPLETO };

describe("UpdatesService — outras plataformas", () => {
  it("macOS e Linux recebem o próprio pacote, nunca o instalador do Windows", () => {
    const s = servico(TUDO);
    const urls = [
      s.manifesto("darwin-aarch64", "1.0.0")?.platforms["darwin-aarch64"].url,
      s.manifesto("darwin-x86_64", "1.0.0")?.platforms["darwin-x86_64"].url,
      s.manifesto("linux-x86_64", "1.0.0")?.platforms["linux-x86_64-appimage"].url,
    ];
    for (const url of urls) {
      expect(url).toBeDefined();
      expect(url).not.toBe(DESKTOP_COMPLETO.DESKTOP_UPDATE_URL);
      expect(url).not.toBe(ANDROID_COMPLETO.ANDROID_UPDATE_URL);
    }
  });

  it("iOS e plataformas desconhecidas continuam sem nada", () => {
    const s = servico(TUDO);
    // o `ios` ainda não existe: melhor "nada" que um `.apk` ou um `.app.tar.gz`
    expect(s.manifesto("ios-aarch64", "1.0.0")).toBeNull();
    expect(s.manifesto("freebsd-x86_64", "1.0.0")).toBeNull();
  });
});
