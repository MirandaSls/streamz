/**
 * O manifesto de atualização, com os dois clientes que ele serve.
 *
 * O que estes testes travam é a separação: cada plataforma tem a **sua** prova
 * de integridade, e nenhuma herda a da outra. O Windows exige a assinatura
 * minisign (o atualizador do Tauri instala sozinho e é ela que impede um pacote
 * de estranho); o Android exige o **sha256** (não há verificador de minisign
 * lá, e o app confere o digest antes de abrir o instalador do sistema).
 *
 * Herdar seria defeito nos dois sentidos: com o `DESKTOP_UPDATE_SIGNATURE`
 * vazio o celular nunca receberia versão nova, e sem o `ANDROID_UPDATE_SHA256`
 * o app baixaria um `.apk` que ninguém conferiu — o segundo é o caso grave, e é
 * por isso que o teste "sem sha256 não oferece nada" existe.
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

describe("UpdatesService — outras plataformas", () => {
  it("macOS e Linux não recebem o instalador do Windows", () => {
    const s = servico({ ...DESKTOP_COMPLETO, ...ANDROID_COMPLETO });
    expect(s.manifesto("darwin-aarch64", "1.0.0")).toBeNull();
    expect(s.manifesto("linux-x86_64", "1.0.0")).toBeNull();
    // e nem o `ios`, que ainda não existe: melhor "nada" que um `.apk`
    expect(s.manifesto("ios-aarch64", "1.0.0")).toBeNull();
  });
});
