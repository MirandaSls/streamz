import "reflect-metadata";
import { Module, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { JwtGuard } from "../../common/jwt.guard";
import { PlatformAdminGuard } from "../admin/admin.guard";
import { PlatformAdminService } from "../admin/platform-admin.service";
import { AccountStatusService } from "../auth/account-status.service";
import { PublicacaoController } from "./publicacao.controller";
import { CHAVE_DO_ATUALIZADOR, PublicacaoMacosService } from "./publicacao-macos.service";
import { UpdatesService } from "./updates.service";

/**
 * `POST /api/updates/macos` com um app Nest de verdade: guards reais (só o
 * banco é de mentira), multer real, disco real (pastas temporárias) e
 * assinatura minisign real, com um par de chaves gerado aqui.
 */

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const ID = randomBytes(8);
const PUBLICA = Buffer.from(
  `untrusted comment: minisign public key: TESTE\n${Buffer.concat([
    Buffer.from("Ed"),
    ID,
    Buffer.from(publicKey.export({ format: "jwk" }).x!, "base64url"),
  ]).toString("base64")}\n`,
).toString("base64");

function assinar(conteudo: Buffer, privada: KeyObject = privateKey): Buffer {
  const sig = sign(null, createHash("blake2b512").update(conteudo).digest(), privada);
  const comentario = "timestamp:1\tfile:Streamz.app.tar.gz";
  const global = sign(null, Buffer.concat([sig, Buffer.from(comentario)]), privada);
  const texto =
    `untrusted comment: signature from tauri secret key\n` +
    `${Buffer.concat([Buffer.from("ED"), ID, sig]).toString("base64")}\n` +
    `trusted comment: ${comentario}\n${global.toString("base64")}\n`;
  return Buffer.from(Buffer.from(texto).toString("base64"));
}

/** Um "dmg": qualquer coisa terminada no trailer UDIF de 512 bytes. */
function dmgFalso(): Buffer {
  const trailer = Buffer.alloc(512);
  trailer.write("koly", 0, "latin1");
  return Buffer.concat([randomBytes(4096), trailer]);
}

const bundleFalso = () => gzipSync(randomBytes(4096));

const RAIZ = mkdtempSync(join(tmpdir(), "publicacao-macos-"));
const DOWNLOADS = join(RAIZ, "downloads");
const UPDATES = join(RAIZ, "updates");

const ADMIN = "user_admin";
const COMUM = "user_comum";

@Module({
  imports: [JwtModule.register({})],
  controllers: [PublicacaoController],
  providers: [
    JwtGuard,
    PlatformAdminGuard,
    UpdatesService,
    PublicacaoMacosService,
    { provide: CHAVE_DO_ATUALIZADOR, useValue: PUBLICA },
    { provide: ConfigService, useValue: { get: (k: string) => process.env[k] } },
    { provide: AccountStatusService, useValue: { estado: async () => ({ existe: true, excluida: false, desativada: false }) } },
    { provide: PlatformAdminService, useValue: { ehAdmin: async (id: string) => id === ADMIN } },
  ],
})
class ModuloDeTeste {}

let app: NestExpressApplication;
let base = "";
let tokenAdmin = "";
let tokenComum = "";
let updates: UpdatesService;

beforeAll(async () => {
  process.env.JWT_SECRET = "segredo-de-teste";
  process.env.DOWNLOAD_DIR = DOWNLOADS;
  process.env.UPDATE_DIR = UPDATES;
  process.env.API_PUBLIC_URL = "https://api.exemplo";
  app = await NestFactory.create<NestExpressApplication>(ModuloDeTeste, { logger: false });
  app.setGlobalPrefix("api");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(0, "127.0.0.1");
  base = `${await app.getUrl()}/api`;
  const jwt = app.get(JwtService);
  tokenAdmin = jwt.sign({ sub: ADMIN, username: "admin" }, { secret: "segredo-de-teste" });
  tokenComum = jwt.sign({ sub: COMUM, username: "comum" }, { secret: "segredo-de-teste" });
  updates = app.get(UpdatesService);
});

afterAll(async () => {
  await app?.close();
  rmSync(RAIZ, { recursive: true, force: true });
  delete process.env.DOWNLOAD_DIR;
  delete process.env.UPDATE_DIR;
  delete process.env.API_PUBLIC_URL;
});

beforeEach(() => {
  rmSync(DOWNLOADS, { recursive: true, force: true });
  rmSync(UPDATES, { recursive: true, force: true });
});

interface Envio {
  version?: string;
  notes?: string;
  dmg?: [Buffer, string];
  bundle?: [Buffer, string];
  sig?: [Buffer, string];
}

async function enviar(envio: Envio, token: string | null = tokenAdmin) {
  const form = new FormData();
  if (envio.version !== undefined) form.append("version", envio.version);
  if (envio.notes !== undefined) form.append("notes", envio.notes);
  for (const campo of ["dmg", "bundle", "sig"] as const) {
    const par = envio[campo];
    if (par) form.append(campo, new Blob([par[0]]), par[1]);
  }
  const res = await fetch(`${base}/updates/macos`, {
    method: "POST",
    body: form,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return { status: res.status, corpo: (await res.json()) as any };
}

/** Tudo que ficou nas duas pastas (inclusive temporários). */
function conteudo(): string[] {
  return [DOWNLOADS, UPDATES].flatMap((d) => (existsSync(d) ? readdirSync(d).map((n) => `${d === DOWNLOADS ? "downloads" : "updates"}/${n}`) : []));
}

function completo(version = "1.4.0"): Envio {
  const bundle = bundleFalso();
  return {
    version,
    notes: "novidades",
    dmg: [dmgFalso(), `Streamz_${version}_universal.dmg`],
    bundle: [bundle, "Streamz.app.tar.gz"],
    sig: [assinar(bundle), "Streamz.app.tar.gz.sig"],
  };
}

describe("POST /api/updates/macos — autorização", () => {
  it("sem login responde 401 e não grava nada", async () => {
    const r = await enviar(completo(), null);
    expect(r.status).toBe(401);
    expect(conteudo()).toEqual([]);
  });

  it("conta que não é admin da instância responde 403 e não grava nada", async () => {
    const r = await enviar(completo(), tokenComum);
    expect(r.status).toBe(403);
    expect(conteudo()).toEqual([]);
  });
});

describe("POST /api/updates/macos — validação (400, nada gravado, nenhum temporário)", () => {
  it("versão inválida", async () => {
    for (const version of ["", "1.2", "v1.2.3", "1.2.3-beta", "../1.2.3"]) {
      const r = await enviar({ ...completo(), version });
      expect(r.status, version).toBe(400);
    }
    expect(conteudo()).toEqual([]);
  });

  it("sem arquivo nenhum", async () => {
    expect((await enviar({ version: "1.4.0" })).status).toBe(400);
  });

  it("bundle sem sig, e sig sem bundle", async () => {
    const { version, bundle, sig } = completo();
    const r1 = await enviar({ version, bundle });
    expect(r1.status).toBe(400);
    expect(r1.corpo.message).toMatch(/só vão juntos/);
    expect((await enviar({ version, sig })).status).toBe(400);
    expect(conteudo()).toEqual([]);
  });

  it("extensão errada", async () => {
    const e = completo();
    expect((await enviar({ ...e, dmg: [e.dmg![0], "Streamz.zip"] })).status).toBe(400);
    expect((await enviar({ ...e, bundle: [e.bundle![0], "Streamz.tar"] })).status).toBe(400);
    expect(conteudo()).toEqual([]);
  });

  it("assinatura mágica errada", async () => {
    const e = completo();
    const r1 = await enviar({ ...e, dmg: [randomBytes(2048), "Streamz_1.4.0_universal.dmg"] });
    expect(r1.status).toBe(400);
    expect(r1.corpo.message).toMatch(/koly/);
    const naoGzip = randomBytes(2048);
    naoGzip[0] = 0;
    const r2 = await enviar({ ...e, bundle: [naoGzip, "Streamz.app.tar.gz"], sig: [assinar(naoGzip), "x.sig"] });
    expect(r2.status).toBe(400);
    expect(conteudo()).toEqual([]);
  });

  it("assinatura minisign inválida (de outro arquivo, ou de outra chave)", async () => {
    const e = completo();
    const r1 = await enviar({ ...e, sig: [assinar(bundleFalso()), "Streamz.app.tar.gz.sig"] });
    expect(r1.status).toBe(400);
    expect(r1.corpo.message).toMatch(/Assinatura do atualizador recusada/);
    const estranha = generateKeyPairSync("ed25519").privateKey;
    const r2 = await enviar({ ...e, sig: [assinar(e.bundle![0], estranha), "Streamz.app.tar.gz.sig"] });
    expect(r2.status).toBe(400);
    expect(conteudo()).toEqual([]);
  });

  it("campo de arquivo desconhecido", async () => {
    const form = new FormData();
    form.append("version", "1.4.0");
    form.append("outro", new Blob([Buffer.from("x")]), "x.dmg");
    const res = await fetch(`${base}/updates/macos`, {
      method: "POST",
      body: form,
      headers: { authorization: `Bearer ${tokenAdmin}` },
    });
    expect(res.status).toBe(400);
    expect(conteudo()).toEqual([]);
  });
});

describe("POST /api/updates/macos — publicação", () => {
  it("grava com os nomes padronizados, escreve o manifesto e o UpdatesService passa a oferecê-lo", async () => {
    const e = completo("1.4.0");
    const r = await enviar(e);
    expect(r.status).toBe(200);
    expect(conteudo().sort()).toEqual([
      "downloads/Streamz_1.4.0_universal.dmg",
      "updates/Streamz_1.4.0_universal.app.tar.gz",
      "updates/macos.json",
    ]);
    expect(readFileSync(join(DOWNLOADS, "Streamz_1.4.0_universal.dmg")).equals(e.dmg![0])).toBe(true);
    expect(r.corpo.arquivos).toEqual([
      expect.objectContaining({
        campo: "dmg",
        nome: "Streamz_1.4.0_universal.dmg",
        pasta: "downloads",
        tamanho: e.dmg![0].length,
        sha256: createHash("sha256").update(e.dmg![0]).digest("hex"),
        situacao: "gravado",
      }),
      expect.objectContaining({ campo: "bundle", nome: "Streamz_1.4.0_universal.app.tar.gz", situacao: "gravado" }),
    ]);
    const url = "https://api.exemplo/api/updates/arquivo/Streamz_1.4.0_universal.app.tar.gz";
    expect(r.corpo.manifesto).toEqual({ gravado: true, url });
    expect(r.corpo.autoUpdateMacos).toEqual({ ativo: true, versao: "1.4.0", origem: "manifesto" });

    const gravado = JSON.parse(readFileSync(join(UPDATES, "macos.json"), "utf8"));
    expect(gravado).toMatchObject({ version: "1.4.0", url, signature: e.sig![0].toString(), notes: "novidades" });

    for (const plataforma of ["darwin-aarch64", "darwin-x86_64"]) {
      expect(updates.manifesto(plataforma, "1.3.9")).toEqual({
        version: "1.4.0",
        notes: "novidades",
        pub_date: gravado.pubDate,
        platforms: { [plataforma]: { signature: e.sig![0].toString(), url } },
      });
    }
    expect(updates.manifesto("darwin-aarch64", "1.4.0")).toBeNull();
    // o pacote do mac não vaza para o Windows
    expect(updates.manifesto("windows-x86_64", "0.0.1")).toBeNull();
  });

  it("é idempotente: o mesmo envio de novo responde 200 com `ja-existia`", async () => {
    const e = completo("1.5.0");
    expect((await enviar(e)).status).toBe(200);
    const r = await enviar(e);
    expect(r.status).toBe(200);
    expect(r.corpo.arquivos.map((a: { situacao: string }) => a.situacao)).toEqual(["ja-existia", "ja-existia"]);
    expect(conteudo().filter((n) => n.includes(".envio-"))).toEqual([]);
  });

  it("nunca sobrescreve conteúdo diferente: 409, e nada muda (nem o arquivo que não conflitava)", async () => {
    const primeiro = completo("1.6.0");
    expect((await enviar({ version: "1.6.0", dmg: primeiro.dmg })).status).toBe(200);
    const antes = readFileSync(join(DOWNLOADS, "Streamz_1.6.0_universal.dmg"));

    const r = await enviar(completo("1.6.0"));
    expect(r.status).toBe(409);
    expect(readFileSync(join(DOWNLOADS, "Streamz_1.6.0_universal.dmg")).equals(antes)).toBe(true);
    expect(conteudo()).toEqual(["downloads/Streamz_1.6.0_universal.dmg"]);
  });

  it("só o .dmg: não mexe no manifesto", async () => {
    const r = await enviar({ version: "1.7.0", dmg: completo().dmg });
    expect(r.status).toBe(200);
    expect(r.corpo.manifesto).toEqual({ gravado: false, url: null });
    expect(existsSync(join(UPDATES, "macos.json"))).toBe(false);
  });

  it("não volta o manifesto para uma versão mais velha", async () => {
    expect((await enviar(completo("2.0.0"))).status).toBe(200);
    const r = await enviar(completo("1.9.0"));
    expect(r.status).toBe(409);
    expect(JSON.parse(readFileSync(join(UPDATES, "macos.json"), "utf8")).version).toBe("2.0.0");
    expect(conteudo().some((n) => n.includes("1.9.0"))).toBe(false);
  });

  it("apaga temporário órfão antigo e ignora o recente", async () => {
    const { mkdirSync, utimesSync } = await import("node:fs");
    mkdirSync(UPDATES, { recursive: true });
    const velho = join(UPDATES, ".envio-velho.parcial");
    writeFileSync(velho, "x");
    const duasHoras = (Date.now() - 2 * 60 * 60 * 1000) / 1000;
    utimesSync(velho, duasHoras, duasHoras);
    expect((await enviar(completo("3.0.0"))).status).toBe(200);
    expect(existsSync(velho)).toBe(false);
  });
});
