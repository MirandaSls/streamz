import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { JwtPayload } from "./jwt.guard";

/**
 * Injeta o usuário autenticado (payload do JWT) no handler.
 * Uso: `metodo(@CurrentUser() user: JwtPayload) { ... }`
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const req = ctx.switchToHttp().getRequest();
    return req.user;
  },
);
