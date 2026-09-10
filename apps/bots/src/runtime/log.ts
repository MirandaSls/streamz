import type { Log } from "./tipos";

/**
 * Log estruturado: **uma linha de JSON por evento**, como a API em produção
 * (`LOG_FORMAT=json`).
 *
 * Por que JSON e não texto bonito: o container vai para o `docker logs` e daí
 * para quem estiver agregando. Uma linha por evento com `bot` e `nivel` fixos é
 * o que permite filtrar um bot no meio de cinco sem inventar um parser.
 *
 * `LOG_FORMATO=texto` volta ao formato legível — é o que se quer rodando na
 * mão, e não vale a pena manter dois loggers para isso.
 */

type Nivel = "debug" | "info" | "aviso" | "erro";

const ORDEM: Record<Nivel, number> = { debug: 10, info: 20, aviso: 30, erro: 40 };

function nivelMinimo(): number {
  const bruto = (process.env.LOG_NIVEL ?? "info").trim().toLowerCase();
  return ORDEM[bruto as Nivel] ?? ORDEM.info;
}

/**
 * Erro não serializa em JSON (`JSON.stringify(new Error("x"))` é `{}`), e um
 * log de falha sem a mensagem do erro é pior que nenhum log. Isto achata
 * qualquer `Error` no `extra` para `{ mensagem, pilha }`.
 */
function achatar(extra?: Record<string, unknown>): Record<string, unknown> {
  if (!extra) return {};
  const saida: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(extra)) {
    saida[chave] =
      valor instanceof Error ? { mensagem: valor.message, pilha: valor.stack } : valor;
  }
  return saida;
}

export function criarLog(bot: string): Log {
  const texto = (process.env.LOG_FORMATO ?? "json").trim().toLowerCase() === "texto";
  const minimo = nivelMinimo();

  const escrever = (nivel: Nivel, mensagem: string, extra?: Record<string, unknown>) => {
    if (ORDEM[nivel] < minimo) return;
    const destino = nivel === "erro" ? process.stderr : process.stdout;
    if (texto) {
      const cauda = extra ? ` ${JSON.stringify(achatar(extra))}` : "";
      destino.write(`[${nivel}] [${bot}] ${mensagem}${cauda}\n`);
      return;
    }
    destino.write(
      `${JSON.stringify({
        hora: new Date().toISOString(),
        nivel,
        bot,
        mensagem,
        ...achatar(extra),
      })}\n`,
    );
  };

  return {
    debug: (m, e) => escrever("debug", m, e),
    info: (m, e) => escrever("info", m, e),
    aviso: (m, e) => escrever("aviso", m, e),
    erro: (m, e) => escrever("erro", m, e),
  };
}
