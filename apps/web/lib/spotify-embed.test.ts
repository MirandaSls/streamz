import { describe, expect, it } from "vitest";
// caminho relativo: o `dist/` do shared só passa a exportar isto após o build
import { spotifyEmbedDaUrl } from "../../../packages/shared/src/midia";

const ID = "37i9dQZF1DXcBWIGoYBM5M";

describe("spotifyEmbedDaUrl", () => {
  it("playlist", () => {
    expect(spotifyEmbedDaUrl(`https://open.spotify.com/playlist/${ID}`)).toEqual({ tipo: "playlist", id: ID });
  });
  it("com prefixo intl-xx", () => {
    expect(spotifyEmbedDaUrl(`https://open.spotify.com/intl-pt/album/${ID}`)).toEqual({ tipo: "album", id: ID });
  });
  it("ignora ?si=", () => {
    expect(spotifyEmbedDaUrl(`https://open.spotify.com/track/${ID}?si=abc123`)).toEqual({ tipo: "track", id: ID });
  });
  it("faixa e episódio", () => {
    expect(spotifyEmbedDaUrl(`https://open.spotify.com/episode/${ID}`)?.tipo).toBe("episode");
  });
  it("outro domínio", () => {
    expect(spotifyEmbedDaUrl(`https://example.com/playlist/${ID}`)).toBeNull();
    expect(spotifyEmbedDaUrl(`https://open.spotify.com.evil.com/track/${ID}`)).toBeNull();
  });
  it("id inválido", () => {
    expect(spotifyEmbedDaUrl("https://open.spotify.com/track/curto")).toBeNull();
    expect(spotifyEmbedDaUrl(`https://open.spotify.com/track/${ID}"onload=x`)).toBeNull();
  });
  it("tipo não suportado", () => {
    expect(spotifyEmbedDaUrl(`https://open.spotify.com/user/${ID}`)).toBeNull();
  });
});
