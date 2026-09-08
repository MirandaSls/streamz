// Semeia o Streamz descartável com o que as provas da F1 precisam: um dono,
// um servidor com um canal de texto, um aplicativo (com token de bot) e o
// usuário-bot já como membro do servidor.
//
// Roda dentro do contêiner da API (que tem o repo montado e o Prisma gerado):
//
//   docker exec -e API_URL=http://localhost:3333/api streamz-bots-f1-api \
//     node apps/api/test/discord-compat/semear.mjs
//
// Imprime **uma linha de JSON** no stdout com tudo que os scripts seguintes
// precisam — token, ids internos e snowflakes. O token só existe aqui: o banco
// guarda o sha256 (§5 do documento).
//
// Por que a instalação do bot no servidor é um `create` direto de
// `GuildMember`: a tela de "Adicionar ao servidor" e a tabela
// `GuildApplication` são a F4. Na F1, "o bot está no servidor" quer dizer
// exatamente isto — existe uma linha de membro para o usuário-bot.

import { PrismaClient } from "@prisma/client";

const API = process.env.API_URL ?? "http://localhost:3333/api";
const SENHA = "senha-de-teste-123";

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
  if (!resposta.ok) {
    throw new Error(`${metodo} ${rota} → ${resposta.status}: ${texto.slice(0, 400)}`);
  }
  return texto ? JSON.parse(texto) : null;
}

const sufixo = Math.random().toString(36).slice(2, 8);
const dono = `dono-${sufixo}`;

// 1. O dono. O registro já devolve `{ user, tokens }` — não é preciso um login
// à parte. O e-mail é obrigatório no contrato (`contaRegistroSchema`) e não
// precisa ser verificado para nada do que a F1 faz.
const registro = await chamar("/auth/register", {
  metodo: "POST",
  corpo: { email: `${dono}@exemplo.invalido`, username: dono, password: SENHA },
});
const acesso = registro.tokens?.accessToken;
if (!acesso) throw new Error(`registro sem accessToken: ${JSON.stringify(registro).slice(0, 300)}`);

// 2. O servidor. Ele nasce com o @everyone, as categorias padrão e um canal.
const servidor = await chamar("/guilds", {
  metodo: "POST",
  corpo: { name: `Servidor de teste ${sufixo}` },
  token: acesso,
});

const canais = servidor.channels ?? [];
const canalDeTexto = canais.find((c) => c.type === "TEXT");
if (!canalDeTexto) {
  throw new Error(`o servidor nasceu sem canal de texto: ${JSON.stringify(canais).slice(0, 300)}`);
}

// 3. O aplicativo. O token em claro sai **só** nesta resposta.
const app = await chamar("/applications", {
  metodo: "POST",
  corpo: { name: `Bot de teste ${sufixo}` },
  token: acesso,
});
const tokenDoBot = app.token.token;
const botUserId = app.app.botUser.id;

// 4. O bot vira membro do servidor (o que a F4 fará pela UI).
const prisma = new PrismaClient();
try {
  await prisma.guildMember.create({
    data: { userId: botUserId, guildId: servidor.id, role: "MEMBER" },
  });

  // 5. Os snowflakes, para os scripts não precisarem consultar o banco.
  const [linhaDoServidor, linhaDoCanal, linhaDoBot, linhaDoDono, cargos] = await Promise.all([
    prisma.guild.findUnique({ where: { id: servidor.id }, select: { snowflake: true } }),
    prisma.channel.findUnique({ where: { id: canalDeTexto.id }, select: { snowflake: true } }),
    prisma.user.findUnique({ where: { id: botUserId }, select: { snowflake: true, username: true } }),
    prisma.user.findUnique({ where: { id: registro.user.id }, select: { id: true, snowflake: true } }),
    prisma.role.findMany({ where: { guildId: servidor.id }, select: { id: true, name: true, snowflake: true, isDefault: true } }),
  ]);

  const saida = {
    api: API,
    dono: {
      username: dono,
      senha: SENHA,
      accessToken: acesso,
      id: linhaDoDono.id,
      snowflake: linhaDoDono.snowflake.toString(),
    },
    servidor: {
      id: servidor.id,
      snowflake: linhaDoServidor.snowflake.toString(),
      name: servidor.name,
    },
    canal: {
      id: canalDeTexto.id,
      snowflake: linhaDoCanal.snowflake.toString(),
      name: canalDeTexto.name,
    },
    bot: {
      token: tokenDoBot,
      userId: botUserId,
      username: linhaDoBot.username,
      snowflake: linhaDoBot.snowflake.toString(),
      applicationId: app.app.id,
      applicationSnowflake: app.app.snowflake,
    },
    cargos: cargos.map((c) => ({
      id: c.id,
      name: c.name,
      snowflake: c.snowflake.toString(),
      isDefault: c.isDefault,
    })),
  };
  process.stdout.write(`${JSON.stringify(saida)}\n`);
} finally {
  await prisma.$disconnect();
}
