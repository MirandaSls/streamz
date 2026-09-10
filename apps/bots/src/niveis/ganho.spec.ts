import { describe, expect, it } from "vitest";
import {
  CARENCIA_PADRAO_MS,
  XP_MAXIMO,
  XP_MINIMO,
  aplicarMensagem,
  cargosConquistados,
  comMultiplicador,
  motivoParaIgnorar,
  passouACarencia,
  xpAleatorio,
} from "./ganho";
import { usuarioVazio } from "./dados";

describe("passouACarencia", () => {
  it("quem nunca ganhou ganha", () => {
    expect(passouACarencia(0, 1_000_000)).toBe(true);
  });

  it("segura dentro da janela e libera exatamente no fim dela", () => {
    const t0 = 1_000_000;
    expect(passouACarencia(t0, t0)).toBe(false);
    expect(passouACarencia(t0, t0 + CARENCIA_PADRAO_MS - 1)).toBe(false);
    expect(passouACarencia(t0, t0 + CARENCIA_PADRAO_MS)).toBe(true);
  });

  it("carimbo no futuro libera em vez de prender", () => {
    // Relógio corrigido para trás (NTP, contêiner migrado): sem esta regra a
    // pessoa ficaria sem XP até o presente alcançar o carimbo.
    expect(passouACarencia(2_000_000, 1_000_000)).toBe(true);
  });
});

describe("xpAleatorio", () => {
  it("respeita as duas pontas da faixa", () => {
    expect(xpAleatorio(() => 0)).toBe(XP_MINIMO);
    expect(xpAleatorio(() => 0.999999)).toBe(XP_MAXIMO);
  });

  it("nunca sai da faixa, sorteio qualquer", () => {
    for (let i = 0; i < 500; i++) {
      const v = xpAleatorio();
      expect(v).toBeGreaterThanOrEqual(XP_MINIMO);
      expect(v).toBeLessThanOrEqual(XP_MAXIMO);
    }
  });
});

describe("comMultiplicador", () => {
  it("dobra, zera e arredonda para baixo", () => {
    expect(comMultiplicador(20, 2)).toBe(40);
    expect(comMultiplicador(20, 0)).toBe(0);
    expect(comMultiplicador(15, 1.5)).toBe(22);
  });
  it("lixo vira 1", () => {
    expect(comMultiplicador(20, Number.NaN)).toBe(20);
  });
});

describe("motivoParaIgnorar", () => {
  const base = { autorEhBot: false, conteudo: "oi", canalId: "c1", prefixo: "!", canaisIgnorados: [] as string[] };

  it("deixa passar conversa comum", () => {
    expect(motivoParaIgnorar(base)).toBe(null);
  });
  it("ignora bot", () => {
    expect(motivoParaIgnorar({ ...base, autorEhBot: true })).toBe("bot");
  });
  it("ignora invocação de comando pelos dois gatilhos", () => {
    expect(motivoParaIgnorar({ ...base, conteudo: "!nivel" })).toBe("comando");
    expect(motivoParaIgnorar({ ...base, conteudo: "  /nivel" })).toBe("comando");
  });
  it("ignora canal marcado", () => {
    expect(motivoParaIgnorar({ ...base, canaisIgnorados: ["c1"] })).toBe("canal-ignorado");
  });
});

describe("aplicarMensagem", () => {
  const config = { multiplicador: 1 };
  const cheio = () => 0.999999; // sempre XP_MAXIMO, para a conta ser exata

  it("a primeira mensagem ganha e marca o relógio", () => {
    const r = aplicarMensagem(usuarioVazio(), config, 1_000, cheio);
    expect(r.ganhou).toBe(true);
    expect(r.xp).toBe(XP_MAXIMO);
    expect(r.usuario.xp).toBe(XP_MAXIMO);
    expect(r.usuario.mensagens).toBe(1);
    expect(r.usuario.ultimoGanhoEm).toBe(1_000);
  });

  it("dentro da carência conta a mensagem e não dá XP", () => {
    const primeira = aplicarMensagem(usuarioVazio(), config, 1_000, cheio);
    const segunda = aplicarMensagem(primeira.usuario, config, 1_500, cheio);
    expect(segunda.ganhou).toBe(false);
    expect(segunda.xp).toBe(0);
    expect(segunda.usuario.xp).toBe(primeira.usuario.xp);
    expect(segunda.usuario.mensagens).toBe(2);
    // o carimbo **não** anda: senão cada mensagem de flood renovaria a janela
    expect(segunda.usuario.ultimoGanhoEm).toBe(1_000);
  });

  it("flood de 30 mensagens em 10 s rende exatamente um ganho", () => {
    let u = usuarioVazio();
    let ganhos = 0;
    for (let i = 0; i < 30; i++) {
      const r = aplicarMensagem(u, config, 1_000 + i * 333, cheio);
      if (r.ganhou) ganhos++;
      u = r.usuario;
    }
    expect(ganhos).toBe(1);
    expect(u.mensagens).toBe(30);
    expect(u.xp).toBe(XP_MAXIMO);
  });

  it("uma mensagem por minuto ganha toda vez", () => {
    let u = usuarioVazio();
    let ganhos = 0;
    for (let i = 0; i < 5; i++) {
      const r = aplicarMensagem(u, config, 1_000 + i * CARENCIA_PADRAO_MS, cheio);
      if (r.ganhou) ganhos++;
      u = r.usuario;
    }
    expect(ganhos).toBe(5);
    expect(u.xp).toBe(5 * XP_MAXIMO);
  });

  it("marca `subiu` só na virada de nível", () => {
    // 100 XP é o limiar do nível 1; com 25 por ganho são 4 ganhos.
    let u = usuarioVazio();
    const subidas: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = aplicarMensagem(u, config, 1_000 + i * CARENCIA_PADRAO_MS, cheio);
      if (r.subiu) subidas.push(r.nivelDepois);
      u = r.usuario;
    }
    expect(subidas).toEqual([1]);
  });

  it("multiplicador 0 conta a mensagem e não credita nada", () => {
    const r = aplicarMensagem(usuarioVazio(), { multiplicador: 0 }, 1_000, cheio);
    expect(r.ganhou).toBe(false);
    expect(r.usuario.xp).toBe(0);
  });
});

describe("cargosConquistados", () => {
  const cargos = [
    { nivel: 1, cargoId: "r1" },
    { nivel: 5, cargoId: "r5" },
    { nivel: 10, cargoId: "r10" },
  ];

  it("entrega o cargo do nível alcançado", () => {
    expect(cargosConquistados(cargos, 0, 1)).toEqual(["r1"]);
  });
  it("um pulo grande entrega todos os do caminho", () => {
    expect(cargosConquistados(cargos, 0, 10)).toEqual(["r1", "r5", "r10"]);
  });
  it("sem virada, nada", () => {
    expect(cargosConquistados(cargos, 5, 5)).toEqual([]);
  });
  it("não repete cargo configurado duas vezes", () => {
    const repetido = [
      { nivel: 2, cargoId: "r" },
      { nivel: 3, cargoId: "r" },
    ];
    expect(cargosConquistados(repetido, 1, 3)).toEqual(["r"]);
  });
});
