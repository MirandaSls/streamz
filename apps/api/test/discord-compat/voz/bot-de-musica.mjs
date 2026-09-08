// O bot de música do degrau 4 (§12 F2): discord.js + Lavalink v4, apontado
// para o Streamz em vez do Discord.
//
// É a prova de verdade da fase — "um bot de música do Discord entra no canal e
// o som sai no navegador". `!play <url>` por mensagem, e não `/play`, porque
// interactions são a F3.
//
// Ambiente:
//   SEMENTE          o JSON de uma linha do `semear.mjs` (token, ids, snowflakes)
//   API_URL          http://<api>:3333/api
//   CANAL_DE_VOZ     snowflake do canal de voz onde entrar
//   LAVALINK_HOST    lavalink:2333
//   LAVALINK_SENHA   a senha do application.yml
//   MUSICA           URL do áudio a tocar (o servidor http do ambiente de prova)
//   SEGUNDOS         quanto tempo ficar tocando antes de sair (padrão 200)
//
// Sai com 0 se tocou, 1 se qualquer degrau do caminho falhou — e o log diz
// **qual**, porque um bot de música mudo é o defeito mais difícil de depurar
// que existe: nada dá erro, simplesmente não sai som.

import { Client, GatewayIntentBits } from "discord.js";
import { Shoukaku, Connectors } from "shoukaku";

const semente = JSON.parse(process.env.SEMENTE ?? "{}");
const API_URL = process.env.API_URL ?? semente.api;
const CANAL_DE_VOZ = process.env.CANAL_DE_VOZ;
const MUSICA = process.env.MUSICA;
const SEGUNDOS = Number(process.env.SEGUNDOS ?? 200);

for (const [nome, valor] of Object.entries({ API_URL, CANAL_DE_VOZ, MUSICA })) {
  if (!valor) {
    console.error(`falta ${nome}`);
    process.exit(2);
  }
}

const base = API_URL.replace(/\/$/, "");

// É isto que aponta o bot para o Streamz — os dois campos do §14 do documento.
// O `version: "10"` importa: sem ele o `@discordjs/rest` monta `/api/v10` por
// cima da nossa base e o caminho sai duplicado.
const cliente = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    // Sem este o Lavalink nunca vê o VOICE_STATE_UPDATE e o player fica
    // esperando para sempre (§14, "Lavalink").
    GatewayIntentBits.GuildVoiceStates,
  ],
  rest: { api: base, version: "10" },
});

const shoukaku = new Shoukaku(
  new Connectors.DiscordJS(cliente),
  [
    {
      name: "principal",
      url: process.env.LAVALINK_HOST ?? "lavalink:2333",
      auth: process.env.LAVALINK_SENHA ?? "senha-de-teste",
    },
  ],
  { moveOnDisconnect: false, resume: false, reconnectTries: 2 },
);

let falhou = null;
shoukaku.on("error", (_no, erro) => {
  falhou = `lavalink: ${erro?.message ?? erro}`;
  console.error("[lavalink] erro:", erro?.message ?? erro);
});
shoukaku.on("ready", (no) => console.log(`[lavalink] nó ${no} pronto`));
shoukaku.on("close", (no, codigo, razao) =>
  console.log(`[lavalink] nó ${no} fechou: ${codigo} ${razao}`),
);
shoukaku.on("disconnect", (no, contagem) =>
  console.log(`[lavalink] nó ${no} desconectou (${contagem} players)`),
);

cliente.on("debug", (m) => {
  // Só o que interessa: o resto do debug do discord.js é um dilúvio.
  if (/VOICE|voice|Session|Ready/i.test(m)) console.log("[djs]", m.slice(0, 300));
});
cliente.on("error", (e) => console.error("[djs] erro:", e.message));

const pronto = new Promise((resolve, reject) => {
  cliente.once("clientReady", resolve);
  cliente.once("ready", resolve); // discord.js < 14.22 ainda usa este
  setTimeout(() => reject(new Error("o `ready` não veio em 60 s")), 60_000);
});

console.log(`[bot] login em ${base}…`);
await cliente.login(semente.bot.token);
await pronto;
console.log(`[bot] pronto como ${cliente.user.tag}; servidores: ${cliente.guilds.cache.size}`);

const guildId = semente.servidor.snowflake;
const servidor = cliente.guilds.cache.get(guildId);
if (!servidor) {
  console.error(`[bot] o servidor ${guildId} não está no cache — o GUILD_CREATE não chegou`);
  process.exit(1);
}

// Espera o nó do Lavalink; sem ele o `joinVoiceChannel` estoura com uma
// mensagem que não ajuda ninguém.
await new Promise((resolve, reject) => {
  if (shoukaku.nodes.get("principal")?.state === 2) return resolve();
  shoukaku.once("ready", resolve);
  setTimeout(() => reject(new Error("o nó do Lavalink não ficou pronto em 30 s")), 30_000);
});

console.log(`[bot] entrando no canal de voz ${CANAL_DE_VOZ}…`);
const player = await shoukaku.joinVoiceChannel({
  guildId,
  channelId: CANAL_DE_VOZ,
  shardId: 0,
  deaf: true,
});
console.log("[bot] conexão de voz estabelecida (o Lavalink recebeu endpoint+token+sessionId)");

const resultado = await player.node.rest.resolve(MUSICA);
if (!resultado || resultado.loadType === "empty" || resultado.loadType === "error") {
  console.error(`[bot] o Lavalink não resolveu ${MUSICA}: ${JSON.stringify(resultado).slice(0, 400)}`);
  process.exit(1);
}
const faixa =
  resultado.loadType === "track" ? resultado.data : (resultado.data.tracks ?? resultado.data)[0];
console.log(`[bot] faixa: ${faixa.info?.title ?? "(sem título)"} (${faixa.info?.length ?? "?"} ms)`);

player.on("start", () => console.log("[bot] TOCANDO"));
player.on("end", (d) => console.log(`[bot] faixa terminou: ${d?.reason}`));
player.on("exception", (d) => {
  falhou = `exceção do player: ${d?.exception?.message}`;
  console.error("[bot]", falhou);
});
player.on("stuck", () => {
  falhou = "o player travou (stuck)";
  console.error("[bot]", falhou);
});

await player.playTrack({ track: { encoded: faixa.encoded } });

// `!play` de verdade, para o log mostrar que o caminho por mensagem funciona —
// é o que um dono de bot vai fazer.
cliente.on("messageCreate", async (msg) => {
  if (!msg.content.startsWith("!play ")) return;
  const url = msg.content.slice(6).trim();
  console.log(`[bot] !play recebido de ${msg.author.username}: ${url}`);
  const r = await player.node.rest.resolve(url);
  const t = r.loadType === "track" ? r.data : (r.data.tracks ?? r.data)[0];
  if (t) await player.playTrack({ track: { encoded: t.encoded } });
  await msg.reply(t ? `tocando: ${t.info?.title}` : "não achei essa");
});

console.log(`[bot] tocando por ${SEGUNDOS} s…`);
await new Promise((r) => setTimeout(r, SEGUNDOS * 1000));

if (falhou) {
  console.error(`[bot] VEREDITO: FALHOU — ${falhou}`);
  process.exit(1);
}
console.log("[bot] VEREDITO: o bot tocou até o fim do período sem exceção");
await shoukaku.leaveVoiceChannel(guildId);
await cliente.destroy();
process.exit(0);
