import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GuildMembership } from "@streamz/shared";

/**
 * `useModeration` — a parte de "menus de contexto" (`docs/CONTRATO-MENUS.md`
 * §5/§6): meu apelido e minha privacidade neste servidor.
 *
 * `editarAssociacao`/`membershipDe` atendem os modais do menu do ícone do
 * servidor, que abrem para **qualquer** servidor da barra — não só o
 * `membership` ativo (o que está com a tela aberta). Por isso `editarAssociacao`
 * só grava no estado quando o `guildId` da resposta bate com o `membership`
 * que já estava em memória; senão, quem chamou guarda o retorno sozinho.
 */

const api = vi.hoisted(() => ({
  membership: vi.fn(async (_guildId: string): Promise<GuildMembership> => {
    throw new Error("não usado neste teste");
  }),
  editarMinhaAssociacao: vi.fn(
    async (_guildId: string, _body: unknown): Promise<GuildMembership> => {
      throw new Error("não usado neste teste");
    },
  ),
}));
vi.mock("@/lib/api", () => ({ api }));

import { useModeration } from "./moderation";

function membership(guildId: string, extra: Partial<GuildMembership> = {}): GuildMembership {
  return {
    guildId,
    onboarding: {
      systemChannelId: null,
      rulesChannelId: null,
      welcomeDescription: null,
      welcomeChannelIds: [],
      discoverable: false,
      description: null,
    },
    welcomeChannels: [],
    acceptedRulesAt: null,
    timeoutUntil: null,
    mustAcceptRules: false,
    showWelcome: false,
    nickname: null,
    permitirDmsDoServidor: true,
    ...extra,
  };
}

beforeEach(() => {
  useModeration.setState({ membership: null, reports: [], reportsLoading: false });
  api.membership.mockReset();
  api.editarMinhaAssociacao.mockReset();
});

describe("applyNickname", () => {
  it("grava o apelido no servidor aberto", () => {
    useModeration.setState({ membership: membership("g1", { nickname: null }) });
    useModeration.getState().applyNickname("g1", "Chefe");
    expect(useModeration.getState().membership?.nickname).toBe("Chefe");
  });

  it("null remove o apelido", () => {
    useModeration.setState({ membership: membership("g1", { nickname: "Chefe" }) });
    useModeration.getState().applyNickname("g1", null);
    expect(useModeration.getState().membership?.nickname).toBeNull();
  });

  it("evento de outro servidor não mexe no que está aberto", () => {
    useModeration.setState({ membership: membership("g1", { nickname: "Chefe" }) });
    useModeration.getState().applyNickname("g2", "Outro");
    expect(useModeration.getState().membership?.nickname).toBe("Chefe");
  });

  it("sem servidor aberto, não quebra", () => {
    expect(() => useModeration.getState().applyNickname("g1", "Chefe")).not.toThrow();
    expect(useModeration.getState().membership).toBeNull();
  });
});

describe("editarAssociacao", () => {
  it("chama a rota e atualiza o membership quando é o servidor aberto", async () => {
    useModeration.setState({ membership: membership("g1", { nickname: null }) });
    const atualizado = membership("g1", { nickname: "Chefe" });
    api.editarMinhaAssociacao.mockResolvedValueOnce(atualizado);

    const devolvido = await useModeration.getState().editarAssociacao("g1", { nickname: "Chefe" });

    expect(api.editarMinhaAssociacao).toHaveBeenCalledWith("g1", { nickname: "Chefe" });
    expect(devolvido).toEqual(atualizado);
    expect(useModeration.getState().membership).toEqual(atualizado);
  });

  it("editar um servidor que não é o aberto não mexe no membership ativo", async () => {
    useModeration.setState({ membership: membership("g1", { nickname: "Ativo" }) });
    api.editarMinhaAssociacao.mockResolvedValueOnce(membership("g2", { nickname: "Outro" }));

    await useModeration.getState().editarAssociacao("g2", { nickname: "Outro" });

    expect(useModeration.getState().membership?.guildId).toBe("g1");
    expect(useModeration.getState().membership?.nickname).toBe("Ativo");
  });

  it("erro da API propaga para quem chamou (a UI otimista reverte no catch)", async () => {
    useModeration.setState({ membership: membership("g1", { permitirDmsDoServidor: true }) });
    api.editarMinhaAssociacao.mockRejectedValueOnce(new Error("offline"));

    await expect(
      useModeration.getState().editarAssociacao("g1", { permitirDmsDoServidor: false }),
    ).rejects.toThrow("offline");
    // o estado não muda sozinho — quem chamou é quem decide a reversão otimista
    expect(useModeration.getState().membership?.permitirDmsDoServidor).toBe(true);
  });
});

describe("membershipDe", () => {
  it("busca a associação de qualquer servidor sem mexer no estado", async () => {
    const de_g2 = membership("g2", { nickname: "Visitante" });
    api.membership.mockResolvedValueOnce(de_g2);
    useModeration.setState({ membership: membership("g1") });

    const devolvido = await useModeration.getState().membershipDe("g2");

    expect(devolvido).toEqual(de_g2);
    expect(useModeration.getState().membership?.guildId).toBe("g1");
  });
});
