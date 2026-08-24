import { Module } from "@nestjs/common";
import { InvitesController } from "./invites.controller";
import { InvitesService } from "./invites.service";
import { GuildsModule } from "../guilds/guilds.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [GuildsModule, AuthModule],
  controllers: [InvitesController],
  providers: [InvitesService],
})
export class InvitesModule {}
