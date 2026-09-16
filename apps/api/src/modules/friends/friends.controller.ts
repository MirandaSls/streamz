import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { IsString, Length } from "class-validator";
import {
  apelidoDeAmigoSchema,
  ignorarUsuarioSchema,
  type ApelidoDeAmigoInput,
  type IgnorarUsuarioInput,
} from "@streamz/shared";
import { FriendsService } from "./friends.service";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";
import { FRIEND_REQUEST_THROTTLE } from "../../common/throttle";
import { zodBody } from "../../common/zod.pipe";

class FriendRequestDto {
  @IsString()
  @Length(3, 32)
  username!: string;
}

class BlockDto {
  @IsString()
  userId!: string;
}

/**
 * Amigos e bloqueio. Tudo é leitura/estrutura, então mora no REST — o que vai
 * ao vivo (pedido recebido, amizade aceita, relação desfeita) sai pelos eventos
 * `friend.*` do `RealtimeService`.
 */
@UseGuards(JwtGuard)
@Controller("friends")
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}

  /** As quatro listas da página Amigos: amigos, recebidos, enviados, bloqueados. */
  @Get()
  lists(@CurrentUser() user: JwtPayload) {
    return this.friends.lists(user.sub);
  }

  /** Pedido por nome de usuário — o campo "nome#" do Discord. */
  @FRIEND_REQUEST_THROTTLE
  @Post("requests")
  request(@CurrentUser() user: JwtPayload, @Body() dto: FriendRequestDto) {
    return this.friends.request(user.sub, dto.username);
  }

  @Post("requests/:id/accept")
  accept(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.friends.accept(user.sub, id);
  }

  /** Recusa (recebido) ou cancela (enviado) — a linha pendente some nos dois casos. */
  @Delete("requests/:id")
  removeRequest(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.friends.removeRequest(user.sub, id);
  }

  @Delete(":userId")
  removeFriend(@CurrentUser() user: JwtPayload, @Param("userId") userId: string) {
    return this.friends.removeFriend(user.sub, userId);
  }

  @Post("blocks")
  block(@CurrentUser() user: JwtPayload, @Body() dto: BlockDto) {
    return this.friends.block(user.sub, dto.userId);
  }

  @Delete("blocks/:userId")
  unblock(@CurrentUser() user: JwtPayload, @Param("userId") userId: string) {
    return this.friends.unblock(user.sub, userId);
  }

  // ── menus de contexto: apelido de amigo ──

  /** Apelido que só eu vejo no lugar do nome do amigo. Só entre amigos. */
  @Put(":userId/nickname")
  definirApelido(
    @CurrentUser() user: JwtPayload,
    @Param("userId") userId: string,
    @Body(zodBody(apelidoDeAmigoSchema)) dto: ApelidoDeAmigoInput,
  ) {
    return this.friends.definirApelidoDeAmigo(user.sub, userId, dto.apelido);
  }

  @Delete(":userId/nickname")
  removerApelido(@CurrentUser() user: JwtPayload, @Param("userId") userId: string) {
    return this.friends.removerApelidoDeAmigo(user.sub, userId);
  }

  // ── menus de contexto: ignorar ──

  /**
   * Ignorar é diferente de bloquear: a outra pessoa não sabe, e a amizade não
   * é desfeita. O efeito é todo do lado de quem ignora, e é a web que aplica.
   */
  @Post("ignores")
  ignorar(
    @CurrentUser() user: JwtPayload,
    @Body(zodBody(ignorarUsuarioSchema)) dto: IgnorarUsuarioInput,
  ) {
    return this.friends.ignorarUsuario(user.sub, dto.userId);
  }

  @Delete("ignores/:userId")
  deixarDeIgnorar(@CurrentUser() user: JwtPayload, @Param("userId") userId: string) {
    return this.friends.deixarDeIgnorar(user.sub, userId);
  }
}
