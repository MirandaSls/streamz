// Fumaça do gateway compat (§7) com um cliente `ws` **cru** contra a API de
// verdade — sem discord.js, para o que falha falhar em um lugar só.
//
// Roda dentro do contêiner da API (que tem o repo montado e o `ws` instalado):
//
//   apps/api/test/discord-compat/ambiente.sh subir f1b 3402
//   docker exec -e API_URL=http://localhost:3333/api streamz-bots-f1b-api \
//     node apps/api/test/discord-compat/semear.mjs            # guarde o JSON
//   docker exec -e TOKEN=<token do JSON> streamz-bots-f1b-api \
//     node apps/api/test/discord-compat/fumaca-gateway.mjs
//   apps/api/test/discord-compat/ambiente.sh derrubar f1b
//
// O que ele prova **sem** os lotes A, C e D: o `'upgrade'` em `/gateway`
// convivendo com o Socket.IO, o HELLO, o HEARTBEAT_ACK, o IDENTIFY aceito (por
// contraste: token bom não leva 4004, token ruim leva), o 4010 do shard e o
// 4000 do `encoding=etf`.
//
// O que ele **não** prova: o READY. Ele depende de `DadosDeCompatService`
// (lote A) e de `usuarioParaDiscord` (lote C), que ainda lançam nesta branch —
// então o IDENTIFY com token bom termina em close 4000 "erro interno", e o log
// da API mostra o `não implementado` que o causou. A prova com discord.js de
// verdade é do coordenador, depois do merge dos quatro lotes.

import WebSocket from "ws";

const URL_DO_GATEWAY = process.env.GATEWAY_URL ?? "ws://localhost:3333/gateway";
const TOKEN = process.env.TOKEN;
if (!TOKEN) {
  console.error("falta TOKEN (o `bot.token` do JSON do semear.mjs)");
  process.exit(2);
}

const OP = { DISPATCH: 0, HEARTBEAT: 1, IDENTIFY: 2, RESUME: 6, INVALID_SESSION: 9, HELLO: 10, ACK: 11 };

/**
 * Abre uma conexão e devolve um punhado de promessas sobre ela.
 *
 * `esperar` resolve no primeiro quadro que casar; `fim` resolve no close. As
 * duas correm juntas de propósito: quase todo caso de erro deste gateway é
 * "chegou um close em vez de um quadro", e sem isso o teste ficaria pendurado.
 */
function abrir(consulta) {
  const soquete = new WebSocket(`${URL_DO_GATEWAY}?${consulta}`);
  const quadros = [];
  const ouvintes = [];
  let fechamento = null;
  let resolverFim;
  const fim = new Promise((r) => (resolverFim = r));

  soquete.on("message", (dado, binario) => {
    const quadro = { ...JSON.parse(String(dado)), binario };
    quadros.push(quadro);
    for (const o of [...ouvintes]) {
      if (o.casa(quadro)) {
        ouvintes.splice(ouvintes.indexOf(o), 1);
        o.pronto(quadro);
      }
    }
  });
  soquete.on("close", (codigo, razao) => {
    fechamento = { codigo, razao: razao.toString() };
    resolverFim(fechamento);
  });
  soquete.on("error", () => {});

  return {
    soquete,
    quadros,
    get fechamento() {
      return fechamento;
    },
    fim,
    aberto: new Promise((pronto, falhou) => {
      soquete.once("open", pronto);
      soquete.once("error", falhou);
    }),
    mandar: (op, d) => soquete.send(JSON.stringify({ op, d })),
    esperar(casa, oQue, limiteMs = 10_000) {
      const achado = quadros.find(casa);
      if (achado) return Promise.resolve(achado);
      return new Promise((pronto, falhou) => {
        const relogio = setTimeout(() => falhou(new Error(`esperei por ${oQue}`)), limiteMs);
        ouvintes.push({
          casa,
          pronto: (q) => {
            clearTimeout(relogio);
            pronto(q);
          },
        });
        fim.then((f) =>
          falhou(new Error(`fechou com ${f.codigo} "${f.razao}" enquanto eu esperava ${oQue}`)),
        );
      });
    },
  };
}

const resultados = [];
function anotar(nome, ok, detalhe) {
  resultados.push({ nome, ok, detalhe });
  console.log(`${ok ? "ok  " : "FALHA"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
}

// ── 1. HELLO, e com `compress=zlib-stream` na query (que ignoramos) ──────────
const bot = abrir("v=10&encoding=json&compress=zlib-stream");
await bot.aberto;
const hello = await bot.esperar((q) => q.op === OP.HELLO, "o HELLO");
anotar(
  "HELLO em quadro de texto, mesmo com compress=zlib-stream",
  hello.binario === false && typeof hello.d?.heartbeat_interval === "number",
  `heartbeat_interval=${hello.d?.heartbeat_interval}`,
);

// ── 2. HEARTBEAT → ACK ──────────────────────────────────────────────────────
bot.mandar(OP.HEARTBEAT, null);
const ack = await bot.esperar((q) => q.op === OP.ACK, "o HEARTBEAT_ACK");
anotar("HEARTBEAT → HEARTBEAT_ACK", ack.op === OP.ACK);

// ── 3. o socket sobrevive ao destroyUpgrade do engine.io (risco (c)) ────────
await new Promise((r) => setTimeout(r, 3000));
const vivoDepoisDe3s = bot.soquete.readyState === WebSocket.OPEN && bot.fechamento === null;
bot.mandar(OP.HEARTBEAT, null);
await bot.esperar((q) => q.op === OP.ACK && q !== ack, "o segundo ACK");
anotar("vivo e respondendo ACK 3 s depois (o relógio do engine.io é 1 s)", vivoDepoisDe3s);

// ── 4. IDENTIFY com token bom: aceito (não leva 4004) ───────────────────────
bot.mandar(OP.IDENTIFY, {
  token: TOKEN,
  intents: (1 << 0) | (1 << 9) | (1 << 15),
  properties: { os: "linux", browser: "fumaca-gateway.mjs", device: "streamz" },
  shard: [0, 1],
});
const depoisDoIdentify = await Promise.race([
  bot.esperar((q) => q.op === OP.DISPATCH && q.t === "READY", "o READY", 20_000).then(
    (q) => ({ tipo: "ready", q }),
    () => null,
  ),
  bot.fim.then((f) => ({ tipo: "close", f })),
]);

if (depoisDoIdentify?.tipo === "ready") {
  const d = depoisDoIdentify.q.d;
  anotar(
    "IDENTIFY aceito e READY completo",
    Boolean(d?.user && d?.guilds && d?.application),
    `session_id=${d?.session_id} guilds=${JSON.stringify(d?.guilds)}`,
  );
} else {
  const f = depoisDoIdentify.f;
  anotar(
    "IDENTIFY aceito (não levou 4004: o token foi verificado)",
    f.codigo !== 4004,
    `fechou com ${f.codigo} "${f.razao}" — esperado nesta branch: o READY depende do lote A (dados.service) e do C (traducao)`,
  );
}

// ── 5. IDENTIFY com token ruim: 4004, para o contraste valer ────────────────
{
  const ruim = abrir("v=10&encoding=json");
  await ruim.aberto;
  await ruim.esperar((q) => q.op === OP.HELLO, "o HELLO");
  ruim.mandar(OP.IDENTIFY, { token: "isto-nao-e-um-token", intents: 1 });
  const f = await ruim.fim;
  anotar("token inválido → close 4004", f.codigo === 4004, `"${f.razao}"`);
}

// ── 6. shard [0, 2] → 4010 (§13: um shard, ponto) ──────────────────────────
{
  const multi = abrir("v=10&encoding=json");
  await multi.aberto;
  await multi.esperar((q) => q.op === OP.HELLO, "o HELLO");
  multi.mandar(OP.IDENTIFY, { token: TOKEN, intents: 1, shard: [0, 2] });
  const f = await multi.fim;
  anotar("shard [0, 2] → close 4010", f.codigo === 4010, `"${f.razao}"`);
}

// ── 7. encoding=etf → 4000 com a razão ─────────────────────────────────────
{
  const etf = abrir("v=10&encoding=etf");
  await etf.aberto;
  const f = await etf.fim;
  anotar("encoding=etf → close 4000", f.codigo === 4000 && etf.quadros.length === 0, `"${f.razao}"`);
}

// ── 8. RESUME de uma sessão que não existe → op 9 com d: false ─────────────
{
  const fantasma = abrir("v=10&encoding=json");
  await fantasma.aberto;
  await fantasma.esperar((q) => q.op === OP.HELLO, "o HELLO");
  fantasma.mandar(OP.RESUME, { token: TOKEN, session_id: "nunca-existiu", seq: 3 });
  const q = await fantasma.esperar((x) => x.op === OP.INVALID_SESSION, "o INVALID_SESSION");
  anotar("RESUME de sessão desconhecida → op 9 com d: false", q.d === false);
  fantasma.soquete.close();
}

bot.soquete.close();

const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length}/${resultados.length} verificações passaram`);
process.exit(falhas.length === 0 ? 0 : 1);
