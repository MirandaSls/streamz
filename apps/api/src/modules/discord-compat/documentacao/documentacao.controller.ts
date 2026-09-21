import { Controller, Get, Header } from "@nestjs/common";
import { OPENAPI_COMPAT } from "./openapi";

/**
 * `GET /api/v10/openapi.json` (e o alias `/api/v9/openapi.json`).
 *
 * A especificação OpenAPI 3.1 da API de bots, servida como documento público.
 *
 * **Sem `BotTokenGuard`, e de propósito:** quem lê isto é a página de
 * documentação do site e quem está decidindo se escreve um bot — ninguém tem
 * token ainda. Exigir credencial para ler a documentação é o contrário do que
 * ela existe para fazer. Não há nada de sensível no documento: ele descreve as
 * rotas, não os dados de ninguém.
 *
 * Pelo mesmo motivo, **também sem** o `RateLimitDoDiscordInterceptor`: aquele
 * conta por aplicativo (`req.bot`), e aqui não há aplicativo nenhum. O teto
 * global por IP do `@nestjs/throttler` continua valendo, que é o certo para uma
 * rota que o navegador chama.
 *
 * E sem o `FiltroDeErrosDoDiscord`: quem consome esta rota é uma página web, e
 * o formato de erro do Discord (`{code, message}`) só faria sentido para a
 * biblioteca de um bot.
 *
 * O JSON é serializado **uma vez**, na subida do módulo: o documento é imutável
 * e re-serializá-lo a cada requisição seria trabalho puro. É também por isso
 * que o handler devolve `string` e declara o `Content-Type` à mão — devolver o
 * objeto faria o Nest serializar tudo de novo.
 *
 * O `charset=utf-8` aqui é o oposto do cuidado de `content-type.ts` (onde ele
 * precisa **não** existir, porque o discord.py compara o cabeçalho por
 * igualdade exata): ali quem lê é uma biblioteca de bot; aqui é um navegador,
 * e o documento é cheio de acento.
 */
@Controller("v10")
export class DocumentacaoCompatController {
  /**
   * O documento, já em texto.
   *
   * Estático da classe e não do módulo só para ficar ao lado de quem o usa; o
   * efeito é o mesmo (uma serialização por processo).
   */
  private static readonly documento = JSON.stringify(OPENAPI_COMPAT);

  @Get("openapi.json")
  // Cinco minutos: a especificação muda com o deploy, não durante ele. Tempo
  // suficiente para a página não repetir a leitura a cada navegação, e curto o
  // bastante para uma versão nova aparecer sozinha logo depois de subir.
  @Header("Cache-Control", "public, max-age=300")
  @Header("Content-Type", "application/json; charset=utf-8")
  especificacao(): string {
    return DocumentacaoCompatController.documento;
  }
}

/**
 * Alias v9, como em todo controller desta casca: as duas versões servem
 * exatamente as mesmas rotas, então herdar é tudo o que há a fazer.
 */
@Controller("v9")
export class DocumentacaoCompatControllerV9 extends DocumentacaoCompatController {}
