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
import { IsInt, IsOptional, IsString, Length, Min } from "class-validator";
import { MAX_CATEGORY_NAME } from "@streamz/shared";
import { CategoriesService } from "./categories.service";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";

class CategoryDto {
  @IsString()
  @Length(1, MAX_CATEGORY_NAME)
  name!: string;
}

/** Gêmeo do `OverrideDto` do RolesController — a forma é a mesma. */
class CategoryOverrideDto {
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

@UseGuards(JwtGuard)
@Controller("guilds/:guildId/categories")
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload, @Param("guildId") guildId: string) {
    return this.categories.list(user.sub, guildId);
  }

  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Param("guildId") guildId: string,
    @Body() dto: CategoryDto,
  ) {
    return this.categories.create(user.sub, guildId, dto.name);
  }

  /**
   * Todas as regras de categoria do servidor — o cliente carrega isto uma vez.
   * Declarada **antes** de `:categoryId`: o Nest casa na ordem de declaração, e
   * `GET /categories/overrides` cairia em `GET /:categoryId` se viesse depois.
   */
  @Get("overrides")
  guildOverrides(@CurrentUser() user: JwtPayload, @Param("guildId") guildId: string) {
    return this.categories.listGuildOverrides(user.sub, guildId);
  }

  @Get(":categoryId/overrides")
  overrides(
    @CurrentUser() user: JwtPayload,
    @Param("guildId") guildId: string,
    @Param("categoryId") categoryId: string,
  ) {
    return this.categories.listOverrides(user.sub, guildId, categoryId);
  }

  @Put(":categoryId/overrides")
  setOverride(
    @CurrentUser() user: JwtPayload,
    @Param("guildId") guildId: string,
    @Param("categoryId") categoryId: string,
    @Body() dto: CategoryOverrideDto,
  ) {
    return this.categories.setOverride(user.sub, guildId, categoryId, dto);
  }

  @Delete(":categoryId/overrides/:targetId")
  removeOverride(
    @CurrentUser() user: JwtPayload,
    @Param("guildId") guildId: string,
    @Param("categoryId") categoryId: string,
    @Param("targetId") targetId: string,
  ) {
    return this.categories.removeOverride(user.sub, guildId, categoryId, targetId);
  }

  @Patch(":categoryId")
  update(
    @CurrentUser() user: JwtPayload,
    @Param("guildId") guildId: string,
    @Param("categoryId") categoryId: string,
    @Body() dto: CategoryDto,
  ) {
    return this.categories.update(user.sub, guildId, categoryId, { name: dto.name });
  }

  @Delete(":categoryId")
  remove(
    @CurrentUser() user: JwtPayload,
    @Param("guildId") guildId: string,
    @Param("categoryId") categoryId: string,
  ) {
    return this.categories.remove(user.sub, guildId, categoryId);
  }
}
