// Prova das rotas de membro (F5), com um bot discord.js de verdade.
//
//   a. `member.roles.add/remove` dá e tira o cargo — e o **socket.io do dono**
//      recebe o `member.updated`, ou seja: a lista de membros do navegador muda
//      sem F5;
//   b. `member.timeout(60_000)` silencia (e o `communication_disabled_until`
//      volta preenchido);
//   c. `member.kick()` expulsa; `guild.bans.create/remove` bane, lista e
//      desbane;
//   d. `user.send("oi")` abre a DM e a mensagem chega ao socket.io de quem
//      recebeu;
//   e. `channel.bulkDelete(5)` apaga as cinco;
//   f. `channel.send({ embeds: [...] })` — mensagem **só com embed** — é aceita;
//   g. hierarquia e falta de permissão devolvem **50013** e o bot não age.
//
// Roda num contêiner `node:22` com discord.js@14 e socket.io-client instalados
// na hora. Entrada: o JSON de `semear-membros.mjs` em SEMENTE e a URL em
// API_URL.

import { Client, EmbedBuilder, GatewayIntentBits, Partials } from "discord.js";
import { io } from "socket.io-client";

const semente = JSON.parse(process.env.SEMENTE);
const API = process.env.API_URL;
const BASE = API.replace(/\/api$/, "");

const passos = [];
const registrar = (nome, ok, detalhe) => {
  passos.push({ nome, ok });
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

/** O código do `DiscordAPIError`, que é o que um bot de verdade lê. */
function codigoDoErro(erro) {
  return erro?.code ?? erro?.rawError?.code ?? null;
}

async function conectarSocket(accessToken) {
  const socket = io(BASE, {
    auth: { token: accessToken },
    transports: ["websocket"],
    path: "/socket.io",
  });
  await new Promise((ok, erro) => {
    socket.on("connect", ok);
    socket.on("connect_error", erro);
    setTimeout(() => erro(new Error("socket.io não conectou em 15 s")), 15_000);
  });
  return socket;
}

// ── os dois "navegadores" ────────────────────────────────────
const socketDoDono = await conectarSocket(semente.dono.accessToken);
const atualizacoes = [];
socketDoDono.on("member.updated", (e) => atualizacoes.push(e));
socketDoDono.emit("channel.join", { channelId: semente.canal.id });

const socketDoAlvo = await conectarSocket(semente.alvo.accessToken);
const dmsDoAlvo = [];
socketDoAlvo.on("message.new", (m) => dmsDoAlvo.push(m));

// ── os dois bots ─────────────────────────────────────────────
async function subirBot(token) {
  const cliente = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.GuildMember, Partials.User],
    rest: { api: API, version: "10" },
  });
  if (process.env.DEBUG_DJS === "1") cliente.on("debug", (m) => console.log("[djs]", m));
  cliente.on("error", (e) => console.error("[djs erro]", e));
  const pronto = new Promise((ok, erro) => {
    cliente.once("clientReady", ok);
    cliente.once("ready", ok);
    setTimeout(() => erro(new Error("`ready` não disparou em 60 s")), 60_000);
  });
  await cliente.login(token);
  await pronto;
  return cliente;
}

const bot = await subirBot(semente.bot.token);
const fraco = await subirBot(semente.botSemPoder.token);
registrar("   os dois bots estão prontos", bot.guilds.cache.size >= 1 && fraco.guilds.cache.size >= 1);

const servidor = await bot.guilds.fetch(semente.servidor.snowflake);
const canal = await bot.channels.fetch(semente.canal.snowflake);
const membro = await servidor.members.fetch(semente.alvo.snowflake);

// ── (a) dar e tirar cargo, e o navegador vendo ───────────────
try {
  atualizacoes.length = 0;
  await membro.roles.add(semente.cargos.visitante.snowflake);

  const eco = await ate(
    () => atualizacoes.find((e) => e.userId === semente.alvo.id && (e.roleIds ?? []).includes(semente.cargos.visitante.id)),
    30_000,
    "o `member.updated` com o cargo novo no socket.io do dono",
  );
  registrar(
    "a1. member.roles.add() dá o cargo E o socket.io do dono recebe (sem F5)",
    true,
    `roleIds=${JSON.stringify(eco.roleIds)}`,
  );

  const relido = await servidor.members.fetch({ user: semente.alvo.snowflake, force: true });
  registrar(
    "a2. e o GET do membro já traz o cargo",
    relido.roles.cache.has(semente.cargos.visitante.snowflake),
    `roles=${[...relido.roles.cache.keys()].join(",")}`,
  );

  atualizacoes.length = 0;
  await membro.roles.remove(semente.cargos.visitante.snowflake);
  const tirado = await ate(
    () => atualizacoes.find((e) => e.userId === semente.alvo.id && !(e.roleIds ?? []).includes(semente.cargos.visitante.id)),
    30_000,
    "o `member.updated` sem o cargo",
  );
  registrar("a3. member.roles.remove() tira, e o dono vê", !!tirado);
} catch (e) {
  registrar("a. dar/tirar cargo com eco no socket.io do dono", false, e.message);
}

// ── (g) hierarquia e falta de permissão ─────────────────────
try {
  await membro.roles.add(semente.cargos.chefia.snowflake);
  registrar("g1. cargo ACIMA do bot devia ser recusado", false, "a chamada passou");
} catch (e) {
  registrar(
    "g1. cargo acima do bot na hierarquia → 50013, e ele não age",
    codigoDoErro(e) === 50013,
    `code=${codigoDoErro(e)}`,
  );
}
try {
  const servidorFraco = await fraco.guilds.fetch(semente.servidor.snowflake);
  const membroFraco = await servidorFraco.members.fetch(semente.alvo.snowflake);
  await membroFraco.roles.add(semente.cargos.visitante.snowflake);
  registrar("g2. bot sem MANAGE_ROLES devia ser recusado", false, "a chamada passou");
} catch (e) {
  registrar(
    "g2. bot sem MANAGE_ROLES → 50013, e ele não age",
    codigoDoErro(e) === 50013,
    `code=${codigoDoErro(e)}`,
  );
}
try {
  const relido = await servidor.members.fetch({ user: semente.alvo.snowflake, force: true });
  // `roles.cache` do discord.js **inclui o @everyone** (cujo id lá é o do
  // servidor), então "sem cargo nenhum" é "só o @everyone"
  const vestidos = [...relido.roles.cache.keys()].filter((id) => id !== semente.servidor.snowflake);
  registrar(
    "g3. depois das duas recusas o membro continua sem cargo nenhum",
    vestidos.length === 0,
    `cargos além do @everyone: ${vestidos.join(",") || "(nenhum)"}`,
  );
} catch (e) {
  registrar("g3. depois das duas recusas o membro continua sem cargo nenhum", false, e.message);
}

// ── (b) castigo ──────────────────────────────────────────────
try {
  atualizacoes.length = 0;
  await membro.timeout(60_000, "prova de castigo");
  const relido = await servidor.members.fetch({ user: semente.alvo.snowflake, force: true });
  const ate60s = relido.communicationDisabledUntilTimestamp;
  registrar(
    "b. member.timeout(60_000) silencia (communication_disabled_until no futuro)",
    typeof ate60s === "number" && ate60s > Date.now(),
    `até ${ate60s ? new Date(ate60s).toISOString() : "null"}`,
  );
  registrar(
    "b'. e o socket.io do dono recebe o castigo",
    !!(await ate(
      () => atualizacoes.find((e) => e.userId === semente.alvo.id && e.timeoutUntil),
      15_000,
      "o `member.updated` do castigo",
    ).catch(() => false)),
  );
} catch (e) {
  registrar("b. member.timeout(60_000) silencia", false, e.message);
}

// ── (d) DM ───────────────────────────────────────────────────
try {
  dmsDoAlvo.length = 0;
  const usuario = await bot.users.fetch(semente.alvo.snowflake);
  const enviada = await usuario.send("oi, sou um bot");
  registrar("d1. user.send() abre a DM e devolve a mensagem", !!enviada?.id, `id=${enviada?.id}`);

  const chegou = await ate(
    () => dmsDoAlvo.find((m) => m.content === "oi, sou um bot"),
    30_000,
    "a DM no socket.io de quem recebeu",
  );
  registrar("d2. e ela chega ao socket.io de quem recebeu", !!chegou);
} catch (e) {
  registrar("d. user.send() cria a DM e a mensagem chega", false, e.message);
}

// ── (f) mensagem só com embed ────────────────────────────────
try {
  const embed = new EmbedBuilder()
    .setTitle("Nível 5")
    .setDescription("Parabéns!")
    .addFields({ name: "XP", value: "1200" });
  const so = await canal.send({ embeds: [embed] });
  registrar(
    "f. mensagem SÓ com embed é aceita (era 50035 content[BASE_TYPE_REQUIRED])",
    !!so?.id,
    // o que se loga é o `content` que a API devolveu (vazio num envio só com
    // embed: o texto achatado mora em `MessageBotPayload.flatText`, que não
    // sai no REST) e quantos embeds voltaram na mensagem
    `content devolvido: ${JSON.stringify(so?.content)} | embeds: ${so?.embeds?.length ?? 0}`,
  );
} catch (e) {
  registrar("f. mensagem só com embed é aceita", false, `code=${codigoDoErro(e)} ${e.message}`);
}

// ── (e) apagar em lote ───────────────────────────────────────
try {
  for (let i = 0; i < 5; i += 1) await canal.send(`lixo ${i}`);
  await esperar(500);
  const apagadas = await canal.bulkDelete(5);
  registrar(
    "e. channel.bulkDelete(5) apaga as cinco",
    apagadas.size === 5,
    `apagadas=${apagadas.size}`,
  );
} catch (e) {
  registrar("e. channel.bulkDelete(5) apaga", false, `code=${codigoDoErro(e)} ${e.message}`);
}

// ── (c) expulsar e banir ─────────────────────────────────────
try {
  await membro.kick("prova de expulsão");
  await esperar(500);
  const sumiu = await servidor.members
    .fetch({ user: semente.alvo.snowflake, force: true })
    .then(() => false)
    .catch((e) => codigoDoErro(e) === 10007 || codigoDoErro(e) === 10013);
  registrar("c1. member.kick() expulsa (e o membro some do GET)", sumiu);
} catch (e) {
  registrar("c1. member.kick() expulsa", false, `code=${codigoDoErro(e)} ${e.message}`);
}

try {
  await servidor.bans.create(semente.alvoBan.snowflake, {
    reason: "prova de banimento",
    deleteMessageSeconds: 3600,
  });
  const lista = await servidor.bans.fetch();
  registrar(
    "c2. guild.bans.create() bane e o banido aparece em guild.bans.fetch()",
    lista.some((b) => b.user.id === semente.alvoBan.snowflake),
    `banidos=${[...lista.keys()].join(",")}`,
  );

  await servidor.bans.remove(semente.alvoBan.snowflake);
  const depois = await servidor.bans.fetch();
  registrar("c3. guild.bans.remove() desbane", depois.size === 0, `banidos=${depois.size}`);

  try {
    await servidor.bans.remove(semente.alvoBan.snowflake);
    registrar("c4. desbanir de novo devia dar 10026", false, "a chamada passou");
  } catch (e) {
    registrar(
      "c4. desbanir quem não está banido → 10026 Unknown Ban",
      codigoDoErro(e) === 10026,
      `code=${codigoDoErro(e)}`,
    );
  }
} catch (e) {
  registrar("c2-c4. banir, listar e desbanir", false, `code=${codigoDoErro(e)} ${e.message}`);
}

socketDoDono.close();
socketDoAlvo.close();
await bot.destroy();
await fraco.destroy();

const falhou = passos.some((p) => !p.ok);
console.log(falhou ? "\n=== ALGUMA PROVA DE MEMBROS FALHOU ===" : "\n=== PROVA DE MEMBROS: OK ===");
process.exit(falhou ? 1 : 0);
