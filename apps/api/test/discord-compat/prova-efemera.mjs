// ── j-bots ── A prova da mensagem efêmera (`flags: 64`).
//
// Ela responde a uma pergunta só, e é a única que importa numa feature de
// privacidade: **quem recebeu?**
//
//   1. Controle. O bot responde a `/ping` **normalmente**. Os DOIS clientes
//      socket.io — o do invocador e o de outro membro do mesmo canal — recebem.
//      Sem este passo, o "o segundo não recebeu" do passo 2 não prova nada:
//      poderia ser um socket mudo, um canal errado, um join que não aconteceu.
//   2. A efêmera. O bot responde a `/play` com `ephemeral: true`. **Só** o
//      cliente do invocador recebe, com `efemera: true`; o segundo cliente fica
//      em silêncio durante toda a janela de espera.
//   3. `GET /api/channels/:id/messages` (o histórico que o navegador pede ao
//      abrir o canal) **não** lista a efêmera — nem para quem a recebeu. É o
//      que faz ela sumir no F5.
//   4. `editReply()` sobre uma efêmera continua efêmero: o `message.updated`
//      também vai só para o invocador.
//
// O segundo usuário é criado aqui (registro + convite + resgate) porque o
// `semear.mjs` semeia um dono só, e a F1 não precisava de dois.
//
// Entrada: SEMENTE (JSON de `semear.mjs`), COMANDOS (JSON de
// `deploy-commands.mjs`) e API_URL.

import { Client, GatewayIntentBits } from "discord.js";
import { io } from "socket.io-client";

const semente = JSON.parse(process.env.SEMENTE);
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

/** O REST interno, como o navegador o chama (Bearer de alguém). */
async function comoUsuario(token, rota, { metodo = "GET", corpo } = {}) {
  const r = await fetch(`${API}${rota}`, {
    method: metodo,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  });
  const texto = await r.text();
  return { status: r.status, corpo: texto ? JSON.parse(texto) : null };
}

const comoDono = (rota, opcoes) => comoUsuario(semente.dono.accessToken, rota, opcoes);

// ── o segundo membro do canal ────────────────────────────────

const sufixo = Math.random().toString(36).slice(2, 8);
const outro = { username: `vizinho-${sufixo}`, accessToken: null, id: null };
{
  const registro = await comoUsuario(null, "/auth/register", {
    metodo: "POST",
    corpo: {
      email: `${outro.username}@exemplo.invalido`,
      username: outro.username,
      password: "senha-de-teste-123",
    },
  });
  if (registro.status >= 400) {
    throw new Error(`registro do segundo usuário → ${registro.status} ${JSON.stringify(registro.corpo)}`);
  }
  outro.accessToken = registro.corpo.tokens.accessToken;
  outro.id = registro.corpo.user.id;

  const convite = await comoDono(`/guilds/${semente.servidor.id}/invites`, {
    metodo: "POST",
    corpo: {},
  });
  const resgate = await comoUsuario(outro.accessToken, `/invites/${convite.corpo.code}/redeem`, {
    metodo: "POST",
  });
  registrar(
    "0. um segundo membro no mesmo servidor e canal",
    convite.status < 400 && resgate.status < 400,
    `convite ${convite.status}, resgate ${resgate.status}, usuário ${outro.username}`,
  );
  if (convite.status >= 400 || resgate.status >= 400) process.exit(1);
}

// ── os dois "navegadores" ────────────────────────────────────

/** Um cliente socket.io logado, no canal da prova, guardando o que chega. */
async function navegador(nome, token) {
  const socket = io(BASE, {
    auth: { token },
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
    setTimeout(() => erro(new Error(`socket.io de ${nome} não conectou em 15 s`)), 15_000);
  });
  socket.emit("channel.join", { channelId: semente.canal.id });
  return { nome, socket, novas, editadas };
}

const invocador = await navegador("invocador", semente.dono.accessToken);
const vizinho = await navegador("vizinho", outro.accessToken);
registrar("   os dois clientes socket.io conectados e no canal", true);

// ── o bot ────────────────────────────────────────────────────

const cliente = new Client({
  intents: [GatewayIntentBits.Guilds],
  rest: { api: API, version: "10" },
});
cliente.on("error", (e) => console.error("[djs erro]", e));

cliente.on("interactionCreate", async (interacao) => {
  try {
    if (interacao.commandName === "play") {
      // é o que o guia do discord.js manda escrever para uma resposta privada
      await interacao.reply({ content: "só você vê", ephemeral: true });
      await esperar(500);
      await interacao.editReply("só você vê (editado)");
    } else {
      await interacao.reply("pong para todos");
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

// os cuids dos comandos, que é o que o composer manda
const comandos = await comoDono(`/guilds/${semente.servidor.id}/comandos-de-app`);
const idDe = (nome) => comandos.corpo.find((c) => c.name === nome)?.id;

/** Dispara um comando pelo composer do invocador. */
async function digitar(nome, opcoes = []) {
  const r = await comoDono(`/channels/${semente.canal.id}/interactions`, {
    metodo: "POST",
    corpo: { commandId: idDe(nome), options: opcoes },
  });
  if (r.status >= 400) throw new Error(`POST interactions /${nome} → ${r.status}`);
}

// ── 1. controle: resposta normal chega nos DOIS ──────────────

for (const n of [invocador, vizinho]) {
  n.novas.length = 0;
  n.editadas.length = 0;
}
await digitar("ping");

try {
  await ate(() => invocador.novas.find((m) => m.content === "pong para todos"), 30_000, "o pong no invocador");
  await ate(() => vizinho.novas.find((m) => m.content === "pong para todos"), 30_000, "o pong no vizinho");
  registrar(
    "1. controle: resposta NORMAL do bot chega nos dois clientes",
    true,
    "sem este passo o silêncio do passo 2 não provaria nada",
  );
} catch (e) {
  registrar("1. controle: resposta NORMAL do bot chega nos dois clientes", false, e.message);
}

// ── 2. a efêmera: só o invocador ─────────────────────────────

for (const n of [invocador, vizinho]) {
  n.novas.length = 0;
  n.editadas.length = 0;
}
await digitar("play", [{ name: "url", type: 3, value: "never gonna give you up" }]);

let efemera = null;
try {
  efemera = await ate(
    () => invocador.novas.find((m) => m.content === "só você vê"),
    30_000,
    "a efêmera no invocador",
  );
  registrar(
    "2a. o invocador recebe a efêmera, com `efemera: true`",
    efemera.efemera === true,
    `id=${efemera.id} efemera=${efemera.efemera} faixa=${JSON.stringify(efemera.interacao?.name ?? null)}`,
  );
} catch (e) {
  registrar("2a. o invocador recebe a efêmera", false, e.message);
}

// a janela é generosa de propósito: um vazamento que demora não deixa de ser
// um vazamento
await esperar(4000);
registrar(
  "2b. o segundo usuário, no mesmo canal, NÃO recebe nada",
  vizinho.novas.length === 0 && vizinho.editadas.length === 0,
  `message.new=${JSON.stringify(vizinho.novas.map((m) => m.content))} ` +
    `message.updated=${JSON.stringify(vizinho.editadas.map((m) => m.content))}`,
);

// ── 3. o histórico não a lista ───────────────────────────────

{
  const historico = await comoDono(`/channels/${semente.canal.id}/messages`);
  const lista = Array.isArray(historico.corpo) ? historico.corpo : [];
  const achou = efemera ? lista.some((m) => m.id === efemera.id) : false;
  const temAEfemera = lista.some((m) => (m.content ?? "").startsWith("só você vê"));
  registrar(
    "3. GET /api/channels/:id/messages não lista a efêmera (é o F5 que a apaga)",
    !achou && !temAEfemera,
    `${lista.length} mensagens: ${JSON.stringify(lista.map((m) => m.content))}`,
  );
}

// ── 4. o editReply() continua efêmero ────────────────────────

try {
  const editada = await ate(
    () => invocador.editadas.find((m) => m.content === "só você vê (editado)"),
    30_000,
    "o editReply() da efêmera no invocador",
  );
  registrar(
    "4. `editReply()` de uma efêmera também vai só para o invocador",
    editada.efemera === true && vizinho.editadas.length === 0,
    `invocador=${editada.content} vizinho=${vizinho.editadas.length} evento(s)`,
  );
} catch (e) {
  registrar("4. `editReply()` de uma efêmera também vai só para o invocador", false, e.message);
}

invocador.socket.close();
vizinho.socket.close();
await cliente.destroy();

const falhou = passos.some((p) => !p.ok);
console.log(
  falhou ? "\n=== A PROVA DA EFÊMERA FALHOU ===" : "\n=== PROVA DA MENSAGEM EFÊMERA: OK ===",
);
process.exit(falhou ? 1 : 0);
