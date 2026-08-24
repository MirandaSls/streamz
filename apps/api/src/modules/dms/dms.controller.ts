import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { IsString } from "class-validator";
import { DMsService } from "./dms.service";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";

class OpenDMDto {
  @IsString()
  userId!: string;
}

@UseGuards(JwtGuard)
@Controller("dms")
export class DMsController {
  constructor(private readonly dms: DMsService) {}

  @Post()
  open(@CurrentUser() user: JwtPayload, @Body() dto: OpenDMDto) {
    return this.dms.openWith(user.sub, dto.userId);
  }

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.dms.list(user.sub);
  }

  @Get(":id/messages")
  history(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Query("cursor") cursor?: string,
  ) {
    return this.dms.history(user.sub, id, cursor);
  }
}
