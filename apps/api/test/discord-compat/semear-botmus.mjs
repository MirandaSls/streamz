// Semeia a conta **dona dos bots oficiais** na bancada descartável.
//
// Roda dentro do contêiner da API (precisa do Prisma):
//
//   docker exec -e API_URL=… -e EMAIL_DO_DONO=… streamz-bots-botmus-api \
//     node apps/api/test/discord-compat/semear-botmus.mjs
//
// Por que uma conta à parte da que o `semear.mjs` cria: o provisionamento dos
// bots oficiais marca cada aplicativo como **oficial**, e isso é rota do painel
// do administrador (`PlatformAdminGuard`). Ser administrador da instância exige
// estar em `PLATFORM_ADMIN_EMAILS` **com o e-mail verificado** — e o e-mail
// aleatório do dono comum não estaria na variável, que é lida no boot da API.
//
// Imprime uma linha de JSON com o `accessToken` da conta.

import { PrismaClient } from "@prisma/client";

const API = process.env.API_URL ?? "http://localhost:3333/api";
const EMAIL = process.env.EMAIL_DO_DONO;
const SENHA = process.env.SENHA_DO_DONO ?? "senha-de-teste-123";
if (!EMAIL) throw new Error("falta EMAIL_DO_DONO");

const usuario = `donobots${Math.random().toString(36).slice(2, 8)}`;

const resposta = await fetch(`${API}/auth/register`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: EMAIL, username: usuario, password: SENHA }),
});
const texto = await resposta.text();
if (!resposta.ok) throw new Error(`registro → ${resposta.status}: ${texto.slice(0, 300)}`);
const registro = JSON.parse(texto);

// O painel do administrador só abre com o e-mail **verificado** (ver
// `PlatformAdminService`: sem isso bastaria registrar uma conta com o endereço
// do admin para herdar o painel). Na bancada não há caixa de e-mail, então
// carimbamos a data direto — é o equivalente a clicar no link.
const prisma = new PrismaClient();
try {
  await prisma.user.update({
    where: { id: registro.user.id },
    data: { emailVerifiedAt: new Date() },
  });
} finally {
  await prisma.$disconnect();
}

process.stdout.write(
  `${JSON.stringify({
    id: registro.user.id,
    username: usuario,
    email: EMAIL,
    accessToken: registro.tokens.accessToken,
  })}\n`,
);
