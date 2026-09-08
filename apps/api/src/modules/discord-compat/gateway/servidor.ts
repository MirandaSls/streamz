import { Injectable, Logger } from "@nestjs/common";
import type { Server as ServidorHttp } from "node:http";

/**
 * O servidor WebSocket **cru** (`ws`) do gateway compatível, em `/gateway`.
 *
 * ── Lote B (gateway compat) implementa. ──
 *
 * Onde vive (§7): `new WebSocketServer({ noServer: true })` plugado no evento
 * `'upgrade'` do **mesmo** servidor HTTP do Nest, filtrando
 * `pathname === '/gateway'`. O Socket.IO continua em `/socket.io` sem saber que
 * existe outro. O Traefik roteia por `Host`, então nada muda em
 * `/opt/stack/traefik` — o que é ótimo, porque mexer lá é bloqueado.
 *
 * **O risco (c) do §12, e como ele realmente funciona:** o engine.io registra o
 * próprio listener de `'upgrade'` e, quando o path não é o dele, agenda um
 * `socket.end()` para ~1 s depois — mas só executa `if (socket.writable &&
 * socket.bytesWritten <= 0)`. Como o nosso handshake responde na hora (escreve
 * o `101` e o `HELLO`), `bytesWritten` já é maior que zero quando o relógio
 * dispara e o socket sobrevive. Ou seja: **não há corrida enquanto
 * respondermos rápido** — e é justamente isso que o teste de fumaça precisa
 * cobrir, porque se um dia alguém puser uma consulta ao banco antes do
 * `handleUpgrade`, a conexão passa a cair sozinha depois de um segundo, sem
 * erro nenhum no log. A saída de emergência é `destroyUpgrade: false` num
 * `IoAdapter` próprio.
 *
 * Os quatro opcodes que fazem o `login()` chegar em `ready`: `10 HELLO`,
 * `11 HEARTBEAT_ACK`, `2 IDENTIFY` (→ READY) e `0 DISPATCH`. Mais `6 RESUME`
 * (replay do buffer + `RESUMED`; sessão que não existe mais → `op 9` com
 * `d: false`), `1 HEARTBEAT`, `3 PRESENCE_UPDATE` (aceita e ignora) e `4`
 * (F2 — na F1 aceita e ignora).
 */
@Injectable()
export class GatewayCompatService {
  private readonly logger = new Logger(GatewayCompatService.name);

  /**
   * Assume o `'upgrade'` de `/gateway` no servidor HTTP do Nest.
   *
   * Chamado uma vez, pelo `main.ts`, **depois** do `app.listen()`. Idempotente:
   * chamar de novo não registra um segundo listener.
   */
  ligar(_servidorHttp: ServidorHttp): void {
    this.logger.warn("F1 lote B: gateway compat ainda não implementado — /gateway está inerte");
  }

  /** Fecha todas as sessões (desligamento gracioso). */
  async desligar(): Promise<void> {
    // sem sessões enquanto o lote B não chega
  }
}
