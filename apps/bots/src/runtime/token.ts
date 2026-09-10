import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * De onde sai o token de um bot — **nunca** do repositório.
 *
 * Três fontes, nesta ordem:
 *
 * 1. `STREAMZ_BOT_TOKEN_<ID>` (id em maiúsculas, `-` vira `_`): a forma
 *    explícita, útil quando um processo roda vários bots.
 * 2. `STREAMZ_BOT_TOKEN`: o padrão do deploy, **um container por bot** — a
 *    variável não precisa saber o nome do bot que o container roda.
 * 3. `<BOTS_DIR>/<id>.token` (padrão `/opt/stack/streamz/.bots`): o arquivo que
 *    o `provisionar.mjs` escreve com `chmod 600`.
 *
 * Por que arquivo e não o `.env` da raiz: o `.env` é **produção viva** — a API
 * e a web o leem, e uma sessão que o edite por engano derruba o site. Um
 * diretório à parte, fora do git (`.gitignore`) e com 600, é a mudança mais
 * barata que não toca em nada que já está no ar. O compose monta
 * `./.bots:/app/.bots:ro`.
 */

export const DIRETORIO_PADRAO = "/opt/stack/streamz/.bots";

export function diretorioDosTokens(): string {
  return process.env.BOTS_DIR?.trim() || DIRETORIO_PADRAO;
}

/** `musica` → `STREAMZ_BOT_TOKEN_MUSICA`. */
export function variavelDoToken(id: string): string {
  return `STREAMZ_BOT_TOKEN_${id.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}

export function caminhoDoToken(id: string): string {
  return join(diretorioDosTokens(), `${id}.token`);
}

/**
 * Devolve o token, ou lança dizendo **onde** procurar.
 *
 * A mensagem de erro é longa de propósito: quem sobe um bot pela primeira vez
 * não sabe que existe um `provisionar`, e "token não encontrado" sozinho manda
 * a pessoa ler o código.
 */
export function lerToken(id: string): string {
  const daVariavelPropria = process.env[variavelDoToken(id)]?.trim();
  if (daVariavelPropria) return daVariavelPropria;

  const daVariavelUnica = process.env.STREAMZ_BOT_TOKEN?.trim();
  if (daVariavelUnica) return daVariavelUnica;

  const caminho = caminhoDoToken(id);
  try {
    const doArquivo = readFileSync(caminho, "utf8").trim();
    if (doArquivo) return doArquivo;
  } catch {
    // cai no erro abaixo, que diz as três fontes
  }

  throw new Error(
    `sem token para o bot "${id}". Defina ${variavelDoToken(id)} ou STREAMZ_BOT_TOKEN, ` +
      `ou rode \`pnpm --filter @streamz/bots provisionar\` para gerar ${caminho}.`,
  );
}
