import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { Throttle, seconds } from "@nestjs/throttler";
import { EmbedsService } from "./embeds.service";
import { JwtGuard } from "../../common/jwt.guard";

/** Prévia Open Graph de um link. Cada chamada pode custar um fetch externo. */
@UseGuards(JwtGuard)
@Controller("embeds")
export class EmbedsController {
  constructor(private readonly embeds: EmbedsService) {}

  @Throttle({ default: { ttl: seconds(60), limit: 60 } })
  @Get()
  preview(@Query("url") url: string) {
    return this.embeds.preview(url ?? "");
  }
}
