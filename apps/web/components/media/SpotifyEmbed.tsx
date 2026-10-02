import type { SpotifyTipo } from "@streamz/shared";

/**
 * Player oficial do Spotify dentro da mensagem, como o Discord.
 *
 * Ao contrário do YouTube não há capa + clique: o embed do Spotify é leve e é
 * o próprio player que mostra capa e faixas. `loading="lazy"` evita carregar
 * dezenas deles numa timeline cheia.
 *
 * Altura: o player compacto (152) serve a faixa e ao episódio; playlist, álbum,
 * artista e programa precisam da lista de faixas (352).
 */
export default function SpotifyEmbed({ tipo, id, title }: { tipo: SpotifyTipo; id: string; title: string }) {
  const compacto = tipo === "track" || tipo === "episode";
  return (
    <iframe
      src={`https://open.spotify.com/embed/${tipo}/${id}?theme=0`}
      title={title}
      loading="lazy"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      style={{ height: compacto ? 152 : 352 }}
      className="mt-1 w-[400px] max-w-full rounded-xl border-0"
    />
  );
}
