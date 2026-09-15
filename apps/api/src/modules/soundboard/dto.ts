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

/**
 * O `volume` que chega no envio do som, já como número de 0 a 1 — ou `null`
 * quando o valor não serve.
 *
 * Mora aqui, e não num `class-validator`, porque o corpo é `multipart/form-data`:
 * todo campo chega como **texto** (o `FormData` do navegador não tem número), e
 * o `ValidationPipe` sem `transform` validaria a string "0.5" contra `@IsNumber`
 * e recusaria. Converter à mão num lugar puro também deixa a regra testável sem
 * subir o Nest (`dto.spec.ts`).
 *
 * Ausente ou vazio vale **1**: é o `@default(1)` da coluna (`schema.prisma`,
 * `SoundboardSound.volume`), e é o que todo cliente antigo — que não manda o
 * campo — já recebia. Aceita vírgula decimal porque é como se escreve em pt-BR,
 * e um cliente que formate o número para exibir não deveria levar 400 por isso.
 */
export function volumeDoEnvio(bruto: unknown): number | null {
  if (bruto === undefined || bruto === null) return 1;
  if (typeof bruto === "number") return volumeValido(bruto);
  if (typeof bruto !== "string") return null;
  const texto = bruto.trim();
  if (texto === "") return 1;
  // `Number` e não `parseFloat`: "0.5abc" tem de ser recusado, não virar 0,5
  return volumeValido(Number(texto.replace(",", ".")));
}

function volumeValido(v: number): number | null {
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : null;
}
