// A prova de ponta a ponta do lote B da F2: **o par de dispatches da voz**.
//
// Duas metades, e as duas contra um Streamz inteiro em contêiner:
//
//   A. **`discord.js@14` + `@discordjs/voice` de verdade.** `joinVoiceChannel()`
//      manda o op 4 pelo gateway e recebe os dois pacotes pelo adaptador de voz
//      do discord.js — o mesmo caminho de um bot de música, sem tocar em nada
//      interno da lib. É aqui que se confere o par, a ordem e cada campo.
//   B. **Uma sessão de gateway crua (`ws`)** para a **saída**. Ela existe porque
//      o `@discordjs/voice` **desregistra o adaptador** dentro do `destroy()`,
//      antes de a resposta chegar: o `VOICE_STATE_UPDATE` da saída existe (o log
//      da API mostra), mas não há mais por onde a lib o entregar. Como o que
//      precisa ser provado é "o estado sai **sem** o `VOICE_SERVER_UPDATE`
//      atrás", a sessão crua é o único jeito honesto de ver os dois lados da
//      afirmação — inclusive a ausência.
//
// **A ponte não precisa existir para esta prova.** O que se prova é que a API
// manda o par certo, com o conteúdo certo. Que o áudio sai do outro lado é o
// degrau 3 e o 4 da fase (lote A2 e coordenador). Por isso a metade A **não
// repassa** o `VOICE_SERVER_UPDATE` ao `@discordjs/voice`: repassar faria a lib
// tentar abrir um WS contra `PONTE_VOZ_ENDPOINT`, falhar no DNS e entrar num
// laço de reconexão que só enche o log de ruído.
//
// Entrada: o JSON de `semear.mjs` em SEMENTE, e a URL da API em API_URL.
// Ver `prova-op4.sh`.

import { Client, GatewayIntentBits } from "discord.js";
import { joinVoiceChannel } from "@discordjs/voice";
import WebSocket from "ws";

const semente = JSON.parse(process.env.SEMENTE);
const API = process.env.API_URL;
const ENDPOINT_ESPERADO = process.env.PONTE_VOZ_ENDPOINT ?? "voz.streamz.chat";
const URL_DO_GATEWAY = `${API.replace(/^http/, "ws").replace(/\/api$/, "")}/gateway`;

const passos = [];
const registrar = (nome, ok, detalhe) => {
  passos.push({ nome, ok });
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}${detalhe ? `\n       ${detalhe}` : ""}`);
};

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function ate(condicao, ms, oQue) {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    if (condicao()) return;
    await esperar(100);
  }
  throw new Error(`tempo esgotado esperando: ${oQue}`);
}

// ════ A. discord.js + @discordjs/voice ═══════════════════════

const cliente = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
  ],
  rest: { api: API, version: "10" },
});
if (process.env.DEBUG_DJS === "1") cliente.on("debug", (m) => console.log("[djs]", m));
cliente.on("error", (e) => console.error("[djs erro]", e));

const pronto = new Promise((ok, erro) => {
  cliente.once("clientReady", ok);
  cliente.once("ready", ok); // discord.js < 14.22 ainda usa este nome
  setTimeout(() => erro(new Error("`ready` não disparou em 60 s")), 60_000);
});
await cliente.login(semente.bot.token);
await pronto;
registrar("1. discord.js em ready", cliente.guilds.cache.size >= 1, `user=${cliente.user?.tag}`);

const servidor = cliente.guilds.cache.get(semente.servidor.snowflake);
if (!servidor) {
  console.log(`FALHA o servidor ${semente.servidor.snowflake} não entrou no cache`);
  process.exit(1);
}

// O canal de voz tem de estar no `GUILD_CREATE` — e com `bitrate`/`user_limit`,
// ou o discord.py levantaria KeyError (a lição da F1).
const canalDeVoz = servidor.channels.cache.get(semente.canalDeVoz.snowflake);
registrar(
  "2. o canal de voz veio no GUILD_CREATE",
  Boolean(canalDeVoz) && canalDeVoz.type === 2,
  `id=${semente.canalDeVoz.snowflake} type=${canalDeVoz?.type} bitrate=${canalDeVoz?.bitrate} userLimit=${canalDeVoz?.userLimit}`,
);
registrar(
  "   voice_states veio no GUILD_CREATE (vazio: ninguém na call ainda)",
  servidor.voiceStates.cache.size === 0,
  `${servidor.voiceStates.cache.size} estado(s)`,
);

const recebidos = []; // { tipo, d }, na ordem em que chegaram no fio

const adaptador = (metodos) =>
  servidor.voiceAdapterCreator({
    ...metodos,
    onVoiceStateUpdate(d) {
      recebidos.push({ tipo: "VOICE_STATE_UPDATE", d });
      metodos.onVoiceStateUpdate(d);
    },
    onVoiceServerUpdate(d) {
      recebidos.push({ tipo: "VOICE_SERVER_UPDATE", d });
      // **De propósito não repassamos** — ver o cabeçalho.
    },
  });

const conexao = joinVoiceChannel({
  channelId: semente.canalDeVoz.snowflake,
  guildId: semente.servidor.snowflake,
  adapterCreator: adaptador,
  selfDeaf: true,
  selfMute: false,
});
conexao.on("error", (e) => console.log("[voz] erro:", e.message));

const doTipo = (lista, tipo) => lista.find((p) => p.tipo === tipo)?.d ?? null;

try {
  await ate(
    () => doTipo(recebidos, "VOICE_STATE_UPDATE") && doTipo(recebidos, "VOICE_SERVER_UPDATE"),
    20_000,
    "os dois pacotes de voz",
  );
} catch (e) {
  registrar("3. op 4 → os dois dispatches", false, e.message);
  await cliente.destroy();
  process.exit(1);
}

const pacoteDeEstado = doTipo(recebidos, "VOICE_STATE_UPDATE");
const pacoteDeServidor = doTipo(recebidos, "VOICE_SERVER_UPDATE");
const ordem = recebidos.map((p) => p.tipo);

console.log("\n--- VOICE_STATE_UPDATE, como chegou no fio ---");
console.log(JSON.stringify(pacoteDeEstado, null, 2));
console.log("--- VOICE_SERVER_UPDATE, como chegou no fio ---");
console.log(
  JSON.stringify(
    {
      ...pacoteDeServidor,
      token: `${pacoteDeServidor.token.slice(0, 24)}… (${pacoteDeServidor.token.length} bytes)`,
    },
    null,
    2,
  ),
);
console.log("");

registrar("3. o par chegou, e nesta ordem", ordem.join(",") === "VOICE_STATE_UPDATE,VOICE_SERVER_UPDATE", ordem.join(" → "));
registrar(
  "4. VOICE_STATE_UPDATE: channel_id, user_id, session_id e member",
  pacoteDeEstado.channel_id === semente.canalDeVoz.snowflake &&
    pacoteDeEstado.user_id === semente.bot.snowflake &&
    typeof pacoteDeEstado.session_id === "string" &&
    pacoteDeEstado.session_id.length > 0 &&
    pacoteDeEstado.self_deaf === true &&
    pacoteDeEstado.self_mute === false &&
    Boolean(pacoteDeEstado.member?.user),
  `session_id=${pacoteDeEstado.session_id}`,
);
registrar(
  "5. VOICE_SERVER_UPDATE: guild_id e endpoint sem esquema e sem porta",
  pacoteDeServidor.guild_id === semente.servidor.snowflake &&
    pacoteDeServidor.endpoint === ENDPOINT_ESPERADO &&
    !pacoteDeServidor.endpoint.includes("://") &&
    !/:\d+$/.test(pacoteDeServidor.endpoint),
  `endpoint=${pacoteDeServidor.endpoint}`,
);

// ── O JWT: shape e tamanho (o risco nº 1 do §D5.8) ───────────
const jwt = pacoteDeServidor.token;
const corpo = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8"));
const campos = [
  "iss", "aud", "sub", "gid", "sid", "sala", "canal", "nome", "ident", "lk", "lkUrl", "iat", "exp",
];
registrar(
  "6. o JWT tem o shape do §3, e o `sid` é o session_id do dispatch",
  campos.every((c) => c in corpo) &&
    corpo.aud === "ponte-voz" &&
    corpo.iss === "streamz-api" &&
    corpo.sub === semente.bot.snowflake &&
    corpo.gid === semente.servidor.snowflake &&
    corpo.sid === pacoteDeEstado.session_id &&
    corpo.canal === semente.canalDeVoz.snowflake &&
    corpo.ident === `bot:${semente.bot.snowflake}` &&
    corpo.exp - corpo.iat === 900,
  `exp-iat=${corpo.exp - corpo.iat}s ident=${corpo.ident} sala=${corpo.sala}`,
);
console.log(`\n[medida] tamanho do JWT no fio: ${jwt.length} bytes (o §D5.8 alerta acima de 1 KB)`);
console.log(`[medida] token do LiveKit dentro dele: ${corpo.lk.length} bytes\n`);

// A lib vê o próprio bot na call — é o que põe o "BOT" na coluna do web.
registrar(
  "7. o discord.js passou a ver o bot no canal de voz",
  servidor.voiceStates.cache.get(semente.bot.snowflake)?.channelId ===
    semente.canalDeVoz.snowflake,
  `voiceStates.cache=${servidor.voiceStates.cache.size}`,
);

conexao.destroy();
await cliente.destroy();
await esperar(500);

// ════ B. sessão crua: a saída, e a **ausência** do par ═══════

console.log("── sessão de gateway crua: op 4 de entrada e de saída ──\n");

const quadros = [];
const soquete = new WebSocket(`${URL_DO_GATEWAY}?v=10&encoding=json`);
soquete.on("message", (dado) => quadros.push(JSON.parse(String(dado))));
await new Promise((ok, erro) => {
  soquete.once("open", ok);
  soquete.once("error", erro);
});

const despachos = (desde = 0) => quadros.slice(desde).filter((q) => q.op === 0);
const mandar = (op, d) => soquete.send(JSON.stringify({ op, d }));

mandar(2, { token: semente.bot.token, intents: 1 | (1 << 7), properties: { os: "linux" } });
await ate(() => despachos().some((q) => q.t === "GUILD_CREATE"), 20_000, "o GUILD_CREATE");

// Entrar de novo, agora pela sessão crua.
let marco = quadros.length;
mandar(4, {
  guild_id: semente.servidor.snowflake,
  channel_id: semente.canalDeVoz.snowflake,
  self_deaf: true,
  self_mute: false,
});
await ate(
  () => despachos(marco).some((q) => q.t === "VOICE_SERVER_UPDATE"),
  10_000,
  "o par de entrada na sessão crua",
);
registrar(
  "8. na sessão crua, o par sai na mesma ordem",
  despachos(marco)
    .map((q) => q.t)
    .join(",") === "VOICE_STATE_UPDATE,VOICE_SERVER_UPDATE",
  despachos(marco).map((q) => `s=${q.s} ${q.t}`).join(" → "),
);

// Sair: `channel_id: null`.
marco = quadros.length;
mandar(4, { guild_id: semente.servidor.snowflake, channel_id: null });
try {
  await ate(
    () => despachos(marco).some((q) => q.t === "VOICE_STATE_UPDATE"),
    10_000,
    "o VOICE_STATE_UPDATE da saída",
  );
  await esperar(1500); // dá tempo de um VOICE_SERVER_UPDATE indevido aparecer
  const daSaida = despachos(marco);
  console.log("--- VOICE_STATE_UPDATE da saída, como chegou no fio ---");
  console.log(JSON.stringify(daSaida[0].d, null, 2));
  console.log("");
  registrar(
    "9. sair: VOICE_STATE_UPDATE com channel_id null e **nada** atrás",
    daSaida.length === 1 &&
      daSaida[0].t === "VOICE_STATE_UPDATE" &&
      daSaida[0].d.channel_id === null &&
      daSaida[0].d.guild_id === semente.servidor.snowflake &&
      daSaida[0].d.user_id === semente.bot.snowflake,
    `dispatches depois do op 4 de saída: ${daSaida.map((q) => q.t).join(", ") || "(nenhum)"}`,
  );
} catch (e) {
  registrar("9. sair: VOICE_STATE_UPDATE com channel_id null", false, e.message);
}

// Um op 4 para um canal que não é de voz não pode render dispatch nenhum.
marco = quadros.length;
mandar(4, {
  guild_id: semente.servidor.snowflake,
  channel_id: semente.canal.snowflake, // o canal de TEXTO
  self_deaf: true,
  self_mute: false,
});
await esperar(1500);
registrar(
  "10. op 4 para canal de texto: nada sai, e a conexão continua de pé",
  despachos(marco).length === 0 && soquete.readyState === WebSocket.OPEN,
  `dispatches=${despachos(marco).map((q) => q.t).join(", ") || "(nenhum)"} readyState=${soquete.readyState}`,
);

soquete.close();
const falhou = passos.some((p) => !p.ok);
console.log(falhou ? "\n=== ALGUMA PROVA FALHOU ===" : "\n=== PROVA DO OP 4: OK ===");
process.exit(falhou ? 1 : 0);
