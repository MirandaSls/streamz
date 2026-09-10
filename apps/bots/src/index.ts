/**
 * A entrada do runtime dos bots oficiais do Streamz.
 *
 *   node dist/index.js            # roda todos os bots de src/
 *   BOTS=musica node dist/index.js
 *
 * Ver `apps/bots/README.md` (como rodar) e `apps/bots/CONTRATO.md` (como
 * acrescentar um bot).
 */

import { iniciarBot, type BotEmExecucao } from "./runtime/cliente";
import { criarLog } from "./runtime/log";
import { carregarBot, idsPedidos } from "./runtime/registro";

const log = criarLog("runtime");

async function principal() {
  const ids = idsPedidos();
  log.info("subindo", { bots: ids });

  const emExecucao: BotEmExecucao[] = [];
  for (const id of ids) {
    const bot = carregarBot(id);
    // Em série e não em paralelo: cada `login` faz um `GET /gateway/bot` e abre
    // um WebSocket, e subir cinco de uma vez contra uma API que acabou de
    // nascer é a receita para cinco reconexões. São segundos, uma vez só.
    emExecucao.push(await iniciarBot(id, bot));
  }

  log.info("no ar", { bots: emExecucao.map((b) => b.ctx.id) });

  // ── desligamento limpo ────────────────────────────────────
  // Sem isto o `docker stop` mata o processo no SIGKILL de 10 s e o bot fica na
  // lista de membros da call até a carência do gateway expirar. Com isto ele
  // sai do canal e fecha o WS.
  let desligando = false;
  const desligar = async (sinal: string) => {
    if (desligando) return;
    desligando = true;
    log.info("desligando", { sinal });
    await Promise.allSettled(emExecucao.map((b) => b.desligar()));
    process.exit(0);
  };
  process.on("SIGTERM", () => void desligar("SIGTERM"));
  process.on("SIGINT", () => void desligar("SIGINT"));
}

principal().catch((erro) => {
  log.erro("o runtime não subiu", { erro });
  process.exit(1);
});
