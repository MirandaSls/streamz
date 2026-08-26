import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from "class-validator";
import { MAX_ROLE_NAME } from "@streamz/shared";
import { RolesService } from "./roles.service";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";

class RoleDto {
  @IsOptional()
  @IsString()
  @Length(1, MAX_ROLE_NAME)
  name?: string;

  // null/"" limpa a cor; qualquer outro valor é validado como #rrggbb no service
  @IsOptional()
  @IsString()
  @Length(0, 7)
  color?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  permissions?: number;

  @IsOptional()
  @IsBoolean()
  hoist?: boolean;

  @IsOptional()
  @IsBoolean()
  mentionable?: boolean;
}

class ReorderDto {
  /** ids do mais baixo para o mais alto, sem o @everyone. */
  @IsArray()
  @IsString({ each: true })
  @ArrayNotEmpty()
  roleIds!: string[];
}

class OverrideDto {
  @IsOptional()
  @IsString()
  roleId?: string | null;

  @IsOptional()
  @IsString()
  userId?: string | null;

  @IsInt()
  @Min(0)
  allow!: number;

  @IsInt()
  @Min(0)
  deny!: number;
}

/**
 * Cargos, atribuições e regras por canal.
 *
 * Divide o prefixo `guilds` com o `GuildsController` de propósito: do ponto de
 * vista do cliente, cargo é sub-recurso do servidor. `roles/order` é declarado
 * **antes** de `roles/:roleId` — o Nest casa na ordem de declaração.
 */
@UseGuards(JwtGuard)
@Controller("guilds")
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get(":id/roles")
  list(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.roles.list(user.sub, id);
  }

  @Post(":id/roles")
  create(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: RoleDto,
  ) {
    return this.roles.create(user.sub, id, dto);
  }

  @Patch(":id/roles/order")
  reorder(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: ReorderDto,
  ) {
    return this.roles.reorder(user.sub, id, dto.roleIds);
  }

  @Patch(":id/roles/:roleId")
  update(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Param("roleId") roleId: string,
    @Body() dto: RoleDto,
  ) {
    return this.roles.update(user.sub, id, roleId, dto);
  }

  @Delete(":id/roles/:roleId")
  remove(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Param("roleId") roleId: string,
  ) {
    return this.roles.remove(user.sub, id, roleId);
  }

  // ── cargos de um membro ──
  @Put(":id/members/:userId/roles/:roleId")
  assign(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Param("userId") userId: string,
    @Param("roleId") roleId: string,
  ) {
    return this.roles.assign(user.sub, id, userId, roleId);
  }

  @Delete(":id/members/:userId/roles/:roleId")
  unassign(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Param("userId") userId: string,
    @Param("roleId") roleId: string,
  ) {
    return this.roles.unassign(user.sub, id, userId, roleId);
  }

  @Get(":id/members/:userId/permissions")
  permissions(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Param("userId") userId: string,
  ) {
    return this.roles.memberPermissions(user.sub, id, userId);
  }

  // ── regras por canal ──
  /** Todas as regras dos canais visíveis — o cliente carrega isto uma vez. */
  @Get(":id/overrides")
  guildOverrides(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.roles.listGuildOverrides(user.sub, id);
  }

  @Get(":id/channels/:channelId/overrides")
  overrides(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Param("channelId") channelId: string,
  ) {
    return this.roles.listOverrides(user.sub, id, channelId);
  }

  @Put(":id/channels/:channelId/overrides")
  setOverride(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Param("channelId") channelId: string,
    @Body() dto: OverrideDto,
  ) {
    return this.roles.setOverride(user.sub, id, channelId, dto);
  }

  @Delete(":id/channels/:channelId/overrides/:targetId")
  removeOverride(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Param("channelId") channelId: string,
    @Param("targetId") targetId: string,
  ) {
    return this.roles.removeOverride(user.sub, id, channelId, targetId);
  }
}
