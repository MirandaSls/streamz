import { Injectable, Logger, type OnApplicationShutdown } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type { IncomingMessage, Server as ServidorHttp } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { ApplicationsService } from "../../applications/applications.service";
import { DadosDeCompatService } from "../dados.service";
import {
  FECHAMENTO,
  INTERVALO_DE_HEARTBEAT_MS,
  OPCODE,
  VERSAO_DO_GATEWAY,
  type JsonDoDiscord,
} from "../tipos";
import { usuarioParaDiscord } from "../traducao/usuario";
import { PonteDeEventos } from "./dispatch";
import { lerIdentify, lerResume, montarReady } from "./identify";
import { RegistroDeSessoes, SessaoWs } from "./sessao";
import { VozDoGateway } from "./voz";

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
 * Por isso o handler de `'upgrade'` daqui é **síncrono do começo ao fim**: nada
 * de `await` entre receber o evento e chamar `handleUpgrade`. A autenticação
 * acontece depois, no `op 2`, onde ela pode demorar à vontade.
 *
 * Os quatro opcodes que fazem o `login()` chegar em `ready`: `10 HELLO`,
 * `11 HEARTBEAT_ACK`, `2 IDENTIFY` (→ READY) e `0 DISPATCH`. Mais `6 RESUME`
 * (replay do buffer + `RESUMED`; sessão que não existe mais → `op 9` com
 * `d: false`), `1 HEARTBEAT`, `3 PRESENCE_UPDATE` (aceita e ignora) e
 * `4 VOICE_STATE_UPDATE`, que desde a F2 é roteado para `gateway/voz.ts` — é a
 * porta de entrada da voz.
 */

/** O caminho que assumimos no servidor HTTP do Nest. */
const CAMINHO = "/gateway";

/**
 * Teto do quadro de entrada. Um IDENTIFY tem menos de 1 KB; 64 KB é folgado e
 * evita que um cliente com defeito segure memória à toa.
 */
const TETO_DO_QUADRO = 64 * 1024;

/**
 * Quanto tempo sem `op 1` até considerarmos a conexão zumbi.
 *
 * O bot heartbeata a cada ~41 s; dois intervalos dá margem para jitter e para
 * uma rede ruim. Sem isto, um TCP que morreu sem FIN fica no ar para sempre —
 * o `ws` não manda ping por conta própria, e o protocolo do Discord põe o
 * relógio do lado do cliente.
 */
const PACIENCIA_DE_HEARTBEAT_MS = INTERVALO_DE_HEARTBEAT_MS * 2;

/** O estado de uma conexão, do `'upgrade'` até o close. */
interface Conexao {
  soquete: WebSocket;
  /** de onde veio — para o `resume_gateway_url` do READY. */
  requisicao: IncomingMessage;
  sessao: SessaoWs | null;
  /** um `op 2`/`op 6` já está no meio de um `await`? */
  ocupada: boolean;
  morta: boolean;
  relogioZumbi: ReturnType<typeof setTimeout> | null;
}

@Injectable()
export class GatewayCompatService implements OnApplicationShutdown {
  private readonly logger = new Logger(GatewayCompatService.name);

  private servidorWs: WebSocketServer | null = null;
  private servidorHttp: ServidorHttp | null = null;
  private aoAtualizar: ((req: IncomingMessage, soquete: Duplex, cabeca: Buffer) => void) | null =
    null;
  private readonly conexoes = new Set<Conexao>();

  constructor(
    private readonly registro: RegistroDeSessoes,
    private readonly aplicativos: ApplicationsService,
    private readonly dados: DadosDeCompatService,
    private readonly ponte: PonteDeEventos,
    // F2: quem trata o op 4 (`gateway/voz.ts`).
    private readonly voz: VozDoGateway,
  ) {}

  /**
   * Assume o `'upgrade'` de `/gateway` no servidor HTTP do Nest.
   *
   * Chamado uma vez, pelo `main.ts`, **depois** do `app.listen()`. Idempotente:
   * chamar de novo não registra um segundo listener.
   */
  ligar(servidorHttp: ServidorHttp): void {
    if (this.servidorWs) return;

    const servidorWs = new WebSocketServer({ noServer: true, maxPayload: TETO_DO_QUADRO });

    // Síncrono até o `handleUpgrade`, sem exceção — ver a nota do risco (c) no
    // cabeçalho deste arquivo.
    const aoAtualizar = (req: IncomingMessage, soquete: Duplex, cabeca: Buffer) => {
      let caminho: string;
      let consulta: URLSearchParams;
      try {
        // A base é fictícia e só existe porque `new URL` exige uma: o `req.url`
        // de um upgrade é sempre relativo.
        const url = new URL(req.url ?? "/", "http://gateway.interno");
        caminho = url.pathname;
        consulta = url.searchParams;
      } catch {
        return; // URL impossível: deixa quem quiser lidar (ou o engine.io matar)
      }
      if (caminho !== CAMINHO) return; // `/socket.io` continua sendo do engine.io

      servidorWs.handleUpgrade(req, soquete, cabeca, (cliente) => {
        this.aoConectar(cliente, req, consulta);
      });
    };

    servidorHttp.on("upgrade", aoAtualizar);
    this.servidorWs = servidorWs;
    this.servidorHttp = servidorHttp;
    this.aoAtualizar = aoAtualizar;
    this.logger.log(`gateway compat no ar em ${CAMINHO} (v${VERSAO_DO_GATEWAY}, encoding=json)`);
  }

  /** Fecha todas as sessões (desligamento gracioso). */
  async desligar(): Promise<void> {
    for (const conexao of [...this.conexoes]) {
      // op 7 antes do close: é o jeito do Discord dizer "volta já" — a lib
      // reconecta e tenta RESUME em vez de tratar como queda.
      this.enviarBruto(conexao, OPCODE.RECONNECT, null);
      this.encerrarConexao(conexao, FECHAMENTO.ERRO_DESCONHECIDO, "servidor reiniciando");
    }
    this.conexoes.clear();

    if (this.servidorHttp && this.aoAtualizar) {
      this.servidorHttp.off("upgrade", this.aoAtualizar);
    }
    const servidorWs = this.servidorWs;
    this.servidorWs = null;
    this.servidorHttp = null;
    this.aoAtualizar = null;
    if (servidorWs) await new Promise<void>((pronto) => servidorWs.close(() => pronto()));
  }

  /** O `enableShutdownHooks` do `main.ts` já está ligado; é só pendurar aqui. */
  async onApplicationShutdown(): Promise<void> {
    await this.desligar();
  }

  // ── a conexão ──────────────────────────────────────────────

  private aoConectar(soquete: WebSocket, req: IncomingMessage, consulta: URLSearchParams): void {
    const conexao: Conexao = {
      soquete,
      requisicao: req,
      sessao: null,
      ocupada: false,
      morta: false,
      relogioZumbi: null,
    };
    this.conexoes.add(conexao);

    soquete.on("close", () => this.aoFechar(conexao));
    soquete.on("error", (erro) => {
      this.logger.debug(`socket do gateway compat com erro: ${(erro as Error).message}`);
    });
    soquete.on("message", (dado, ehBinario) => {
      void this.aoReceber(conexao, dado, ehBinario);
    });

    const encoding = consulta.get("encoding");
    if (encoding !== null && encoding !== "json") {
      // §13: só `json`. `etf` leva 4000 **com a razão**, para o dono ler no log
      // do bot em vez de adivinhar.
      this.encerrarConexao(
        conexao,
        FECHAMENTO.ERRO_DESCONHECIDO,
        `encoding "${encoding}" não suportado: o Streamz só fala json`,
      );
      return;
    }

    const compress = consulta.get("compress");
    if (compress) {
      // Funciona assim mesmo: a compressão é opcional por mensagem, e o
      // discord.py só descomprime `if type(msg) is bytes` (§7). O aviso existe
      // para quando alguém for depurar "por que está sem compressão".
      this.logger.warn(
        `bot pediu compress=${compress}; na F1 respondemos sempre quadro de texto (§7)`,
      );
    }

    // HELLO **na hora**: é o que põe `bytesWritten > 0` antes de o relógio do
    // engine.io disparar (risco (c) do §12).
    this.enviarBruto(conexao, OPCODE.HELLO, { heartbeat_interval: INTERVALO_DE_HEARTBEAT_MS });
    this.rearmarRelogioZumbi(conexao);
  }

  private async aoReceber(conexao: Conexao, dado: unknown, ehBinario: boolean): Promise<void> {
    if (conexao.morta) return;

    if (ehBinario) {
      this.encerrarConexao(conexao, FECHAMENTO.PAYLOAD_INVALIDO, "só aceitamos quadro de texto");
      return;
    }

    let quadro: Record<string, unknown>;
    try {
      const analisado: unknown = JSON.parse(String(dado));
      if (typeof analisado !== "object" || analisado === null || Array.isArray(analisado)) {
        throw new Error("quadro não é um objeto");
      }
      quadro = analisado as Record<string, unknown>;
    } catch {
      this.encerrarConexao(conexao, FECHAMENTO.PAYLOAD_INVALIDO, "quadro não é JSON válido");
      return;
    }

    const op = quadro.op;
    if (typeof op !== "number") {
      this.encerrarConexao(conexao, FECHAMENTO.OPCODE_INVALIDO, "quadro sem op");
      return;
    }

    try {
      await this.tratarOpcode(conexao, op, quadro.d);
    } catch (erro) {
      this.logger.error(
        `falha tratando op ${op} no gateway compat: ${(erro as Error).message}`,
        (erro as Error).stack,
      );
      this.encerrarConexao(conexao, FECHAMENTO.ERRO_DESCONHECIDO, "erro interno");
    }
  }

  private async tratarOpcode(conexao: Conexao, op: number, d: unknown): Promise<void> {
    switch (op) {
      case OPCODE.HEARTBEAT:
        this.rearmarRelogioZumbi(conexao);
        this.enviarBruto(conexao, OPCODE.HEARTBEAT_ACK, null);
        return;

      case OPCODE.IDENTIFY:
        await this.identificar(conexao, d);
        return;

      case OPCODE.RESUME:
        await this.retomar(conexao, d);
        return;

      // F2: a porta de entrada da voz. Sem sessão é um op 4 antes do IDENTIFY —
      // ignorado, como o Discord faz, em vez de fechar a conexão.
      case OPCODE.VOICE_STATE_UPDATE:
        if (!conexao.sessao) {
          this.logger.debug("op 4 antes do IDENTIFY: ignorado");
          return;
        }
        await this.voz.tratarAtualizacaoDeVoz(conexao.sessao, d);
        return;

      // Aceitos e ignorados de propósito. O op 3 é presence rica (§13: "aceitamos
      // e ignoramos") e o op 8 é F5. Fechar a conexão por causa deles
      // derrubaria bots que funcionam.
      case OPCODE.PRESENCE_UPDATE:
      case OPCODE.REQUEST_GUILD_MEMBERS:
        this.logger.debug(`op ${op} aceito e ignorado`);
        return;

      default:
        // Ops 0, 7, 9, 10 e 11 são só de saída; um cliente mandando um deles
        // está com defeito, e 4001 é exatamente esse recado.
        this.encerrarConexao(conexao, FECHAMENTO.OPCODE_INVALIDO, `op ${op} não é aceito aqui`);
    }
  }

  // ── op 2 ───────────────────────────────────────────────────

  private async identificar(conexao: Conexao, d: unknown): Promise<void> {
    if (conexao.sessao || conexao.ocupada) {
      this.encerrarConexao(conexao, FECHAMENTO.JA_AUTENTICADO, "esta conexão já se identificou");
      return;
    }

    const lido = lerIdentify(d);
    if (!lido.ok) {
      this.encerrarConexao(conexao, lido.codigo, lido.razao);
      return;
    }

    conexao.ocupada = true;
    try {
      const autenticado = await this.aplicativos.verificarToken(lido.corpo.token);
      if (!autenticado) {
        this.encerrarConexao(conexao, FECHAMENTO.TOKEN_INVALIDO, "token inválido ou revogado");
        return;
      }
      if (conexao.morta) return; // caiu durante a consulta

      this.logger.log(
        `IDENTIFY aceito: ${autenticado.application.name} (app ${autenticado.application.snowflake}), intents ${lido.corpo.intents}`,
      );
      if (lido.corpo.compress) {
        this.logger.warn("IDENTIFY pediu compress: true; respondemos texto assim mesmo (§7)");
      }

      const sessionId = randomBytes(16).toString("hex");
      const pronto = await this.montarPayloadDoReady(conexao, autenticado, sessionId);

      if (conexao.morta) return;

      const sessao = new SessaoWs({
        id: sessionId,
        botUserId: autenticado.botUserId,
        applicationId: autenticado.application.id,
        intents: lido.corpo.intents,
        aoEncerrar: (s) => this.registro.remover(s.id),
      });
      sessao.atender(conexao.soquete);
      conexao.sessao = sessao;
      this.registro.registrar(sessao);

      sessao.despachar("READY", pronto.ready);

      // O `GUILD_CREATE` logo atrás — é ele que resolve `client.once('ready')`
      // (§7). Um servidor que falha não pode levar os outros junto: o bot fica
      // com um servidor a menos, e não mudo.
      for (const servidor of pronto.servidores) {
        try {
          const payload = await this.ponte.montarGuildCreate(servidor.id, autenticado.botUserId);
          if (conexao.morta) return;
          sessao.despachar("GUILD_CREATE", payload);
        } catch (erro) {
          this.logger.error(
            `GUILD_CREATE de ${servidor.snowflake} falhou; o bot ficará sem esse servidor: ${(erro as Error).message}`,
          );
        }
      }
    } finally {
      conexao.ocupada = false;
    }
  }

  /**
   * O `d` do READY e a lista de servidores que o `GUILD_CREATE` vai percorrer.
   *
   * Depende do lote A (`servidoresDoBot`, `usuarioPorCuid`) e do lote C
   * (`usuarioParaDiscord`) — os três ainda lançam nesta branch, e é por isso que
   * a prova com discord.js de verdade é do coordenador, depois do merge.
   */
  private async montarPayloadDoReady(
    conexao: Conexao,
    autenticado: {
      application: { id: string; snowflake: bigint; name: string };
      botUserId: string;
    },
    sessionId: string,
  ): Promise<{ ready: JsonDoDiscord; servidores: { id: string; snowflake: bigint }[] }> {
    const [linhaDoBot, servidores] = await Promise.all([
      this.dados.usuarioPorCuid(autenticado.botUserId),
      this.dados.servidoresDoBot(autenticado.botUserId),
    ]);
    if (!linhaDoBot) {
      throw new Error(`o token vale, mas o usuário-bot ${autenticado.botUserId} sumiu do banco`);
    }

    const ready = montarReady({
      sessionId,
      // O espalhamento não é enfeite: `UsuarioDoDiscord` é uma interface, e
      // interface não ganha índice implícito — `{...x}` produz um tipo anônimo
      // que o `JsonDoDiscord` aceita, sem um `as` para varrer nada para baixo.
      usuario: { ...usuarioParaDiscord(linhaDoBot) },
      // O `application` do READY do Discord é `{id, flags}`; o discord.js só
      // precisa do `id` para construir o `ClientApplication`, e um `undefined`
      // aqui vira `TypeError` dentro da lib (§7).
      aplicacao: { id: String(autenticado.application.snowflake), flags: 0 },
      guildSnowflakes: servidores.map((s) => s.snowflake),
      resumeGatewayUrl: this.urlDeResume(conexao.requisicao),
    });

    return { ready, servidores };
  }

  // ── op 6 ───────────────────────────────────────────────────

  private async retomar(conexao: Conexao, d: unknown): Promise<void> {
    if (conexao.sessao || conexao.ocupada) {
      this.encerrarConexao(conexao, FECHAMENTO.JA_AUTENTICADO, "esta conexão já se identificou");
      return;
    }

    const lido = lerResume(d);
    if (!lido.ok) {
      this.encerrarConexao(conexao, lido.codigo, lido.razao);
      return;
    }

    conexao.ocupada = true;
    try {
      const autenticado = await this.aplicativos.verificarToken(lido.corpo.token);
      if (!autenticado) {
        this.encerrarConexao(conexao, FECHAMENTO.TOKEN_INVALIDO, "token inválido ou revogado");
        return;
      }
      if (conexao.morta) return;

      const sessao = this.registro.porId(lido.corpo.session_id);
      // Sessão de outro bot é tratada como sessão inexistente de propósito: o
      // dono do token não precisa saber que aquele id existe.
      if (
        !(sessao instanceof SessaoWs) ||
        sessao.botUserId !== autenticado.botUserId ||
        sessao.morta ||
        !sessao.podeReproduzir(lido.corpo.seq)
      ) {
        this.logger.log(`RESUME recusado para a sessão ${lido.corpo.session_id}: reidentifique`);
        // `d: false` = "não dá para retomar". A lib reidentifica sozinha.
        this.enviarBruto(conexao, OPCODE.INVALID_SESSION, false);
        return;
      }

      sessao.atender(conexao.soquete);
      conexao.sessao = sessao;
      const repostos = sessao.reproduzir(lido.corpo.seq);
      sessao.despachar("RESUMED", {});
      this.logger.log(
        `RESUME aceito na sessão ${sessao.id}: ${repostos} dispatch(es) repostos a partir de s=${lido.corpo.seq}`,
      );
    } finally {
      conexao.ocupada = false;
    }
  }

  // ── utilitários ────────────────────────────────────────────

  /**
   * Para onde o bot reconecta no RESUME.
   *
   * `GATEWAY_PUBLIC_URL` (a mesma variável do `GET /gateway/bot`) manda; sem
   * ela, deduzimos do `Host` da própria conexão, e assim o teste em
   * `http://localhost:3333` funciona sem configurar nada.
   */
  private urlDeResume(req: IncomingMessage): string {
    const configurada = process.env.GATEWAY_PUBLIC_URL?.trim();
    if (configurada) return configurada;

    const encaminhado = primeiroValor(req.headers["x-forwarded-host"]);
    const host = encaminhado ?? primeiroValor(req.headers.host) ?? "localhost";
    const protocolo = primeiroValor(req.headers["x-forwarded-proto"]);
    const esquema = protocolo?.split(",")[0]?.trim() === "https" ? "wss" : "ws";
    return `${esquema}://${host}${CAMINHO}`;
  }

  private enviarBruto(conexao: Conexao, op: number, d: unknown): void {
    if (conexao.morta) return;
    try {
      conexao.soquete.send(JSON.stringify({ op, d, s: null, t: null }));
    } catch (erro) {
      this.logger.debug(`não deu para escrever op ${op}: ${(erro as Error).message}`);
    }
  }

  /**
   * Fecha a conexão **e** mata a sessão: um close com código nosso é decisão
   * nossa, e nesses casos não há RESUME a preservar.
   */
  private encerrarConexao(conexao: Conexao, codigo: number, razao: string): void {
    if (conexao.morta) return;
    conexao.morta = true;
    this.limparRelogio(conexao);
    if (conexao.sessao) {
      conexao.sessao.fechar(codigo, razao);
    } else {
      try {
        conexao.soquete.close(codigo, razao.slice(0, 110));
      } catch {
        // socket já em pedaços
      }
    }
    this.conexoes.delete(conexao);
  }

  /**
   * O socket caiu por conta própria. A sessão **sobrevive** até o TTL para o
   * RESUME funcionar — é a diferença entre "o bot caiu" e "nós o expulsamos".
   */
  private aoFechar(conexao: Conexao): void {
    conexao.morta = true;
    this.limparRelogio(conexao);
    this.conexoes.delete(conexao);
    conexao.sessao?.desatar();
  }

  private rearmarRelogioZumbi(conexao: Conexao): void {
    this.limparRelogio(conexao);
    if (conexao.morta) return;
    conexao.relogioZumbi = setTimeout(() => {
      // 4009 é recuperável: a lib reconecta e tenta RESUME, e o buffer ainda
      // está lá. É o oposto de 4004.
      this.encerrarConexao(conexao, FECHAMENTO.SESSAO_EXPIRADA, "sem heartbeat");
    }, PACIENCIA_DE_HEARTBEAT_MS);
    conexao.relogioZumbi.unref?.();
  }

  private limparRelogio(conexao: Conexao): void {
    if (!conexao.relogioZumbi) return;
    clearTimeout(conexao.relogioZumbi);
    conexao.relogioZumbi = null;
  }
}

function primeiroValor(cabecalho: string | string[] | undefined): string | undefined {
  if (Array.isArray(cabecalho)) return cabecalho[0];
  return cabecalho;
}
