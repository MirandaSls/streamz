// Aplicativos (bots): o registro do bot, o usuário-bot e o token.
//
// Parte do contrato de `@streamz/shared`. Importe sempre pelo pacote
// (`@streamz/shared`), nunca por este caminho: o índice é a fronteira.
//
// Ver `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` §10 e §11. A instalação por
// servidor (`AppInstalacao`) continua fora: a tabela `GuildApplication` é da
// F4. Os comandos de barra e as interações entraram na F3, com a migration 4 —
// estão no fim do arquivo.

import { z } from "zod";
import type { PublicUser } from "./dominio";
import { idSchema } from "./internos";
import { ALL_PERMISSIONS } from "./permissoes";
import type { TipoDeComandoDeApp } from "./menus";

// ── limites ──────────────────────────────────────────────────

/** Nome do aplicativo. O mesmo teto do nome de exibição de uma pessoa. */
export const MAX_APP_NAME = 32;

/** Descrição de uma linha, a que aparece no card de "Descobrir aplicativos". */
export const MAX_APP_DESCRIPTION = 300;

// ── DTOs ─────────────────────────────────────────────────────

/**
 * Um aplicativo na lista do portal.
 *
 * `snowflake` é **string decimal**, nunca number: o valor passa de 2^53 e um
 * `number` o truncaria em silêncio. É a mesma regra do `id` do Discord.
 */
export interface AppView {
  id: string;
  snowflake: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  /** aparece em "Descobrir aplicativos" (opt-in do dono). */
  publico: boolean;
  /** bitfield de `Permission` que a tela de instalação sugere por padrão. */
  permissoesPadrao: number;
  createdAt: string;
  /** o usuário-bot, com `bot: true` — é ele que aparece na lista de membros. */
  botUser: PublicUser;
}

/** O mesmo, mais o que só o dono vê. */
export interface AppDetalhe extends AppView {
  /**
   * Os 8 primeiros caracteres do token em vigor. Identificam **o bot** (saem
   * do id dele, dentro da parte 1) e não mudam ao regenerar: servem para o
   * dono reconhecer de quem é um token que ele achou num arquivo de
   * configuração. Um token do outro se distingue por `tokenCriadoEm`.
   * `null` quando o único token foi revogado e nenhum outro foi gerado.
   */
  tokenPrefixo: string | null;
  tokenCriadoEm: string | null;
}

/**
 * A resposta de criar o aplicativo ou regenerar o token.
 *
 * **`token` é a única vez que o valor em claro existe.** O banco guarda só o
 * SHA-256; fechou a tela, perdeu. Nunca logue este objeto.
 */
export interface TokenCriado {
  token: string;
  prefixo: string;
  criadoEm: string;
}

/** Criar o aplicativo devolve o registro e o primeiro token, de uma vez. */
export interface AppCriado {
  app: AppDetalhe;
  token: TokenCriado;
}

// ── schemas ──────────────────────────────────────────────────

/** Criar: só o nome. O resto se edita depois. */
export const appCriarSchema = z.object({
  name: z
    .string({ required_error: "obrigatório", invalid_type_error: "deve ser texto" })
    .trim()
    .min(2, "Nome curto demais")
    .max(MAX_APP_NAME, "Nome longo demais"),
});

export type AppCriarInput = z.infer<typeof appCriarSchema>;

// ── j-bots · F4 · portal, diretório e instalação ─────────────
//
// Ver `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` §11 (D7) e §10 (a tabela
// `GuildApplication`), e `apps/web/components/apps/CONTRATO-F4.md`, que é onde
// as rotas e a divisão de lotes estão escritas.
//
// Este bloco inteiro foi escrito **pelo coordenador da F4, antes dos lotes**,
// exatamente para que os três lotes não editassem o mesmo arquivo em paralelo.
// Quem precisar de um campo que não está aqui pede ao coordenador em vez de
// acrescentar — um contrato que cada lote estende sozinho deixa de ser
// contrato.

/**
 * Editar o aplicativo. Todos os campos são opcionais e **só o que vier é
 * escrito** — mandar `{ publico: true }` não apaga a descrição.
 *
 * `description` aceita `null` explícito para limpar; `undefined` (ausente)
 * quer dizer "não mexa". A distinção existe porque um `z.string().optional()`
 * sozinho não tem como dizer "apague".
 */
export const appEditarSchema = z
  .object({
    name: z.string().trim().min(2, "Nome curto demais").max(MAX_APP_NAME, "Nome longo demais"),
    description: z
      .string()
      .trim()
      .max(MAX_APP_DESCRIPTION, "Descrição longa demais")
      .nullable()
      .transform((d) => (d === "" ? null : d)),
    publico: z.boolean(),
    /**
     * Bitfield de `Permission` sugerido na tela de instalação. Não concede
     * nada: é o que vem pré-marcado para quem instala, e quem instala pode
     * desmarcar.
     */
    permissoesPadrao: z
      .number()
      .int()
      .min(0)
      .refine((p) => (p & ~ALL_PERMISSIONS) === 0, { message: "Permissão desconhecida" }),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, { message: "Nada para editar" });

export type AppEditarInput = z.infer<typeof appEditarSchema>;

/**
 * Um aplicativo como o **diretório** o mostra — a visão pública, sem nada do
 * dono.
 *
 * Não estende `AppView` de propósito: `AppView` é a linha do portal e carrega
 * `publico` e `createdAt`, que não interessam a quem só vai instalar. O que
 * entra aqui e não lá é `servidores`, a contagem de instalações que vira o
 * "em N servidores" do card.
 */
export interface AppDoDiretorio {
  id: string;
  snowflake: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  /** o que a tela de instalação vem com marcado. */
  permissoesPadrao: number;
  /**
   * Aplicativo **oficial** desta instância (os bots de `apps/bots/`).
   *
   * O diretório põe os oficiais primeiro e pode desenhar um selo. Não é
   * permissão nem verificação de terceiro: quer dizer "quem hospeda o Streamz
   * também escreveu este bot". Só o administrador da instância liga o campo.
   */
  oficial: boolean;
  /** em quantos servidores está instalado. É a contagem inteira, não a minha. */
  servidores: number;
  /** o usuário-bot, com `bot: true`. */
  botUser: PublicUser;
}

/** Uma página do diretório. Cursor opaco, como o resto do repo. */
export interface PaginaDoDiretorio {
  itens: AppDoDiretorio[];
  proximoCursor: string | null;
}

/**
 * Uma instalação: o aplicativo X está no servidor Y, com estas permissões.
 *
 * É o DTO de `GET/POST /api/guilds/:id/aplicativos` (a aba "Aplicativos" das
 * configurações do servidor) e o item da lista "Servidores" do portal.
 */
export interface AppInstalacao {
  id: string;
  guildId: string;
  applicationId: string;
  /** o aplicativo, para a linha da lista não precisar de uma segunda chamada. */
  app: AppDoDiretorio;
  /** bitfield de `Permission` concedido — é o que está no cargo gerenciado. */
  permissions: number;
  /** o cargo criado para o bot; `null` só em instalação sem permissão nenhuma. */
  roleId: string | null;
  /** quem instalou. Precisou de `MANAGE_GUILD`. */
  instaladoPor: PublicUser;
  createdAt: string;
}

/**
 * A mesma instalação vista **do lado do dono do app**: o que interessa é o
 * servidor, não o aplicativo (que é sempre o mesmo).
 *
 * É a tela 5 do §11 ("Servidores — onde está instalado, com Remover"). O dono
 * não vê quem instalou: é gente de outro servidor, e o portal não é um
 * diretório de pessoas.
 */
export interface ServidorComOApp {
  guildId: string;
  guildName: string;
  guildIconUrl: string | null;
  permissions: number;
  createdAt: string;
}

/**
 * Instalar: `POST /api/guilds/:id/aplicativos`.
 *
 * `permissions` é o bitfield de `Permission` **do Streamz** (não o do Discord):
 * quem manda é a nossa tela, e a tradução para o bitfield do Discord acontece
 * só na borda de compatibilidade (`paraBitfieldDoDiscord`).
 *
 * O teto de `ALL_PERMISSIONS` não é decoração: um bitfield com bits que não
 * existem viraria um cargo com permissão fantasma, e o `~` de 32 bits com sinal
 * do JavaScript faz de um número grande demais um negativo.
 *
 * **O que este schema não checa, e a API precisa checar:** que quem instala não
 * está concedendo mais do que ele mesmo tem. Um schema não conhece o autor —
 * ver a regra da escalada em `CONTRATO-F4.md`.
 */
export const appInstalarSchema = z.object({
  applicationId: idSchema,
  permissions: z
    .number()
    .int()
    .min(0)
    .refine((p) => (p & ~ALL_PERMISSIONS) === 0, { message: "Permissão desconhecida" }),
});

export type AppInstalarInput = z.infer<typeof appInstalarSchema>;

/**
 * `POST /api/admin/applications/:id/oficial` — marcar (ou desmarcar) um
 * aplicativo como **oficial da instância**.
 *
 * Fica fora do `appEditarSchema` de propósito: se o dono pudesse ligar o campo
 * pelo portal, "oficial" passaria a querer dizer "quem marcou a caixinha".
 * Quem chama é o administrador da instância — e, na prática, o
 * `apps/bots/src/provisionar.ts`, que sobe os bots de `apps/bots/`.
 */
export const adminAppOficialSchema = z.object({ oficial: z.boolean() });

export type AdminAppOficialInput = z.infer<typeof adminAppOficialSchema>;

// ── j-bots · F3 · comandos de barra e interações ─────────────
//
// Ver `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` §9 (D6) e §10 (as tabelas
// `ApplicationCommand` e `Interaction`, migration 4).

/**
 * Tipos de opção de comando que a F3 aceita, no valor numérico do Discord.
 *
 * Subcomando (1) e grupo de subcomando (2) ficam para a F5, junto com o
 * autocomplete de opção — um `PUT` que os traga é **recusado** com 50035, e
 * não aceito e ignorado: um comando que aparece no composer e não funciona é
 * pior que um comando que o dono do bot descobre que não subiu.
 */
export const TIPOS_DE_OPCAO_ACEITOS = [3, 4, 5, 6, 7, 8, 10] as const;
export type TipoDeOpcao = (typeof TIPOS_DE_OPCAO_ACEITOS)[number];

/** Uma opção declarada por um comando, como o bot a registrou. */
export interface OpcaoDeComando {
  name: string;
  description: string;
  /** 3 string, 4 integer, 5 boolean, 6 user, 7 channel, 8 role, 10 number. */
  type: TipoDeOpcao;
  required: boolean;
  /** escolhas fixas, quando o comando as declara. */
  choices?: { name: string; value: string | number }[];
  /**
   * ── onda 3 ── a opção pede sugestões ao bot enquanto a pessoa digita
   * (interação tipo 4, resposta pelo callback 8). Só vale para 3, 4 e 10, e
   * nunca junto de `choices` — é a regra do Discord. Ver
   * `pedidoDeAutocompleteSchema` em `mensagens-de-bot.ts`.
   */
  autocomplete?: boolean;
}

/**
 * Um comando de barra de um bot, como o composer o mostra.
 *
 * É o DTO de `GET /api/guilds/:id/comandos-de-app`. `snowflake` é **string
 * decimal** pelo mesmo motivo de sempre: o número passa de 2^53.
 */
export interface ComandoDeApp {
  /** cuid do `ApplicationCommand` — é o que o composer manda de volta. */
  id: string;
  snowflake: string;
  name: string;
  description: string;
  options: OpcaoDeComando[];
  /** o aplicativo dono, para o autocomplete mostrar de quem é o comando. */
  applicationId: string;
  applicationName: string;
  /** o usuário-bot: nome, e o `avatarUrl` que o autocomplete desenha. */
  botUser: PublicUser;
  /**
   * ── menus de contexto ── 1 barra (composer), 2 usuário, 3 mensagem ("Apps >").
   * Ausente = 1 (payload antigo). Comando 2/3 tem `options: []` e
   * `description: ""`, como no Discord. `name` de 2/3 pode ter maiúsculas e
   * espaço — é o rótulo do item do submenu.
   */
  tipo?: TipoDeComandoDeApp;
}

/**
 * Uma opção preenchida por quem digitou, a caminho do bot.
 *
 * `value` já vem no tipo do Discord: texto para 3, número para 4 e 10, booleano
 * para 5, e **id em string** (cuid, que a API traduz para snowflake) para 6, 7
 * e 8.
 */
export const opcaoDeInteracaoSchema = z.object({
  name: z.string().min(1).max(32),
  type: z.union([
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
    z.literal(7),
    z.literal(8),
    z.literal(10),
  ]),
  value: z.union([z.string().max(6000), z.number(), z.boolean()]),
});

export type OpcaoDeInteracao = z.infer<typeof opcaoDeInteracaoSchema>;

/**
 * O corpo de `POST /api/channels/:id/interactions` — o que o composer manda
 * quando alguém aperta Enter num `/comando`.
 *
 * Não há `content`: uma interação **não é uma mensagem**. Quem escreve no canal
 * é o bot, na resposta dele.
 */
export const interacaoCriarSchema = z.object({
  /** cuid do `ApplicationCommand` escolhido no autocomplete. */
  commandId: idSchema,
  options: z.array(opcaoDeInteracaoSchema).max(25).default([]),
  /**
   * Gerado pelo navegador, como nas rotas de componente/modal/autocomplete
   * (`mensagens-de-bot.ts`). Volta em todo `interaction.*` desta interação —
   * sem ele a web não tem com que casar o `interaction.modal` de um
   * `showModal()` respondido a um comando de barra, e o modal não abre.
   * Opcional para não quebrar cliente antigo: sem `nonce`, o comando segue sem
   * eventos por socket e sem o relógio dos 3 s (ver `criarInteracao`).
   */
  nonce: z.string().min(1).max(64).optional(),
  /**
   * ── menus de contexto ── o alvo de um comando de contexto: cuid da
   * mensagem (comando tipo 3) ou do usuário (tipo 2). **Obrigatório** para
   * 2/3 e **proibido** para 1 — a API confere contra o tipo do comando e
   * responde 400 ("Comando de contexto sem alvo" / "Comando de barra não tem
   * alvo"). Com `targetId`, `options` tem de vir vazio.
   */
  targetId: idSchema.optional(),
});

export type InteracaoCriarInput = z.infer<typeof interacaoCriarSchema>;

/**
 * O que a API devolve ao criar a interação. A resposta do bot **não** vem
 * aqui: ela chega pelo socket, como `message.new`, quando o bot responder.
 */
export interface InteracaoCriada {
  id: string;
  snowflake: string;
  /** nome do comando, para a tela poder dizer "usou /play" antes da resposta. */
  name: string;
  /** ISO. `createdAt + 15 min` — depois disso o bot leva 404. */
  expiresAt: string;
}

/**
 * A faixa "@fulano usou /play" que aparece acima da resposta do bot.
 *
 * Vai no `Message.interacao`. Existe porque a resposta de um bot a um comando
 * de barra chega ao canal **sem** que haja uma mensagem do usuário antes dela:
 * sem esta faixa, o chat mostraria o bot falando sozinho.
 */
export interface InteracaoDaMensagem {
  id: string;
  /** o nome do comando, sem a barra. */
  name: string;
  /** quem digitou. */
  user: PublicUser;
  /**
   * ── menus de contexto ── tipo do comando usado. Com 2/3 a faixa diz
   * "@fulano usou **Nome**" (sem a barra). Ausente = 1.
   */
  tipo?: TipoDeComandoDeApp;
}

/**
 * O texto do "pensando…" — a mensagem que o callback tipo 5
 * (`DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE`) põe no canal enquanto o bot
 * resolve.
 *
 * É uma mensagem de verdade, e não um estado de carregamento como no Discord:
 * o Streamz não tem "mensagem que ainda não existe". O `editReply` do bot vira
 * uma edição normal, e é por isso que a prova 3 vê as duas etapas.
 */
export const TEXTO_PENSANDO = "pensando…";
