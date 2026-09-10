// Semeia os **outros dois membros** que a prova do Streamz Moderação precisa,
// no servidor que o `semear.mjs` acabou de criar.
//
// Roda dentro do contêiner da API (precisa do Prisma):
//
//   docker exec -e API_URL=… -e GUILD_ID=… streamz-bots-botmod-api \
//     node apps/api/test/discord-compat/semear-botmod.mjs
//
// Por que dois, e não um: uma prova de moderação sem gente comum não prova
// nada. O `semear.mjs` cria só o **dono**, que no Streamz tem todas as
// permissões por definição — com ele sozinho não dá para exercitar nem a
// recusa por falta de permissão (a que tem de ser efêmera) nem a hierarquia.
//
//   alvo    membro comum, é em quem o `/aviso` cai
//   xereta  membro comum, é quem tenta moderar **sem** permissão
//
// Imprime uma linha de JSON com id, snowflake, username e accessToken dos dois.

import { PrismaClient } from "@prisma/client";

const API = process.env.API_URL ?? "http://localhost:3333/api";
const GUILD_ID = process.env.GUILD_ID;
const SENHA = "senha-de-teste-123";
if (!GUILD_ID) throw new Error("falta GUILD_ID");

const prisma = new PrismaClient();

async function criar(papel) {
  const usuario = `${papel}${Math.random().toString(36).slice(2, 8)}`;
  const resposta = await fetch(`${API}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: `${usuario}@exemplo.invalido`,
      username: usuario,
      password: SENHA,
    }),
  });
  const texto = await resposta.text();
  if (!resposta.ok) throw new Error(`registro de ${papel} → ${resposta.status}: ${texto.slice(0, 300)}`);
  const registro = JSON.parse(texto);

  // Entrar no servidor direto pelo banco, como o `semear.mjs` faz com o
  // usuário-bot: a tela de convite tem fluxo próprio e não é o que esta prova
  // exercita. `role: MEMBER` é o ponto — gente comum, sem permissão de moderar.
  await prisma.guildMember.create({
    data: { userId: registro.user.id, guildId: GUILD_ID, role: "MEMBER" },
  });

  const linha = await prisma.user.findUnique({
    where: { id: registro.user.id },
    select: { snowflake: true },
  });

  return {
    id: registro.user.id,
    username: usuario,
    snowflake: linha.snowflake.toString(),
    accessToken: registro.tokens.accessToken,
  };
}

try {
  const alvo = await criar("alvo");
  const xereta = await criar("xereta");
  process.stdout.write(`${JSON.stringify({ alvo, xereta })}\n`);
} finally {
  await prisma.$disconnect();
}
