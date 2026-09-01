import { describe, expect, it } from "vitest";
import { formatarDuracao } from "@/components/voice/cronometro-formato";

describe("formatarDuracao", () => {
  it("começa em 0:00", () => {
    expect(formatarDuracao(0)).toBe("0:00");
  });

  it("mostra segundos com dois dígitos", () => {
    expect(formatarDuracao(9_000)).toBe("0:09");
    expect(formatarDuracao(31_000)).toBe("0:31");
  });

  it("passa para minutos sem zero à esquerda", () => {
    expect(formatarDuracao(61_000)).toBe("1:01");
    expect(formatarDuracao(59 * 60_000 + 59_000)).toBe("59:59");
  });

  it("acrescenta a hora só quando ela existe", () => {
    expect(formatarDuracao(3_600_000)).toBe("1:00:00");
    expect(formatarDuracao(3_723_000)).toBe("1:02:03");
  });

  it("não conta tempo negativo — relógio do sistema pode voltar", () => {
    expect(formatarDuracao(-5_000)).toBe("0:00");
  });
});
