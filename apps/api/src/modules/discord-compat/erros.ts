import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { aplicarContentTypeDoDiscord } from "./content-type";

/**
 * O mínimo do `Response` do Express que o filtro usa.
 *
 * Estrutural, e não `import type { Response } from "express"`, porque o
 * `@types/express` não é dependência da API (o Nest traz o runtime, não os
 * tipos) — e acrescentá-lo só para uma anotação seria mudança fora do escopo.
 */
interface RespostaHttp {
  status(codigo: number): RespostaHttp;
  json(corpo: unknown): void;
  setHeader(nome: string, valor: string): unknown;
}

/**
 * Erros no formato do Discord.
 *
 * As libs **classificam pelo `code`**, não pelo texto: o `DiscordAPIError` do
 * `@discordjs/rest` guarda `code` e o bot decide o que fazer com ele
 * (`10008` = mensagem sumiu, não é bug; `50013` = falta permissão, avisa o
 * humano). Um corpo `{ "statusCode": 404, "message": "..." }` — o padrão do
 * Nest — chega na lib como `code: 0` e vira "erro desconhecido".
 *
 * ```json
 * { "code": 50013, "message": "Missing Permissions" }
 * ```
 *
 * Ver `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` §5, "Erros".
 */

/** Os códigos que a F1 usa. A lista completa do Discord tem centenas. */
export const CODIGO = {
  GERAL: 0,
  CANAL_DESCONHECIDO: 10003,
  SERVIDOR_DESCONHECIDO: 10004,
  MENSAGEM_DESCONHECIDA: 10008,
  USUARIO_DESCONHECIDO: 10013,
  MEMBRO_DESCONHECIDO: 10007,
  CARGO_DESCONHECIDO: 10011,
  /** ── F5 ── `Unknown Emoji`: o emoji personalizado da rota não existe aqui. */
  EMOJI_DESCONHECIDO: 10014,
  /**
   * ── F5 membros ── `Unknown Ban`: `DELETE /guilds/:id/bans/:uid` de alguém
   * que não está banido. O `GuildsService.unban` é idempotente e engole o caso;
   * o Discord devolve 404 com este código, e o `guild.bans.remove()` do
   * discord.js o classifica para dizer "esse já não estava banido".
   */
  BANIMENTO_DESCONHECIDO: 10026,
  INTERACAO_DESCONHECIDA: 10062,
  /**
   * `Unknown application command` — o comando de barra que o bot pediu não
   * existe naquele escopo. Entrou na integração da F3: sem ele o 404 saía com
   * `code: 0`, e é justamente o código que a lib do bot usa para distinguir
   * "esse comando eu apaguei" de "deu ruim no servidor".
   */
  COMANDO_DESCONHECIDO: 10063,
  INTERACAO_JA_RESPONDIDA: 40060,
  SEM_ACESSO: 50001,
  /**
   * ── F5 membros ── `Invalid Role`: o cargo existe, mas não é atribuível à
   * mão. Aqui isso quer dizer o `@everyone` (`isDefault`) — que no Discord é
   * implícito e não entra na lista de cargos de ninguém — e o cargo `managed`
   * (o de uma integração), que o Streamz ainda não modela.
   */
  CARGO_INVALIDO: 50028,
  NAO_AUTENTICADO: 50014,
  SEM_PERMISSAO: 50013,
  CORPO_INVALIDO: 50035,
  /**
   * ── F5 membros ── `You can only bulk delete messages that are under 14 days
   * old`. É a regra do `bulkDelete` do Discord, e o discord.js a espera: o
   * `TextChannel#bulkDelete` com `filterOld: true` existe justamente para
   * contorná-la.
   */
  MENSAGEM_ANTIGA_DEMAIS: 50034,
  NAO_IMPLEMENTADO: 20012,
  /**
   * ── rodada de correção ── `The request body contains invalid JSON.` O
   * `payload_json` de um multipart que não é um objeto JSON (ver
   * `PayloadJsonPipe`, `rest/corpos.ts`).
   */
  JSON_INVALIDO: 50109,
} as const;

/** Um erro de um campo: `{ "code": "BASE_TYPE_MAX_LENGTH", "message": "…" }`. */
export interface ErroDeCampo {
  code: string;
  message: string;
}

/**
 * Detalhe por campo do 50035, no formato do Discord — **recursivo**.
 *
 * O `errors` real acompanha o caminho do campo, um nível por segmento, e os
 * índices de lista viram chave de texto:
 *
 * ```json
 * { "embeds": { "0": { "title": { "_errors": [{ "code": "BASE_TYPE_MAX_LENGTH", "message": "…" }] } } } }
 * ```
 *
 * O `DiscordAPIError` do `@discordjs/rest` percorre esse objeto até achar os
 * `_errors` para montar "embeds[0].title: …". A forma antiga (`Record` de um
 * nível só) mentia para o compilador e obrigava um `as unknown as` em quem
 * montava o aninhamento.
 *
 * Por que interface com o índice largo, e não o
 * `{ _errors?: ErroDeCampo[] } & { [campo: string]: ErrosPorCampo }` óbvio: na
 * interseção, o próprio `_errors` também precisa caber no índice (`ErrosPorCampo`),
 * e uma lista não cabe — nenhum literal com `_errors` compilaria. O índice
 * aceitando `ErroDeCampo[]` é o que deixa a chave especial conviver com as
 * chaves de campo.
 */
export interface ErrosPorCampo {
  _errors?: ErroDeCampo[];
  [campo: string]: ErrosPorCampo | ErroDeCampo[] | undefined;
}

/**
 * Exceção que o Nest serializa exatamente como o Discord serializa.
 *
 * O corpo é montado aqui (e não num filtro) porque `HttpException` com um
 * objeto já sai como está — não há transformação a fazer.
 */
export class ErroDoDiscord extends HttpException {
  constructor(status: number, code: number, message: string, errors?: ErrosPorCampo) {
    super(errors ? { code, message, errors } : { code, message }, status);
  }
}

export const canalDesconhecido = () =>
  new ErroDoDiscord(HttpStatus.NOT_FOUND, CODIGO.CANAL_DESCONHECIDO, "Unknown Channel");

export const servidorDesconhecido = () =>
  new ErroDoDiscord(HttpStatus.NOT_FOUND, CODIGO.SERVIDOR_DESCONHECIDO, "Unknown Guild");

export const mensagemDesconhecida = () =>
  new ErroDoDiscord(HttpStatus.NOT_FOUND, CODIGO.MENSAGEM_DESCONHECIDA, "Unknown Message");

export const usuarioDesconhecido = () =>
  new ErroDoDiscord(HttpStatus.NOT_FOUND, CODIGO.USUARIO_DESCONHECIDO, "Unknown User");

export const membroDesconhecido = () =>
  new ErroDoDiscord(HttpStatus.NOT_FOUND, CODIGO.MEMBRO_DESCONHECIDO, "Unknown Member");

/**
 * ── F5 ── 404 `10014`: `PUT .../reactions/nome:123/@me` com um id de emoji
 * que não é de nenhum emoji deste Streamz.
 *
 * É o código que o discord.js classifica para dizer ao dono do bot "esse
 * emoji não existe (mais)" em vez de "deu ruim no servidor" — e o caso mais
 * comum é copiar o id de um emoji do Discord para um bot que roda aqui.
 */
export const emojiDesconhecido = () =>
  new ErroDoDiscord(HttpStatus.NOT_FOUND, CODIGO.EMOJI_DESCONHECIDO, "Unknown Emoji");

/**
 * ── F5 membros ── 404 `10026`: desbanir quem não está banido.
 */
export const banimentoDesconhecido = () =>
  new ErroDoDiscord(HttpStatus.NOT_FOUND, CODIGO.BANIMENTO_DESCONHECIDO, "Unknown Ban");

/** ── F5 membros ── 404 `10011`: o `:roleId` da rota não é cargo deste servidor. */
export const cargoDesconhecido = () =>
  new ErroDoDiscord(HttpStatus.NOT_FOUND, CODIGO.CARGO_DESCONHECIDO, "Unknown Role");

/**
 * ── F5 membros ── 400 `50028`: cargo que não se atribui à mão.
 *
 * O `@everyone` e o cargo de integração (`managed`). O texto é o do Discord.
 */
export const cargoInvalido = () =>
  new ErroDoDiscord(HttpStatus.BAD_REQUEST, CODIGO.CARGO_INVALIDO, "Invalid Role");

/** ── F5 membros ── 400 `50034`: mensagem com mais de 14 dias no bulk delete. */
export const mensagemAntigaDemais = () =>
  new ErroDoDiscord(
    HttpStatus.BAD_REQUEST,
    CODIGO.MENSAGEM_ANTIGA_DEMAIS,
    "You can only bulk delete messages that are under 14 days old.",
  );

export const semAcesso = () =>
  new ErroDoDiscord(HttpStatus.FORBIDDEN, CODIGO.SEM_ACESSO, "Missing Access");

export const semPermissao = () =>
  new ErroDoDiscord(HttpStatus.FORBIDDEN, CODIGO.SEM_PERMISSAO, "Missing Permissions");

export const corpoInvalido = (errors?: ErrosPorCampo) =>
  new ErroDoDiscord(HttpStatus.BAD_REQUEST, CODIGO.CORPO_INVALIDO, "Invalid Form Body", errors);

/** ── rodada de correção ── 400 `50109`: `payload_json` que não é JSON de objeto. */
export const jsonInvalido = () =>
  new ErroDoDiscord(
    HttpStatus.BAD_REQUEST,
    CODIGO.JSON_INVALIDO,
    "The request body contains invalid JSON.",
  );

/**
 * ── F3 ── 404 `10062`: o token do caminho não achou interação nenhuma.
 *
 * É a resposta de **três** casos, e de propósito: token que não existe, token
 * vencido (> 15 min) e token cujo `:id`/`:app` do caminho não bate com a linha.
 * O terceiro poderia ser 403, e não é: para quem não tem o token, a interação
 * não existe — dizer "existe, mas não é sua" já seria contar demais.
 *
 * O texto é o do Discord, letra por letra: o `interactionCreate` de muito bot
 * loga `error.message` cru, e "Unknown interaction" é o que o dono do bot vai
 * procurar no Google.
 */
export const interacaoDesconhecida = () =>
  new ErroDoDiscord(HttpStatus.NOT_FOUND, CODIGO.INTERACAO_DESCONHECIDA, "Unknown interaction");

/**
 * ── F3 ── 400 `40060`: já houve um callback nesta interação.
 *
 * O discord.js classifica este código e transforma num
 * `InteractionAlreadyReplied`; um bot que chama `reply()` depois de
 * `deferReply()` tem um defeito, e é este erro que o diz.
 */
export const interacaoJaRespondida = () =>
  new ErroDoDiscord(
    HttpStatus.BAD_REQUEST,
    CODIGO.INTERACAO_JA_RESPONDIDA,
    "Interaction has already been acknowledged.",
  );

/**
 * O 401 do Discord, letra por letra.
 *
 * O texto é `"401: Unauthorized"` mesmo — é o que o Discord devolve, e o
 * `TokenInvalid` do discord.js nasce deste status (nunca do formato do token).
 */
export const naoAutenticado = () =>
  new ErroDoDiscord(HttpStatus.UNAUTHORIZED, CODIGO.GERAL, "401: Unauthorized");

/** O que ainda não existe (F2/F3/F5). Melhor 501 explícito que 404 confuso. */
export const naoImplementado = (o_que: string) =>
  new ErroDoDiscord(HttpStatus.NOT_IMPLEMENTED, CODIGO.NAO_IMPLEMENTADO, `Not implemented: ${o_que}`);

/**
 * Traduz o que os services **internos** lançam para o formato do Discord.
 *
 * É indispensável: a casca chama `MessagesService.create`, `GuildsService.
 * assertCanViewChannel` e afins, e esses lançam `ForbiddenException` /
 * `NotFoundException` do Nest, cujo corpo padrão a lib do bot não entende.
 * Aplicado **só** nos controllers de `/api/v10` e `/api/v9` (`@UseFilters`),
 * nunca globalmente — o REST interno e a web continuam com o formato deles.
 */
@Catch()
export class FiltroDeErrosDoDiscord implements ExceptionFilter {
  catch(excecao: unknown, host: ArgumentsHost) {
    const resposta = host.switchToHttp().getResponse<RespostaHttp>();
    // Também aqui, e não só no interceptor: o guard corre **antes** do
    // interceptor, então a recusa de token (o 401) nunca passaria por lá — e é
    // justamente a primeira resposta que um bot recebe. Ver `content-type.ts`.
    aplicarContentTypeDoDiscord(resposta);
    const { status, corpo } = traduzirExcecao(excecao);
    resposta.status(status).json(corpo);
  }
}

/** Exceção → `{ status, corpo }` no formato do Discord. Puro, para testar. */
export function traduzirExcecao(excecao: unknown): {
  status: number;
  corpo: { code: number; message: string; errors?: ErrosPorCampo };
} {
  if (excecao instanceof ErroDoDiscord) {
    return {
      status: excecao.getStatus(),
      corpo: excecao.getResponse() as { code: number; message: string; errors?: ErrosPorCampo },
    };
  }

  if (excecao instanceof UnauthorizedException) {
    return { status: HttpStatus.UNAUTHORIZED, corpo: { code: CODIGO.GERAL, message: "401: Unauthorized" } };
  }
  if (excecao instanceof ForbiddenException) {
    return { status: HttpStatus.FORBIDDEN, corpo: { code: CODIGO.SEM_PERMISSAO, message: "Missing Permissions" } };
  }
  if (excecao instanceof NotFoundException) {
    return { status: HttpStatus.NOT_FOUND, corpo: { code: CODIGO.CANAL_DESCONHECIDO, message: "Unknown Channel" } };
  }
  if (excecao instanceof HttpException) {
    const status = excecao.getStatus();
    return {
      status,
      corpo: {
        code: status === HttpStatus.BAD_REQUEST ? CODIGO.CORPO_INVALIDO : CODIGO.GERAL,
        message: status === HttpStatus.BAD_REQUEST ? "Invalid Form Body" : excecao.message,
      },
    };
  }

  // Nada de vazar stack para o bot: o log estruturado já registrou o original.
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    corpo: { code: CODIGO.GERAL, message: "500: Internal Server Error" },
  };
}
