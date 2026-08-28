import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { DownloadsController } from "./downloads.controller";
import { DownloadsService } from "./downloads.service";

@Module({
  // JwtModule: o service assina o token curto (`?t=`) que autoriza o arquivo
  imports: [JwtModule.register({})],
  controllers: [DownloadsController],
  providers: [DownloadsService],
})
export class DownloadsModule {}
