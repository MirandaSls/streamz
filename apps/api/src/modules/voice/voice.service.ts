import { Injectable } from "@nestjs/common";
import { AccessToken } from "livekit-server-sdk";
import type { VoiceTokenResponse } from "@newdisc/shared";
import { GuildsService } from "../guilds/guilds.service";

@Injectable()
export class VoiceService {
  constructor(private readonly guilds: GuildsService) {}

  /**
   * Gera um token de acesso do LiveKit para um usuário entrar na sala
   * correspondente a um canal de voz. A sala é o próprio id do canal.
   */
  async createToken(
    channelId: string,
    userId: string,
    username: string,
  ): Promise<VoiceTokenResponse> {
    // só membros do servidor dono do canal recebem token de voz
    await this.guilds.assertChannelMember(userId, channelId);

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
