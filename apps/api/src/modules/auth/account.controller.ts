import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import {
  alterarEmailSchema,
  alterarSenhaSchema,
  excluirContaSchema,
  mfaAtivarSchema,
  mfaDesativarSchema,
} from "@newdisc/shared";
import type {
  AlterarEmailInput,
  AlterarSenhaInput,
  ExcluirContaInput,
  MfaAtivarInput,
  MfaDesativarInput,
} from "@newdisc/shared";
import { z } from "zod";
import { AccountService } from "./account.service";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";
import { zodBody } from "../../common/zod.pipe";
import { ACCOUNT_THROTTLE, AUTH_EMAIL_THROTTLE, AUTH_MFA_THROTTLE } from "../../common/throttle";

/** Regerar códigos de recuperação só pede a senha (o 2FA já está ligado). */
const regerarCodigosSchema = z.object({
  password: z.string({ required_error: "obrigatório" }).min(1, "Informe sua senha"),
});

/**
 * `/me` — a conta de quem está autenticado.
 *
 * Prefixo próprio (e não `users/me`) porque é o caminho que a tela de
 * configurações já chama: `GET/DELETE /me/sessions`. `users/me` continua sendo
 * o **perfil público** (nome de exibição, avatar, status); aqui mora o que só o
 * dono vê e faz.
 */
@UseGuards(JwtGuard)
@Controller("me")
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get("account")
  minhaConta(@CurrentUser() user: JwtPayload) {
    return this.account.minhaConta(user.sub);
  }

  // ── sessões ────────────────────────────────────────────────

  @Get("sessions")
  sessoes(@CurrentUser() user: JwtPayload) {
    return this.account.listarSessoes(user.sub, user.sid ?? null);
  }

  /** Encerra todas menos a atual. Vem antes da rota com `:id` de propósito. */
  @Delete("sessions")
  @ACCOUNT_THROTTLE
  encerrarOutras(@CurrentUser() user: JwtPayload) {
    return this.account.encerrarOutrasSessoes(user.sub, user.sid ?? null);
  }

  @Delete("sessions/:id")
  @ACCOUNT_THROTTLE
  encerrarSessao(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.account.encerrarSessao(user.sub, id);
  }

  // ── senha e e-mail ─────────────────────────────────────────

  @Patch("password")
  @ACCOUNT_THROTTLE
  alterarSenha(
    @CurrentUser() user: JwtPayload,
    @Body(zodBody(alterarSenhaSchema)) dto: AlterarSenhaInput,
  ) {
    return this.account.alterarSenha(
      user.sub,
      dto.currentPassword,
      dto.newPassword,
      user.sid ?? null,
    );
  }

  @Patch("email")
  @AUTH_EMAIL_THROTTLE
  alterarEmail(
    @CurrentUser() user: JwtPayload,
    @Body(zodBody(alterarEmailSchema)) dto: AlterarEmailInput,
  ) {
    return this.account.alterarEmail(user.sub, dto.email, dto.password);
  }

  @Post("email/resend")
  @AUTH_EMAIL_THROTTLE
  reenviarVerificacao(@CurrentUser() user: JwtPayload) {
    return this.account.reenviarVerificacao(user.sub);
  }

  // ── 2FA ────────────────────────────────────────────────────

  @Post("mfa/setup")
  @ACCOUNT_THROTTLE
  mfaSetup(@CurrentUser() user: JwtPayload) {
    return this.account.mfaSetup(user.sub);
  }

  @Post("mfa/enable")
  @AUTH_MFA_THROTTLE
  mfaEnable(@CurrentUser() user: JwtPayload, @Body(zodBody(mfaAtivarSchema)) dto: MfaAtivarInput) {
    return this.account.mfaEnable(user.sub, dto.code);
  }

  @Post("mfa/disable")
  @AUTH_MFA_THROTTLE
  mfaDisable(
    @CurrentUser() user: JwtPayload,
    @Body(zodBody(mfaDesativarSchema)) dto: MfaDesativarInput,
  ) {
    return this.account.mfaDisable(user.sub, dto.password, dto.code);
  }

  @Post("mfa/recovery-codes")
  @ACCOUNT_THROTTLE
  mfaRegerarCodigos(
    @CurrentUser() user: JwtPayload,
    @Body(zodBody(regerarCodigosSchema)) dto: { password: string },
  ) {
    return this.account.mfaRegerarCodigos(user.sub, dto.password);
  }

  // ── fim de vida da conta ───────────────────────────────────

  @Post("disable")
  @ACCOUNT_THROTTLE
  @HttpCode(200)
  desativar(
    @CurrentUser() user: JwtPayload,
    @Body(zodBody(regerarCodigosSchema)) dto: { password: string },
  ) {
    return this.account.desativar(user.sub, dto.password);
  }

  @Delete()
  @ACCOUNT_THROTTLE
  excluir(
    @CurrentUser() user: JwtPayload,
    @Body(zodBody(excluirContaSchema)) dto: ExcluirContaInput,
  ) {
    return this.account.excluir(user.sub, dto.password, dto.code);
  }
}
