/**
 * Sugestões do campo "Jogos Jogados" do Perfil do servidor. Lista estática:
 * o Streamz não tem catálogo de jogos, então o campo também aceita texto livre.
 */
export const JOGOS_POPULARES: readonly string[] = [
  "Minecraft",
  "Fortnite",
  "League of Legends",
  "Valorant",
  "Counter-Strike 2",
  "Roblox",
  "Grand Theft Auto V",
  "Apex Legends",
  "Call of Duty: Warzone",
  "Overwatch 2",
  "Dota 2",
  "Rocket League",
  "Genshin Impact",
  "Rainbow Six Siege",
  "Free Fire",
  "Among Us",
  "Fall Guys",
  "Terraria",
  "Stardew Valley",
  "Elden Ring",
  "The Witcher 3",
  "Cyberpunk 2077",
  "Red Dead Redemption 2",
  "Baldur's Gate 3",
  "Palworld",
  "Helldivers 2",
  "Lethal Company",
  "Hollow Knight",
  "Hades",
  "Dead by Daylight",
  "Rust",
  "ARK: Survival Evolved",
  "Sea of Thieves",
  "World of Warcraft",
  "Path of Exile",
  "Diablo IV",
  "FIFA 25",
  "Pokémon GO",
  "Brawl Stars",
  "Clash Royale",
  "Mobile Legends: Bang Bang",
  "Teamfight Tactics",
];

/** Sugestões que batem com o texto (sem acento nem caixa) e ainda não foram escolhidas. */
export function sugerirJogos(busca: string, escolhidos: readonly string[]): string[] {
  const norm = (s: string) =>
    s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
  const q = norm(busca);
  const ja = new Set(escolhidos.map(norm));
  return JOGOS_POPULARES.filter((j) => !ja.has(norm(j)) && (!q || norm(j).includes(q))).slice(0, 8);
}
