// Semeadura da prova das rotas de membro (F5): um dono, um servidor, **dois**
// bots (um com poder, outro sem nenhum), **dois** alvos e três cargos em alturas
// diferentes.
//
//   docker exec -e API_URL=http://localhost:3333/api streamz-bots-memb-api \
//     node apps/api/test/discord-compat/semear-membros.mjs
//
// Imprime **uma linha de JSON** no stdout. O token de cada bot só existe aqui: o
// banco guarda o sha256 (§5 do documento).
//
// Por que dois alvos: `kick` e `ban` tiram o membro do servidor, e a regra do
// Streamz age sobre um `GuildMember` — banir depois de expulsar o mesmo alvo
// daria 10007. Um alvo para cargo/castigo/expulsão, outro para banimento.
//
// Por que três cargos: a hierarquia é o ponto da prova (g). Eles nascem **nesta
// ordem** e o `RolesService.create` põe cada um logo acima do anterior, então:
//
//   "Visitante"  → **abaixo** do bot: ele pode dar e tirar
//   "Robô-mor"   → o cargo do bot (é ele que define o teto)
//   "Chefia"     → **acima** do bot: dar leva 50013
//
// (Os números de posição não são 1/2/3 — o servidor já nasce com o @everyone e
// o "Administrador" —, e é por isso que a prova compara ids, nunca posições.)
//
// E por que o usuário-bot também é `MemberRole.ADMIN`: o
// `ModerationService.assertPodeAgirSobre` compara o papel OWNER/ADMIN/MEMBER
// **além** da hierarquia de cargos, e um bot com papel MEMBER não consegue
// castigar nem banir outro MEMBER por mais permissão de cargo que tenha. É a
// divergência 2 do §5 acontecendo na prática.

import { PrismaClient } from "@prisma/client";

const API = process.env.API_URL ?? "http://localhost:3333/api";
const SENHA = "senha-de-teste-123";

// VIEW_CHANNEL|SEND_MESSAGES|MANAGE_MESSAGES|MANAGE_ROLES|KICK|BAN|MODERATE
const PODERES_DO_BOT = 1 | 2 | 4 | 16 | 32 | 64 | 32768;

async function chamar(rota, { metodo = "GET", corpo, token } = {}) {
  const resposta = await fetch(`${API}${rota}`, {
    method: metodo,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  });
  const texto = await resposta.text();
  if (!resposta.ok) throw new Error(`${metodo} ${rota} → ${resposta.status}: ${texto.slice(0, 400)}`);
  return texto ? JSON.parse(texto) : null;
}

const sufixo = Math.random().toString(36).slice(2, 8);

async function registrar(nome) {
  const r = await chamar("/auth/register", {
    metodo: "POST",
    corpo: { email: `${nome}@exemplo.invalido`, username: nome, password: SENHA },
  });
  if (!r.tokens?.accessToken) throw new Error(`registro sem accessToken: ${nome}`);
  return { id: r.user.id, username: nome, accessToken: r.tokens.accessToken };
}

const dono = await registrar(`dono-${sufixo}`);
const alvo = await registrar(`alvo-${sufixo}`);
const alvoBan = await registrar(`banido-${sufixo}`);

const servidor = await chamar("/guilds", {
  metodo: "POST",
  corpo: { name: `Servidor de membros ${sufixo}` },
  token: dono.accessToken,
});
const canal = (servidor.channels ?? []).find((c) => c.type === "TEXT");
if (!canal) throw new Error("o servidor nasceu sem canal de texto");

// os três cargos, **nesta ordem** — a posição de cada um é o que a prova (g) usa
const visitante = await chamar(`/guilds/${servidor.id}/roles`, {
  metodo: "POST",
  corpo: { name: "Visitante", color: "#43b581" },
  token: dono.accessToken,
});
const roboMor = await chamar(`/guilds/${servidor.id}/roles`, {
  metodo: "POST",
  corpo: { name: "Robô-mor", permissions: PODERES_DO_BOT },
  token: dono.accessToken,
});
const chefia = await chamar(`/guilds/${servidor.id}/roles`, {
  metodo: "POST",
  corpo: { name: "Chefia", permissions: PODERES_DO_BOT },
  token: dono.accessToken,
});

const comPoder = await chamar("/applications", {
  metodo: "POST",
  corpo: { name: `Bot com poder ${sufixo}` },
  token: dono.accessToken,
});
const semPoder = await chamar("/applications", {
  metodo: "POST",
  corpo: { name: `Bot sem poder ${sufixo}` },
  token: dono.accessToken,
});

const prisma = new PrismaClient();
try {
  // os dois bots e os dois alvos viram membros (o que a F4 faz pela UI)
  await prisma.guildMember.createMany({
    data: [
      { userId: comPoder.app.botUser.id, guildId: servidor.id, role: "ADMIN" },
      { userId: semPoder.app.botUser.id, guildId: servidor.id, role: "MEMBER" },
      { userId: alvo.id, guildId: servidor.id, role: "MEMBER" },
      { userId: alvoBan.id, guildId: servidor.id, role: "MEMBER" },
    ],
  });
  // o cargo do bot com poder — sem ele o teto dele seria 0 e nada passaria
  await prisma.guildMemberRole.create({
    data: { guildId: servidor.id, userId: comPoder.app.botUser.id, roleId: roboMor.id },
  });

  const snowflake = async (tabela, id) =>
    String((await prisma[tabela].findUnique({ where: { id }, select: { snowflake: true } })).snowflake);

  const saida = {
    api: API,
    dono: { ...dono, snowflake: await snowflake("user", dono.id) },
    alvo: { ...alvo, snowflake: await snowflake("user", alvo.id) },
    alvoBan: { ...alvoBan, snowflake: await snowflake("user", alvoBan.id) },
    servidor: { id: servidor.id, snowflake: await snowflake("guild", servidor.id) },
    canal: { id: canal.id, snowflake: await snowflake("channel", canal.id) },
    cargos: {
      visitante: { id: visitante.id, snowflake: await snowflake("role", visitante.id), position: visitante.position },
      roboMor: { id: roboMor.id, snowflake: await snowflake("role", roboMor.id), position: roboMor.position },
      chefia: { id: chefia.id, snowflake: await snowflake("role", chefia.id), position: chefia.position },
    },
    bot: {
      token: comPoder.token.token,
      userId: comPoder.app.botUser.id,
      snowflake: await snowflake("user", comPoder.app.botUser.id),
    },
    botSemPoder: {
      token: semPoder.token.token,
      userId: semPoder.app.botUser.id,
      snowflake: await snowflake("user", semPoder.app.botUser.id),
    },
  };
  process.stdout.write(`${JSON.stringify(saida)}\n`);
} finally {
  await prisma.$disconnect();
}
