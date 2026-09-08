// Provas 1 e 3 da F3 (§12 do documento), com discord.js@14 de verdade.
//
//   1. O `deploy-commands.js` padrão do guia rodou (é o `deploy-commands.mjs`,
//      chamado antes deste script) e os comandos aparecem em
//      `GET /applications/:app/guilds/:gid/commands`.
//   3. Um bot com `interactionCreate` faz `deferReply()` e depois
//      `editReply('pong')`. As **duas etapas** aparecem no chat — a mensagem
//      "pensando…" e depois o texto — **pelo socket.io**, que é o que prova que
//      elas aparecem no navegador sem F5.
//
// A prova 2 (o `/play` no autocomplete do composer, com o avatar do bot) é
// visual e não cabe aqui: ela é print em Chromium headless, do lote C. E a
// prova 4 (os quatro erros) mora em `prova-f3-erros.mjs`, que roda **dentro**
// do contêiner da API: ela precisa do Prisma para ler o token de uma interação
// e para envelhecer uma linha 15 minutos — nenhuma das duas coisas passa pela
// rede, e nenhuma delas precisa de discord.js.
//
// Entrada: SEMENTE (JSON de `semear.mjs`), COMANDOS (JSON de
// `deploy-commands.mjs`) e API_URL.

import { Client, GatewayIntentBits } from "discord.js";
import { io } from "socket.io-client";

const semente = JSON.parse(process.env.SEMENTE);
const comandos = JSON.parse(process.env.COMANDOS);
const API = process.env.API_URL;
const BASE = API.replace(/\/api$/, "");

const passos = [];
const registrar = (nome, ok, detalhe) => {
  passos.push({ nome, ok, detalhe });
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
};

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function ate(condicao, ms, oQue) {
  const limite = Date.now() + ms;
  for (;;) {
    const v = condicao();
    if (v) return v;
    if (Date.now() >= limite) throw new Error(`tempo esgotado esperando: ${oQue}`);
    await esperar(200);
  }
}

/** O REST interno, como o navegador o chama (Bearer do dono). */
async function comoDono(rota, { metodo = "GET", corpo } = {}) {
  const r = await fetch(`${API}${rota}`, {
    method: metodo,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${semente.dono.accessToken}`,
    },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  });
  const texto = await r.text();
  return { status: r.status, corpo: texto ? JSON.parse(texto) : null };
}

// ── Prova 1: os comandos registrados aparecem na listagem ────
{
  const r = await fetch(
    `${API}/v10/applications/${semente.bot.applicationSnowflake}/guilds/${semente.servidor.snowflake}/commands`,
    { headers: { authorization: `Bot ${semente.bot.token}` } },
  );
  const lista = await r.json();
  const nomes = Array.isArray(lista) ? lista.map((c) => c.name).sort() : [];
  const certo =
    r.ok &&
    nomes.join(",") === "ping,play,volume" &&
    // o `ApplicationCommand` do discord.js lê estes sem `.get`
    lista.every((c) => c.id && c.application_id && c.name && c.description !== undefined);
  registrar(
    "1. deploy-commands.js do guia + GET applications/:app/guilds/:gid/commands",
    certo,
    `${r.status} ${nomes.join(", ")} (o PUT já tinha devolvido ${comandos.length})`,
  );
  if (!certo) process.exit(1);
}

// ── O "navegador": socket.io do dono, no canal da prova ──────
const socket = io(BASE, {
  auth: { token: semente.dono.accessToken },
  transports: ["websocket"],
  path: "/socket.io",
});
const novas = [];
const editadas = [];
socket.on("message.new", (m) => novas.push(m));
socket.on("message.updated", (m) => editadas.push(m));
await new Promise((ok, erro) => {
  socket.on("connect", ok);
  socket.on("connect_error", erro);
  setTimeout(() => erro(new Error("socket.io não conectou em 15 s")), 15_000);
});
socket.emit("channel.join", { channelId: semente.canal.id });
registrar("   socket.io do dono conectado (o 'navegador' da prova 3)", true);

// ── O bot: deferReply() e depois editReply('pong') ───────────
const cliente = new Client({
  intents: [GatewayIntentBits.Guilds],
  rest: { api: API, version: "10" },
});

if (process.env.DEBUG_DJS === "1") cliente.on("debug", (m) => console.log("[djs]", m));
cliente.on("error", (e) => console.error("[djs erro]", e));

const vistas = [];
cliente.on("interactionCreate", async (interacao) => {
  vistas.push({
    nome: interacao.commandName,
    tipo: interacao.type,
    usuario: interacao.user?.username,
    canal: interacao.channelId,
    opcoes: interacao.options?.data?.map((o) => [o.name, o.value]),
  });
  try {
    if (interacao.commandName === "play") {
      await interacao.deferReply();
      await esperar(1500); // um bot de música leva mais de 3 s; é o caso do defer
      await interacao.editReply("pong");
    } else {
      await interacao.reply("pong direto");
    }
  } catch (e) {
    console.error("[bot] falha ao responder:", e);
  }
});

const pronto = new Promise((ok, erro) => {
  cliente.once("clientReady", ok);
  cliente.once("ready", ok);
  setTimeout(() => erro(new Error("`ready` não disparou em 60 s")), 60_000);
});
await cliente.login(semente.bot.token);
await pronto;
registrar("   discord.js pronto", cliente.guilds.cache.size >= 1, `user=${cliente.user?.tag}`);

// ── Prova 3: /play pelo composer → "pensando…" e depois "pong" ──
const comandoIdInterno = await (async () => {
  // o composer manda o **cuid** do comando, que é o que `GET
  // /api/guilds/:id/comandos-de-app` devolve — a mesma rota que a web usa
  const { status, corpo } = await comoDono(`/guilds/${semente.servidor.id}/comandos-de-app`);
  if (status !== 200 || !Array.isArray(corpo)) {
    throw new Error(`GET comandos-de-app → ${status} ${JSON.stringify(corpo).slice(0, 300)}`);
  }
  const achado = corpo.find((c) => c.name === "play");
  if (!achado) throw new Error(`/play não veio em comandos-de-app: ${JSON.stringify(corpo)}`);
  registrar(
    "   GET /api/guilds/:id/comandos-de-app traz /play com o avatar do bot",
    !!achado.botUser && achado.description.length > 0,
    `${corpo.length} comandos; botUser=${achado.botUser?.username} avatarUrl=${achado.botUser?.avatarUrl ?? "null"}`,
  );
  return achado.id;
})();

novas.length = 0;
editadas.length = 0;

const disparo = await comoDono(`/channels/${semente.canal.id}/interactions`, {
  metodo: "POST",
  corpo: {
    commandId: comandoIdInterno,
    options: [{ name: "url", type: 3, value: "never gonna give you up" }],
  },
});
registrar(
  "   POST /api/channels/:id/interactions (o composer)",
  disparo.status === 200 || disparo.status === 201,
  `${disparo.status} ${JSON.stringify(disparo.corpo)}`,
);

try {
  const pensando = await ate(
    () => novas.find((m) => m.author?.bot === true && m.content.includes("pensando")),
    30_000,
    'a mensagem "pensando…" do deferReply()',
  );
  const pong = await ate(
    () => editadas.find((m) => m.id === pensando.id && m.content === "pong"),
    30_000,
    'a edição para "pong" do editReply()',
  );
  registrar(
    "3. deferReply() + editReply(): as duas etapas aparecem no chat, sem F5",
    true,
    `message.new="${pensando.content}" → message.updated="${pong.content}"; ` +
      `faixa interacao=${JSON.stringify(pensando.interacao ?? pong.interacao ?? null)}`,
  );
  registrar(
    "   a faixa \"usou /play\" veio no DTO da mensagem",
    !!(pong.interacao ?? pensando.interacao),
    JSON.stringify(pong.interacao ?? pensando.interacao ?? null),
  );
} catch (e) {
  registrar("3. deferReply() + editReply()", false, e.message);
  console.error(
    "   interações vistas pelo bot:",
    JSON.stringify(vistas),
    "\n   message.new:",
    JSON.stringify(novas.map((m) => [m.author?.username, m.content])),
    "\n   message.updated:",
    JSON.stringify(editadas.map((m) => [m.author?.username, m.content])),
  );
}

registrar(
  "   o INTERACTION_CREATE chegou íntegro no discord.js",
  vistas.length > 0 && vistas[0].nome === "play" && vistas[0].usuario === semente.dono.username,
  JSON.stringify(vistas),
);

socket.close();
await cliente.destroy();

const falhou = passos.some((p) => !p.ok);
console.log(falhou ? "\n=== ALGUMA PROVA DA F3 FALHOU ===" : "\n=== PROVAS 1 e 3 (discord.js): OK ===");
process.exit(falhou ? 1 : 0);
