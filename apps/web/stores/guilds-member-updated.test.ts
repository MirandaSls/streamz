import { beforeEach, describe, expect, it } from "vitest";
import type { GuildMemberView } from "@streamz/shared";
import { useGuilds } from "./guilds";

/**
 * `handleMemberUpdated` (o tratador de `member.updated`) — aqui só a parte de
 * `nickname` (`docs/CONTRATO-MENUS.md` §5): a lista de membros em memória
 * precisa refletir o apelido novo sem recarregar a página, para a lista de
 * membros (`MemberList.tsx`) e o autor de mensagem mostrarem o nome certo.
 *
 * `nickname` ausente (`undefined`) = o evento não falava de apelido (só papel
 * ou castigo mudou) — não pode apagar um apelido que já estava lá.
 */

function membro(userId: string, extra: Partial<GuildMemberView> = {}): GuildMemberView {
  return {
    user: {
      id: userId,
      username: userId,
      displayName: null,
      avatarUrl: null,
      status: "ONLINE",
      customStatusText: null,
      customStatusEmoji: null,
    },
    role: "MEMBER",
    roleIds: [],
    joinedAt: "2026-01-01T00:00:00.000Z",
    nickname: null,
    ...extra,
  };
}

beforeEach(() => {
  useGuilds.setState({ activeGuildId: "g1", members: [membro("bia")] });
});

describe("handleMemberUpdated — apelido no servidor", () => {
  it("grava o apelido novo do membro", () => {
    useGuilds.getState().handleMemberUpdated("g1", "bia", "MEMBER", undefined, undefined, "Chefe");
    expect(useGuilds.getState().members.find((m) => m.user.id === "bia")?.nickname).toBe("Chefe");
  });

  it("null remove o apelido", () => {
    useGuilds.setState({ members: [membro("bia", { nickname: "Chefe" })] });
    useGuilds.getState().handleMemberUpdated("g1", "bia", "MEMBER", undefined, undefined, null);
    expect(useGuilds.getState().members.find((m) => m.user.id === "bia")?.nickname).toBeNull();
  });

  it("nickname ausente (evento só de papel/castigo) não apaga o apelido que já estava lá", () => {
    useGuilds.setState({ members: [membro("bia", { nickname: "Chefe" })] });
    useGuilds.getState().handleMemberUpdated("g1", "bia", "ADMIN");
    const atualizado = useGuilds.getState().members.find((m) => m.user.id === "bia");
    expect(atualizado?.role).toBe("ADMIN");
    expect(atualizado?.nickname).toBe("Chefe");
  });

  it("servidor que não é o aberto: ignora o evento inteiro", () => {
    useGuilds.getState().handleMemberUpdated("g2", "bia", "MEMBER", undefined, undefined, "Outro");
    expect(useGuilds.getState().members.find((m) => m.user.id === "bia")?.nickname).toBeNull();
  });

  it("não mexe no apelido de outro membro", () => {
    useGuilds.setState({ members: [membro("bia"), membro("caio", { nickname: "Cai" })] });
    useGuilds.getState().handleMemberUpdated("g1", "bia", "MEMBER", undefined, undefined, "Chefe");
    expect(useGuilds.getState().members.find((m) => m.user.id === "caio")?.nickname).toBe("Cai");
  });
});
