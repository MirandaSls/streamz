import { describe, expect, it } from "vitest";
import { ADMINISTRADOR, avaliar, avaliarSemAlvo, nomeDaPermissao, temPermissao, type Retrato } from "./hierarquia";

const BANIR = 1n << 2n;
const MODERAR = 1n << 40n;

function retrato(parcial: Partial<Retrato> & { id: string }): Retrato {
  return {
    nome: parcial.id,
    ehDono: false,
    posicaoMaisAlta: 0,
    permissoes: 0n,
    ...parcial,
  };
}

const EU = retrato({ id: "bot", nome: "Streamz Moderação", posicaoMaisAlta: 50 });

function cena(ator: Partial<Retrato>, alvo: Partial<Retrato>, bot: Partial<Retrato> = {}) {
  return avaliar({
    ator: retrato({ id: "ator", permissoes: BANIR, posicaoMaisAlta: 10, ...ator }),
    alvo: retrato({ id: "alvo", posicaoMaisAlta: 5, ...alvo }),
    bot: { ...EU, ...bot },
    exigida: BANIR,
    acao: "banir",
  });
}

describe("temPermissao", () => {
  it("o administrador tem tudo", () => {
    expect(temPermissao(ADMINISTRADOR, MODERAR)).toBe(true);
    expect(temPermissao(0n, MODERAR)).toBe(false);
    expect(temPermissao(MODERAR, MODERAR)).toBe(true);
  });
});

describe("as seis linhas, na ordem", () => {
  it("1. sem a permissão, a recusa nomeia a permissão que falta", () => {
    const v = cena({ permissoes: 0n }, {});
    expect(v).toMatchObject({ pode: false, motivo: "semPermissao" });
    if (!v.pode) expect(v.frase).toContain(nomeDaPermissao(BANIR));
  });

  it("2. ninguém modera a si mesmo, nem com todas as permissões", () => {
    const v = cena({ id: "mesmo", permissoes: ADMINISTRADOR }, { id: "mesmo" });
    expect(v).toMatchObject({ pode: false, motivo: "simesmo" });
  });

  it("3. ninguém manda o bot se moderar", () => {
    // Sem esta linha, `/banir @Streamz Moderação` é o bot saindo do servidor a
    // pedido de qualquer um que tenha a permissão.
    const v = cena({ permissoes: ADMINISTRADOR }, { id: "bot" });
    expect(v).toMatchObject({ pode: false, motivo: "euMesmo" });
  });

  it("4. nem o administrador modera o dono", () => {
    const v = cena({ permissoes: ADMINISTRADOR, posicaoMaisAlta: 99 }, { ehDono: true, posicaoMaisAlta: 0 });
    expect(v).toMatchObject({ pode: false, motivo: "oDono" });
  });

  it("5. cargo igual não modera cargo igual", () => {
    expect(cena({ posicaoMaisAlta: 5 }, { posicaoMaisAlta: 5 })).toMatchObject({
      pode: false,
      motivo: "hierarquiaDoAtor",
    });
    expect(cena({ posicaoMaisAlta: 4 }, { posicaoMaisAlta: 5 })).toMatchObject({
      pode: false,
      motivo: "hierarquiaDoAtor",
    });
    expect(cena({ posicaoMaisAlta: 6 }, { posicaoMaisAlta: 5 })).toEqual({ pode: true });
  });

  it("5b. ADMINISTRATOR dá a permissão, não a hierarquia", () => {
    // É a regra do Discord, e o contrário significaria que qualquer
    // administrador pode banir todos os outros administradores.
    expect(cena({ permissoes: ADMINISTRADOR, posicaoMaisAlta: 3 }, { posicaoMaisAlta: 8 })).toMatchObject({
      pode: false,
      motivo: "hierarquiaDoAtor",
    });
  });

  it("5c. o dono passa por cima da hierarquia — e só ele", () => {
    // O bot precisa estar acima do alvo mesmo assim: o dono manda em quem quiser,
    // mas quem executa é o bot, e a linha 6 continua valendo (é o próximo teste).
    expect(
      cena({ ehDono: true, posicaoMaisAlta: 0 }, { posicaoMaisAlta: 99 }, { posicaoMaisAlta: 100 }),
    ).toEqual({ pode: true });
  });

  it("6. o bot também obedece à hierarquia, e a frase diz o que fazer", () => {
    const v = cena({ posicaoMaisAlta: 90 }, { posicaoMaisAlta: 80 }, { posicaoMaisAlta: 10 });
    expect(v).toMatchObject({ pode: false, motivo: "hierarquiaDoBot" });
    if (!v.pode) expect(v.frase).toMatch(/suba o meu cargo/i);
  });

  it("a ordem importa: sem permissão vence tudo o que vem depois", () => {
    // Se a ordem invertesse, quem não tem permissão nenhuma leria "esse é o
    // dono" e tentaria de novo em outra pessoa, achando que o problema era o
    // alvo.
    const v = cena({ permissoes: 0n }, { ehDono: true });
    expect(v).toMatchObject({ pode: false, motivo: "semPermissao" });
  });
});

describe("avaliarSemAlvo", () => {
  it("só olha a permissão de quem chamou", () => {
    expect(avaliarSemAlvo(retrato({ id: "a", permissoes: BANIR }), BANIR, "banir")).toEqual({ pode: true });
    const v = avaliarSemAlvo(retrato({ id: "a" }), BANIR, "banir");
    expect(v).toMatchObject({ pode: false, motivo: "semPermissao" });
  });
});
