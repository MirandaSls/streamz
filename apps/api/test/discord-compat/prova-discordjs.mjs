// Provas 1, 2 e 3 da F1 (§12 do documento), num script só.
//
//   1. `curl -H "Authorization: Bot <t>" .../api/v10/users/@me` devolve o bot.
//   2. Um `new Client({intents, rest:{api, version:'10'}})` do discord.js@14
//      emite `ready` com `client.guilds.cache.size >= 1`.
//   3. Mandar `!ping` no canal **pelo socket.io, como o navegador faz** → o bot
//      responde `pong` via REST **e** o `message.new` da resposta chega no
//      socket.io. É esta terceira parte que prova que a resposta do bot aparece
//      no navegador sem F5 — por isso o script assina o socket.io de verdade,
//      em vez de confiar que "deve chegar".
//
// Roda num contêiner `node:22` com `discord.js@14` e `socket.io-client`
// instalados na hora (não entram no pnpm do monorepo: são ferramenta de prova,
// não dependência do produto). Ver `prova.sh`.
//
// Entrada: o JSON de `semear.mjs` em SEMENTE, e a URL da API em API_URL.

import { Client, GatewayIntentBits } from "discord.js";
import { io } from "socket.io-client";

const semente = JSON.parse(process.env.SEMENTE);
const API = process.env.API_URL; // ex.: http://localhost:3410/api
const BASE = API.replace(/\/api$/, "");

const passos = [];
const registrar = (nome, ok, detalhe) => {
  passos.push({ nome, ok, detalhe });
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
};

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Espera uma condição virar verdadeira, ou estoura. */
async function ate(condicao, ms, oQue) {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    if (condicao()) return;
    await esperar(200);
  }
  throw new Error(`tempo esgotado esperando: ${oQue}`);
}

// ── Prova 1: o REST responde ao token ────────────────────────
{
  const resposta = await fetch(`${API}/v10/users/@me`, {
    headers: { authorization: `Bot ${semente.bot.token}` },
  });
  const corpo = await resposta.json();
  const certo =
    resposta.ok && corpo.id === semente.bot.snowflake && corpo.bot === true;
  registrar(
    "1. GET /api/v10/users/@me com Authorization: Bot",
    certo,
    `${resposta.status} ${JSON.stringify(corpo)}`,
  );
  if (!certo) process.exit(1);
}

// ── O socket.io do dono, que é o navegador desta prova ───────
const socket = io(BASE, {
  auth: { token: semente.dono.accessToken },
  transports: ["websocket"],
  path: "/socket.io",
});
const recebidas = [];
socket.on("message.new", (m) => recebidas.push(m));
await new Promise((ok, erro) => {
  socket.on("connect", ok);
  socket.on("connect_error", erro);
  setTimeout(() => erro(new Error("socket.io não conectou em 15 s")), 15_000);
});
socket.emit("channel.join", { channelId: semente.canal.id });
registrar("   socket.io do dono conectado (o 'navegador' da prova 3)", true);

// ── Prova 2: o discord.js chega em ready ─────────────────────
const cliente = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  rest: { api: API, version: "10" },
});

// `debug` ligado desde o primeiro teste: é a mitigação do risco (a) do §12 —
// um GUILD_CREATE incompleto trava o `ready` sem erro nenhum.
if (process.env.DEBUG_DJS === "1") cliente.on("debug", (m) => console.log("[djs]", m));
cliente.on("error", (e) => console.error("[djs erro]", e));

cliente.on("messageCreate", (m) => {
  if (m.content === "!ping") void m.reply("pong");
});

const pronto = new Promise((ok, erro) => {
  cliente.once("clientReady", ok);
  cliente.once("ready", ok); // discord.js < 14.22 ainda usa este nome
  setTimeout(() => erro(new Error("`ready` não disparou em 60 s")), 60_000);
});

await cliente.login(semente.bot.token);
await pronto;

registrar(
  "2. discord.js emitiu ready",
  cliente.guilds.cache.size >= 1,
  `user=${cliente.user?.tag} guilds.cache.size=${cliente.guilds.cache.size} ` +
    `channels=${cliente.channels.cache.size}`,
);
if (cliente.guilds.cache.size < 1) {
  socket.close();
  await cliente.destroy();
  process.exit(1);
}

// ── Prova 3: !ping pelo socket.io → pong de volta no socket.io ──
recebidas.length = 0;
socket.emit("message.create", {
  channelId: semente.canal.id,
  content: "!ping",
  nonce: "prova-f1",
});

try {
  await ate(
    () => recebidas.some((m) => m.content === "pong" && m.author?.bot === true),
    30_000,
    "o `message.new` do pong",
  );
  registrar(
    "3. !ping pelo socket.io → pong do bot de volta pelo socket.io",
    true,
    `${recebidas.length} eventos: ${recebidas.map((m) => `${m.author?.username}:${m.content}`).join(" | ")}`,
  );
} catch (e) {
  registrar(
    "3. !ping pelo socket.io → pong do bot de volta pelo socket.io",
    false,
    `${e.message}. Recebidos: ${JSON.stringify(recebidas.map((m) => [m.author?.username, m.content]))}`,
  );
}

socket.close();
await cliente.destroy();

const falhou = passos.some((p) => !p.ok);
console.log(falhou ? "\n=== ALGUMA PROVA FALHOU ===" : "\n=== PROVAS 1-3: OK ===");
process.exit(falhou ? 1 : 0);
