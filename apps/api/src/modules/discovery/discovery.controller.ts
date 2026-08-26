import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { DiscoveryService } from "./discovery.service";
import { CurrentUser } from "../../common/current-user.decorator";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";

@UseGuards(JwtGuard)
@Controller("discover")
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload, @Query("q") q?: string) {
    return this.discovery.list(user.sub, q);
  }
}
