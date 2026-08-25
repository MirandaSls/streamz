import { Injectable, Logger } from "@nestjs/common";
import type {
  GifCategoriesResponse,
  GifCategory,
  GifResult,
  GifSearchResponse,
} from "@newdisc/shared";

/** Base da API do provedor (Tenor v2). */
const TENOR = "https://tenor.googleapis.com/v2";
const TIMEOUT_MS = 5_000;
/** GIFs por página do seletor. */
const LIMITE_PADRAO = 30;
/** Quanto tempo uma busca fica em cache (o mesmo termo repete muito). */
const TTL_MS = 10 * 60_000;
const MAX_ENTRIES = 100;

/** O que a resposta do Tenor traz de útil; o resto é ignorado. */
interface TenorFormat {
  url?: string;
  dims?: number[];
}
interface TenorItem {
  id?: string;
  content_description?: string;
  media_formats?: Record<string, TenorFormat>;
}
interface TenorTag {
  searchterm?: string;
  name?: string;
  image?: string;
}

interface Cached {
  at: number;
  results: GifResult[];
}

/**
 * Busca de GIF pelo Tenor v2.
 *
 * `TENOR_API_KEY` é **opcional**, como as credenciais do R2 e do LiveKit: sem
 * ela nada quebra — as rotas respondem `configured: false` e a interface mostra
 * "GIFs não configurados" em vez de um erro. Por isso a ausência da chave não
 * entra em `common/env.ts`.
 *
 * A chamada é feita pela API, não pelo browser, para a chave não ir para o
 * cliente (e porque o Tenor não devolve CORS para qualquer origem).
 */
@Injectable()
export class GifsService {
  private readonly logger = new Logger(GifsService.name);
  private readonly cache = new Map<string, Cached>();

  isConfigured(): boolean {
    return Boolean(process.env.TENOR_API_KEY);
  }

  async search(query: string, limit = LIMITE_PADRAO): Promise<GifSearchResponse> {
    if (!this.isConfigured()) return { configured: false, results: [] };
    const q = query.trim();
    // sem termo o seletor mostra o que está em alta, como o do Discord
    const chave = `q:${q.toLowerCase()}:${limit}`;
    const hit = this.cache.get(chave);
    if (hit && Date.now() - hit.at < TTL_MS) {
      return { configured: true, results: hit.results };
    }

    const rota = q ? "search" : "featured";
    const params = new URLSearchParams({
      key: process.env.TENOR_API_KEY!,
      client_key: "newdisc",
      limit: String(Math.min(Math.max(limit, 1), 50)),
      media_filter: "gif,tinygif",
      contentfilter: "medium",
    });
    if (q) params.set("q", q);

    const dados = await this.pegar<{ results?: TenorItem[] }>(`${TENOR}/${rota}?${params}`);
    const results = (dados?.results ?? []).flatMap((item) => this.toResult(item));
    this.lembrar(chave, results);
    return { configured: true, results };
  }

  /** Categorias sugeridas enquanto ainda não se buscou nada. */
  async categories(): Promise<GifCategoriesResponse> {
    if (!this.isConfigured()) return { configured: false, categories: [] };
    const params = new URLSearchParams({
      key: process.env.TENOR_API_KEY!,
      client_key: "newdisc",
      type: "featured",
    });
    const dados = await this.pegar<{ tags?: TenorTag[] }>(`${TENOR}/categories?${params}`);
    const categories: GifCategory[] = (dados?.tags ?? [])
      .filter((t): t is TenorTag & { searchterm: string; image: string } =>
        Boolean(t.searchterm && t.image),
      )
      .map((t) => ({
        name: t.name?.replace(/^#/, "") ?? t.searchterm,
        previewUrl: t.image,
        searchTerm: t.searchterm,
      }));
    return { configured: true, categories };
  }

  /** Item do Tenor → o que a interface usa; descarta o que vier incompleto. */
  private toResult(item: TenorItem): GifResult[] {
    const gif = item.media_formats?.gif;
    const preview = item.media_formats?.tinygif ?? gif;
    if (!item.id || !gif?.url || !preview?.url) return [];
    const [w, h] = gif.dims ?? [];
    return [
      {
        id: item.id,
        url: gif.url,
        previewUrl: preview.url,
        description: item.content_description ?? "GIF",
        width: w ?? 0,
        height: h ?? 0,
      },
    ];
  }

  /**
   * GET com tempo limite. Falha de rede não vira 500 para o cliente: devolve
   * null e o seletor mostra "nenhum resultado" — GIF é enfeite, não pode
   * derrubar o envio de mensagem.
   */
  private async pegar<T>(url: string): Promise<T | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        this.logger.warn(`Tenor respondeu ${res.status}`);
        return null;
      }
      return (await res.json()) as T;
    } catch (e) {
      this.logger.warn(`Falha ao falar com o Tenor: ${e instanceof Error ? e.message : e}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private lembrar(chave: string, results: GifResult[]) {
    if (this.cache.size >= MAX_ENTRIES) {
      const primeira = this.cache.keys().next();
      if (!primeira.done) this.cache.delete(primeira.value);
    }
    this.cache.set(chave, { at: Date.now(), results });
  }
}
