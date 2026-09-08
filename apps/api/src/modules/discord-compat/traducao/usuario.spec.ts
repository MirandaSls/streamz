import { describe, expect, it } from "vitest";

import type { LinhaDeUsuario } from "../tipos";
import { usuarioParaDiscord } from "./usuario";

/**
 * O objeto `user`. Pequeno, mas é o que aparece em toda mensagem e em todo
 * membro — um campo faltando aqui aparece em milhares de payloads.
 */
describe("usuarioParaDiscord", () => {
  const base: LinhaDeUsuario = {
    id: "clx_user",
    snowflake: 1234567890123456789n,
    username: "mdz",
    displayName: "MDZ",
    isBot: false,
  };

  it("monta o usuário no formato do Discord", () => {
    expect(usuarioParaDiscord(base)).toEqual({
      id: "1234567890123456789",
      username: "mdz",
      discriminator: "0",
      global_name: "MDZ",
      avatar: null,
      bot: false,
      system: false,
      public_flags: 0,
    });
  });

  it("o discriminator é a string \"0\", nunca undefined", () => {
    // `undefined` aqui quebra `User#tag` em algumas libs (viram "mdz#undefined")
    const u = usuarioParaDiscord(base);
    expect(u.discriminator).toBe("0");
    expect(typeof u.discriminator).toBe("string");
  });

  it("sem displayName, global_name é null", () => {
    expect(usuarioParaDiscord({ ...base, displayName: null }).global_name).toBeNull();
  });

  it("bot vem do isBot", () => {
    expect(usuarioParaDiscord({ ...base, isBot: true }).bot).toBe(true);
  });

  it("o id sai como string decimal e sobrevive ao JSON", () => {
    const u = usuarioParaDiscord(base);
    expect(u.id).toBe("1234567890123456789");
    expect(() => JSON.stringify(u)).not.toThrow();
    // e não perdeu precisão pelo caminho (é maior que 2^53)
    expect(BigInt(u.id)).toBe(base.snowflake);
  });
});
