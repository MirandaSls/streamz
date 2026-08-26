import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import {
  contaLoginSchema,
  contaRegistroSchema,
  mfaLoginSchema,
  pedidoPorEmailSchema,
  redefinirSenhaSchema,
  verificarEmailSchema,
} from "@streamz/shared";
import type {
  ContaLoginInput,
  ContaRegistroInput,
  MfaLoginInput,
  PedidoPorEmailInput,
  RedefinirSenhaInput,
  VerificarEmailInput,
} from "@streamz/shared";
import { AuthService } from "./auth.service";
import { RefreshDto } from "./dto";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";
import { zodBody } from "../../common/zod.pipe";
import {
  AUTH_EMAIL_THROTTLE,
  AUTH_LOGIN_THROTTLE,
  AUTH_MFA_THROTTLE,
  AUTH_REGISTER_THROTTLE,
} from "../../common/throttle";

/** O que o Express entrega e de onde saem `userAgent`/`ip` da sessão. */
interface RequisicaoHttp {
  headers?: Record<string, unknown>;
  ip?: string;
  socket?: { remoteAddress?: string };
}

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  @AUTH_REGISTER_THROTTLE
  register(@Body(zodBody(contaRegistroSchema)) dto: ContaRegistroInput, @Req() req: RequisicaoHttp) {
    return this.auth.register(dto, this.auth.contextoDe(req));
  }

  /** Devolve a sessão **ou** o desafio de 2FA (`MfaDesafio`) — ver `LoginResult`. */
  @Post("login")
  @AUTH_LOGIN_THROTTLE
  login(@Body(zodBody(contaLoginSchema)) dto: ContaLoginInput, @Req() req: RequisicaoHttp) {
    return this.auth.login(dto, this.auth.contextoDe(req));
  }

  /** Segundo fator: fecha o login que parou no desafio. */
  @Post("mfa")
  @AUTH_MFA_THROTTLE
  mfa(@Body(zodBody(mfaLoginSchema)) dto: MfaLoginInput, @Req() req: RequisicaoHttp) {
    return this.auth.mfaLogin(dto, this.auth.contextoDe(req));
  }

  @Post("refresh")
  @AUTH_LOGIN_THROTTLE
  refresh(@Body() dto: RefreshDto, @Req() req: RequisicaoHttp) {
    return this.auth.refresh(dto.refreshToken, this.auth.contextoDe(req));
  }

  @Post("logout")
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refreshToken);
  }

  @Post("verify-email")
  @AUTH_MFA_THROTTLE
  verifyEmail(@Body(zodBody(verificarEmailSchema)) dto: VerificarEmailInput) {
    return this.auth.verifyEmail(dto.token);
  }

  /** Sempre 200 (não revela se o e-mail existe ou já foi verificado). */
  @Post("resend-verification")
  @AUTH_EMAIL_THROTTLE
  resendVerification(@Body(zodBody(pedidoPorEmailSchema)) dto: PedidoPorEmailInput) {
    return this.auth.resendVerification(dto.email);
  }

  /** Sempre 200 (não revela se o e-mail existe). */
  @Post("forgot-password")
  @AUTH_EMAIL_THROTTLE
  forgotPassword(@Body(zodBody(pedidoPorEmailSchema)) dto: PedidoPorEmailInput) {
    return this.auth.forgotPassword(dto.email);
  }

  @Post("reset-password")
  @AUTH_MFA_THROTTLE
  resetPassword(@Body(zodBody(redefinirSenhaSchema)) dto: RedefinirSenhaInput) {
    return this.auth.resetPassword(dto.token, dto.password);
  }

  @UseGuards(JwtGuard)
  @Get("me")
  me(@CurrentUser() user: JwtPayload) {
    return { id: user.sub, username: user.username };
  }
}
