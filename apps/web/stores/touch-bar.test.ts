import { describe, expect, it, vi } from "vitest";

/**
 * `stores/touch-bar.ts` importa `useVoice` (não só o tipo) para o bloco de
 * efeito colateral, e isso carrega `stores/voice.ts` de verdade neste teste —
 * mesmo testando só a função pura. `lib/desktop.ts` é mockado pelo mesmo
 * motivo de `voice-chamada.test.ts`: fora do Tauri `isTauri()` cai em `false`
 * e nenhuma das outras funções chega a ser chamada, então o mock não precisa
 * fazer nada além de existir. `ehMacNoTauri` também cai em `false`, o que
 * mantém o bloco de efeito deste módulo desligado durante o teste — em Node,
 * sem `window` (ver `test/ambiente.ts`), ele já ficaria desligado de qualquer
 * jeito, isto é só para não depender da ordem de carregamento.
 */
vi.mock("@/lib/desktop", () => ({
  isTauri: () => false,
  ehMacNoTauri: () => false,
  ehAndroidNoTauri: () => false,
  abrirNoSistema: vi.fn(async () => false),
  iniciarTelaNativa: vi.fn(async () => ({})),
  pararTelaNativa: vi.fn(async () => {}),
  descartarTelaNativa: vi.fn(async () => {}),
  prepararTelaNativa: vi.fn(async () => {}),
  ouvirTelaEncerrada: () => () => {},
  suspenderAtenuacaoDoWindows: vi.fn(async () => {}),
  restaurarAtenuacaoDoWindows: vi.fn(async () => {}),
  focarJanela: vi.fn(async () => {}),
  atualizarTouchBar: vi.fn(async () => {}),
  ouvirTouchBar: () => () => {},
}));

import { estadoDaTouchBar, type EntradaDaTouchBar } from "./touch-bar";

function entrada(parcial: Partial<EntradaDaTouchBar> = {}): EntradaDaTouchBar {
  return {
    status: "connected",
    channelId: "c1",
    muted: false,
    deafened: false,
    camOn: false,
    screenOn: false,
    ...parcial,
  };
}

describe("estadoDaTouchBar", () => {
  it("null sem canal (fora de qualquer call)", () => {
    expect(estadoDaTouchBar(entrada({ channelId: null }))).toBeNull();
  });

  it("null enquanto ainda está conectando", () => {
    // o microfone pode nem ter subido ainda (`microfonePronto`); a Touch Bar
    // não tem o que mostrar de uma call que ainda não pegou
    expect(estadoDaTouchBar(entrada({ status: "connecting" }))).toBeNull();
  });

  it("null numa queda de mídia (channelId de pé, status error)", () => {
    // `RoomEvent.Disconnected` deixa o `channelId` para a reconexão automática
    // (ver `servico-de-chamada.ts`); a Touch Bar concorda e some com os botões
    expect(estadoDaTouchBar(entrada({ status: "error" }))).toBeNull();
  });

  it("conectado e tudo desligado", () => {
    expect(estadoDaTouchBar(entrada())).toEqual({
      mudo: false,
      surdo: false,
      camera: false,
      tela: false,
    });
  });

  it("mudo", () => {
    expect(estadoDaTouchBar(entrada({ muted: true }))).toEqual({
      mudo: true,
      surdo: false,
      camera: false,
      tela: false,
    });
  });

  it("surdo", () => {
    expect(estadoDaTouchBar(entrada({ deafened: true }))).toEqual({
      mudo: false,
      surdo: true,
      camera: false,
      tela: false,
    });
  });

  it("câmera ligada", () => {
    expect(estadoDaTouchBar(entrada({ camOn: true }))).toEqual({
      mudo: false,
      surdo: false,
      camera: true,
      tela: false,
    });
  });

  it("tela ligada", () => {
    expect(estadoDaTouchBar(entrada({ screenOn: true }))).toEqual({
      mudo: false,
      surdo: false,
      camera: false,
      tela: true,
    });
  });

  it("combinação: mudo, câmera e tela juntos", () => {
    expect(
      estadoDaTouchBar(entrada({ muted: true, camOn: true, screenOn: true })),
    ).toEqual({ mudo: true, surdo: false, camera: true, tela: true });
  });

  it("tudo ligado ao mesmo tempo", () => {
    expect(
      estadoDaTouchBar(
        entrada({ muted: true, deafened: true, camOn: true, screenOn: true }),
      ),
    ).toEqual({ mudo: true, surdo: true, camera: true, tela: true });
  });
});
