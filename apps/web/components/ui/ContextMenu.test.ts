import { describe, expect, it } from "vitest";
import { useUI, type MenuItem } from "@/stores/ui";
import {
  gestoDeRolagemRecente,
  marcaExibida,
  podarMarcas,
  posicaoDoBalao,
  type MarcaOtimista,
} from "./ContextMenu";

describe("gestoDeRolagemRecente", () => {
  it("sem gesto nenhum (null), nunca vale como rolagem de verdade", () => {
    expect(gestoDeRolagemRecente(null, 1_000)).toBe(false);
  });

  it("gesto dentro da janela vale — é a roda do mouse ou o dedo que rolou", () => {
    expect(gestoDeRolagemRecente(1_000, 1_050)).toBe(true);
    // na borda exata da janela (150ms) ainda conta
    expect(gestoDeRolagemRecente(1_000, 1_150)).toBe(true);
  });

  it("gesto fora da janela não vale — é o bug: scroll sem ninguém tocar nada", () => {
    // era exatamente este caso: a lista de canais muda de altura sozinha
    // (participante de voz entrando/saindo) e o navegador clampa/reancora o
    // scrollTop, disparando um `scroll` sem nenhum gesto recente
    expect(gestoDeRolagemRecente(1_000, 1_151)).toBe(false);
    expect(gestoDeRolagemRecente(1_000, 5_000)).toBe(false);
  });

  it("janela custom é respeitada", () => {
    expect(gestoDeRolagemRecente(1_000, 1_300, 500)).toBe(true);
    expect(gestoDeRolagemRecente(1_000, 1_600, 500)).toBe(false);
  });
});

describe("posicaoDoBalao", () => {
  // trilho de 196 (menu de 220 menos padding), balão de 52, folga de 12
  const TRILHO = 196;

  it("a seta acompanha o centro do polegar, que anda a largura menos o polegar", () => {
    expect(posicaoDoBalao(0, TRILHO, 52, 12).centro).toBe(8);
    expect(posicaoDoBalao(0.5, TRILHO, 52, 12).centro).toBe(98);
    expect(posicaoDoBalao(1, TRILHO, 52, 12).centro).toBe(188);
  });

  it("no meio o balão fica centrado no polegar", () => {
    expect(posicaoDoBalao(0.5, TRILHO, 52, 12).esquerda).toBe(98 - 26);
  });

  it("nas pontas o balão é preso à folga e não sai do menu", () => {
    expect(posicaoDoBalao(0, TRILHO, 52, 12).esquerda).toBe(-12);
    expect(posicaoDoBalao(1, TRILHO, 52, 12).esquerda).toBe(TRILHO + 12 - 52);
    for (let f = 0; f <= 1; f += 0.05) {
      const { esquerda } = posicaoDoBalao(f, TRILHO, 52, 12);
      expect(esquerda).toBeGreaterThanOrEqual(-12);
      expect(esquerda + 52).toBeLessThanOrEqual(TRILHO + 12);
    }
  });

  it("fração fora de 0..1 (valor fora da faixa) não empurra o balão para fora", () => {
    expect(posicaoDoBalao(-1, TRILHO, 52, 12)).toEqual(posicaoDoBalao(0, TRILHO, 52, 12));
    expect(posicaoDoBalao(2, TRILHO, 52, 12)).toEqual(posicaoDoBalao(1, TRILHO, 52, 12));
  });
});

describe("marca otimista dos interruptores que não fecham o menu", () => {
  it("sem marca, a caixa mostra a verdade", () => {
    expect(marcaExibida(false, undefined)).toBe(false);
    expect(marcaExibida(true, undefined)).toBe(true);
  });

  it("logo depois do clique, a caixa mostra o valor pedido, antes da verdade voltar", () => {
    expect(marcaExibida(false, { valor: true, base: false })).toBe(true);
  });

  it("quando a verdade muda, ela assume sozinha", () => {
    expect(marcaExibida(true, { valor: true, base: false })).toBe(true);
    // o servidor recusou e outro evento trouxe a verdade de volta: vale a verdade
    expect(marcaExibida(true, { valor: false, base: false })).toBe(true);
  });

  const item = (label: string, checked: boolean): MenuItem => ({
    label,
    onSelect: () => {},
    control: "checkbox",
    checked,
    manterAberto: true,
  });

  it("a marca sai quando a verdade muda, para não voltar a valer depois", () => {
    const marca: MarcaOtimista = { valor: true, base: false };
    const marcas = { "Silenciar voz no servidor": marca };
    // a verdade ainda não chegou: a marca fica (e o objeto é o mesmo)
    expect(podarMarcas(marcas, [item("Silenciar voz no servidor", false)])).toBe(marcas);
    // chegou: sai
    expect(podarMarcas(marcas, [item("Silenciar voz no servidor", true)])).toEqual({});
  });

  it("a marca de um item que sumiu da lista também sai", () => {
    const marcas = { Silenciar: { valor: true, base: false } };
    expect(podarMarcas(marcas, [item("Outro", false)])).toEqual({});
  });
});

describe("menu vivo", () => {
  it("remontar troca a lista sem trocar o id; abrir outro menu troca", () => {
    let silenciado = false;
    const vivo = {
      montar: (): MenuItem[] => [
        { label: "Silenciar", onSelect: () => {}, control: "checkbox", checked: silenciado },
      ],
      assinar: () => () => {},
    };
    useUI.getState().abrirMenuVivo(10, 20, vivo);
    const aberto = useUI.getState().contextMenu!;
    expect(aberto.items[0]).toMatchObject({ checked: false });

    silenciado = true;
    useUI.getState().atualizarMenuVivo();
    const remontado = useUI.getState().contextMenu!;
    expect(remontado.id).toBe(aberto.id);
    expect(remontado.items[0]).toMatchObject({ checked: true });

    useUI.getState().openContextMenu(0, 0, []);
    expect(useUI.getState().contextMenu!.id).not.toBe(aberto.id);
    // o menu comum não se remonta: atualizar não mexe nele
    const comum = useUI.getState().contextMenu;
    useUI.getState().atualizarMenuVivo();
    expect(useUI.getState().contextMenu).toBe(comum);
    useUI.getState().closeContextMenu();
  });
});
