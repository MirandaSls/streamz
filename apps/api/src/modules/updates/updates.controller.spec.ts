import { describe, expect, it, vi } from "vitest";
import { UpdatesController } from "./updates.controller";
import type { UpdatesService } from "./updates.service";

/** `res` de mentira: só o `status`, que é tudo que o controller usa. */
function resposta() {
  return { status: vi.fn() };
}

function controller(manifesto: ReturnType<UpdatesService["manifesto"]>) {
  const service = { manifesto: () => manifesto } as unknown as UpdatesService;
  return new UpdatesController(service);
}

describe("UpdatesController", () => {
  it("responde 204 quando não há atualização", () => {
    const res = resposta();
    const corpo = controller(null).buscar("windows", "x86_64", "0.1.0", res);

    // o 204 é do protocolo do Tauri: 200 de corpo vazio faz o cliente tratar a
    // checagem como erro
    expect(res.status).toHaveBeenCalledWith(204);
    expect(corpo).toBeUndefined();
  });

  it("devolve o manifesto e não mexe no status quando há", () => {
    const manifesto = {
      version: "0.2.0",
      notes: "novidades",
      pub_date: "2026-09-01T00:00:00.000Z",
      platforms: { "windows-x86_64": { signature: "sig", url: "https://exemplo/app.exe" } },
    };
    const res = resposta();
    const corpo = controller(manifesto).buscar("windows", "x86_64", "0.1.0", res);

    expect(res.status).not.toHaveBeenCalled();
    expect(corpo).toEqual(manifesto);
  });
});
