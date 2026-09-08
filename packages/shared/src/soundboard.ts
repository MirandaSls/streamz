// Painel de efeitos sonoros ("soundboard") — os sons que qualquer um da
// chamada dispara para todo mundo ouvir.
//
// Parte do contrato de `@streamz/shared`. Importe sempre pelo pacote
// (`@streamz/shared`), nunca por este caminho: o índice é a fronteira.

import { z } from "zod";
import type { PublicUser } from "./dominio";

// ── limites ──────────────────────────────────────────────────

/**
 * Tamanho máximo do arquivo de um som (bytes).
 *
 * O mesmo teto da figurinha, e pelo mesmo motivo: é o que cabe num objeto que
 * todo mundo da sala vai baixar no instante em que alguém clicar no card. Cinco
 * segundos de MP3 a 128 kbps dão ~80 KB, então 512 KB é folga para WAV curto.
 */
export const MAX_SOUNDBOARD_SIZE = 512 * 1024; // 512 KB

/**
 * Duração máxima de um som (ms).
 *
 * **Validada só no cliente.** Ler a duração no servidor exigiria decodificar o
 * áudio (não há biblioteca de mídia na API, pelo mesmo motivo que o emoji não é
 * reamostrado — ver `emojis/imagem.ts`); o que dá para conferir lá é tamanho e
 * tipo, e é o que o `validarAudio` faz. O cliente mede com um `<audio>` antes
 * de enviar e recusa o que passar daqui.
 */
export const MAX_SOUNDBOARD_DURACAO_MS = 5_500;

/** Sons personalizados por servidor. */
export const MAX_SOUNDBOARD_POR_GUILD = 24;

/**
 * Um som por segundo, por pessoa.
 *
 * O botão é um alto-falante na orelha de todo mundo da chamada: sem teto, um
 * clique repetido vira arma. O valor é o do Discord, e a conta é do servidor —
 * o cliente também segura o botão, mas isso é conforto, não defesa.
 */
export const SOUNDBOARD_INTERVALO_MS = 1_000;

/**
 * Nome de um som.
 *
 * Ao contrário do emoji, **aceita espaço e maiúscula**: aqui o nome é rótulo de
 * um card ("golf clap", "ba dum tss"), não algo que se digita entre dois-pontos
 * no meio de uma frase.
 */
export const soundboardNomeSchema = z
  .string({ required_error: "obrigatório", invalid_type_error: "deve ser texto" })
  .trim()
  .min(2, "Nome curto demais")
  .max(32, "Nome longo demais");

/** Emoji do card — um caractere (com modificadores), ou nada. */
export const soundboardEmojiSchema = z
  .string()
  .trim()
  .max(16, "Emoji inválido");

// ── o som ────────────────────────────────────────────────────

/**
 * Um som do painel. **Todo som pertence a um servidor**: o Streamz não traz
 * som nenhum de fábrica (os sintetizados do primeiro PR saíram — ver o
 * histórico do PROCESSO-DE-DESENVOLVIMENTO), e por isso `guildId` e
 * `createdById` não são mais anuláveis.
 */
export interface SoundboardSound {
  id: string;
  guildId: string;
  name: string;
  /** emoji do card; string vazia quando não tem. */
  emoji: string;
  /** URL do áudio (`GET /soundboard/:id/audio`). */
  url: string;
  /** volume de referência do som, de 0 a 1 — multiplica o volume do ouvinte. */
  volume: number;
  createdById: string;
}

/** Sons de um servidor, do jeito que o painel agrupa. */
export interface GuildSoundboard {
  guildId: string;
  guildName: string;
  guildIconUrl: string | null;
  sounds: SoundboardSound[];
}

/** Evento de estrutura: a lista de sons do servidor mudou. */
export interface SoundboardUpdatedEvent {
  guildId: string;
  sounds: SoundboardSound[];
}

/**
 * Alguém apertou um som na chamada — vai para quem está **naquele canal de
 * voz**, e só.
 *
 * O som viaja inteiro (não só o id) porque quem ouve pode não ter a lista
 * daquele servidor carregada, e porque assim o receptor não precisa de nenhuma
 * volta à API para tocar: pega a URL e toca no volume que ele mesmo escolheu.
 *
 * **Nada disso passa pelo LiveKit.** O áudio não entra na faixa de microfone de
 * ninguém: cada cliente toca o arquivo localmente, no volume de efeitos dele.
 */
export interface SoundboardPlayEvent {
  channelId: string;
  guildId: string | null;
  sound: SoundboardSound;
  /** quem apertou — o painel mostra "fulano tocou X". */
  user: PublicUser;
}

/** Corpo de `POST /voice/channels/:channelId/soundboard/play`. */
export interface SoundboardPlayInput {
  soundId: string;
}
