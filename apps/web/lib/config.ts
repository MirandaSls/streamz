/**
 * Endereços dos serviços consumidos pelo cliente web.
 *
 * Fonte única: nenhum outro módulo deve ler `process.env.NEXT_PUBLIC_*` de URL
 * nem repetir o fallback de desenvolvimento. Em produção a ausência da variável
 * é erro de configuração, não algo a mascarar com `localhost` — um build
 * publicado apontando para a máquina do usuário falha de forma silenciosa e
 * confusa, então quebramos no boot com a mensagem do que faltou.
 */

const DEV_API_URL = "http://localhost:3333";

function resolver(nome: string, valor: string | undefined, fallback: string): string {
  const limpo = valor?.trim();
  if (limpo) return semBarraFinal(limpo);
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `Configuração ausente: defina ${nome} no ambiente de build do cliente web ` +
        `(ex.: ${nome}=https://api.seu-dominio.com).`,
    );
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
