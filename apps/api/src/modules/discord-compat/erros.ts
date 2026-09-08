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
  INTERACAO_DESCONHECIDA: 10062,
  INTERACAO_JA_RESPONDIDA: 40060,
  SEM_ACESSO: 50001,
  NAO_AUTENTICADO: 50014,
  SEM_PERMISSAO: 50013,
  CORPO_INVALIDO: 50035,
  NAO_IMPLEMENTADO: 20012,
} as const;

/** Detalhe por campo do 50035, no formato do Discord. */
export type ErrosPorCampo = Record<string, { _errors: { code: string; message: string }[] }>;

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

export const semAcesso = () =>
  new ErroDoDiscord(HttpStatus.FORBIDDEN, CODIGO.SEM_ACESSO, "Missing Access");

export const semPermissao = () =>
  new ErroDoDiscord(HttpStatus.FORBIDDEN, CODIGO.SEM_PERMISSAO, "Missing Permissions");

export const corpoInvalido = (errors?: ErrosPorCampo) =>
  new ErroDoDiscord(HttpStatus.BAD_REQUEST, CODIGO.CORPO_INVALIDO, "Invalid Form Body", errors);

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
