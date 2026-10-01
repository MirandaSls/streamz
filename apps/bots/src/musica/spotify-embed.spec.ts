import { describe, expect, it } from "vitest";
import { buscarPlaylistPeloEmbed, faixasDoEmbed, idDePlaylistDoSpotify } from "./spotify-embed";

const ID = "37i9dQZF1DXcBWIGoYBM5M";

// Trecho reduzido do embed real (3 faixas).
const dados = {
  props: {
    pageProps: {
      state: {
        data: {
          entity: {
            type: "playlist",
            name: "Today’s Top Hits",
            title: "Today’s Top Hits",
            subtitle: "Spotify",
            coverArt: { sources: [{ url: "https://i.scdn.co/image/ab67706f0000000209dec89719704eea4f218966" }] },
            trackList: [
              { uri: "spotify:track:70cHKK8bHAfJrOGVnfRG9J", title: "Nicole Kidman", subtitle: "ADÉLA", duration: 181270, entityType: "track" },
              { uri: "spotify:track:11hcBLPtbMp4aQI6zGQLub", title: "Patient Zero", subtitle: "Taylor Swift", duration: 225868, entityType: "track" },
              { uri: "spotify:track:3h5T5JypYU7huFiVYhv1dr", title: "BbY WOW", subtitle: "KAROL G, Judeline, rusowsky", duration: 170000, entityType: "track" },
            ],
          },
        },
      },
    },
  },
};
const pagina = (d: unknown) =>
  `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(d)}</script></body></html>`;
const HTML = pagina(dados);

describe("idDePlaylistDoSpotify", () => {
  it("aceita URL com query", () => {
    expect(idDePlaylistDoSpotify(`https://open.spotify.com/playlist/${ID}?si=abc123`)).toBe(ID);
  });
  it("aceita URL com /intl-xx/", () => {
    expect(idDePlaylistDoSpotify(`https://open.spotify.com/intl-pt/playlist/${ID}`)).toBe(ID);
  });
  it("aceita URI spotify:playlist:", () => {
    expect(idDePlaylistDoSpotify(`spotify:playlist:${ID}`)).toBe(ID);
  });
  it("recusa o que não é playlist do Spotify", () => {
    expect(idDePlaylistDoSpotify("https://open.spotify.com/track/abc1234567890")).toBeNull();
    expect(idDePlaylistDoSpotify(`https://example.com/playlist/${ID}`)).toBeNull();
    expect(idDePlaylistDoSpotify("lofi hip hop")).toBeNull();
    expect(idDePlaylistDoSpotify("")).toBeNull();
  });
});

describe("faixasDoEmbed", () => {
  it("lê nome, título, artistas e duração", () => {
    const r = faixasDoEmbed(HTML);
    expect(r.nome).toBe("Today’s Top Hits");
    expect(r.faixas).toHaveLength(3);
    expect(r.faixas[0]).toEqual({ titulo: "Nicole Kidman", artista: "ADÉLA", duracaoMs: 181270 });
    expect(r.faixas[2]!.artista).toBe("KAROL G, Judeline, rusowsky");
  });
  it("devolve lista vazia sem trackList", () => {
    const html = pagina({ props: { pageProps: { state: { data: { entity: { name: "Gerada", trackList: [] } } } } } });
    expect(faixasDoEmbed(html)).toEqual({ nome: "Gerada", faixas: [] });
  });
  it("não lança com HTML sem __NEXT_DATA__ ou JSON quebrado", () => {
    expect(faixasDoEmbed("<html></html>")).toEqual({ nome: "", faixas: [] });
    expect(faixasDoEmbed('<script id="__NEXT_DATA__">{quebrado</script>')).toEqual({ nome: "", faixas: [] });
  });
});

describe("buscarPlaylistPeloEmbed", () => {
  it("devolve a playlist num 200", async () => {
    let url = "";
    const falso = (async (u: string) => {
      url = u;
      return new Response(HTML, { status: 200 });
    }) as unknown as typeof fetch;
    const r = await buscarPlaylistPeloEmbed(ID, falso);
    expect(url).toBe(`https://open.spotify.com/embed/playlist/${ID}`);
    expect(r?.faixas).toHaveLength(3);
  });
  it("devolve null num 404", async () => {
    const falso = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    expect(await buscarPlaylistPeloEmbed(ID, falso)).toBeNull();
  });
  it("devolve null quando a rede cai", async () => {
    const falso = (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    expect(await buscarPlaylistPeloEmbed(ID, falso)).toBeNull();
  });
});
