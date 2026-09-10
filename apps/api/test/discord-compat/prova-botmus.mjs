// A prova do **Streamz Música** rodando contra a bancada descartável.
//
// Entrada (variáveis de ambiente):
//   SEMENTE   JSON de `semear.mjs` (dono, servidor, canal de texto, canal de voz)
//   APP       JSON com { id, snowflake, name } do aplicativo provisionado
//   API_URL   http://<api>:3333/api
//
// O que ela prova, e por que cada passo:
//
//   1. o aplicativo aparece em **Descobrir aplicativos**, com o selo de
//      oficial e a descrição que o bot declara;
//   2. os **onze comandos de barra** foram registrados pelo runtime na subida
//      e aparecem em `GET /guilds/:id/comandos-de-app` (é a lista que o `/` do
//      composer mostra);
//   3. `/fila` por **comando de barra** responde, e a resposta chega ao
//      socket.io do usuário — ou seja, aparece no navegador sem F5;
//   4. `!fila` pelo **prefixo** responde igual;
//   5. `/tocar` **sem estar num canal de voz** responde pedindo para entrar;
//   6. `/tocar` **dentro de um canal de voz**, sem Lavalink e sem ponte,
//      responde a frase clara em vez de pendurar — é a dependência declarada
//      da fase.

import { io } from "socket.io-client";

const semente = JSON.parse(process.env.SEMENTE);
const app = JSON.parse(process.env.APP);
const API = process.env.API_URL;
const BASE = API.replace(/\/api$/, "");
/**
 * `completa` (padrão) roda tudo sem Lavalink e sem ponte.
 *
 * `ponte` roda **só** o passo do `/tocar`, com o Lavalink no ar e a ponte de
 * voz fora — que é o estado real do servidor hoje. É a prova de que a
 * dependência declarada da fase se comporta: o bot entra no canal, não recebe
 * `VOICE_SERVER_UPDATE` (a API recusa assinar o token da ponte e só registra
 * no log) e responde uma frase clara em vez de pendurar.
 */
const MODO = process.env.MODO ?? "completa";
const soPonte = MODO === "ponte";

let falhas = 0;
const registrar = (nome, ok, detalhe) => {
  if (!ok) falhas++;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
};

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function ate(condicao, ms, oQue) {
  const limite = Date.now() + ms;
  for (;;) {
    const v = condicao();
    if (v) return v;
    if (Date.now() >= limite) throw new Error(`tempo esgotado esperando: ${oQue}`);
    await esperar(250);
  }
}

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

// ── 1. o diretório ──────────────────────────────────────────
if (!soPonte) {
  const r = await comoDono("/applications/publicas");
  const itens = r.corpo?.itens ?? [];
  const meu = itens.find((a) => a.id === app.id);
  registrar(
    "1. o bot aparece em Descobrir aplicativos",
    r.status === 200 && Boolean(meu),
    `${r.status}; ${itens.length} publicado(s)`,
  );
  registrar(
    "1b. com o selo de oficial e a descrição do bot",
    meu?.oficial === true && (meu?.description ?? "").includes("Spotify"),
    `oficial=${meu?.oficial}; descrição de ${meu?.description?.length ?? 0} caracteres`,
  );
  registrar(
    "1c. os oficiais vêm primeiro na grade",
    itens[0]?.id === app.id,
    `primeiro: ${itens[0]?.name}`,
  );
}

// ── 2. os comandos registrados na subida ────────────────────
const comandos = await comoDono(`/guilds/${semente.servidor.id}/comandos-de-app`);
const nomes = (comandos.corpo ?? []).map((c) => c.name).sort();
const esperados = [
  "agora",
  "continuar",
  "embaralhar",
  "fila",
  "parar",
  "pausar",
  "pular",
  "remover",
  "repetir",
  "tocar",
  "volume",
].sort();
if (!soPonte) {
  registrar(
    "2. os 11 comandos de barra foram registrados pelo runtime",
    comandos.status === 200 && nomes.join(",") === esperados.join(","),
    `${comandos.status}: ${nomes.join(", ")}`,
  );
}
const idDe = (nome) => (comandos.corpo ?? []).find((c) => c.name === nome)?.id;

// ── O "navegador": socket.io do dono ────────────────────────
const socket = io(BASE, {
  auth: { token: semente.dono.accessToken },
  transports: ["websocket"],
  path: "/socket.io",
});
// **As duas** entradas, e não só `message.new`: quando o bot adia a resposta
// (`deferReply`, que é o que o `/tocar` faz porque buscar leva mais que 2 s), a
// mensagem nasce como "pensando…" e o texto final chega em `message.updated`.
// Ouvir só a primeira faz a prova esperar para sempre por uma resposta que já
// apareceu na tela.
const novas = [];
socket.on("message.new", (m) => novas.push(m));
socket.on("message.updated", (m) => novas.push(m));
await new Promise((ok, erro) => {
  socket.on("connect", ok);
  socket.on("connect_error", erro);
  setTimeout(() => erro(new Error("socket.io não conectou em 15 s")), 15_000);
});
socket.emit("channel.join", { channelId: semente.canal.id });
await esperar(500);

/** Dispara um comando de barra como o composer faz. */
async function digitar(nome, opcoes = []) {
  const r = await comoDono(`/channels/${semente.canal.id}/interactions`, {
    metodo: "POST",
    corpo: { commandId: idDe(nome), options: opcoes },
  });
  if (r.status >= 400) throw new Error(`POST interactions /${nome} → ${r.status}`);
}

/** Manda uma mensagem no canal como o navegador faz (o prefixo `!`). */
function falar(texto) {
  socket.emit("message.create", {
    channelId: semente.canal.id,
    content: texto,
    nonce: `botmus-${Date.now()}`,
  });
}

/**
 * A primeira mensagem do bot que casar, esperando o tempo dado.
 *
 * Aceita função **ou** expressão regular: passar uma regex onde se esperava uma
 * função dava "casa is not a function" no meio da prova — um erro que parece
 * defeito do bot e não é.
 */
async function respostaDoBot(criterio, ms, oQue) {
  const casa =
    typeof criterio === "function" ? criterio : (texto) => criterio.test(texto);
  return ate(
    () =>
      novas.find(
        (m) => m.author?.id === app.botUserId && (casa(m.content ?? "") || casa(textoDoEmbed(m))),
      ),
    ms,
    oQue,
  );
}

/** Junta o que dá para ler de um embed, para as asserções não dependerem do campo. */
function textoDoEmbed(m) {
  const embeds = m.embeds ?? [];
  return embeds
    .map((e) => [e.title, e.description, e.footer?.text].filter(Boolean).join(" "))
    .join(" ");
}

// ── 3. /fila pelo comando de barra ──────────────────────────
if (!soPonte) {
  novas.length = 0;
  await digitar("fila");
  try {
    const m = await respostaDoBot((t) => /fila está vazia/i.test(t), 30_000, "a resposta de /fila");
    registrar("3. /fila responde, e a resposta chega ao socket.io", true, JSON.stringify(m.content));
  } catch (e) {
    registrar("3. /fila responde, e a resposta chega ao socket.io", false, e.message);
  }
}

// ── 4. !fila pelo prefixo ───────────────────────────────────
if (!soPonte) {
  novas.length = 0;
  falar("!fila");
  try {
    const m = await respostaDoBot((t) => /fila está vazia/i.test(t), 30_000, "a resposta de !fila");
    registrar("4. o prefixo `!fila` responde igual", true, JSON.stringify(m.content));
  } catch (e) {
    registrar("4. o prefixo `!fila` responde igual", false, e.message);
  }
}

// ── 5. /tocar fora de canal de voz ──────────────────────────
if (!soPonte) {
  novas.length = 0;
  await digitar("tocar", [{ name: "busca", type: 3, value: "caetano veloso" }]);
  try {
    await respostaDoBot((t) => /canal de voz/i.test(t), 30_000, "o pedido para entrar em voz");
    registrar("5. /tocar fora de canal de voz pede para entrar num", true);
  } catch (e) {
    registrar("5. /tocar fora de canal de voz pede para entrar num", false, e.message);
  }
}

// ── 6. /tocar dentro do canal, sem áudio configurado ────────
//
// O passo que importa desta fase: o bot **não pendura**. Sem Lavalink ele diz
// que o serviço de áudio não responde; com Lavalink e sem a ponte, diz que a
// voz não está configurada. Qualquer uma das duas serve — a que não serve é
// silêncio.
{
  socket.emit("voice.join", { channelId: semente.canalDeVoz.id });
  await esperar(1500);
  novas.length = 0;
  await digitar("tocar", [{ name: "busca", type: 3, value: "caetano veloso" }]);
  // Com Lavalink no ar, a única saída aceitável é a frase da **ponte**: se o
  // bot respondesse "o Lavalink não responde" aqui, o diagnóstico estaria
  // errado e quem administra procuraria o defeito no lugar errado.
  const esperado = soPonte ? /não está configurada/i : /não está respondendo|não está configurada/i;
  const nome = soPonte
    ? "7. com Lavalink no ar e sem ponte, /tocar diz que a VOZ não está configurada"
    : "6. /tocar sem áudio configurado responde claro (não pendura)";
  try {
    const m = await respostaDoBot(esperado, 45_000, "a recusa clara do /tocar");
    registrar(nome, true, JSON.stringify((m.content ?? "").slice(0, 140)));
  } catch (e) {
    registrar(nome, false, e.message);
  }
}

socket.close();
console.log(falhas === 0 ? "\ntodas as provas passaram." : `\n${falhas} prova(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
