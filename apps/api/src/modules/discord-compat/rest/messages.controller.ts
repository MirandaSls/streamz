import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { BotTokenGuard } from "../bot-token.guard";
import { FiltroDeErrosDoDiscord } from "../erros";
import { RateLimitDoDiscordInterceptor } from "../rate-limit.interceptor";
import type { MensagemDoDiscord } from "../tipos";

/**
 * As mensagens: o que faz o `!ping` responder `pong`.
 *
 * ── Lote A (REST compat) implementa. ──
 *
 * | Método | Rota |
 * |---|---|
 * | GET | `/channels/:id/messages?limit&before&after&around` |
 * | GET | `/channels/:id/messages/:mid` |
 * | POST | `/channels/:id/messages` |
 * | PATCH | `/channels/:id/messages/:mid` |
 * | DELETE | `/channels/:id/messages/:mid` |
 * | PUT/DELETE | `/channels/:id/messages/:mid/reactions/:emoji/@me` |
 *
 * **O `ValidationPipe` global come o corpo, e isto é o risco (b) do §12.** Com
 * `whitelist: true` ele apaga tudo que não está declarado num DTO de
 * `class-validator`, e o discord.js manda `embeds`, `components`, `flags`,
 * `allowed_mentions`, `message_reference`, `tts` e `nonce`. A saída é a das
 * rotas de conta: `@Body()` cru validado por **zod** (`zodBody`, de
 * `common/zod.pipe.ts`). O pipe global deixa passar porque o metatype de um
 * `@Body()` sem classe não é validável — mas **confirme com um teste**, não de
 * cabeça.
 *
 * Escrever é `MessagesService.create(canal, botUserId, content, …)`: a
 * permissão, o modo lento, o castigo, o `emitToChannel("message.new")` e o
 * "escrever é ler" saem todos de graça. A casca **não** reimplementa nada disso.
 * Como o service devolve o DTO (cuid, sem snowflake), releia a linha por
 * `DadosDeCompatService.mensagemPorCuid` para montar a resposta.
 *
 * Reações: só o par mínimo do `@me` entra na F1 (o resto é F5). O emoji vem
 * **percent-encoded** na rota — `decodeURIComponent` antes de usar.
 */
@UseFilters(FiltroDeErrosDoDiscord)
@UseInterceptors(RateLimitDoDiscordInterceptor)
@UseGuards(BotTokenGuard)
@Controller("v10/channels/:id/messages")
export class MessagesCompatController {
  @Get()
  historico(
    @Param("id") _id: string,
    @Query() _query: Record<string, string>,
  ): Promise<MensagemDoDiscord[]> {
    throw new Error("F1 lote A: MessagesCompatController.historico não implementado");
  }

  @Post()
  criar(@Param("id") _id: string, @Body() _corpo: unknown): Promise<MensagemDoDiscord> {
    throw new Error("F1 lote A: MessagesCompatController.criar não implementado");
  }

  @Get(":mid")
  uma(@Param("id") _id: string, @Param("mid") _mid: string): Promise<MensagemDoDiscord> {
    throw new Error("F1 lote A: MessagesCompatController.uma não implementado");
  }

  @Patch(":mid")
  editar(
    @Param("id") _id: string,
    @Param("mid") _mid: string,
    @Body() _corpo: unknown,
  ): Promise<MensagemDoDiscord> {
    throw new Error("F1 lote A: MessagesCompatController.editar não implementado");
  }

  @Delete(":mid")
  @HttpCode(204)
  apagar(@Param("id") _id: string, @Param("mid") _mid: string): Promise<void> {
    throw new Error("F1 lote A: MessagesCompatController.apagar não implementado");
  }

  @Put(":mid/reactions/:emoji/@me")
  @HttpCode(204)
  reagir(
    @Param("id") _id: string,
    @Param("mid") _mid: string,
    @Param("emoji") _emoji: string,
  ): Promise<void> {
    throw new Error("F1 lote A: MessagesCompatController.reagir não implementado");
  }

  @Delete(":mid/reactions/:emoji/@me")
  @HttpCode(204)
  desreagir(
    @Param("id") _id: string,
    @Param("mid") _mid: string,
    @Param("emoji") _emoji: string,
  ): Promise<void> {
    throw new Error("F1 lote A: MessagesCompatController.desreagir não implementado");
  }
}

@Controller("v9/channels/:id/messages")
export class MessagesCompatControllerV9 extends MessagesCompatController {}
