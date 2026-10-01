// Leitura de playlist do Spotify pela página pública de embed.
// Por quê: o endpoint /v1/playlists/{id}/items devolve 401 para credencial de
// aplicativo (só login de usuário lê). A página de embed é pública e embute o
// estado em <script id="__NEXT_DATA__">, com a lista de faixas (até ~100; as
// playlists geradas pelo Spotify trazem menos, ~50).

export interface FaixaDoEmbed {
  titulo: string;
  artista: string;
  duracaoMs: number;
}

export interface PlaylistDoEmbed {
  nome: string;
  faixas: FaixaDoEmbed[];
}

const TIMEOUT_MS = 8_000;
// Sem User-Agent de navegador a página pode vir diferente/bloqueada.
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const ID_RE = /^[A-Za-z0-9]{10,30}$/;

/** Extrai o id de playlist de URL (com /intl-xx/ e query) ou URI `spotify:playlist:ID`. */
export function idDePlaylistDoSpotify(consulta: string): string | null {
  const texto = consulta.trim();
  const uri = /^spotify:playlist:([A-Za-z0-9]+)$/.exec(texto);
  if (uri) return ID_RE.test(uri[1]!) ? uri[1]! : null;
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    return null;
  }
  if (url.hostname !== "open.spotify.com") return null;
  const m = /^\/(?:intl-[a-z-]+\/)?(?:embed\/)?playlist\/([A-Za-z0-9]+)\/?$/i.exec(url.pathname);
  return m && ID_RE.test(m[1]!) ? m[1]! : null;
}

function texto(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Lê o __NEXT_DATA__ do HTML do embed. Nunca lança: sem faixas, devolve lista vazia. */
export function faixasDoEmbed(html: string): PlaylistDoEmbed {
  const vazio: PlaylistDoEmbed = { nome: "", faixas: [] };
  try {
    const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
    if (!m) return vazio;
    const json = JSON.parse(m[1]!) as {
      props?: { pageProps?: { state?: { data?: { entity?: Record<string, unknown> } } } };
    };
    const entidade = json.props?.pageProps?.state?.data?.entity;
    if (!entidade) return vazio;
    const nome = texto(entidade.name) || texto(entidade.title);
    const lista = Array.isArray(entidade.trackList) ? entidade.trackList : [];
    const faixas: FaixaDoEmbed[] = [];
    for (const item of lista as Record<string, unknown>[]) {
      const titulo = texto(item?.title).trim();
      if (!titulo) continue;
      const duracao = typeof item.duration === "number" && Number.isFinite(item.duration) ? item.duration : 0;
      faixas.push({ titulo, artista: texto(item.subtitle).trim(), duracaoMs: duracao });
    }
    return { nome, faixas };
  } catch {
    return vazio;
  }
}

/** Baixa e interpreta o embed. Devolve null em qualquer erro ou HTTP != 200; nunca lança. */
export async function buscarPlaylistPeloEmbed(
  id: string,
  buscar: typeof fetch = fetch,
): Promise<PlaylistDoEmbed | null> {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), TIMEOUT_MS);
  try {
    const resposta = await buscar(`https://open.spotify.com/embed/playlist/${encodeURIComponent(id)}`, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9" },
      signal: controle.signal,
    });
    if (resposta.status !== 200) return null;
    return faixasDoEmbed(await resposta.text());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
