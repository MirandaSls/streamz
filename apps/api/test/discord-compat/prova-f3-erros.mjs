// Prova 4 da F3 (§12 do documento): os quatro erros.
//
//   4a. callback duplicado          → 400 `40060`
//   4b. interação expirada (15 min) → 404 `10062`
//   4c. token inexistente           → 404 `10062`
//   4d. bot responde em canal que não vê → 403 `50013`
//
// Roda **dentro do contêiner da API**, e não num contêiner de bot, por dois
// motivos que valem a diferença:
//
//   1. o token de uma interação nunca sai para o web (é o credencial de quem
//      escreve como o bot) — quem o lê é o Prisma, aqui;
//   2. envelhecer uma interação em 15 minutos é um `UPDATE` de uma coluna.
//      A alternativa seria o teste esperar quinze minutos.
//
// Nada aqui usa discord.js: são requisições HTTP cruas, que é exatamente o que
// as libs mandam.
//
//   docker exec -e SEMENTE=… -e API_URL=http://localhost:3333/api \
//     streamz-bots-f3-api node apps/api/test/discord-compat/prova-f3-erros.mjs

import { PrismaClient } from "@prisma/client";

const semente = JSON.parse(process.env.SEMENTE);
const API = process.env.API_URL ?? "http://localhost:3333/api";
const prisma = new PrismaClient();

const passos = [];
const registrar = (nome, ok, detalhe) => {
  passos.push({ nome, ok, detalhe });
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
};

async function comoDono(rota, { metodo = "GET", corpo } = {}) {
  const r = await fetch(`${API}${rota}`, {
    method: metodo,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${semente.dono.accessToken}`,
    },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  });
  const texto = await r.text();
  return { status: r.status, corpo: texto ? JSON.parse(texto) : null };
}

/** O callback, como as libs o mandam: **sem `Authorization` nenhum**. */
async function callback(snowflake, token, corpo) {
  const r = await fetch(`${API}/v10/interactions/${snowflake}/${token}/callback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const texto = await r.text();
  return { status: r.status, corpo: texto ? JSON.parse(texto) : null };
}

try {
  // o `/play` que o `deploy-commands.mjs` registrou
  const comando = await prisma.applicationCommand.findFirst({
    where: { name: "play" },
    select: { id: true },
  });
  if (!comando) throw new Error("o comando /play não está no banco — a prova 1 rodou?");

  /** Dispara uma interação pelo REST interno e devolve a linha, com o token. */
  async function disparar(canalId) {
    const r = await comoDono(`/channels/${canalId}/interactions`, {
      metodo: "POST",
      corpo: {
        commandId: comando.id,
        options: [{ name: "url", type: 3, value: "never gonna give you up" }],
      },
    });
    if (r.status !== 200 && r.status !== 201) return { recusado: r };
    const linha = await prisma.interaction.findUnique({
      where: { id: r.corpo.id },
      select: { snowflake: true, token: true, id: true },
    });
    return { linha, resposta: r };
  }

  // ── 4a. callback duplicado → 400 40060 ─────────────────────
  {
    const { linha } = await disparar(semente.canal.id);
    const um = await callback(linha.snowflake.toString(), linha.token, {
      type: 4,
      data: { content: "primeira" },
    });
    const dois = await callback(linha.snowflake.toString(), linha.token, {
      type: 4,
      data: { content: "segunda" },
    });
    registrar(
      "4a. callback duplicado → 400 com code 40060",
      um.status === 204 && dois.status === 400 && dois.corpo?.code === 40060,
      `primeiro=${um.status} segundo=${dois.status} ${JSON.stringify(dois.corpo)}`,
    );
  }

  // ── 4b. interação expirada → 404 10062 ─────────────────────
  {
    const { linha } = await disparar(semente.canal.id);
    // 15 min e 1 s atrás: é o `expiresAt` que a leitura confere, não o sumiço
    // da linha (a faxina é outro assunto).
    await prisma.interaction.update({
      where: { id: linha.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const r = await callback(linha.snowflake.toString(), linha.token, {
      type: 4,
      data: { content: "tarde demais" },
    });
    registrar(
      "4b. interação expirada (15 min) → 404 com code 10062",
      r.status === 404 && r.corpo?.code === 10062,
      `${r.status} ${JSON.stringify(r.corpo)}`,
    );
  }

  // ── 4c. token inexistente → 404 10062 ──────────────────────
  {
    const r = await callback("1", "z".repeat(86), { type: 4, data: { content: "quem é você" } });
    registrar(
      "4c. token de interação inexistente → 404 com code 10062",
      r.status === 404 && r.corpo?.code === 10062,
      `${r.status} ${JSON.stringify(r.corpo)}`,
    );
  }

  // ── 4d. o bot responde em canal que não vê → 403 50013 ─────
  {
    const criado = await comoDono(`/guilds/${semente.servidor.id}/channels`, {
      metodo: "POST",
      corpo: {
        name: `so-do-dono-${Date.now().toString(36)}`,
        type: "TEXT",
        isPrivate: true,
        memberIds: [],
      },
    });
    if (criado.status !== 200 && criado.status !== 201) {
      registrar(
        "4d. bot responde em canal que não vê → 403",
        false,
        `não consegui criar o canal privado: ${criado.status} ${JSON.stringify(criado.corpo)}`,
      );
    } else {
      const alvo = await disparar(criado.corpo.id);
      if (alvo.recusado) {
        // recusar já na criação também é uma resposta honesta — o composer não
        // deveria oferecer um comando num canal que o bot não vê. O script diz
        // qual dos dois caminhos a implementação escolheu.
        registrar(
          "4d. canal que o bot não vê: recusado já na criação da interação",
          alvo.recusado.status === 403 || alvo.recusado.status === 404,
          `POST /channels/:id/interactions → ${alvo.recusado.status} ${JSON.stringify(alvo.recusado.corpo)}`,
        );
      } else {
        const r = await callback(alvo.linha.snowflake.toString(), alvo.linha.token, {
          type: 4,
          data: { content: "oi" },
        });
        registrar(
          "4d. bot responde em canal que não vê → 403 com code 50013",
          r.status === 403 && r.corpo?.code === 50013,
          `${r.status} ${JSON.stringify(r.corpo)}`,
        );
      }
    }
  }
} finally {
  await prisma.$disconnect();
}

const falhou = passos.some((p) => !p.ok);
console.log(falhou ? "\n=== ALGUM ERRO DA PROVA 4 NÃO BATEU ===" : "\n=== PROVA 4 (erros): OK ===");
process.exit(falhou ? 1 : 0);
