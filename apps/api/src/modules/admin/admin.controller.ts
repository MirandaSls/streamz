import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import type {
  AdminCall,
  AdminChannelsPage,
  AdminGuildView,
  AdminMe,
  AdminMessagesPage,
  AdminOverview,
  AdminUsersPage,
} from "@streamz/shared";
import { AdminService } from "./admin.service";
import { PlatformAdminGuard } from "./admin.guard";
import { PlatformAdminService } from "./platform-admin.service";
import { CurrentUser } from "../../common/current-user.decorator";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";

/** Escopos aceitos pela listagem de canais; qualquer outro valor vira "todos". */
const ESCOPOS = ["todos", "servidores", "conversas"] as const;
type Escopo = (typeof ESCOPOS)[number];

/**
 * Painel do administrador da instância. Só leitura — ver `AdminService`.
 *
 * Todas as rotas menos `/admin/me` exigem `PlatformAdminGuard`. `/admin/me` é
 * de propósito aberta a qualquer conta autenticada: é ela que o cliente usa
 * para saber se deve desenhar a aba, e responder 403 aí obrigaria o app a
 * tratar um erro esperado como erro.
 */
@Controller("admin")
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly admins: PlatformAdminService,
  ) {}

  @UseGuards(JwtGuard)
  @Get("me")
  async me(@CurrentUser() user: JwtPayload): Promise<AdminMe> {
    return { admin: await this.admins.ehAdmin(user.sub) };
  }

  @UseGuards(JwtGuard, PlatformAdminGuard)
  @Get("overview")
  overview(): Promise<AdminOverview> {
    return this.admin.overview();
  }

  /** Todas as chamadas abertas agora — de servidor e de conversa. */
  @UseGuards(JwtGuard, PlatformAdminGuard)
  @Get("calls")
  calls(): Promise<AdminCall[]> {
    return this.admin.calls();
  }

  @UseGuards(JwtGuard, PlatformAdminGuard)
  @Get("users")
  users(@Query("q") q?: string, @Query("cursor") cursor?: string): Promise<AdminUsersPage> {
    return this.admin.users(q, cursor);
  }

  @UseGuards(JwtGuard, PlatformAdminGuard)
  @Get("guilds")
  guilds(): Promise<AdminGuildView[]> {
    return this.admin.guilds();
  }

  @UseGuards(JwtGuard, PlatformAdminGuard)
  @Get("channels")
  channels(
    @Query("q") q?: string,
    @Query("escopo") escopo?: string,
    @Query("cursor") cursor?: string,
  ): Promise<AdminChannelsPage> {
    return this.admin.channels(q, normalizarEscopo(escopo), cursor);
  }

  /** O histórico de qualquer canal, sem ser membro dele. Fica no log do servidor. */
  @UseGuards(JwtGuard, PlatformAdminGuard)
  @Get("channels/:id/messages")
  messages(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Query("cursor") cursor?: string,
  ): Promise<AdminMessagesPage> {
    return this.admin.messages(user.sub, id, cursor);
  }
}

function normalizarEscopo(valor?: string): Escopo {
  return (ESCOPOS as readonly string[]).includes(valor ?? "") ? (valor as Escopo) : "todos";
}
