/**
 * Endereços dos serviços consumidos pelo cliente web.
 *
 * Fonte única: nenhum outro módulo deve ler `process.env.NEXT_PUBLIC_*` de URL
 * nem repetir o fallback de desenvolvimento. Em produção a ausência da variável
 * é erro de configuração, não algo a mascarar com `localhost` — um build
 * publicado apontando para a máquina de quem abriu a página falha de forma
 * silenciosa e confusa.
 *
 * Onde a falta é denunciada: no boot do cliente, com `throw`. Durante o
 * `next build` só avisamos no log — as páginas são pré-renderizadas no
 * servidor, e derrubar o build por uma variável que só o navegador usa
 * impediria de empacotar o app (inclusive o desktop) antes de configurá-lo.
 */

const DEV_API_URL = "http://localhost:3333";

function resolver(nome: string, valor: string | undefined, fallback: string): string {
  const limpo = valor?.trim();
  if (limpo) return semBarraFinal(limpo);

  if (process.env.NODE_ENV === "production") {
    const recado =
      `Configuração ausente: defina ${nome} no ambiente de build do cliente web ` +
      `(ex.: ${nome}=https://api.seu-dominio.com).`;
    if (typeof window !== "undefined") throw new Error(recado);
    console.error(recado);
  }
  return fallback;
}

/** URLs entram na composição de caminhos; barra final duplicaria a separação. */
function semBarraFinal(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

/** Base REST da API (sem o prefixo `/api`, que é adicionado por `lib/api.ts`). */
export const API_URL = resolver("NEXT_PUBLIC_API_URL", process.env.NEXT_PUBLIC_API_URL, DEV_API_URL);

/** Base do WebSocket. Por padrão acompanha a API — é o mesmo processo NestJS. */
export const WS_URL = resolver(
  "NEXT_PUBLIC_WS_URL",
  process.env.NEXT_PUBLIC_WS_URL ?? process.env.NEXT_PUBLIC_API_URL,
  DEV_API_URL,
);

/**
 * Origem pública do app na web (`https://streamz.chat`) — o host que aparece
 * nos links de convite que as pessoas colam no chat.
 *
 * Por que não `window.location.origin`: no app de desktop a origem é
 * `http://tauri.localhost` (o WebView2 serve o export estático de dentro do
 * app), e comparar com ela fazia o link `https://streamz.chat/invite/xxxx`
 * deixar de ser reconhecido como convite — virava prévia genérica de link.
 *
 * Por que não uma variável nova: `NEXT_PUBLIC_WEB_URL` seria mais uma coisa a
 * configurar em três lugares (CI da web, CI do desktop, Dockerfile) e um build
 * antigo continuaria sem ela. `NEXT_PUBLIC_API_URL` **já** é embutida em todos
 * os builds, inclusive no do desktop, e o padrão do produto é `api.<domínio>`:
 * tirar o `api.` devolve o domínio público. Quando a variável explícita
 * existir, ela ganha.
 */
export const WEB_URL = resolverWeb();

function resolverWeb(): string {
  const explicito = process.env.NEXT_PUBLIC_WEB_URL?.trim();
  if (explicito) return semBarraFinal(explicito);
  try {
    const url = new URL(API_URL);
    url.hostname = url.hostname.replace(/^api\./, "");
    return url.origin;
  } catch {
    return "";
  }
}
