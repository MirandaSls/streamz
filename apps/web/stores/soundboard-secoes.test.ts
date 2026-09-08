import { describe, expect, it } from "vitest";
import { SONS_PADRAO, type GuildSoundboard, type SoundboardSound } from "@streamz/shared";
import { normalizar, secoesDoPainel } from "./soundboard-secoes";

function som(id: string, name: string, guildId: string): SoundboardSound {
  return { id, guildId, name, emoji: "", url: `/x/${id}.mp3`, volume: 1, createdById: "u1" };
}

function guild(guildId: string, guildName: string, sounds: SoundboardSound[]): GuildSoundboard {
  return { guildId, guildName, guildIconUrl: null, sounds };
}

const NOTAS = guild("g1", "Notas", [som("s1", "cade vc", "g1"), som("s2", "sabonete", "g1")]);
const PURGATORIO = guild("g2", "Purgatório", [som("s3", "polenta", "g2")]);

const BASE = {
  guilds: [NOTAS, PURGATORIO],
  favoritos: [] as string[],
  usos: {} as Record<string, number>,
  busca: "",
  guildIdAtivo: "g1" as string | null,
  limiteFrequentes: 6,
};

describe("secoesDoPainel", () => {
  it("segue a ordem do Discord: favoritos, frequentes, servidor aberto, padrão, outros", () => {
    const secoes = secoesDoPainel({ ...BASE, favoritos: ["s1"], usos: { s2: 3 } });
    expect(secoes.map((s) => s.id)).toEqual([
      "favoritos",
      "frequentes",
      "guild:g1",
      "padrao",
      "guild:g2",
    ]);
  });

  it("marca o servidor aberto como `atual` — é ele que ganha o + Adicionar som", () => {
    const secoes = secoesDoPainel(BASE);
    expect(secoes.find((s) => s.id === "guild:g1")?.atual).toBe(true);
    expect(secoes.find((s) => s.id === "guild:g2")?.atual).toBe(false);
  });

  it("mantém Favoritos na tela mesmo vazio, e esconde Frequentes sem histórico", () => {
    const secoes = secoesDoPainel(BASE);
    expect(secoes.some((s) => s.id === "favoritos")).toBe(true);
    expect(secoes.some((s) => s.id === "frequentes")).toBe(false);
  });

  it("descarta id de som que não existe mais (apagado, ou saí do servidor)", () => {
    const secoes = secoesDoPainel({
      ...BASE,
      favoritos: ["s1", "sumiu"],
      usos: { sumiu: 9 },
    });
    expect(secoes.find((s) => s.id === "favoritos")?.sons.map((s) => s.id)).toEqual(["s1"]);
    // o único "frequente" era o som que sumiu: a seção inteira não aparece
    expect(secoes.some((s) => s.id === "frequentes")).toBe(false);
  });

  it("ordena os frequentes do mais tocado para o menos e respeita o limite", () => {
    const secoes = secoesDoPainel({
      ...BASE,
      usos: { s1: 1, s2: 7, s3: 4 },
      limiteFrequentes: 2,
    });
    expect(secoes.find((s) => s.id === "frequentes")?.sons.map((s) => s.id)).toEqual(["s2", "s3"]);
  });

  it("não repete o servidor aberto na lista dos outros", () => {
    const secoes = secoesDoPainel(BASE);
    expect(secoes.filter((s) => s.guildId === "g1")).toHaveLength(1);
  });

  it("esconde servidor sem som nenhum, mas nunca o aberto", () => {
    const vazio = guild("g3", "Vazio", []);
    const secoes = secoesDoPainel({ ...BASE, guilds: [NOTAS, vazio] });
    expect(secoes.some((s) => s.guildId === "g3")).toBe(false);

    const abertoVazio = secoesDoPainel({ ...BASE, guilds: [vazio], guildIdAtivo: "g3" });
    expect(abertoVazio.find((s) => s.guildId === "g3")?.sons).toEqual([]);
  });

  it("a busca vira uma lista só, com sons do servidor e do app juntos", () => {
    const secoes = secoesDoPainel({ ...BASE, busca: "a" });
    expect(secoes).toHaveLength(1);
    expect(secoes[0].id).toBe("busca");
    const ids = secoes[0].sons.map((s) => s.id);
    expect(ids).toContain("s1"); // "cade vc" não tem "a"? tem: "cade"
    expect(ids).toContain(SONS_PADRAO[1].id); // airhorn
  });

  it("a busca ignora acento e caixa", () => {
    const secoes = secoesDoPainel({ ...BASE, busca: "PURG" });
    expect(secoes[0].sons).toHaveLength(0);
    const porNome = secoesDoPainel({ ...BASE, busca: "POLENTA" });
    expect(porNome[0].sons.map((s) => s.id)).toEqual(["s3"]);
  });

  it("sem servidor aberto ainda mostra favoritos, padrão e os servidores", () => {
    const secoes = secoesDoPainel({ ...BASE, guildIdAtivo: null });
    expect(secoes.map((s) => s.id)).toEqual(["favoritos", "padrao", "guild:g1", "guild:g2"]);
  });
});

describe("normalizar", () => {
  it("tira acento, caixa e espaço nas pontas", () => {
    expect(normalizar("  Purgatório ")).toBe("purgatorio");
  });
});
