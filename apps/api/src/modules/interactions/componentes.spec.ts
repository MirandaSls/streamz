import { describe, expect, it } from "vitest";
import type { ComponenteDeMensagem, ModalDeBot, OpcaoDeComando } from "@streamz/shared";
import {
  acharComponenteInterativo,
  arquivoAceito,
  callbackPermitido,
  conferirClique,
  conferirEnvioDoModal,
  conferirPedidoDeAutocomplete,
  ehInteracaoDeComponente,
} from "./componentes";

/**
 * ── onda 3 · cartão 3a ── As regras puras das interações de componente.
 *
 * O que estes testes protegem, em ordem de quanto custa errar:
 *
 * 1. **Componente desabilitado, de link ou que a mensagem não tem não gera
 *    interação.** A tela não deixa clicar, mas o pedido é forjável: sem a
 *    recusa aqui, o bot receberia um clique num botão que ele desligou.
 * 2. **O envio do modal é montado a partir do modal gravado**, não do que a web
 *    mandou: campo que o bot não declarou nunca chega a ele.
 * 3. **A tabela de callbacks por tipo de interação** — `update()` num comando de
 *    barra e `showModal()` num envio de modal são defeitos que o Discord recusa.
 */

// ── a mensagem de mentira ────────────────────────────────────

const COMPONENTES: ComponenteDeMensagem[] = [
  {
    type: 1,
    id: 1,
    components: [
      { type: 2, id: 2, style: 1, label: "Tocar", custom_id: "tocar" },
      { type: 2, id: 3, style: 4, label: "Parar", custom_id: "parar", disabled: true },
      { type: 2, id: 4, style: 5, label: "Site", url: "https://exemplo.com" },
    ],
  },
  {
    type: 1,
    id: 5,
    components: [
      {
        type: 3,
        id: 6,
        custom_id: "genero",
        min_values: 1,
        max_values: 2,
        options: [
          { label: "Rock", value: "rock" },
          { label: "Jazz", value: "jazz" },
          { label: "Samba", value: "samba" },
        ],
      },
    ],
  },
  {
    type: 17,
    id: 7,
    components: [
      {
        type: 9,
        id: 8,
        components: [{ type: 10, id: 9, content: "Faixa atual" }],
        accessory: { type: 2, id: 10, style: 2, label: "Pular", custom_id: "pular" },
      },
      { type: 1, id: 11, components: [{ type: 5, id: 12, custom_id: "quem" }] },
    ],
  },
];

describe("acharComponenteInterativo", () => {
  it("acha em action row, no acessório de section e dentro de container", () => {
    expect(acharComponenteInterativo(COMPONENTES, "tocar")).toMatchObject({ type: 2, id: 2 });
    expect(acharComponenteInterativo(COMPONENTES, "pular")).toMatchObject({ type: 2, id: 10 });
    expect(acharComponenteInterativo(COMPONENTES, "quem")).toMatchObject({ type: 5, id: 12 });
    expect(acharComponenteInterativo(COMPONENTES, "genero")).toMatchObject({ type: 3 });
  });

  it("`null` quando a mensagem não tem o `custom_id` (um `update()` pode ter tirado o botão)", () => {
    expect(acharComponenteInterativo(COMPONENTES, "sumiu")).toBeNull();
    expect(acharComponenteInterativo([], "tocar")).toBeNull();
  });
});

describe("conferirClique", () => {
  const achar = (id: string) => acharComponenteInterativo(COMPONENTES, id);

  it("botão habilitado sem `values` passa", () => {
    expect(conferirClique(achar("tocar"), { componentType: 2 })).toBeNull();
  });

  it("componente que não existe é 404", () => {
    expect(conferirClique(null, { componentType: 2 })).toMatchObject({ status: 404 });
  });

  it("desabilitado é 400 — a tela não deixa clicar, mas o pedido é forjável", () => {
    expect(conferirClique(achar("parar"), { componentType: 2 })).toMatchObject({ status: 400 });
  });

  it("tipo que não confere é 400", () => {
    expect(conferirClique(achar("tocar"), { componentType: 3, values: ["x"] })).toMatchObject({
      status: 400,
    });
  });

  it("botão com `values` é 400", () => {
    expect(conferirClique(achar("tocar"), { componentType: 2, values: [] })).toMatchObject({
      status: 400,
    });
  });

  it("select de texto: valores dentro das opções e de min/max", () => {
    expect(conferirClique(achar("genero"), { componentType: 3, values: ["rock", "jazz"] })).toBeNull();
    expect(conferirClique(achar("genero"), { componentType: 3, values: ["funk"] })).toMatchObject({
      status: 400,
    });
    expect(
      conferirClique(achar("genero"), { componentType: 3, values: ["rock", "jazz", "samba"] }),
    ).toMatchObject({ status: 400 });
    expect(conferirClique(achar("genero"), { componentType: 3, values: [] })).toMatchObject({
      status: 400,
    });
    expect(conferirClique(achar("genero"), { componentType: 3, values: ["rock", "rock"] })).toMatchObject({
      status: 400,
    });
  });

  it("select sem `values` é 400; select de usuário usa o padrão 1..1", () => {
    expect(conferirClique(achar("genero"), { componentType: 3 })).toMatchObject({ status: 400 });
    expect(conferirClique(achar("quem"), { componentType: 5, values: ["u_1"] })).toBeNull();
    expect(conferirClique(achar("quem"), { componentType: 5, values: ["u_1", "u_2"] })).toMatchObject({
      status: 400,
    });
  });

  it("botão de link não gera interação", () => {
    const link = { type: 2 as const, style: 5, label: "Site", url: "https://x", custom_id: "l" };
    expect(conferirClique(link, { componentType: 2 })).toMatchObject({ status: 400 });
  });
});

describe("callbackPermitido", () => {
  it("comando (2): 4, 5 e 9; nunca 6, 7 ou 8", () => {
    expect([4, 5, 9].map((c) => callbackPermitido(2, c, false))).toEqual([true, true, true]);
    expect([6, 7, 8].map((c) => callbackPermitido(2, c, false))).toEqual([false, false, false]);
  });

  it("componente (3): 4, 5, 6, 7 e 9; nunca 8", () => {
    expect([4, 5, 6, 7, 9].map((c) => callbackPermitido(3, c, true))).toEqual([true, true, true, true, true]);
    expect(callbackPermitido(3, 8, true)).toBe(false);
  });

  it("autocomplete (4): só 8", () => {
    expect([4, 5, 6, 7, 9].map((c) => callbackPermitido(4, c, false))).toEqual([false, false, false, false, false]);
    expect(callbackPermitido(4, 8, false)).toBe(true);
  });

  it("envio de modal (5): 4 e 5; 6 e 7 só com mensagem de origem; nunca 9", () => {
    expect(callbackPermitido(5, 4, false)).toBe(true);
    expect(callbackPermitido(5, 7, false)).toBe(false);
    expect(callbackPermitido(5, 7, true)).toBe(true);
    expect(callbackPermitido(5, 6, true)).toBe(true);
    expect(callbackPermitido(5, 9, true)).toBe(false);
  });

  it("PONG (1) e número desconhecido nunca", () => {
    expect(callbackPermitido(2, 1, false)).toBe(false);
    expect(callbackPermitido(3, 12, true)).toBe(false);
  });

  it("`ehInteracaoDeComponente` só em 3 e 5", () => {
    expect([2, 3, 4, 5].map(ehInteracaoDeComponente)).toEqual([false, true, false, true]);
  });
});

// ── o modal ──────────────────────────────────────────────────

const MODAL: ModalDeBot = {
  custom_id: "cadastro",
  title: "Cadastro",
  components: [
    { type: 10, id: 1, content: "Preencha" },
    {
      type: 18,
      id: 2,
      label: "Nome",
      component: { type: 4, id: 3, custom_id: "nome", style: 1, min_length: 2, max_length: 20 },
    },
    {
      type: 18,
      id: 4,
      label: "Bio",
      component: { type: 4, id: 5, custom_id: "bio", style: 2, required: false },
    },
    {
      type: 1,
      id: 6,
      components: [{ type: 4, id: 7, custom_id: "cidade", style: 1, label: "Cidade", required: false }],
    },
    {
      type: 18,
      id: 8,
      label: "Cor",
      component: {
        type: 21,
        id: 9,
        custom_id: "cor",
        options: [
          { value: "azul", label: "Azul" },
          { value: "verde", label: "Verde" },
        ],
      },
    },
  ],
};

describe("conferirEnvioDoModal", () => {
  it("monta a saída pelo modal, na ordem dele e com os `id` dele", () => {
    const r = conferirEnvioDoModal(MODAL, [
      // a web manda ids quaisquer e em outra ordem: o bot recebe os do modal
      { type: 18, id: 99, component: { type: 21, id: 99, custom_id: "cor", value: "verde" } },
      { type: 18, id: 98, component: { type: 4, id: 98, custom_id: "nome", value: "Zé Maria" } },
    ]);
    expect(r).toEqual({
      ok: true,
      components: [
        { type: 10, id: 1 },
        { type: 18, id: 2, component: { type: 4, id: 3, custom_id: "nome", value: "Zé Maria" } },
        // não obrigatório e não enviado: chega vazio, como no Discord
        { type: 18, id: 4, component: { type: 4, id: 5, custom_id: "bio", value: "" } },
        { type: 1, id: 6, components: [{ type: 4, id: 7, custom_id: "cidade", value: "" }] },
        { type: 18, id: 8, component: { type: 21, id: 9, custom_id: "cor", value: "verde" } },
      ],
    });
  });

  it("obrigatório vazio é 400 (o padrão do Discord é `required: true`)", () => {
    const r = conferirEnvioDoModal(MODAL, [
      { type: 18, id: 3, component: { type: 21, id: 9, custom_id: "cor", value: "azul" } },
    ]);
    expect(r).toMatchObject({ ok: false, recusa: { status: 400 } });
  });

  it("texto fora de `min_length`/`max_length` é 400", () => {
    const r = conferirEnvioDoModal(MODAL, [
      { type: 18, id: 3, component: { type: 4, id: 3, custom_id: "nome", value: "Z" } },
      { type: 18, id: 9, component: { type: 21, id: 9, custom_id: "cor", value: "azul" } },
    ]);
    expect(r).toMatchObject({ ok: false });
  });

  it("campo que o modal não declara é 400 — nunca chega ao bot", () => {
    const r = conferirEnvioDoModal(MODAL, [
      { type: 18, id: 3, component: { type: 4, id: 3, custom_id: "nome", value: "Zé" } },
      { type: 18, id: 9, component: { type: 21, id: 9, custom_id: "cor", value: "azul" } },
      { type: 18, id: 50, component: { type: 4, id: 50, custom_id: "senha", value: "123" } },
    ]);
    expect(r).toMatchObject({ ok: false, recusa: { mensagem: expect.stringContaining("senha") } });
  });

  it("tipo trocado e valor fora das opções são 400", () => {
    expect(
      conferirEnvioDoModal(MODAL, [
        { type: 18, id: 3, component: { type: 23, id: 3, custom_id: "nome", value: true } },
      ]),
    ).toMatchObject({ ok: false });
    expect(
      conferirEnvioDoModal(MODAL, [
        { type: 18, id: 3, component: { type: 4, id: 3, custom_id: "nome", value: "Zé" } },
        { type: 18, id: 9, component: { type: 21, id: 9, custom_id: "cor", value: "roxo" } },
      ]),
    ).toMatchObject({ ok: false });
  });
});

// ── api-interacoes ── o `required` padrão, tipo a tipo ──────────
//
// `developers/components/reference.mdx` (discord-api-docs, conferido em
// 2026-09-14): "defaults to `true`" no text input (4), nos selects (3, 5–8), no
// file upload (19), no radio group (21) e no checkbox group (22). O checkbox
// avulso (23) não tem `required`.

/** Um modal com um campo só, dentro de um `Label`. */
function modalCom(campo: Record<string, unknown>): ModalDeBot {
  return {
    custom_id: "m",
    title: "M",
    components: [{ type: 18, id: 1, label: "Campo", component: { id: 2, custom_id: "c", ...campo } }],
  } as unknown as ModalDeBot;
}

const OPCOES = [
  { value: "a", label: "A" },
  { value: "b", label: "B" },
];

const CAMPOS_COM_REQUIRED: Array<[string, Record<string, unknown>]> = [
  ["4 text input", { type: 4, style: 1 }],
  ["3 select de texto", { type: 3, options: OPCOES }],
  ["5 select de usuário", { type: 5 }],
  ["6 select de cargo", { type: 6 }],
  ["7 select mencionável", { type: 7 }],
  ["8 select de canal", { type: 8 }],
  ["19 file upload", { type: 19 }],
  ["21 radio group", { type: 21, options: OPCOES }],
  ["22 checkbox group", { type: 22, options: OPCOES }],
];

describe("conferirEnvioDoModal — `required` padrão por tipo", () => {
  it.each(CAMPOS_COM_REQUIRED)("%s: sem a chave `required`, vazio é 400", (_nome, campo) => {
    expect(conferirEnvioDoModal(modalCom(campo), [])).toMatchObject({
      ok: false,
      recusa: { status: 400, mensagem: expect.stringContaining("obrigatório") },
    });
  });

  it.each(CAMPOS_COM_REQUIRED)("%s: com `required: false`, vazio passa", (_nome, campo) => {
    expect(conferirEnvioDoModal(modalCom({ ...campo, required: false }), [])).toMatchObject({ ok: true });
  });

  it("23 checkbox não tem `required`: não enviado chega `false`, nunca é recusa", () => {
    expect(conferirEnvioDoModal(modalCom({ type: 23 }), [])).toEqual({
      ok: true,
      components: [{ type: 18, id: 1, component: { type: 23, id: 2, custom_id: "c", value: false } }],
    });
  });

  it("22 checkbox group: `required` manda mesmo com `min_values: 0`", () => {
    expect(conferirEnvioDoModal(modalCom({ type: 22, options: OPCOES, min_values: 0 }), [])).toMatchObject({
      ok: false,
    });
  });

  it("22 checkbox group: `min_values` padrão 1 e `max_values` padrão = número de opções", () => {
    const modal = modalCom({ type: 22, options: OPCOES, required: false });
    const envio = (values: string[]) => [
      { type: 18 as const, id: 1, component: { type: 22 as const, id: 2, custom_id: "c", values } },
    ];
    expect(conferirEnvioDoModal(modal, envio(["a", "b"]))).toMatchObject({ ok: true });
    expect(conferirEnvioDoModal(modal, envio(["a"]))).toMatchObject({ ok: true });
  });
});

describe("arquivoAceito", () => {
  it("`image` casa pelo content-type; `.pdf` pela extensão; sem lista, tudo vale", () => {
    expect(arquivoAceito(["image"], { filename: "a.png", contentType: "image/png" })).toBe(true);
    expect(arquivoAceito(["image"], { filename: "a.pdf", contentType: "application/pdf" })).toBe(false);
    expect(arquivoAceito([".pdf"], { filename: "Relatorio.PDF", contentType: "application/pdf" })).toBe(true);
    expect(arquivoAceito(undefined, { filename: "x.bin", contentType: "application/octet-stream" })).toBe(true);
  });
});

// ── o autocomplete ───────────────────────────────────────────

const DECLARADAS: OpcaoDeComando[] = [
  { name: "musica", description: "a música", type: 3, required: true, autocomplete: true },
  { name: "volume", description: "o volume", type: 4, required: true },
  { name: "canal", description: "onde", type: 7, required: false },
];

describe("conferirPedidoDeAutocomplete", () => {
  it("a em foco sai em texto e com `focused`; obrigatória faltando não é recusa", () => {
    const r = conferirPedidoDeAutocomplete(DECLARADAS, [
      { name: "musica", type: 3, value: "never", focused: true },
    ]);
    expect(r).toEqual({
      ok: true,
      emFoco: "musica",
      opcoes: [{ name: "musica", type: 3, value: "never", focused: true }],
    });
  });

  it("devolve na ordem do comando", () => {
    const r = conferirPedidoDeAutocomplete(DECLARADAS, [
      { name: "volume", type: 4, value: 5 },
      { name: "musica", type: 3, value: "ne", focused: true },
    ]);
    expect(r.ok && r.opcoes.map((o) => o.name)).toEqual(["musica", "volume"]);
  });

  it("opção em foco sem `autocomplete: true` é 400", () => {
    const r = conferirPedidoDeAutocomplete(DECLARADAS, [{ name: "volume", type: 4, value: 5, focused: true }]);
    expect(r).toMatchObject({ ok: false, recusa: { status: 400 } });
  });

  it("opção desconhecida, de tipo errado ou sem foco é 400", () => {
    expect(conferirPedidoDeAutocomplete(DECLARADAS, [{ name: "x", type: 3, value: "", focused: true }])).toMatchObject({ ok: false });
    expect(conferirPedidoDeAutocomplete(DECLARADAS, [{ name: "musica", type: 4, value: 1, focused: true }])).toMatchObject({ ok: false });
    expect(conferirPedidoDeAutocomplete(DECLARADAS, [{ name: "musica", type: 3, value: "a" }])).toMatchObject({ ok: false });
  });
});
