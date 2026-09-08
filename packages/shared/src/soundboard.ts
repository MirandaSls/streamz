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

export interface SoundboardSound {
  id: string;
  /** null nos sons padrão do Streamz, que não pertencem a servidor nenhum. */
  guildId: string | null;
  name: string;
  /** emoji do card; string vazia quando não tem. */
  emoji: string;
  /** URL do áudio (`GET /soundboard/:id/audio`, ou o arquivo estático do padrão). */
  url: string;
  /** volume de referência do som, de 0 a 1 — multiplica o volume do ouvinte. */
  volume: number;
  /** null nos sons padrão. */
  createdById: string | null;
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

// ── os sons padrão ("Sons do Streamz") ───────────────────────

/**
 * Prefixo do id dos sons padrão. É o que distingue, numa chamada de `play`, o
 * som que mora no bucket do que mora no `public/` do app — e o que impede um id
 * de servidor de se passar por padrão (`cuid` não tem dois-pontos).
 */
export const PREFIXO_SOM_PADRAO = "padrao:";

/** Pasta dos arquivos dos sons padrão, servida junto com o app. */
export const PASTA_SONS_PADRAO = "/sons/soundboard";

/**
 * Os sons que vêm com o app.
 *
 * Os **nomes** são os do Discord (é o vocabulário que quem chega já conhece);
 * os **arquivos** não são: são sintetizados, gerados por um script
 * (`scripts/gerar-sons-do-soundboard.py`, no PR). Trocar um deles depois é
 * substituir o arquivo em `apps/web/public/sons/soundboard/` — nada mais nesta
 * lista muda.
 */
export const SONS_PADRAO: readonly SoundboardSound[] = [
  { nome: "quack", emoji: "🦆", rotulo: "quack" },
  { nome: "airhorn", emoji: "📢", rotulo: "airhorn" },
  { nome: "cricket", emoji: "🦗", rotulo: "cricket" },
  { nome: "golf-clap", emoji: "👏", rotulo: "golf clap" },
  { nome: "sad-horn", emoji: "🎺", rotulo: "sad horn" },
  { nome: "ba-dum-tss", emoji: "🥁", rotulo: "ba dum tss" },
].map((s) => ({
  id: `${PREFIXO_SOM_PADRAO}${s.nome}`,
  guildId: null,
  name: s.rotulo,
  emoji: s.emoji,
  url: `${PASTA_SONS_PADRAO}/${s.nome}.mp3`,
  volume: 1,
  createdById: null,
}));

/** O som padrão de um id, ou null se o id não for de um som padrão. */
export function somPadraoPorId(id: string): SoundboardSound | null {
  return SONS_PADRAO.find((s) => s.id === id) ?? null;
}

/** true quando o id é de um som padrão (e não de uma linha do banco). */
export function ehSomPadrao(id: string): boolean {
  return id.startsWith(PREFIXO_SOM_PADRAO);
}
