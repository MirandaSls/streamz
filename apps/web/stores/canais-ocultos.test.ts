import { beforeEach, describe, expect, it } from "vitest";
import { useCanaisOcultos } from "./canais-ocultos";

beforeEach(() => {
  useCanaisOcultos.setState({ porServidor: {} });
});

describe("useCanaisOcultos", () => {
  it("começa desligado para um servidor que nunca foi tocado", () => {
    expect(useCanaisOcultos.getState().ocultarSilenciados("g1")).toBe(false);
  });

  it("alternar liga, e um segundo alternar desliga de novo", () => {
    const { alternar, ocultarSilenciados } = useCanaisOcultos.getState();
    alternar("g1");
    expect(ocultarSilenciados("g1")).toBe(true);
    alternar("g1");
    expect(ocultarSilenciados("g1")).toBe(false);
  });

  it("é por servidor: ligar um não liga o outro", () => {
    const { alternar, ocultarSilenciados } = useCanaisOcultos.getState();
    alternar("g1");
    expect(ocultarSilenciados("g1")).toBe(true);
    expect(ocultarSilenciados("g2")).toBe(false);
  });
});
