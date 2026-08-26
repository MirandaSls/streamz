// Passeio ponta a ponta pelas rotas de conta e segurança, em processo e sem
// watcher: sobe o Nest numa porta efêmera, exercita os fluxos e fecha.
import "reflect-metadata";
const { NestFactory } = await import("@nestjs/core");
const { ValidationPipe } = await import("@nestjs/common");
const { AppModule } = await import("./dist/app.module.js");
const { MailService } = await import("./dist/modules/mail/mail.service.js");
const { gerarCodigoTotp } = await import("./dist/modules/auth/totp.js");
const { PrismaService } = await import("./dist/prisma/prisma.service.js");

// o teto por IP é real e correto em produção; aqui ele só impediria o passeio
// de exercitar dez logins seguidos, então o guard global sai de cena
const { ThrottlerGuard } = await import("@nestjs/throttler");
ThrottlerGuard.prototype.canActivate = async () => true;

const app = await NestFactory.create(AppModule, { logger: ["error"] });
app.setGlobalPrefix("api");
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
await app.listen(0);
const base = `${await app.getUrl()}/api`.replace("[::1]", "127.0.0.1");

// captura os e-mails em vez de deixá-los só no log
const emails = [];
const mail = app.get(MailService);
const enviarOriginal = mail.enviar.bind(mail);
mail.enviar = async (email) => {
  emails.push(email);
  return enviarOriginal(email);
};
const ultimoLink = () => /https?:\/\/\S+/.exec(emails.at(-1).text)[0];

const prisma = app.get(PrismaService);
let falhas = 0;
const ok = (nome, condicao, extra = "") => {
  if (!condicao) falhas += 1;
  console.log(`${condicao ? "ok  " : "FALHA"} ${nome}${extra ? ` — ${extra}` : ""}`);
};

async function chamar(metodo, caminho, { body, token } = {}) {
  const res = await fetch(`${base}${caminho}`, {
    method: metodo,
    headers: {
      "content-type": "application/json",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0 Safari/537.36",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const texto = await res.text();
  return { status: res.status, corpo: texto ? JSON.parse(texto) : null };
}

const sufixo = Date.now().toString(36);
const usuario = `smoke_${sufixo}`;
const email = `smoke_${sufixo}@exemplo.com`;
const SENHA = "Cavalo-Bateria-42";
const SENHA2 = "Girafa-Turbina-77";

// 1. registro exige e-mail e dispara a verificação
let r = await chamar("POST", "/auth/register", {
  body: { email, username: usuario, password: SENHA, birthDate: "1995-04-10" },
});
ok("registro cria a conta", r.status === 201, `status ${r.status}`);
let tokens = r.corpo.tokens;
ok("registro manda o e-mail de verificação", /Confirme/.test(emails.at(-1)?.subject ?? ""));

r = await chamar("POST", "/auth/register", {
  body: { email, username: `outro_${sufixo}`, password: SENHA },
});
ok("e-mail duplicado responde 409", r.status === 409, r.corpo?.message);

r = await chamar("POST", "/auth/register", {
  body: { email: `x_${sufixo}@exemplo.com`, username: `x_${sufixo}`, password: "senha123" },
});
ok("senha fraca é recusada no contrato", r.status === 400, r.corpo?.message);

// 2. verificação de e-mail
const linkVerificacao = ultimoLink();
r = await chamar("POST", "/auth/verify-email", {
  body: { token: new URL(linkVerificacao).searchParams.get("token") },
});
ok("link confirma o e-mail", r.status === 201 && r.corpo.alreadyVerified === false);
r = await chamar("POST", "/auth/verify-email", {
  body: { token: new URL(linkVerificacao).searchParams.get("token") },
});
ok("token de verificação é de uso único", r.status === 400);

// 3. conta
r = await chamar("GET", "/me/account", { token: tokens.accessToken });
ok("GET /me/account traz o e-mail verificado", r.corpo?.emailVerified === true);
ok("nascimento volta como YYYY-MM-DD", r.corpo?.birthDate === "1995-04-10", r.corpo?.birthDate);

// 4. login por e-mail e por usuário; lockout
r = await chamar("POST", "/auth/login", { body: { identificador: email, password: SENHA } });
ok("login por e-mail", r.status === 201 && !!r.corpo.tokens);
r = await chamar("POST", "/auth/login", { body: { identificador: usuario, password: SENHA } });
ok("login por usuário", r.status === 201);
const sessaoExtra = r.corpo.tokens;

for (let i = 0; i < 5; i += 1) {
  r = await chamar("POST", "/auth/login", { body: { identificador: usuario, password: "errada!!" } });
}
ok("senha errada responde sempre 401 genérico", r.status === 401, r.corpo?.message);
const trancada = await prisma.user.findUnique({ where: { username: usuario } });
ok("5 falhas trancam a conta", !!trancada.lockedUntil && trancada.lockedUntil > new Date());
r = await chamar("POST", "/auth/login", { body: { identificador: usuario, password: SENHA } });
ok("senha certa durante o bloqueio também é 401", r.status === 401);
await prisma.user.update({ where: { username: usuario }, data: { lockedUntil: null, failedLogins: 0 } });

// 5. sessões
r = await chamar("GET", "/me/sessions", { token: tokens.accessToken });
const sessoes = r.corpo;
ok("lista as sessões abertas", Array.isArray(sessoes) && sessoes.length >= 3, `${sessoes?.length}`);
ok("marca exatamente uma como atual", sessoes.filter((s) => s.current).length === 1);
ok("guarda o user-agent do aparelho", sessoes.every((s) => s.userAgent?.includes("Chrome")));

const outra = sessoes.find((s) => !s.current);
r = await chamar("DELETE", `/me/sessions/${outra.id}`, { token: tokens.accessToken });
ok("encerra uma sessão", r.status === 200);
r = await chamar("POST", "/auth/refresh", { body: { refreshToken: sessaoExtra.refreshToken } });
ok(
  "sessão encerrada não renova mais",
  r.status === 401 || sessoes.find((s) => s.id === outra.id) === undefined,
);

// 6. rotação do refresh preserva a identidade da sessão
r = await chamar("POST", "/auth/refresh", { body: { refreshToken: tokens.refreshToken } });
ok("refresh rotaciona", r.status === 201 && r.corpo.refreshToken !== tokens.refreshToken);
const antes = tokens;
tokens = r.corpo;
r = await chamar("POST", "/auth/refresh", { body: { refreshToken: antes.refreshToken } });
ok("refresh token velho morre no primeiro uso", r.status === 401);
r = await chamar("GET", "/me/sessions", { token: tokens.accessToken });
ok(
  "a sessão continua sendo a mesma linha depois do refresh",
  r.corpo.find((s) => s.current)?.id === sessoes.find((s) => s.current)?.id,
);
ok("lastUsedAt é preenchido no refresh", !!r.corpo.find((s) => s.current)?.lastUsedAt);

// 7. 2FA
r = await chamar("POST", "/me/mfa/setup", { token: tokens.accessToken });
ok("setup devolve segredo e QR", !!r.corpo.secret && r.corpo.qrDataUrl.startsWith("data:image/png"));
const segredo = r.corpo.secret;

r = await chamar("POST", "/me/mfa/enable", { token: tokens.accessToken, body: { code: "000000" } });
ok("código errado não ativa", r.status === 400);
r = await chamar("POST", "/me/mfa/enable", {
  token: tokens.accessToken,
  body: { code: gerarCodigoTotp(segredo) },
});
ok("ativa e entrega 10 códigos de recuperação", r.corpo?.recoveryCodes?.length === 10);
const recuperacao = r.corpo.recoveryCodes;

r = await chamar("POST", "/auth/login", { body: { identificador: email, password: SENHA } });
ok("login com 2FA para no desafio", r.corpo?.mfaRequired === true && !!r.corpo.ticket);
const ticket = r.corpo.ticket;
r = await chamar("GET", "/me/account", { token: ticket });
ok("o ticket de 2FA não vale como access token", r.status === 401);

r = await chamar("POST", "/auth/mfa", { body: { ticket, code: "000000" } });
ok("código errado não fecha o login", r.status === 401);
r = await chamar("POST", "/auth/mfa", { body: { ticket, code: gerarCodigoTotp(segredo) } });
ok("código do app fecha o login", r.status === 201 && !!r.corpo.tokens);

r = await chamar("POST", "/auth/login", { body: { identificador: email, password: SENHA } });
r = await chamar("POST", "/auth/mfa", { body: { ticket: r.corpo.ticket, code: recuperacao[0] } });
ok("código de recuperação também fecha o login", r.status === 201);
r = await chamar("POST", "/auth/login", { body: { identificador: email, password: SENHA } });
r = await chamar("POST", "/auth/mfa", { body: { ticket: r.corpo.ticket, code: recuperacao[0] } });
ok("código de recuperação é de uso único", r.status === 401);
r = await chamar("GET", "/me/account", { token: tokens.accessToken });
ok("a conta mostra 9 códigos restantes", r.corpo.recoveryCodesLeft === 9, `${r.corpo.recoveryCodesLeft}`);

r = await chamar("POST", "/me/mfa/disable", {
  token: tokens.accessToken,
  body: { password: SENHA, code: gerarCodigoTotp(segredo) },
});
ok("desativa o 2FA com senha + código", r.status === 201);

// 8. trocar senha derruba as outras sessões, não a atual
const outraSessao = (await chamar("POST", "/auth/login", { body: { identificador: email, password: SENHA } }))
  .corpo.tokens;
r = await chamar("PATCH", "/me/password", {
  token: tokens.accessToken,
  body: { currentPassword: SENHA, newPassword: SENHA2 },
});
ok("troca a senha", r.status === 200, r.corpo?.message);
r = await chamar("POST", "/auth/refresh", { body: { refreshToken: outraSessao.refreshToken } });
ok("as outras sessões caem", r.status === 401);
r = await chamar("POST", "/auth/refresh", { body: { refreshToken: tokens.refreshToken } });
ok("a sessão que trocou a senha continua", r.status === 201);
tokens = r.corpo;

// 9. "esqueci a senha"
r = await chamar("POST", "/auth/forgot-password", { body: { email: "nao-existe@exemplo.com" } });
ok("e-mail inexistente também responde 201 (não vaza quem tem conta)", r.status === 201);
r = await chamar("POST", "/auth/forgot-password", { body: { email } });
const tokenReset = new URL(ultimoLink()).searchParams.get("token");
r = await chamar("POST", "/auth/reset-password", { body: { token: tokenReset, password: SENHA } });
ok("redefine a senha pelo link", r.status === 201);
r = await chamar("POST", "/auth/refresh", { body: { refreshToken: tokens.refreshToken } });
ok("redefinir derruba TODAS as sessões", r.status === 401);
r = await chamar("POST", "/auth/reset-password", { body: { token: tokenReset, password: SENHA2 } });
ok("token de redefinição é de uso único", r.status === 400);

// 10. desativar e reativar entrando
r = await chamar("POST", "/auth/login", { body: { identificador: email, password: SENHA } });
tokens = r.corpo.tokens;
r = await chamar("POST", "/me/disable", { token: tokens.accessToken, body: { password: SENHA } });
ok("desativa a conta", r.status === 200 && r.corpo.outcome === "disabled");
r = await chamar("GET", "/me/account", { token: tokens.accessToken });
ok("access token de conta desativada é recusado na hora", r.status === 401, r.corpo?.message);
r = await chamar("POST", "/auth/login", { body: { identificador: email, password: SENHA } });
ok("entrar de novo reativa", r.status === 201 && !!r.corpo.tokens);
tokens = r.corpo.tokens;

// 11. excluir
r = await chamar("DELETE", "/me", { token: tokens.accessToken, body: { password: "errada!!" } });
ok("exclusão pede a senha certa", r.status === 401);
r = await chamar("DELETE", "/me", { token: tokens.accessToken, body: { password: SENHA } });
ok("exclui a conta", r.status === 200 && r.corpo.outcome === "deleted");
const anonimo = await prisma.user.findFirst({ where: { deletedAt: { not: null }, email: null } });
ok("username vira o prefixo de excluído", anonimo?.username.startsWith("usuario_excluido_"), anonimo?.username);
ok("e-mail e nascimento são apagados", anonimo?.email === null && anonimo?.birthDate === null);
r = await chamar("POST", "/auth/login", { body: { identificador: email, password: SENHA } });
ok("conta excluída não entra mais", r.status === 401);
r = await chamar("GET", "/me/account", { token: tokens.accessToken });
ok("access token de conta excluída é recusado", r.status === 401);

// limpeza: o banco de smoke não precisa guardar o rastro
await prisma.user.deleteMany({ where: { OR: [{ username: { startsWith: "smoke_" } }, { id: anonimo?.id }] } });

console.log(falhas === 0 ? "\nSMOKE_OK" : `\nSMOKE_FALHAS=${falhas}`);
await app.close();
process.exit(falhas === 0 ? 0 : 1);
