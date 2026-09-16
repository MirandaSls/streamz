import { createPublicKey, verify, type KeyObject } from "node:crypto";

/**
 * Verificação de assinatura **minisign** — o formato que o `tauri signer` grava
 * no `.sig` e que o atualizador do app confere antes de instalar.
 *
 * Existe do lado da API por um motivo só: a rota de publicação
 * (`POST /updates/macos`) recusa um pacote que o app recusaria. Sem isto, um
 * `.sig` trocado (de outro build, de outra chave) seria aceito, publicado no
 * manifesto e baixado inteiro por todo Mac a cada abertura, só para ser
 * descartado lá. Não substitui a verificação do cliente — é a mesma, antes.
 *
 * Formato (https://jedisct1.github.io/minisign/):
 * - chave pública: `untrusted comment: …\n<base64 de "Ed" + id(8) + chave(32)>`;
 * - assinatura: `untrusted comment: …\n<base64 de alg(2) + id(8) + sig(64)>\n`
 *   `trusted comment: …\n<base64 da sig global(64)>`.
 * O Tauri embrulha os dois textos inteiros em **mais** uma camada de base64 (é
 * assim que a pública está no `tauri.conf.json` e o `.sig` no disco), e esta
 * camada é aceita aqui com ou sem esse embrulho.
 *
 * `alg` é `ED` (pré-hash: a ed25519 assina o BLAKE2b-512 do arquivo — o que o
 * Tauri gera) ou `Ed` (legado: assina o arquivo cru). A assinatura global
 * cobre `sig || trusted comment`, e é conferida também: é ela que impede
 * alguém de trocar o comentário confiável mantendo a assinatura do arquivo.
 */

/**
 * A chave pública do atualizador, **copiada** de
 * `apps/desktop/src-tauri/tauri.conf.json` (`plugins.updater.pubkey`).
 *
 * Embutida em vez de lida do ambiente: a API não tinha essa chave em lugar
 * nenhum, e uma variável a mais é uma chance a mais de publicar contra a chave
 * errada. É pública (vai dentro de todo app instalado). O teste
 * `minisign.spec.ts` confere que ela é igual à do `tauri.conf.json` — trocar
 * a chave do app sem trocar esta derruba o teste.
 */
export const CHAVE_PUBLICA_DO_ATUALIZADOR =
  "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDFFNjczOThFNERENUNCQUEKUldTcXk5Vk5qamxuSHBweUdZdVNwUzFpd1Bld3hwVklQNVVnVkdBZFZwN0QrYzBtWEJhYkNpaHYK";

export interface ChavePublicaMinisign {
  id: Buffer;
  chave: KeyObject;
}

export interface AssinaturaMinisign {
  /** `true` para `ED` (BLAKE2b-512 do arquivo), `false` para `Ed` (arquivo cru). */
  preHash: boolean;
  id: Buffer;
  assinatura: Buffer;
  comentarioConfiavel: string;
  assinaturaGlobal: Buffer;
}

/** Tira o embrulho de base64 do Tauri, se houver. */
function desembrulhar(texto: string): string {
  const limpo = texto.trim();
  if (limpo.startsWith("untrusted comment:")) return limpo;
  if (!/^[A-Za-z0-9+/=\s]+$/.test(limpo)) return limpo;
  return Buffer.from(limpo, "base64").toString("utf8").trim();
}

function linhas(texto: string): string[] {
  return desembrulhar(texto)
    .split(/\r?\n/)
    .map((l) => l.trimEnd());
}

/** `null` quando o texto não é uma chave pública minisign ed25519. */
export function lerChavePublica(texto: string): ChavePublicaMinisign | null {
  const [comentario, corpo] = linhas(texto);
  if (!comentario?.startsWith("untrusted comment:") || !corpo) return null;
  const bruto = Buffer.from(corpo, "base64");
  if (bruto.length !== 42 || bruto.subarray(0, 2).toString("latin1") !== "Ed") return null;
  const chave = createPublicKey({
    key: { kty: "OKP", crv: "Ed25519", x: bruto.subarray(10).toString("base64url") },
    format: "jwk",
  });
  return { id: bruto.subarray(2, 10), chave };
}

/** `null` quando o texto não tem a forma de uma assinatura minisign. */
export function lerAssinatura(texto: string): AssinaturaMinisign | null {
  const [comentario, corpo, confiavel, global] = linhas(texto);
  if (!comentario?.startsWith("untrusted comment:") || !corpo) return null;
  if (!confiavel?.startsWith("trusted comment: ") || !global) return null;
  const bruto = Buffer.from(corpo, "base64");
  if (bruto.length !== 74) return null;
  const alg = bruto.subarray(0, 2).toString("latin1");
  if (alg !== "ED" && alg !== "Ed") return null;
  const assinaturaGlobal = Buffer.from(global, "base64");
  if (assinaturaGlobal.length !== 64) return null;
  return {
    preHash: alg === "ED",
    id: bruto.subarray(2, 10),
    assinatura: bruto.subarray(10),
    comentarioConfiavel: confiavel.slice("trusted comment: ".length),
    assinaturaGlobal,
  };
}

export type ResultadoMinisign =
  | { ok: true }
  | { ok: false; motivo: string };

/**
 * Confere `assinatura` contra `chave`.
 *
 * `conteudo` é o que a ed25519 assinou: o **BLAKE2b-512** do arquivo quando a
 * assinatura é `ED` (o caso do Tauri) ou o arquivo inteiro quando é `Ed`. Quem
 * chama já calculou o hash enquanto recebia o arquivo, então a função só pede
 * o arquivo cru se precisar dele (`lerArquivo`).
 */
export async function verificarMinisign(opcoes: {
  chave: ChavePublicaMinisign;
  assinatura: string;
  blake2b512: Buffer;
  lerArquivo: () => Promise<Buffer>;
}): Promise<ResultadoMinisign> {
  const sig = lerAssinatura(opcoes.assinatura);
  if (!sig) return { ok: false, motivo: "o .sig não é uma assinatura minisign" };
  if (!sig.id.equals(opcoes.chave.id)) {
    return {
      ok: false,
      motivo: `o .sig é de outra chave (id ${hexInvertido(sig.id)}, esperado ${hexInvertido(opcoes.chave.id)})`,
    };
  }
  const conteudo = sig.preHash ? opcoes.blake2b512 : await opcoes.lerArquivo();
  if (!verify(null, conteudo, opcoes.chave.chave, sig.assinatura)) {
    return { ok: false, motivo: "a assinatura não confere com este arquivo" };
  }
  const global = Buffer.concat([sig.assinatura, Buffer.from(sig.comentarioConfiavel, "utf8")]);
  if (!verify(null, global, opcoes.chave.chave, sig.assinaturaGlobal)) {
    return { ok: false, motivo: "a assinatura do comentário confiável não confere" };
  }
  return { ok: true };
}

/** O id como o minisign o imprime (little-endian, maiúsculo). */
function hexInvertido(id: Buffer): string {
  return Buffer.from(id).reverse().toString("hex").toUpperCase();
}
