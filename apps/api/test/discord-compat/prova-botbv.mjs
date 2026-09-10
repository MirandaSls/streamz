// A prova do **Streamz Boas-vindas** contra a bancada descartável.
//
// Entrada (variáveis de ambiente):
//   SEMENTE   JSON de `semear.mjs` (dono, servidor, canal de texto)
//   APP       JSON com { id, snowflake, name, botUserId } do aplicativo
//   API_URL   http://<api>:3333/api
//
// O que ela prova, e por que cada passo:
//
//   1. o aplicativo aparece em **Descobrir aplicativos**, oficial, com a
//      descrição que o bot declara (que avisa que ele nasce desligado);
//   2. os três comandos de barra foram registrados pelo runtime na subida;
//   3. **nada acontece antes de configurar**: um membro entra e o canal fica
//      em silêncio. Sem este passo, a mensagem do passo 5 não provaria que a
//      configuração é o que a liga — poderia ser o padrão de fábrica falando;
//   4. `/boas-vindas canal` + `/boas-vindas mensagem` configuram, e
//      `!boas-vindas ver` (o **prefixo**) mostra o que ficou;
//   5. um **segundo usuário entra de verdade** (convite + resgate, como o
//      `prova-efemera.mjs` faz) e a mensagem chega ao canal pelo socket.io,
//      com `{usuario}`, `{servidor}` e `{contagem}` substituídos;
//   6. `/boas-vindas testar` dispara o mesmo caminho e relata as três pernas;
//   7. `/autorole <cargo>` guarda o cargo, e a prova **confere no servidor** se
//      quem entrou depois recebeu — sem confiar no que o bot respondeu;
//   8. quem **não** pode gerenciar o servidor leva recusa **efêmera**, e a
//      configuração não muda;
//   9. `/boas-vindas desligar` desliga, e a saída (`/saida`) funciona igual.

import { io } from "socket.io-client";

const semente = JSON.parse(process.env.SEMENTE);
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

async function comoUsuario(token, rota, { metodo = "GET", corpo } = {}) {
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
const comoDono = (rota, opcoes) => comoUsuario(semente.dono.accessToken, rota, opcoes);

// ── 1. o diretório ──────────────────────────────────────────
{
  const r = await comoDono("/applications/publicas");
  const itens = r.corpo?.itens ?? [];
  const meu = itens.find((a) => a.id === app.id);
  registrar(
    "1. o bot aparece em Descobrir aplicativos, oficial",
    r.status === 200 && meu?.oficial === true,
    `${r.status}; oficial=${meu?.oficial}`,
  );
  registrar(
    "1b. a descrição avisa que ele nasce desligado",
    /desligado/i.test(meu?.description ?? ""),
    `${(meu?.description ?? "").length} caracteres`,
  );
}

// ── 2. os comandos registrados na subida ────────────────────
const comandos = await comoDono(`/guilds/${semente.servidor.id}/comandos-de-app`);
const nomes = (comandos.corpo ?? []).map((c) => c.name).sort();
registrar(
  "2. os três comandos de barra foram registrados pelo runtime",
  comandos.status === 200 && nomes.join(",") === "autorole,boas-vindas,saida",
  `${comandos.status}: ${nomes.join(", ")}`,
);
const idDe = (nome) => (comandos.corpo ?? []).find((c) => c.name === nome)?.id;

// ── o "navegador" do dono ───────────────────────────────────
async function navegador(nome, token) {
  const socket = io(BASE, { auth: { token }, transports: ["websocket"], path: "/socket.io" });
  const mensagens = [];
  socket.on("message.new", (m) => mensagens.push(m));
  socket.on("message.updated", (m) => mensagens.push(m));
  await new Promise((ok, erro) => {
    socket.on("connect", ok);
    socket.on("connect_error", erro);
    setTimeout(() => erro(new Error(`socket.io de ${nome} não conectou em 15 s`)), 15_000);
  });
  socket.emit("channel.join", { channelId: semente.canal.id });
  await esperar(400);
  return { nome, socket, mensagens };
}

const dono = await navegador("dono", semente.dono.accessToken);

/** Dispara um comando de barra como o composer faz. */
async function digitar(token, nome, opcoes = []) {
  const r = await comoUsuario(token, `/channels/${semente.canal.id}/interactions`, {
    metodo: "POST",
    corpo: { commandId: idDe(nome), options: opcoes },
  });
  if (r.status >= 400) throw new Error(`POST interactions /${nome} → ${r.status}`);
}
const opcao = (nome, valor) => ({ name: nome, type: 3, value: valor });

/** Manda uma mensagem no canal como o navegador faz (o prefixo `!`). */
function falar(nav, texto) {
  nav.socket.emit("message.create", {
    channelId: semente.canal.id,
    content: texto,
    nonce: `botbv-${Date.now()}-${Math.random()}`,
  });
}

function textoDoEmbed(m) {
  return (m.embeds ?? [])
    .map((e) =>
      [e.title, e.description, ...(e.fields ?? []).map((f) => `${f.name} ${f.value}`), e.footer?.text]
        .filter(Boolean)
        .join(" "),
    )
    .join(" ");
}

async function respostaDoBot(nav, criterio, ms, oQue) {
  const casa = typeof criterio === "function" ? criterio : (t) => criterio.test(t);
  return ate(
    () =>
      nav.mensagens.find(
        (m) => m.author?.id === app.botUserId && (casa(m.content ?? "") || casa(textoDoEmbed(m))),
      ),
    ms,
    oQue,
  );
}

/** Registra alguém novo e faz entrar no servidor por convite (como o `prova-efemera`). */
async function novoMembro(rotulo) {
  const sufixo = Math.random().toString(36).slice(2, 8);
  const username = `${rotulo}-${sufixo}`;
  const registro = await comoUsuario(null, "/auth/register", {
    metodo: "POST",
    corpo: {
      email: `${username}@exemplo.invalido`,
      username,
      password: "senha-de-teste-123",
    },
  });
  if (registro.status >= 400) throw new Error(`registro de ${username} → ${registro.status}`);
  const token = registro.corpo.tokens.accessToken;
  const convite = await comoDono(`/guilds/${semente.servidor.id}/invites`, {
    metodo: "POST",
    corpo: {},
  });
  const resgate = await comoUsuario(token, `/invites/${convite.corpo.code}/redeem`, {
    metodo: "POST",
  });
  if (resgate.status >= 400) throw new Error(`resgate de ${username} → ${resgate.status}`);
  return { username, token, id: registro.corpo.user.id };
}

// ── 3. antes de configurar, silêncio ────────────────────────
{
  dono.mensagens.length = 0;
  const mudo = await novoMembro("mudo");
  await esperar(6000);
  const doBot = dono.mensagens.filter((m) => m.author?.id === app.botUserId);
  registrar(
    "3. sem configuração, entrar no servidor não gera mensagem nenhuma",
    doBot.length === 0,
    `${mudo.username} entrou; ${doBot.length} mensagem(ns) do bot`,
  );
}

// ── 4. configurar ───────────────────────────────────────────
const MODELO =
  "Olá {usuario}, bem-vindo(a) ao {servidor}! Você é a pessoa de número {contagem} por aqui. ({nome})";
{
  dono.mensagens.length = 0;
  await digitar(semente.dono.accessToken, "boas-vindas", [
    opcao("acao", "canal"),
    opcao("valor", `<#${semente.canal.snowflake}>`),
  ]);
  try {
    const m = await respostaDoBot(dono, /Boas-vindas ligadas/i, 30_000, "a confirmação do canal");
    registrar("4. /boas-vindas canal liga e responde efêmero", m.efemera === true, `efemera=${m.efemera}`);
  } catch (e) {
    registrar("4. /boas-vindas canal liga e responde efêmero", false, e.message);
  }

  dono.mensagens.length = 0;
  await digitar(semente.dono.accessToken, "boas-vindas", [
    opcao("acao", "mensagem"),
    opcao("valor", MODELO),
  ]);
  try {
    await respostaDoBot(dono, /Mensagem de boas-vindas guardada/i, 30_000, "a confirmação da mensagem");
    registrar("4b. /boas-vindas mensagem guarda o modelo", true);
  } catch (e) {
    registrar("4b. /boas-vindas mensagem guarda o modelo", false, e.message);
  }

  // O prefixo `!`, para provar que a mesma configuração é lida pelas duas entradas.
  dono.mensagens.length = 0;
  falar(dono, "!boas-vindas ver");
  try {
    const m = await respostaDoBot(dono, /configuração atual/i, 30_000, "o !boas-vindas ver");
    registrar(
      "4c. `!boas-vindas ver` (prefixo) mostra o canal e a mensagem",
      (m.content ?? "").includes("bem-vindo(a) ao {servidor}"),
      JSON.stringify((m.content ?? "").replace(/\n/g, " | ").slice(0, 140)),
    );
  } catch (e) {
    registrar("4c. `!boas-vindas ver` (prefixo) mostra o canal e a mensagem", false, e.message);
  }
}

// ── 5. alguém entra de verdade ──────────────────────────────
let recemChegado = null;
{
  dono.mensagens.length = 0;
  recemChegado = await novoMembro("visita");
  try {
    const m = await respostaDoBot(
      dono,
      (t) => t.includes(`@${recemChegado.username}`),
      45_000,
      "a mensagem de boas-vindas no canal",
    );
    const texto = m.content ?? "";
    registrar(
      "5. quem entra recebe a mensagem no canal, pelo socket.io",
      texto.includes(semente.servidor.name) && /número \d+ por aqui/.test(texto),
      JSON.stringify(texto),
    );
    registrar(
      "5b. a menção é `@usuario` (a forma que o Streamz notifica)",
      texto.includes(`@${recemChegado.username}`) && !texto.includes("<@"),
      "sem `<@id>` cru",
    );
    registrar("5c. e não é efêmera: o canal inteiro vê", m.efemera !== true, `efemera=${m.efemera}`);
  } catch (e) {
    registrar("5. quem entra recebe a mensagem no canal, pelo socket.io", false, e.message);
  }
}

// ── 6. /boas-vindas testar ──────────────────────────────────
{
  dono.mensagens.length = 0;
  await digitar(semente.dono.accessToken, "boas-vindas", [opcao("acao", "testar")]);
  try {
    const relato = await respostaDoBot(dono, /Disparei como se você/i, 45_000, "o relato do testar");
    registrar(
      "6. /boas-vindas testar dispara e relata as três pernas",
      /mensagem no canal: \*\*ok\*\*/i.test(relato.content ?? ""),
      JSON.stringify((relato.content ?? "").replace(/\n/g, " | ")),
    );
    const publicada = await respostaDoBot(
      dono,
      (t) => t.includes(`@${semente.dono.username}`),
      20_000,
      "a mensagem que o testar publicou",
    );
    registrar("6b. e a mensagem sai no canal de verdade", Boolean(publicada));
  } catch (e) {
    registrar("6. /boas-vindas testar dispara e relata as três pernas", false, e.message);
  }
}

// ── 7. autorole ─────────────────────────────────────────────
{
  const cargo = await comoDono(`/guilds/${semente.servidor.id}/roles`, {
    metodo: "POST",
    corpo: { name: "Novatos" },
  });
  registrar("7. o dono cria o cargo Novatos", cargo.status < 400, `${cargo.status}`);

  dono.mensagens.length = 0;
  await digitar(semente.dono.accessToken, "autorole", [opcao("cargo", "@Novatos")]);
  try {
    const m = await respostaDoBot(dono, /Quem entrar recebe/i, 30_000, "a confirmação do autorole");
    registrar("7b. /autorole guarda o cargo, achado pelo nome", true, JSON.stringify(m.content));
  } catch (e) {
    registrar("7b. /autorole guarda o cargo, achado pelo nome", false, e.message);
  }

  // A pergunta que importa: **o membro recebeu o cargo?** Perguntamos ao
  // servidor, e não ao bot — a resposta do bot é justamente o que está sob
  // prova. Entra alguém novo com o autorole já ligado.
  dono.mensagens.length = 0;
  const novato = await novoMembro("novato");
  await respostaDoBot(dono, (t) => t.includes(`@${novato.username}`), 45_000, "a boas-vindas do novato").catch(
    () => null,
  );
  await esperar(2000);
  // `GET /guilds/:id/members` devolve `roleIds` (cuids), não os cargos inteiros.
  const membros = await comoDono(`/guilds/${semente.servidor.id}/members`);
  const linha = (membros.corpo ?? []).find((m) => m.user?.id === novato.id);
  const cargos = linha?.roleIds ?? [];
  const deuOCargo = cargos.includes(cargo.corpo?.id);

  // O relato do `/boas-vindas testar` diz o que aconteceu com o cargo. É por
  // ele que o passo abaixo decide entre "funcionou" e "está pendente na API".
  dono.mensagens.length = 0;
  await digitar(semente.dono.accessToken, "boas-vindas", [opcao("acao", "testar")]);
  let linhaDoCargo = "";
  try {
    const relato = await respostaDoBot(dono, /Disparei como se você/i, 45_000, "o relato com autorole");
    linhaDoCargo =
      (relato.content ?? "").split("\n").find((l) => l.includes("cargo automático")) ?? "";
  } catch (e) {
    registrar("7c. o relato do testar chega", false, e.message);
  }

  if (deuOCargo) {
    registrar(
      "7c. quem entrou recebeu o cargo automático (conferido no servidor)",
      true,
      `roleIds de ${novato.username}: ${JSON.stringify(cargos)}`,
    );
    registrar("7d. e o relato do testar confirma", /cargo automático: \*\*ok\*\*/i.test(linhaDoCargo));
  } else {
    // **Dependência declarada**, no mesmo espírito do passo do `/tocar` sem
    // ponte de voz em `prova-botmus.sh`: a casca de compatibilidade ainda não
    // tem `PUT /guilds/:id/members/:uid/roles/:rid` (conferido em
    // `apps/api/src/modules/discord-compat/rest/`), e nenhuma linha do bot faz
    // um cargo aparecer sem ela. O que **está** sob prova aqui é o
    // comportamento na ausência: o bot guarda a configuração, tenta a rota
    // padrão do discord.js e **diz qual rota falta** — em vez de ficar calado
    // ou responder "ok".
    console.log(
      "PEND 7c. o cargo NÃO foi dado: a casca não tem `PUT /guilds/:id/members/:uid/roles/:rid`.\n" +
        "        Quando a rota existir, este passo passa a cobrar o cargo de verdade, sem mudar o bot.",
    );
    registrar(
      "7d. sem a rota, o bot diz **qual rota falta** (não finge que deu certo)",
      /falhou/.test(linhaDoCargo) && /members\/:uid\/roles/.test(linhaDoCargo),
      JSON.stringify(linhaDoCargo),
    );
  }
}

// ── 8. sem permissão, recusa efêmera ────────────────────────
{
  const comum = await navegador("recém-chegado", recemChegado.token);
  comum.mensagens.length = 0;
  dono.mensagens.length = 0;
  await digitar(recemChegado.token, "boas-vindas", [opcao("acao", "desligar")]);
  try {
    const m = await respostaDoBot(comum, /gerenciar o servidor/i, 30_000, "a recusa");
    registrar("8. quem não gerencia o servidor leva recusa", true, JSON.stringify(m.content));
    registrar("8b. e a recusa é efêmera", m.efemera === true, `efemera=${m.efemera}`);
    await esperar(2000);
    registrar(
      "8c. ninguém mais vê a recusa",
      dono.mensagens.filter((x) => x.author?.id === app.botUserId).length === 0,
      `${dono.mensagens.length} mensagem(ns) no socket do dono`,
    );
  } catch (e) {
    registrar("8. quem não gerencia o servidor leva recusa", false, e.message);
  }

  // E a configuração continua ligada: a recusa não pode ter mexido em nada.
  dono.mensagens.length = 0;
  falar(dono, "!boas-vindas ver");
  try {
    const m = await respostaDoBot(dono, /configuração atual/i, 30_000, "a configuração depois da recusa");
    registrar(
      "8d. a configuração não mudou",
      /\*\*Entrada:\*\* ligada em #/i.test(m.content ?? ""),
      JSON.stringify((m.content ?? "").split("\n")[1] ?? ""),
    );
  } catch (e) {
    registrar("8d. a configuração não mudou", false, e.message);
  }
  comum.socket.close();
}

// ── 9. desligar, e a saída ──────────────────────────────────
{
  dono.mensagens.length = 0;
  await digitar(semente.dono.accessToken, "boas-vindas", [opcao("acao", "desligar")]);
  await respostaDoBot(dono, /Boas-vindas desligadas/i, 30_000, "a confirmação do desligar").catch(
    () => null,
  );

  dono.mensagens.length = 0;
  const depois = await novoMembro("silencio");
  await esperar(8000);
  const doBot = dono.mensagens.filter(
    (m) => m.author?.id === app.botUserId && (m.content ?? "").includes(`@${depois.username}`),
  );
  registrar(
    "9. depois de desligar, entrar não gera mensagem",
    doBot.length === 0,
    `${depois.username} entrou; ${doBot.length} mensagem(ns)`,
  );

  dono.mensagens.length = 0;
  await digitar(semente.dono.accessToken, "saida", [
    opcao("acao", "canal"),
    opcao("valor", `<#${semente.canal.snowflake}>`),
  ]);
  try {
    await respostaDoBot(dono, /Mensagem de saída ligada/i, 30_000, "a confirmação do /saida");
    registrar("9b. /saida canal liga a mensagem de quem sai", true);
  } catch (e) {
    registrar("9b. /saida canal liga a mensagem de quem sai", false, e.message);
  }

  dono.mensagens.length = 0;
  const saiu = await comoUsuario(depois.token, `/guilds/${semente.servidor.id}/leave`, {
    metodo: "POST",
  });
  try {
    const m = await respostaDoBot(
      dono,
      (t) => t.includes("saiu do servidor"),
      45_000,
      "a mensagem de saída",
    );
    registrar("9c. quem sai gera a mensagem de saída", saiu.status < 400, JSON.stringify(m.content));
  } catch (e) {
    registrar("9c. quem sai gera a mensagem de saída", false, `${saiu.status}: ${e.message}`);
  }
}

dono.socket.close();
console.log(falhas === 0 ? "\ntodas as provas passaram." : `\n${falhas} prova(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
