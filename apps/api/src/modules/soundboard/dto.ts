import type { SoundboardSound } from "@streamz/shared";

/**
 * Conversor da linha de `SoundboardSound` para o DTO do contrato.
 *
 * A URL é pública por id, pelo mesmo motivo da imagem do emoji: quem toca o som
 * numa chamada faz **todo mundo da sala** baixar aquele arquivo, e alguns deles
 * podem estar ali por uma conversa direta, sem serem membros do servidor de
 * origem. Amarrar a leitura à associação quebraria o som para essas pessoas sem
 * esconder nada que o evento já não tivesse entregado.
 */

function baseDaApi(): string {
  return (process.env.API_PUBLIC_URL ?? "http://localhost:3333").replace(/\/+$/, "");
}

/** URL pública do áudio de um som. */
export function soundUrl(id: string): string {
  return `${baseDaApi()}/api/soundboard/${id}/audio`;
}

export interface SoundboardRow {
  id: string;
  guildId: string;
  name: string;
  emoji: string;
  volume: number;
  createdById: string;
}

export function toSoundDTO(s: SoundboardRow): SoundboardSound {
  return {
    id: s.id,
    guildId: s.guildId,
    name: s.name,
    emoji: s.emoji,
    url: soundUrl(s.id),
    volume: s.volume,
    createdById: s.createdById,
  };
}
