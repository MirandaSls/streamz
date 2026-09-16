import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHAVE_PUBLICA_DO_ATUALIZADOR,
  lerAssinatura,
  lerChavePublica,
  verificarMinisign,
} from "./minisign";

/** Um par minisign de teste, no mesmo embrulho de base64 do Tauri. */
function parDeTeste() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const id = randomBytes(8);
  const x = Buffer.from(publicKey.export({ format: "jwk" }).x!, "base64url");
  const texto = `untrusted comment: minisign public key: TESTE\n${Buffer.concat([Buffer.from("Ed"), id, x]).toString("base64")}\n`;
  return { publica: Buffer.from(texto).toString("base64"), privada: privateKey, id };
}

function assinar(conteudo: Buffer, privada: KeyObject, id: Buffer, preHash = true, comentario = "timestamp:1\tfile:Streamz.app.tar.gz") {
  const msg = preHash ? createHash("blake2b512").update(conteudo).digest() : conteudo;
  const sig = sign(null, msg, privada);
  const global = sign(null, Buffer.concat([sig, Buffer.from(comentario)]), privada);
  const texto =
    `untrusted comment: signature from tauri secret key\n` +
    `${Buffer.concat([Buffer.from(preHash ? "ED" : "Ed"), id, sig]).toString("base64")}\n` +
    `trusted comment: ${comentario}\n${global.toString("base64")}\n`;
  return Buffer.from(texto).toString("base64");
}

const blake = (b: Buffer) => createHash("blake2b512").update(b).digest();

describe("minisign", () => {
  it("a chave embutida é a mesma do tauri.conf.json", () => {
    const conf = JSON.parse(
      readFileSync(join(__dirname, "../../../../desktop/src-tauri/tauri.conf.json"), "utf8"),
    );
    expect(CHAVE_PUBLICA_DO_ATUALIZADOR).toBe(conf.plugins.updater.pubkey);
    expect(lerChavePublica(CHAVE_PUBLICA_DO_ATUALIZADOR)).not.toBeNull();
  });

  it("lê uma assinatura real do Tauri (formato ED, pré-hash)", () => {
    const real =
      "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVTcXk5Vk5qamxuSGsvRWxaRUVoazMyMWI0UmJYQnRjZ21jcWRGS25POUNMT1ZSMjBjWVlZV3VhVHFQc0N6MlNPWTdqTEVyVnJxZHFZTEJWRWlsczAwdGt6dWRpS1JobHd3PQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzg5NTc3NzgxCWZpbGU6U3RyZWFtel8xLjIuM194NjQtc2V0dXAuZXhlCnUxSWcwcUVmazFGbndxazVKQkxXQ2tMMWVXU0RuNkRQY3hDeGNNb01yWGdWUnpiZGJhUFZhWjVLcmkrT0tobEFDYnA3QzZtMVFHTVgyZ0xReVVtTEN3PT0K";
    const sig = lerAssinatura(real)!;
    expect(sig.preHash).toBe(true);
    // mesmo id da chave do app
    expect(sig.id.equals(lerChavePublica(CHAVE_PUBLICA_DO_ATUALIZADOR)!.id)).toBe(true);
  });

  it("aceita a assinatura certa (ED e Ed) e recusa arquivo trocado, outra chave e comentário trocado", async () => {
    const { publica, privada, id } = parDeTeste();
    const chave = lerChavePublica(publica)!;
    const arquivo = randomBytes(1000);
    const lerArquivo = async () => arquivo;

    const ok = await verificarMinisign({ chave, assinatura: assinar(arquivo, privada, id), blake2b512: blake(arquivo), lerArquivo });
    expect(ok).toEqual({ ok: true });
    const legado = await verificarMinisign({ chave, assinatura: assinar(arquivo, privada, id, false), blake2b512: blake(arquivo), lerArquivo });
    expect(legado).toEqual({ ok: true });

    const outro = randomBytes(1000);
    const trocado = await verificarMinisign({ chave, assinatura: assinar(arquivo, privada, id), blake2b512: blake(outro), lerArquivo });
    expect(trocado.ok).toBe(false);

    const estranho = parDeTeste();
    const outraChave = await verificarMinisign({
      chave,
      assinatura: assinar(arquivo, estranho.privada, estranho.id),
      blake2b512: blake(arquivo),
      lerArquivo,
    });
    expect(outraChave).toMatchObject({ ok: false, motivo: expect.stringContaining("outra chave") });

    // mesmo id, chave diferente: a ed25519 é que recusa
    const mesmoId = await verificarMinisign({ chave, assinatura: assinar(arquivo, estranho.privada, id), blake2b512: blake(arquivo), lerArquivo });
    expect(mesmoId.ok).toBe(false);

    const texto = Buffer.from(assinar(arquivo, privada, id), "base64").toString("utf8");
    const adulterado = Buffer.from(texto.replace("timestamp:1", "timestamp:2")).toString("base64");
    const comentario = await verificarMinisign({ chave, assinatura: adulterado, blake2b512: blake(arquivo), lerArquivo });
    expect(comentario).toMatchObject({ ok: false, motivo: expect.stringContaining("comentário") });

    const lixo = await verificarMinisign({ chave, assinatura: "não é assinatura", blake2b512: blake(arquivo), lerArquivo });
    expect(lixo.ok).toBe(false);
  });
});
