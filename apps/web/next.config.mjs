/**
 * O app desktop (Tauri) empacota a web como **HTML estático** — `frontendDist`
 * aponta para `apps/web/out`, que só existe com `output: "export"`.
 *
 * Ligar `export` de forma incondicional quebraria o deploy web normal
 * (`next start` não funciona com export), então ele é ligado por ambiente:
 *
 *   - `NEXT_OUTPUT=export` — chave explícita, para gerar o `out/` na mão;
 *   - `TAURI_ENV_*` — injetadas pelo Tauri nos hooks `beforeBuildCommand`/
 *     `beforeDevCommand`, então o `pnpm --filter @newdisc/desktop build` já
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

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@newdisc/shared"],
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
};

export default nextConfig;
