import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { SkipThrottle } from "@nestjs/throttler";
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  Length,
} from "class-validator";
import type { ServerResponse } from "node:http";
import { MAX_DM_GROUP_INVITEES, MAX_DM_GROUP_NAME, MAX_GROUP_ICON_SIZE } from "@streamz/shared";
import { DMsService } from "./dms.service";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";
import { UPLOAD_THROTTLE } from "../../common/throttle";

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
  @Length(1, MAX_DM_GROUP_NAME)
  name?: string;
}

// ── d-social ──
class AddMemberDto {
  @IsString()
  userId!: string;
}

class RenameGroupDto {
  @IsOptional()
  @IsString()
  @Length(0, MAX_DM_GROUP_NAME)
  name?: string | null;
}

@Controller("dms")
export class DMsController {
  constructor(private readonly dms: DMsService) {}

  @UseGuards(JwtGuard)
  @Post()
  open(@CurrentUser() user: JwtPayload, @Body() dto: OpenDMDto) {
    return this.dms.openWith(user.sub, dto.userId, { username: user.username });
  }

  @UseGuards(JwtGuard)
  @Post("group")
  createGroup(@CurrentUser() user: JwtPayload, @Body() dto: CreateGroupDto) {
    return this.dms.createGroup(user.sub, dto.userIds, dto.name);
  }

  @UseGuards(JwtGuard)
  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.dms.list(user.sub, user.username);
  }

  /** Uma conversa específica, na visão de quem pede. */
  @UseGuards(JwtGuard)
  @Get(":id")
  get(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.dms.get(user.sub, id, user.username);
  }

  /** Sai de um grupo de DM. Em conversa 1-a-1 não faz sentido: responde 400. */
  @UseGuards(JwtGuard)
  @Post(":id/leave")
  leave(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.dms.leaveGroup(user.sub, id);
  }

  // ── d-social ──

  /** Participantes da conversa (coluna 4 da DM/grupo). */
  @UseGuards(JwtGuard)
  @Get(":id/members")
  members(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.dms.members(user.sub, id);
  }

  /** Fecha a conversa: some da minha lista até chegar mensagem nova. */
  @UseGuards(JwtGuard)
  @Post(":id/hide")
  hide(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.dms.hide(user.sub, id);
  }

  /**
   * Reabre a conversa: ela volta para a coluna e fica lá até ser fechada de
   * novo. O par de `hide`, para os caminhos que abrem pelo id do canal (rail,
   * link, caixa de entrada, chamada) e não passam por `POST /dms`.
   */
  @UseGuards(JwtGuard)
  @Post(":id/show")
  show(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.dms.mostrar(user.sub, id, user.username);
  }

  /**
   * ── menus de contexto ── Fixa a conversa no topo da minha lista.
   * Idempotente: fixar de novo devolve o `pinnedAt` já gravado.
   */
  @UseGuards(JwtGuard)
  @Put(":id/pin")
  pin(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.dms.pin(user.sub, id);
  }

  /** ── menus de contexto ── Desafixa a conversa. Idempotente. */
  @UseGuards(JwtGuard)
  @Delete(":id/pin")
  unpin(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.dms.unpin(user.sub, id);
  }

  /** Qualquer participante adiciona ao grupo (como no Discord). */
  @UseGuards(JwtGuard)
  @Post(":id/members")
  addMember(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: AddMemberDto,
  ) {
    return this.dms.addMember(user.sub, id, dto.userId);
  }

  /** Só o dono do grupo remove participantes. */
  @UseGuards(JwtGuard)
  @Delete(":id/members/:userId")
  removeMember(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Param("userId") userId: string,
  ) {
    return this.dms.removeMember(user.sub, id, userId);
  }

  @UseGuards(JwtGuard)
  @Patch(":id")
  rename(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: RenameGroupDto) {
    return this.dms.rename(user.sub, id, dto.name ?? null);
  }

  @UseGuards(JwtGuard)
  @UPLOAD_THROTTLE
  @Post(":id/icon")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_GROUP_ICON_SIZE } }))
  updateIcon(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @UploadedFile() file: { buffer: Buffer; size: number },
  ) {
    return this.dms.updateIcon(user.sub, id, file);
  }

  /**
   * Ícone do grupo, servido como o avatar: sem token, porque `<img src>` não
   * manda cabeçalho. O id do canal é um cuid — não dá para varrer.
   */
  @SkipThrottle()
  @Get(":id/icon")
  async icon(@Param("id") id: string, @Res() res: ServerResponse) {
    const { body, contentType } = await this.dms.iconStream(id);
    res.setHeader("Content-Type", contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    body.on("error", () => res.destroy());
    body.pipe(res);
  }

  // Histórico, busca e thread de uma conversa são os de qualquer canal:
  // GET /channels/:id/messages[...] (MessagesController). Ver ADR-0001.
}
