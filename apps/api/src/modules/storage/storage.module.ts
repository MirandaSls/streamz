import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { StorageService } from "./storage.service";

@Module({
  // JwtModule: o StorageService assina o token curto (`?t=`) do proxy de anexos
  imports: [JwtModule.register({})],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
