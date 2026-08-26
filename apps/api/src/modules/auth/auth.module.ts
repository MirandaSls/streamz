import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller";
import { AccountController } from "./account.controller";
import { AuthService } from "./auth.service";
import { AccountService } from "./account.service";
import { AccountStatusService } from "./account-status.service";
import { JwtGuard } from "../../common/jwt.guard";
import { MailModule } from "../mail/mail.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { StorageModule } from "../storage/storage.module";

@Module({
  imports: [JwtModule.register({}), MailModule, RealtimeModule, StorageModule],
  controllers: [AuthController, AccountController],
  providers: [AuthService, AccountService, AccountStatusService, JwtGuard],
  // `AccountStatusService` sai daqui porque o `JwtGuard` (usado por todo módulo
  // que importa este) e o gateway dependem dele
  exports: [AuthService, AccountStatusService, JwtModule, JwtGuard],
})
export class AuthModule {}
