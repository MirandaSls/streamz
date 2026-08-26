import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { IsString, Length } from "class-validator";
import { MAX_CATEGORY_NAME } from "@streamz/shared";
import { CategoriesService } from "./categories.service";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";

class CategoryDto {
  @IsString()
  @Length(1, MAX_CATEGORY_NAME)
  name!: string;
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
