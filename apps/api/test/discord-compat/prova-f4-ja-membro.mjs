// O defeito que o lote C achou: instalar um aplicativo cujo usuário-bot **já é
// membro** do servidor por outro caminho dava 500.
//
// Aqui o bot entra primeiro como membro comum (é o que um convite, ou o
// `semear.mjs` da F1, fazem) e só depois o app é instalado pela rota.
import { PrismaClient } from "@prisma/client";

const API = process.env.API_URL;
const s = JSON.parse(process.env.SEMENTE);
const prisma = new PrismaClient();

async function chamar(rota, { metodo = "GET", corpo, token } = {}) {
  const r = await fetch(`${API}${rota}`, {
    method: metodo,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  });
  const t = await r.text();
  return { status: r.status, corpo: t ? JSON.parse(t) : null };
}

let falhas = 0;
const registrar = (nome, ok, detalhe) => {
  if (!ok) falhas++;
  console.log(`${ok ? "OK   " : "FALHA"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
};

try {
  const app = s.diretorio[2];
  const linha = await prisma.application.findUnique({
    where: { id: app.id },
    select: { botUserId: true },
  });

  // o bot entra como membro comum, ANTES de o app ser instalado
  await prisma.guildMember.create({
    data: { userId: linha.botUserId, guildId: s.servidor.id, role: "MEMBER" },
  });
  const antes = await prisma.guildMember.findUnique({
    where: { userId_guildId: { userId: linha.botUserId, guildId: s.servidor.id } },
    select: { role: true, joinedAt: true },
  });
  registrar("A. o usuário-bot já é membro do servidor (entrou por outro caminho)", !!antes, `role=${antes.role}`);

  // 1 | 2 = VIEW_CHANNEL | SEND_MESSAGES
  const r = await chamar(`/guilds/${s.servidor.id}/aplicativos`, {
    metodo: "POST",
    corpo: { applicationId: app.id, permissions: 3 },
    token: s.dono.accessToken,
  });
  registrar(
    "B. instalar NÃO devolve 500 (era o `create` batendo no @@unique)",
    r.status === 201 || r.status === 200,
    `${r.status} ${r.status >= 500 ? JSON.stringify(r.corpo) : `cargo=${r.corpo?.roleId}`}`,
  );

  const depois = await prisma.guildMember.findUnique({
    where: { userId_guildId: { userId: linha.botUserId, guildId: s.servidor.id } },
    select: { role: true, joinedAt: true },
  });
  registrar(
    "C. a instalação não mexeu no membro que já existia (`update: {}`)",
    depois.role === antes.role && depois.joinedAt.getTime() === antes.joinedAt.getTime(),
    `role ${antes.role}→${depois.role}, joinedAt igual=${depois.joinedAt.getTime() === antes.joinedAt.getTime()}`,
  );

  const cargos = await chamar(`/guilds/${s.servidor.id}/roles`, { token: s.dono.accessToken });
  registrar(
    "D. e o cargo gerenciado nasceu, com as permissões escolhidas",
    cargos.corpo?.some((c) => c.id === r.corpo?.roleId && c.permissions === 3),
    `permissions=${cargos.corpo?.find((c) => c.id === r.corpo?.roleId)?.permissions}`,
  );
} finally {
  await prisma.$disconnect();
}

console.log();
console.log(falhas === 0 ? "TODAS AS PROVAS PASSARAM" : `${falhas} PROVA(S) FALHARAM`);
process.exit(falhas === 0 ? 0 : 1);
