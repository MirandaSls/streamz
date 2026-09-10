import { Client, Events, GatewayIntentBits } from "discord.js";
import { criarLog } from "./log";
import { ligarComandos, registrarComandos } from "./comandos";
import { lerToken } from "./token";
import type { Bot, ContextoDoBot } from "./tipos";

/**
 * A URL da nossa API, no formato que o `@discordjs/rest` espera: **sem** o
 * `/v10`, que a lib acrescenta (`${api}/v${version}${rota}`).
 *
 * É a única linha que diferencia um bot do Streamz de um bot do Discord (§14
 * do `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md`). A URL do gateway não se
 * configura e nem precisa: o `WebSocketManager` a busca com um
 * `GET /gateway/bot` pelo **mesmo** REST.
 */
export function urlDaApi(): string {
  return (process.env.STREAMZ_API_URL ?? "http://localhost:3333/api").replace(/\/+$/, "");
}

/**
 * Os intents de todo bot oficial.
 *
 * `MessageContent` é obrigatório para o prefixo `!` e, no Streamz, **sempre
 * concedido** (§7 do documento: a razão da restrição no Discord — escala e
 * privacidade de milhões — não existe numa instância própria).
 */
const INTENTS_BASE = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
];

/** Um bot vivo: o cliente conectado e como desligá-lo. */
export interface BotEmExecucao {
  ctx: ContextoDoBot;
  desligar(): Promise<void>;
}

/**
 * Sobe um bot: conecta, registra os comandos, chama o `aoIniciar`.
 *
 * **Não** joga fora a promessa do `login`: quem chama espera o `ready` antes de
 * dizer que subiu, senão um erro de token viraria um container "saudável" que
 * nunca respondeu nada.
 */
export async function iniciarBot(id: string, bot: Bot): Promise<BotEmExecucao> {
  const log = criarLog(id);
  const cliente = new Client({
    intents: [...INTENTS_BASE, ...(bot.intents ?? [])],
    rest: { api: urlDaApi(), version: "10" },
  });
  const ctx: ContextoDoBot = { id, nome: bot.nome, cliente, log };

  // ── ciclo de vida, tudo em log estruturado ────────────────
  cliente.on(Events.Error, (erro) => log.erro("erro do cliente", { erro }));
  cliente.on(Events.Warn, (aviso) => log.aviso("aviso do cliente", { detalhe: aviso }));
  cliente.on(Events.ShardDisconnect, (evento) =>
    log.aviso("gateway caiu", { codigo: evento.code, motivo: evento.reason }),
  );
  cliente.on(Events.ShardReconnecting, () => log.info("reconectando ao gateway"));
  cliente.on(Events.ShardResume, () => log.info("sessão retomada"));
  if (process.env.BOTS_DEBUG === "1") cliente.on(Events.Debug, (m) => log.debug(m));

  ligarComandos(cliente, bot, ctx);

  const pronto = new Promise<void>((ok, falhou) => {
    cliente.once(Events.ClientReady, () => ok());
    // Um token recusado vira `Error` no `login()`, não aqui; este `once` cobre
    // o caso de o cliente morrer entre o login e o READY.
    cliente.once(Events.Error, falhou);
  });

  await entrarComRepeticao(cliente, lerToken(id), log);
  await pronto;

  log.info("conectado", {
    usuario: cliente.user?.tag,
    servidores: cliente.guilds.cache.size,
    api: urlDaApi(),
  });

  await registrarComandos(cliente, bot, ctx);
  await bot.aoIniciar?.(ctx);

  return {
    ctx,
    async desligar() {
      try {
        await bot.aoDesligar?.(ctx);
      } catch (erro) {
        log.erro("aoDesligar falhou", { erro });
      }
      await cliente.destroy();
      log.info("desligado");
    },
  };
}

/**
 * `login` com espera crescente.
 *
 * O motivo é banal e acontece toda vez: no `docker compose up` o container do
 * bot sobe junto com o da API, e os primeiros segundos dão `ECONNREFUSED`.
 * `restart: unless-stopped` resolveria com força bruta, mas cada reinício
 * recomeça o processo inteiro e polui o log; seis tentativas em ~1 min cobrem
 * a subida normal.
 *
 * **Token recusado (401) não se repete**: insistir com uma credencial inválida
 * só rende log e nunca funciona.
 */
async function entrarComRepeticao(
  cliente: Client,
  token: string,
  log: ReturnType<typeof criarLog>,
  tentativas = 6,
): Promise<void> {
  for (let n = 1; ; n++) {
    try {
      await cliente.login(token);
      return;
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      if (/token/i.test(mensagem) || /401/.test(mensagem)) {
        throw new Error(`token recusado pela API (${mensagem}). Provisione o bot de novo.`);
      }
      if (n >= tentativas) throw erro;
      const espera = Math.min(1000 * 2 ** (n - 1), 15_000);
      log.aviso("login falhou; tentando de novo", { tentativa: n, esperaMs: espera, erro });
      await new Promise((r) => setTimeout(r, espera));
    }
  }
}
