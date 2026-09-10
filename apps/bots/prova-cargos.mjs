// A prova do **Streamz Cargos** contra a bancada descartável.
//
// Entrada (variáveis de ambiente):
//   SEMENTE    JSON de `apps/api/test/discord-compat/semear.mjs`
//   BANCADA    JSON de `preparar-cargos.mjs` (os dois cargos e o 2º usuário)
//   APP        JSON com { id, name, botUserId } do aplicativo provisionado
//   API_URL    http://<api>:3333/api
//
// O que ela prova, e por que cada passo existe:
//
//   1. o bot aparece em "Descobrir aplicativos" e registrou o `/painel`;
//   2. `!painel criar` publica a mensagem do painel de verdade, no canal;
//   3. `!painel adicionar` liga dois emojis a dois cargos e reage na mensagem;
//   4. **um segundo usuário reage e ganha o cargo** — conferido pela API, não
//      pelo que o bot disse;
//   5. ele desreage e **perde** o cargo;
//   6. no modo `único`, pegar o segundo cargo **tira** o primeiro;
//   7. quem não gerencia cargos é **recusado** ao tentar mexer no painel.
//
// Os passos 4 e 5 são a prova toda: é a única coisa que este bot faz, e é o
// que não funcionava antes de a F5 entregar `MESSAGE_REACTION_ADD` de verdade.

import { io } from "socket.io-client";

const semente = JSON.parse(process.env.SEMENTE);
const bancada = JSON.parse(process.env.BANCADA);
const app = JSON.parse(process.env.APP);
const API = process.env.API_URL;
const BASE = API.replace(/\/api$/, "");

const OUVINTE = "🎧";
const JOGADOR = "🎮";

let falhas = 0;
const registrar = (nome, ok, detalhe) => {
  if (!ok) falhas++;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function ate(condicao, ms, oQue) {
  const limite = Date.now() + ms;
  for (;;) {
    const v = await condicao();
    if (v) return v;
    if (Date.now() >= limite) throw new Error(`tempo esgotado esperando: ${oQue}`);
    await esperar(250);
  }
}

async function chamar(rota, token, { metodo = "GET", corpo } = {}) {
  const r = await fetch(`${API}${rota}`, {
    method: metodo,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  });
  const texto = await r.text();
  return { status: r.status, corpo: texto ? JSON.parse(texto) : null };
}

const comoDono = (rota, opcoes) => chamar(rota, semente.dono.accessToken, opcoes);

const pendente = (nome, porque) => console.log(`PEND ${nome} — ${porque}`);

/**
 * A rota de cargo existe nesta instância?
 *
 * `membro.roles.add()` do discord.js é `PUT /guilds/:id/members/:uid/roles/:rid`,
 * e o §12 F5 do documento lista "membros/cargos no REST" como **ainda na fila**.
 * A sonda distingue os dois 404 possíveis: o do Nest, que é a rota não existir
 * (`code: 0`, "Cannot PUT …"), e o do Discord, que é o recurso não existir
 * (`10004`/`10007`/`10011`) — este segundo quer dizer que a rota **está** lá.
 *
 * Sem esta distinção o passo seguinte falharia com "tempo esgotado", que é
 * exatamente o diagnóstico errado: parece defeito do bot e é rota faltando.
 */
async function rotaDeCargoExiste() {
  const r = await fetch(`${API}/v10/guilds/${semente.servidor.snowflake}/members/1/roles/1`, {
    method: "PUT",
    headers: { authorization: `Bot ${process.env.TOKEN_DO_BOT ?? ""}` },
  });
  const texto = await r.text();
  let corpo = {};
  try {
    corpo = JSON.parse(texto);
  } catch {
    /* 404 do Nest às vezes vem em HTML */
  }
  if (r.status === 404 && (corpo.code === 0 || /Cannot (PUT|DELETE)/i.test(corpo.message ?? texto))) {
    return false;
  }
  return true;
}

const TEM_ROTA_DE_CARGO = await rotaDeCargoExiste();
const SEM_ROTA =
  "a rota `PUT /api/v10/guilds/:id/members/:uid/roles/:rid` ainda não existe nesta instância " +
  "(§12 F5: membros/cargos no REST estão na fila). O bot chama a rota padrão do discord.js: " +
  "no dia em que ela existir, este passo passa sem nenhuma mudança no bot.";

/**
 * Os cargos do segundo usuário **segundo a API**, não segundo o bot.
 *
 * É o ponto da prova: o bot pode responder "pronto" e não ter feito nada. Quem
 * diz se a pessoa ganhou o cargo é o servidor.
 */
async function cargosDoSegundo() {
  const r = await comoDono(
    `/guilds/${semente.servidor.id}/members/${bancada.segundo.id}/permissions`,
  );
  return r.corpo?.roleIds ?? [];
}

const nomeDoCargo = (id) =>
  id === bancada.cargos.ouvinte.id ? "Ouvinte" : id === bancada.cargos.jogador.id ? "Jogador" : id;

async function esperarCargos({ tem = [], naoTem = [] }, ms, oQue) {
  return ate(
    async () => {
      const atuais = await cargosDoSegundo();
      const ok = tem.every((c) => atuais.includes(c)) && naoTem.every((c) => !atuais.includes(c));
      return ok ? atuais : null;
    },
    ms,
    oQue,
  );
}

// ── 1. diretório e comandos ─────────────────────────────────
{
  const r = await comoDono("/applications/publicas");
  const meu = (r.corpo?.itens ?? []).find((a) => a.id === app.id);
  registrar(
    "1. o bot aparece em Descobrir aplicativos, oficial",
    Boolean(meu) && meu.oficial === true,
    `${meu?.name} · descrição de ${meu?.description?.length ?? 0} caracteres`,
  );
  registrar(
    "1b. a descrição cabe nos 300 e avisa da hierarquia",
    (meu?.description?.length ?? 999) <= 300 && /acima/i.test(meu?.description ?? ""),
  );
}
{
  const r = await comoDono(`/guilds/${semente.servidor.id}/comandos-de-app`);
  const nomes = (r.corpo ?? []).map((c) => c.name);
  registrar(
    "1c. o runtime registrou o /painel na subida",
    nomes.includes("painel"),
    nomes.join(", ") || "(nenhum)",
  );
}

// ── os dois "navegadores" ───────────────────────────────────
function conectar(token) {
  const socket = io(BASE, { auth: { token }, transports: ["websocket"], path: "/socket.io" });
  const mensagens = [];
  socket.on("message.new", (m) => mensagens.push(m));
  socket.on("message.updated", (m) => mensagens.push(m));
  // A promessa nasce **junto** com o socket. Criá-la depois (num laço sobre os
  // dois sockets, por exemplo) perde o `connect` do segundo, que já disparou
  // enquanto se esperava o primeiro — e o sintoma é um "não conectou em 15 s"
  // numa conexão que está de pé.
  const pronto = new Promise((ok, erro) => {
    socket.on("connect", ok);
    socket.on("connect_error", erro);
    setTimeout(() => erro(new Error("socket.io não conectou em 15 s")), 15_000);
  });
  return { socket, mensagens, pronto };
}

const dono = conectar(semente.dono.accessToken);
const segundo = conectar(bancada.segundo.accessToken);
for (const quem of [dono, segundo]) {
  await quem.pronto;
  quem.socket.emit("channel.join", { channelId: semente.canal.id });
}
await esperar(500);

const falar = (quem, texto) =>
  quem.socket.emit("message.create", {
    channelId: semente.canal.id,
    content: texto,
    nonce: `botcar-${Math.random()}`,
  });

const textoDe = (m) =>
  [m.content ?? "", ...(m.embeds ?? []).map((e) => [e.title, e.description].filter(Boolean).join(" "))]
    .join(" ")
    .trim();

async function doBot(quem, casa, ms, oQue) {
  try {
    return await ate(() => quem.mensagens.find((m) => m.author?.id === app.botUserId && casa(m)), ms, oQue);
  } catch (e) {
    // Sem isto, toda falha vira "tempo esgotado" e some justamente a coisa que
    // explica a falha: o que o bot **respondeu** em vez do esperado.
    const disse = quem.mensagens
      .filter((m) => m.author?.id === app.botUserId)
      .map((m) => textoDe(m).slice(0, 120));
    throw new Error(`${e.message}. O bot disse: ${JSON.stringify(disse)}`);
  }
}

// ── 2. criar o painel ───────────────────────────────────────
dono.mensagens.length = 0;
falar(dono, "!painel criar #" + semente.canal.name + " Cargos do servidor | Escolha o que quer receber");

let painelSnowflake = null;
let painelInterno = null;
try {
  const resposta = await doBot(
    dono,
    (m) => /O id dele é/.test(m.content ?? ""),
    30_000,
    "a confirmação do !painel criar",
  );
  painelSnowflake = /`(\d+)`/.exec(resposta.content)?.[1] ?? null;
  const publicada = await doBot(
    dono,
    (m) => (m.content ?? "").includes("**Cargos do servidor**"),
    30_000,
    "a mensagem do painel no canal",
  );
  painelInterno = publicada.id;
  registrar(
    "2. !painel criar publica o painel no canal",
    Boolean(painelSnowflake) && Boolean(painelInterno),
    `id do painel: ${painelSnowflake}`,
  );
} catch (e) {
  registrar("2. !painel criar publica o painel no canal", false, e.message);
}

// ── 3. dois emojis, dois cargos ─────────────────────────────
if (painelSnowflake) {
  for (const [emoji, cargo, rotulo] of [
    [OUVINTE, bancada.cargos.ouvinte, "Avisos de live"],
    [JOGADOR, bancada.cargos.jogador, "Chamada de jogo"],
  ]) {
    dono.mensagens.length = 0;
    // Pelo **nome** e não pelo id: o id que o REST interno devolve é um cuid, e
    // o bot vive no mundo dos snowflakes (é o que a casca traduz). Resolver
    // cargo por nome é caminho de primeira classe do comando, e é o que uma
    // pessoa digitaria de qualquer jeito.
    falar(dono, `!painel adicionar ${painelSnowflake} ${emoji} @${cargo.name} ${rotulo}`);
    try {
      await doBot(
        dono,
        (m) => (m.content ?? "").includes("passa a dar"),
        30_000,
        `a confirmação de adicionar ${emoji}`,
      );
      registrar(`3. ${emoji} passa a dar o cargo ${cargo.name}`, true);
    } catch (e) {
      registrar(`3. ${emoji} passa a dar o cargo ${cargo.name}`, false, e.message);
    }
  }

  // O bot tem de ter reagido na mensagem: é o que oferece a opção a quem lê.
  try {
    const marcadas = await ate(
      async () => {
        const r = await comoDono(`/channels/${semente.canal.id}/messages`);
        const m = (r.corpo?.items ?? r.corpo ?? []).find((x) => x.id === painelInterno);
        const emojis = (m?.reactions ?? []).map((x) => x.emoji);
        return emojis.includes(OUVINTE) && emojis.includes(JOGADOR) ? emojis : null;
      },
      30_000,
      "as reações do bot na mensagem do painel",
    );
    registrar("3b. o bot reagiu no painel com os dois emojis", true, JSON.stringify(marcadas));
  } catch (e) {
    registrar("3b. o bot reagiu no painel com os dois emojis", false, e.message);
  }
}

// ── 4 e 5. O QUE IMPORTA: reagir ganha, desreagir perde ─────
if (painelInterno && !TEM_ROTA_DE_CARGO) {
  pendente("4. reagir dá o cargo", SEM_ROTA);
  pendente("5. desreagir tira o cargo", SEM_ROTA);
  pendente("6. modo único troca o cargo", SEM_ROTA);
  // Reage assim mesmo: o que sai no log do bot (o passo seguinte, no shell,
  // mostra) é a frase que nomeia a rota que falta — e não um 404 pelado.
  segundo.socket.emit("reaction.add", { messageId: painelInterno, emoji: OUVINTE });
  await esperar(4000);
}

if (painelInterno && TEM_ROTA_DE_CARGO) {
  const antes = await cargosDoSegundo();
  registrar(
    "4a. o segundo usuário começa sem os cargos do painel",
    !antes.includes(bancada.cargos.ouvinte.id),
    `cargos: ${antes.map(nomeDoCargo).join(", ") || "(nenhum)"}`,
  );

  let ganhou = false;
  segundo.socket.emit("reaction.add", { messageId: painelInterno, emoji: OUVINTE });
  try {
    const agora = await esperarCargos(
      { tem: [bancada.cargos.ouvinte.id] },
      30_000,
      "o cargo Ouvinte no segundo usuário",
    );
    ganhou = true;
    registrar(
      `4. ${OUVINTE} → o segundo usuário GANHOU o cargo Ouvinte (conferido pela API)`,
      true,
      `cargos agora: ${agora.map(nomeDoCargo).join(", ")}`,
    );
  } catch (e) {
    registrar(`4. ${OUVINTE} → o segundo usuário GANHOU o cargo Ouvinte`, false, e.message);
  }

  // Sem esta guarda o passo 5 passaria sozinho: "não tem o cargo" é verdade
  // desde o começo quando o passo 4 falhou, e um OK assim é pior que a falha.
  if (!ganhou) registrar("5. tirou a reação → PERDEU o cargo Ouvinte", false, "o passo 4 não deu o cargo");
  segundo.socket.emit("reaction.remove", { messageId: painelInterno, emoji: OUVINTE });
  try {
    const agora = await esperarCargos(
      { naoTem: [bancada.cargos.ouvinte.id] },
      30_000,
      "o cargo Ouvinte sair do segundo usuário",
    );
    if (ganhou) {
      registrar(
        `5. tirou a reação → PERDEU o cargo Ouvinte (conferido pela API)`,
        true,
        `cargos agora: ${agora.map(nomeDoCargo).join(", ") || "(nenhum)"}`,
      );
    }
  } catch (e) {
    if (ganhou) registrar("5. tirou a reação → PERDEU o cargo Ouvinte", false, e.message);
  }
}

// ── 6. modo único: pegar o outro troca ──────────────────────
// A troca de modo é comando, não cargo: ela vale mesmo sem a rota de cargo, e
// é o que o passo 7b confere depois.
if (painelSnowflake) {
  dono.mensagens.length = 0;
  falar(dono, `!painel modo ${painelSnowflake} unico`);
  try {
    await doBot(dono, (m) => /agora é \*\*unico\*\*/.test(m.content ?? ""), 30_000, "a troca de modo");
    registrar("6a. !painel modo <id> unico", true);
  } catch (e) {
    registrar("6a. !painel modo <id> unico", false, e.message);
  }
}

if (painelSnowflake && painelInterno && TEM_ROTA_DE_CARGO) {
  segundo.socket.emit("reaction.add", { messageId: painelInterno, emoji: OUVINTE });
  try {
    await esperarCargos({ tem: [bancada.cargos.ouvinte.id] }, 30_000, "o Ouvinte de volta");
    segundo.socket.emit("reaction.add", { messageId: painelInterno, emoji: JOGADOR });
    const agora = await esperarCargos(
      { tem: [bancada.cargos.jogador.id], naoTem: [bancada.cargos.ouvinte.id] },
      30_000,
      "a troca de Ouvinte por Jogador",
    );
    registrar(
      "6. modo único: pegar o segundo cargo TROCOU (ganhou Jogador, perdeu Ouvinte)",
      true,
      `cargos agora: ${agora.map(nomeDoCargo).join(", ")}`,
    );
  } catch (e) {
    registrar("6. modo único: pegar o segundo cargo TROCOU", false, e.message);
  }

  // Cosmético, mas é o que faz o painel não mentir: a reação anterior sai.
  try {
    await ate(
      async () => {
        const r = await comoDono(`/channels/${semente.canal.id}/messages`);
        const m = (r.corpo?.items ?? r.corpo ?? []).find((x) => x.id === painelInterno);
        const doOuvinte = (m?.reactions ?? []).find((x) => x.emoji === OUVINTE);
        return doOuvinte && doOuvinte.count === 1 ? doOuvinte : null;
      },
      20_000,
      "a reação anterior sair da mensagem",
    );
    registrar("6b. a reação anterior foi desfeita (só a do bot ficou)", true);
  } catch (e) {
    registrar("6b. a reação anterior foi desfeita (só a do bot ficou)", false, e.message);
  }
}

// ── 7. sem permissão, recusa ────────────────────────────────
{
  segundo.mensagens.length = 0;
  falar(segundo, "!painel listar");
  try {
    const m = await doBot(
      segundo,
      (x) => /Gerenciar cargos/i.test(textoDe(x)),
      30_000,
      "a recusa a quem não gerencia cargos",
    );
    registrar("7. quem não gerencia cargos é recusado", true, JSON.stringify(m.content.slice(0, 80)));
  } catch (e) {
    registrar("7. quem não gerencia cargos é recusado", false, e.message);
  }

  // E o dono, que gerencia, consegue.
  dono.mensagens.length = 0;
  falar(dono, "!painel listar");
  try {
    const m = await doBot(dono, (x) => /modo \*\*unico\*\*/.test(x.content ?? ""), 30_000, "o /painel listar do dono");
    registrar("7b. quem gerencia consegue listar", true, JSON.stringify(m.content.slice(0, 100)));
  } catch (e) {
    registrar("7b. quem gerencia consegue listar", false, e.message);
  }
}

// ── 8. o preparo da reconciliação ───────────────────────────
// A mensagem do painel é apagada **daqui**, pelo socket.io do dono (é o que o
// navegador faz — não há rota REST interna de apagar mensagem). O bot reinicia
// no shell e tem de esquecer o painel sem cair.
if (painelInterno) {
  dono.socket.emit("message.delete", { messageId: painelInterno });
  await esperar(2000);
}

dono.socket.close();
segundo.socket.close();

console.log(
  `\n${falhas === 0 ? "TUDO CERTO" : `${falhas} FALHA(S)`}` +
    (TEM_ROTA_DE_CARGO ? "" : " (com 3 passos PENDENTES: a rota de cargo não existe aqui)"),
);
console.log(`PAINEL_INTERNO=${painelInterno ?? ""}`);
process.exit(falhas === 0 ? 0 : 1);
