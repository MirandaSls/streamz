import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { WebhookReceiver } from "livekit-server-sdk";
import { VoiceService } from "./voice.service";
import { LIVEKIT_WEBHOOK_THROTTLE } from "../../common/throttle";

/**
 * Webhook do LiveKit — fecha o buraco que o token deixa aberto.
 *
 * O token de voz (`VoiceService.createToken`) vale 1h e não é revogável: um
 * cliente modificado que guarda o token pode reconectar direto no LiveKit sem
 * passar de novo por `voice.join`/`voice.update`, então a moderação do banco
 * (mute, deafen, kick, ban, canal privado) ficaria presa no instante em que o
 * token foi emitido. Este webhook é o outro lado — o LiveKit avisa quando
 * alguém **de fato** entra na sala, e `VoiceService.aoEntrarNoLivekit`
 * reaplica o estado atual do banco naquele momento, não no da emissão do
 * token. Por isso a URL (`/api/voice/livekit/webhook`) precisa estar
 * cadastrada no projeto do LiveKit Cloud — sem isso a reaplicação nunca
 * acontece.
 *
 * Sem `@JwtGuard`: quem chama esta rota é o servidor do LiveKit, não um
 * usuário logado. A autenticação é a assinatura do corpo (`WebhookReceiver`
 * confere HMAC-sha256 contra `LIVEKIT_API_SECRET` usando o header
 * `Authorization`), não um Bearer de sessão.
 */
@Controller()
export class LivekitWebhookController {
  private receiver: WebhookReceiver | undefined;

  constructor(private readonly voice: VoiceService) {}

  // Criado sob demanda (e não no construtor) para seguir o mesmo padrão do
  // VoiceService: sem LIVEKIT_API_KEY/SECRET no ambiente, a rota responde 503
  // antes de tentar instanciar algo que exigiria as chaves com `!`.
  private getReceiver(): WebhookReceiver {
    if (!this.receiver) {
      this.receiver = new WebhookReceiver(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!);
    }
    return this.receiver;
  }

  @Post("voice/livekit/webhook")
  @HttpCode(200)
  @LIVEKIT_WEBHOOK_THROTTLE
  async webhook(
    // Tipo estrutural mínimo (ver erros.ts ~l.16 e RequisicaoHttp em
    // auth.controller.ts): express não é dependência direta da api.
    @Req() req: { rawBody?: Buffer },
    @Headers("authorization") authorization?: string,
  ): Promise<{ ok: true }> {
    if (!this.voice.isConfigured()) {
      throw new ServiceUnavailableException("Voz (LiveKit) não configurada. Ver PENDENCIAS.md.");
    }

    const corpo = req.rawBody?.toString("utf8");
    if (!corpo) {
      throw new BadRequestException("Corpo do webhook ausente");
    }

    let evento;
    try {
      evento = await this.getReceiver().receive(corpo, authorization);
    } catch {
      // Assinatura inválida, header ausente ou payload corrompido: o LiveKit
      // não é quem diz ser, ou não é o LiveKit — nunca confiar no corpo.
      throw new UnauthorizedException("Assinatura do webhook do LiveKit inválida");
    }

    // "participant_joined" (ver JSDoc da classe) e "track_published", que é
    // quando a faixa da ponte de um bot passa a existir para ser silenciada
    // (`aoPublicarNoLivekit`); os demais eventos são ignorados de propósito.
    // Dispara e esquece: o LiveKit espera 200 rápido e reenvia/atrasa entregas
    // seguintes se a resposta demorar. Os dois métodos nunca lançam, então
    // não há erro para engolir aqui.
    const sala = evento.room?.name;
    const identidade = evento.participant?.identity;
    if (sala && identidade) {
      if (evento.event === "participant_joined") {
        void this.voice.aoEntrarNoLivekit(sala, identidade);
      } else if (evento.event === "track_published") {
        void this.voice.aoPublicarNoLivekit(sala, identidade);
      }
    }

    return { ok: true };
  }
}
