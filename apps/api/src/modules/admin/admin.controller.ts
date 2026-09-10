import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { adminAppOficialSchema, adminMensagemSchema } from "@streamz/shared";
import type {
  AdminAppOficialInput,
  AdminCall,
  AdminChannelsPage,
  AdminGuildView,
  AdminMe,
  AdminMensagemEnviada,
  AdminMensagemInput,
  AdminMessagesPage,
  AdminOverview,
  AdminUsersPage,
} from "@streamz/shared";
import { AdminService } from "./admin.service";
import { PlatformAdminGuard } from "./admin.guard";
import { PlatformAdminService } from "./platform-admin.service";
import { CurrentUser } from "../../common/current-user.decorator";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { zodBody } from "../../common/zod.pipe";

/** Escopos aceitos pela listagem de canais; qualquer outro valor vira "todos". */
const ESCOPOS = ["todos", "servidores", "conversas"] as const;
type Escopo = (typeof ESCOPOS)[number];

/**
 * Painel do administrador da instância. Leitura, e uma escrita — ver `AdminService`.
 *
 * Todas as rotas menos `/admin/me` exigem `PlatformAdminGuard`. `/admin/me` é
 * de propósito aberta a qualquer conta autenticada: é ela que o cliente usa
 * para saber se deve desenhar a aba, e responder 403 aí obrigaria o app a
 * tratar um erro esperado como erro.
 *
 * `POST /admin/users/:id/message` é a única rota que escreve. Ela mora aqui, e
 * não no `DMsController`, porque o poder que a sustenta é o do painel: sem o
 * `PlatformAdminGuard` ela seria só um jeito de furar o bloqueio de qualquer
 * usuário.
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
  /**
   * Manda uma mensagem para qualquer conta, sem precisar tê-la adicionada.
   * Também fica no log do servidor. Ver `AdminService.enviarMensagem`.
   */
  @UseGuards(JwtGuard, PlatformAdminGuard)
  @Post("users/:id/message")
  mensagem(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body(zodBody(adminMensagemSchema)) dto: AdminMensagemInput,
  ): Promise<AdminMensagemEnviada> {
    return this.admin.enviarMensagem(user.sub, id, dto.content);
  }

  /**
   * Marca um aplicativo como **oficial da instância** (ou tira a marca).
   *
   * ── j-bots · bots oficiais ──
   *
   * É a rota que `apps/bots/src/provisionar.ts` chama depois de criar cada bot
   * de `apps/bots/`. `POST` e não `PATCH` porque não é editar um recurso do
   * painel: é uma ação sobre um recurso de outro módulo.
   */
  @UseGuards(JwtGuard, PlatformAdminGuard)
  @Post("applications/:id/oficial")
  oficial(
    @Param("id") id: string,
    @Body(zodBody(adminAppOficialSchema)) dto: AdminAppOficialInput,
  ): Promise<{ oficial: boolean }> {
    return this.admin.marcarOficial(id, dto.oficial);
  }
}


function normalizarEscopo(valor?: string): Escopo {
  return (ESCOPOS as readonly string[]).includes(valor ?? "") ? (valor as Escopo) : "todos";
}
