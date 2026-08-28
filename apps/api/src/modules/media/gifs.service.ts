import { Injectable, Logger } from "@nestjs/common";
import type {
  GifCategoriesResponse,
  GifCategory,
  GifResult,
  GifSearchResponse,
} from "@streamz/shared";

/** Base da API do provedor (Giphy v1). */
const GIPHY = "https://api.giphy.com/v1/gifs";
const TIMEOUT_MS = 5_000;
/** GIFs por página do seletor. */
const LIMITE_PADRAO = 30;
/** Quanto tempo uma busca fica em cache (o mesmo termo repete muito). */
const TTL_MS = 10 * 60_000;
const MAX_ENTRIES = 100;
/**
 * Teto de conteúdo: o Giphy devolve o rating pedido **e os abaixo dele**, então
 * `pg` = G + PG, o mesmo recorte do antigo `contentfilter=medium`.
 */
const RATING = "pg";
/** Renditions aceitas para o GIF de envio, da melhor para a mais magra. */
const FORMATOS_ENVIO = ["original", "downsized_large", "fixed_width"];
/**
 * Renditions aceitas para a miniatura da grade. As `_still` vêm primeiro porque
 * o cartão só anima no hover — dezenas de GIFs rodando juntos travam a rolagem.
 */
const FORMATOS_PREVIA = [
  "fixed_width_still",
  "fixed_width_small_still",
  "preview_gif",
  "fixed_width_small",
];

/** O que a resposta do Giphy traz de útil; o resto é ignorado. */
interface GiphyImage {
  url?: string;
  /** o Giphy manda dimensão como string ("480"), não como número. */
  width?: string;
  height?: string;
}
interface GiphyItem {
  id?: string;
  title?: string;
  alt_text?: string;
  images?: Record<string, GiphyImage | undefined>;
}
interface GiphyCategory {
  name?: string;
  name_encoded?: string;
  /** GIF de capa da categoria. */
  gif?: GiphyItem;
}

/**
 * Rótulo em pt-BR das categorias. O Giphy só devolve nome em inglês e a UI do
 * projeto é toda em português, então o mapa é fixo — a lista dele também é (28
 * categorias), e a chave é o `name_encoded`, que não muda quando eles reescrevem
 * o nome de exibição.
 *
 * O rótulo vira **também** o termo de busca: o clique joga o termo no campo, e
 * um campo em inglês num app em português desfaria a tradução na cara de quem
 * clicou. A busca manda `lang=pt`, que é o que torna isso viável.
 */
const CATEGORIAS_PT: Record<string, string> = {
  actions: "Ações",
  adjectives: "Adjetivos",
  animals: "Animais",
  anime: "Anime",
  "art-design": "Arte e design",
  "cartoons-comics": "Desenhos e quadrinhos",
  celebrities: "Celebridades",
  decades: "Décadas",
  emotions: "Emoções",
  "fashion-beauty": "Moda e beleza",
  "food-drink": "Comida e bebida",
  gaming: "Games",
  greetings: "Saudações",
  holiday: "Datas comemorativas",
  identity: "Identidade",
  interests: "Interesses",
  memes: "Memes",
  movies: "Filmes",
  music: "Música",
  nature: "Natureza",
  "news-politics": "Notícias e política",
  reactions: "Reações",
  science: "Ciência",
  sports: "Esportes",
  // "Adesivos", não "Figurinhas": figurinha já é uma feature nossa (Sticker), e
  // repetir o nome faria a categoria do Giphy parecer o acervo do servidor.
  stickers: "Adesivos",
  transportation: "Transporte",
  tv: "TV",
  weird: "Estranho",
};

interface Cached {
  at: number;
  results: GifResult[];
}

/**
 * Busca de GIF pelo Giphy v1.
 *
 * `GIPHY_API_KEY` é **opcional**, como as credenciais do R2 e do LiveKit: sem
 * ela nada quebra — as rotas respondem `configured: false` e a interface mostra
 * "GIFs não configurados" em vez de um erro. Por isso a ausência da chave não
 * entra em `common/env.ts`.
 *
 * A chamada é feita pela API, não pelo browser, para a chave não ir para o
 * cliente (e porque a cota é por chave: no browser qualquer um gastaria a nossa).
 */
@Injectable()
export class GifsService {
  private readonly logger = new Logger(GifsService.name);
  private readonly cache = new Map<string, Cached>();

  isConfigured(): boolean {
    return Boolean(process.env.GIPHY_API_KEY);
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

    const rota = q ? "search" : "trending";
    const params = new URLSearchParams({
      api_key: process.env.GIPHY_API_KEY!,
      limit: String(Math.min(Math.max(limit, 1), 50)),
      rating: RATING,
    });
    if (q) {
      params.set("q", q);
      // `lang` só vale na busca; o /trending ignora e devolveria erro de param
      params.set("lang", "pt");
    }

    const dados = await this.pegar<{ data?: GiphyItem[] }>(`${GIPHY}/${rota}?${params}`);
    const results = (dados?.data ?? []).flatMap((item) => this.toResult(item));
    this.lembrar(chave, results);
    return { configured: true, results };
  }

  /** Categorias sugeridas enquanto ainda não se buscou nada. */
  async categories(): Promise<GifCategoriesResponse> {
    if (!this.isConfigured()) return { configured: false, categories: [] };
    const params = new URLSearchParams({ api_key: process.env.GIPHY_API_KEY! });
    const dados = await this.pegar<{ data?: GiphyCategory[] }>(`${GIPHY}/categories?${params}`);
    const categories: GifCategory[] = (dados?.data ?? []).flatMap((c) => {
      // o mapa cobre as 28 de hoje; categoria nova do Giphy cai no nome em
      // inglês em vez de sumir da grade
      const nome =
        CATEGORIAS_PT[c.name_encoded ?? ""] ??
        (c.name?.trim() || c.name_encoded?.replace(/-/g, " ").trim());
      const previewUrl = c.gif ? this.previewDe(c.gif) : undefined;
      if (!nome || !previewUrl) return [];
      return [{ name: nome, previewUrl, searchTerm: nome }];
    });
    return { configured: true, categories };
  }

  /** Item do Giphy → o que a interface usa; descarta o que vier incompleto. */
  private toResult(item: GiphyItem): GifResult[] {
    const cheio = this.rendition(item, FORMATOS_ENVIO);
    const previewUrl = this.previewDe(item) ?? cheio?.url;
    if (!item.id || !cheio?.url || !previewUrl) return [];
    return [
      {
        id: item.id,
        url: cheio.url,
        previewUrl,
        // `alt_text` descreve a cena; o `title` é o nome de marketing do GIF
        description: item.alt_text?.trim() || item.title?.trim() || "GIF",
        width: Number(cheio.width) || 0,
        height: Number(cheio.height) || 0,
      },
    ];
  }

  private previewDe(item: GiphyItem): string | undefined {
    return this.rendition(item, FORMATOS_PREVIA)?.url;
  }

  /** Primeira rendition da lista que o item realmente trouxe com URL. */
  private rendition(item: GiphyItem, nomes: string[]): GiphyImage | undefined {
    for (const nome of nomes) {
      const img = item.images?.[nome];
      if (img?.url) return img;
    }
    return undefined;
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
        this.logger.warn(`Giphy respondeu ${res.status}`);
        return null;
      }
      return (await res.json()) as T;
    } catch (e) {
      this.logger.warn(`Falha ao falar com o Giphy: ${e instanceof Error ? e.message : e}`);
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
