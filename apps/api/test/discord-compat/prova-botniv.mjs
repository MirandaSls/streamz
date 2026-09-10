// A prova do **Streamz Níveis** rodando contra a bancada descartável.
//
// Entrada (variáveis de ambiente):
//   SEMENTE   JSON de `semear.mjs` (dono, servidor, canal de texto)
//   APP       JSON com { id, snowflake, name, botUserId } do app provisionado
//   API_URL   http://<api>:3333/api
//   CARENCIA_MS  a carência com que o bot subiu (o `.sh` a encolhe; ver abaixo)
//
// O que ela prova, e por que cada passo:
//
//   1. o aplicativo aparece em **Descobrir aplicativos**, oficial, com a
//      descrição que o bot declara;
//   2. os **nove comandos de barra** foram registrados pelo runtime na subida;
//   3. **a carência**: N mensagens seguidas rendem **um** ganho de XP, e o
//      `/nivel` mostra as N mensagens (flood conta como conversa, não como XP);
//   4. passada a carência, a mensagem seguinte ganha de novo;
//   5. `/cargo-por-nivel` guarda a regra e **diz** que a rota de cargos da API
//      ainda não existe (a dependência declarada deste bot — ver
//      `SEM_ROTA_DE_CARGOS` em `apps/bots/src/niveis/servico.ts`);
//   6. subir de nível **anuncia no canal** e tenta entregar o cargo;
//   7. `/ranking` ordena por XP, com quem tem mais em primeiro;
//   8. `/dar-xp` de quem **não** gerencia o servidor é recusado, e a recusa é
//      **efêmera**: chega ao socket de quem pediu e não ao do outro.
//
// Por que a carência vem por variável: o padrão são 60 s, e esperar um minuto
// por ganho tornaria a bancada inútil. O `.sh` sobe o bot com
// `NIVEIS_CARENCIA_MS` curto — a regra continua sendo a regra, o relógio é que
// encolhe (mesmo espírito do `THROTTLE_DISABLED` da API).

import { io } from "socket.io-client";

const semente = JSON.parse(process.env.SEMENTE);
const app = JSON.parse(process.env.APP);
const API = process.env.API_URL;
const BASE = API.replace(/\/api$/, "");
const CARENCIA_MS = Number(process.env.CARENCIA_MS ?? 8000);

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
    await esperar(200);
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

// ── 0. o segundo membro e o cargo do nível 1 ─────────────────
//
// O segundo membro é **comum**: sem `MANAGE_GUILD`, é ele quem prova a recusa
// do passo 8. Entra por convite, que é o caminho que uma pessoa faria.

const sufixo = Math.random().toString(36).slice(2, 8);
const comum = { username: `comum${sufixo}`, accessToken: null, id: null };
{
  const registro = await comoUsuario(null, "/auth/register", {
    metodo: "POST",
    corpo: {
      email: `${comum.username}@exemplo.invalido`,
      username: comum.username,
      password: "senha-de-teste-123",
    },
  });
  if (registro.status >= 400) throw new Error(`registro → ${registro.status}`);
  comum.accessToken = registro.corpo.tokens.accessToken;
  comum.id = registro.corpo.user.id;

  const convite = await comoDono(`/guilds/${semente.servidor.id}/invites`, { metodo: "POST", corpo: {} });
  const resgate = await comoUsuario(comum.accessToken, `/invites/${convite.corpo.code}/redeem`, {
    metodo: "POST",
  });
  registrar(
    "0. um segundo membro (sem gerenciar servidor) no mesmo canal",
    convite.status < 400 && resgate.status < 400,
    `convite ${convite.status}, resgate ${resgate.status}, usuário ${comum.username}`,
  );
}

const cargo = await comoDono(`/guilds/${semente.servidor.id}/roles`, {
  metodo: "POST",
  corpo: { name: "Nivelado", color: "#9BE31F", permissions: 0 },
});
registrar("0b. um cargo para o `/cargo-por-nivel` apontar", cargo.status < 400, `cargo "Nivelado" (${cargo.status})`);

// ── 1. o diretório ───────────────────────────────────────────
{
  const r = await comoDono("/applications/publicas");
  const itens = r.corpo?.itens ?? [];
  const meu = itens.find((a) => a.id === app.id);
  registrar(
    "1. o bot aparece em Descobrir aplicativos",
    r.status === 200 && Boolean(meu),
    `${r.status}; ${itens.length} publicado(s)`,
  );
  registrar(
    "1b. oficial, e a descrição avisa o que ele NÃO conta",
    meu?.oficial === true && /voz/i.test(meu?.description ?? ""),
    `oficial=${meu?.oficial}; descrição de ${meu?.description?.length ?? 0} caracteres (limite 300)`,
  );
}

// ── 2. os comandos registrados na subida ─────────────────────
const comandos = await comoDono(`/guilds/${semente.servidor.id}/comandos-de-app`);
const doBot = (comandos.corpo ?? []).filter((c) => c.application?.botUser?.id === app.botUserId || true);
const nomes = doBot.map((c) => c.name).sort();
const esperados = [
  "cargo-por-nivel",
  "cargos-por-nivel",
  "configurar-niveis",
  "dar-xp",
  "nivel",
  "ranking",
  "remover-cargo-por-nivel",
  "tirar-xp",
  "zerar-niveis",
].sort();
registrar(
  "2. os 9 comandos de barra foram registrados pelo runtime",
  comandos.status === 200 && nomes.join(",") === esperados.join(","),
  `${comandos.status}: ${nomes.join(", ")}`,
);
const idDe = (nome) => (comandos.corpo ?? []).find((c) => c.name === nome)?.id;

// ── os dois "navegadores" ────────────────────────────────────

async function navegador(nome, token) {
  const socket = io(BASE, { auth: { token }, transports: ["websocket"], path: "/socket.io" });
  const novas = [];
  socket.on("message.new", (m) => novas.push(m));
  socket.on("message.updated", (m) => novas.push(m));
  await new Promise((ok, erro) => {
    socket.on("connect", ok);
    socket.on("connect_error", erro);
    setTimeout(() => erro(new Error(`socket.io de ${nome} não conectou em 15 s`)), 15_000);
  });
  socket.emit("channel.join", { channelId: semente.canal.id });
  await esperar(400);
  return { nome, socket, novas };
}

const dono = await navegador("dono", semente.dono.accessToken);
const outro = await navegador("comum", comum.accessToken);

/** Junta tudo que dá para ler de uma mensagem do bot (conteúdo + embed). */
function textoDe(m) {
  const embeds = m.embeds ?? [];
  const doEmbed = embeds
    .map((e) =>
      [
        e.title,
        e.description,
        e.footer?.text,
        ...(e.fields ?? []).map((f) => `${f.name}: ${f.value}`),
      ]
        .filter(Boolean)
        .join(" · "),
    )
    .join(" · ");
  return `${m.content ?? ""} ${doEmbed}`.trim();
}

/** Dispara um comando de barra como o composer faz. */
async function digitar(token, nome, opcoes = []) {
  const r = await comoUsuario(token, `/channels/${semente.canal.id}/interactions`, {
    metodo: "POST",
    corpo: { commandId: idDe(nome), options: opcoes },
  });
  if (r.status >= 400) throw new Error(`POST interactions /${nome} → ${r.status} ${JSON.stringify(r.corpo)}`);
}

/** Manda uma mensagem no canal como o navegador faz. */
function falar(quem, texto) {
  quem.socket.emit("message.create", {
    channelId: semente.canal.id,
    content: texto,
    nonce: `botniv-${Math.random()}`,
  });
}

/** A primeira resposta do bot que casar. */
async function respostaDoBot(quem, criterio, ms, oQue) {
  const casa = typeof criterio === "function" ? criterio : (t) => criterio.test(t);
  return ate(() => quem.novas.find((m) => m.author?.id === app.botUserId && casa(textoDe(m))), ms, oQue);
}

/** `/nivel` de alguém, lido do embed: { nivel, xpNoNivel, custo, mensagens }. */
async function lerNivel(quem, alvo) {
  quem.novas.length = 0;
  await digitar(
    quem === dono ? semente.dono.accessToken : comum.accessToken,
    "nivel",
    alvo ? [{ name: "usuario", type: 3, value: alvo }] : [],
  );
  const m = await respostaDoBot(quem, /Nível de /, 30_000, "a resposta de /nivel");
  const texto = textoDe(m);
  const numeros = /\*\*Nível (\d+)\*\* — ([\d.]+) \/ ([\d.]+) XP/.exec(texto);
  const mensagens = /Mensagens: \*\*([\d.]+)\*\*/.exec(texto);
  const total = /XP total: \*\*([\d.]+)\*\*/.exec(texto);
  const posicao = /Posição: \*\*([^*]+)\*\*/.exec(texto);
  if (!numeros) throw new Error(`não consegui ler o /nivel: ${texto.slice(0, 200)}`);
  const limpar = (s) => Number(s.replaceAll(".", ""));
  return {
    texto,
    nivel: Number(numeros[1]),
    xpNoNivel: limpar(numeros[2]),
    custo: limpar(numeros[3]),
    mensagens: mensagens ? limpar(mensagens[1]) : null,
    xpTotal: total ? limpar(total[1]) : null,
    posicao: posicao ? posicao[1].trim() : null,
  };
}

// ── 3. a carência: N mensagens, um ganho só ──────────────────
const QUANTAS = 6;
for (let i = 0; i < QUANTAS; i++) {
  falar(dono, `mensagem de teste ${i + 1}`);
  await esperar(180);
}
await esperar(1500);

let doDono;
try {
  doDono = await lerNivel(dono);
  registrar(
    `3. ${QUANTAS} mensagens em ~1 s rendem UM ganho de XP (carência de ${CARENCIA_MS} ms)`,
    doDono.nivel === 0 && doDono.xpNoNivel >= 15 && doDono.xpNoNivel <= 25,
    `XP ${doDono.xpNoNivel} (a faixa de um ganho é 15–25)`,
  );
  registrar(
    "3b. …e o `/nivel` conta as mensagens todas mesmo assim",
    doDono.mensagens === QUANTAS,
    `${doDono.mensagens} mensagens contadas; barra: ${/(▰|▱)+/.exec(doDono.texto)?.[0] ?? "não achei"}`,
  );
  registrar(
    "3c. o que falta para o próximo nível fecha a conta",
    doDono.custo === 100 && /Faltam \*\*(\d+) XP\*\*/.test(doDono.texto) &&
      Number(/Faltam \*\*(\d+) XP\*\*/.exec(doDono.texto)[1]) === 100 - doDono.xpNoNivel,
    `${doDono.xpNoNivel}/${doDono.custo} XP, ${doDono.posicao}`,
  );
} catch (e) {
  registrar("3. a carência segura o flood", false, e.message);
}

// ── 4. passada a carência, ganha de novo ─────────────────────
await esperar(CARENCIA_MS + 500);
falar(dono, "mais uma, agora fora da carência");
await esperar(1500);
try {
  const depois = await lerNivel(dono);
  registrar(
    "4. passada a carência, a mensagem seguinte ganha de novo",
    depois.xpNoNivel >= doDono.xpNoNivel + 15,
    `${doDono.xpNoNivel} XP → ${depois.xpNoNivel} XP em ${depois.mensagens} mensagens`,
  );
} catch (e) {
  registrar("4. passada a carência, a mensagem seguinte ganha de novo", false, e.message);
}

// ── 5. cargo por nível: guarda a regra e declara o que falta ──
{
  dono.novas.length = 0;
  await digitar(semente.dono.accessToken, "cargo-por-nivel", [
    { name: "nivel", type: 4, value: 1 },
    { name: "cargo", type: 3, value: "Nivelado" },
  ]);
  try {
    const m = await respostaDoBot(dono, /nível 1/i, 30_000, "a confirmação do /cargo-por-nivel");
    const texto = textoDe(m);
    registrar("5. `/cargo-por-nivel 1 Nivelado` guarda a regra", /Nivelado/.test(texto), texto.slice(0, 90));
    registrar(
      "5b. PENDENTE — a entrega do cargo espera `PUT …/members/:uid/roles/:rid` (F5); o bot declara isso na hora",
      /rota de cargos/i.test(texto) && /roles/.test(texto),
      "é a dependência declarada do bot, no lugar de falhar calado depois",
    );
  } catch (e) {
    registrar("5. `/cargo-por-nivel` responde", false, e.message);
  }

  dono.novas.length = 0;
  await digitar(semente.dono.accessToken, "cargos-por-nivel");
  try {
    const m = await respostaDoBot(dono, /Cargos por nível/i, 30_000, "a lista de cargos por nível");
    registrar("5c. `/cargos-por-nivel` lista o que foi configurado", /Nível 1/.test(textoDe(m)), textoDe(m).slice(0, 100));
  } catch (e) {
    registrar("5c. `/cargos-por-nivel` lista o que foi configurado", false, e.message);
  }
}

// ── 6. subir de nível anuncia no canal ───────────────────────
//
// A ideia: deixar o segundo membro **a uma mensagem** do nível 1 (o limiar é
// 100 e o ganho é 15–25), para que a subida venha por mensagem — que é o
// caminho que dispara o anúncio no canal.
//
// O alvo é calculado, e não fixo. A primeira versão deste passo dava 90 XP
// achando que a pessoa estava em 0, e ela estava em 16: a **mensagem de
// sistema de entrada no servidor** pontua (a casca manda `type: 0` para
// `DEFAULT` e para `SYSTEM_*` — ver `motivoParaIgnorar` em
// `apps/bots/src/niveis/ganho.ts`). Resultado: o `/dar-xp` já subia o nível
// sozinho e a mensagem seguinte não tinha o que anunciar. Ler o XP antes torna
// o passo indiferente a isso.
const ALVO_ANTES_DE_SUBIR = 95;
{
  let atual = 0;
  try {
    atual = (await lerNivel(dono, comum.username)).xpTotal ?? 0;
  } catch {
    /* segue com 0: o `/dar-xp` abaixo ainda deixa o passo legível */
  }
  const delta = ALVO_ANTES_DE_SUBIR - atual;
  const comando = delta >= 0 ? "dar-xp" : "tirar-xp";
  dono.novas.length = 0;
  await digitar(semente.dono.accessToken, comando, [
    { name: "usuario", type: 3, value: comum.username },
    { name: "quantidade", type: 4, value: Math.abs(delta) || 1 },
  ]);
  try {
    const m = await respostaDoBot(dono, /ganhou|perdeu/i, 30_000, `a confirmação do /${comando}`);
    const texto = textoDe(m);
    registrar(
      `6. \`/${comando}\` de quem gerencia o servidor credita (${atual} XP → ${ALVO_ANTES_DE_SUBIR} XP)`,
      new RegExp(`${ALVO_ANTES_DE_SUBIR} XP`).test(texto),
      texto.split("\n")[0].slice(0, 120),
    );
  } catch (e) {
    registrar("6. `/dar-xp` de quem gerencia o servidor credita", false, e.message);
  }

  // A carência vale para todo mundo, inclusive para quem acabou de entrar: sem
  // esta espera a mensagem abaixo não ganharia XP e não haveria subida.
  await esperar(CARENCIA_MS + 500);
  dono.novas.length = 0;
  outro.novas.length = 0;
  falar(outro, "cheguei perto, vou subir");
  try {
    const m = await respostaDoBot(dono, /chegou ao \*\*nível 1\*\*/, 30_000, "o anúncio da subida");
    registrar(
      "6b. subir de nível **anuncia no canal onde a pessoa falou**",
      textoDe(m).includes(`@${comum.username}`),
      JSON.stringify(textoDe(m).slice(0, 160)),
    );
    registrar(
      "6c. PENDENTE — o anúncio diz por que o cargo não veio (a rota que falta), em vez de falhar calado",
      /rota de cargos/i.test(textoDe(m)),
      "sem isto, 'configurei o cargo e ele não vem' seria um defeito mudo",
    );
  } catch (e) {
    registrar("6b. subir de nível anuncia no canal", false, e.message);
  }
}

// ── 7. o ranking ordena ──────────────────────────────────────
{
  dono.novas.length = 0;
  await digitar(semente.dono.accessToken, "ranking");
  try {
    const m = await respostaDoBot(dono, /Ranking de/i, 30_000, "a resposta de /ranking");
    const texto = textoDe(m);
    const posComum = texto.indexOf(comum.username);
    const posDono = texto.indexOf(semente.dono.username);
    registrar(
      "7. `/ranking` lista os dois, com quem tem mais XP em primeiro",
      posComum !== -1 && posDono !== -1 && posComum < posDono,
      texto.replaceAll("\n", " | ").slice(0, 220),
    );
    registrar("7b. …com medalha no pódio e a contagem no rodapé", /🥇/.test(texto) && /Página 1 de/.test(texto));
  } catch (e) {
    registrar("7. `/ranking` ordena", false, e.message);
  }
}

// ── 8. `/dar-xp` sem permissão: recusa, e é efêmera ──────────
{
  dono.novas.length = 0;
  outro.novas.length = 0;
  await digitar(comum.accessToken, "dar-xp", [
    { name: "usuario", type: 3, value: comum.username },
    { name: "quantidade", type: 4, value: 999999 },
  ]);
  try {
    const m = await respostaDoBot(outro, /Gerenciar servidor/i, 30_000, "a recusa do /dar-xp");
    registrar("8. `/dar-xp` de quem não gerencia o servidor é recusado", true, JSON.stringify(textoDe(m)));
    registrar("8b. …e a recusa é **efêmera** (o DTO vem com `efemera: true`)", m.efemera === true, `efemera=${m.efemera}`);
    // A janela é generosa de propósito: o objetivo é o **silêncio** do outro
    // socket, e silêncio só se prova esperando.
    await esperar(3000);
    const vazou = dono.novas.find((x) => x.author?.id === app.botUserId && /Gerenciar servidor/i.test(textoDe(x)));
    registrar("8c. …e não vazou para o socket de quem não pediu", !vazou, vazou ? "vazou!" : "o outro cliente ficou mudo");
  } catch (e) {
    registrar("8. `/dar-xp` sem permissão é recusado", false, e.message);
  }

  // E o XP não mudou: a recusa recusou de verdade.
  try {
    const depois = await lerNivel(dono, comum.username);
    registrar(
      "8d. …e o XP do alvo continua onde estava (a recusa recusou mesmo)",
      depois.nivel === 1 && depois.xpNoNivel < 1000,
      `nível ${depois.nivel}, ${depois.xpNoNivel}/${depois.custo} XP`,
    );
  } catch (e) {
    registrar("8d. o XP não mudou depois da recusa", false, e.message);
  }
}

dono.socket.close();
outro.socket.close();
console.log(falhas === 0 ? "\ntodas as provas passaram." : `\n${falhas} prova(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
