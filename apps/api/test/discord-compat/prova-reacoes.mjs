// Prova 5 (F5): a reação chega ao bot como reação, e não como "a mensagem mudou".
//
//   5a. o "navegador" (socket.io do dono) reage numa mensagem → o bot emite
//       `messageReactionAdd` com o usuário, o emoji e a mensagem certos — e
//       **nenhum** `messageUpdate` (era o defeito da F1: o bot recebia
//       `MESSAGE_UPDATE` e a lib não disparava evento de reação nenhum);
//   5b. o bot reage de volta **pelo REST** (`PUT .../reactions/:emoji/@me`) →
//       o `message.updated` chega ao socket.io do dono com a reação do bot, ou
//       seja: aparece no navegador sem F5;
//   5c. `reaction.users.fetch()` (`GET .../reactions/:emoji`) devolve quem
//       reagiu — é a rota do bot de votação;
//   5d. o dono tira a reação → o bot emite `messageReactionRemove`.
//
// Roda num contêiner `node:22` com discord.js@14 e socket.io-client instalados
// na hora. Entrada: o JSON de `semear.mjs` em SEMENTE e a URL em API_URL.

import { Client, GatewayIntentBits, Partials } from "discord.js";
import { io } from "socket.io-client";

const semente = JSON.parse(process.env.SEMENTE);
const API = process.env.API_URL;
const BASE = API.replace(/\/api$/, "");

const POLEGAR = "👍";
const FESTA = "🎉";

const passos = [];
const registrar = (nome, ok, detalhe) => {
  passos.push({ nome, ok, detalhe });
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
};

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function ate(condicao, ms, oQue) {
  const limite = Date.now() + ms;
  for (;;) {
    const valor = condicao();
    if (valor) return valor;
    if (Date.now() >= limite) throw new Error(`tempo esgotado esperando: ${oQue}`);
    await esperar(200);
  }
}

// ── o socket.io do dono: é ele o "navegador" desta prova ─────
const socket = io(BASE, {
  auth: { token: semente.dono.accessToken },
  transports: ["websocket"],
  path: "/socket.io",
});
const novas = [];
const atualizadas = [];
const reacoesFinas = [];
socket.on("message.new", (m) => novas.push(m));
socket.on("message.updated", (m) => atualizadas.push(m));
// o evento fino que a F5 acrescentou; o web ainda o ignora, mas ele viaja
socket.on("reaction.added", (r) => reacoesFinas.push({ tipo: "add", ...r }));
socket.on("reaction.removed", (r) => reacoesFinas.push({ tipo: "remove", ...r }));

await new Promise((ok, erro) => {
  socket.on("connect", ok);
  socket.on("connect_error", erro);
  setTimeout(() => erro(new Error("socket.io não conectou em 15 s")), 15_000);
});
socket.emit("channel.join", { channelId: semente.canal.id });

// ── o bot ────────────────────────────────────────────────────
const cliente = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    // sem este intent o bot **não recebe reação nenhuma** — no Discord é
    // igual, e é a causa nº 1 de "meu bot de reaction roles não funciona"
    GatewayIntentBits.GuildMessageReactions,
  ],
  // reação em mensagem que o bot não tem em cache chega parcial; sem os
  // partials a lib engole o evento em silêncio
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User],
  rest: { api: API, version: "10" },
});
if (process.env.DEBUG_DJS === "1") cliente.on("debug", (m) => console.log("[djs]", m));
cliente.on("error", (e) => console.error("[djs erro]", e));

const adicionadas = [];
const removidas = [];
const atualizadasNoBot = [];
cliente.on("messageReactionAdd", (reacao, usuario) =>
  adicionadas.push({
    messageId: reacao.message.id,
    emoji: reacao.emoji.name,
    emojiId: reacao.emoji.id,
    userId: usuario.id,
  }),
);
cliente.on("messageReactionRemove", (reacao, usuario) =>
  removidas.push({ messageId: reacao.message.id, emoji: reacao.emoji.name, userId: usuario.id }),
);
cliente.on("messageUpdate", (_antes, depois) => atualizadasNoBot.push(depois?.id));

const pronto = new Promise((ok, erro) => {
  cliente.once("clientReady", ok);
  cliente.once("ready", ok);
  setTimeout(() => erro(new Error("`ready` não disparou em 60 s")), 60_000);
});
await cliente.login(semente.bot.token);
await pronto;
registrar("   bot pronto, com o intent GuildMessageReactions", cliente.guilds.cache.size >= 1);

// ── a mensagem em que se vai reagir ──────────────────────────
socket.emit("message.create", {
  channelId: semente.canal.id,
  content: "votem aqui",
  nonce: "prova-f5",
});
const mensagem = await ate(
  () => novas.find((m) => m.content === "votem aqui"),
  30_000,
  "o `message.new` da mensagem da prova",
);

// ── 5a. o dono reage pelo socket.io (é o que o navegador faz) ─
atualizadasNoBot.length = 0;
socket.emit("reaction.add", { messageId: mensagem.id, emoji: POLEGAR });

try {
  const recebida = await ate(
    () => adicionadas.find((r) => r.emoji === POLEGAR),
    30_000,
    "o `messageReactionAdd` do bot",
  );
  const certo =
    recebida.userId === semente.dono.snowflake && recebida.emojiId === null;
  registrar(
    "5a. reação feita no socket.io → o bot recebe messageReactionAdd",
    certo,
    `user_id=${recebida.userId} (esperado ${semente.dono.snowflake}) emoji=${recebida.emoji} emoji.id=${recebida.emojiId}`,
  );
} catch (e) {
  registrar("5a. reação feita no socket.io → o bot recebe messageReactionAdd", false, e.message);
}

// o outro lado da mesma prova: reação **não** é mais MESSAGE_UPDATE
await esperar(1000);
registrar(
  "5a'. e nenhum messageUpdate saiu por causa da reação",
  atualizadasNoBot.length === 0,
  `messageUpdate recebidos: ${atualizadasNoBot.length}`,
);

// o evento interno fino também viaja no socket.io
registrar(
  "5a''. o socket.io do dono também vê o `reaction.added`",
  reacoesFinas.some((r) => r.tipo === "add" && r.emoji === POLEGAR && r.messageId === mensagem.id),
  JSON.stringify(reacoesFinas),
);

// ── 5b. o bot reage de volta pelo REST ───────────────────────
atualizadas.length = 0;
reacoesFinas.length = 0;
const canal = await cliente.channels.fetch(semente.canal.snowflake);
const mensagemNoBot = await canal.messages.fetch(await snowflakeDaMensagem());
await mensagemNoBot.react(FESTA);

try {
  const eco = await ate(
    () =>
      atualizadas.find(
        (m) =>
          m.id === mensagem.id &&
          (m.reactions ?? []).some(
            (r) => r.emoji === FESTA && r.userIds?.includes(semente.bot.userId),
          ),
      ),
    30_000,
    "o `message.updated` com a reação do bot",
  );
  registrar(
    "5b. o bot reage pelo REST → o socket.io do dono recebe a reação (sem F5)",
    true,
    `reações agora: ${JSON.stringify(eco.reactions?.map((r) => [r.emoji, r.count]))}`,
  );
} catch (e) {
  registrar(
    "5b. o bot reage pelo REST → o socket.io do dono recebe a reação (sem F5)",
    false,
    `${e.message}. message.updated recebidos: ${JSON.stringify(atualizadas.map((m) => m.reactions))}`,
  );
}

// ── 5c. GET .../reactions/:emoji ─────────────────────────────
try {
  const reacaoDoPolegar = mensagemNoBot.reactions.cache.find((r) => r.emoji.name === POLEGAR);
  const usuarios = await reacaoDoPolegar.users.fetch();
  const temODono = usuarios.some((u) => u.id === semente.dono.snowflake);
  registrar(
    "5c. reaction.users.fetch() (GET .../reactions/:emoji) devolve quem reagiu",
    temODono,
    `ids: ${[...usuarios.keys()].join(",")} (dono=${semente.dono.snowflake})`,
  );
} catch (e) {
  registrar("5c. reaction.users.fetch() (GET .../reactions/:emoji) devolve quem reagiu", false, e.message);
}

// ── 5d. o dono tira a reação ─────────────────────────────────
socket.emit("reaction.remove", { messageId: mensagem.id, emoji: POLEGAR });
try {
  const tirada = await ate(
    () => removidas.find((r) => r.emoji === POLEGAR),
    30_000,
    "o `messageReactionRemove` do bot",
  );
  registrar(
    "5d. o dono desreage → o bot recebe messageReactionRemove",
    tirada.userId === semente.dono.snowflake,
    `user_id=${tirada.userId}`,
  );
} catch (e) {
  registrar("5d. o dono desreage → o bot recebe messageReactionRemove", false, e.message);
}

socket.close();
await cliente.destroy();

const falhou = passos.some((p) => !p.ok);
console.log(falhou ? "\n=== ALGUMA PROVA DA F5 FALHOU ===" : "\n=== PROVA 5 (REAÇÕES): OK ===");
process.exit(falhou ? 1 : 0);

/**
 * O snowflake da mensagem que o socket.io devolveu com o cuid.
 *
 * O `message.new` do socket.io fala em cuid (é o id do web); a REST do bot
 * fala em snowflake. A ponte entre os dois, aqui na prova, é o histórico: a
 * mensagem mais recente do canal com o mesmo conteúdo.
 */
async function snowflakeDaMensagem() {
  const resposta = await fetch(
    `${API}/v10/channels/${semente.canal.snowflake}/messages?limit=10`,
    { headers: { authorization: `Bot ${semente.bot.token}` } },
  );
  const lista = await resposta.json();
  const achada = lista.find((m) => m.content === "votem aqui");
  if (!achada) throw new Error(`a mensagem da prova não está no histórico: ${JSON.stringify(lista).slice(0, 300)}`);
  return achada.id;
}
