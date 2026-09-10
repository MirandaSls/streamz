import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { Bot } from "./tipos";

/**
 * Descobre os bots **varrendo o diretório**, e não por uma lista no código.
 *
 * Esta é a decisão que faz o `CONTRATO.md` valer: acrescentar um bot é criar
 * `src/<pasta>/index.ts` e nada mais. Uma lista central (`{ musica, moderacao,
 * … }`) seria mais fácil de digitar, mas é **exatamente o arquivo** em que
 * cinco agentes trabalhando em cinco bots ao mesmo tempo dariam conflito — e o
 * conflito num registro é do tipo que compila torto e some um bot em silêncio.
 *
 * O preço é que o `tsc` não confere a forma do `default` de cada pasta: quem
 * confere é o `validarBot` abaixo, na subida, com mensagem que diz o campo que
 * falta. Errar aqui custa um container que não sobe — barulhento, que é o que
 * se quer.
 */

/** Pastas de `src/` que **não** são bots. */
const NAO_SAO_BOTS = new Set(["runtime"]);

/** A raiz onde as pastas de bot moram (o `dist/` compilado, em produção). */
export function raizDosBots(): string {
  return join(__dirname, "..");
}

/**
 * Lança com o campo que falta em vez de um `TypeError` três camadas adiante.
 *
 * O `comandos` vazio **é aceito**: um bot só de eventos (boas-vindas, cargos
 * por reação) é legítimo e não tem nenhum `/`.
 */
export function validarBot(id: string, valor: unknown): Bot {
  const bot = valor as Partial<Bot> | undefined;
  const falta: string[] = [];
  if (!bot || typeof bot !== "object") {
    throw new Error(`o bot "${id}" não exporta um objeto como \`default\``);
  }
  if (typeof bot.nome !== "string" || bot.nome.trim() === "") falta.push("nome");
  if (typeof bot.descricao !== "string" || bot.descricao.trim() === "") falta.push("descricao");
  if (!Array.isArray(bot.comandos)) falta.push("comandos");
  if (falta.length > 0) {
    throw new Error(`o bot "${id}" não cumpre o contrato: falta ${falta.join(", ")}`);
  }
  for (const comando of bot.comandos as Bot["comandos"]) {
    if (typeof comando?.nome !== "string" || typeof comando?.executar !== "function") {
      throw new Error(`o bot "${id}" tem um comando sem \`nome\` ou sem \`executar\``);
    }
  }
  return bot as Bot;
}

/** Os ids disponíveis, em ordem alfabética. */
export function idsDisponiveis(): string[] {
  return readdirSync(raizDosBots(), { withFileTypes: true })
    .filter((e) => e.isDirectory() && !NAO_SAO_BOTS.has(e.name))
    .map((e) => e.name)
    .sort();
}

/** Carrega um bot pelo id da pasta. */
export function carregarBot(id: string): Bot {
  // `require` e não `import()`: o pacote é CommonJS (ver tsconfig), e um
  // `import()` aqui seria transpilado para o mesmo `require` com uma promessa
  // por cima. O `eslint-disable` é o preço da varredura de diretório — ver o
  // cabeçalho deste arquivo para o porquê de ela valer a pena.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const modulo = require(join(raizDosBots(), id)) as { default?: unknown };
  return validarBot(id, modulo.default ?? modulo);
}

/**
 * Quais bots este processo deve rodar.
 *
 * `BOTS=musica,niveis` roda os dois; sem a variável, roda **todos** os que
 * existirem. O deploy padrão é um container por bot (ver o `docker-compose`),
 * e nesse caso a variável tem um nome só.
 */
export function idsPedidos(): string[] {
  const bruto = process.env.BOTS?.trim();
  if (!bruto) return idsDisponiveis();
  const pedidos = bruto
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const existem = new Set(idsDisponiveis());
  const faltando = pedidos.filter((p) => !existem.has(p));
  if (faltando.length > 0) {
    throw new Error(
      `BOTS pede ${faltando.join(", ")}, que não existe(m) em src/. Disponíveis: ${[...existem].join(", ")}`,
    );
  }
  return pedidos;
}
