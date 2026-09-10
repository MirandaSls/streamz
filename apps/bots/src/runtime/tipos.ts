/**
 * O contrato de um bot oficial do Streamz.
 *
 * Cada bot é **uma pasta** em `src/` que exporta um `Bot` como `default`
 * (`src/musica/index.ts`). O runtime (`src/runtime/`) cuida do resto: conectar
 * com discord.js apontado para a nossa API, registrar os comandos de barra na
 * subida, rotear `interactionCreate` e o prefixo `!`, log, reconexão e
 * desligamento limpo.
 *
 * Ver `apps/bots/CONTRATO.md` para o passo a passo de acrescentar um bot.
 */

import type { APIEmbed, Client } from "discord.js";

// ── Comandos ────────────────────────────────────────────────────────────────

/**
 * Tipo de opção, no valor numérico do Discord.
 *
 * São os sete que a nossa casca de compatibilidade aceita (§9 do
 * `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md`): subcomando e grupo de subcomando
 * ficam de fora de propósito — o `PUT` de registro os recusa com 50035, e um
 * comando que aparece no composer e não funciona é pior que um que não sobe.
 */
export const TIPO_TEXTO = 3;
export const TIPO_INTEIRO = 4;
export const TIPO_BOOLEANO = 5;
export const TIPO_USUARIO = 6;
export const TIPO_CANAL = 7;
export const TIPO_CARGO = 8;
export const TIPO_NUMERO = 10;

export type TipoDeOpcao =
  | typeof TIPO_TEXTO
  | typeof TIPO_INTEIRO
  | typeof TIPO_BOOLEANO
  | typeof TIPO_USUARIO
  | typeof TIPO_CANAL
  | typeof TIPO_CARGO
  | typeof TIPO_NUMERO;

/** Uma opção declarada por um comando. */
export interface OpcaoDeComando {
  nome: string;
  descricao: string;
  tipo: TipoDeOpcao;
  obrigatoria?: boolean;
  /** Escolhas fixas (vira `choices` no registro). */
  escolhas?: { nome: string; valor: string | number }[];
  /**
   * Só faz sentido na **última** opção de texto: no prefixo `!` ela engole o
   * resto da linha em vez de uma palavra só.
   *
   * `/tocar <busca ou link>` precisa disso — `!tocar caetano veloso` tem de
   * chegar inteiro, não como `caetano` com `veloso` sobrando.
   */
  restoDaLinha?: boolean;
}

/** O que um comando devolve para o runtime mandar ao usuário. */
export interface RespostaDeComando {
  conteudo?: string;
  embeds?: APIEmbed[];
  /**
   * Mensagem efêmera (`flags: 64`): só quem chamou vê.
   *
   * **No prefixo `!` não existe efêmera** — um canal de texto não tem esse
   * conceito. O runtime degrada para uma resposta normal, citando quem pediu.
   * É melhor que engolir a resposta.
   */
  efemera?: boolean;
}

/**
 * O contexto de uma invocação, igual para `/comando` e para `!comando`.
 *
 * É esta abstração que faz cada comando ser escrito **uma vez** e valer para as
 * duas entradas. O que muda entre elas (defer/edit x enviar no canal, efêmera x
 * citação) mora nos dois adaptadores de `contexto.ts`, não nos comandos.
 */
export interface Contexto {
  /** O bot que está executando (log, cliente, id). */
  readonly bot: ContextoDoBot;
  /** `null` em DM. Os comandos de música exigem servidor. */
  readonly guildId: string | null;
  readonly canalId: string;
  readonly usuarioId: string;
  /** Nome de exibição de quem chamou, para as mensagens. */
  readonly usuario: string;
  /** `true` quando veio de um comando de barra. */
  readonly ehSlash: boolean;

  /** Valor de uma opção de texto (ou `null` se não veio). */
  texto(nome: string): string | null;
  /** Valor de uma opção inteira/numérica (ou `null`). */
  numero(nome: string): number | null;

  /**
   * "Pensando…": adia a resposta.
   *
   * Obrigatório antes de qualquer coisa que passe de ~2 s (uma busca no
   * Lavalink, por exemplo): sem isso o Discord — e a nossa casca — dão a
   * interação por perdida. No prefixo `!` vira um `sendTyping()`.
   */
  pensando(efemera?: boolean): Promise<void>;

  /** Responde. Chamável uma vez por invocação (as seguintes viram followup). */
  responder(resposta: RespostaDeComando | string): Promise<void>;
}

/** Um comando do bot. */
export interface Comando {
  /** Sem barra e em minúsculas: `tocar`, `fila`, `agora`. */
  nome: string;
  descricao: string;
  opcoes?: OpcaoDeComando[];
  /** Nomes alternativos, **só** no prefixo `!` (não vão para o registro). */
  apelidos?: string[];
  executar(ctx: Contexto): Promise<void>;
}

// ── O bot ───────────────────────────────────────────────────────────────────

/** Log estruturado, uma linha de JSON por evento. */
export interface Log {
  debug(mensagem: string, extra?: Record<string, unknown>): void;
  info(mensagem: string, extra?: Record<string, unknown>): void;
  aviso(mensagem: string, extra?: Record<string, unknown>): void;
  erro(mensagem: string, extra?: Record<string, unknown>): void;
}

/** O que o bot recebe no `aoIniciar` e o que cada comando alcança por `ctx.bot`. */
export interface ContextoDoBot {
  /** O id da pasta: `musica`, `moderacao`, … Nunca o nome de exibição. */
  readonly id: string;
  /** O nome de exibição, o mesmo do `Application` no diretório. */
  readonly nome: string;
  readonly cliente: Client;
  readonly log: Log;
}

/**
 * Um bot oficial. É isto que `src/<pasta>/index.ts` exporta como `default`.
 *
 * `nome` e `descricao` não são decoração: são exatamente o que o
 * `provisionar.mjs` grava no `Application` e o que aparece em "Descobrir
 * aplicativos". Prometer no `descricao` o que o bot não faz é o jeito mais
 * barato de gerar reclamação.
 */
export interface Bot {
  nome: string;
  descricao: string;
  comandos: Comando[];
  /**
   * Roda uma vez, **depois** do `ready` e **depois** do registro dos comandos.
   *
   * É onde o bot liga o que é dele (o cliente do Lavalink, um cron, um cache).
   * Lançar aqui derruba só este bot, não os outros do mesmo processo.
   */
  aoIniciar?(ctx: ContextoDoBot): Promise<void> | void;
  /** Simétrico do `aoIniciar`: fechar conexões antes do processo sair. */
  aoDesligar?(ctx: ContextoDoBot): Promise<void> | void;
  /**
   * Intents extras além de `Guilds`, `GuildMessages` e `MessageContent`
   * (que todo bot com prefixo precisa). O bot de música acrescenta
   * `GuildVoiceStates`.
   */
  intents?: number[];
  /**
   * Bitfield de `Permission` (do Streamz) que a tela de instalação sugere.
   * Usado pelo `provisionar.mjs`.
   */
  permissoesPadrao?: number;
  /** Caminho do PNG do ícone, relativo à raiz de `apps/bots`. */
  icone?: string;
}
