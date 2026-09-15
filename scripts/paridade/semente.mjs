#!/usr/bin/env node
/**
 * Semente determinística do passeio de paridade (onda 0.7 do
 * `docs/PLANO-PARIDADE-DISCORD.md`): um servidor "Paridade" que tem de tudo,
 * mais o entorno que as telas de Início, DMs e rail precisam.
 *
 * Roda **dentro da rede da bancada**, contra um banco recém-criado — quem
 * recria o banco e chama este arquivo é o `bancada.sh semear`:
 *
 *   API_URL=http://paridade-api:43333 \
 *   DATABASE_URL=postgresql://paridade:paridade@paridade-postgres:5432/paridade?schema=public \
 *   WEB_PUBLICA=http://localhost:43000 \
 *   node scripts/paridade/semente.mjs --manifesto /w/.claude/paridade/semente.json
 *
 * ## API primeiro, Prisma só onde a API não deixa
 *
 * Tudo que tem rota passa pela rota — registro, perfil, amizade, servidor,
 * canal, cargo, convite, conversa, aplicativo — e toda mensagem, reação,
 * edição, enquete e voto passa pelo **gateway** (`message.create` etc.), como
 * manda o CLAUDE.md. Assim a semente exercita as mesmas regras de permissão e
 * gera as mesmas mensagens de sistema (entrada, fixação) que um usuário
 * geraria. O Prisma entra em quatro pontos, e só neles:
 *
 * 1. **Datas fixas.** Toda linha nasce com `now()`; sem reescrever `createdAt`
 *    a timeline mudaria de dia a cada semeadura (e o "Hoje às" viraria
 *    "10/09/2026"). A reescrita é o último passo, depois de tudo criado.
 * 2. **E-mail verificado.** A única rota que verifica exige o token que o
 *    e-mail leva (`/auth/verify-email`); sem SMTP ele só existe no log.
 * 3. **Código de convite legível** (`paridade`, `oficina`): o gerado é
 *    aleatório e apareceria na página de convite e na mensagem com o link.
 * 4. **Anexos sem R2.** `POST /uploads` responde 503 sem bucket e
 *    `POST /uploads/external` só aceita o host do provedor de GIF
 *    (`uploads.service.ts`). A semente cria a linha `Attachment` solta
 *    apontando para um arquivo estático da **própria web da bancada** — e
 *    quem vincula o anexo à mensagem continua sendo o `message.create`, com a
 *    checagem de "só anexo do próprio autor" do `MessagesService`.
 *
 * Idempotência: a semente recusa um banco que já tem a conta `paridade` (sai
 * com código 3). Semear de novo é recriar o banco — o `bancada.sh semear` faz
 * isso sempre, e depois guarda um modelo (`paridade_semente`) que o
 * `capturar` restaura antes de cada passeio.
 *
 * Saída: o manifesto (`--manifesto`), com ids, contas e chaves de mensagem que
 * o `capturar.mjs` usa para achar cada coisa na tela sem depender de texto.
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const arg = (nome, padrao) => {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : padrao;
};

const API = (process.env.API_URL ?? arg("--api", "http://localhost:43333")).replace(/\/$/, "");
/** A origem que o **navegador** da bancada enxerga — vai dentro da URL dos anexos e do convite. */
const WEB_PUBLICA = (process.env.WEB_PUBLICA ?? arg("--web", "http://localhost:43000")).replace(/\/$/, "");
const MANIFESTO = resolve(arg("--manifesto", join(RAIZ, ".claude/paridade/semente.json")));

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL ausente: a semente precisa do banco da bancada (ver bancada.sh semear).");
  process.exit(1);
}

// As dependências vêm dos pacotes que já as têm instaladas: o Prisma client
// gerado da API, o socket.io-client da web e o contrato compilado do shared.
// Nada é instalado para este script.
const exigirDaApi = createRequire(join(RAIZ, "apps/api/package.json"));
const exigirDaWeb = createRequire(join(RAIZ, "apps/web/package.json"));
const { PrismaClient } = exigirDaApi("@prisma/client");
const { io } = exigirDaWeb("socket.io-client");
const { Permission, WS_EVENTS } = createRequire(import.meta.url)(
  join(RAIZ, "packages/shared/dist/index.js"),
);

// ── datas ────────────────────────────────────────────────────────────────────

/** America/Sao_Paulo: sem horário de verão desde 2019, então o deslocamento é fixo. */
const FUSO = "-03:00";
/** O dia da conversa. O `capturar.mjs` congela o relógio do navegador nesse dia, às 18:30. */
const DIA = "2026-09-10";
/** Até onde o dono "leu" o que está lido. Tem de ser depois de toda mensagem lida e antes do relógio. */
const LEITURA = "18:00";

/** "14:10" · "14:10:20" · "2025-01-10" · "2025-01-10T10:00" → Date fixa no fuso da bancada. */
function quando(t) {
  let s = t;
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(s)) s = `${DIA}T${s}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s = `${s}T10:00`;
  if (/T\d{2}:\d{2}$/.test(s)) s = `${s}:00`;
  const d = new Date(`${s}${FUSO}`);
  if (Number.isNaN(d.getTime())) throw new Error(`data inválida na semente: ${t}`);
  return d;
}
const mais = (d, segundos) => new Date(d.getTime() + segundos * 1000);
const unix = (t) => Math.floor(quando(t).getTime() / 1000);
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

// ── elenco ───────────────────────────────────────────────────────────────────

/** Uma senha só para todas as contas: é uma bancada local, e o manifesto a repete. */
const SENHA = "Paridade#2026";
const DOMINIO = "e2e.streamz.test";

/**
 * O dono e oito membros. `presenca` é o que o passeio quer ver; quem a produz
 * é o `capturar.mjs`, que conecta um socket para cada `conectar: true` (a
 * presença do Streamz é ao vivo: ONLINE só existe com conexão aberta, e o
 * `manualStatus` só vale enquanto ela existe — `chat.gateway.ts`, `markOnline`).
 */
const PESSOAS = [
  {
    chave: "dono",
    username: "paridade",
    displayName: "Pati Ribeiro",
    pronomes: "ela/dela",
    sobre: "Conta do passeio de paridade. Tudo neste servidor é semente.",
    faixa: "#9BE31F",
    criadoEm: "2024-03-15",
    presenca: "ONLINE",
  },
  {
    chave: "bia",
    username: "bia",
    displayName: "Bia Souza",
    pronomes: "ela/dela",
    sobre: "Design de interface. Pixel por pixel.",
    faixa: "#EB459E",
    criadoEm: "2024-05-02",
    presenca: "ONLINE",
    conectar: true,
    statusPersonalizado: { texto: "desenhando o leiaute", emoji: "🎨" },
  },
  {
    chave: "caio",
    username: "caio",
    displayName: "Caio Lima",
    criadoEm: "2024-06-18",
    presenca: "IDLE",
    manual: "IDLE",
    conectar: true,
  },
  {
    chave: "duda",
    username: "duda",
    displayName: "Duda Ferreira",
    pronomes: "ela/dela",
    sobre: "Moderação e medidas. Se não foi medido, não existe.",
    faixa: "#3498DB",
    criadoEm: "2024-07-09",
    presenca: "DND",
    manual: "DND",
    conectar: true,
    statusPersonalizado: { texto: "em reunião até 16h", emoji: "📅" },
  },
  {
    chave: "enzo",
    username: "enzo",
    displayName: "Enzo Rocha",
    criadoEm: "2024-09-21",
    presenca: "ONLINE",
    conectar: true,
    voz: "voz-geral",
    statusPersonalizado: { texto: "ouvindo lo-fi", emoji: "🎧" },
  },
  {
    chave: "fernanda",
    username: "fernanda",
    displayName: "Fê Martins",
    criadoEm: "2025-01-05",
    presenca: "ONLINE",
    conectar: true,
    voz: "voz-geral",
    mudo: true,
  },
  {
    chave: "gabi",
    username: "gabi",
    displayName: "Gabi Nunes",
    criadoEm: "2025-02-14",
    presenca: "ONLINE",
    conectar: true,
  },
  {
    chave: "heitor",
    username: "heitor",
    displayName: "Heitor Alves",
    criadoEm: "2025-04-30",
    presenca: "OFFLINE",
    vistoEm: "2026-09-09T22:40",
  },
  {
    chave: "iris",
    username: "iris",
    displayName: "Íris Costa",
    criadoEm: "2025-08-11",
    // invisível: conectada, mas aparece offline para os outros
    presenca: "OFFLINE",
    manual: "OFFLINE",
    conectar: true,
  },
];

/** Amizades na visão do dono: cinco aceitas, dois pedidos recebidos e um enviado. */
const AMIZADES = [
  { de: "dono", para: "bia", aceita: true, em: "2024-06-01T10:00" },
  { de: "dono", para: "caio", aceita: true, em: "2024-07-01T10:00" },
  { de: "duda", para: "dono", aceita: true, em: "2024-08-01T10:00" },
  { de: "dono", para: "enzo", aceita: true, em: "2024-10-01T10:00" },
  { de: "gabi", para: "dono", aceita: true, em: "2025-03-01T10:00" },
  { de: "heitor", para: "dono", aceita: false, em: "2026-09-09T20:00" },
  { de: "fernanda", para: "dono", aceita: false, em: "2026-09-10T11:00" },
  { de: "dono", para: "iris", aceita: false, em: "2026-09-08T09:00" },
];

/** Quando cada um entrou no Paridade — vira `joinedAt` e a hora do "X entrou no servidor". */
const ENTRADAS_PARIDADE = {
  dono: "2025-01-10T10:00",
  bia: "2025-01-10T10:05",
  caio: "2025-01-12T19:30",
  duda: "2025-02-01T09:15",
  enzo: "2025-03-15T21:00",
  fernanda: "2025-05-20T14:40",
  gabi: "2025-06-02T08:10",
  heitor: "2025-07-19T17:25",
  iris: "2025-08-12T12:00",
};
const ENTRADAS_OFICINA = { duda: "2025-06-01T10:00", dono: "2025-06-02T11:00", bia: "2025-06-03T15:00" };
/** O bot do aplicativo entra no Paridade na instalação. */
const ENTRADA_DO_BOT = "2025-09-01T10:00";

/** Cargos, criados de baixo para cima (cada um nasce acima do anterior, `roles.service.ts`). */
const CARGOS = [
  { chave: "artistas", nome: "Artistas", cor: "#1ABC9C", hoist: true, mencionavel: false, permissoes: 0 },
  { chave: "veteranos", nome: "Veteranos", cor: "#E67E22", hoist: false, mencionavel: false, permissoes: 0 },
  {
    chave: "moderacao",
    nome: "Moderação",
    cor: "#3498DB",
    hoist: true,
    mencionavel: true,
    permissoes: [
      "MANAGE_MESSAGES",
      "KICK_MEMBERS",
      "MODERATE_MEMBERS",
      "MUTE_MEMBERS",
      "MOVE_MEMBERS",
      "VIEW_AUDIT_LOG",
    ],
  },
];
/** Quem tem o quê. "admin" é o cargo "Administrador" que o servidor já cria. */
const ATRIBUICOES = {
  dono: ["admin"],
  bia: ["moderacao", "artistas"],
  duda: ["moderacao"],
  caio: ["veteranos"],
  gabi: ["veteranos"],
  enzo: ["artistas"],
  heitor: ["artistas"],
};

/**
 * Os canais criados além dos dois com que o servidor nasce (`#geral` e o de
 * voz "Geral", ver `guilds.service.ts` `create`). A ordem dentro da categoria é
 * a de criação (`channels.service.ts` usa a contagem como posição).
 */
const CANAIS = [
  { chave: "boas-vindas", nome: "boas-vindas", tipo: "TEXT", categoria: "info", readOnly: true, topico: "Quem chega aparece aqui." },
  { chave: "regras", nome: "regras", tipo: "TEXT", categoria: "info", readOnly: true, topico: "Leia antes de postar." },
  { chave: "anuncios", nome: "anúncios", tipo: "ANNOUNCEMENT", categoria: "info", topico: "Novidades do servidor." },
  { chave: "aleatorio", nome: "aleatório", tipo: "TEXT", categoria: "texto" },
  { chave: "bots", nome: "bots", tipo: "TEXT", categoria: "texto", topico: "Comandos e respostas do Pixel." },
  { chave: "equipe", nome: "equipe", tipo: "TEXT", categoria: "texto", privado: true, membros: ["bia", "duda"] },
  { chave: "voz-jogos", nome: "Jogos", tipo: "VOICE", categoria: "voz" },
];

/** Os comandos de barra do Pixel — aparecem no `/` do composer ao lado dos nativos. */
const COMANDOS_DO_BOT = [
  {
    name: "tocar",
    description: "Toca uma música no canal de voz",
    options: [{ type: 3, name: "musica", description: "Nome ou link da música", required: true }],
  },
  { name: "status", description: "Mostra o status do servidor" },
  {
    name: "ajuda",
    description: "Lista os comandos do Pixel",
    options: [
      {
        type: 3,
        name: "assunto",
        description: "Sobre o que você precisa de ajuda",
        choices: [
          { name: "Música", value: "musica" },
          { name: "Moderação", value: "moderacao" },
        ],
      },
    ],
  },
  // opção com `autocomplete: true`: quem sugere é o bot (interação tipo 4,
  // callback 8). A tela `m-autocomplete-de-bot` digita `/buscar lo` e o bot
  // figurante do `capturar.mjs` responde com `RESPOSTAS_DO_BOT.autocomplete`
  {
    name: "buscar",
    description: "Procura uma música para tocar",
    options: [{ type: 3, name: "musica", description: "Comece a digitar o nome", required: true, autocomplete: true }],
  },
];

/**
 * O que o Pixel **responde** quando alguém interage — a semente não tem bot
 * rodando, então quem responde durante o passeio é o bot figurante do
 * `capturar.mjs` (uma sessão no gateway compatível com o token do manifesto).
 * Os dados moram aqui, ao lado das mensagens e dos comandos a que respondem, e
 * vão para o manifesto em `aplicativo.respostas`.
 *
 * - `modais`: `custom_id` do botão → `data` do callback 9 (MODAL). "Detalhes"
 *   (`status:detalhes`, da mensagem `bot-componentes`) abre o modal da tela
 *   `modal-de-bot`: `Label` com texto curto e com parágrafo, a forma nova do
 *   Discord.
 * - `autocomplete`: nome do comando → as escolhas do callback 8; o figurante
 *   filtra pelo texto da opção em foco.
 */
const RESPOSTAS_DO_BOT = {
  modais: {
    "status:detalhes": {
      custom_id: "status:detalhes:modal",
      title: "Detalhes do serviço",
      components: [
        {
          type: 18,
          label: "Serviço",
          description: "Qual serviço você quer acompanhar",
          component: { type: 4, custom_id: "servico", style: 1, placeholder: "API, Web ou Voz", required: true, max_length: 20 },
        },
        {
          type: 18,
          label: "Observação",
          component: {
            type: 4,
            custom_id: "observacao",
            style: 2,
            placeholder: "Conte o que você percebeu",
            required: false,
            max_length: 400,
          },
        },
      ],
    },
  },
  autocomplete: {
    buscar: [
      { name: "Lo-fi para estudar", value: "lofi-estudar" },
      { name: "Lo-fi da madrugada", value: "lofi-madrugada" },
      { name: "Lofi Girl — beats to relax", value: "lofi-girl" },
      { name: "Balão (lo-fi remix)", value: "balao-lofi" },
      { name: "Solo de guitarra", value: "solo-guitarra" },
    ],
  },
};

/**
 * Os anexos. A URL é um arquivo estático que a web da bancada já serve
 * (`apps/web/public/`): nada sai da máquina e a imagem é sempre a mesma.
 */
const ANEXOS = {
  imagem: {
    filename: "mockup-tela-de-canal.png",
    contentType: "image/png",
    size: 48_213,
    width: 512,
    height: 512,
    caminho: "/icone-512.png",
  },
  pdf: {
    filename: "especificacao-paridade.pdf",
    contentType: "application/pdf",
    size: 248_000,
    width: null,
    height: null,
    // não é baixado por ninguém no passeio; só precisa ser uma URL da bancada
    caminho: "/sw.js",
  },
};

// ── roteiros de mensagens ───────────────────────────────────────────────────
//
// Cada item: `h` (hora), `a` (quem), `k` (chave no manifesto), `t` (texto, ou
// função do contexto quando precisa de id). Extras: `responde` (chave da
// citada), `anexos`, `thread`, `editar`, `suprimir` (tira a prévia de link:
// o Open Graph depende da rede e deixaria a foto instável), `fixar`,
// `enquete`. A ordem da lista é a ordem de criação; a da tela sai de `h`.

const ROTEIRO_GERAL = [
  { h: "13:55", a: "caio", k: "bom-dia", t: "Bom dia, pessoal! ☀️" },
  {
    h: "13:56",
    a: "caio",
    k: "thread-raiz",
    t: "Alguém revisa o leiaute novo da tela de canal hoje?",
    thread: {
      nome: "Revisão do leiaute",
      respostas: [
        { h: "14:03", a: "bia", k: "thread-1", t: "Eu olho depois do almoço 🍝" },
        { h: "14:05", a: "duda", k: "thread-2", t: "Deixei comentários no Figma 👀" },
        { h: "14:07", a: "caio", k: "thread-3", t: "Valeu! Ajustei o espaçamento do cabeçalho." },
      ],
    },
  },
  { h: "13:58", a: "bia", k: "bia-almoco", t: "Posso ver depois do almoço, me marca na thread" },
  {
    h: "14:10",
    a: "dono",
    k: "md-inline",
    t: "**negrito**, *itálico*, _itálico com traço baixo_, __sublinhado__, ~~riscado~~, ||spoiler|| e `código inline`",
  },
  {
    h: "14:10:20",
    a: "dono",
    k: "md-cabecalhos",
    t: "# Cabeçalho 1\n## Cabeçalho 2\n### Cabeçalho 3\n-# subtexto pequeno, como o do Discord",
  },
  {
    h: "14:10:40",
    a: "dono",
    k: "md-citacoes",
    t: "> citação de uma linha\n>>> citação em bloco\nque continua na linha de baixo\ne vai até o fim da mensagem",
  },
  {
    h: "14:11",
    a: "dono",
    k: "md-listas",
    t: "Listas:\n- item um\n- item dois\n  - item aninhado\n1. primeiro\n2. segundo",
  },
  {
    h: "14:11:30",
    a: "dono",
    k: "md-codigo",
    t: "```ts\nexport function soma(a: number, b: number): number {\n  // bloco de código com linguagem\n  return a + b;\n}\n```",
  },
  {
    h: "14:12",
    a: "dono",
    k: "md-links",
    t: "Links: https://example.com/docs, [link mascarado](https://example.com/paridade) e <https://example.com/sem-previa>",
    suprimir: true,
  },
  {
    h: "14:12:30",
    a: "dono",
    k: "md-mencoes",
    t: (c) =>
      `Menções: @bia, <@${c.u.enzo.id}>, <@&${c.cargos.moderacao.id}> e <#${c.canais.bots.id}> · ` +
      `emoji 😀 🎉 👍 · data <t:${unix("17:00")}:F> (<t:${unix("17:00")}:R>)`,
  },
  { h: "14:20", a: "bia", k: "imagem", t: "Mockup da tela de canal 👇", anexos: ["imagem"] },
  { h: "14:20:30", a: "bia", k: "arquivo", t: "E a especificação completa:", anexos: ["pdf"] },
  { h: "14:25", a: "enzo", k: "contraste", t: "Ficou ótimo! Só o contraste do botão primário que eu mudaria." },
  { h: "14:26", a: "dono", k: "resposta", t: "Boa, vou testar o contraste AA com o texto escuro 👍", responde: "contraste" },
  {
    h: "14:30",
    a: "duda",
    k: "editada",
    t: "Mensagem com erro de digitaçao",
    editar: { h: "14:32", t: "Mensagem editada: agora com o texto certo ✅" },
  },
  {
    h: "14:35",
    a: "gabi",
    k: "fixada",
    t: "Guia de estilo da paridade: https://example.com/guia — tokens, tipografia e ícones.",
    suprimir: true,
    fixar: { h: "14:36" },
  },
  {
    h: "14:40",
    a: "dono",
    k: "enquete",
    enquete: {
      pergunta: "Qual tema a gente testa primeiro?",
      opcoes: ["Escuro", "Cinza (Ash)", "Preto (Onyx)"],
      votos: { bia: 0, caio: 1, duda: 0, enzo: 2, gabi: 0 },
    },
  },
  { h: "14:45", a: "fernanda", k: "mencao-dono", t: "@paridade já subiu a bancada de paridade?" },
  { h: "14:46", a: "dono", k: "subiu", t: "Subiu! Fotografando as telas agora 📸" },
  { h: "14:47", a: "caio", k: "jumbo", t: "🎉🎉🎉" },
  {
    h: "14:48",
    a: "bia",
    k: "convite",
    t: () => `Convite para quem quiser testar: ${WEB_PUBLICA}/invite/paridade`,
  },
];

const REACOES_GERAL = [
  { k: "md-inline", emoji: "👍", por: ["bia", "caio", "duda", "enzo"] },
  { k: "md-inline", emoji: "😂", por: ["gabi"] },
  { k: "imagem", emoji: "❤️", por: ["dono", "enzo", "gabi"] },
  { k: "imagem", emoji: "🔥", por: ["caio", "duda"] },
  { k: "subiu", emoji: "👀", por: ["duda"] },
  { k: "jumbo", emoji: "🎉", por: ["bia", "enzo"] },
];

/** Os outros canais do Paridade. `#aleatório` fica **não lido**, com uma menção ao dono. */
const ROTEIROS_CANAIS = {
  regras: [
    {
      h: "11:00",
      a: "dono",
      k: "regras",
      t: "## Regras do servidor\n1. Seja gentil com todo mundo.\n2. Nada de spam nem autopromoção.\n3. Use o canal certo para cada assunto.\n-# Ao participar, você concorda com estas regras.",
    },
  ],
  anuncios: [
    {
      h: "12:00",
      a: "dono",
      k: "anuncio",
      t: (c) => `@everyone **Paridade 0.9 no ar!** As novidades estão em <#${c.canais.regras.id}> e no #geral.`,
    },
  ],
  aleatorio: [
    { h: "15:00", a: "enzo", k: "aleatorio-1", t: "Alguém viu o jogo ontem? ⚽" },
    { h: "15:02", a: "heitor", k: "aleatorio-2", t: "Vi! Que final" },
    { h: "15:05", a: "gabi", k: "mencao-aleatorio", t: "@paridade você vem na call de sexta?" },
  ],
  bots: [{ h: "15:30", a: "dono", k: "pergunta-ao-bot", t: "Pixel, como está o servidor?" }],
  equipe: [{ h: "15:40", a: "bia", k: "equipe", t: "Canal privado da equipe de moderação 🔒" }],
};

/**
 * As mensagens do bot no #bots, no formato da API do Discord — é o corpo que um
 * `channel.send()` do discord.js manda. Desde a onda 3 elas são **guardadas**
 * (embeds, componentes e flags) e a web as desenha como o Discord; antes o embed
 * era achatado em texto e os componentes, descartados.
 *
 * As quatro cobrem o que os cartões 3b–3g desenham (ver `docs/CONTRATO-ONDA-3.md`):
 *
 * 1. `bot` — embed rico **completo**: autor com ícone, título com link,
 *    descrição com markdown, cor, 3 campos inline + 1 não inline, imagem,
 *    thumbnail, rodapé com ícone e timestamp. A chave continua `bot` porque o
 *    passo `mensagem-bot` do `capturar.mjs` centraliza por ela.
 * 2. `bot-componentes` — duas action rows: botões nos 5 estilos com `custom_id`/
 *    `url` (primary, secondary, success, danger, link), um desabilitado e um com
 *    emoji; e um select de texto.
 * 3. `bot-v2` — `IS_COMPONENTS_V2` (1 << 15): container com cor, section com
 *    thumbnail, text display, separator, media gallery e file. O file referencia
 *    um anexo da própria mensagem por `attachment://`, que é a única forma que o
 *    Discord aceita para ele.
 * 4. `bot-sem-cor` — embed **sem `color`**, para medir a borda esquerda padrão
 *    (`EmbedDeBot.tsx`: `border-l-border-normal` contra `border-border-subtle`)
 *    logo abaixo do container v2, que tem cor; e um select de usuário múltiplo
 *    (`type` 5), o único jeito de a folha do celular mostrar título, Concluir
 *    e busca juntos (`SelectDeBot.tsx`: a busca é só dos tipos 5–8, o título e
 *    o Concluir só do múltiplo).
 *
 * As imagens são arquivos que a web da bancada já serve (`apps/web/public/`):
 * nada sai da máquina e a foto é sempre a mesma.
 */
const IMAGEM_GRANDE = `${WEB_PUBLICA}/icone-512.png`;
const IMAGEM_PEQUENA = `${WEB_PUBLICA}/icone-192.png`;
const IMAGEM_MASCARAVEL = `${WEB_PUBLICA}/icone-maskable-512.png`;

/** O anexo que o `File` da mensagem v2 cita (é criado em nome do usuário-bot). */
const ANEXO_DO_BOT = { ...ANEXOS.pdf, filename: "relatorio-do-servidor.pdf" };

const MENSAGENS_DO_BOT = [
  {
    h: "15:30:30",
    k: "bot",
    corpo: {
      embeds: [
        {
          author: { name: "Pixel · monitor", url: "https://example.com/pixel", icon_url: IMAGEM_PEQUENA },
          title: "Status do servidor",
          url: "https://example.com/status",
          description:
            "Tudo funcionando ✅\n**3 serviços** no ar, _nenhum_ incidente hoje.\n> Próxima manutenção: `sexta, 02:00`",
          color: 0x5865f2,
          fields: [
            { name: "Membros", value: "9", inline: true },
            { name: "Canais", value: "10", inline: true },
            { name: "Latência", value: "42 ms", inline: true },
            { name: "Últimos avisos", value: "• Backup concluído\n• Certificado renovado" },
          ],
          image: { url: IMAGEM_GRANDE },
          thumbnail: { url: IMAGEM_PEQUENA },
          footer: { text: "Pixel • atualizado automaticamente", icon_url: IMAGEM_MASCARAVEL },
          timestamp: quando("15:30").toISOString(),
        },
      ],
    },
  },
  {
    h: "15:31",
    k: "bot-componentes",
    corpo: {
      content: "O que você quer fazer com o servidor?",
      components: [
        {
          type: 1,
          components: [
            { type: 2, style: 1, label: "Atualizar", custom_id: "status:atualizar", emoji: { name: "🔄" } },
            { type: 2, style: 2, label: "Detalhes", custom_id: "status:detalhes" },
            { type: 2, style: 3, label: "Confirmar", custom_id: "status:confirmar" },
            { type: 2, style: 4, label: "Reiniciar", custom_id: "status:reiniciar", disabled: true },
            { type: 2, style: 5, label: "Abrir painel", url: "https://example.com/painel" },
          ],
        },
        {
          type: 1,
          components: [
            {
              type: 3,
              custom_id: "status:servico",
              placeholder: "Escolha um serviço",
              options: [
                { label: "API", value: "api", description: "REST e gateway", emoji: { name: "🛰️" } },
                { label: "Web", value: "web", description: "Site e desktop", default: true },
                { label: "Voz", value: "voz", description: "LiveKit" },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    h: "15:32",
    k: "bot-v2",
    anexoDoBot: true,
    corpo: {
      flags: 1 << 15,
      components: [
        {
          type: 17,
          accent_color: 0xf0b232,
          components: [
            {
              type: 9,
              components: [
                { type: 10, content: "## Relatório semanal" },
                { type: 10, content: "O servidor cresceu **12%** esta semana e ninguém caiu da call." },
              ],
              accessory: { type: 11, media: { url: IMAGEM_PEQUENA }, description: "Ícone do Streamz" },
            },
            { type: 10, content: "Os destaques, em fotos:" },
            { type: 14, divider: true, spacing: 2 },
            {
              type: 12,
              items: [
                { media: { url: IMAGEM_GRANDE }, description: "Tela do canal" },
                { media: { url: IMAGEM_MASCARAVEL } },
                { media: { url: IMAGEM_PEQUENA }, spoiler: true },
              ],
            },
            { type: 13, file: { url: `attachment://${ANEXO_DO_BOT.filename}` } },
            {
              type: 1,
              components: [
                { type: 2, style: 1, label: "Ver o relatório", custom_id: "relatorio:abrir" },
                { type: 2, style: 5, label: "Histórico", url: "https://example.com/historico" },
              ],
            },
          ],
        },
        { type: 10, content: "-# Gerado pelo Pixel" },
      ],
    },
  },
  {
    h: "15:33",
    k: "bot-sem-cor",
    corpo: {
      // sem `color` de propósito (ver o item 4 do cabeçalho)
      embeds: [
        {
          title: "Fila de revisão",
          description: "3 telas esperando revisão. Escolha até três pessoas para revisar.",
          footer: { text: "Pixel • revisão" },
        },
      ],
      components: [
        {
          type: 1,
          components: [
            {
              type: 5,
              custom_id: "revisao:pessoas",
              placeholder: "Quem revisa?",
              min_values: 1,
              max_values: 3,
            },
          ],
        },
      ],
    },
  },
];

const ROTEIRO_DM_BIA = [
  { h: "16:00", a: "bia", k: "dm-bia-1", t: "Oi! Viu o mockup que mandei no #geral?" },
  { h: "16:01", a: "dono", k: "dm-bia-2", t: "Vi sim, ficou muito bom 😍" },
  { h: "16:01:20", a: "dono", k: "dm-bia-3", t: "Só vou ajustar o espaçamento do cabeçalho" },
  { h: "16:03", a: "bia", k: "dm-bia-4", t: "Fechou. Me chama se precisar de ajuda com os ícones" },
  { h: "16:03:30", a: "bia", k: "dm-bia-5", t: "||spoiler: a paleta nova vem aí||" },
  { h: "16:10", a: "dono", k: "dm-bia-6", t: "Combinado!" },
];
/** Fica **não lida** para o dono: é o avatar com número que aparece no topo da rail. */
const ROTEIRO_DM_CAIO = [
  { h: "17:20", a: "caio", k: "dm-caio-1", t: "Ei, tem um minuto?" },
  { h: "17:21", a: "caio", k: "dm-caio-2", t: "Queria te mostrar o protótipo do celular 📱" },
];
const ROTEIRO_GRUPO = [
  { h: "16:30", a: "dono", k: "grupo-1", t: "Criei o grupo para alinharmos a paridade visual" },
  { h: "16:31", a: "duda", k: "grupo-2", t: "Boa! Já trago as medidas do Discord" },
  { h: "16:32", a: "enzo", k: "grupo-3", t: "👍" },
  { h: "16:40", a: "bia", k: "grupo-4", t: "Subi as referências na pasta compartilhada" },
];
/** No segundo servidor, a menção que acende o badge dele na rail. */
const ROTEIRO_OFICINA = [
  { h: "17:00", a: "duda", k: "oficina-mencao", t: "@paridade dá uma olhada na paleta nova quando puder 🎨" },
  { h: "17:05", a: "bia", k: "oficina-2", t: "Eu achei o verde perfeito" },
];

// ── estado da semeadura ─────────────────────────────────────────────────────

const c = {
  /** pessoas por chave: { ...definição, id, token, sock } */
  u: {},
  servidores: {},
  canais: {},
  categorias: {},
  cargos: {},
  conversas: {},
  mensagens: {},
  aplicativo: null,
};
/** id da mensagem → data fixa */
const datas = new Map();
/** id da mensagem → data da edição */
const edicoes = new Map();
/** id da mensagem fixada → data da fixação */
const fixacoes = new Map();
/** id da raiz → data de criação da thread */
const threads = new Map();
/** `${guildId}:${userId}` → data de entrada */
const entradas = new Map();

let etapaAtual = "início";
function etapa(nome) {
  etapaAtual = nome;
  console.log(`\n▶ ${nome}`);
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

class ErroHttp extends Error {
  constructor(mensagem, status) {
    super(mensagem);
    this.status = status;
  }
}

async function http(metodo, caminho, { token, bot, corpo } = {}) {
  const headers = {};
  if (corpo !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  if (bot) headers.authorization = `Bot ${bot}`;
  const r = await fetch(`${API}/api${caminho}`, {
    method: metodo,
    headers,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await r.text();
  if (!r.ok) {
    throw new ErroHttp(`${metodo} ${caminho} → HTTP ${r.status}: ${texto.slice(0, 400)}`, r.status);
  }
  return texto ? JSON.parse(texto) : null;
}

async function entrarComo(chave) {
  const p = c.u[chave];
  const s = await http("POST", "/auth/login", { corpo: { identificador: p.username, password: SENHA } });
  if (!s?.tokens?.accessToken) throw new Error(`login de ${p.username} não devolveu sessão (2FA?)`);
  p.token = s.tokens.accessToken;
}

/** Chamada como `chave`. O access token vive 15 min: um 401 renova uma vez e repete. */
async function como(chave, metodo, caminho, corpo) {
  try {
    return await http(metodo, caminho, { token: c.u[chave].token, corpo });
  } catch (e) {
    if (!(e instanceof ErroHttp) || e.status !== 401) throw e;
    await entrarComo(chave);
    return http(metodo, caminho, { token: c.u[chave].token, corpo });
  }
}

// ── WebSocket ────────────────────────────────────────────────────────────────

class ErroWs extends Error {}

function conectar(chave) {
  const p = c.u[chave];
  return new Promise((ok, falha) => {
    const sock = io(API, {
      auth: { token: p.token },
      transports: ["websocket"],
      reconnection: false,
      timeout: 15_000,
    });
    const limite = setTimeout(() => {
      sock.close();
      falha(new Error(`socket de ${p.username}: sem conexão em 15 s`));
    }, 15_000);
    sock.once("connect", () => {
      clearTimeout(limite);
      ok(sock);
    });
    sock.once("connect_error", (e) => {
      clearTimeout(limite);
      falha(new Error(`socket de ${p.username}: ${e.message}`));
    });
    sock.on("disconnect", (motivo) => {
      if (!sock.fechando) console.warn(`  ! o socket de ${p.username} caiu (${motivo})`);
    });
    sock.salas = new Set();
  });
}

/** Espera `evento` que passe no `filtro`; um `ws.error` no meio vira exceção. */
function esperarEvento(sock, evento, filtro, ms = 12_000) {
  return new Promise((ok, falha) => {
    const aoEvento = (dados) => {
      if (filtro && !filtro(dados)) return;
      limpar();
      ok(dados);
    };
    const aoErro = (e) => {
      limpar();
      falha(new ErroWs(e?.message ?? String(e)));
    };
    const limite = setTimeout(() => {
      limpar();
      falha(new Error(`sem "${evento}" em ${ms} ms`));
    }, ms);
    function limpar() {
      clearTimeout(limite);
      sock.off(evento, aoEvento);
      sock.off(WS_EVENTS.ERROR, aoErro);
    }
    sock.on(evento, aoEvento);
    sock.on(WS_EVENTS.ERROR, aoErro);
  });
}

/**
 * Emite um comando e espera a confirmação. O balde do gateway (`WS_LIMITS`:
 * 10 mensagens de rajada, 1 por segundo depois) responde "Devagar" quando a
 * semente corre demais — aí ela espera e repete, em vez de falhar.
 */
async function comando(chave, evento, payload, espera) {
  const sock = c.u[chave].sock;
  for (let tentativa = 1; tentativa <= 8; tentativa++) {
    const confirmacao = esperarEvento(sock, espera.evento, espera.filtro, espera.ms);
    sock.emit(evento, payload);
    try {
      return await confirmacao;
    } catch (e) {
      if (e instanceof ErroWs && /devagar/i.test(e.message)) {
        await dormir(1_500);
        continue;
      }
      throw new Error(`${evento} de ${c.u[chave].username}: ${e.message}`);
    }
  }
  throw new Error(`${evento} de ${c.u[chave].username}: o limite do gateway não liberou`);
}

/**
 * O socket entra em todas as salas no connect (`handleConnection`), mas o
 * connect do cliente chega antes de o servidor terminar esse `join`. Pedir a
 * sala do canal explicitamente (idempotente) fecha a corrida em que o eco
 * `message.new` sairia para uma sala em que o autor ainda não está.
 */
async function garantirSala(chave, canalId) {
  const sock = c.u[chave].sock;
  if (sock.salas.has(canalId)) return;
  sock.emit(WS_EVENTS.CHANNEL_JOIN, canalId);
  sock.salas.add(canalId);
  await dormir(200);
}

let sequencia = 0;
async function enviar(chave, canalId, conteudo, extras = {}) {
  await garantirSala(chave, canalId);
  const nonce = `paridade-${++sequencia}`;
  return comando(
    chave,
    WS_EVENTS.MESSAGE_CREATE,
    { channelId: canalId, content: conteudo, nonce, ...extras },
    { evento: WS_EVENTS.MESSAGE_NEW, filtro: (m) => m?.nonce === nonce },
  );
}

// ── passos ───────────────────────────────────────────────────────────────────

async function criarContas() {
  etapa("1. contas, perfis e status");
  for (const p of PESSOAS) {
    const sessao = await http("POST", "/auth/register", {
      corpo: { email: `${p.username}@${DOMINIO}`, username: p.username, password: SENHA },
    });
    c.u[p.chave] = { ...p, id: sessao.user.id, token: sessao.tokens.accessToken };
    await como(p.chave, "PATCH", "/users/me", {
      displayName: p.displayName,
      ...(p.sobre ? { aboutMe: p.sobre } : {}),
      ...(p.pronomes ? { pronouns: p.pronomes } : {}),
      ...(p.faixa ? { bannerColor: p.faixa } : {}),
    });
    if (p.manual) await como(p.chave, "PATCH", "/users/me/status", { manualStatus: p.manual });
    if (p.statusPersonalizado) {
      await como(p.chave, "PATCH", "/users/me/custom-status", {
        text: p.statusPersonalizado.texto,
        emoji: p.statusPersonalizado.emoji,
        duration: "never",
      });
    }
    console.log(`  ${p.username} (${p.displayName})`);
  }
}

async function criarAmizades() {
  etapa("2. amizades e pedidos");
  for (const a of AMIZADES) {
    const pedido = await como(a.de, "POST", "/friends/requests", { username: c.u[a.para].username });
    if (a.aceita) await como(a.para, "POST", `/friends/requests/${pedido.id}/accept`);
    console.log(`  ${c.u[a.de].username} → ${c.u[a.para].username}${a.aceita ? " (aceita)" : " (pendente)"}`);
  }
}

async function criarParidade() {
  etapa("3. servidor Paridade: categorias, canais, cargos e convite");
  const g = await como("dono", "POST", "/guilds", { name: "Paridade" });
  c.servidores.paridade = { id: g.id, nome: g.name, dono: "dono" };
  const geral = g.channels.find((ch) => ch.type === "TEXT");
  const vozGeral = g.channels.find((ch) => ch.type === "VOICE");
  c.canais.geral = { id: geral.id, nome: geral.name, tipo: "TEXT", servidor: "paridade" };
  c.canais["voz-geral"] = { id: vozGeral.id, nome: vozGeral.name, tipo: "VOICE", servidor: "paridade" };

  await como("dono", "PATCH", `/guilds/${g.id}`, {
    description: "Servidor-semente do passeio de paridade com o Discord.",
    bannerColor: "#9BE31F",
  });

  // as duas categorias padrão já existem (`categorias-padrao.ts`); a terceira
  // entra no topo pela reordenação
  const categorias = await como("dono", "GET", `/guilds/${g.id}/categories`);
  const texto = categorias.find((x) => x.name === "Canais de Texto");
  const voz = categorias.find((x) => x.name === "Canais de Voz");
  if (!texto || !voz) throw new Error("o servidor não nasceu com as duas categorias padrão");
  const info = await como("dono", "POST", `/guilds/${g.id}/categories`, { name: "Informações" });
  c.categorias = { info, texto, voz };
  await como("dono", "PATCH", `/guilds/${g.id}/channels/positions`, {
    categories: [
      { id: info.id, position: 0 },
      { id: texto.id, position: 1 },
      { id: voz.id, position: 2 },
    ],
  });

  for (const def of CANAIS) {
    const canal = await como("dono", "POST", `/guilds/${g.id}/channels`, {
      name: def.nome,
      type: def.tipo,
      categoryId: c.categorias[def.categoria].id,
      ...(def.readOnly ? { readOnly: true } : {}),
      ...(def.privado ? { isPrivate: true } : {}),
    });
    if (def.topico) await como("dono", "PATCH", `/guilds/${g.id}/channels/${canal.id}`, { topic: def.topico });
    c.canais[def.chave] = { id: canal.id, nome: canal.name, tipo: def.tipo, servidor: "paridade" };
  }
  await como("dono", "PATCH", `/guilds/${g.id}/channels/${geral.id}`, {
    topic: "Conversa geral do Paridade — seja gentil 💚",
  });
  // as entradas vão para #boas-vindas, e não para o #geral que o servidor
  // escolheu sozinho: oito "X entrou no servidor" no meio da conversa
  // empurrariam o markdown para fora da tela
  await como("dono", "PATCH", `/guilds/${g.id}/onboarding`, { systemChannelId: c.canais["boas-vindas"].id });

  for (const def of CARGOS) {
    const bits = Array.isArray(def.permissoes)
      ? def.permissoes.reduce((acc, nome) => acc | Permission[nome], 0)
      : def.permissoes;
    const cargo = await como("dono", "POST", `/guilds/${g.id}/roles`, {
      name: def.nome,
      color: def.cor,
      hoist: def.hoist,
      mentionable: def.mencionavel,
      permissions: bits,
    });
    c.cargos[def.chave] = { id: cargo.id, nome: cargo.name };
  }
  const cargos = await como("dono", "GET", `/guilds/${g.id}/roles`);
  const admin = cargos.find((r) => !r.isDefault && r.name === "Administrador");
  if (!admin) throw new Error("o servidor não nasceu com o cargo Administrador");
  await como("dono", "PATCH", `/guilds/${g.id}/roles/${admin.id}`, { color: "#E74C3C" });
  c.cargos.admin = { id: admin.id, nome: admin.name };
  // de baixo para cima, sem o @everyone: Administrador fica no topo
  await como("dono", "PATCH", `/guilds/${g.id}/roles/order`, {
    roleIds: [c.cargos.artistas.id, c.cargos.veteranos.id, c.cargos.moderacao.id, admin.id],
  });

  c.servidores.paridade.convite = await conviteLegivel("dono", g.id, "paridade");
}

async function conviteLegivel(chave, guildId, codigo) {
  const convite = await como(chave, "POST", `/guilds/${guildId}/invites`, { expiresInMinutes: 0 });
  await prisma.invite.update({ where: { code: convite.code }, data: { code: codigo } });
  return codigo;
}

async function entrarNoParidade() {
  etapa("4. membros entram pelo convite e ganham cargos");
  const g = c.servidores.paridade;
  entradas.set(`${g.id}:${c.u.dono.id}`, quando(ENTRADAS_PARIDADE.dono));
  for (const p of PESSOAS) {
    if (p.chave === "dono") continue;
    await como(p.chave, "POST", `/invites/${g.convite}/redeem`);
    entradas.set(`${g.id}:${c.u[p.chave].id}`, quando(ENTRADAS_PARIDADE[p.chave]));
  }
  for (const [chave, lista] of Object.entries(ATRIBUICOES)) {
    for (const cargo of lista) {
      await como("dono", "PUT", `/guilds/${g.id}/members/${c.u[chave].id}/roles/${c.cargos[cargo].id}`);
    }
  }
  const equipe = CANAIS.find((x) => x.chave === "equipe");
  for (const chave of equipe.membros) {
    await como("dono", "POST", `/guilds/${g.id}/channels/${c.canais.equipe.id}/members`, { userId: c.u[chave].id });
  }
}

async function criarOficina() {
  etapa("5. segundo servidor (Oficina), para a rail ter mais de um ícone");
  const g = await como("duda", "POST", "/guilds", { name: "Oficina" });
  c.servidores.oficina = { id: g.id, nome: g.name, dono: "duda" };
  const geral = g.channels.find((ch) => ch.type === "TEXT");
  c.canais["oficina-geral"] = { id: geral.id, nome: geral.name, tipo: "TEXT", servidor: "oficina" };
  c.servidores.oficina.convite = await conviteLegivel("duda", g.id, "oficina");
  entradas.set(`${g.id}:${c.u.duda.id}`, quando(ENTRADAS_OFICINA.duda));
  for (const chave of ["dono", "bia"]) {
    await como(chave, "POST", `/invites/oficina/redeem`);
    entradas.set(`${g.id}:${c.u[chave].id}`, quando(ENTRADAS_OFICINA[chave]));
  }
}

let tokenDoBot = null;
async function criarAplicativo() {
  etapa("6. aplicativo Pixel: instalação e comandos de barra");
  const criado = await como("dono", "POST", "/applications", { name: "Pixel" });
  tokenDoBot = criado.token.token;
  c.aplicativo = {
    id: criado.app.id,
    snowflake: criado.app.snowflake,
    nome: criado.app.name,
    botUserId: criado.app.botUser.id,
  };
  const g = c.servidores.paridade;
  await como("dono", "POST", `/guilds/${g.id}/aplicativos`, {
    applicationId: criado.app.id,
    permissions:
      Permission.VIEW_CHANNEL |
      Permission.SEND_MESSAGES |
      Permission.ADD_REACTIONS |
      Permission.ATTACH_FILES |
      Permission.CONNECT |
      Permission.SPEAK,
  });
  entradas.set(`${g.id}:${criado.app.botUser.id}`, quando(ENTRADA_DO_BOT));
  // globais: valem em todo servidor onde o app está instalado, e dispensam o
  // snowflake do servidor (que o DTO do Streamz não expõe)
  await http("PUT", `/v10/applications/${criado.app.snowflake}/commands`, {
    bot: tokenDoBot,
    corpo: COMANDOS_DO_BOT,
  });
}

async function criarConversas() {
  etapa("7. conversas diretas e grupo");
  const bia = await como("dono", "POST", "/dms", { userId: c.u.bia.id });
  const caio = await como("caio", "POST", "/dms", { userId: c.u.dono.id });
  const grupo = await como("dono", "POST", "/dms/group", {
    userIds: [c.u.bia.id, c.u.duda.id, c.u.enzo.id],
    name: "Equipe de design",
  });
  c.conversas = {
    bia: { id: bia.id, titulo: c.u.bia.displayName },
    caio: { id: caio.id, titulo: c.u.caio.displayName },
    grupo: { id: grupo.id, titulo: "Equipe de design" },
  };
}

async function conectarTodos() {
  etapa("8. conexões de WebSocket (as mensagens vão pelo gateway)");
  for (const p of PESSOAS) {
    // token novo: o socket só valida o JWT no handshake, e o do registro pode
    // estar perto dos 15 minutos se as etapas anteriores demoraram
    await entrarComo(p.chave);
    c.u[p.chave].sock = await conectar(p.chave);
  }
  // o `handleConnection` entra nas salas depois do connect do cliente
  await dormir(1_500);
}

async function criarAnexo(chave, tipo, k) {
  const def = ANEXOS[tipo];
  const anexo = await prisma.attachment.create({
    data: {
      uploaderId: c.u[chave].id,
      key: `paridade/${k}/${def.filename}`,
      filename: def.filename,
      contentType: def.contentType,
      size: def.size,
      width: def.width,
      height: def.height,
      externalUrl: `${WEB_PUBLICA}${def.caminho}`,
    },
  });
  return anexo.id;
}

/** Cria uma mensagem do roteiro (e o que ela carrega: anexo, citação, thread, enquete…). */
async function mensagemDoRoteiro(canalChave, item) {
  const canalId = c.canais[canalChave]?.id ?? c.conversas[canalChave]?.id;
  if (!canalId) throw new Error(`canal desconhecido no roteiro: ${canalChave}`);
  const d = quando(item.h);

  if (item.enquete) {
    const nonce = `paridade-${++sequencia}`;
    await garantirSala(item.a, canalId);
    const m = await comando(
      item.a,
      WS_EVENTS.POLL_CREATE,
      { channelId: canalId, question: item.enquete.pergunta, options: item.enquete.opcoes, nonce },
      { evento: WS_EVENTS.MESSAGE_NEW, filtro: (x) => x?.nonce === nonce },
    );
    registrar(item.k, m.id, d);
    for (const [quem, opcao] of Object.entries(item.enquete.votos)) {
      await garantirSala(quem, canalId);
      await comando(
        quem,
        WS_EVENTS.POLL_VOTE,
        { messageId: m.id, optionIndex: opcao },
        { evento: WS_EVENTS.POLL_UPDATED, filtro: (e) => e?.channelId === canalId },
      );
    }
    return m;
  }

  const texto = typeof item.t === "function" ? item.t(c) : item.t;
  const extras = {};
  if (item.anexos) extras.attachmentIds = await Promise.all(item.anexos.map((t) => criarAnexo(item.a, t, item.k)));
  if (item.responde) {
    extras.replyToId = c.mensagens[item.responde];
    extras.replyMention = true;
  }
  const m = await enviar(item.a, canalId, texto, extras);
  registrar(item.k, m.id, d);

  if (item.thread) {
    await como(item.a, "POST", `/channels/${canalId}/threads`, { messageId: m.id, name: item.thread.nome });
    threads.set(m.id, mais(d, 60));
    for (const r of item.thread.respostas) {
      const resposta = await enviar(r.a, canalId, r.t, { parentId: m.id });
      registrar(r.k, resposta.id, quando(r.h));
    }
  }
  if (item.editar) {
    await comando(
      item.a,
      WS_EVENTS.MESSAGE_EDIT,
      { messageId: m.id, content: item.editar.t },
      { evento: WS_EVENTS.MESSAGE_UPDATED, filtro: (x) => x?.id === m.id },
    );
    edicoes.set(m.id, quando(item.editar.h));
  }
  if (item.suprimir) await suprimirPrevia(m.id);
  if (item.fixar) {
    await como("dono", "POST", `/channels/${canalId}/pins/${m.id}`);
    fixacoes.set(m.id, quando(item.fixar.h));
  }
  return m;
}

/** "Remover prévia do link" pelo dono (moderação): o card de Open Graph depende da rede. */
async function suprimirPrevia(messageId) {
  await comando(
    "dono",
    WS_EVENTS.MESSAGE_SUPPRESS_EMBEDS,
    { messageId, suppress: true },
    { evento: WS_EVENTS.MESSAGE_UPDATED, filtro: (x) => x?.id === messageId },
  );
}

function registrar(k, id, d) {
  if (c.mensagens[k]) throw new Error(`chave de mensagem repetida no roteiro: ${k}`);
  c.mensagens[k] = id;
  datas.set(id, d);
}

async function escreverMensagens() {
  etapa("9. #geral: markdown, anexos, resposta, edição, fixada, thread e enquete");
  for (const item of ROTEIRO_GERAL) {
    await mensagemDoRoteiro("geral", item);
    process.stdout.write(".");
  }
  console.log();

  etapa("10. reações");
  for (const r of REACOES_GERAL) {
    const messageId = c.mensagens[r.k];
    for (const quem of r.por) {
      await garantirSala(quem, c.canais.geral.id);
      await comando(
        quem,
        WS_EVENTS.REACTION_ADD,
        { messageId, emoji: r.emoji },
        {
          evento: WS_EVENTS.REACTION_ADDED,
          filtro: (e) => e?.messageId === messageId && e?.userId === c.u[quem].id && e?.emoji === r.emoji,
        },
      );
    }
  }

  etapa("11. os outros canais do Paridade");
  for (const [canal, roteiro] of Object.entries(ROTEIROS_CANAIS)) {
    for (const item of roteiro) await mensagemDoRoteiro(canal, item);
  }

  etapa("12. mensagens do bot: embed rico, componentes e Components v2 (casca do Discord)");
  const bots = c.canais.bots;
  const linha = await prisma.channel.findUniqueOrThrow({ where: { id: bots.id }, select: { snowflake: true } });
  for (const item of MENSAGENS_DO_BOT) {
    const corpo = { ...item.corpo };
    if (item.anexoDoBot) {
      // em nome do usuário-bot, e solto: o `MessagesService` só vincula anexo do
      // próprio autor que ainda não está em mensagem nenhuma
      const anexo = await prisma.attachment.create({
        data: {
          uploaderId: c.aplicativo.botUserId,
          key: `paridade/${item.k}/${ANEXO_DO_BOT.filename}`,
          filename: ANEXO_DO_BOT.filename,
          contentType: ANEXO_DO_BOT.contentType,
          size: ANEXO_DO_BOT.size,
          width: ANEXO_DO_BOT.width,
          height: ANEXO_DO_BOT.height,
          externalUrl: `${WEB_PUBLICA}${ANEXO_DO_BOT.caminho}`,
        },
      });
      // `attachment_ids` é a extensão do Streamz (sem upload multipart na casca);
      // o `File` acha o anexo pelo nome, como o `attachment://` do Discord
      corpo.attachment_ids = [anexo.id];
    }
    // uma de cada vez: o eco da anterior já foi consumido quando esta escuta
    const eco = esperarEvento(
      c.u.dono.sock,
      WS_EVENTS.MESSAGE_NEW,
      (m) => m?.channelId === bots.id && m?.author?.id === c.aplicativo.botUserId,
    );
    await http("POST", `/v10/channels/${linha.snowflake.toString()}/messages`, { bot: tokenDoBot, corpo });
    const doBot = await eco;
    registrar(item.k, doBot.id, quando(item.h));
    // sem "remover prévia": o embed agora é guardado e desenhado, e suprimi-lo
    // (SUPPRESS_EMBEDS) o esconderia. O `content` não tem URL, então não há
    // prévia de link de rede para deixar a foto instável.
  }

  etapa("13. conversas diretas e o segundo servidor");
  for (const item of ROTEIRO_DM_BIA) await mensagemDoRoteiro("bia", item);
  for (const item of ROTEIRO_GRUPO) await mensagemDoRoteiro("grupo", item);
  for (const item of ROTEIRO_DM_CAIO) await mensagemDoRoteiro("caio", item);
  for (const item of ROTEIRO_OFICINA) await mensagemDoRoteiro("oficina-geral", item);
}

async function desconectarTodos() {
  for (const p of Object.values(c.u)) {
    if (!p.sock) continue;
    p.sock.fechando = true;
    p.sock.close();
    p.sock = undefined;
  }
  // o `markOffline` do gateway grava `lastSeenAt` no disconnect; a reescrita
  // das datas tem de vir depois dele
  await dormir(2_000);
}

// ── datas fixas (Prisma) ─────────────────────────────────────────────────────

async function fixarDatas() {
  etapa("14. datas fixas e estado de leitura (Prisma)");

  // mensagens do roteiro
  for (const [id, d] of datas) await prisma.message.update({ where: { id }, data: { createdAt: d } });
  for (const [id, d] of edicoes) await prisma.message.update({ where: { id }, data: { editedAt: d } });
  const ajustadas = new Set(datas.keys());

  // "X entrou no servidor": na hora em que X entrou
  const entradasDeSistema = await prisma.message.findMany({
    where: { type: "SYSTEM_JOIN" },
    select: { id: true, authorId: true, channel: { select: { guildId: true } } },
  });
  for (const m of entradasDeSistema) {
    const d = entradas.get(`${m.channel.guildId}:${m.authorId}`);
    if (!d) continue;
    await prisma.message.update({ where: { id: m.id }, data: { createdAt: d } });
    ajustadas.add(m.id);
  }

  // "X fixou uma mensagem" + a própria fixação
  for (const [alvo, d] of fixacoes) {
    await prisma.pinnedMessage.update({ where: { messageId: alvo }, data: { pinnedAt: d } });
    const narracoes = await prisma.message.findMany({
      where: { type: "SYSTEM_PIN", replyToId: alvo },
      select: { id: true },
    });
    for (const n of narracoes) {
      await prisma.message.update({ where: { id: n.id }, data: { createdAt: d } });
      ajustadas.add(n.id);
    }
  }

  // o que sobrou (narrações do grupo, entradas de quem não está no mapa): logo
  // antes da primeira mensagem conhecida do mesmo canal, na ordem em que
  // nasceram — ou às 08:00 do dia, se o canal não tem nenhuma
  const restantes = await prisma.message.findMany({
    where: { id: { notIn: [...ajustadas] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, channelId: true },
  });
  const porCanal = new Map();
  for (const m of restantes) porCanal.set(m.channelId, [...(porCanal.get(m.channelId) ?? []), m.id]);
  for (const [canalId, ids] of porCanal) {
    const primeira = await prisma.message.findFirst({
      where: { channelId: canalId, id: { in: [...ajustadas] } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    const base = primeira ? mais(primeira.createdAt, -60 * (ids.length + 1)) : quando("08:00");
    for (const [i, id] of ids.entries()) {
      await prisma.message.update({ where: { id }, data: { createdAt: mais(base, 60 * i) } });
    }
  }
  if (restantes.length) console.log(`  ${restantes.length} mensagem(ns) de sistema sem hora no roteiro → hora derivada`);

  // o que pende de uma mensagem acompanha a data dela
  for (const [raiz, d] of threads) await prisma.thread.update({ where: { id: raiz }, data: { createdAt: d } });
  const enquetes = await prisma.poll.findMany({ select: { id: true, messageId: true } });
  for (const p of enquetes) {
    const d = datas.get(p.messageId);
    if (!d) continue;
    await prisma.poll.update({ where: { id: p.id }, data: { createdAt: d } });
    const votos = await prisma.pollVote.findMany({ where: { pollId: p.id }, orderBy: { createdAt: "asc" } });
    for (const [i, v] of votos.entries()) {
      await prisma.pollVote.update({ where: { id: v.id }, data: { createdAt: mais(d, 120 + 60 * i) } });
    }
  }
  const anexos = await prisma.attachment.findMany({ where: { messageId: { not: null } } });
  for (const a of anexos) {
    const d = datas.get(a.messageId);
    if (d) await prisma.attachment.update({ where: { id: a.id }, data: { createdAt: d } });
  }

  // contas: criação, e-mail verificado (a rota exige o token do e-mail) e "visto por último"
  for (const p of PESSOAS) {
    const criado = quando(p.criadoEm);
    await prisma.user.update({
      where: { id: c.u[p.chave].id },
      data: {
        createdAt: criado,
        emailVerifiedAt: criado,
        lastSeenAt: quando(p.vistoEm ?? "2026-09-10T12:00"),
      },
    });
  }
  await prisma.user.update({
    where: { id: c.aplicativo.botUserId },
    data: { createdAt: quando(ENTRADA_DO_BOT), lastSeenAt: null },
  });
  await prisma.application.update({ where: { id: c.aplicativo.id }, data: { createdAt: quando(ENTRADA_DO_BOT) } });
  await prisma.botToken.updateMany({
    where: { applicationId: c.aplicativo.id },
    data: { createdAt: quando(ENTRADA_DO_BOT), lastUsedAt: quando(ENTRADA_DO_BOT) },
  });
  await prisma.applicationCommand.updateMany({
    where: { applicationId: c.aplicativo.id },
    data: { createdAt: quando(ENTRADA_DO_BOT) },
  });
  await prisma.guildApplication.updateMany({
    where: { applicationId: c.aplicativo.id },
    data: { createdAt: quando(ENTRADA_DO_BOT) },
  });

  // servidores, associações, canais, categorias, cargos, convites e auditoria
  const criacao = {
    [c.servidores.paridade.id]: quando(ENTRADAS_PARIDADE.dono),
    [c.servidores.oficina.id]: quando(ENTRADAS_OFICINA.duda),
  };
  for (const [guildId, d] of Object.entries(criacao)) {
    await prisma.guild.update({ where: { id: guildId }, data: { createdAt: d } });
    await prisma.role.updateMany({ where: { guildId }, data: { createdAt: d } });
    await prisma.category.updateMany({ where: { guildId }, data: { createdAt: d } });
    await prisma.invite.updateMany({ where: { guildId }, data: { createdAt: d } });
    const canais = await prisma.channel.findMany({ where: { guildId }, orderBy: { createdAt: "asc" } });
    for (const [i, canal] of canais.entries()) {
      await prisma.channel.update({ where: { id: canal.id }, data: { createdAt: mais(d, 60 * i) } });
    }
    const auditoria = await prisma.auditLog.findMany({ where: { guildId }, orderBy: { createdAt: "asc" } });
    for (const [i, linha] of auditoria.entries()) {
      await prisma.auditLog.update({ where: { id: linha.id }, data: { createdAt: mais(d, 30 * i) } });
    }
  }
  for (const [chaveComposta, d] of entradas) {
    const [guildId, userId] = chaveComposta.split(":");
    await prisma.guildMember.updateMany({ where: { guildId, userId }, data: { joinedAt: d } });
  }

  // conversas: nascem um minuto antes da primeira mensagem
  for (const conversa of Object.values(c.conversas)) {
    const primeira = await prisma.message.findFirst({
      where: { channelId: conversa.id },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    const d = mais(primeira?.createdAt ?? quando("08:00"), -60);
    await prisma.channel.update({ where: { id: conversa.id }, data: { createdAt: d } });
    await prisma.channelMember.updateMany({ where: { channelId: conversa.id }, data: { joinedAt: d } });
  }
  // allowlist do #equipe
  await prisma.channelMember.updateMany({
    where: { channelId: c.canais.equipe.id },
    data: { joinedAt: quando(ENTRADAS_PARIDADE.duda) },
  });

  for (const a of AMIZADES) {
    const [x, y] = [c.u[a.de].id, c.u[a.para].id].sort();
    await prisma.friendship.update({
      where: { pairKey: `${x}:${y}` },
      data: { createdAt: quando(a.em), acceptedAt: a.aceita ? mais(quando(a.em), 3600) : null },
    });
  }

  // O que o dono leu. Fica NÃO lido, de propósito: #aleatório (menção), o #geral
  // da Oficina (menção) e a conversa com o Caio. Todo o resto, lido às 18:00.
  const naoLidos = new Set([c.canais.aleatorio.id, c.canais["oficina-geral"].id, c.conversas.caio.id]);
  const lidos = [
    ...Object.values(c.canais).filter((x) => x.servidor === "paridade").map((x) => x.id),
    c.conversas.bia.id,
    c.conversas.grupo.id,
  ].filter((id) => !naoLidos.has(id));
  await prisma.readState.deleteMany({ where: { userId: c.u.dono.id } });
  await prisma.readState.createMany({
    data: lidos.map((channelId) => ({ userId: c.u.dono.id, channelId, lastReadAt: quando(LEITURA) })),
  });
}

/** Confere pela API, na visão do dono, o que as telas vão mostrar. */
async function conferir() {
  etapa("15. conferência (visão do dono)");
  await entrarComo("dono");
  const servidores = await como("dono", "GET", "/guilds");
  for (const s of servidores) {
    console.log(`  servidor ${s.name}: não lido=${s.unread} menções=${s.mentionCount}`);
  }
  const conversas = await como("dono", "GET", "/dms");
  for (const d of conversas) {
    const titulo = d.name ?? (d.others ?? []).map((o) => o.displayName ?? o.username).join(", ");
    console.log(`  conversa ${titulo}: não lidas=${d.unreadCount ?? "?"}`);
  }
  const amigos = await como("dono", "GET", "/friends");
  console.log(
    `  amigos=${amigos.friends.length} recebidos=${amigos.incoming.length} enviados=${amigos.outgoing?.length ?? "?"}`,
  );
}

function escreverManifesto() {
  const pessoa = (p) => ({
    id: p.id,
    username: p.username,
    senha: SENHA,
    displayName: p.displayName,
    presenca: p.presenca,
    conectar: Boolean(p.conectar),
    voz: p.voz ?? null,
    mudo: Boolean(p.mudo),
  });
  const manifesto = {
    aviso:
      "Gerado por scripts/paridade/semente.mjs. Contas e senhas são da bancada local; ids mudam a cada semeadura.",
    versao: 1,
    geradoEm: new Date().toISOString(),
    web: WEB_PUBLICA,
    dia: DIA,
    fuso: "America/Sao_Paulo",
    relogioSugerido: `${DIA}T18:30:00${FUSO}`,
    dono: pessoa(c.u.dono),
    usuarios: Object.fromEntries(
      PESSOAS.filter((p) => p.chave !== "dono").map((p) => [p.chave, pessoa(c.u[p.chave])]),
    ),
    servidores: c.servidores,
    canais: c.canais,
    cargos: c.cargos,
    conversas: c.conversas,
    // o token vai junto (a bancada é local, como as senhas acima): é com ele que
    // o bot figurante do `capturar.mjs` abre a sessão no gateway e responde às
    // interações com `respostas`
    aplicativo: { ...c.aplicativo, token: tokenDoBot, respostas: RESPOSTAS_DO_BOT },
    mensagens: c.mensagens,
  };
  mkdirSync(dirname(MANIFESTO), { recursive: true });
  writeFileSync(MANIFESTO, `${JSON.stringify(manifesto, null, 2)}\n`);
  console.log(`\n✔ manifesto: ${MANIFESTO}`);
}

// ── principal ───────────────────────────────────────────────────────────────

const prisma = new PrismaClient();

async function principal() {
  etapa("0. checagens");
  await http("GET", "/health");
  const jaExiste = await prisma.user.findUnique({ where: { username: "paridade" } });
  if (jaExiste) {
    console.error(
      "O banco já tem a conta `paridade`: esta semente só roda em banco novo.\n" +
        "Use `scripts/paridade/bancada.sh semear`, que recria o banco antes de semear.",
    );
    process.exitCode = 3;
    return;
  }

  await criarContas();
  await criarAmizades();
  await criarParidade();
  await entrarNoParidade();
  await criarOficina();
  await criarAplicativo();
  await criarConversas();
  await conectarTodos();
  await escreverMensagens();
  await desconectarTodos();
  await fixarDatas();
  await conferir();
  escreverManifesto();
}

principal()
  .catch((e) => {
    console.error(`\n✘ a semente falhou na etapa "${etapaAtual}":\n  ${e?.stack ?? e}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const p of Object.values(c.u)) {
      if (p.sock) {
        p.sock.fechando = true;
        p.sock.close();
      }
    }
    await prisma.$disconnect();
  });
