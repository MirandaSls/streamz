/**
 * Copia o supressor de ruído (RNNoise) do node_modules para `public/`.
 *
 * O AudioWorklet e o `.wasm` não passam pelo bundler: o worklet é carregado por
 * URL em runtime (`audioWorklet.addModule`) e o wasm por `fetch`. Precisam,
 * portanto, ser arquivos servidos — e não imports.
 *
 * Roda no `predev` e no `prebuild`, então o node_modules continua sendo a única
 * fonte de verdade: atualizar o pacote atualiza os assets, sem ninguém lembrar
 * de copiar nada à mão.
 */
import { createRequire } from "node:module";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const destino = resolve(dirname(fileURLToPath(import.meta.url)), "..", "public", "supressor");

/** origem no pacote → nome servido em /supressor/. */
const ARQUIVOS = {
  "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js": "rnnoise-worklet.js",
  "@sapphi-red/web-noise-suppressor/rnnoise.wasm": "rnnoise.wasm",
  "@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm": "rnnoise_simd.wasm",
};

await mkdir(destino, { recursive: true });
for (const [origem, nome] of Object.entries(ARQUIVOS)) {
  await copyFile(require.resolve(origem), resolve(destino, nome));
}
console.log(`supressor: ${Object.keys(ARQUIVOS).length} arquivos em public/supressor/`);
