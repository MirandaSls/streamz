import { describe, expect, it } from "vitest";
import {
  achatarPayloadDeBot,
  conferirMensagemDeBot,
  contarComponentes,
  resolverAnexosDoPayload,
  textoAchatadoDaMensagem,
  validarModalDeBot,
  validarPayloadDeBot,
  type ComponenteDeMensagem,
} from "@streamz/shared";
import { achatarEmbeds, errosNoFormatoDoDiscord, lerPayloadDeBot } from "./embed";

/**
 * O achatamento do embed. Deixou de ser a forma de guardar na onda 3 (o embed
 * é guardado e desenhado), mas segue servindo à busca, à prévia e ao trecho de
 * resposta — lugares sem renderizador.
 */
describe("achatarEmbeds", () => {
  it("põe título, descrição, campos e rodapé na ordem em que o Discord desenha", () => {
    expect(
      achatarEmbeds([
        {
          title: "Nível 5",
          description: "Parabéns!",
          fields: [
            { name: "XP", value: "1200" },
            { name: "Posição", value: "3º" },
          ],
          footer: { text: "bot de níveis" },
        },
      ]),
    ).toBe("**Nível 5**\nParabéns!\n**XP**: 1200\n**Posição**: 3º\nbot de níveis");
  });

  it("título com `url` vira link markdown — o composer do Streamz já o entende", () => {
    expect(achatarEmbeds([{ title: "Ouvir", url: "https://exemplo.invalido/x" }])).toBe(
      "[Ouvir](https://exemplo.invalido/x)",
    );
  });

  it("a imagem sai como URL, para o preview de link mostrá-la", () => {
    expect(achatarEmbeds([{ image: { url: "https://exemplo.invalido/a.png" } }])).toBe(
      "https://exemplo.invalido/a.png",
    );
  });

  it("embed vazio, nulo ou que não é objeto não vira texto nenhum", () => {
    expect(achatarEmbeds([{}, null, "isto não é embed", 7])).toBe("");
  });

  it("corta no teto da mensagem em vez de deixar o banco recusar", () => {
    const gigante = achatarEmbeds([{ description: "a".repeat(5000) }]);
    expect(gigante.length).toBe(2000);
  });
});

// ── onda 3: validação no formato do Discord ──────────────────

const V2 = 1 << 15;
const botao = (custom_id: string, extra: Record<string, unknown> = {}) => ({
  type: 2,
  style: 1,
  label: custom_id,
  custom_id,
  ...extra,
});

describe("validarPayloadDeBot + conferirMensagemDeBot", () => {
  const conferir = (corpo: Record<string, unknown>) => {
    const r = validarPayloadDeBot(corpo);
    if (!r.ok) return r.erros.map((e) => e.codigo);
    return conferirMensagemDeBot({
      content: r.payload.content ?? "",
      embeds: r.payload.embeds ?? [],
      components: r.payload.components ?? [],
      flags: r.payload.flags ?? 0,
    }).map((e) => e.codigo);
  };

  it("aceita o embed completo do Discord e o normaliza", () => {
    const r = validarPayloadDeBot({
      embeds: [
        {
          title: " Status ",
          url: "https://exemplo.invalido",
          description: "tudo **ok**",
          color: 0x9be31f,
          timestamp: "2026-09-10T15:30:00-03:00",
          author: { name: "Pixel", icon_url: "https://exemplo.invalido/a.png", proxy_icon_url: "forjado" },
          footer: { text: "rodapé" },
          image: { url: "https://exemplo.invalido/i.png", width: 999 },
          fields: [{ name: "a", value: "1", inline: true }],
        },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [e] = r.payload.embeds ?? [];
    expect(e).toMatchObject({ type: "rich", title: "Status", timestamp: "2026-09-10T18:30:00.000Z" });
    // o que só o servidor preenche não passa
    expect(e?.author).toEqual({ name: "Pixel", icon_url: "https://exemplo.invalido/a.png" });
    expect(e?.image).toEqual({ url: "https://exemplo.invalido/i.png" });
  });

  it("limites de embed: 10 embeds, 25 campos, 6000 caracteres somados", () => {
    expect(conferir({ embeds: Array.from({ length: 11 }, () => ({ title: "x" })) })).toContain("BASE_TYPE_BAD_LENGTH");
    expect(
      conferir({ embeds: [{ fields: Array.from({ length: 26 }, () => ({ name: "a", value: "b" })) }] }),
    ).toContain("BASE_TYPE_BAD_LENGTH");
    expect(
      conferir({ embeds: [{ description: "a".repeat(4000) }, { description: "b".repeat(2001) }] }),
    ).toContain("MAX_EMBED_SIZE_EXCEEDED");
  });

  it("legado: até 5 action rows, 5 botões por row, select sozinho", () => {
    const row = { type: 1, components: [botao("a")] };
    expect(conferir({ components: Array.from({ length: 6 }, (_, i) => ({ type: 1, components: [botao(`b${i}`)] })) })).toContain(
      "BASE_TYPE_BAD_LENGTH",
    );
    expect(conferir({ components: [{ type: 1, components: Array.from({ length: 6 }, (_, i) => botao(`c${i}`)) }] })).toContain(
      "BASE_TYPE_BAD_LENGTH",
    );
    expect(
      conferir({
        components: [
          { type: 1, components: [botao("d"), { type: 3, custom_id: "s", options: [{ label: "x", value: "x" }] }] },
        ],
      }),
    ).toContain("COMPONENT_LAYOUT_WIDTH_EXCEEDED");
    expect(conferir({ components: [row] })).toEqual([]);
  });

  it("componente v2 sem a flag é recusado", () => {
    expect(conferir({ components: [{ type: 10, content: "oi" }] })).toContain(
      "COMPONENT_LAYOUT_REQUIRES_COMPONENTS_V2",
    );
  });

  it("IS_COMPONENTS_V2: sem content e sem embeds, até 40 componentes", () => {
    expect(conferir({ flags: V2, content: "x", components: [{ type: 10, content: "oi" }] })).toContain(
      "MESSAGE_CANNOT_USE_LEGACY_FIELDS_WITH_COMPONENTS_V2",
    );
    expect(conferir({ flags: V2, embeds: [{ title: "x" }], components: [{ type: 10, content: "oi" }] })).toContain(
      "MESSAGE_CANNOT_USE_LEGACY_FIELDS_WITH_COMPONENTS_V2",
    );
    const muitos = Array.from({ length: 41 }, (_, i) => ({ type: 10, content: `t${i}` }));
    expect(conferir({ flags: V2, components: muitos })).toContain("COMPONENT_LAYOUT_TOO_MANY_COMPONENTS");
  });

  it("botão: estilo decide custom_id/url; custom_id não se repete", () => {
    expect(conferir({ components: [{ type: 1, components: [{ type: 2, style: 1, label: "x" }] }] })).toContain(
      "BUTTON_COMPONENT_CUSTOM_ID_REQUIRED",
    );
    expect(
      conferir({ components: [{ type: 1, components: [{ type: 2, style: 5, label: "x", custom_id: "y", url: "https://a.b" }] }] }),
    ).toContain("BUTTON_COMPONENT_LINK_HAS_CUSTOM_ID");
    expect(conferir({ components: [{ type: 1, components: [botao("igual"), botao("igual")] }] })).toContain(
      "COMPONENT_CUSTOM_ID_DUPLICATED",
    );
  });

  it("select de texto: até 25 opções e max_values ≤ opções", () => {
    const opcoes = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `${i}`, value: `${i}` }));
    expect(conferir({ components: [{ type: 1, components: [{ type: 3, custom_id: "s", options: opcoes(26) }] }] })).toContain(
      "BASE_TYPE_BAD_LENGTH",
    );
    expect(
      conferir({ components: [{ type: 1, components: [{ type: 3, custom_id: "s", options: opcoes(2), max_values: 3 }] }] }),
    ).toContain("SELECT_COMPONENT_MAX_VALUES_EXCEEDS_OPTIONS");
  });

  it("File só aceita attachment://", () => {
    expect(conferir({ flags: V2, components: [{ type: 13, file: { url: "https://a.b/x.pdf" } }] })).toContain(
      "UNFURLED_MEDIA_ITEM_ATTACHMENT_REQUIRED",
    );
    expect(conferir({ flags: V2, components: [{ type: 13, file: { url: "attachment://x.pdf" } }] })).toEqual([]);
  });

  it("mensagem vazia é recusada", () => {
    expect(conferir({})).toContain("BASE_TYPE_REQUIRED");
  });

  it("dá id sequencial a quem não tem, sem repetir o id que o bot escolheu", () => {
    const r = validarPayloadDeBot({
      flags: V2,
      components: [
        { type: 17, id: 2, components: [{ type: 10, content: "a" }, { type: 14 }] },
        { type: 10, content: "b" },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [container, texto] = r.payload.components as ComponenteDeMensagem[];
    expect(container?.id).toBe(2);
    expect(container?.type === 17 && container.components.map((c) => c.id)).toEqual([1, 3]);
    expect(texto?.id).toBe(4);
    expect(contarComponentes(r.payload.components ?? [])).toBe(4);
  });
});

describe("errosNoFormatoDoDiscord", () => {
  it("aninha o caminho como o 50035 do Discord", () => {
    expect(
      errosNoFormatoDoDiscord([
        { caminho: ["embeds", 0, "title"], codigo: "BASE_TYPE_MAX_LENGTH", mensagem: "longo" },
        { caminho: ["embeds", 0, "title"], codigo: "OUTRO", mensagem: "de novo" },
      ]),
    ).toEqual({
      embeds: {
        "0": {
          title: {
            _errors: [
              { code: "BASE_TYPE_MAX_LENGTH", message: "longo" },
              { code: "OUTRO", message: "de novo" },
            ],
          },
        },
      },
    });
  });

  it("lerPayloadDeBot: ausente continua ausente (a semântica do PATCH)", () => {
    const r = lerPayloadDeBot({ content: "só texto" });
    expect(r).toEqual({ ok: true, payload: { content: "só texto" } });
  });
});

describe("modal de bot", () => {
  it("aceita Label com text input e recusa componente desabilitado", () => {
    const valido = validarModalDeBot({
      custom_id: "m",
      title: "Relatar",
      components: [
        { type: 18, label: "O que houve?", component: { type: 4, custom_id: "t", style: 2 } },
      ],
    });
    expect(valido.ok).toBe(true);
    const desabilitado = validarModalDeBot({
      custom_id: "m",
      title: "Relatar",
      components: [
        {
          type: 18,
          label: "Canal",
          component: { type: 8, custom_id: "c", disabled: true },
        },
      ],
    });
    expect(desabilitado.ok).toBe(false);
  });

  it("título acima de 45 caracteres é recusado", () => {
    expect(
      validarModalDeBot({
        custom_id: "m",
        title: "x".repeat(46),
        components: [{ type: 10, content: "oi" }],
      }).ok,
    ).toBe(false);
  });
});

describe("texto achatado e anexos", () => {
  it("achatarPayloadDeBot junta content, embeds e text displays", () => {
    expect(
      achatarPayloadDeBot({
        content: "oi",
        embeds: [{ title: "T" }],
        components: [{ type: 17, components: [{ type: 10, content: "dentro" }] }],
      }),
    ).toBe("oi\n**T**\ndentro");
  });

  it("textoAchatadoDaMensagem devolve o content de mensagem sem nada de bot", () => {
    expect(textoAchatadoDaMensagem({ content: "normal" })).toBe("normal");
    expect(textoAchatadoDaMensagem({ content: "", embeds: [{ description: "d" }] })).toBe("d");
  });

  it("resolverAnexosDoPayload troca attachment:// pela URL do anexo", () => {
    const anexo = {
      id: "a1",
      filename: "x.pdf",
      url: "https://r2/x.pdf?assinado",
      contentType: "application/pdf",
      size: 10,
      width: null,
      height: null,
    };
    const { components, embeds } = resolverAnexosDoPayload(
      [{ image: { url: "attachment://x.pdf" } }],
      [{ type: 13, id: 1, file: { url: "attachment://x.pdf" } }],
      [anexo],
    );
    expect(embeds[0]?.image?.url).toBe("https://r2/x.pdf?assinado");
    expect(components[0]).toMatchObject({
      file: { url: "https://r2/x.pdf?assinado", attachment_id: "a1" },
      name: "x.pdf",
      size: 10,
    });
  });
});
