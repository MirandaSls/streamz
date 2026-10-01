import { beforeEach, describe, expect, it } from "vitest";
import { useVoice } from "./voice";

describe("alternarMembrosOcultos", () => {
  beforeEach(() => useVoice.setState({ membrosOcultos: false }));

  it("começa com a tira visível e alterna a cada chamada", () => {
    expect(useVoice.getState().membrosOcultos).toBe(false);
    useVoice.getState().alternarMembrosOcultos();
    expect(useVoice.getState().membrosOcultos).toBe(true);
    useVoice.getState().alternarMembrosOcultos();
    expect(useVoice.getState().membrosOcultos).toBe(false);
  });
});
