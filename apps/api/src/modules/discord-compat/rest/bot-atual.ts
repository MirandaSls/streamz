import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { BotAutenticado } from "../tipos";

/**
 * Injeta o bot autenticado (o que o `BotTokenGuard` pôs em `req.bot`).
 * Uso: `metodo(@BotAtual() bot: BotAutenticado) { … }`
 *
 * Gêmeo do `@CurrentUser()` do REST interno, e pelo mesmo motivo: quem chama não
 * precisa saber que a coisa mora no `Request`.
 */
export const BotAtual = createParamDecorator(
  (_dado: unknown, ctx: ExecutionContext): BotAutenticado => {
    return ctx.switchToHttp().getRequest().bot;
  },
);
