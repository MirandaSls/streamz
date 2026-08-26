import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { LinkEmbed } from "@streamz/shared";

/** Quanto tempo uma prévia fica em cache (a página não muda a cada segundo). */
const TTL_MS = 60 * 60_000;
/** Teto de entradas em cache — é memória do processo. */
const MAX_ENTRIES = 500;
/** Bytes lidos da página, no máximo; as tags OG ficam no <head>. */
const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 5_000;

interface Cached {
  embed: LinkEmbed | null;
  at: number;
}

/**
 * Prévia de link (Open Graph), como os embeds do Discord.
 *
 * A API busca a página por conta própria porque o browser não pode (CORS).
 * Riscos tratados: só http(s); resolve o host e recusa IP privado/loopback
 * (evita usar a API como sonda da rede interna — SSRF); lê no máximo 512 KB;
 * tempo limite de 5 s; cache em memória com TTL.
 */
@Injectable()
export class EmbedsService {
  private readonly logger = new Logger(EmbedsService.name);
  private readonly cache = new Map<string, Cached>();

  async preview(raw: string): Promise<LinkEmbed | null> {
    const url = this.parseUrl(raw);
    const hit = this.cache.get(url.href);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.embed;

    let embed: LinkEmbed | null = null;
    try {
      await this.assertPublicHost(url.hostname);
      const html = await this.fetchHead(url);
      embed = this.parse(url, html);
    } catch (e) {
      this.logger.debug(`Sem prévia para ${url.href}: ${e instanceof Error ? e.message : e}`);
    }
    this.remember(url.href, embed);
    return embed;
  }

  private parseUrl(raw: string): URL {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new BadRequestException("URL inválida");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new BadRequestException("Só http(s) tem prévia");
    }
    return url;
  }

  /** Recusa loopback, rede privada e link-local — inclusive por DNS. */
  private async assertPublicHost(host: string) {
    const h = host.toLowerCase();
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) {
      throw new Error("host interno");
    }
    const ips = isIP(h) ? [h] : (await lookup(h, { all: true })).map((r) => r.address);
    for (const ip of ips) {
      if (this.isPrivate(ip)) throw new Error(`ip privado ${ip}`);
    }
  }

  private isPrivate(ip: string): boolean {
    if (ip.includes(":")) {
      const v = ip.toLowerCase();
      return v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:");
    }
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }

  private async fetchHead(url: URL): Promise<string> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        redirect: "follow",
        headers: {
          // alguns sites só entregam OG para "bots" conhecidos
          "user-agent": "Mozilla/5.0 (compatible; StreamzBot/1.0; +https://streamz.dev)",
          accept: "text/html,application/xhtml+xml",
        },
      });
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || !type.includes("html")) throw new Error(`resposta ${res.status} ${type}`);
      const reader = res.body?.getReader();
      if (!reader) return "";
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (total < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        chunks.push(value);
        total += value.byteLength;
      }
      await reader.cancel().catch(() => undefined);
      return Buffer.concat(chunks).toString("utf8");
    } finally {
      clearTimeout(timer);
    }
  }

  private parse(url: URL, html: string): LinkEmbed | null {
    const meta = (prop: string): string | null => {
      const re = new RegExp(
        `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`,
        "i",
      );
      const m = html.match(re);
      const v = m ? (m[1] ?? m[2]) : null;
      return v ? this.decode(v).trim() || null : null;
    };
    const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
    const title = meta("og:title") ?? meta("twitter:title") ?? (titleTag ? this.decode(titleTag).trim() : null);
    const description = meta("og:description") ?? meta("twitter:description") ?? meta("description");
    const imageRaw = meta("og:image") ?? meta("twitter:image");
    const image = imageRaw ? this.absolute(url, imageRaw) : null;
    const siteName = meta("og:site_name") ?? url.hostname.replace(/^www\./, "");
    if (!title && !description && !image) return null;
    return { url: url.href, siteName, title, description, image };
  }

  private absolute(base: URL, maybe: string): string | null {
    try {
      const u = new URL(maybe, base);
      return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
    } catch {
      return null;
    }
  }

  private decode(s: string): string {
    return s
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
  }

  private remember(href: string, embed: LinkEmbed | null) {
    if (this.cache.size >= MAX_ENTRIES) {
      // Map preserva ordem de inserção: o primeiro é o mais antigo
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(href, { embed, at: Date.now() });
  }
}
