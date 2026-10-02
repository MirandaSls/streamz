// Tipos de domínio: usuário, servidor, canal, mensagem e os enums do banco.
//
// Parte do contrato de `@streamz/shared`. Importe sempre pelo pacote
// (`@streamz/shared`), nunca por este caminho: o índice é a fronteira.

import { z } from "zod";

// ── Domínio ──────────────────────────────────────────────────

export type UserStatus = "ONLINE" | "IDLE" | "DND" | "OFFLINE";
/**
 * Tipo do canal. TEXT/VOICE/ANNOUNCEMENT vivem num servidor; DM/GROUP são
 * conversas sem servidor (`guildId` null) cujo acesso é ser participante — ver
 * ADR-0001. ANNOUNCEMENT é um canal de texto em que só a moderação posta.
 */
export type ChannelType = "TEXT" | "VOICE" | "DM" | "GROUP" | "ANNOUNCEMENT";
/** Só os tipos que um usuário cria dentro de um servidor. */
export type GuildChannelType = Extract<ChannelType, "TEXT" | "VOICE" | "ANNOUNCEMENT">;
export const GUILD_CHANNEL_TYPES: readonly GuildChannelType[] = ["TEXT", "VOICE", "ANNOUNCEMENT"];
export type MemberRole = "OWNER" | "ADMIN" | "MEMBER";

export interface PublicUser {
  id: string;
  username: string;
  /** nome de exibição escolhido pelo usuário; null = mostrar o username. */
  displayName: string | null;
  avatarUrl: string | null;
  status: UserStatus;
  /** status personalizado (texto), já expirado = null. Ver `// ── d-social ──`. */
  customStatusText: string | null;
  /** emoji do status personalizado. */
  customStatusEmoji: string | null;
  /**
   * Quando o status manual (Ausente/Não perturbar/Invisível) expira, em ISO;
   * null = para sempre ou sem status manual. Vencido já vem como null.
   */
  manualStatusExpiresAt: string | null;
  /**
   * Conta de bot: a pílula "BOT" ao lado do nome, e as regras de produto que
   * caem dela. Ver `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` §11.
   *
   * Opcional porque o campo nasceu depois do contrato: um payload antigo, em
   * cache no cliente, não o traz, e `undefined` ali quer dizer "não é bot". A
   * API sempre preenche (`toPublicUser`).
   */
  bot?: boolean;
}

/** Nome a mostrar na tela: displayName, senão username. */
export function displayNameOf(u: Pick<PublicUser, "username" | "displayName">): string {
  return u.displayName?.trim() || u.username;
}

export const MAX_DISPLAY_NAME = 32;
export const MAX_AVATAR_SIZE = 4 * 1024 * 1024; // 4 MB

// ── Imagem de perfil (foto e banner) ─────────────────────────
//
// Foto e banner aceitam os mesmos formatos, e **GIF animado é um deles**, como
// no Discord: o arquivo sobe inteiro e é guardado como veio.
//
// Por que o GIF tem teto próprio: as outras imagens passam antes pelo recorte
// do cliente, que grava um WebP de 512px (avatar) ou 960px (banner) — o que
// chega na API já é pequeno. O GIF **não** passa por ali (recortar num canvas
// achataria a animação num quadro só) e sobe do jeito que a pessoa escolheu,
// então precisa de folga; a API também não redimensiona (não há `sharp`), e é
// por isso que existe um lado máximo em pixels só para ele.

/** Formatos aceitos na foto de perfil e no banner. */
export const TIPOS_DE_IMAGEM_DE_PERFIL = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
] as const;

/** Valor do `accept` do `<input type="file">` de foto e banner. */
export const ACCEPT_IMAGEM_DE_PERFIL = TIPOS_DE_IMAGEM_DE_PERFIL.join(",");

/** Teto do arquivo quando é GIF (foto ou banner), em bytes. */
export const MAX_IMAGEM_DE_PERFIL_GIF = 8 * 1024 * 1024; // 8 MB

/**
 * Lado máximo (px) de um GIF de perfil. Sem redimensionamento no servidor, é o
 * único freio contra um GIF de 4000px que o browser de todo mundo teria que
 * decodificar quadro a quadro em cada linha de mensagem.
 */
export const MAX_LADO_IMAGEM_DE_PERFIL_GIF = 2048;

/** Maior arquivo que qualquer rota de imagem de perfil pode receber (bytes). */
export function maxUploadDeImagemDePerfil(maxEstatico: number): number {
  return Math.max(maxEstatico, MAX_IMAGEM_DE_PERFIL_GIF);
}

/**
 * true quando o arquivo escolhido se anuncia como GIF. É o que o **cliente**
 * usa para desviar do recorte; a palavra final é do servidor, que olha os
 * bytes (`GIF87a`/`GIF89a`) e não o que o arquivo disse ser.
 */
export function ehGifDeclarado(arquivo: { type?: string; name?: string }): boolean {
  return (
    arquivo.type?.toLowerCase() === "image/gif" ||
    /\.gif$/i.test(arquivo.name ?? "")
  );
}

/** Teto em bytes para este arquivo: o do GIF, ou o do formato estático. */
export function maxDaImagemDePerfil(
  arquivo: { type?: string; name?: string },
  maxEstatico: number,
): number {
  return ehGifDeclarado(arquivo) ? MAX_IMAGEM_DE_PERFIL_GIF : maxEstatico;
}

/** Campos editáveis do próprio perfil (PATCH /users/me). */
export interface ProfileUpdate {
  displayName?: string | null;
  /** "Sobre mim" do perfil rico (d-social). */
  aboutMe?: string | null;
  /** pronomes exibidos ao lado do nome no perfil (d-social). */
  pronouns?: string | null;
  /** cor da faixa do perfil, em hex `#rrggbb` (d-social). */
  bannerColor?: string | null;
}

/** Status escolhido pelo usuário (PATCH /users/me/status). null = automático. */
export interface StatusUpdate {
  manualStatus: UserStatus | null;
}

export interface Guild {
  id: string;
  name: string;
  iconUrl: string | null;
  ownerId: string;
  /** texto livre exibido nas configurações e no convite. */
  description: string | null;
  /**
   * Cor da faixa do perfil do servidor — o topo do degradê, em `#rrggbb`.
   * null = sem faixa (o cartão de prévia usa o fundo neutro).
   *
   * É **dado do servidor**, não token de tema: quem escolhe é quem administra,
   * e o valor viaja para todo mundo que vê o cartão. Ver `GUILD_BANNER_COLORS`.
   */
  bannerColor: string | null;
  /** quando o servidor foi criado (ISO) — o "Desde …" do cartão de prévia. */
  createdAt: string;
  /**
   * "Características" do Perfil do servidor: até `MAX_GUILD_TRAITS` etiquetas
   * curtas (emoji + texto) no cartão de prévia, na ordem escolhida.
   */
  traits: GuildTrait[];
  /** "Jogos" do Perfil do servidor: nomes livres, até `MAX_GUILD_GAMES`. */
  games: string[];
  /**
   * Chave "perfil privado" da aba Perfil do servidor. Aqui é só a preferência
   * gravada: o que deixa de aparecer para quem não é membro é decidido por
   * quem monta o cartão de prévia. Não muda quem pode entrar — isso continua
   * sendo convite e descoberta.
   */
  privateProfile: boolean;
  /** há mensagem nova em algum canal visível (por espectador). */
  unread: boolean;
  /** menções a mim não lidas, somadas nos canais visíveis (por espectador). */
  mentionCount: number;
}

/**
 * As dez faixas do "Perfil do servidor" — cinco por linha, duas linhas.
 *
 * Cada uma é um degradê vertical, e os dois extremos foram lidos com `getpixel`
 * no print `docs/Reference/Captura de tela 2026-09-04 100541.png` (amostra de
 * 105×64; topo a 4px da borda de cima, base a 4px da de baixo). Guardar o par
 * medido evita inventar uma fórmula de clareamento que erraria o degradê.
 *
 * São **dados**, não tokens: nada aqui entra no tema. O que fica gravado em
 * `Guild.bannerColor` é o `de` — o `ate` é derivado por esta tabela e, para uma
 * cor fora dela (hexadecimal digitado), a faixa fica sólida.
 *
 * A primeira amostra, no Discord, é a cor tirada do ícone do servidor. Nós não
 * extraímos cor de imagem, então ela entra como mais uma amostra fixa.
 */
export const GUILD_BANNER_COLORS: readonly { de: string; ate: string }[] = [
  { de: "#521c17", ate: "#a26259" },
  { de: "#ff1c90", ate: "#ff89e1" },
  { de: "#e81d1e", ate: "#fe8166" },
  { de: "#e86e1d", ate: "#febf6c" },
  { de: "#e8c02f", ate: "#fefc85" },
  { de: "#71368a", ate: "#c281db" },
  { de: "#029ffc", ate: "#8ff1ff" },
  { de: "#4fe2ca", ate: "#aefefc" },
  { de: "#406601", ate: "#8fb453" },
  { de: "#272727", ate: "#6c6c6c" },
];

/** Cor de faixa válida: `#rrggbb` (o mesmo formato da cor de cargo). */
export function isGuildBannerColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

/**
 * CSS da faixa a partir do que está gravado.
 *
 * Cor da tabela vira o degradê medido; cor de fora dela vira sólida (é o que
 * dá para afirmar sem inventar o segundo tom); `null` devolve `undefined`, e aí
 * quem desenha usa o fundo neutro do cartão.
 */
export function guildBannerBackground(cor: string | null | undefined): string | undefined {
  if (!cor) return undefined;
  const alvo = cor.toLowerCase();
  const par = GUILD_BANNER_COLORS.find((c) => c.de === alvo);
  return par ? `linear-gradient(to bottom, ${par.de}, ${par.ate})` : alvo;
}

// ── Perfil do servidor: características e jogos ──────────────

export const MAX_GUILD_TRAITS = 5;
export const MAX_TRAIT_TEXT = 24;
/**
 * Teto do emoji de uma característica, em unidades UTF-16 (`.length`). Cabe
 * bandeira, tom de pele e as sequências ZWJ curtas; o que passa disso (família
 * de quatro pessoas, `<:nome:id>`) fica de fora — emoji personalizado não entra
 * aqui de propósito, porque o cartão de prévia aparece para quem não é membro
 * e não enxerga os emojis do servidor.
 */
export const MAX_TRAIT_EMOJI = 8;
export const MAX_GUILD_GAMES = 10;
export const MAX_GUILD_GAME_NAME = 64;

/** Uma característica do servidor. `emoji` vazio = etiqueta só com texto. */
export interface GuildTrait {
  emoji: string;
  texto: string;
}

/**
 * Pictogramas, indicadores regionais (bandeiras), keycaps e os modificadores
 * que costuram uma sequência. Dígito, `#` e `*` só valem como base de keycap —
 * sem isso "12" passaria por emoji. ZWJ, VS16 e o keycap ficam fora da classe
 * de caracteres, como alternativas: dentro dela o lint os acusa de marca
 * combinante "enganosa" (`no-misleading-character-class`).
 */
const EMOJI_DE_TRAIT_RE =
  /^(?:[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\u{E0020}-\u{E007F}]|‍|️|⃣|[0-9#*](?=️?⃣))+$/u;

/**
 * Quantos grafemas (o que a pessoa vê como "um caractere") há no texto.
 *
 * `Intl.Segmenter` existe no Node da API e nos navegadores atuais; onde ele
 * faltar, devolve 1 e deixa a palavra final com o servidor — recusar no
 * cliente uma bandeira válida seria pior do que deixar a API recusar depois.
 */
function grafemas(valor: string): number {
  const Segmenter = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (!Segmenter) return 1;
  return Array.from(new Segmenter(undefined, { granularity: "grapheme" }).segment(valor)).length;
}

/** true para um único emoji unicode que caiba em `MAX_TRAIT_EMOJI`. */
export function ehEmojiDeTrait(valor: string): boolean {
  if (!valor || valor.length > MAX_TRAIT_EMOJI) return false;
  if (!EMOJI_DE_TRAIT_RE.test(valor)) return false;
  // Só modificadores (um VS16 solto, um tom de pele sozinho) não é emoji.
  if (!/[\p{Extended_Pictographic}\p{Regional_Indicator}⃣]/u.test(valor)) return false;
  return grafemas(valor) === 1;
}

export const guildTraitSchema = z.object({
  emoji: z
    .string()
    .trim()
    .refine((v) => v === "" || ehEmojiDeTrait(v), "Use um único emoji"),
  texto: z
    .string()
    .trim()
    .min(1, "Escreva a característica")
    .max(MAX_TRAIT_TEXT, `Máximo de ${MAX_TRAIT_TEXT} caracteres`),
});

export const guildTraitsSchema = z
  .array(guildTraitSchema)
  .max(MAX_GUILD_TRAITS, `Máximo de ${MAX_GUILD_TRAITS} características`);

export const guildGamesSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1, "Nome do jogo vazio")
      .max(MAX_GUILD_GAME_NAME, `Máximo de ${MAX_GUILD_GAME_NAME} caracteres`),
  )
  .max(MAX_GUILD_GAMES, `Máximo de ${MAX_GUILD_GAMES} jogos`)
  // Sem diferença de caixa: "Minecraft" e "minecraft" seriam a mesma etiqueta
  // duas vezes no cartão.
  .refine(
    (jogos) => new Set(jogos.map((j) => j.toLowerCase())).size === jogos.length,
    "Jogo repetido",
  );

/**
 * Os campos da aba Perfil do servidor que entram no `PATCH /guilds/:id` (ver
 * `GuildUpdate`). Todos opcionais: o que não vem não muda.
 */
export const guildProfileUpdateSchema = z.object({
  traits: guildTraitsSchema.optional(),
  games: guildGamesSchema.optional(),
  privateProfile: z.boolean().optional(),
});
export type GuildProfileUpdateInput = z.infer<typeof guildProfileUpdateSchema>;

/**
 * Lê a coluna `Guild.traits` (JSON) de volta para o contrato.
 *
 * A coluna é `Json` e não tabela porque são no máximo cinco etiquetas sem
 * identidade própria, sempre lidas e gravadas juntas. O preço é que o banco não
 * garante a forma: esta leitura descarta o que não for um `GuildTrait` válido
 * em vez de deixar um valor torto chegar à tela — a escrita já passou pelo
 * `guildTraitsSchema`, então isto só morde em linha mexida à mão.
 */
export function lerGuildTraits(valor: unknown): GuildTrait[] {
  if (!Array.isArray(valor)) return [];
  const traits: GuildTrait[] = [];
  for (const item of valor) {
    const lido = guildTraitSchema.safeParse(item);
    if (lido.success) traits.push(lido.data);
    if (traits.length === MAX_GUILD_TRAITS) break;
  }
  return traits;
}

export interface Channel {
  id: string;
  /** null em DM/GROUP: a conversa não pertence a servidor nenhum. */
  guildId: string | null;
  /** null em DM (o título é derivado dos participantes); opcional em GROUP. */
  name: string | null;
  type: ChannelType;
  position: number;
  private: boolean;
  readOnly: boolean;
  /** quando chegou a última mensagem (null = canal vazio). */
  lastMessageAt: string | null;
  /** até onde eu li (null = nunca abri). Por espectador. */
  lastReadAt: string | null;
  /** menções a mim depois de lastReadAt. Por espectador. */
  mentionCount: number;
  /** categoria a que o canal pertence (null = sem categoria, fica no topo). */
  categoryId: string | null;
  /** descrição curta mostrada no cabeçalho (null = sem tópico). */
  topic: string | null;
  /** intervalo mínimo entre mensagens do mesmo autor; 0 = desligado. */
  slowmodeSeconds: number;
  /** conteúdo sensível: pede confirmação antes de abrir. */
  nsfw: boolean;
  /**
   * "sincronizado com a categoria" (c-cargos): as permissões deste canal são,
   * hoje, as da categoria dele. A primeira edição feita no próprio canal
   * dessincroniza. Sempre false em canal sem categoria, em DM e em grupo.
   */
  syncedWithCategory: boolean;
}

/** Não lido = existe mensagem depois do que eu li (ou nunca li e há mensagem). */
export function isUnread(c: Pick<Channel, "lastMessageAt" | "lastReadAt">): boolean {
  if (!c.lastMessageAt) return false;
  if (!c.lastReadAt) return true;
  return new Date(c.lastMessageAt).getTime() > new Date(c.lastReadAt).getTime();
}

/**
 * Menção a cargo, do jeito que o texto a guarda: `<@&roleId>`.
 *
 * É a forma com id (e não `@nome`) porque cargo é renomeável: guardar o nome
 * quebraria a menção no dia em que alguém renomeasse o cargo. Só cargos com
 * `mentionable` chegam a ser inseridos pelo composer — a marcação em si não
 * autoriza nada, é o cliente que decide o que oferece.
 */
const ROLE_MENTION_RE = /<@&([A-Za-z0-9_-]{1,64})>/g;

/** Ids dos cargos mencionados no texto, sem repetição. */
export function mentionedRoleIds(content: string): string[] {
  const ids = new Set<string>();
  for (const m of content.matchAll(ROLE_MENTION_RE)) ids.add(m[1]);
  return Array.from(ids);
}

/** true se o texto menciona algum dos cargos passados. */
export function mentionsRole(content: string, roleIds: readonly string[]): boolean {
  if (roleIds.length === 0) return false;
  const mencionados = mentionedRoleIds(content);
  return mencionados.some((id) => roleIds.includes(id));
}

/**
 * true se o texto menciona `@username` (limite de palavra dos dois lados), um
 * cargo meu (`<@&roleId>`) ou atinge todo mundo com `@everyone`/`@here` — que
 * também é menção a mim, senão o aviso do Discord que mais importa seria o
 * único a não contar. Quem não tem permissão para mencionar todos não chega a
 * enviar a menção: o cliente manda texto puro (ver `mentionsEveryone`, na
 * seção g-emojis-midia).
 *
 * `roleIds` são os cargos de quem está lendo; em conversa direta é `[]`.
 */
export function mentionsUser(
  content: string,
  username: string,
  roleIds: readonly string[] = [],
): boolean {
  const esc = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`(^|[^\\w.])@${esc}(?![\\w.-])`, "i").test(content)) return true;
  if (mentionsRole(content, roleIds)) return true;
  return mentionsEveryone(content);
}

/** Primeira URL http(s) do texto — a que vira embed. */
export function extractFirstUrl(content: string): string | null {
  const m = content.match(/https?:\/\/[^\s<>"')\]]+/i);
  return m ? m[0] : null;
}

/** Prévia de link (Open Graph) que a API monta para a primeira URL da mensagem. */
export interface LinkEmbed {
  url: string;
  siteName: string | null;
  title: string | null;
  description: string | null;
  image: string | null;
}

/** Servidor com os canais que o usuário pode ver (GET /guilds/:id, POST /guilds). */
export interface GuildWithChannels extends Guild {
  channels: Channel[];
}

export interface ReactionGroup {
  emoji: string;
  count: number;
  userIds: string[];
}

// ── Menções a todos (@everyone / @here) ──────────────────────
/** Menções que atingem mais de uma pessoa; só valem com permissão. */
export const MENCOES_GLOBAIS = ["everyone", "here"] as const;
export type MencaoGlobal = (typeof MENCOES_GLOBAIS)[number];

/**
 * true se o texto contém `@everyone` ou `@here` (limite de palavra).
 *
 * `\@everyone` **não** conta: a barra invertida é o mesmo escape que o markdown
 * já entende, e é o que o composer insere quando quem escreve não tem permissão
 * de mencionar todos. Sem esta exceção a menção seguiria valendo para "não
 * lido" e notificação mesmo depois de virar texto puro na tela.
 */
export function mentionsEveryone(content: string): boolean {
  return /(^|[^\w.\\])@(everyone|here)(?![\w.-])/i.test(content);
}
