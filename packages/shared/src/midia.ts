// Anexos, emojis, figurinhas, GIFs e classificação do que o cliente sabe mostrar.
//
// Parte do contrato de `@streamz/shared`. Importe sempre pelo pacote
// (`@streamz/shared`), nunca por este caminho: o índice é a fronteira.

// ── Anexos ───────────────────────────────────────────────────
import { idSchema } from "./internos";

import { z } from "zod";
import type { InteracaoDaMensagem } from "./aplicativos";
import type { Poll } from "./comunidade";
import type { Channel, MemberRole, PublicUser, ReactionGroup } from "./dominio";
import type { MessageReplyRef, MessageType, ThreadSummary } from "./mensagens";
import type { ComponenteDeMensagem, Embed } from "./mensagens-de-bot";
import type { PreviaDeMensagem } from "./social";

/** Teto de tamanho por arquivo (bytes). Espelhado na validação da API. */
export const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024; // 25 MB
/** Máximo de anexos por mensagem. */
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;
/**
 * Validade (segundos) da URL de leitura de um anexo. A API devolve URL assinada
 * do R2 (ou do seu próprio proxy) que expira — não há URL pública permanente.
 * O cliente deve rebuscar a mensagem se a URL vencer.
 */
export const ATTACHMENT_URL_TTL_SECONDS = 60 * 60; // 1 h

export interface Attachment {
  id: string;
  /** URL pronta para <img>/download (bucket público ou proxy da API). */
  url: string;
  filename: string;
  contentType: string;
  size: number;
  /** dimensões da imagem, quando o arquivo é uma imagem reconhecida. */
  width: number | null;
  height: number | null;
}

/** true se o content-type indica uma imagem que renderizamos inline. */
export function isImageAttachment(a: Pick<Attachment, "contentType">): boolean {
  return a.contentType.startsWith("image/");
}

export interface Message {
  id: string;
  channelId: string;
  /** servidor do canal (null em conversa direta) — o rail usa para "não lido". */
  guildId: string | null;
  author: PublicUser;
  content: string;
  createdAt: string;
  editedAt: string | null;
  reactions: ReactionGroup[];
  /** null = mensagem raiz; preenchido = resposta dentro de uma thread. */
  parentId: string | null;
  /** nº de respostas (só relevante em mensagens raiz). */
  replyCount: number;
  /** anexos vinculados (imagens/arquivos). */
  attachments: Attachment[];
  /** figurinha enviada no lugar do texto (g-emojis-midia); null quando não há. */
  sticker: Sticker | null;
  /** autor/moderação removeu a prévia de link desta mensagem (g-emojis-midia). */
  suppressEmbeds: boolean;
  /**
   * Eco do nonce que o cliente mandou no `message.create`. Só aparece no evento
   * `message.new`; nunca é persistido nem volta no histórico REST. Serve para o
   * autor casar a mensagem real com a versão otimista que já está na tela.
   */
  nonce?: string;
  // ── a-mensagens ──
  /** DEFAULT ou narração do sistema (fixar, entrada de membro, grupo de DM). */
  type: MessageType;
  /** mensagem respondida (referência curta), quando esta é uma resposta. */
  replyTo: MessageReplyRef | null;
  /** true quando a resposta menciona o autor da original ("@ ligado"). */
  replyMention: boolean;
  /** thread nomeada iniciada nesta mensagem (só em mensagem raiz). */
  thread: ThreadSummary | null;
  /** true quando a mensagem está fixada no canal. */
  pinned: boolean;
  /** h-moderacao: preenchido quando a mensagem é uma enquete. */
  poll?: Poll | null;
  // ── j-bots ──
  /**
   * Preenchido quando esta mensagem é a resposta de um bot a um comando de
   * barra: é a faixa "@fulano usou /play" que a tela desenha acima dela.
   *
   * Existe porque a resposta a um `/comando` chega ao canal **sem** nenhuma
   * mensagem do usuário antes — sem a faixa, o bot pareceria falar sozinho.
   *
   * Opcional porque o campo nasceu na F3 e um payload em cache no cliente não
   * o traz; `undefined` e `null` querem dizer a mesma coisa: mensagem normal.
   */
  interacao?: InteracaoDaMensagem | null;
  /**
   * `true` quando esta é uma **mensagem efêmera**: a resposta que o bot mandou
   * com `flags: 64` e que **só quem invocou o comando vê**.
   *
   * Ela não existe na tabela `Message` e portanto não está no histórico do
   * canal: chega uma vez pelo socket, na sala `user:<id>` de quem digitou o
   * comando, e some ao recarregar. A tela desenha o rodapé "Somente você pode
   * ver isso · Dispensar mensagem" e não a conta como não lida.
   *
   * Opcional pelo mesmo motivo de `interacao`: um payload antigo não o traz, e
   * `undefined` quer dizer "mensagem normal".
   */
  efemera?: boolean;
  // ── onda 3 ── mensagens de bot
  /**
   * Embeds ricos, no formato do Discord (`Embed` de `mensagens-de-bot.ts`).
   * Só mensagem de **bot** tem: o composer do Streamz não manda embed. As
   * mídias `attachment://<nome>` já chegam resolvidas para a URL do anexo.
   *
   * Opcional pelo mesmo motivo de `interacao`: payload antigo não o traz;
   * `undefined` e `[]` querem dizer a mesma coisa. A API atual manda sempre.
   */
  embeds?: Embed[];
  /**
   * Componentes (action rows, botões, selects e, com `IS_COMPONENTS_V2`, os de
   * leiaute), no formato do Discord, com `id` numérico em todos.
   */
  components?: ComponenteDeMensagem[];
  /**
   * `FLAGS_DE_MENSAGEM` do Discord. As que a tela lê: `SUPPRESS_EMBEDS` (não
   * desenha embed nenhum — é a coluna `suppressEmbeds` refletida aqui),
   * `EPHEMERAL` (igual a `efemera: true`), `LOADING` (o "está pensando…" do
   * callback 5: desenhe o estado de carregando e ignore o `content`),
   * `SUPPRESS_NOTIFICATIONS` (não notifica nem toca som) e `IS_COMPONENTS_V2`
   * (sem `content` nem embeds; anexos só aparecem se um componente os citar).
   */
  flags?: number;
}

export interface GuildMemberView {
  user: PublicUser;
  role: MemberRole;
  /** ids dos cargos atribuídos (sem o @everyone, que vale para todos). */
  roleIds: string[];
  /** h-moderacao: fim do castigo (ISO) — null/passado = sem castigo. */
  timeoutUntil?: string | null;
  /**
   * Quando entrou no servidor (ISO). É a coluna "Membro desde" da tabela de
   * membros e o critério de ordenação padrão dela.
   */
  joinedAt: string;
  /**
   * ── menus de contexto ── apelido neste servidor (`nick` do Discord), até
   * `MAX_APELIDO_NO_SERVIDOR`. `null` = sem apelido. A API sempre preenche;
   * opcional só por payload antigo em cache. Nome na tela: `nomeParaMim`.
   */
  nickname?: string | null;
}

export interface InviteInfo {
  code: string;
  guildId: string;
  uses: number;
  maxUses: number | null;
  expiresAt: string | null;
}

export interface InvitePreview {
  code: string;
  guild: { id: string; name: string; iconUrl: string | null };
  valid: boolean;
  reason?: string;
}

/**
 * Projeção de uma conversa (DM ou GROUP) para quem está olhando: o canal mais os
 * participantes *exceto* o espectador — informação por usuário, que não cabe na
 * tabela. Mensagens, histórico e busca são os de qualquer `Channel`.
 */
export interface DMChannelView extends Channel {
  /** participantes exceto o próprio usuário. */
  others: PublicUser[];
  /** ícone do grupo (upload), null em DM 1-a-1 e em grupo sem ícone. */
  iconUrl: string | null;
  /** dono do grupo — quem pode remover participantes. null em DM 1-a-1. */
  ownerId: string | null;
  /**
   * Mensagens de outros depois de `lastReadAt` — o número do badge da
   * conversa, como no Discord (em DM toda mensagem não lida conta, não só a
   * menção). Por espectador.
   */
  unreadCount: number;
  /**
   * A última mensagem, aparada, para a linha de prévia embaixo do nome
   * (`linhaDaPrevia`). `null` = conversa sem mensagem nenhuma.
   *
   * Opcional porque o campo nasceu depois: um payload em cache no cliente e as
   * conversas montadas por rotas antigas não o trazem, e `undefined` quer
   * dizer "não sei", não "não tem".
   */
  ultimaMensagem?: PreviaDeMensagem | null;
  /**
   * ── menus de contexto ── quando **eu** fixei esta conversa no topo da lista
   * (ISO); `null` = não fixada. Por espectador. Ordem da lista:
   * `compararConversas` (menus.ts).
   *
   * Opcional pelo mesmo motivo de `ultimaMensagem`; a API sempre preenche, e
   * `undefined` se lê como `null`.
   */
  fixadaEm?: string | null;
}

/** true para conversa de grupo (3+); false para DM 1-a-1. */
export function isGroupChannel(c: Pick<Channel, "type">): boolean {
  return c.type === "GROUP";
}

/** true para conversa sem servidor (DM ou grupo). */
export function isDirectChannel(c: Pick<Channel, "type">): boolean {
  return c.type === "DM" || c.type === "GROUP";
}

/** Máximo de convidados num grupo de DM, além de quem cria. */
export const MAX_DM_GROUP_INVITEES = 10;

/** Resultado de sair de um grupo de DM. */
export interface DMLeaveResult {
  channelId: string;
  /** true quando o grupo ficou sem ninguém e a conversa foi apagada. */
  deleted: boolean;
}

// ── g-emojis-midia ───────────────────────────────────────────
// Emojis personalizados, figurinhas, GIFs e o que o composer precisa saber.

/** Tamanho máximo do arquivo de um emoji personalizado (bytes). */
export const MAX_CUSTOM_EMOJI_SIZE = 256 * 1024; // 256 KB
/** Lado máximo (px) da imagem de um emoji personalizado. */
export const MAX_CUSTOM_EMOJI_DIMENSION = 128;
/** Tamanho máximo do arquivo de uma figurinha (bytes). */
export const MAX_STICKER_SIZE = 512 * 1024; // 512 KB
/** Lado máximo (px) da imagem de uma figurinha. */
export const MAX_STICKER_DIMENSION = 320;
/** Emojis personalizados por servidor. */
export const MAX_EMOJIS_PER_GUILD = 50;
/** Figurinhas por servidor. */
export const MAX_STICKERS_PER_GUILD = 25;

/**
 * Nome de emoji/figurinha: o que cabe entre os dois-pontos de `:nome:`. Sem
 * maiúscula, acento nem espaço, como no Discord — o nome é chave de busca do
 * autocomplete e precisa ser digitável direto no composer.
 */
export const emojiNameSchema = z
  .string({ required_error: "obrigatório", invalid_type_error: "deve ser texto" })
  .min(2, "Nome curto demais")
  .max(32, "Nome longo demais")
  .regex(/^[a-z0-9_]+$/, "Use só letras minúsculas, números e _");

export interface CustomEmoji {
  id: string;
  guildId: string;
  /** nome sem os dois-pontos (`festa`), único dentro do servidor. */
  name: string;
  /** GIF animado — o picker sinaliza; o render usa `<img>` nos dois casos. */
  animated: boolean;
  /** URL da imagem (`GET /emojis/:id/image`). */
  url: string;
  createdById: string;
}

/** Emojis de um servidor, do jeito que o seletor agrupa. */
export interface GuildEmojis {
  guildId: string;
  guildName: string;
  guildIconUrl: string | null;
  emojis: CustomEmoji[];
}

export interface Sticker {
  id: string;
  guildId: string;
  name: string;
  /** palavras-chave separadas por espaço, para a busca do seletor. */
  tags: string;
  /** URL da imagem (`GET /stickers/:id/image`). */
  url: string;
  createdById: string;
}

/** Figurinhas de um servidor, do jeito que o seletor agrupa. */
export interface GuildStickers {
  guildId: string;
  guildName: string;
  guildIconUrl: string | null;
  stickers: Sticker[];
}

/**
 * Forma interna de um emoji personalizado no texto da mensagem e no campo
 * `emoji` de uma reação: `<:nome:id>`. O usuário digita `:nome:` e o cliente
 * troca pela forma interna antes de enviar — assim o emoji continua resolvendo
 * depois de renomeado, e some de vez quando é apagado (o id é o que manda).
 */
export const CUSTOM_EMOJI_RE = /<:([a-z0-9_]{2,32}):([A-Za-z0-9_-]{1,64})>/;
/** Idem, global — para varrer um texto inteiro. */
export const CUSTOM_EMOJI_RE_G = new RegExp(CUSTOM_EMOJI_RE.source, "g");

/** Monta a forma interna `<:nome:id>`. */
export function formatCustomEmoji(name: string, id: string): string {
  return `<:${name}:${id}>`;
}

/** Lê `<:nome:id>`; devolve null se o texto não for exatamente um token. */
export function parseCustomEmoji(token: string): { name: string; id: string } | null {
  const m = token.match(new RegExp(`^${CUSTOM_EMOJI_RE.source}$`));
  return m ? { name: m[1], id: m[2] } : null;
}

/** true quando o texto inteiro é um emoji personalizado (usado em reação). */
export function isCustomEmoji(token: string): boolean {
  return parseCustomEmoji(token) !== null;
}

/**
 * `message.suppressEmbeds`: liga/desliga a prévia de link de uma mensagem.
 * Como toda escrita de mensagem, vai pelo gateway e volta em `message.updated`.
 */
export const suppressEmbedsSchema = z.object({
  messageId: idSchema,
  suppress: z.boolean({ required_error: "obrigatório" }),
});
export type SuppressEmbedsPayload = z.infer<typeof suppressEmbedsSchema>;

/** Evento de estrutura: a lista de emojis do servidor mudou. */
export interface EmojiUpdatedEvent {
  guildId: string;
  emojis: CustomEmoji[];
}

/** Evento de estrutura: a lista de figurinhas do servidor mudou. */
export interface StickerUpdatedEvent {
  guildId: string;
  stickers: Sticker[];
}

// ── GIFs (Giphy v1) ──────────────────────────────────────────
/** Um GIF do provedor de busca, reduzido ao que a interface usa. */
export interface GifResult {
  id: string;
  /** URL do GIF em tamanho de envio. */
  url: string;
  /** URL da miniatura do grid do seletor. */
  previewUrl: string;
  description: string;
  width: number;
  height: number;
}

/** Categoria sugerida enquanto ainda não se buscou nada. */
export interface GifCategory {
  name: string;
  previewUrl: string;
  /** termo que o clique joga na busca. */
  searchTerm: string;
}

/**
 * Resposta das rotas de GIF. `configured: false` quando falta `GIPHY_API_KEY` —
 * a interface mostra "GIFs não configurados" em vez de um erro, espelhando o
 * tratamento de credencial ausente do LiveKit e do R2.
 */
export interface GifSearchResponse {
  configured: boolean;
  results: GifResult[];
}

export interface GifCategoriesResponse {
  configured: boolean;
  categories: GifCategory[];
}

/** Corpo de `POST /uploads/external`: anexo por URL (GIF do provedor). */
export const externalAttachmentSchema = z.object({
  url: z.string().url("URL inválida").max(1024),
  filename: z.string().min(1).max(200),
  width: z.number().int().positive().max(10000).optional(),
  height: z.number().int().positive().max(10000).optional(),
});
export type ExternalAttachmentInput = z.infer<typeof externalAttachmentSchema>;

// ── Classificação de mídia (o que o cliente sabe tocar/mostrar) ──
export function isVideoAttachment(a: Pick<Attachment, "contentType">): boolean {
  return a.contentType.startsWith("video/");
}

export function isAudioAttachment(a: Pick<Attachment, "contentType">): boolean {
  return a.contentType.startsWith("audio/");
}

export function isPdfAttachment(a: Pick<Attachment, "contentType">): boolean {
  return a.contentType === "application/pdf";
}

/**
 * Quebra uma URL http(s) em host, caminho e query, sem `URL` — o contrato é
 * compilado com `lib: ES2022` (sem DOM), onde `URL` não existe como tipo, e
 * este pacote roda nos dois lados. Devolve null se não for http(s).
 */
function partesDaUrl(url: string): { host: string; path: string; query: string } | null {
  const m = url.match(/^https?:\/\/([^/?#]+)([^?#]*)(?:\?([^#]*))?/i);
  if (!m) return null;
  // fora o host, tudo é comparado como veio; só o host é normalizado
  return {
    host: m[1].toLowerCase().replace(/:\d+$/, "").replace(/^www\./, ""),
    path: m[2] || "/",
    query: m[3] ?? "",
  };
}

/** Valor de um parâmetro da query, ou string vazia. */
function paramDaQuery(query: string, nome: string): string {
  for (const par of query.split("&")) {
    const i = par.indexOf("=");
    if (i > 0 && decodeURIComponent(par.slice(0, i)) === nome) {
      return decodeURIComponent(par.slice(i + 1));
    }
  }
  return "";
}

/**
 * Id do vídeo do YouTube numa URL, ou null. É o que troca o card de prévia pelo
 * player embutido — o Discord toca o vídeo dentro da própria mensagem.
 */
export function youtubeVideoId(url: string): string | null {
  const u = partesDaUrl(url);
  if (!u) return null;
  const valido = (id: string) => (/^[A-Za-z0-9_-]{11}$/.test(id) ? id : null);
  if (u.host === "youtu.be") return valido(u.path.slice(1));
  if (u.host !== "youtube.com" && u.host !== "m.youtube.com" && u.host !== "music.youtube.com") {
    return null;
  }
  if (u.path === "/watch") return valido(paramDaQuery(u.query, "v"));
  const m = u.path.match(/^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})$/);
  return m ? m[1] : null;
}

/** true se a URL aponta direto para uma imagem (vira anexo visual, não card). */
export function isDirectImageUrl(url: string): boolean {
  const u = partesDaUrl(url);
  return !!u && /\.(png|jpe?g|gif|webp|avif)$/i.test(u.path);
}
