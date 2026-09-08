import { describe, expect, it, vi } from "vitest";
import { ApplicationsService, iconeDoApp } from "./applications.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { StorageService } from "../storage/storage.service";
import { appEditarSchema } from "@streamz/shared";

/**
 * O portal do desenvolvedor (F4, lote A): editar, apagar, ícone e a lista de
 * servidores.
 *
 * O que está aqui é o que dá para provar sem banco: **a checagem de dono** (404
 * para o que não existe, 403 para o de outra pessoa, em toda rota nova), **a
 * ordem do apagar** (o usuário-bot é quem cai, e a `Application` vem junto por
 * cascade), e **a derivação do `iconUrl`** — a peça que existe justamente
 * porque a `Application` não tem coluna de URL.
 *
 * O que **não** está aqui, e está dito no PR: o efeito no Postgres de verdade
 * (o cascade em si) e o R2 (não configurado na bancada).
 */

const LINHA = {
  id: "app_1",
  snowflake: 1382915770057249473n,
  ownerId: "u_dono",
  name: "Música",
  description: null as string | null,
  iconKey: null as string | null,
  publico: false,
  permissoesPadrao: 0,
  botUserId: "u_bot",
  createdAt: new Date("2026-09-08T12:00:00Z"),
};

const BOT_USER = {
  id: "u_bot",
  username: "musica",
  displayName: "Música",
  avatarUrl: null,
  status: "OFFLINE" as const,
  isBot: true,
};

/** Um Prisma de mentira com uma `Application` e nada mais. */
function bancada(linha: typeof LINHA | null = LINHA) {
  const findUnique = vi.fn(async () => linha);
  const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    ...(linha ?? LINHA),
    ...data,
    botUser: BOT_USER,
    tokens: [{ prefixo: "MTM4Mjkx", createdAt: new Date("2026-09-08T12:00:00Z") }],
  }));
  const apagarUsuario = vi.fn(async () => ({}));
  const prisma = {
    application: { findUnique, update },
    user: { delete: apagarUsuario },
  } as unknown as PrismaService;

  const apagarObjeto = vi.fn(async () => {});
  const storage = {
    isConfigured: () => true,
    put: vi.fn(async () => {}),
    delete: apagarObjeto,
  } as unknown as StorageService;

  return {
    apps: new ApplicationsService(prisma, storage),
    findUnique,
    update,
    apagarUsuario,
    apagarObjeto,
  };
}

describe("dono do aplicativo", () => {
  /**
   * As quatro rotas novas com id, na mesma prova: quem escreve a quinta não
   * pode esquecer a checagem sem o teste ficar vermelho.
   */
  const rotas: [string, (a: ApplicationsService) => Promise<unknown>][] = [
    ["editar", (a) => a.editar("u_dono", "app_1", { name: "Outro" })],
    ["apagar", (a) => a.apagar("u_dono", "app_1")],
    ["removerIcone", (a) => a.removerIcone("u_dono", "app_1")],
    ["servidoresComOApp", (a) => a.servidoresComOApp("u_dono", "app_1")],
    [
      "atualizarIcone",
      (a) => a.atualizarIcone("u_dono", "app_1", { buffer: Buffer.alloc(0), size: 0 }),
    ],
  ];

  for (const [nome, chamar] of rotas) {
    it(`${nome}: 404 para aplicativo que não existe`, async () => {
      const { apps } = bancada(null);
      await expect(chamar(apps)).rejects.toMatchObject({ status: 404 });
    });

    it(`${nome}: 403 para aplicativo de outra pessoa`, async () => {
      const { apps } = bancada({ ...LINHA, ownerId: "u_outra_pessoa" });
      await expect(chamar(apps)).rejects.toMatchObject({ status: 403 });
    });
  }

  it("404 e 403 são o mesmo par que `regenerarToken` já usava", async () => {
    // a mensagem faz parte do contrato: é o que a tela mostra
    const { apps } = bancada(null);
    await expect(apps.editar("u_dono", "app_1", { publico: true })).rejects.toMatchObject({
      message: "Aplicativo não encontrado",
    });
    const outro = bancada({ ...LINHA, ownerId: "u_outra" });
    await expect(outro.apps.apagar("u_dono", "app_1")).rejects.toMatchObject({
      message: "Este aplicativo não é seu",
    });
  });
});

describe("editar", () => {
  it("escreve só o que veio — `{publico}` não apaga a descrição", async () => {
    const { apps, update } = bancada({ ...LINHA, description: "Toca música" });
    await apps.editar("u_dono", "app_1", { publico: true });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "app_1" }, data: { publico: true } }),
    );
  });

  it("`description: null` apaga; ausente não mexe", async () => {
    const { apps, update } = bancada({ ...LINHA, description: "Toca música" });
    await apps.editar("u_dono", "app_1", { description: null });
    expect(update.mock.calls[0]?.[0]).toMatchObject({ data: { description: null } });

    const outra = bancada({ ...LINHA, description: "Toca música" });
    await outra.apps.editar("u_dono", "app_1", { name: "Outro" });
    expect(outra.update.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ data: { name: "Outro" } }),
    );
  });

  it("o schema recusa corpo vazio antes de o service ser chamado", () => {
    expect(appEditarSchema.safeParse({}).success).toBe(false);
    expect(appEditarSchema.safeParse({ publico: true }).success).toBe(true);
  });

  it("não renomeia o usuário-bot: quem está na lista de membros continua igual", async () => {
    const { apps, update } = bancada();
    await apps.editar("u_dono", "app_1", { name: "Outro nome" });
    // o `include: { botUser }` é leitura; o que não pode é escrita no bot
    const { data } = update.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(data).toEqual({ name: "Outro nome" });
    expect(JSON.stringify(data)).not.toContain("displayName");
  });
});

describe("apagar", () => {
  /**
   * A prova que o §3.1 do contrato pede: quem se apaga é o **usuário-bot**.
   *
   * Apagar a `Application` sozinha deixaria um `User` órfão com `isBot: true`
   * — uma conta sem dono que continua na lista de membros de todo servidor
   * onde entrou.
   */
  it("apaga o usuário-bot, não a `Application`", async () => {
    const { apps, apagarUsuario, update } = bancada();
    await apps.apagar("u_dono", "app_1");
    expect(apagarUsuario).toHaveBeenCalledWith({ where: { id: "u_bot" } });
    expect(update).not.toHaveBeenCalled();
  });

  it("tira o ícone do bucket antes de perder a linha que guardava a chave", async () => {
    const { apps, apagarObjeto, apagarUsuario } = bancada({
      ...LINHA,
      iconKey: "app-icons/app_1/abc.png",
    });
    await apps.apagar("u_dono", "app_1");
    expect(apagarObjeto).toHaveBeenCalledWith("app-icons/app_1/abc.png");
    expect(apagarObjeto.mock.invocationCallOrder[0]).toBeLessThan(
      apagarUsuario.mock.invocationCallOrder[0]!,
    );
  });

  it("aplicativo sem ícone não chama o storage", async () => {
    const { apps, apagarObjeto } = bancada();
    await apps.apagar("u_dono", "app_1");
    expect(apagarObjeto).not.toHaveBeenCalled();
  });
});

describe("ícone", () => {
  it("503 claro quando o R2 não está configurado", async () => {
    const findUnique = vi.fn(async () => LINHA);
    const prisma = { application: { findUnique } } as unknown as PrismaService;
    const storage = { isConfigured: () => false } as unknown as StorageService;
    const apps = new ApplicationsService(prisma, storage);

    await expect(
      apps.atualizarIcone("u_dono", "app_1", { buffer: Buffer.from("x"), size: 1 }),
    ).rejects.toMatchObject({ status: 503 });
  });

  it("recusa o que não é imagem — pelos bytes, não pelo nome", async () => {
    const { apps } = bancada();
    // um HTML que se chamasse `logo.png` passaria por qualquer checagem de nome
    const html = Buffer.from("<html><script>alert(1)</script></html>");
    await expect(
      apps.atualizarIcone("u_dono", "app_1", { buffer: html, size: html.length }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("aceita PNG e guarda a chave com o formato do contrato", async () => {
    const { apps, update, apagarObjeto } = bancada();
    const png = pngDeUmPixel();
    await apps.atualizarIcone("u_dono", "app_1", { buffer: png, size: png.length });

    const chave = (update.mock.calls[0]?.[0] as { data: { iconKey: string } }).data.iconKey;
    expect(chave).toMatch(
      /^app-icons\/app_1\/[0-9a-f-]{36}\.png$/,
    );
    // sem ícone anterior, nada a apagar do bucket
    expect(apagarObjeto).not.toHaveBeenCalled();
  });

  it("troca de ícone apaga a chave anterior — depois de o banco apontar para a nova", async () => {
    const { apps, update, apagarObjeto } = bancada({
      ...LINHA,
      iconKey: "app-icons/app_1/velho.png",
    });
    const png = pngDeUmPixel();
    await apps.atualizarIcone("u_dono", "app_1", { buffer: png, size: png.length });

    expect(apagarObjeto).toHaveBeenCalledWith("app-icons/app_1/velho.png");
    expect(update.mock.invocationCallOrder[0]).toBeLessThan(
      apagarObjeto.mock.invocationCallOrder[0]!,
    );
  });

  it("recusa acima do teto sem tocar no bucket", async () => {
    const { apps, apagarObjeto } = bancada();
    const png = pngDeUmPixel();
    await expect(
      apps.atualizarIcone("u_dono", "app_1", { buffer: png, size: 8 * 1024 * 1024 }),
    ).rejects.toMatchObject({ status: 413 });
    expect(apagarObjeto).not.toHaveBeenCalled();
  });
});

describe("iconeDoApp", () => {
  it("sem chave, sem URL — o cliente cai na inicial do nome", () => {
    expect(iconeDoApp("app_1", null)).toBeNull();
  });

  it("aponta para o proxy da própria API, com a versão na query", () => {
    const antes = process.env.API_PUBLIC_URL;
    process.env.API_PUBLIC_URL = "https://api.exemplo.test/";
    try {
      expect(iconeDoApp("app_1", "app-icons/app_1/abc-def.png")).toBe(
        "https://api.exemplo.test/api/applications/app_1/icone?v=abc-def.png",
      );
    } finally {
      if (antes === undefined) delete process.env.API_PUBLIC_URL;
      else process.env.API_PUBLIC_URL = antes;
    }
  });

  it("a URL muda quando o ícone muda — é o que torna o `immutable` seguro", () => {
    const a = iconeDoApp("app_1", "app-icons/app_1/um.png");
    const b = iconeDoApp("app_1", "app-icons/app_1/outro.png");
    expect(a).not.toBe(b);
  });
});

describe("servidores", () => {
  /**
   * TODO (lote B): quando `GuildApplication` existir, esta prova vira "devolve
   * as instalações do app". Enquanto isso, o que se prova é que a rota **existe
   * e checa o dono** — a tela do portal já a chama.
   */
  it("responde vazio enquanto a tabela do lote B não existe", async () => {
    const { apps } = bancada();
    expect(await apps.servidoresComOApp("u_dono", "app_1")).toEqual([]);
  });
});

/** O menor PNG válido que `sniffImage` reconhece (assinatura + IHDR 1×1). */
function pngDeUmPixel(): Buffer {
  return Buffer.from(
    "89504e470d0a1a0a0000000d494844520000000100000001080600000" +
      "01f15c4890000000a49444154789c6300010000050001" +
      "0d0a2db40000000049454e44ae426082",
    "hex",
  );
}
