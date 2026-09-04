import { beforeEach, describe, expect, it, vi } from "vitest";

const tocarSom = vi.fn();
vi.mock("@/lib/ringtone", () => ({ tocarSom }));

const { somDaMudanca, useVoicePrefs } = await import("./voicePrefs");
const { PREFS_DO_TESTE } = await import("./teste-de-microfone");

/** Volta a store ao estado de quem acabou de entrar, sem contar como som. */
function comecarLimpo() {
  useVoicePrefs.setState({ muted: false, deafened: false });
  tocarSom.mockClear();
}

beforeEach(comecarLimpo);

describe("somDaMudanca", () => {
  it("o surdo manda quando muda", () => {
    expect(somDaMudanca({ muted: false, deafened: false }, PREFS_DO_TESTE)).toBe("surdo");
    expect(somDaMudanca(PREFS_DO_TESTE, { muted: false, deafened: false })).toBe("nao-surdo");
    // o mudo vem junto com o surdo, e mesmo assim é **um** som
    expect(somDaMudanca(PREFS_DO_TESTE, { muted: true, deafened: false })).toBe("nao-surdo");
  });

  it("sem mudança no surdo, quem fala é o mudo", () => {
    expect(somDaMudanca({ muted: false, deafened: false }, { muted: true, deafened: false })).toBe(
      "mudo",
    );
    expect(somDaMudanca({ muted: true, deafened: false }, { muted: false, deafened: false })).toBe(
      "desmudo",
    );
  });

  it("nada mudou, nada toca", () => {
    expect(somDaMudanca(PREFS_DO_TESTE, PREFS_DO_TESTE)).toBeNull();
    expect(somDaMudanca({ muted: false, deafened: false }, { muted: false, deafened: false })).toBeNull();
  });
});

describe("setMuteDeafen", () => {
  it("o teste ensurdece com um som só", () => {
    useVoicePrefs.getState().setMuteDeafen(PREFS_DO_TESTE);
    expect(useVoicePrefs.getState()).toMatchObject({ muted: true, deafened: true });
    // o gateway lê `micAberto()`: é o que faz os outros me verem mudo
    expect(useVoicePrefs.getState().micAberto()).toBe(false);
    expect(tocarSom.mock.calls).toEqual([["surdo"]]);
  });

  it("restaurar o estado de antes também toca um som só", () => {
    useVoicePrefs.getState().setMuteDeafen(PREFS_DO_TESTE);
    tocarSom.mockClear();
    useVoicePrefs.getState().setMuteDeafen({ muted: false, deafened: false });
    expect(useVoicePrefs.getState()).toMatchObject({ muted: false, deafened: false });
    expect(tocarSom.mock.calls).toEqual([["nao-surdo"]]);
  });

  it("restaurar quem já estava surdo não toca nada", () => {
    useVoicePrefs.setState({ muted: true, deafened: true });
    tocarSom.mockClear();
    useVoicePrefs.getState().setMuteDeafen(PREFS_DO_TESTE);
    expect(tocarSom).not.toHaveBeenCalled();
  });

  it("surdo implica mudo, como no toggle", () => {
    useVoicePrefs.getState().setMuteDeafen({ muted: false, deafened: true });
    expect(useVoicePrefs.getState()).toMatchObject({ muted: true, deafened: true });
  });

  it("persiste, como qualquer preferência", () => {
    useVoicePrefs.getState().setMuteDeafen({ muted: true, deafened: false });
    expect(JSON.parse(localStorage.getItem("voicePrefs") ?? "{}")).toMatchObject({
      muted: true,
      deafened: false,
    });
  });
});
