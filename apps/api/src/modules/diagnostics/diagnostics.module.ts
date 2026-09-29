import { Module } from "@nestjs/common";
import { DiagnosticsController } from "./diagnostics.controller";
import { AuthModule } from "../auth/auth.module";

@Module({
  // AuthModule: o JwtGuard do controller precisa do AccountStatusService que ele exporta
  imports: [AuthModule],
  controllers: [DiagnosticsController],
})
export class DiagnosticsModule {}
