import { describe, expect, it, vi } from "vitest";
import {
  acaoDoBotaoDeTela,
  ehFonteDeTela,
  encerrarFaixas,
  inicioAindaVale,
} from "./parar-transmissao";

describe("acaoDoBotaoDeTela", () => {
  const base = { noAr: false, tauri: false, nativo: null, navegadorCaptura: true } as const;

  it("no ar, sempre para — mesmo num aparelho que não captura", () => {
    expect(acaoDoBotaoDeTela({ ...base, noAr: true, navegadorCaptura: false })).toBe("parar");
    expect(acaoDoBotaoDeTela({ ...base, noAr: true, tauri: true, nativo: true })).toBe("parar");
    expect(acaoDoBotaoDeTela({ ...base, noAr: true, tauri: true, nativo: false })).toBe("parar");
  });

  it("desktop com captura nativa (ou ainda sem resposta) abre o seletor", () => {
    expect(acaoDoBotaoDeTela({ ...base, tauri: true, nativo: true })).toBe("seletor-nativo");
    expect(acaoDoBotaoDeTela({ ...base, tauri: true, nativo: null })).toBe("seletor-nativo");
  });

  it("desktop sem captura nativa (Mac/Linux) usa o getDisplayMedia do webview", () => {
    expect(acaoDoBotaoDeTela({ ...base, tauri: true, nativo: false })).toBe("navegador");
    expect(
      acaoDoBotaoDeTela({ ...base, tauri: true, nativo: false, navegadorCaptura: false }),
    ).toBe("indisponivel");
  });

  it("navegador captura direto, ou diz que não dá", () => {
    expect(acaoDoBotaoDeTela(base)).toBe("navegador");
    expect(acaoDoBotaoDeTela({ ...base, navegadorCaptura: false })).toBe("indisponivel");
  });
});

describe("inicioAindaVale", () => {
  it("vale quando nada mudou", () => {
    expect(inicioAindaVale({ geracao: 3, canal: "c1", geracaoAgora: 3, canalAgora: "c1" })).toBe(
      true,
    );
  });

  it("parar ou sair durante o início invalida (geração mudou)", () => {
    expect(inicioAindaVale({ geracao: 3, canal: "c1", geracaoAgora: 4, canalAgora: "c1" })).toBe(
      false,
    );
  });

  it("sair da chamada ou trocar de canal invalida", () => {
    expect(inicioAindaVale({ geracao: 3, canal: "c1", geracaoAgora: 3, canalAgora: null })).toBe(
      false,
    );
    expect(inicioAindaVale({ geracao: 3, canal: "c1", geracaoAgora: 3, canalAgora: "c2" })).toBe(
      false,
    );
    expect(inicioAindaVale({ geracao: 3, canal: null, geracaoAgora: 3, canalAgora: null })).toBe(
      false,
    );
  });
});

describe("encerrarFaixas", () => {
  const faixa = (readyState: string) => ({ readyState, stop: vi.fn() });

  it("para todas as vivas, inclusive o som que não foi publicado", () => {
    const video = faixa("live");
    const som = faixa("live");
    expect(encerrarFaixas([video, som])).toBe(2);
    expect(video.stop).toHaveBeenCalledOnce();
    expect(som.stop).toHaveBeenCalledOnce();
  });

  it("não mexe nas já encerradas e não propaga erro de stop", () => {
    const morta = faixa("ended");
    const teimosa = {
      readyState: "live",
      stop: vi.fn(() => {
        throw new Error("x");
      }),
    };
    expect(encerrarFaixas([morta, teimosa])).toBe(1);
    expect(morta.stop).not.toHaveBeenCalled();
  });
});

describe("ehFonteDeTela", () => {
  const fontes = { tela: "screen_share", somDaTela: "screen_share_audio" };
  it("vídeo e som da tela, e nada mais", () => {
    expect(ehFonteDeTela("screen_share", fontes)).toBe(true);
    expect(ehFonteDeTela("screen_share_audio", fontes)).toBe(true);
    expect(ehFonteDeTela("camera", fontes)).toBe(false);
    expect(ehFonteDeTela("microphone", fontes)).toBe(false);
  });
});
