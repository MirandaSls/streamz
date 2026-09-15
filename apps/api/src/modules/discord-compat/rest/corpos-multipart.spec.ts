import { describe, expect, it, vi } from "vitest";
import { ErroDoDiscord } from "../erros";
import {
  arquivosDoMultipart,
  gravarArquivosDoMultipart,
  PayloadJsonPipe,
  renomearReferenciasDeAnexo,
  type ArquivoDoMultipart,
} from "./corpos";
import { anexarArquivosAoCorpo } from "./corpos-f3";

/**
 * ── rodada de correção ── o upload multipart das rotas de compat.
 *
 * `payload_json` + `files[n]` é o formato de todo `send({ files })` do
 * discord.js e do discord.py. O que o multer entrega ao controller é tratado
 * por estas funções puras; o controller só as encadeia.
 */

function arquivo(fieldname: string, originalname: string): ArquivoDoMultipart {
  const buffer = Buffer.from("bytes");
  return { fieldname, originalname, buffer, size: buffer.length };
}

describe("PayloadJsonPipe", () => {
  const pipe = new PayloadJsonPipe();

  it("corpo JSON comum passa intacto (mesma referência)", () => {
    const corpo = { content: "oi" };
    expect(pipe.transform(corpo)).toBe(corpo);
  });

  it("desembrulha o `payload_json` do multipart", () => {
    // o multer entrega os campos de texto num objeto sem protótipo
    const corpo = Object.assign(Object.create(null) as Record<string, unknown>, {
      payload_json: JSON.stringify({ content: "placar", attachments: [{ id: 0 }] }),
    });
    expect(pipe.transform(corpo)).toEqual({ content: "placar", attachments: [{ id: 0 }] });
  });

  it("JSON quebrado ou que não é objeto leva 50109", () => {
    for (const bruto of ["{", "[1,2]", "42", "null"]) {
      try {
        pipe.transform({ payload_json: bruto });
        expect.unreachable(`aceitou ${bruto}`);
      } catch (erro) {
        expect(erro).toBeInstanceOf(ErroDoDiscord);
        expect((erro as ErroDoDiscord).getResponse()).toMatchObject({ code: 50109 });
      }
    }
  });
});

describe("arquivosDoMultipart", () => {
  it("sem arquivo, lista vazia", () => {
    expect(arquivosDoMultipart(undefined, [{ id: 0, filename: "x.png" }])).toEqual([]);
  });

  it("pareia `files[n]` com `attachments[].id` (número ou texto) e usa o `filename` de lá", () => {
    const pareados = arquivosDoMultipart(
      [arquivo("files[1]", "b.png"), arquivo("files[0]", "a.png")],
      [
        { id: 0, filename: "meu placar.png" },
        { id: "1", description: "sem nome novo" },
      ],
    );
    expect(pareados.map((p) => [p.nomeDoBot, p.nomeGravado])).toEqual([
      ["b.png", "b.png"],
      // o upload sanitiza; `attachment://` precisa apontar para o nome gravado
      ["meu placar.png", "meu_placar.png"],
    ]);
  });

  it("campo sem índice usa a posição", () => {
    const pareados = arquivosDoMultipart([arquivo("file", "x.txt")], [{ id: 0, filename: "y.txt" }]);
    expect(pareados[0]?.nomeDoBot).toBe("y.txt");
  });
});

describe("renomearReferenciasDeAnexo", () => {
  const pareados = arquivosDoMultipart([arquivo("files[0]", "meu placar.png")], undefined);

  it("troca só o `attachment://<nome>` exato, em qualquer profundidade, sem mutar", () => {
    const embeds = [
      {
        title: "attachment://meu placar.png",
        image: { url: "attachment://meu placar.png" },
        thumbnail: { url: "attachment://outro.png" },
      },
    ];
    const copia = structuredClone(embeds);
    const saida = renomearReferenciasDeAnexo(embeds, pareados);
    expect(saida[0]?.image.url).toBe("attachment://meu_placar.png");
    expect(saida[0]?.thumbnail.url).toBe("attachment://outro.png");
    expect(embeds).toEqual(copia);
  });

  it("nome que não muda devolve a mesma referência", () => {
    const limpos = arquivosDoMultipart([arquivo("files[0]", "placar.png")], undefined);
    const embeds = [{ image: { url: "attachment://placar.png" } }];
    expect(renomearReferenciasDeAnexo(embeds, limpos)).toBe(embeds);
  });
});

describe("gravarArquivosDoMultipart", () => {
  it("grava em série, como o usuário-bot, com o nome do bot, e devolve os cuids na ordem", async () => {
    const upload = vi.fn(async (_u: string, f: { originalname: string }) => ({ id: `att_${f.originalname}` }));
    const pareados = arquivosDoMultipart(
      [arquivo("files[0]", "a.png"), arquivo("files[1]", "b.png")],
      [{ id: 1, filename: "c.png" }],
    );
    const ids = await gravarArquivosDoMultipart({ upload }, "user_bot", pareados);
    expect(ids).toEqual(["att_a.png", "att_c.png"]);
    expect(upload.mock.calls.map((c) => c[0])).toEqual(["user_bot", "user_bot"]);
  });
});

describe("anexarArquivosAoCorpo", () => {
  it("sem arquivo devolve o mesmo corpo e não chama o upload", async () => {
    const upload = vi.fn();
    const corpo = { content: "oi", attachments: [] };
    expect(await anexarArquivosAoCorpo(corpo, [], { upload }, "user_bot")).toBe(corpo);
    expect(upload).not.toHaveBeenCalled();
  });

  it("com arquivo e sem `UploadsService` leva 501", async () => {
    await expect(
      anexarArquivosAoCorpo({ content: "oi" }, [arquivo("files[0]", "a.png")], undefined, "user_bot"),
    ).rejects.toBeInstanceOf(ErroDoDiscord);
  });

  it("grava, acrescenta `attachment_ids` e ajusta o `attachment://` do embed", async () => {
    const upload = vi.fn(async () => ({ id: "att_novo" }));
    const saida = await anexarArquivosAoCorpo(
      {
        embeds: [{ image: { url: "attachment://meu placar.png" } }],
        attachments: [{ id: 0 }],
        attachment_ids: ["att_antigo"],
      },
      [arquivo("files[0]", "meu placar.png")],
      { upload },
      "user_bot",
    );
    expect(saida.attachment_ids).toEqual(["att_antigo", "att_novo"]);
    expect(saida.embeds).toEqual([{ image: { url: "attachment://meu_placar.png" } }]);
  });
});
