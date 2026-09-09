// Prova da F4 (lote B): instalar um aplicativo pela rota e ver o bot **entrar**.
//
// É a prova de que a fase entrega o que o usuário pediu — "qualquer um encontra
// o bot em Descobrir aplicativos e o adiciona ao servidor escolhendo
// permissões" — e não só de que as rotas respondem 200.
//
// O que ela prende, em ordem:
//
//   1. o diretório: `GET /applications/publicas` devolve o app publicado, e a
//      rota **não** é engolida pelo `GET /applications/:id` (é o defeito de
//      ordem de declaração do §3.2, que responde 404 sem nada no log);
//   2. o bot conecta **antes** da instalação e vê `guilds.cache.size === 0` —
//      é o que faz o passo seguinte ser uma observação, e não uma coincidência;
//   3. `POST /guilds/:id/aplicativos` → o `guildCreate` do discord.js dispara
//      **na sessão já aberta**, sem reconectar. É o `GUILD_CREATE` do §3.4;
//   4. `!ping` no canal, mandado pelo socket.io como o navegador faz → o bot
//      responde `pong`, e o `message.new` da resposta volta pelo socket.io;
//   5. o cargo gerenciado existe, com **as permissões escolhidas**, e o
//      usuário-bot o está vestindo;
//   6. `DELETE` → `guildDelete` dispara, o membro sai e o cargo some;
//   7. quem não tem `MANAGE_GUILD` leva **403** da rota;
//   8. **a junção A↔B**, ligada na integração da fase: `GET
//      /applications/:id/servidores` enxerga a instalação, e `DELETE
//      /applications/:id` (apagar o aplicativo pelo portal) tira o bot de cada
//      servidor onde ele está — com `GUILD_DELETE`, o cargo apagado e o membro
//      fora da lista. Era o `[]` e o `TODO` que os PRs dos lotes A e B
//      deixaram anotados como "inerte", e que só a integração podia fechar.
//
// Roda num contêiner `node:22` com `discord.js@14` e `socket.io-client`
// instalados na hora (são ferramenta de prova, não dependência do produto).
//
// Entrada: `API_URL` e `SEMENTE` — o JSON de `semear-f4.mjs`.

import { Client, GatewayIntentBits } from "discord.js";
import { io } from "socket.io-client";

const semente = JSON.parse(process.env.SEMENTE);
const API = process.env.API_URL;
const BASE = API.replace(/\/api$/, "");

let falhas = 0;
const registrar = (nome, ok, detalhe) => {
  if (!ok) falhas++;
  console.log(`${ok ? "OK   " : "FALHA"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
};

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function ate(condicao, ms, oQue) {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    if (condicao()) return true;
    await esperar(200);
  }
  console.log(`     (tempo esgotado esperando: ${oQue})`);
  return false;
}

async function chamar(rota, { metodo = "GET", corpo, token } = {}) {
  const r = await fetch(`${API}${rota}`, {
    method: metodo,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  });
  const texto = await r.text();
  return { status: r.status, corpo: texto ? JSON.parse(texto) : null };
}

/**
 * As permissões que a tela vai marcar: `VIEW_CHANNEL | SEND_MESSAGES |
 * ADD_REACTIONS | CONNECT | SPEAK` — um bot de música típico.
 *
 * Os bits são os do `Permission` do Streamz (`packages/shared/src/permissoes.ts`),
 * escritos aqui à mão para a prova não depender do pacote compilado.
 */
const VIEW_CHANNEL = 1 << 0;
const SEND_MESSAGES = 1 << 1;
const ADD_REACTIONS = 1 << 10;
const CONNECT = 1 << 12;
const SPEAK = 1 << 13;
const ESCOLHIDAS = VIEW_CHANNEL | SEND_MESSAGES | ADD_REACTIONS | CONNECT | SPEAK;

console.log(`permissões escolhidas na tela: ${ESCOLHIDAS} (VIEW_CHANNEL|SEND_MESSAGES|ADD_REACTIONS|CONNECT|SPEAK)`);
console.log();

// ── 1. o diretório ───────────────────────────────────────────
{
  const { status, corpo } = await chamar("/applications/publicas", {
    token: semente.dono.accessToken,
  });
  const achou = corpo?.itens?.find((a) => a.id === semente.bot.applicationId);
  registrar(
    "1. GET /applications/publicas devolve o app publicado",
    status === 200 && !!achou,
    `${status} — ${corpo?.itens?.length ?? 0} no diretório; ` +
      `achou="${achou?.name ?? "não"}" servidores=${achou?.servidores}`,
  );

  // e a rota não foi engolida por `GET /applications/:id`: um 404 aqui seria
  // exatamente o defeito de ordem de declaração do §3.2
  registrar(
    "1b. `publicas` não virou um id (a ordem de declaração está certa)",
    status !== 404,
    `status=${status}`,
  );

  const pagina = await chamar(`/applications/${semente.bot.applicationId}`, {
    token: semente.dono.accessToken,
  });
  registrar(
    "1c. GET /applications/:id devolve a página do app",
    pagina.status === 200 && pagina.corpo?.id === semente.bot.applicationId,
    `${pagina.status} — ${pagina.corpo?.name}`,
  );
}

// ── o socket.io do dono: o "navegador" desta prova ───────────
const socket = io(BASE, {
  auth: { token: semente.dono.accessToken },
  transports: ["websocket"],
  path: "/socket.io",
});
const recebidas = [];
const membrosQueEntraram = [];
const cargosCriados = [];
const cargosApagados = [];
const membrosQueSairam = [];
socket.on("message.new", (m) => recebidas.push(m));
socket.on("member.joined", (e) => membrosQueEntraram.push(e));
socket.on("member.left", (e) => membrosQueSairam.push(e));
socket.on("role.created", (e) => cargosCriados.push(e));
socket.on("role.deleted", (e) => cargosApagados.push(e));
await new Promise((ok, erro) => {
  socket.on("connect", ok);
  socket.on("connect_error", erro);
  setTimeout(() => erro(new Error("socket.io não conectou em 15 s")), 15_000);
});
socket.emit("channel.join", { channelId: semente.canal.id });

// ── 2. o bot conecta ANTES da instalação ─────────────────────
const cliente = new Client({
  // exatamente os intents de um bot comum: `GuildMembers` é privilegiado no
  // Discord e a maioria não o pede. Se o `GUILD_CREATE` da F4 dependesse dele,
  // esta prova falharia aqui — e é justamente esse o defeito silencioso.
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  rest: { api: API, version: "10" },
});
if (process.env.DEBUG_DJS === "1") cliente.on("debug", (m) => console.log("[djs]", m));
cliente.on("error", (e) => console.error("[djs erro]", e));
cliente.on("messageCreate", (m) => {
  if (m.content === "!ping") void m.reply("pong");
});

const entrou = [];
const saiu = [];
cliente.on("guildCreate", (g) => entrou.push({ id: g.id, name: g.name }));
cliente.on("guildDelete", (g) => saiu.push({ id: g.id, name: g.name }));

const pronto = new Promise((ok, erro) => {
  cliente.once("clientReady", ok);
  cliente.once("ready", ok);
  setTimeout(() => erro(new Error("`ready` não disparou em 60 s")), 60_000);
});
await cliente.login(semente.bot.token);
await pronto;

registrar(
  "2. o bot conectou e ainda não está em servidor nenhum",
  cliente.guilds.cache.size === 0,
  `user=${cliente.user?.tag} guilds.cache.size=${cliente.guilds.cache.size}`,
);

// ── 3. instalar pela rota → GUILD_CREATE na sessão aberta ────
let instalacao;
{
  const r = await chamar(`/guilds/${semente.servidor.id}/aplicativos`, {
    metodo: "POST",
    corpo: { applicationId: semente.bot.applicationId, permissions: ESCOLHIDAS },
    token: semente.dono.accessToken,
  });
  instalacao = r.corpo;
  registrar(
    "3. POST /guilds/:id/aplicativos instalou",
    r.status === 201 || r.status === 200,
    `${r.status} — cargo=${instalacao?.roleId} permissions=${instalacao?.permissions}`,
  );

  const chegou = await ate(() => entrou.length > 0, 20_000, "o guildCreate do discord.js");
  registrar(
    "3b. o discord.js recebeu GUILD_CREATE **sem reconectar**",
    chegou && entrou[0]?.id === semente.servidor.snowflake,
    `guildCreate=${JSON.stringify(entrou)} guilds.cache.size=${cliente.guilds.cache.size}`,
  );

  registrar(
    "3c. o navegador viu o cargo nascer e o bot entrar",
    cargosCriados.some((c) => c.id === instalacao?.roleId) &&
      membrosQueEntraram.some((m) => m.member?.user?.id === semente.bot.userId),
    `role.created=${cargosCriados.length} member.joined=${membrosQueEntraram
      .map((m) => m.member?.user?.username)
      .join(",")}`,
  );
}

// ── 4. !ping pelo socket.io → pong do bot ───────────────────
{
  recebidas.length = 0;
  socket.emit("message.create", {
    channelId: semente.canal.id,
    content: "!ping",
    nonce: "prova-f4",
  });
  const respondeu = await ate(
    () => recebidas.some((m) => m.content === "pong" && m.author?.bot === true),
    25_000,
    "o `message.new` do pong",
  );
  registrar(
    "4. !ping pelo socket.io → pong do bot, de volta pelo socket.io",
    respondeu,
    recebidas.map((m) => `${m.author?.username}: ${m.content}`).join(" | "),
  );
}

// ── 5. o cargo, com as permissões escolhidas, vestido pelo bot ──
{
  const cargos = await chamar(`/guilds/${semente.servidor.id}/roles`, {
    token: semente.dono.accessToken,
  });
  const cargo = cargos.corpo?.find((c) => c.id === instalacao?.roleId);
  registrar(
    "5. o cargo gerenciado existe com EXATAMENTE as permissões escolhidas",
    !!cargo && cargo.permissions === ESCOLHIDAS,
    `nome="${cargo?.name}" permissions=${cargo?.permissions} (esperado ${ESCOLHIDAS})`,
  );

  const membros = await chamar(`/guilds/${semente.servidor.id}/members`, {
    token: semente.dono.accessToken,
  });
  const oBot = membros.corpo?.find((m) => m.user?.id === semente.bot.userId);
  registrar(
    "5b. o usuário-bot é membro, vestindo esse cargo, com a marca de bot",
    !!oBot && oBot.roleIds?.includes(instalacao?.roleId) && oBot.user?.bot === true,
    `bot=${oBot?.user?.username} bot=${oBot?.user?.bot} roleIds=${JSON.stringify(oBot?.roleIds)}`,
  );

  const instalados = await chamar(`/guilds/${semente.servidor.id}/aplicativos`, {
    token: semente.dono.accessToken,
  });
  registrar(
    "5c. GET /guilds/:id/aplicativos lista a instalação",
    instalados.status === 200 && instalados.corpo?.length === 1,
    `${instalados.status} — ${instalados.corpo?.length} instalado(s); ` +
      `instaladoPor=${instalados.corpo?.[0]?.instaladoPor?.username}`,
  );
}

// ── 7. sem MANAGE_GUILD → 403 (antes de remover, para haver o que remover) ──
{
  const r = await chamar(`/guilds/${semente.servidor.id}/aplicativos`, {
    metodo: "POST",
    corpo: { applicationId: semente.bot.applicationId, permissions: VIEW_CHANNEL },
    token: semente.membroSemPoder.accessToken,
  });
  registrar(
    "7. quem NÃO tem MANAGE_GUILD leva 403 da rota de instalar",
    r.status === 403,
    `${r.status} — ${JSON.stringify(r.corpo)}`,
  );

  const lista = await chamar(`/guilds/${semente.servidor.id}/aplicativos`, {
    token: semente.membroSemPoder.accessToken,
  });
  registrar(
    "7b. …e também na de listar",
    lista.status === 403,
    `${lista.status}`,
  );

  const del = await chamar(
    `/guilds/${semente.servidor.id}/aplicativos/${semente.bot.applicationId}`,
    { metodo: "DELETE", token: semente.membroSemPoder.accessToken },
  );
  registrar("7c. …e na de remover", del.status === 403, `${del.status}`);

  // e a escalada de privilégio: nem o dono do servidor consegue conceder um bit
  // que ele não tem — mas ele tem todos. Quem prova a trava é o membro comum:
  // se ele conseguisse chegar ao `validarPermissoes`, levaria 403 por lá. Aqui
  // ele para antes, no `MANAGE_GUILD`, que é o desenho.
}

// ── 6. remover → GUILD_DELETE, o membro sai, o cargo some ───
{
  entrou.length = 0;
  const r = await chamar(
    `/guilds/${semente.servidor.id}/aplicativos/${semente.bot.applicationId}`,
    { metodo: "DELETE", token: semente.dono.accessToken },
  );
  registrar("6. DELETE /guilds/:id/aplicativos/:appId", r.status === 204, `${r.status}`);

  const foi = await ate(() => saiu.length > 0, 20_000, "o guildDelete do discord.js");
  registrar(
    "6b. o discord.js recebeu GUILD_DELETE",
    foi && saiu[0]?.id === semente.servidor.snowflake,
    `guildDelete=${JSON.stringify(saiu)} guilds.cache.size=${cliente.guilds.cache.size}`,
  );

  const cargos = await chamar(`/guilds/${semente.servidor.id}/roles`, {
    token: semente.dono.accessToken,
  });
  registrar(
    "6c. o cargo do app sumiu",
    !cargos.corpo?.some((c) => c.id === instalacao?.roleId),
    `cargos restantes: ${cargos.corpo?.map((c) => c.name).join(", ")}`,
  );

  const membros = await chamar(`/guilds/${semente.servidor.id}/members`, {
    token: semente.dono.accessToken,
  });
  registrar(
    "6d. o membro-bot saiu da lista de membros",
    !membros.corpo?.some((m) => m.user?.id === semente.bot.userId),
    `membros: ${membros.corpo?.map((m) => m.user?.username).join(", ")}`,
  );

  registrar(
    "6e. o navegador viu o cargo sumir e o bot sair",
    cargosApagados.some((c) => c.roleId === instalacao?.roleId) &&
      membrosQueSairam.some((m) => m.userId === semente.bot.userId),
    `role.deleted=${cargosApagados.length} member.left=${membrosQueSairam.length}`,
  );
}

// ── 8. a junção A↔B: o portal enxerga a instalação, e apagar o app desfaz ──
//
// Reinstala (o passo 6 acabou de remover) para haver o que desfazer, e então
// apaga o **aplicativo** pelo portal — não a instalação. O cascade do banco
// deixaria o banco consistente sozinho; o que esta prova observa é o que ele
// **não** faz: o `GUILD_DELETE` no bot conectado e o `member.left` no
// navegador.
{
  entrou.length = 0;
  saiu.length = 0;
  cargosApagados.length = 0;
  membrosQueSairam.length = 0;

  const r = await chamar(`/guilds/${semente.servidor.id}/aplicativos`, {
    metodo: "POST",
    corpo: { applicationId: semente.bot.applicationId, permissions: ESCOLHIDAS },
    token: semente.dono.accessToken,
  });
  const reinstalada = r.corpo;
  registrar(
    "8. reinstalado, para haver o que desfazer",
    r.status === 201 || r.status === 200,
    `${r.status} — cargo=${reinstalada?.roleId}`,
  );
  await ate(() => entrou.length > 0, 20_000, "o guildCreate da reinstalação");

  // 8b. a tela "Servidores" do portal (lote A) — era o `[]` com TODO
  const servidores = await chamar(`/applications/${semente.bot.applicationId}/servidores`, {
    token: semente.dono.accessToken,
  });
  const aqui = servidores.corpo?.find((g) => g.guildId === semente.servidor.id);
  registrar(
    "8b. GET /applications/:id/servidores enxerga a instalação (era `[]`)",
    servidores.status === 200 && !!aqui && aqui.permissions === ESCOLHIDAS,
    `${servidores.status} — ${JSON.stringify(servidores.corpo)}`,
  );

  // 8c. apagar o APLICATIVO pelo portal
  const del = await chamar(`/applications/${semente.bot.applicationId}`, {
    metodo: "DELETE",
    token: semente.dono.accessToken,
  });
  registrar("8c. DELETE /applications/:id (apagar o aplicativo)", del.status === 204, `${del.status}`);

  const foi = await ate(() => saiu.length > 0, 20_000, "o guildDelete de apagar o app");
  registrar(
    "8d. o bot conectado recebeu GUILD_DELETE ao app ser apagado",
    foi && saiu[0]?.id === semente.servidor.snowflake,
    `guildDelete=${JSON.stringify(saiu)} guilds.cache.size=${cliente.guilds.cache.size}`,
  );

  registrar(
    "8e. o navegador viu o cargo sumir e o bot sair (o evento que o cascade NÃO dá)",
    cargosApagados.some((c) => c.roleId === reinstalada?.roleId) &&
      membrosQueSairam.some((m) => m.userId === semente.bot.userId),
    `role.deleted=${cargosApagados.length} member.left=${membrosQueSairam.length}`,
  );

  const membros = await chamar(`/guilds/${semente.servidor.id}/members`, {
    token: semente.dono.accessToken,
  });
  registrar(
    "8f. o membro-bot não ficou órfão na lista de membros",
    !membros.corpo?.some((m) => m.user?.id === semente.bot.userId),
    `membros: ${membros.corpo?.map((m) => m.user?.username).join(", ")}`,
  );

  const cargos = await chamar(`/guilds/${semente.servidor.id}/roles`, {
    token: semente.dono.accessToken,
  });
  registrar(
    "8g. o cargo gerenciado sumiu junto",
    !cargos.corpo?.some((c) => c.id === reinstalada?.roleId),
    `cargos restantes: ${cargos.corpo?.map((c) => c.name).join(", ")}`,
  );

  const diretorio = await chamar("/applications/publicas", { token: semente.dono.accessToken });
  registrar(
    "8h. o aplicativo apagado saiu do diretório",
    !diretorio.corpo?.itens?.some((a) => a.id === semente.bot.applicationId),
    `${diretorio.corpo?.itens?.length} no diretório`,
  );
}

socket.close();
await cliente.destroy();

console.log();
console.log(falhas === 0 ? "TODAS AS PROVAS PASSARAM" : `${falhas} PROVA(S) FALHARAM`);
process.exit(falhas === 0 ? 0 : 1);
