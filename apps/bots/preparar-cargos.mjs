// Prepara a bancada da prova do **Streamz Cargos**: os dois cargos e o segundo
// usuário.
//
// Roda num `docker run --rm node:22` na rede da bancada, **antes** de o
// aplicativo ser instalado — e a ordem importa: o cargo gerenciado do bot nasce
// logo acima do mais alto que existir (`InstalacaoService`), então os cargos que
// ele vai distribuir precisam já existir para ficarem **abaixo** dele. Criá-los
// depois deixaria o bot sem hierarquia para dar nenhum dos dois, que é
// justamente o erro que este bot explica em vez de sofrer.
//
// Entrada: SEMENTE (JSON de `semear.mjs`) e API_URL.
// Saída: uma linha de JSON com os cargos e a conta do segundo usuário.

const semente = JSON.parse(process.env.SEMENTE);
const API = process.env.API_URL;
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
  if (!r.ok) throw new Error(`${metodo} ${rota} → ${r.status}: ${texto.slice(0, 300)}`);
  return texto ? JSON.parse(texto) : null;
}

const dono = semente.dono.accessToken;
const guildId = semente.servidor.id;

// 1. os dois cargos que o painel vai distribuir. Sem permissão nenhuma: um
//    cargo de "quero receber avisos" não precisa poder nada.
const ouvinte = await chamar(`/guilds/${guildId}/roles`, {
  metodo: "POST",
  corpo: { name: "Ouvinte", color: "#9be31f", permissions: 0 },
  token: dono,
});
const jogador = await chamar(`/guilds/${guildId}/roles`, {
  metodo: "POST",
  corpo: { name: "Jogador", color: "#5865f2", permissions: 0 },
  token: dono,
});

// 2. o segundo usuário — quem vai reagir. **Não** é o dono: o dono pode tudo, e
//    uma prova em que só o dono reage não mostra nada sobre permissão.
const sufixo = Math.random().toString(36).slice(2, 8);
const registro = await chamar("/auth/register", {
  metodo: "POST",
  corpo: {
    email: `fulano-${sufixo}@exemplo.invalido`,
    username: `fulano${sufixo}`,
    password: SENHA,
  },
});

// 3. ele entra no servidor por convite, como qualquer pessoa entraria.
const convite = await chamar(`/guilds/${guildId}/invites`, { metodo: "POST", corpo: {}, token: dono });
await chamar(`/invites/${convite.code}/redeem`, {
  metodo: "POST",
  token: registro.tokens.accessToken,
});

process.stdout.write(
  `${JSON.stringify({
    cargos: { ouvinte: { id: ouvinte.id, name: ouvinte.name }, jogador: { id: jogador.id, name: jogador.name } },
    segundo: {
      id: registro.user.id,
      username: registro.user.username,
      accessToken: registro.tokens.accessToken,
    },
  })}\n`,
);
