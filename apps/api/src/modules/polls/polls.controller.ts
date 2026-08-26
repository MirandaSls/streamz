import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { PollsService } from "./polls.service";
import { CurrentUser } from "../../common/current-user.decorator";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";

/**
 * Leitura de enquete. Criar, votar e encerrar passam pelo gateway (`WS_EVENTS`),
 * como toda escrita de mensagem — aqui ficam só as consultas.
 */
@UseGuards(JwtGuard)
@Controller()
export class PollsController {
  constructor(private readonly polls: PollsService) {}

  /** Meus votos nas enquetes deste canal (o DTO da mensagem não sabe quem lê). */
  @Get("channels/:channelId/polls/votes")
  myVotes(@CurrentUser() user: JwtPayload, @Param("channelId") channelId: string) {
    return this.polls.myVotes(user.sub, channelId);
  }

  /** Quem votou em cada opção (só moderação). */
  @Get("messages/:messageId/poll/voters")
  voters(@CurrentUser() user: JwtPayload, @Param("messageId") messageId: string) {
    return this.polls.voters(user.sub, messageId);
  }
}
