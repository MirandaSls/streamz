/** Fabrica um JWT sem assinatura válida — o cliente só lê o payload. */
export function jwtComExp(expEmMs: number, sid?: string): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: "u1", exp: Math.floor(expEmMs / 1000), ...(sid ? { sid } : {}) }),
  ).toString("base64url");
  return `cabecalho.${payload}.assinatura`;
}

/** Resposta de `fetch` mínima para o que `api.ts`/`session.ts` consomem. */
export function resposta(status: number, corpo: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => corpo,
  } as Response;
}
