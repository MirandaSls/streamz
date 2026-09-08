import { Controller } from "@nestjs/common";

/**
 * O registro de comandos de barra: o que o `deploy-commands.js` de todo
 * tutorial do discord.js chama.
 *
 * ── Lote B (REST compat) implementa. ──
 *
 * ```
 * GET    /api/v10/applications/:app/commands
 * PUT    /api/v10/applications/:app/commands                   (sobrescrita em bloco)
 * POST   /api/v10/applications/:app/commands                   (um comando)
 * DELETE /api/v10/applications/:app/commands/:cmd
 * GET    /api/v10/applications/:app/guilds/:gid/commands
 * PUT    /api/v10/applications/:app/guilds/:gid/commands
 * POST   /api/v10/applications/:app/guilds/:gid/commands
 * DELETE /api/v10/applications/:app/guilds/:gid/commands/:cmd
 * ```
 *
 * Autenticação: `BotTokenGuard`. O `:app` do caminho tem que ser o snowflake da
 * `Application` do token — outro valor é **403 `50001`**, não 404: o bot existe,
 * mas não é dele.
 *
 * O `PUT` é sobrescrita em bloco: o que não veio no corpo **some**. É assim no
 * Discord, e é o que faz o `deploy-commands.js` ser idempotente.
 *
 * Este arquivo é novo e separado de `applications.controller.ts` (o
 * `/applications/@me` da F1) de propósito: dois lotes editando o mesmo arquivo
 * é a colisão que o §6.4 do processo manda evitar, e o `@me` não muda na F3.
 */
@Controller()
export class ApplicationCommandsCompatController {}

@Controller()
export class ApplicationCommandsCompatControllerV9 extends ApplicationCommandsCompatController {}
