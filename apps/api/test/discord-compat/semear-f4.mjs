// Semeia o que a prova da F4 (lote B) precisa.
//
// A diferença para o `semear.mjs` da F1 é o que ele **não** faz: aqui o bot
// **não** vira membro do servidor. Na F1, "o bot está no servidor" queria dizer
// um `create` direto de `GuildMember`, com um comentário dizendo "a tela de
// Adicionar ao servidor e a tabela `GuildApplication` são a F4". Pois é a F4:
// quem põe o bot no servidor agora é `POST /guilds/:id/aplicativos`, e é isso
// que a prova observa acontecer.
//
// Roda dentro do contêiner da API (repo montado, Prisma gerado):
//
//   docker exec -e API_URL=http://localhost:3344/api f4b-api \
//     node apps/api/test/discord-compat/semear-f4.mjs
//
// Imprime **uma linha de JSON** no stdout. O token do bot só existe aqui: o
// banco guarda o sha256.
//
// **Na integração da F4 a semente passou a publicar pela rota.** Enquanto o
// lote B rodava sozinho, `publico: true`, `description` e `permissoesPadrao`
// eram escritos direto no banco, porque o `PATCH /applications/:id` que os
// faria era do lote A e não existia naquela árvore. Agora existe — e a prova
// (a) da fase é justamente "o dono cria o app **pela UI** e o publica", então
// escrever isso por baixo da rota seria provar menos do que o documento pede.
//
// Sobra **uma** escrita direta, e ela é de conveniência, não de recurso: o
// segundo membro do servidor. A rota que o poria lá é um convite, e o que
// interessa dele para a prova é só **não ter `MANAGE_GUILD`** — aceitar um
// convite não é o que a F4 entrega.

import { PrismaClient } from "@prisma/client";

const API = process.env.API_URL ?? "http://localhost:3344/api";
const SENHA = "senha-de-teste-123";

async function chamar(rota, { metodo = "GET", corpo, token } = {}) {
  const r = await fetch(`${API}${rota}`, {
    method: metodo,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`${metodo} ${rota} → ${r.status}: ${texto.slice(0, 400)}`);
  return texto ? JSON.parse(texto) : null;
}

const sufixo = Math.random().toString(36).slice(2, 8);
const dono = `dono-${sufixo}`;
const membro = `membro-${sufixo}`;

// 1. O dono e o servidor.
const registro = await chamar("/auth/register", {
  metodo: "POST",
  corpo: { email: `${dono}@exemplo.invalido`, username: dono, password: SENHA },
});
const acesso = registro.tokens.accessToken;

const servidor = await chamar("/guilds", {
  metodo: "POST",
  corpo: { name: `Servidor da F4 ${sufixo}` },
  token: acesso,
});
const canal = (servidor.channels ?? []).find((c) => c.type === "TEXT");
if (!canal) throw new Error("o servidor nasceu sem canal de texto");

// 2. Um segundo membro, **sem** `MANAGE_GUILD`: é a prova 3 da fase (o 403).
const registro2 = await chamar("/auth/register", {
  metodo: "POST",
  corpo: { email: `${membro}@exemplo.invalido`, username: membro, password: SENHA },
});

// 3. O aplicativo que a prova instala, mais alguns para a grade do diretório
// não ser um card sozinho nas capturas.
const CATALOGO = [
  { name: `Hydra ${sufixo}`, description: "Toca música em canais de voz, com fila e busca no YouTube." },
  { name: `MEE6 ${sufixo}`, description: "Níveis, boas-vindas e moderação automática." },
  { name: `Carl-bot ${sufixo}`, description: "Cargos por reação, marcadores e registro de auditoria." },
  { name: `Dyno ${sufixo}`, description: "Moderação, anúncios e comandos personalizados." },
  { name: `Ticket Tool ${sufixo}`, description: "Abre canais de atendimento a partir de um botão." },
  { name: `Statbot ${sufixo}`, description: "Gráficos de atividade do servidor, por canal e por hora." },
];

const prisma = new PrismaClient();
try {
  const criados = [];
  for (const item of CATALOGO) {
    const app = await chamar("/applications", {
      metodo: "POST",
      corpo: { name: item.name },
      token: acesso,
    });
    // publicar e sugerir permissões, pelo `PATCH` do lote A — é o que o
    // interruptor "Publicar no diretório" do portal faz
    await chamar(`/applications/${app.app.id}`, {
      metodo: "PATCH",
      corpo: {
        publico: true,
        description: item.description,
        // VIEW_CHANNEL | SEND_MESSAGES | ADD_REACTIONS = 1 | 2 | 1024
        permissoesPadrao: 1 | 2 | 1024,
      },
      token: acesso,
    });
    criados.push({ id: app.app.id, name: item.name, token: app.token.token, botUserId: app.app.botUser.id });
  }

  // o segundo usuário entra no servidor como MEMBER comum (seria um convite)
  await prisma.guildMember.create({
    data: { userId: registro2.user.id, guildId: servidor.id, role: "MEMBER" },
  });

  const oDaProva = criados[0];
  const [linhaDoServidor, linhaDoCanal, linhaDoBot] = await Promise.all([
    prisma.guild.findUnique({ where: { id: servidor.id }, select: { snowflake: true } }),
    prisma.channel.findUnique({ where: { id: canal.id }, select: { snowflake: true } }),
    prisma.user.findUnique({
      where: { id: oDaProva.botUserId },
      select: { snowflake: true, username: true },
    }),
  ]);

  console.log(
    JSON.stringify({
      api: API,
      dono: { username: dono, senha: SENHA, accessToken: acesso, id: registro.user.id },
      membroSemPoder: {
        username: membro,
        senha: SENHA,
        accessToken: registro2.tokens.accessToken,
        id: registro2.user.id,
      },
      servidor: { id: servidor.id, snowflake: linhaDoServidor.snowflake.toString(), name: servidor.name },
      canal: { id: canal.id, snowflake: linhaDoCanal.snowflake.toString(), name: canal.name },
      bot: {
        token: oDaProva.token,
        userId: oDaProva.botUserId,
        username: linhaDoBot.username,
        snowflake: linhaDoBot.snowflake.toString(),
        applicationId: oDaProva.id,
      },
      diretorio: criados.map((c) => ({ id: c.id, name: c.name })),
    }),
  );
} finally {
  await prisma.$disconnect();
}
