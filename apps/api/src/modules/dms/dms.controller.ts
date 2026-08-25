import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  Length,
} from "class-validator";
import { MAX_DM_GROUP_INVITEES } from "@newdisc/shared";
import { DMsService } from "./dms.service";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";

class OpenDMDto {
  @IsString()
  userId!: string;
}

class CreateGroupDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @ArrayMaxSize(MAX_DM_GROUP_INVITEES, {
    message: `Um grupo aceita no máximo ${MAX_DM_GROUP_INVITEES} convidados`,
  })
  @IsString({ each: true })
  userIds!: string[];

  @IsOptional()
  @IsString()
  @Length(1, 64)
  name?: string;
}

@UseGuards(JwtGuard)
@Controller("dms")
export class DMsController {
  constructor(private readonly dms: DMsService) {}

  @Post()
  open(@CurrentUser() user: JwtPayload, @Body() dto: OpenDMDto) {
    return this.dms.openWith(user.sub, dto.userId);
  }

  @Post("group")
  createGroup(@CurrentUser() user: JwtPayload, @Body() dto: CreateGroupDto) {
    return this.dms.createGroup(user.sub, dto.userIds, dto.name);
  }

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.dms.list(user.sub);
  }

  /** Uma conversa específica, na visão de quem pede. */
  @Get(":id")
  get(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.dms.get(user.sub, id);
  }

  /** Sai de um grupo de DM. Em conversa 1-a-1 não faz sentido: responde 400. */
  @Post(":id/leave")
  leave(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.dms.leaveGroup(user.sub, id);
  }

  // Histórico, busca e thread de uma conversa são os de qualquer canal:
  // GET /channels/:id/messages[...] (MessagesController). Ver ADR-0001.
}
