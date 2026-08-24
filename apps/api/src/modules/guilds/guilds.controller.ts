import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { IsString, Length } from "class-validator";
import { GuildsService } from "./guilds.service";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";

class CreateGuildDto {
  @IsString()
  @Length(2, 64)
  name!: string;
}

@UseGuards(JwtGuard)
@Controller("guilds")
export class GuildsController {
  constructor(private readonly guilds: GuildsService) {}

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateGuildDto) {
    return this.guilds.create(user.sub, dto.name);
  }

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.guilds.listForUser(user.sub);
  }

  @Get(":id")
  get(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.guilds.getWithChannels(user.sub, id);
  }

  @Get(":id/members")
  members(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.guilds.listMembers(user.sub, id);
  }

  @Post(":id/join")
  join(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.guilds.join(user.sub, id);
  }
}
