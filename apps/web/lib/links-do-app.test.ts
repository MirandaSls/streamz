import { describe, expect, it } from "vitest";
import { channelLinkPath, messageLinkPath } from "@streamz/shared";
import { urlPublica } from "./links-do-app";

/**
 * O mesmo defeito do link de convite (#129), agora nos três "copiar link":
 * mensagem, canal e tópico montavam a URL com `window.location.origin`, e no
 * app de desktop essa origem é `http://tauri.localhost` — o link copiado só
 * existia dentro da máquina de quem copiou.
 *
 * A regra é a mesma: **a primeira origem da lista ganha**, e a lista põe a
 * pública na frente da janela. Por isso o teste passa as origens à mão: o que
 * está sendo travado é a escolha, não a leitura de `window`.
 */

/** No desktop: a pública configurada primeiro, a do WebView2 depois. */
const NO_DESKTOP = ["https://streamz.chat", "http://tauri.localhost"];
/** Em desenvolvimento não há pública configurada; sobra a da janela. */
const EM_DEV = ["", "http://localhost:3000"];

describe("urlPublica", () => {
  it("usa a origem pública, e não a da janela do desktop", () => {
    expect(urlPublica("/app/channels/g1/c1", NO_DESKTOP)).toBe(
      "https://streamz.chat/app/channels/g1/c1",
    );
  });

  it("sem origem pública cai na da janela — em dev ela é a pública mesmo", () => {
    expect(urlPublica("/app/channels/g1/c1", EM_DEV)).toBe(
      "http://localhost:3000/app/channels/g1/c1",
    );
  });

  it("sem origem nenhuma devolve o caminho, que ainda navega dentro do app", () => {
    expect(urlPublica("/app/channels/g1/c1", [])).toBe("/app/channels/g1/c1");
  });

  it("não duplica nem engole a barra entre origem e caminho", () => {
    expect(urlPublica("app/channels/g1/c1", NO_DESKTOP)).toBe(
      "https://streamz.chat/app/channels/g1/c1",
    );
    expect(urlPublica("/invite/x", NO_DESKTOP)).toBe("https://streamz.chat/invite/x");
  });
});

describe("os três links que se copiam", () => {
  it("link da mensagem", () => {
    expect(urlPublica(messageLinkPath("g1", "c1", "m1"), NO_DESKTOP)).toBe(
      "https://streamz.chat/app/channels/g1/c1/m1",
    );
  });

  it("link do canal", () => {
    expect(urlPublica(channelLinkPath("g1", "c1"), NO_DESKTOP)).toBe(
      "https://streamz.chat/app/channels/g1/c1",
    );
  });

  it("em conversa direta o servidor é `@me`, nos dois", () => {
    expect(urlPublica(messageLinkPath(null, "dm1", "m1"), NO_DESKTOP)).toBe(
      "https://streamz.chat/app/channels/@me/dm1/m1",
    );
    expect(urlPublica(channelLinkPath(null, "dm1"), NO_DESKTOP)).toBe(
      "https://streamz.chat/app/channels/@me/dm1",
    );
  });
});
