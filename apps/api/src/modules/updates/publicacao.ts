import { resolve } from "node:path";

/**
 * Regras puras da publicação do macOS pela API (`POST /updates/macos`): nomes
 * finais, versão aceita, assinatura mágica e o formato do manifesto gravado.
 * Separadas do service para serem testadas sem disco nem Nest.
 */

/** Teto por arquivo. Um `.dmg` universal fica bem abaixo disso. */
export const LIMITE_POR_ARQUIVO = 400 * 1024 * 1024;

/** Teto do `.sig` — o real tem ~420 bytes. */
export const LIMITE_DA_ASSINATURA = 8 * 1024;

/** Os três campos de arquivo que a rota aceita. */
export type CampoDeEnvio = "dmg" | "bundle" | "sig";
export const CAMPOS_DE_ENVIO: readonly CampoDeEnvio[] = ["dmg", "bundle", "sig"];

/**
 * Pasta de cada campo, **absoluta**: `DOWNLOAD_DIR` (a mesma do
 * `DownloadsService`) para o `.dmg`, `UPDATE_DIR` (a do `UpdatesService`)
 * para o pacote do atualizador. Uma função só para o multer (que grava o
 * temporário) e o service (que faz o link): se os dois divergissem, o link
 * cruzaria sistemas de arquivos e falharia.
 */
export function pastaDoEnvio(campo: CampoDeEnvio): string {
  const bruto =
    campo === "dmg"
      ? process.env.DOWNLOAD_DIR?.trim() || "downloads"
      : process.env.UPDATE_DIR?.trim() || "updates";
  return resolve(bruto);
}

/** Nome do manifesto do macOS, dentro de `UPDATE_DIR`. */
export const MANIFESTO_MACOS = "macos.json";

/**
 * `X.Y.Z`, sem `v` e sem sufixo: é o que vai no nome do arquivo e o que o
 * atualizador compara (`versao.ts` ignora pré-lançamento, então aceitar
 * `-beta` aqui publicaria uma versão que o cliente leria como outra).
 */
export function versaoValida(versao: unknown): versao is string {
  return typeof versao === "string" && /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.test(versao);
}

/**
 * Os nomes no disco. São os mesmos que `scripts/publicar-desktop.sh` usa: o
 * `.dmg` sai do bundler já como `Streamz_<versão>_universal.dmg`, e o
 * `.app.tar.gz` (que sai sem versão) é renomeado para não colidir entre
 * releases — a assinatura cobre o conteúdo, não o nome.
 */
export function nomeDoDmg(versao: string): string {
  return `Streamz_${versao}_universal.dmg`;
}

export function nomeDoBundle(versao: string): string {
  return `Streamz_${versao}_universal.app.tar.gz`;
}

/** Sufixo exigido no nome original de cada campo (sem distinguir caixa). */
export const SUFIXO_ORIGINAL: Record<CampoDeEnvio, string> = {
  dmg: ".dmg",
  bundle: ".app.tar.gz",
  sig: ".sig",
};

export function sufixoConfere(campo: CampoDeEnvio, nomeOriginal: string): boolean {
  return nomeOriginal.toLowerCase().endsWith(SUFIXO_ORIGINAL[campo]);
}

/**
 * Assinatura mágica mínima.
 *
 * - **gzip**: `1f 8b` no começo.
 * - **dmg**: não tem assinatura no começo — o que identifica uma imagem UDIF é
 *   o trailer `koly` nos **últimos 512 bytes**. Um `.dmg` gerado pelo
 *   `hdiutil` (o do bundler) sempre tem. Quem recebe o arquivo guarda os
 *   últimos 512 bytes enquanto escreve, e é isso que chega aqui.
 */
export function pareceGzip(inicio: Buffer): boolean {
  return inicio.length >= 2 && inicio[0] === 0x1f && inicio[1] === 0x8b;
}

export function pareceDmg(fim: Buffer): boolean {
  return fim.length >= 512 && fim.subarray(fim.length - 512, fim.length - 508).toString("latin1") === "koly";
}

/** O que `updates/macos.json` guarda. */
export interface ManifestoMacosPublicado {
  version: string;
  url: string;
  signature: string;
  notes: string;
  pubDate: string;
}

/** `null` quando o conteúdo não tem os campos que o atualizador precisa. */
export function lerManifestoMacos(conteudo: unknown): ManifestoMacosPublicado | null {
  if (!conteudo || typeof conteudo !== "object") return null;
  const m = conteudo as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const version = texto(m.version);
  const url = texto(m.url);
  const signature = texto(m.signature);
  if (!version || !url || !signature) return null;
  return {
    version,
    url,
    signature,
    notes: texto(m.notes),
    pubDate: texto(m.pubDate),
  };
}

/** A URL pública do arquivo servido pela rota `arquivo/:nome`. */
export function urlDoArquivo(apiPublica: string, nome: string): string {
  return `${apiPublica.replace(/\/+$/, "")}/api/updates/arquivo/${encodeURIComponent(nome)}`;
}
