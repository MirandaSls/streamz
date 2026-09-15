#!/usr/bin/env node
/**
 * Copia os SVG do Twemoji do `node_modules` da web para `apps/web/public/twemoji/`
 * (ADR-0009, onda 0.6). A escolha do pacote e do formato está no cabeçalho de
 * `apps/web/lib/twemoji.ts`.
 *
 *   node scripts/copiar-twemoji.mjs   (de apps/web; o predev/prebuild já chamam)
 *
 * Por que arquivo servido e não import: o `<img>` do emoji é montado por nome
 * (`/twemoji/1f600.svg`) a partir do texto da mensagem, que só existe em tempo
 * de execução — o bundler não tem como saber quais dos 3.846 arquivos entram.
 * E nada de CDN: o desktop e o Android empacotam o export estático e rodam
 * offline. É o mesmo raciocínio do `apps/web/scripts/copiar-supressor.mjs`.
 *
 * Só vai `dist/svg/*.svg` (9.163.925 bytes em 3.846 arquivos, de 9.314.663 do
 * pacote): o JS do twemoji não é usado — a conversão de texto em nome de
 * arquivo é nossa, em `lib/twemoji.ts`.
 *
 * Idempotente e barato: grava a versão copiada em `.versao` e não faz nada
 * enquanto ela bater com a instalada, porque vai rodar a cada `dev`/`build`.
 * Versão nova apaga a pasta antes de copiar — um emoji renomeado entre versões
 * não pode sobrar com o nome velho.
 */
import { createRequire } from "node:module";
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Mora em apps/web/scripts, e não em scripts/ da raiz, porque o Dockerfile da
// web só copia apps/web e packages/shared: o prebuild da imagem precisa achá-lo.
const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACOTE = "@discordapp/twemoji";
const DESTINO = join(WEB, "public", "twemoji");
const MARCA = join(DESTINO, ".versao");

// Resolve a partir do `package.json` da web, não deste arquivo: com o pnpm o
// pacote só é visível de dentro do workspace que o declara.
const requireDaWeb = createRequire(join(WEB, "package.json"));
let raizDoPacote;
try {
  raizDoPacote = dirname(requireDaWeb.resolve(`${PACOTE}/package.json`));
} catch {
  console.error(
    `twemoji: ${PACOTE} não está instalado em apps/web — rode ` +
      `pnpm --filter @streamz/web add -D -E ${PACOTE}@16.0.1`,
  );
  process.exit(1);
}
const { version } = JSON.parse(await readFile(join(raizDoPacote, "package.json"), "utf8"));
const origem = join(raizDoPacote, "dist", "svg");

const copiada = await readFile(MARCA, "utf8").catch(() => null);
if (copiada?.trim() === version) {
  console.log(`twemoji: ${PACOTE}@${version} já está em public/twemoji/`);
  process.exit(0);
}

await rm(DESTINO, { recursive: true, force: true });
await mkdir(DESTINO, { recursive: true });

const arquivos = (await readdir(origem)).filter((nome) => nome.endsWith(".svg"));
// Em lotes: 3.846 `copyFile` de uma vez estouram o limite de arquivos abertos
// em alguns sistemas (EMFILE)
const LOTE = 64;
for (let i = 0; i < arquivos.length; i += LOTE) {
  await Promise.all(
    arquivos.slice(i, i + LOTE).map((nome) => copyFile(join(origem, nome), join(DESTINO, nome))),
  );
}

// CC-BY 4.0 pede atribuição, licença e aviso de alteração junto da obra; o
// arquivo viaja com os SVG para dentro do instalador. A linha na interface é
// da tela de créditos. Os nomes de copyright são os do LICENSE do pacote.
await writeFile(
  join(DESTINO, "CREDITOS.txt"),
  [
    `Twemoji — ${PACOTE}@${version} (https://github.com/discord/twemoji)`,
    "Copyright (c) 2022–present Jason Sofonia & Justine De Caires",
    "Copyright (c) 2014–2021 Twitter",
    "Gráficos licenciados sob CC-BY 4.0: https://creativecommons.org/licenses/by/4.0/",
    "Código licenciado sob MIT (o código não é distribuído aqui, só os gráficos).",
    "Arquivos copiados sem alteração.",
    "",
  ].join("\n"),
);
await writeFile(MARCA, `${version}\n`);

console.log(`twemoji: ${arquivos.length} arquivos de ${PACOTE}@${version} em public/twemoji/`);
