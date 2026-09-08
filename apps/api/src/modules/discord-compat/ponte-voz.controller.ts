import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { zodBody } from "../../common/zod.pipe";
import { VozDoGateway } from "./gateway/voz";

/**
 * A rota interna da ponte de voz: "a sessão daquele bot caiu" (§4 do
 * CONTRATO-F2, §D5.7).
 *
 * ── Lote B da F2 implementa. ──
 *
 * Sem ela, uma ponte que morre deixa o bot para sempre na coluna e no palco do
 * web. A carência de 45 s (`VOICE_RECONNECT_GRACE_MS`) do gateway do web **não
 * se aplica a bot**: bot que caiu, caiu.
 *
 * ```http
 * POST /api/interno/ponte-voz/estado
 * X-Ponte-Segredo: <PONTE_VOZ_SEGREDO>
 * {"bot":"1420…","canal":"1419…","conectado":false}
 * → 204
 * ```
 *
 * **Não é uma rota da casca de compat**: quem chama é a ponte, não um bot, e o
 * formato de erro do Discord não faz sentido aqui — por isso ela não carrega o
 * `FiltroDeErrosDoDiscord` nem o `BotTokenGuard`. Mas a regra 5 do
 * `CONTRATO-F1.md` vale igual: `@Body()` cru + zod, nunca um DTO de
 * `class-validator` sob o `ValidationPipe` global com `whitelist: true`.
 *
 * `@SkipThrottle` porque um teto por IP aqui seria contraproducente: a ponte
 * avisa em rajada quando cai (uma chamada por sessão viva), e cada aviso
 * recusado é um bot fantasma na coluna do web.
 */

const corpoDoEstadoDaPonte = z.object({
  /** snowflake do usuário-bot. */
  bot: z.string().min(1, "obrigatório"),
  /** snowflake do canal de voz. */
  canal: z.string().min(1, "obrigatório"),
  conectado: z.boolean(),
});

type CorpoDoEstadoDaPonte = z.infer<typeof corpoDoEstadoDaPonte>;

/**
 * Compara o segredo em **tempo constante**.
 *
 * Como o `autorizarScrape` de `common/metrics.ts`, e pelo mesmo motivo: com
 * `===` o tempo de resposta vaza o tamanho do prefixo acertado e o segredo se
 * descobre byte a byte. Comparar o comprimento antes vaza só o comprimento, que
 * não encurta a busca.
 *
 * A diferença para o `METRICS_TOKEN` é o caso do segredo **ausente**: lá existe
 * a conveniência de "sem token fora de produção, liberado"; aqui não existe —
 * sem `PONTE_VOZ_SEGREDO` a rota responde **503**, porque um endpoint que
 * desconecta bots de voz aberto por comodidade seria um botão de derrubar
 * chamada exposto na internet.
 */
export function conferirSegredoDaPonte(
  recebido: string | undefined,
  esperado: string | undefined,
): "ok" | "negado" | "desligado" {
  const alvo = esperado?.trim();
  if (!alvo) return "desligado";
  const a = Buffer.from(recebido?.trim() ?? "", "utf8");
  const b = Buffer.from(alvo, "utf8");
  return a.length === b.length && timingSafeEqual(a, b) ? "ok" : "negado";
}

@SkipThrottle()
@Controller("interno/ponte-voz")
export class PonteDeVozController {
  constructor(private readonly voz: VozDoGateway) {}

  @Post("estado")
  @HttpCode(204)
  async estado(
    @Headers("x-ponte-segredo") segredo: string | undefined,
    @Body(zodBody(corpoDoEstadoDaPonte)) corpo: CorpoDoEstadoDaPonte,
  ): Promise<void> {
    switch (conferirSegredoDaPonte(segredo, process.env.PONTE_VOZ_SEGREDO)) {
      case "desligado":
        throw new ServiceUnavailableException(
          "PONTE_VOZ_SEGREDO não configurado: a ponte de voz dos bots está desligada",
        );
      case "negado":
        throw new UnauthorizedException("X-Ponte-Segredo inválido");
      case "ok":
        break;
    }

    // Hoje a ponte só avisa queda (`AvisarQueCaiu`, §4). Um `conectado: true`
    // é aceito e ignorado: quem põe o bot na sala é o op 4, e reagir aqui
    // duplicaria o estado de voz sem nada a acrescentar.
    if (corpo.conectado) return;

    await this.voz.desconectarPelaPonte(corpo.bot, corpo.canal);
  }
}
