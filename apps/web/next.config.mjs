import { fileURLToPath } from "node:url";

/**
 * O app desktop (Tauri) empacota a web como **HTML estático** — `frontendDist`
 * aponta para `apps/web/out`, que só existe com `output: "export"`.
 *
 * Ligar `export` de forma incondicional quebraria o deploy web normal
 * (`next start` não funciona com export), então ele é ligado por ambiente:
 *
 *   - `NEXT_OUTPUT=export` — chave explícita, para gerar o `out/` na mão;
 *   - `TAURI_ENV_*` — injetadas pelo Tauri nos hooks `beforeBuildCommand`/
 *     `beforeDevCommand`, então o `pnpm --filter @streamz/desktop build` já
 *     produz o `out/` sem precisar de nada a mais. (`TAURI_PLATFORM` cobre o
 *     nome antigo, do Tauri 1.)
 *
 * O export é viável porque **todas** as rotas (`/`, `/login`, `/register`,
 * `/app`) são client components: navegação por `useRouter`, dados por fetch/WS
 * contra a API. Não há rota de API, middleware, server action nem `next/image`.
 */
const exportarEstatico =
  process.env.NEXT_OUTPUT === "export" ||
  Boolean(
    process.env.TAURI_ENV_PLATFORM ||
      process.env.TAURI_ENV_TARGET_TRIPLE ||
      process.env.TAURI_PLATFORM,
  );

/**
 * A imagem Docker da web roda `output: "standalone"`: o Next emite um
 * `server.js` com apenas os arquivos que o rastreamento provou serem usados,
 * o que dispensa levar `node_modules` inteiro para a imagem final.
 *
 * Fica atrás de env (`NEXT_OUTPUT=standalone`) pelo mesmo motivo do export:
 * `next dev` e `next start` locais continuam no modo padrão, e os dois modos
 * são mutuamente exclusivos — quando o Tauri manda exportar, o export vence.
 */
const saidaStandalone = !exportarEstatico && process.env.NEXT_OUTPUT === "standalone";

/**
 * Num monorepo o rastreamento precisa enxergar acima de `apps/web` para achar
 * o `packages/shared` e o store do pnpm; sem isto o `server.js` sobe e quebra
 * ao importar um módulo que ficou de fora.
 */
const raizDoMonorepo = fileURLToPath(new URL("../../", import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@streamz/shared"],
  ...(exportarEstatico
    ? {
        output: "export",
        // Gera `out/app/index.html` em vez de `out/app.html`: o protocolo de
        // asset do Tauri resolve diretório → index.html, então recarregar a
        // janela numa rota interna continua funcionando.
        trailingSlash: true,
        // Sem servidor Next não há otimizador de imagem.
        images: { unoptimized: true },
      }
    : {}),
  ...(saidaStandalone
    ? {
        output: "standalone",
        experimental: { outputFileTracingRoot: raizDoMonorepo },
      }
    : {}),
};

export default nextConfig;
