import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import {
  AFK_TIMEOUTS_SECONDS,
  GUILD_DEFAULT_NOTIFICATIONS,
  MAX_GUILD_DESCRIPTION,
  MAX_WELCOME_CHANNELS,
  MAX_WELCOME_DESCRIPTION,
  minhaAssociacaoEditarSchema,
} from "@streamz/shared";
import type {
  AfkTimeoutSeconds,
  GuildDefaultNotifications,
  MinhaAssociacaoEditarInput,
} from "@streamz/shared";
import { OnboardingService } from "./onboarding.service";
import { CurrentUser } from "../../common/current-user.decorator";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { zodBody } from "../../common/zod.pipe";

class OnboardingDto {
  @IsOptional()
  @IsString()
  systemChannelId?: string | null;

  @IsOptional()
  @IsString()
  rulesChannelId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_WELCOME_DESCRIPTION)
  welcomeDescription?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_WELCOME_CHANNELS)
  @IsString({ each: true })
  welcomeChannelIds?: string[];

  @IsOptional()
  @IsBoolean()
  discoverable?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_GUILD_DESCRIPTION)
  description?: string | null;

  // ── Engajamento: os limites (lista de AFK, dois níveis de notificação) são
  // os do contrato; que o canal AFK seja de voz deste servidor, o service confere
  @IsOptional()
  @IsBoolean()
  systemWelcomeMessage?: boolean;

  @IsOptional()
  @IsBoolean()
  systemWelcomeSticker?: boolean;

  @IsOptional()
  @IsBoolean()
  systemBoostMessage?: boolean;

  @IsOptional()
  @IsBoolean()
  systemTips?: boolean;

  @IsOptional()
  @IsBoolean()
  activityFeed?: boolean;

  @IsOptional()
  @IsIn(GUILD_DEFAULT_NOTIFICATIONS)
  defaultNotifications?: GuildDefaultNotifications;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  afkChannelId?: string | null;

  @IsOptional()
  @IsInt()
  @IsIn(AFK_TIMEOUTS_SECONDS)
  afkTimeoutSeconds?: AfkTimeoutSeconds;

  @IsOptional()
  @IsBoolean()
  widgetEnabled?: boolean;
}

@UseGuards(JwtGuard)
@Controller("guilds/:guildId")
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  /** O que vale para mim neste servidor: regras, castigo, boas-vindas. */
  @Get("membership")
  membership(@CurrentUser() user: JwtPayload, @Param("guildId") guildId: string) {
    return this.onboarding.membership(user.sub, guildId);
  }

  /**
   * Menus de contexto (§5/§6): meu apelido neste servidor e "Permitir
   * mensagens diretas de membros do servidor". Só o próprio membro edita, e
   * qualquer membro pode — o bitfield do Streamz não tem `CHANGE_NICKNAME`.
   */
  @Patch("membership")
  editMembership(
    @CurrentUser() user: JwtPayload,
    @Param("guildId") guildId: string,
    @Body(zodBody(minhaAssociacaoEditarSchema)) dto: MinhaAssociacaoEditarInput,
  ) {
    return this.onboarding.editMembership(user.sub, guildId, dto);
  }

  @Get("onboarding")
  get(@CurrentUser() user: JwtPayload, @Param("guildId") guildId: string) {
    return this.onboarding.get(user.sub, guildId);
  }

  @Patch("onboarding")
  update(
    @CurrentUser() user: JwtPayload,
    @Param("guildId") guildId: string,
    @Body() dto: OnboardingDto,
  ) {
    // `null` é intencional (desligar o canal de sistema/regras); só o campo
    // ausente significa "não mexi nisso" — por isso o DTO é todo opcional
    return this.onboarding.update(user.sub, guildId, dto);
  }

  @Post("rules/accept")
  acceptRules(@CurrentUser() user: JwtPayload, @Param("guildId") guildId: string) {
    return this.onboarding.acceptRules(user.sub, guildId);
  }

  @Post("welcome/seen")
  welcomeSeen(@CurrentUser() user: JwtPayload, @Param("guildId") guildId: string) {
    return this.onboarding.markWelcomeSeen(user.sub, guildId);
  }
}
