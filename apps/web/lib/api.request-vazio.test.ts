import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./session", () => ({
  getAccessToken: async () => "tok",
  renovarTokens: async () => null,
}));

import { api } from "./api";

/**
 * `POST /guilds/:id/voice/moderar` responde 201 sem corpo. Antes, `request`
 * só tratava 204 como vazio e quebrava no `res.json()`.
 */
describe("api.request com corpo vazio", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("201 com corpo vazio resolve undefined", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 201 })));
    await expect(
      api.moderarVoz("g1", { userId: "u1", mute: true } as never),
    ).resolves.toBeUndefined();
  });

  it("200 com JSON devolve o objeto", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify([{ id: "g1" }]), { status: 200 })),
    );
    await expect(api.listGuilds()).resolves.toEqual([{ id: "g1" }]);
  });
});
