/**
 * O manifesto de atualização, com os dois clientes que ele serve.
 *
 * O que estes testes travam é a separação: o Windows exige assinatura (o
 * atualizador do Tauri instala sozinho e é ela que impede um pacote de
 * estranho), o Android **não tem assinatura** e não podia herdar a exigência —
 * se herdasse, bastaria o `DESKTOP_UPDATE_SIGNATURE` estar vazio para o app de
 * celular nunca receber aviso de versão nova, sem erro nenhum aparecer.
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

const ANDROID_COMPLETO = {
  ANDROID_UPDATE_VERSION: "1.2.0",
  ANDROID_UPDATE_URL: "https://streamz.chat/download",
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

describe("UpdatesService — Android (o card da web)", () => {
  it("oferece a página de download, com assinatura vazia", () => {
    const manifesto = servico(ANDROID_COMPLETO).manifesto("android-universal", "1.1.0");
    expect(manifesto?.version).toBe("1.2.0");
    // vazia de propósito: nada é instalado automaticamente no Android, então
    // não há o que a assinatura protegesse (ver o comentário no serviço)
    expect(manifesto?.platforms["android-universal"]).toEqual({
      signature: "",
      url: "https://streamz.chat/download",
    });
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
