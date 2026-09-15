import {
  FLAGS_DE_MENSAGEM,
  FLAGS_GUARDADAS,
  FLAGS_QUE_O_BOT_ENVIA,
  achatarPayloadDeBot,
  conferirMensagemDeBot,
  lerComponentesGuardados,
  lerEmbedsGuardados,
  resolverAnexosDoPayload,
  temFlag,
  type AnexoParaResolver,
  type ComponenteDeMensagem,
  type Embed,
  type ErroDePayloadDeBot,
  type PayloadDeBot,
} from "@streamz/shared";

/**
 * ── onda 3 ── A parte **pura** das mensagens de bot: o que gravar ao criar, o
 * que gravar ao editar e como a linha vira os campos `embeds`/`components`/
 * `flags` do DTO.
 *
 * Mora fora do `MessagesService` pelo mesmo motivo de `efemeras.ts` e
 * `interactions/dto.ts`: as regras cabem num teste sem banco, e o service fica
 * com as idas ao Prisma.
 *
 * O formato é o da API do Discord (`@streamz/shared`, `mensagens-de-bot.ts`).
 * Quem valida a **forma** do corpo é quem o recebe (a casca de compatibilidade
 * e o domínio das interações, com `validarPayloadDeBot`); aqui entram as regras
 * que só o estado final da mensagem decide (`conferirMensagemDeBot`).
 */

/** Uma mensagem de bot a criar, com o corpo já validado e normalizado. */
export interface MensagemDeBotNova {
  content: string;
  embeds: Embed[];
  components: ComponenteDeMensagem[];
  /** as flags como o bot mandou; as que ele não pode pôr são descartadas aqui. */
  flags: number;
  /**
   * `true` no callback 5 (DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE): liga
   * `LOADING`. É do servidor, nunca do bot — um bot que mande `1 << 7` no corpo
   * não liga nada.
   */
  carregando?: boolean;
}

/** As colunas de `MessageBotPayload` (ou de `EphemeralMessage`). */
export interface ColunasDeBot {
  embeds: Embed[];
  components: ComponenteDeMensagem[];
  flags: number;
  flatText: string;
}

/** O que o `MessagesService` grava numa mensagem de bot. */
export interface GravacaoDeBot {
  content: string;
  /** a flag `SUPPRESS_EMBEDS` vai para a coluna que já existia. */
  suppressEmbeds: boolean;
  /** `null` = a mensagem não precisa de linha em `MessageBotPayload`. */
  payload: ColunasDeBot | null;
}

export type ResultadoDaGravacao<T> = { ok: true; gravacao: T } | { ok: false; erros: ErroDePayloadDeBot[] };

/** Criar: aplica a máscara de flags, confere o conjunto e monta as colunas. */
export function gravacaoDaMensagemNova(
  m: MensagemDeBotNova,
  opcoes: { temAnexos: boolean },
): ResultadoDaGravacao<GravacaoDeBot> {
  const doBot = m.flags & FLAGS_QUE_O_BOT_ENVIA;
  const flags = doBot | (m.carregando ? FLAGS_DE_MENSAGEM.LOADING : 0);
  const content = m.content.trim();

  const erros = conferirMensagemDeBot({
    content,
    embeds: m.embeds,
    components: m.components,
    flags,
    // o "pensando…" do callback 5 não tem nada além do texto provisório, e é
    // válido assim — como a mensagem em carregamento do Discord
    temAnexos: opcoes.temAnexos || Boolean(m.carregando),
  });
  if (erros.length > 0) return { ok: false, erros };

  return {
    ok: true,
    gravacao: {
      content,
      suppressEmbeds: temFlag(flags, FLAGS_DE_MENSAGEM.SUPPRESS_EMBEDS),
      payload: colunas(content, m.embeds, m.components, flags & FLAGS_GUARDADAS),
    },
  };
}

/** O que a edição precisa saber da mensagem como ela está. */
export interface MensagemDeBotAtual {
  content: string;
  suppressEmbeds: boolean;
  /** a linha de `MessageBotPayload`, ou null. `Json` cru do Prisma. */
  payload: { embeds: unknown; components: unknown; flags: number } | null;
  temAnexos: boolean;
}

export interface GravacaoDaEdicao extends GravacaoDeBot {
  /**
   * A mensagem estava em `LOADING` (o "pensando…"). A primeira edição dela é
   * a resposta de verdade, e o Discord não a marca como editada.
   */
  eraCarregando: boolean;
}

/**
 * Editar, com a semântica do `PATCH` do Discord:
 *
 * - campo **ausente** não muda; presente, substitui (lista vazia apaga);
 * - `LOADING` sai em qualquer edição, e o texto provisório ("pensando…") sai
 *   junto quando a edição não traz `content`;
 * - `IS_COMPONENTS_V2` pode ser ligada, nunca desligada ("Once a message has
 *   been sent with this flag, it can't be removed");
 * - `SUPPRESS_EMBEDS` segue o `flags` do corpo quando ele vem;
 * - `SUPPRESS_NOTIFICATIONS` é do envio e não muda.
 */
export function gravacaoDaEdicao(
  atual: MensagemDeBotAtual,
  patch: PayloadDeBot,
): ResultadoDaGravacao<GravacaoDaEdicao> {
  const flagsAtuais = atual.payload?.flags ?? 0;
  const eraCarregando = temFlag(flagsAtuais, FLAGS_DE_MENSAGEM.LOADING);

  const content =
    patch.content !== undefined ? patch.content.trim() : eraCarregando ? "" : atual.content;
  const embeds = patch.embeds ?? lerEmbedsGuardados(atual.payload?.embeds);
  const components = patch.components ?? lerComponentesGuardados(atual.payload?.components);

  const doBot = (patch.flags ?? 0) & FLAGS_QUE_O_BOT_ENVIA;
  const v2 =
    temFlag(flagsAtuais, FLAGS_DE_MENSAGEM.IS_COMPONENTS_V2) ||
    temFlag(doBot, FLAGS_DE_MENSAGEM.IS_COMPONENTS_V2);
  const suppressEmbeds =
    patch.flags !== undefined ? temFlag(doBot, FLAGS_DE_MENSAGEM.SUPPRESS_EMBEDS) : atual.suppressEmbeds;
  const guardadas =
    (v2 ? FLAGS_DE_MENSAGEM.IS_COMPONENTS_V2 : 0) |
    (flagsAtuais & FLAGS_DE_MENSAGEM.SUPPRESS_NOTIFICATIONS);

  const erros = conferirMensagemDeBot({
    content,
    embeds,
    components,
    flags: guardadas,
    temAnexos: atual.temAnexos,
  }).filter(
    // editar para "vazio" o Discord recusa com outro código, e o Streamz sempre
    // aceitou (o `editReply({})` de um bot com defeito não pode derrubar a
    // resposta): a regra de mensagem vazia fica só na criação
    (e) => !(e.codigo === "BASE_TYPE_REQUIRED" && e.caminho.join(".") === "content"),
  );
  if (erros.length > 0) return { ok: false, erros };

  return {
    ok: true,
    gravacao: {
      content,
      suppressEmbeds,
      payload: colunas(content, embeds, components, guardadas),
      eraCarregando,
    },
  };
}

function colunas(
  content: string,
  embeds: Embed[],
  components: ComponenteDeMensagem[],
  flags: number,
): ColunasDeBot | null {
  if (embeds.length === 0 && components.length === 0 && flags === 0) return null;
  return {
    embeds,
    components,
    flags,
    // o `content` entra no texto achatado para a busca achar a mensagem pelo
    // que ela diz inteira — o `content` sozinho a busca já procura na `Message`
    flatText: achatarPayloadDeBot({ content, embeds, components }),
  };
}

/** Os três campos do DTO `Message` que a onda 3 acrescentou. */
export interface CamposDeBotDoDTO {
  embeds: Embed[];
  components: ComponenteDeMensagem[];
  flags: number;
}

/**
 * A linha → `embeds`, `components` e `flags` do DTO.
 *
 * As mídias `attachment://<nome>` são trocadas pela URL do anexo **aqui**, na
 * montagem do DTO, porque essa URL é assinada e expira (ver
 * `StorageService.attachmentUrl`). `flags` junta as guardadas com a coluna
 * `suppressEmbeds` e, na efêmera, com `EPHEMERAL`.
 */
export function camposDeBotDoDTO(
  linha: {
    suppressEmbeds: boolean;
    payload: { embeds: unknown; components: unknown; flags: number } | null | undefined;
    efemera?: boolean;
  },
  anexos: readonly AnexoParaResolver[],
  /** snowflake → cuid dos emojis, usuários, cargos e canais citados (ver `snowflakesCitados`). */
  mapas: MapasDeIds = MAPAS_VAZIOS,
): CamposDeBotDoDTO {
  const components = lerComponentesGuardados(linha.payload?.components);
  const resolvido = resolverAnexosDoPayload(
    lerEmbedsGuardados(linha.payload?.embeds),
    mapas === MAPAS_VAZIOS ? components : trocarIdsDoDiscord(components, mapas),
    anexos,
  );
  const flags =
    (linha.payload?.flags ?? 0) |
    (linha.suppressEmbeds ? FLAGS_DE_MENSAGEM.SUPPRESS_EMBEDS : 0) |
    (linha.efemera ? FLAGS_DE_MENSAGEM.EPHEMERAL : 0);
  return { embeds: resolvido.embeds, components: resolvido.components, flags };
}

/**
 * Os erros em uma linha legível — a mensagem do `BadRequestException` que o
 * `MessagesService` lança quando alguém chama sem ter validado antes. A casca
 * de compatibilidade valida antes e responde o `50035` com o detalhe por campo;
 * isto é a rede de segurança.
 */
export function resumoDosErros(erros: readonly ErroDePayloadDeBot[]): string {
  return erros
    .slice(0, 3)
    .map((e) => `${e.caminho.join(".") || "corpo"}: ${e.mensagem}`)
    .join("; ");
}

// ── ids do Discord nos componentes ───────────────────────────

/**
 * Os snowflakes que os componentes de um bot citam e que a web não sabe ler:
 * o `emoji.id` de emoji personalizado (botão, opção de select) e o `id` dos
 * `default_values` dos selects de usuário, cargo, mencionável e canal.
 *
 * O bot manda tudo isso com o **snowflake** (é a identidade que a casca expõe
 * para ele); a web só conhece o **cuid** (`CustomEmoji.id`, `User.id`,
 * `Role.id`, `Channel.id`). O DTO da mensagem troca um pelo outro — o que fica
 * gravado continua sendo o que o bot mandou, e é isso que ele recebe de volta.
 */
export interface SnowflakesCitados {
  emojis: string[];
  usuarios: string[];
  cargos: string[];
  canais: string[];
}

/** snowflake → cuid, por tipo. Ausente no mapa = não existe aqui; o id fica como veio. */
export interface MapasDeIds {
  emojis: ReadonlyMap<string, string>;
  usuarios: ReadonlyMap<string, string>;
  cargos: ReadonlyMap<string, string>;
  canais: ReadonlyMap<string, string>;
}

const SNOWFLAKE = /^\d{1,20}$/;

export function snowflakesCitados(componentsJson: unknown): SnowflakesCitados {
  const conjuntos = {
    emojis: new Set<string>(),
    usuarios: new Set<string>(),
    cargos: new Set<string>(),
    canais: new Set<string>(),
  };
  const visitar = (valor: unknown): void => {
    if (Array.isArray(valor)) {
      valor.forEach(visitar);
      return;
    }
    if (!valor || typeof valor !== "object") return;
    for (const [chave, filho] of Object.entries(valor)) {
      if (chave === "emoji" && filho && typeof filho === "object") {
        const id = (filho as { id?: unknown }).id;
        if (typeof id === "string" && SNOWFLAKE.test(id)) conjuntos.emojis.add(id);
      } else if (chave === "default_values" && Array.isArray(filho)) {
        for (const v of filho as { id?: unknown; type?: unknown }[]) {
          if (typeof v?.id !== "string" || !SNOWFLAKE.test(v.id)) continue;
          if (v.type === "user") conjuntos.usuarios.add(v.id);
          if (v.type === "role") conjuntos.cargos.add(v.id);
          if (v.type === "channel") conjuntos.canais.add(v.id);
        }
      } else {
        visitar(filho);
      }
    }
  };
  visitar(componentsJson);
  return {
    emojis: [...conjuntos.emojis],
    usuarios: [...conjuntos.usuarios],
    cargos: [...conjuntos.cargos],
    canais: [...conjuntos.canais],
  };
}

/** Nenhum snowflake citado — o caso de quase toda mensagem: sem consulta. */
export function nenhumCitado(c: SnowflakesCitados): boolean {
  return c.emojis.length + c.usuarios.length + c.cargos.length + c.canais.length === 0;
}

export const MAPAS_VAZIOS: MapasDeIds = {
  emojis: new Map(),
  usuarios: new Map(),
  cargos: new Map(),
  canais: new Map(),
};

/** Troca os snowflakes citados pelos cuids. Devolve cópia; não muta. */
export function trocarIdsDoDiscord<T>(valor: T, mapas: MapasDeIds): T {
  if (Array.isArray(valor)) return valor.map((v) => trocarIdsDoDiscord(v, mapas)) as unknown as T;
  if (!valor || typeof valor !== "object") return valor;
  const saida: Record<string, unknown> = {};
  for (const [chave, filho] of Object.entries(valor)) {
    if (chave === "emoji" && filho && typeof filho === "object") {
      const id = (filho as { id?: unknown }).id;
      const cuid = typeof id === "string" ? mapas.emojis.get(id) : undefined;
      saida[chave] = cuid ? { ...(filho as Record<string, unknown>), id: cuid } : filho;
    } else if (chave === "default_values" && Array.isArray(filho)) {
      saida[chave] = (filho as { id?: unknown; type?: unknown }[]).map((v) => {
        if (typeof v?.id !== "string") return v;
        const mapa = v.type === "user" ? mapas.usuarios : v.type === "role" ? mapas.cargos : v.type === "channel" ? mapas.canais : undefined;
        const cuid = mapa?.get(v.id);
        return cuid ? { ...v, id: cuid } : v;
      });
    } else {
      saida[chave] = trocarIdsDoDiscord(filho, mapas);
    }
  }
  return saida as T;
}
