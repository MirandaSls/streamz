import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import type { LinkEmbed } from "@streamz/shared";
import { buscarHtml } from "./busca-segura";
import { decodificarEntidades, extrairTags } from "./meta-tags";

/** Quanto tempo uma prévia fica em cache (a página não muda a cada segundo). */
const TTL_MS = 60 * 60_000;
/** Teto de entradas em cache — é memória do processo. */
const MAX_ENTRIES = 500;

interface Cached {
  embed: LinkEmbed | null;
  at: number;
}

/**
 * Prévia de link (Open Graph), como os embeds do Discord.
 *
 * A API busca a página por conta própria porque o browser não pode (CORS), o
 * que faz dela um cliente HTTP dirigido por quem manda a mensagem. As defesas
 * disso vivem em `busca-segura.ts` (só http(s), nenhum IP interno, nem no
 * redirecionamento nem na hora de conectar, teto de saltos, 512 KB, 5 s) e a
 * leitura das tags em `meta-tags.ts` (varredura linear, sem ReDoS). Aqui fica
 * só a montagem da prévia e o cache em memória com TTL.
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
      const html = await buscarHtml(url);
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

  private parse(url: URL, html: string): LinkEmbed | null {
    const { metas, titulo } = extrairTags(html);
    const meta = (prop: string): string | null => {
      const v = metas.get(prop);
      return v ? decodificarEntidades(v).trim() || null : null;
    };
    const title = meta("og:title") ?? meta("twitter:title") ?? (titulo ? decodificarEntidades(titulo).trim() || null : null);
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

  private remember(href: string, embed: LinkEmbed | null) {
    if (this.cache.size >= MAX_ENTRIES) {
      // Map preserva ordem de inserção: o primeiro é o mais antigo
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(href, { embed, at: Date.now() });
  }
}
