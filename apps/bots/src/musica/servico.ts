import { Events, type Client } from "discord.js";
import { LavalinkManager, type Player, type SearchResult, type Track } from "lavalink-client";
import type { ContextoDoBot } from "../runtime/tipos";

/**
 * O serviço de áudio do bot de música: o cliente do Lavalink e a ligação dele
 * com o gateway do Streamz.
 *
 * ## Por que Lavalink, e por que `lavalink-client`
 *
 * Lavalink v4 é o que o ecossistema usa e o que a §D5.8 do
 * `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` prevê: ele entrega quadros **Opus
 * de 20 ms a 48 kHz estéreo**, que é exatamente o que a ponte de voz repassa
 * ao LiveKit sem transcodificar. Foi esse caminho que a F2 provou com três
 * minutos de música sem picote.
 *
 * Entre os clientes de Node, `lavalink-client` contra `shoukaku`:
 *
 * - **Não depende de discord.js.** Ele fala com o gateway por um `sendToShard`
 *   que nós fornecemos e recebe os eventos crus por `sendRawData`. Isso
 *   importa aqui mais do que num bot do Discord: qualquer diferença da nossa
 *   casca de compatibilidade fica contida em duas funções nossas, e não numa
 *   integração que a lib faz por dentro.
 * - **Traz fila, repetição e embaralhamento prontos.** O `shoukaku` não tem
 *   fila de propósito ("bring your own queue"); com ele, metade dos comandos
 *   deste bot (`/fila`, `/remover`, `/embaralhar`, `/repetir`) seria código
 *   nosso — mais superfície para manter, sem nada em troca.
 * - **Só v4, e tipado.** É o que rodamos; e os tipos vêm no pacote.
 *
 * ## O que este arquivo resolve e o resto do bot não vê
 *
 * A **dependência da ponte de voz**. Um `/tocar` sem a ponte no ar não pode
 * travar: a API recusa assinar o token do `VOICE_SERVER_UPDATE` e apenas
 * registra no log (ver `gateway/voz.ts` na API), então o bot ficaria esperando
 * para sempre. Aqui nós olhamos o evento cru: se o `VOICE_SERVER_UPDATE`
 * daquele servidor não chegar em `LIMITE_DA_PONTE_MS`, o comando responde uma
 * frase clara em vez de pendurar.
 */

/** Quanto esperamos o `VOICE_SERVER_UPDATE` antes de dizer que a voz não está no ar. */
export const LIMITE_DA_PONTE_MS = 8_000;

/** O texto que o usuário vê quando falta a ponte. Um lugar só, para não divergir. */
export const SEM_PONTE_DE_VOZ =
  "A voz ainda não está configurada neste servidor: falta a **ponte de voz** do Streamz " +
  "(DNS `voz.streamz.chat` e a porta 7883/udp). Eu respondo a todos os comandos, mas " +
  "ainda não consigo tocar. Fale com quem administra o servidor.";

/** O texto de quando o Lavalink em si não está de pé. */
export const SEM_LAVALINK =
  "O serviço de áudio (Lavalink) não está respondendo. Sem ele eu não consigo buscar " +
  "nem tocar nada. Fale com quem administra o servidor.";

export interface ConfiguracaoDoLavalink {
  host: string;
  port: number;
  authorization: string;
  secure: boolean;
}

export function configuracaoDoAmbiente(): ConfiguracaoDoLavalink {
  return {
    host: process.env.LAVALINK_HOST?.trim() || "lavalink",
    port: Number(process.env.LAVALINK_PORT ?? 2333),
    authorization: process.env.LAVALINK_SENHA?.trim() || "streamz",
    secure: process.env.LAVALINK_SEGURO === "1",
  };
}

/**
 * De onde o bot busca quando o usuário digita texto em vez de um link.
 *
 * `ytsearch` (YouTube) é o padrão de todo bot de música e o que o Lavalink
 * entrega sem plugin nenhum. `LAVALINK_BUSCA` troca (`ytmsearch`, `scsearch`)
 * para quem quiser mudar sem recompilar.
 */
export function plataformaDeBusca(): string {
  return process.env.LAVALINK_BUSCA?.trim() || "ytsearch";
}

export class ServicoDeMusica {
  readonly manager: LavalinkManager;
  /** Servidores para os quais um `VOICE_SERVER_UPDATE` já chegou nesta sessão. */
  private readonly pontesVistas = new Set<string>();
  private readonly aguardando = new Map<string, (() => void)[]>();

  constructor(private readonly ctx: ContextoDoBot) {
    const cliente = ctx.cliente as Client<true>;
    this.manager = new LavalinkManager({
      nodes: [{ id: "principal", ...configuracaoDoAmbiente() }],
      // O caminho de volta ao gateway: é assim que o `op 4` sai daqui.
      sendToShard: (guildId, payload) => {
        const servidor = cliente.guilds.cache.get(guildId);
        // O `send` do shard aceita o payload cru do gateway; os tipos da lib e
        // os do discord.js descrevem a mesma coisa com nomes diferentes.
        servidor?.shard?.send(payload as never);
      },
      autoSkip: true,
      playerOptions: {
        defaultSearchPlatform: plataformaDeBusca() as never,
        // Bot de música não escuta ninguém (o token da ponte já vem com
        // `canSubscribe: false`); entrar surdo deixa isso explícito na coluna.
        onDisconnect: { autoReconnect: false, destroyPlayer: true },
        // Sem isto o player fica vivo e mudo depois da última faixa, ocupando
        // a call. Meio minuto dá tempo de pedir a próxima.
        onEmptyQueue: { destroyAfterMs: 30_000 },
      },
    });
  }

  /**
   * Liga o cliente do Lavalink ao gateway.
   *
   * O `raw` faz **duas** coisas: repassa o evento à lib (que é quem manda o
   * `PATCH /v4/sessions/.../players/...` com `token`/`endpoint`/`sessionId`) e
   * anota que a ponte respondeu para aquele servidor — ver `esperarPonte`.
   */
  async iniciar(): Promise<void> {
    const cliente = this.ctx.cliente as Client<true>;

    cliente.on(Events.Raw, (dado: { t?: string; d?: { guild_id?: string } }) => {
      if (dado?.t === "VOICE_SERVER_UPDATE" && dado.d?.guild_id) {
        this.marcarPonte(dado.d.guild_id);
      }
      void this.manager.sendRawData(dado as never);
    });

    this.manager.nodeManager.on("connect", (no) =>
      this.ctx.log.info("lavalink conectado", { no: no.id }),
    );
    this.manager.nodeManager.on("disconnect", (no, razao) =>
      this.ctx.log.aviso("lavalink caiu", { no: no.id, razao: JSON.stringify(razao ?? null) }),
    );
    this.manager.nodeManager.on("error", (no, erro) =>
      this.ctx.log.erro("lavalink com erro", { no: no.id, erro }),
    );

    // `init` só **começa** a conexão com o nó. Não esperamos por ela: o bot tem
    // de subir, registrar comandos e responder mesmo com o Lavalink fora — é o
    // requisito desta fase. Quem checa se dá para tocar é `podeTocar()`.
    await this.manager.init({ id: cliente.user.id, username: cliente.user.username });
    this.ctx.log.info("cliente do lavalink iniciado", {
      no: configuracaoDoAmbiente().host,
      busca: plataformaDeBusca(),
    });
  }

  /** Algum nó do Lavalink respondendo? */
  get lavalinkNoAr(): boolean {
    for (const no of this.manager.nodeManager.nodes.values()) {
      if (no.connected) return true;
    }
    return false;
  }

  /**
   * Espera o `VOICE_SERVER_UPDATE` daquele servidor.
   *
   * Devolve `true` se a ponte respondeu (agora ou antes, nesta sessão) e
   * `false` no estouro do relógio — que é o caso "a voz não está configurada".
   */
  esperarPonte(guildId: string, limiteMs = LIMITE_DA_PONTE_MS): Promise<boolean> {
    if (this.pontesVistas.has(guildId)) return Promise.resolve(true);
    return new Promise((resolver) => {
      const relogio = setTimeout(() => {
        this.removerEspera(guildId, avisar);
        resolver(false);
      }, limiteMs);
      const avisar = () => {
        clearTimeout(relogio);
        resolver(true);
      };
      const fila = this.aguardando.get(guildId) ?? [];
      fila.push(avisar);
      this.aguardando.set(guildId, fila);
    });
  }

  private marcarPonte(guildId: string) {
    this.pontesVistas.add(guildId);
    for (const avisar of this.aguardando.get(guildId) ?? []) avisar();
    this.aguardando.delete(guildId);
  }

  private removerEspera(guildId: string, alvo: () => void) {
    const fila = this.aguardando.get(guildId);
    if (!fila) return;
    const restante = fila.filter((f) => f !== alvo);
    if (restante.length === 0) this.aguardando.delete(guildId);
    else this.aguardando.set(guildId, restante);
  }

  jogador(guildId: string): Player | undefined {
    return this.manager.getPlayer(guildId);
  }

  /**
   * Busca. Link vira carga direta; texto vira busca na plataforma padrão.
   *
   * Link do **Spotify** entra aqui como texto de busca: o Spotify não entrega
   * áudio a terceiros, e é o que todo bot de música faz (§14 do documento). A
   * conversão do link em "artista - título" é do `LavaSrc` do Lavalink quando
   * ele está instalado; sem o plugin, o usuário recebe o aviso de
   * `comandos.ts` e uma busca pelo texto que digitou.
   */
  async buscar(jogador: Player, consulta: string, quemPediu: unknown): Promise<SearchResult> {
    return (await jogador.search({ query: consulta }, quemPediu)) as SearchResult;
  }

  async desligar(): Promise<void> {
    for (const jogador of this.manager.players.values()) {
      await jogador.destroy("o bot está desligando").catch(() => undefined);
    }
  }
}

/** A faixa, no formato que `formatar.ts` entende. */
export function dadosDaFaixa(faixa: Track) {
  return {
    titulo: faixa.info.title,
    autor: faixa.info.author,
    duracaoMs: faixa.info.duration,
    aoVivo: faixa.info.isStream,
  };
}

// ── A instância viva ────────────────────────────────────────────────────────
//
// Um módulo com estado, e não um parâmetro em cada comando: o `Contexto` do
// runtime é o contrato **comum** a todos os bots e não pode ganhar um campo
// "serviço de música". Como o processo roda um bot de música só, a variável de
// módulo é honesta — e `obterServico()` lança em vez de devolver `undefined`,
// para um comando nunca ver meio serviço.

let servico: ServicoDeMusica | null = null;

export function definirServico(novo: ServicoDeMusica | null) {
  servico = novo;
}

export function obterServico(): ServicoDeMusica {
  if (!servico) throw new Error("o serviço de música ainda não subiu");
  return servico;
}
