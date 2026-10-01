import { Events, type APIEmbed, type Client } from "discord.js";
import { LavalinkManager, type Player, type SearchResult, type Track } from "lavalink-client";
import type { ContextoDoBot } from "../runtime/tipos";
import { escaparMarkdown, truncar } from "./formatar";
import {
  MemoriaDeBloqueio,
  consultasAlternativas,
  ehFonteAlternativa,
} from "./fontes-alternativas";
import { embedDeInatividade } from "./embeds";
import { ArmazemDeConfiguracao } from "./configuracao";
import { RodizioDeTokens, ehBloqueioDoYoutube, tokensDoAmbiente } from "./tokens-do-youtube";

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

/** Teto de faixas de autoplay seguidas sem ninguém mexer: evita tocar para sempre numa call vazia. */
export const LIMITE_DE_AUTOPLAY_SEGUIDO = 20;

export class ServicoDeMusica {
  readonly manager: LavalinkManager;
  /** Servidores para os quais um `VOICE_SERVER_UPDATE` já chegou nesta sessão. */
  private readonly pontesVistas = new Set<string>();
  private readonly aguardando = new Map<string, (() => void)[]>();
  /** Contas do YouTube (ver `tokens-do-youtube.ts`). */
  readonly contasDoYoutube = new RodizioDeTokens(tokensDoAmbiente());
  /** Por servidor, a última faixa que já ganhou uma segunda tentativa. */
  private readonly jaTentouDeNovo = new Map<string, string>();
  /** Lembra por um tempo que o YouTube barrou o IP, para buscar em outra fonte. */
  private readonly youtubeBloqueado = new MemoriaDeBloqueio();
  /** Autoplay e 24/7, por servidor (ver `configuracao.ts`). */
  readonly configuracao = new ArmazemDeConfiguracao();
  /** Quantas faixas de autoplay seguidas cada servidor já tocou. */
  private readonly autoplaySeguidas = new Map<string, number>();
  /** A faixa (`encoded`) que o autoplay acabou de enfileirar; qualquer outra no `trackStart` é pedido manual. */
  private readonly autoplayPendente = new Map<string, string>();

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

    this.manager.nodeManager.on("connect", (no) => {
      this.ctx.log.info("lavalink conectado", {
        no: no.id,
        contasDoYoutube: this.contasDoYoutube.quantidade,
      });
      // O Lavalink não guarda o token entre reinícios: toda (re)conexão reenvia.
      const token = this.contasDoYoutube.ativo;
      if (token) void this.enviarTokenDoYoutube(token, "conexão com o lavalink");
    });
    this.manager.nodeManager.on("disconnect", (no, razao) =>
      this.ctx.log.aviso("lavalink caiu", { no: no.id, razao: JSON.stringify(razao ?? null) }),
    );
    this.manager.nodeManager.on("error", (no, erro) =>
      this.ctx.log.erro("lavalink com erro", { no: no.id, erro }),
    );

    this.manager.on("trackStart", (jogador, faixa) => {
      // Faixa que não é a do autoplay = alguém tocou algo: o contador recomeça.
      if (faixa?.encoded && this.autoplayPendente.get(jogador.guildId) !== faixa.encoded) {
        this.autoplaySeguidas.delete(jogador.guildId);
      }
      const novo = this.contasDoYoutube.registrarFaixa();
      if (novo) void this.enviarTokenDoYoutube(novo, "rodízio");
    });
    // `onEmptyQueue.destroyAfterMs` é do Manager inteiro; a lib agenda o destroy
    // num timer (`internal_queueempty`) **antes** de emitir `queueEnd`. Por
    // servidor, então, cancelamos esse timer aqui quando o 24/7 está ligado e
    // deixamos o autoplay tentar continuar. A lib não sai por canal vazio
    // (`onAllNeighboursLeave` não é usado), então só o timer precisa cair.
    this.manager.on("queueEnd", (jogador, faixa) => {
      void this.aoAcabarAFila(jogador, faixa as Track | null);
    });
    this.manager.on("playerDestroy", (jogador, motivo) => {
      this.autoplaySeguidas.delete(jogador.guildId);
      this.autoplayPendente.delete(jogador.guildId);
      // `QueueEmpty` só nasce do timer de fila vazia da lib; /parar, /desconectar
      // e troca de canal destroem com outro motivo, então não há falso positivo.
      if (motivo === "QueueEmpty") {
        void this.avisarNoCanal(jogador, { embeds: [embedDeInatividade()] });
      }
    });
    this.manager.on("trackError", (jogador, faixa, evento) => {
      void this.aoFalharFaixa(jogador, faixa as Track | null, evento.exception);
    });
    this.manager.on("trackStuck", (jogador, faixa, evento) => {
      this.ctx.log.aviso("faixa travada", {
        servidor: jogador.guildId,
        faixa: faixa?.info.title,
        limiteMs: evento.thresholdMs,
      });
      void this.avisarNoCanal(
        jogador,
        `**${nomeDaFaixa(faixa)}** travou sem mandar áudio; fui para a próxima.`,
      );
    });

    // `init` só **começa** a conexão com o nó. Não esperamos por ela: o bot tem
    // de subir, registrar comandos e responder mesmo com o Lavalink fora — é o
    // requisito desta fase. Quem checa se dá para tocar é `podeTocar()`.
    await this.manager.init({ id: cliente.user.id, username: cliente.user.username });
    this.ctx.log.info("cliente do lavalink iniciado", {
      no: configuracaoDoAmbiente().host,
      busca: plataformaDeBusca(),
    });
  }

  private async aoAcabarAFila(jogador: Player, ultima: Track | null) {
    try {
      const config = await this.configuracao.ler(jogador.guildId);
      if (config.vinte4Sete) {
        const timer = jogador.getData("internal_queueempty") as
          | ReturnType<typeof setTimeout>
          | undefined;
        if (timer) clearTimeout(timer);
        jogador.setData("internal_queueempty", undefined);
      }
      if (config.autoplay) await this.tocarParecida(jogador, ultima);
    } catch (erro) {
      this.ctx.log.erro("falha ao tratar o fim da fila", { servidor: jogador.guildId, erro });
    }
  }

  /**
   * Autoplay: uma faixa parecida com a última, uma por vez. Falha na busca
   * encerra em silêncio — o destroy da lib (ou o 24/7) segue o seu curso.
   */
  private async tocarParecida(jogador: Player, ultima: Track | null) {
    const guildId = jogador.guildId;
    const base = ultima ?? jogador.queue.previous[0] ?? null;
    if (!base) return;
    const seguidas = this.autoplaySeguidas.get(guildId) ?? 0;
    if (seguidas >= LIMITE_DE_AUTOPLAY_SEGUIDO) return;

    const jaTocadas = new Set(
      [base, ...jogador.queue.previous].map((t) => `${t.info.author}|${t.info.title}`.toLowerCase()),
    );
    const consultas = [`${base.info.author} ${base.info.title}`, `mix ${base.info.author}`];
    for (const consulta of consultas) {
      let achada: Track | undefined;
      try {
        const resultado = await this.buscar(jogador, consulta, base.requester);
        achada = resultado.tracks.find(
          (t) =>
            !t.info.isStream &&
            t.encoded !== base.encoded &&
            t.info.uri !== base.info.uri &&
            !jaTocadas.has(`${t.info.author}|${t.info.title}`.toLowerCase()),
        );
      } catch (erro) {
        this.ctx.log.aviso("autoplay: a busca falhou", { servidor: guildId, erro });
        return;
      }
      if (!achada) continue;
      // O jogador pode ter sido destruído durante a busca.
      if (this.manager.getPlayer(guildId) !== jogador || jogador.queue.current) return;
      this.autoplaySeguidas.set(guildId, seguidas + 1);
      if (achada.encoded) this.autoplayPendente.set(guildId, achada.encoded);
      await jogador.queue.add(achada);
      await jogador.play();
      this.ctx.log.info("autoplay", { servidor: guildId, faixa: achada.info.title });
      return;
    }
  }

  /**
   * Uma faixa não tocou. Sem isto a falha era muda: o bot dizia "tocando
   * agora", o `autoSkip` esvaziava a fila e o player sumia 30 s depois.
   *
   * Se foi o YouTube barrando a conta, a conta ativa fica de molho, a próxima
   * assume e a mesma faixa ganha **uma** segunda tentativa.
   */
  private async aoFalharFaixa(
    jogador: Player,
    faixa: Track | null,
    excecao: { message?: string | null; cause?: string; severity?: string } | undefined,
  ) {
    const mensagem = [excecao?.message, excecao?.cause].filter(Boolean).join(" | ");
    const bloqueio = ehBloqueioDoYoutube(mensagem);
    this.ctx.log.aviso("faixa não tocou", {
      servidor: jogador.guildId,
      faixa: faixa?.info.title,
      fonte: faixa?.info.sourceName,
      bloqueioDoYoutube: bloqueio,
      erro: truncar(mensagem, 500),
    });

    if (bloqueio && faixa?.encoded) {
      const novo = this.contasDoYoutube.barrarAtiva();
      const chave = faixa.encoded;
      if (novo && this.jaTentouDeNovo.get(jogador.guildId) !== chave) {
        this.jaTentouDeNovo.set(jogador.guildId, chave);
        const enviado = await this.enviarTokenDoYoutube(novo, "conta barrada pelo YouTube");
        if (enviado) {
          await this.tentarDeNovo(jogador, faixa);
          return;
        }
      }
      // Sem conta (ou contas esgotadas) o YouTube só vai falhar de novo: marca o
      // bloqueio para as próximas buscas já irem a outra fonte e tenta tocar esta
      // faixa por ela. Faixa que já veio de fonte alternativa não entra aqui, senão
      // uma falha dela dispararia outro fallback em laço.
      if (!ehFonteAlternativa(faixa.info.sourceName)) {
        this.youtubeBloqueado.marcar();
        const alternativa = await this.tocarPorFonteAlternativa(jogador, faixa);
        // Sucesso é silencioso: o log da fonte alternativa já registra, e o usuário
        // não precisa saber de qual fonte veio a música.
        if (alternativa) return;
      }
      // Detalhe de conta/bloqueio do YouTube é assunto do operador, não do usuário.
      await this.avisarNoCanal(
        jogador,
        `Não consegui tocar **${nomeDaFaixa(faixa)}** em nenhuma fonte agora. Tente outra música ou tente de novo mais tarde.`,
      );
      return;
    }

    await this.avisarNoCanal(
      jogador,
      `Não consegui tocar **${nomeDaFaixa(faixa)}**${
        excecao?.message ? `: ${escaparMarkdown(truncar(excecao.message, 150))}` : "."
      }`,
    );
  }

  /**
   * Toca de novo a faixa que falhou, sem perder a fila.
   *
   * Quando isto roda o `trackEnd` (`loadFailed`) já pode ter andado a fila: se
   * outra faixa virou a atual, ela volta para a frente antes de ser trocada.
   */
  private async tentarDeNovo(jogador: Player, faixa: Track) {
    try {
      const atual = jogador.queue.current;
      if (atual && atual.encoded !== faixa.encoded) await jogador.queue.add(atual, 0);
      await jogador.play({ clientTrack: faixa, noReplace: false });
      this.ctx.log.info("tentando a faixa de novo com outra conta", {
        servidor: jogador.guildId,
        faixa: faixa.info.title,
      });
    } catch (erro) {
      this.ctx.log.erro("a segunda tentativa falhou", { servidor: jogador.guildId, erro });
    }
  }

  /**
   * Procura a faixa que o YouTube recusou em outra fonte (SoundCloud, JioSaavn)
   * e toca a primeira que servir. Nunca lança: o chamador só quer saber se deu.
   */
  private async tocarPorFonteAlternativa(jogador: Player, faixa: Track): Promise<Track | null> {
    try {
      const original = faixa.info.duration ?? 0;
      for (const consulta of consultasAlternativas(faixa.info)) {
        // A lib monta "<source>:<query>" sozinha; separamos o prefixo para não
        // duplicá-lo.
        const corte = consulta.indexOf(":");
        const origem = corte > 0 ? consulta.slice(0, corte) : undefined;
        const termo = corte > 0 ? consulta.slice(corte + 1) : consulta;
        const resultado = (await jogador.search(
          origem ? { query: termo, source: origem as never } : { query: termo },
          faixa.requester,
        )) as SearchResult;
        const achada = resultado.tracks.find((t) => {
          if (!ehFonteAlternativa(t.info.sourceName)) return false;
          // Versão de outra duração costuma ser remix, cover ou trecho: melhor
          // tentar a próxima consulta do que tocar a errada.
          const duracao = t.info.duration ?? 0;
          if (original > 0 && duracao > 0 && Math.abs(duracao - original) / original > 0.4) {
            return false;
          }
          return true;
        });
        if (!achada) continue;

        const atual = jogador.queue.current;
        if (atual && atual.encoded !== faixa.encoded) await jogador.queue.add(atual, 0);
        await jogador.play({ clientTrack: achada, noReplace: false });
        this.ctx.log.info("fonte alternativa", {
          servidor: jogador.guildId,
          de: faixa.info.sourceName,
          para: achada.info.sourceName,
          faixa: faixa.info.title,
        });
        return achada;
      }
    } catch (erro) {
      this.ctx.log.erro("a fonte alternativa falhou", { servidor: jogador.guildId, erro });
    }
    return null;
  }

  /** `POST /youtube` do youtube-plugin: troca a conta que o Lavalink usa. */
  private async enviarTokenDoYoutube(token: string, motivo: string): Promise<boolean> {
    const cfg = configuracaoDoAmbiente();
    const url = `${cfg.secure ? "https" : "http"}://${cfg.host}:${cfg.port}/youtube`;
    try {
      const resposta = await fetch(url, {
        method: "POST",
        headers: { Authorization: cfg.authorization, "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: token, skipInitialization: true }),
      });
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
      // Nunca o token no log: é uma credencial de conta Google.
      this.ctx.log.info("conta do youtube enviada ao lavalink", { motivo });
      return true;
    } catch (erro) {
      this.ctx.log.erro("não consegui enviar a conta do youtube ao lavalink", { motivo, erro });
      return false;
    }
  }

  /** Escreve no canal de texto onde a música foi pedida. Falha em silêncio. */
  private async avisarNoCanal(jogador: Player, aviso: string | { embeds: APIEmbed[] }) {
    if (!jogador.textChannelId) return;
    try {
      const cliente = this.ctx.cliente as Client<true>;
      const canal = await cliente.channels.fetch(jogador.textChannelId);
      if (canal?.isTextBased() && canal.isSendable()) await canal.send(typeof aviso === "string" ? { content: aviso } : aviso);
    } catch (erro) {
      this.ctx.log.aviso("não consegui avisar no canal", { canal: jogador.textChannelId, erro });
    }
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
    // Com o YouTube barrando o IP, a busca por texto no YouTube acha faixas que
    // depois não tocam; o SoundCloud acha e toca. Link segue direto, sem prefixo.
    if (!/^https?:\/\//i.test(consulta.trim()) && this.youtubeBloqueado.ativo()) {
      return (await jogador.search(
        { query: consulta, source: "scsearch" as never },
        quemPediu,
      )) as SearchResult;
    }
    return (await jogador.search({ query: consulta }, quemPediu)) as SearchResult;
  }

  async desligar(): Promise<void> {
    for (const jogador of this.manager.players.values()) {
      await jogador.destroy("o bot está desligando").catch(() => undefined);
    }
  }
}

function nomeDaFaixa(faixa: Track | null | undefined): string {
  return escaparMarkdown(truncar(faixa?.info.title ?? "a faixa", 80));
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
