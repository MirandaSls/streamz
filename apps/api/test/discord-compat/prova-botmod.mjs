// A prova do **Streamz Moderação** rodando contra a bancada descartável.
//
// Entrada (variáveis de ambiente):
//   SEMENTE   JSON de `semear.mjs` (dono, servidor, canal)
//   GENTE     JSON de `semear-botmod.mjs` ({ alvo, xereta })
//   APP       JSON com { id, snowflake, name, botUserId } do aplicativo
//   API_URL   http://<api>:3333/api
//
// O que ela prova, e por que cada passo:
//
//   1. o aplicativo aparece em **Descobrir aplicativos**, com o selo de oficial
//      e a descrição que o bot declara;
//   2. os **dez comandos** foram registrados pelo runtime na subida;
//   3. `/registro-de-moderacao` guarda o canal — é o estado em arquivo JSON do
//      bot funcionando ponta a ponta;
//   4. `/aviso` responde, publica o embed no canal de registro e o aviso
//      **sobrevive**: `/avisos` logo depois traz o `#1`;
//   5. `/limpar` **apaga de verdade** — as mensagens somem do `GET /messages`;
//   6. quem **não** tem permissão leva uma recusa **efêmera** que nomeia a
//      permissão que falta (e o canal não vê nada);
//   7. `/banir`, cuja rota a casca ainda não tem, responde uma frase clara em
//      vez de pendurar ou cuspir uma pilha de erro;
//   8. o prefixo `!` chega ao mesmo comando.

import { io } from "socket.io-client";

const semente = JSON.parse(process.env.SEMENTE);
const gente = JSON.parse(process.env.GENTE);
const app = JSON.parse(process.env.APP);
const API = process.env.API_URL;
const BASE = API.replace(/\/api$/, "");

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

async function como(token, rota, { metodo = "GET", corpo } = {}) {
  const r = await fetch(`${API}${rota}`, {
    method: metodo,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  });
  const texto = await r.text();
  return { status: r.status, corpo: texto ? JSON.parse(texto) : null };
}

const DONO = semente.dono.accessToken;
const comoDono = (rota, opcoes) => como(DONO, rota, opcoes);

// ── 1. o diretório ──────────────────────────────────────────
{
  const r = await comoDono("/applications/publicas");
  const itens = r.corpo?.itens ?? [];
  const meu = itens.find((a) => a.id === app.id);
  registrar(
    "1. o bot aparece em Descobrir aplicativos como oficial",
    r.status === 200 && meu?.oficial === true,
    `${r.status}; ${itens.length} publicado(s); oficial=${meu?.oficial}`,
  );
  registrar(
    "1b. com a descrição que o bot declara (e ela cabe no limite)",
    (meu?.description ?? "").includes("guardados pelo bot") && (meu?.description ?? "").length <= 300,
    `${meu?.description?.length ?? 0} caracteres`,
  );
}

// ── 2. os comandos registrados na subida ────────────────────
const comandos = await comoDono(`/guilds/${semente.servidor.id}/comandos-de-app`);
const nomes = (comandos.corpo ?? []).map((c) => c.name).sort();
const esperados = [
  "aviso",
  "avisos",
  "banir",
  "desbanir",
  "dessilenciar",
  "expulsar",
  "limpar",
  "limpar-avisos",
  "registro-de-moderacao",
  "silenciar",
].sort();
registrar(
  "2. os 10 comandos de barra foram registrados pelo runtime",
  comandos.status === 200 && nomes.join(",") === esperados.join(","),
  `${comandos.status}: ${nomes.join(", ")}`,
);
const idDe = (nome) => (comandos.corpo ?? []).find((c) => c.name === nome)?.id;

// ── os canais da prova ──────────────────────────────────────
// Um canal só para o registro e outro só para a faxina: o `/limpar` apaga o que
// estiver no canal, e misturá-lo com o resto da prova apagaria as provas.
async function criarCanal(nome) {
  const r = await comoDono(`/guilds/${semente.servidor.id}/channels`, {
    metodo: "POST",
    corpo: { name: nome, type: "TEXT" },
  });
  if (r.status >= 400) throw new Error(`criar #${nome} → ${r.status}: ${JSON.stringify(r.corpo)}`);
  return r.corpo;
}
const canalDeRegistro = await criarCanal("registro-mod");
const canalDeFaxina = await criarCanal("faxina");

// ── O "navegador" de cada um ────────────────────────────────
async function navegador(token, canais) {
  const socket = io(BASE, { auth: { token }, transports: ["websocket"], path: "/socket.io" });
  const novas = [];
  socket.on("message.new", (m) => novas.push(m));
  socket.on("message.updated", (m) => novas.push(m));
  await new Promise((ok, erro) => {
    socket.on("connect", ok);
    socket.on("connect_error", erro);
    setTimeout(() => erro(new Error("socket.io não conectou em 15 s")), 15_000);
  });
  for (const c of canais) socket.emit("channel.join", { channelId: c });
  await esperar(500);
  return { socket, novas };
}

const canais = [semente.canal.id, canalDeRegistro.id, canalDeFaxina.id];
const dono = await navegador(DONO, canais);
const xereta = await navegador(gente.xereta.accessToken, canais);
// O `alvo` também precisa de socket: **não existe rota REST para criar
// mensagem** no Streamz (o `messages.controller.ts` interno só tem `@Get`) —
// quem escreve é o `message.create` do socket.io, como o navegador faz.
const alvo = await navegador(gente.alvo.accessToken, canais);

/** Dispara um comando de barra como o composer faz. */
async function digitar(token, canalId, nome, opcoes = []) {
  const r = await como(token, `/channels/${canalId}/interactions`, {
    metodo: "POST",
    corpo: { commandId: idDe(nome), options: opcoes },
  });
  if (r.status >= 400) throw new Error(`POST interactions /${nome} → ${r.status}: ${JSON.stringify(r.corpo)}`);
}

/** Manda uma mensagem no canal como o navegador faz (o prefixo `!`). */
function falar(nav, canalId, texto) {
  nav.socket.emit("message.create", {
    channelId: canalId,
    content: texto,
    nonce: `botmod-${Math.random().toString(36).slice(2)}`,
  });
}

function textoDoEmbed(m) {
  return (m.embeds ?? [])
    .map((e) =>
      [e.title, e.description, e.footer?.text, ...(e.fields ?? []).map((f) => `${f.name} ${f.value}`)]
        .filter(Boolean)
        .join(" "),
    )
    .join(" ");
}

async function respostaDoBot(nav, criterio, ms, oQue, canalId) {
  const casa = typeof criterio === "function" ? criterio : (t) => criterio.test(t);
  return ate(
    () =>
      nav.novas.find(
        (m) =>
          m.author?.id === app.botUserId &&
          (!canalId || m.channelId === canalId) &&
          (casa(m.content ?? "") || casa(textoDoEmbed(m))),
      ),
    ms,
    oQue,
  );
}

// ── 3. /registro-de-moderacao: o estado em arquivo ──────────
{
  dono.novas.length = 0;
  await digitar(DONO, semente.canal.id, "registro-de-moderacao", [
    { name: "canal", type: 3, value: `#${canalDeRegistro.name}` },
  ]);
  try {
    await respostaDoBot(dono, /registro de moderação configurado/i, 30_000, "a confirmação");
    registrar("3. /registro-de-moderacao guarda o canal", true, `#${canalDeRegistro.name}`);
  } catch (e) {
    registrar("3. /registro-de-moderacao guarda o canal", false, e.message);
  }
}

// ── 4. /aviso e /avisos ponta a ponta ──────────────────────
{
  dono.novas.length = 0;
  await digitar(DONO, semente.canal.id, "aviso", [
    { name: "usuario", type: 3, value: gente.alvo.username },
    { name: "motivo", type: 3, value: "spam repetido na prova" },
  ]);
  try {
    const m = await respostaDoBot(dono, /recebeu o aviso/i, 30_000, "a confirmação do /aviso");
    registrar("4. /aviso responde e numera o aviso", /#1/.test(m.content ?? ""), JSON.stringify(m.content));
  } catch (e) {
    registrar("4. /aviso responde e numera o aviso", false, e.message);
  }

  // A publicação no canal de registro — quem fez, em quem, por quê, quando.
  //
  // A asserção olha o `content` **e** o texto do embed juntos. Desde a onda 3
  // a API guarda embeds e componentes (`MessageBotPayload`) e aceita mensagem
  // só com embed, então a informação pode estar em qualquer um dos dois: o bot
  // de moderação hoje manda os campos no texto ("**Quem:** …") e repete no
  // embed. Ler só o `content` reprovaria um bot que migrasse para embed puro,
  // e ler só o embed reprovaria o texto — o passo protege a informação chegar,
  // não o lugar onde ela mora. O `textoDoEmbed` usa o nome do campo sem os
  // dois-pontos, por isso "Quem:" só casa no `content`; o "Aviso" casa nos dois.
  try {
    const m = await respostaDoBot(dono, /spam repetido na prova/i, 20_000, "o registro publicado", canalDeRegistro.id);
    const texto = `${m.content ?? ""}\n${textoDoEmbed(m)}`;
    const campos = ["Quem:", "Em quem:", "Quando:", "Motivo:"].filter((c) => texto.includes(c));
    registrar(
      "4b. a ação é publicada no canal de registro, com os quatro campos",
      campos.length === 4 && /Aviso/.test(texto),
      `campos no texto: ${campos.join(" ")} | ${JSON.stringify(texto.slice(0, 90))}`,
    );
  } catch (e) {
    registrar("4b. a ação é publicada no canal de registro, com os quatro campos", false, e.message);
  }

  // E o aviso **sobreviveu**: é o arquivo JSON do bot sendo lido de volta.
  dono.novas.length = 0;
  await digitar(DONO, semente.canal.id, "avisos", [
    { name: "usuario", type: 3, value: gente.alvo.username },
  ]);
  try {
    const m = await respostaDoBot(dono, /spam repetido na prova/i, 30_000, "a lista de /avisos");
    registrar(
      "4c. /avisos traz o aviso guardado, e a lista é efêmera",
      m.efemera === true,
      `efemera=${m.efemera}; ${JSON.stringify(textoDoEmbed(m).slice(0, 120))}`,
    );
  } catch (e) {
    registrar("4c. /avisos traz o aviso guardado, e a lista é efêmera", false, e.message);
  }
}

// ── 5. /limpar apaga de verdade ─────────────────────────────
{
  dono.novas.length = 0;
  alvo.novas.length = 0;
  for (let i = 0; i < 6; i++) falar(alvo, canalDeFaxina.id, `lixo ${i}`);

  // Esperar as seis chegarem antes de mandar limpar: o `/limpar` lê o
  // histórico, e um comando disparado antes de a última mensagem existir
  // apagaria cinco de quatro.
  let antes = [];
  try {
    await ate(
      () => {
        antes = dono.novas
          .filter((m) => m.channelId === canalDeFaxina.id && /^lixo \d$/.test(m.content ?? ""))
          .map((m) => m.id);
        return antes.length >= 6 ? antes : null;
      },
      20_000,
      "as seis mensagens de lixo",
    );
  } catch (e) {
    registrar("5pre. as mensagens de teste chegaram ao canal", false, e.message);
  }

  dono.novas.length = 0;
  await digitar(DONO, canalDeFaxina.id, "limpar", [{ name: "quantidade", type: 4, value: 5 }]);
  try {
    const m = await respostaDoBot(dono, /apaguei/i, 45_000, "a confirmação do /limpar", canalDeFaxina.id);
    registrar(
      "5. /limpar responde, e a confirmação é efêmera",
      m.efemera === true && /5 mensagens/.test(m.content ?? ""),
      `efemera=${m.efemera}; ${JSON.stringify(m.content)}`,
    );
  } catch (e) {
    registrar("5. /limpar responde, e a confirmação é efêmera", false, e.message);
  }

  // A prova que importa: elas sumiram **do banco**, não só da tela.
  const restantes = await comoDono(`/channels/${canalDeFaxina.id}/messages`);
  const lista = Array.isArray(restantes.corpo) ? restantes.corpo : [];
  const sobreviventes = lista.filter((m) => antes.includes(m.id));
  registrar(
    "5b. as mensagens sumiram de verdade do canal",
    antes.length === 6 && sobreviventes.length === 1,
    `mandei ${antes.length}, sobrou ${sobreviventes.length} (a mais antiga, que o teto de 5 não alcançou)`,
  );
}

// ── 6. sem permissão → recusa efêmera ───────────────────────
{
  xereta.novas.length = 0;
  dono.novas.length = 0;
  await digitar(gente.xereta.accessToken, semente.canal.id, "aviso", [
    { name: "usuario", type: 3, value: gente.alvo.username },
    { name: "motivo", type: 3, value: "não posso fazer isto" },
  ]);
  try {
    const m = await respostaDoBot(xereta, /não tem a permissão/i, 30_000, "a recusa efêmera");
    registrar(
      "6. quem não tem permissão leva a recusa, e ela é efêmera",
      m.efemera === true,
      `efemera=${m.efemera}; ${JSON.stringify((m.content ?? "").slice(0, 120))}`,
    );
    registrar(
      "6b. a recusa nomeia a permissão que falta",
      /moderar membros/i.test(m.content ?? ""),
      JSON.stringify((m.content ?? "").slice(0, 120)),
    );
  } catch (e) {
    registrar("6. quem não tem permissão leva a recusa, e ela é efêmera", false, e.message);
  }

  // E o canal não viu nada: efêmera é de uma pessoa só.
  await esperar(1500);
  const vazou = dono.novas.some((m) => /não tem a permissão/i.test(m.content ?? ""));
  registrar("6c. o resto do canal não vê a recusa", !vazou, `mensagens do dono: ${dono.novas.length}`);

  // E o aviso não foi criado.
  dono.novas.length = 0;
  await digitar(DONO, semente.canal.id, "avisos", [
    { name: "usuario", type: 3, value: gente.alvo.username },
  ]);
  try {
    const m = await respostaDoBot(dono, /aviso/i, 30_000, "a lista depois da tentativa");
    registrar(
      "6d. a tentativa recusada não guardou aviso nenhum",
      !/não posso fazer isto/.test(textoDoEmbed(m)),
      JSON.stringify(textoDoEmbed(m).slice(0, 140)),
    );
  } catch (e) {
    registrar("6d. a tentativa recusada não guardou aviso nenhum", false, e.message);
  }
}

// ── 7. a rota que a casca não tem ───────────────────────────
{
  dono.novas.length = 0;
  await digitar(DONO, semente.canal.id, "banir", [
    { name: "usuario", type: 3, value: gente.alvo.username },
    { name: "motivo", type: 3, value: "teste da dependência declarada" },
  ]);
  try {
    const m = await respostaDoBot(
      dono,
      /ainda não existe na camada de bots|foi banido/i,
      45_000,
      "a resposta do /banir",
    );
    const texto = m.content ?? "";
    registrar(
      "7. /banir não pendura: ou bane, ou diz que a rota ainda não existe",
      texto.length > 0 && !/at .*\.js:\d+/.test(texto),
      JSON.stringify(texto.slice(0, 200)),
    );
  } catch (e) {
    registrar("7. /banir não pendura: ou bane, ou diz que a rota ainda não existe", false, e.message);
  }
}

// ── 8. o prefixo `!` ────────────────────────────────────────
{
  dono.novas.length = 0;
  falar(dono, semente.canal.id, `!avisos ${gente.alvo.username}`);
  try {
    const m = await respostaDoBot(dono, /avisos de/i, 30_000, "a resposta do !avisos");
    registrar("8. o prefixo `!avisos` chega ao mesmo comando", true, JSON.stringify(textoDoEmbed(m).slice(0, 100)));
  } catch (e) {
    registrar("8. o prefixo `!avisos` chega ao mesmo comando", false, e.message);
  }
}

dono.socket.close();
xereta.socket.close();
alvo.socket.close();
console.log(falhas === 0 ? "\ntodas as provas passaram." : `\n${falhas} prova(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
