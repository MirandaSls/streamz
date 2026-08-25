import { BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { AccessToken } from "livekit-server-sdk";
import type { VoiceTokenResponse } from "@newdisc/shared";
import { GuildsService } from "../guilds/guilds.service";

@Injectable()
export class VoiceService {
  constructor(private readonly guilds: GuildsService) {}

  /**
   * true só com as três variáveis do LiveKit presentes. Espelha o
   * `StorageService.isConfigured()`: voz é opcional no dev, e sem credencial a
   * rota responde 503 em vez de assinar um token com `undefined`.
   */
  isConfigured(): boolean {
    return Boolean(
      process.env.LIVEKIT_API_KEY &&
        process.env.LIVEKIT_API_SECRET &&
        process.env.LIVEKIT_URL,
    );
  }

  /**
   * Gera um token de acesso do LiveKit para um usuário entrar na sala
   * correspondente a um canal de voz. A sala é o próprio id do canal.
   */
  async createToken(
    channelId: string,
    userId: string,
    username: string,
  ): Promise<VoiceTokenResponse> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        "Voz (LiveKit) não configurada. Ver PENDENCIAS.md.",
      );
    }

    // só quem pode ver o canal (membro; se privado, na allowlist) recebe token
    const { channel } = await this.guilds.assertCanViewChannel(userId, channelId);
    if (channel.type !== "VOICE") {
      throw new BadRequestException("Este canal não é de voz");
    }

    const apiKey = process.env.LIVEKIT_API_KEY!;
    const apiSecret = process.env.LIVEKIT_API_SECRET!;
    const url = process.env.LIVEKIT_URL!;
    const room = `voice:${channelId}`;

    const at = new AccessToken(apiKey, apiSecret, {
      identity: userId,
      name: username,
      ttl: "1h",
    });
    at.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });

    return { token: await at.toJwt(), url, room };
  }
}
