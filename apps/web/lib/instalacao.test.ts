import { describe, expect, it } from "vitest";

import {
  avisoDeInstalacao,
  deveRegistrarServiceWorker,
  ehIOS,
  ehSafari,
  type AmbienteDeInstalacao,
} from "./instalacao";

/**
 * O aviso "Adicionar à tela de início" é a única peça deste trabalho que pode
 * aparecer **onde não devia** — dentro do app de desktop, dentro do próprio
 * app já instalado, ou de novo depois de a pessoa ter dito "agora não". Nada
 * disso é pego por typecheck, por lint, nem por olhar a tela: são estados de
 * ambiente que ninguém reproduz num render.
 *
 * Por isso a decisão inteira é uma função de sete booleanos, e a tabela dela
 * está aqui.
 */

/** O caso base é um Android em Chrome, no celular, com o evento na mão. */
const ANDROID: AmbienteDeInstalacao = {
  ehTauri: false,
  ehMobile: true,
  jaInstalado: false,
  ehIOS: false,
  ehSafari: false,
  temPedidoDoChrome: true,
  dispensado: false,
};

/** iPhone em Safari: sem `beforeinstallprompt`, com instrução. */
const IPHONE: AmbienteDeInstalacao = {
  ...ANDROID,
  ehIOS: true,
  ehSafari: true,
  temPedidoDoChrome: false,
};

describe("qual aviso de instalação mostrar", () => {
  it("Android com o evento do Chrome: banner com botão que instala", () => {
    expect(avisoDeInstalacao(ANDROID)).toBe("chrome");
  });

  it("Android sem o evento: nenhum aviso", () => {
    // Sem o `beforeinstallprompt` guardado não há o que o botão chame — um
    // banner aqui prometeria o que não cumpre.
    expect(avisoDeInstalacao({ ...ANDROID, temPedidoDoChrome: false })).toBeNull();
  });

  it("iPhone em Safari: instrução, porque o Safari nunca emite o evento", () => {
    expect(avisoDeInstalacao(IPHONE)).toBe("ios");
  });

  it("iPhone em Chrome/Firefox: nenhum aviso", () => {
    // O menu de compartilhar do Chrome do iOS não tem "Adicionar à Tela de
    // Início"; a instrução seria mentira.
    expect(avisoDeInstalacao({ ...IPHONE, ehSafari: false })).toBeNull();
  });

  it("dentro do app de desktop: nunca, nem com evento nem no iOS", () => {
    // O Tauri embute esta mesma web. Oferecer "instalar o app" a quem já
    // instalou o app é o pior caso possível.
    expect(avisoDeInstalacao({ ...ANDROID, ehTauri: true })).toBeNull();
    expect(avisoDeInstalacao({ ...IPHONE, ehTauri: true })).toBeNull();
  });

  it("já instalado (aberto pelo ícone): nunca", () => {
    expect(avisoDeInstalacao({ ...ANDROID, jaInstalado: true })).toBeNull();
    expect(avisoDeInstalacao({ ...IPHONE, jaInstalado: true })).toBeNull();
  });

  it("dispensado: nunca mais, nos dois sistemas", () => {
    // "Agora não" vale para sempre neste aparelho, e não até o próximo F5.
    expect(avisoDeInstalacao({ ...ANDROID, dispensado: true })).toBeNull();
    expect(avisoDeInstalacao({ ...IPHONE, dispensado: true })).toBeNull();
  });

  it("no computador: nenhum aviso, mesmo com o evento do Chrome", () => {
    // Lá a resposta é o app de desktop de verdade (`/download`).
    expect(avisoDeInstalacao({ ...ANDROID, ehMobile: false })).toBeNull();
    expect(avisoDeInstalacao({ ...IPHONE, ehMobile: false })).toBeNull();
  });
});

describe("reconhecer o aparelho", () => {
  const SAFARI_IPHONE =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
  const CHROME_IPHONE =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1";
  const CHROME_ANDROID =
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
  const SAFARI_IPAD =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

  it("iPhone é iOS", () => {
    expect(ehIOS(SAFARI_IPHONE, "iPhone", 5)).toBe(true);
  });

  it("iPad que se declara Macintosh é iOS pelo toque", () => {
    // Desde o iPadOS 13 o `userAgent` do iPad é o de um Mac; só o
    // `maxTouchPoints` desmente. Sem isto o iPad ficaria sem aviso nenhum.
    expect(ehIOS(SAFARI_IPAD, "MacIntel", 5)).toBe(true);
    // e um Mac de verdade continua não sendo iOS
    expect(ehIOS(SAFARI_IPAD, "MacIntel", 0)).toBe(false);
  });

  it("Android não é iOS", () => {
    expect(ehIOS(CHROME_ANDROID, "Linux armv8l", 5)).toBe(false);
  });

  it("Safari do iPhone é Safari; Chrome do iPhone não é", () => {
    // Os dois trazem `Safari/604.1` no fim — o que separa é o `CriOS`.
    expect(ehSafari(SAFARI_IPHONE)).toBe(true);
    expect(ehSafari(CHROME_IPHONE)).toBe(false);
  });

  it("Chrome do Android não é Safari", () => {
    // Também traz `Safari/537.36`, e também não é.
    expect(ehSafari(CHROME_ANDROID)).toBe(false);
  });
});

describe("registrar o service worker", () => {
  it("registra na web em produção", () => {
    expect(
      deveRegistrarServiceWorker({ ehTauri: false, producao: true, temSuporte: true }),
    ).toBe(true);
  });

  it("nunca dentro do Tauri", () => {
    // O conteúdo do desktop não vem de uma origem `http(s)`; um SW ali seria
    // uma segunda camada de cache sobre arquivos que já estão em disco.
    expect(
      deveRegistrarServiceWorker({ ehTauri: true, producao: true, temSuporte: true }),
    ).toBe(false);
  });

  it("nunca em desenvolvimento", () => {
    expect(
      deveRegistrarServiceWorker({ ehTauri: false, producao: false, temSuporte: true }),
    ).toBe(false);
  });

  it("nunca onde o navegador não tem a API", () => {
    expect(
      deveRegistrarServiceWorker({ ehTauri: false, producao: true, temSuporte: false }),
    ).toBe(false);
  });
});
