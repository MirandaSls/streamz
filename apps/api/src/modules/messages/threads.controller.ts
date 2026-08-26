import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { IsBoolean, IsOptional, IsString, Length } from "class-validator";
import { MAX_THREAD_NAME } from "@newdisc/shared";
import { ThreadsService } from "./threads.service";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";

class CreateThreadDto {
  @IsString()
  messageId!: string;

  @IsString()
  @Length(1, MAX_THREAD_NAME)
  name!: string;
}

class UpdateThreadDto {
  @IsOptional()
  @IsString()
  @Length(1, MAX_THREAD_NAME)
  name?: string;

  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}

/** Threads nomeadas de um canal — o painel de threads do cabeçalho. */
@UseGuards(JwtGuard)
@Controller("channels/:channelId/threads")
export class ThreadsController {
  constructor(private readonly threads: ThreadsService) {}

  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Param("channelId") channelId: string,
    @Query("archived") archived?: string,
  ) {
    const filtro = archived === undefined ? undefined : archived === "true";
    return this.threads.list(channelId, user.sub, filtro);
  }

  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Param("channelId") channelId: string,
    @Body() body: CreateThreadDto,
  ) {
    return this.threads.create(channelId, user.sub, body.messageId, body.name.trim());
  }

  @Patch(":threadId")
  update(
    @CurrentUser() user: JwtPayload,
    @Param("channelId") channelId: string,
    @Param("threadId") threadId: string,
    @Body() body: UpdateThreadDto,
  ) {
    return this.threads.update(channelId, user.sub, threadId, {
      name: body.name?.trim(),
      archived: body.archived,
    });
  }
}
