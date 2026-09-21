#!/usr/bin/env node
/**
 * Lê e aplica a **política de CORS do bucket R2** de anexos.
 *
 * ## Por que isto existe
 *
 * `StorageService.attachmentUrl` devolve uma **URL assinada do R2** (o bucket é
 * privado e `R2_PUBLIC_BASE_URL` está vazia em produção). Assinatura resolve
 * *autorização*; não resolve *CORS*. Mostrar a imagem num `<img>` funciona sem
 * CORS nenhum — o navegador desenha os bytes mas não os entrega a ninguém.
 * **Ler** os bytes por JavaScript (`fetch`/`canvas`, que é o que "Copiar
 * imagem" e "Salvar imagem" fazem em `apps/web/lib/imagem-arquivo.ts`) exige
 * que a resposta traga `Access-Control-Allow-Origin` com a nossa origem. Sem
 * política de CORS no bucket, o R2 não manda esse cabeçalho e as duas ações
 * morrem sempre no mesmo ponto.
 *
 * CORS **não é permissão de leitura**: o bucket continua privado e a URL
 * continua assinada e expirando. É só a permissão que o navegador exige para
 * entregar os bytes a um script da nossa origem. Ver `docs/R2-CORS.md`.
 *
 * ## Como rodar
 *
 * O `@aws-sdk/client-s3` não é dependência deste script: é a que a API já usa.
 * Por isso o módulo é resolvido a partir de `apps/api/node_modules` (mesmo
 * truque do `scripts/e2e-emojis-midia.mjs` com o Prisma), e basta ter rodado
 * `pnpm install` na raiz:
 *
 *     node scripts/r2-cors.mjs --ver         # imprime a política atual (não muda nada)
 *     node scripts/r2-cors.mjs --aplicar     # mostra o que mudaria e para, exigindo --sim
 *     node scripts/r2-cors.mjs --aplicar --sim
 *
 * Se o `node` da sua máquina não achar o pacote (instalação parcial, store do
 * pnpm noutro lugar), rode por dentro do workspace da api, que é onde a
 * dependência está declarada:
 *
 *     pnpm --filter @streamz/api exec node "$PWD/scripts/r2-cors.mjs" --ver
 *
 * ## Credencial: a da aplicação não basta
 *
 * `GetBucketCors`/`PutBucketCors` são operações de nível de **bucket**. O token
 * `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` que a API usa no dia a dia é
 * "Object Read & Write" — lê e grava objetos, e propositalmente não alcança
 * configuração de bucket (menor privilégio). Por isso este script aceita um
 * par **separado**, com precedência sobre o da aplicação:
 * `R2_ADMIN_ACCESS_KEY_ID` / `R2_ADMIN_SECRET_ACCESS_KEY` (e opcionalmente
 * `R2_ADMIN_ACCOUNT_ID`, caindo para `R2_ACCOUNT_ID` quando ausente). Crie um
 * token "Admin Read & Write" em Cloudflare → R2 → *Manage API Tokens* só para
 * rodar isto, use-o e revogue depois — não promova o token da aplicação a
 * admin para configurar CORS uma vez. Quem não quer gerar token nenhum tem o
 * caminho manual: `--json` imprime a política pronta para colar direto no
 * painel.
 *
 * ## Flags
 *
 *   --ver            (padrão) só lê: GetBucketCors e imprime.
 *   --aplicar        escreve: PutBucketCors com a política nova e relê para conferir.
 *   --sim            confirma o --aplicar sem prompt (o script recusa escrever sem ela).
 *   --json           não chama a Cloudflare: só imprime a política para colar no painel.
 *   --dev            soma `http://localhost:3000` às origens permitidas.
 *   --origens=a,b    lista explícita de origens (tem precedência sobre o ambiente).
 *   --bucket=nome    opera noutro bucket que não o `R2_BUCKET` (para ensaiar fora da produção).
 *   --ajuda          esta ajuda.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const RAIZ = resolve(import.meta.dirname, "..");

// ── Argumentos ───────────────────────────────────────────────
const argv = process.argv.slice(2);
const temFlag = (nome) => argv.includes(nome);
const valorDe = (nome) => {
  const pre = `${nome}=`;
  const achado = argv.find((a) => a.startsWith(pre));
  return achado ? achado.slice(pre.length) : undefined;
};

if (temFlag("--ajuda") || temFlag("-h")) {
  console.log(
    [
      "Uso: node scripts/r2-cors.mjs [--ver | --aplicar --sim | --json] [--dev]",
      "                              [--origens=a,b] [--bucket=nome]",
      "",
      "  --ver          (padrão) imprime a política de CORS atual do bucket, sem mudar nada.",
      "  --aplicar      grava a política nova; só escreve de fato com --sim.",
      "  --sim          confirma a escrita (sem ela o --aplicar mostra a diferença e para).",
      "  --json         não chama a Cloudflare: só imprime a política para colar no painel.",
      "  --dev          inclui http://localhost:3000 nas origens permitidas.",
      "  --origens=a,b  origens explícitas, separadas por vírgula.",
      "  --bucket=nome  opera noutro bucket que não o R2_BUCKET do ambiente.",
      "",
      "Credenciais vêm do ambiente ou do .env da raiz: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,",
      "R2_SECRET_ACCESS_KEY, R2_BUCKET — mas GetBucketCors/PutBucketCors são operação de",
      "BUCKET, fora do escopo \"Object Read & Write\" que a aplicação usa. Para --ver/--aplicar",
      "em produção, exporte um par à parte, com precedência sobre o da aplicação:",
      "R2_ADMIN_ACCESS_KEY_ID, R2_ADMIN_SECRET_ACCESS_KEY (e, se a conta for outra,",
      "R2_ADMIN_ACCOUNT_ID). Crie o token em Cloudflare → R2 → Manage API Tokens como",
      "\"Admin Read & Write\", use-o e revogue depois — ou use --json e dispense token novo.",
      "",
      "O porquê e a conferência depois de aplicar estão em docs/R2-CORS.md.",
    ].join("\n"),
  );
  process.exit(0);
}

const MODO_APLICAR = temFlag("--aplicar");
const CONFIRMADO = temFlag("--sim");
const INCLUIR_DEV = temFlag("--dev");

// ── .env da raiz ─────────────────────────────────────────────
/**
 * Carrega o `.env` da raiz na mão — o script não depende de `dotenv`, como o
 * resto de `scripts/`. O que já está no ambiente **vence** o arquivo: assim dá
 * para apontar para outra conta sem editar o `.env`.
 */
function carregarEnvDaRaiz() {
  let texto;
  try {
    texto = readFileSync(resolve(RAIZ, ".env"), "utf8");
  } catch {
    return; // sem .env: o ambiente que mande (contêiner, CI, shell)
  }
  for (const linha of texto.split("\n")) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith("#")) continue;
    const igual = limpa.indexOf("=");
    if (igual <= 0) continue;
    const chave = limpa.slice(0, igual).trim();
    if (process.env[chave] !== undefined) continue;
    process.env[chave] = limpa
      .slice(igual + 1)
      .trim()
      .replace(/^"(.*)"$/s, "$1")
      .replace(/^'(.*)'$/s, "$1");
  }
}
carregarEnvDaRaiz();

// ── Origens ──────────────────────────────────────────────────
/**
 * Origens do app de desktop. **Não são configuração**: são constantes do
 * Tauri 2 — o WebView2 (Windows/Android) serve o app de `http://tauri.localhost`
 * e o WebKit (macOS/iOS/Linux) de `tauri://localhost`. É a parte que todo mundo
 * esquece: liberar só `https://streamz.chat` conserta o site e deixa o app
 * instalado com o mesmo defeito. Mesma lista de `apps/api/src/common/cors.ts`.
 */
const ORIGENS_DO_DESKTOP = ["http://tauri.localhost", "tauri://localhost"];

/** Origem do site em produção — o padrão explícito quando nada mais diz. */
const ORIGEM_DO_SITE = "https://streamz.chat";

/** Origem do `pnpm dev`, só com `--dev`: o bucket de produção não precisa dela. */
const ORIGEM_DE_DEV = "http://localhost:3000";

const separarLista = (s) =>
  (s ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

/**
 * Precedência: `--origens` > `R2_CORS_ORIGINS` > `CORS_ORIGIN` (a mesma que a
 * API usa para o HTTP e o WebSocket — em produção as duas listas querem dizer
 * a mesma coisa) > o padrão embutido. As do desktop entram sempre.
 */
function origensPermitidas() {
  const base =
    separarLista(valorDe("--origens")).length > 0
      ? separarLista(valorDe("--origens"))
      : separarLista(process.env.R2_CORS_ORIGINS).length > 0
        ? separarLista(process.env.R2_CORS_ORIGINS)
        : separarLista(process.env.CORS_ORIGIN).length > 0
          ? separarLista(process.env.CORS_ORIGIN)
          : [ORIGEM_DO_SITE];
  const todas = [...base, ...ORIGENS_DO_DESKTOP];
  if (INCLUIR_DEV) todas.push(ORIGEM_DE_DEV);
  return [...new Set(todas)];
}

/**
 * A política que queremos.
 *
 * `GET`/`HEAD` e nada mais: o upload não passa pelo navegador — quem escreve no
 * bucket é a API (`POST /uploads`), com credencial de servidor. Liberar `PUT`
 * aqui não habilitaria nada que já não exista e ampliaria a superfície à toa.
 *
 * `AllowedHeaders`: `Range` não é cabeçalho de requisição da safelist do CORS,
 * então sem ele o *preflight* de um `fetch` com faixa (vídeo/áudio buscando um
 * pedaço) é barrado. `Authorization` e `Content-Type` entram porque um cliente
 * pode mandá-los; para a URL **assinada** o `Authorization` é inútil (a
 * assinatura vai na query, e mandar o cabeçalho junto quebraria a requisição),
 * mas listá-lo não custa nada e evita um preflight recusado por engano.
 *
 * `ExposeHeaders`: `Content-Length` e `Content-Type` já estão na safelist de
 * resposta (vão listados por clareza, não porque façam falta); quem precisa
 * mesmo da lista são `ETag`, `Content-Range` e `Accept-Ranges`, invisíveis ao
 * JavaScript sem ela.
 */
function politicaDesejada() {
  return [
    {
      AllowedOrigins: origensPermitidas(),
      AllowedMethods: ["GET", "HEAD"],
      AllowedHeaders: ["Range", "Authorization", "Content-Type"],
      ExposeHeaders: [
        "Content-Length",
        "Content-Type",
        "ETag",
        "Content-Range",
        "Accept-Ranges",
      ],
      // 1 h: o preflight deixa de repetir a cada leitura e uma correção de
      // política ainda chega ao usuário no mesmo dia.
      MaxAgeSeconds: 3600,
    },
  ];
}

// ── --json: caminho sem chamada nenhuma ─────────────────────
/**
 * Quem prefere não gerar token nenhum (nem o da aplicação, nem um admin) cola
 * isto direto em Cloudflare → R2 → bucket → Settings → CORS Policy. Não faz
 * requisição, não pede credencial — só monta a mesma política que `--aplicar`
 * gravaria, a partir das mesmas origens (`--origens`/`R2_CORS_ORIGINS`/
 * `CORS_ORIGIN`/padrão). É o caminho mais rápido quando é uma vez só.
 */
if (temFlag("--json")) {
  console.log(
    "// Cole em Cloudflare → R2 → <bucket> → Settings → CORS Policy.\n// Nenhuma chamada foi feita — isto não leu nem escreveu o bucket.",
  );
  console.log(JSON.stringify(politicaDesejada(), null, 2));
  process.exit(0);
}

// ── Credenciais ──────────────────────────────────────────────
/**
 * `GetBucketCors`/`PutBucketCors` são operação de **bucket**; o token que a
 * API usa em produção (`R2_ACCESS_KEY_ID`) é "Object Read & Write" — de
 * propósito, é o menor privilégio para o que a aplicação precisa no dia a dia,
 * e não alcança configuração de bucket. Por isso um par **separado**, com
 * precedência sobre o da aplicação: `R2_ADMIN_ACCESS_KEY_ID` /
 * `R2_ADMIN_SECRET_ACCESS_KEY` (e, se a conta admin for outra,
 * `R2_ADMIN_ACCOUNT_ID` — do contrário cai em `R2_ACCOUNT_ID`). A ideia é criar
 * um token "Admin Read & Write" em Cloudflare → R2 → Manage API Tokens só para
 * esta operação, usá-lo e revogá-lo depois — nunca promover o token da
 * aplicação a admin para configurar CORS uma vez.
 */
const TEM_ADMIN =
  !!process.env.R2_ADMIN_ACCESS_KEY_ID &&
  !!process.env.R2_ADMIN_SECRET_ACCESS_KEY;

const OBRIGATORIAS = TEM_ADMIN
  ? ["R2_ADMIN_ACCESS_KEY_ID", "R2_ADMIN_SECRET_ACCESS_KEY", "R2_BUCKET"]
  : ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"];
const faltando = OBRIGATORIAS.filter((n) => !process.env[n]);
if (faltando.length) {
  // Só o **nome** da variável aparece; valor de credencial não se imprime.
  console.error(
    `[r2-cors] faltam credenciais no ambiente/.env: ${faltando.join(", ")}`,
  );
  process.exit(1);
}

const ACCESS_KEY_ID = TEM_ADMIN
  ? process.env.R2_ADMIN_ACCESS_KEY_ID
  : process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = TEM_ADMIN
  ? process.env.R2_ADMIN_SECRET_ACCESS_KEY
  : process.env.R2_SECRET_ACCESS_KEY;

const BUCKET = valorDe("--bucket") ?? process.env.R2_BUCKET;
const CONTA = TEM_ADMIN
  ? process.env.R2_ADMIN_ACCOUNT_ID || process.env.R2_ACCOUNT_ID
  : process.env.R2_ACCOUNT_ID;
if (!CONTA) {
  console.error(
    "[r2-cors] falta o id da conta: defina R2_ADMIN_ACCOUNT_ID (ou R2_ACCOUNT_ID) no ambiente/.env.",
  );
  process.exit(1);
}
/** O id da conta aparece na URL do endpoint; no log vai mascarado. */
const CONTA_MASCARADA =
  "*".repeat(Math.max(0, CONTA.length - 4)) + CONTA.slice(-4);

/**
 * Erro que ensina em vez de só estourar `AccessDenied`: qual escopo falta,
 * onde criar o token certo, e a saída sem token nenhum (`--json`). Ver
 * `docs/R2-CORS.md`.
 */
function ehAccessDenied(e) {
  return (
    e?.name === "AccessDenied" ||
    e?.Code === "AccessDenied" ||
    e?.$metadata?.httpStatusCode === 403
  );
}

function erroDeCorsSemPermissao() {
  const linhas = TEM_ADMIN
    ? [
        "mesmo o token _ADMIN_ (R2_ADMIN_ACCESS_KEY_ID) tomou AccessDenied em",
        'GetBucketCors/PutBucketCors — confira se ele foi criado como "Admin Read &',
        'Write" (não "Object Read & Write") em Cloudflare → R2 → Manage API Tokens.',
        "",
        "Sem token novo: `node scripts/r2-cors.mjs --json` imprime a política pronta",
        "para colar em Cloudflare → R2 → bucket → Settings → CORS Policy.",
      ]
    : [
        'o token em uso (R2_ACCESS_KEY_ID) é de escopo de OBJETO ("Object Read &',
        'Write") — lê e grava arquivos, mas GetBucketCors/PutBucketCors são',
        "operações de BUCKET, fora do alcance desse escopo. Isto está certo: é o",
        "menor privilégio para o que a aplicação precisa no dia a dia.",
        "",
        "Para configurar CORS: Cloudflare → R2 → Manage API Tokens → crie um token",
        '"Admin Read & Write", exporte R2_ADMIN_ACCESS_KEY_ID e',
        "R2_ADMIN_SECRET_ACCESS_KEY com ele, e repita o comando (este script prefere",
        "as credenciais _ADMIN_ quando presentes). Revogue o token admin depois de usar.",
        "",
        "Sem token novo: `node scripts/r2-cors.mjs --json` imprime a política pronta",
        "para colar em Cloudflare → R2 → bucket → Settings → CORS Policy.",
      ];
  const erro = new Error(linhas.join("\n"));
  erro.name = "AccessDenied";
  return erro;
}

// ── Cliente S3 ───────────────────────────────────────────────
/**
 * `@aws-sdk/client-s3` vem do workspace da api, que já o declara — este script
 * não acrescenta dependência nenhuma ao repositório.
 */
function carregarClienteS3() {
  const require = createRequire(import.meta.url);
  const tentativas = [
    resolve(RAIZ, "apps/api/node_modules/@aws-sdk/client-s3"),
    "@aws-sdk/client-s3",
  ];
  for (const caminho of tentativas) {
    try {
      return require(caminho);
    } catch {
      /* tenta o próximo */
    }
  }
  throw new Error(
    "não achei @aws-sdk/client-s3. Rode `pnpm install` na raiz, ou chame este " +
      'script por dentro do workspace da api: pnpm --filter @streamz/api exec node "$PWD/scripts/r2-cors.mjs" --ver',
  );
}

const { S3Client, GetBucketCorsCommand, PutBucketCorsCommand } =
  carregarClienteS3();

const cliente = new S3Client({
  region: "auto", // o SDK exige; o R2 ignora
  endpoint: `https://${CONTA}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
  },
  // O R2 não implementa os cabeçalhos de checksum do `PutBucketCors`, e o SDK
  // v3 recente os manda por padrão. Versões antigas do SDK ignoram esta opção.
  requestChecksumCalculation: "WHEN_REQUIRED",
});

// ── Leitura / escrita da política ────────────────────────────
/** Política atual, ou `null` quando o bucket nunca teve uma. */
async function lerPolitica() {
  try {
    const saida = await cliente.send(
      new GetBucketCorsCommand({ Bucket: BUCKET }),
    );
    return saida.CORSRules ?? [];
  } catch (e) {
    // Bucket sem CORS responde `NoSuchCORSConfiguration`. O nome chega ora em
    // `name`, ora em `Code`, conforme a versão do SDK; um 404 genérico que fala
    // de CORS é o mesmo caso. Qualquer outro erro (bucket inexistente,
    // credencial sem permissão) tem de estourar.
    const nome = e?.name ?? e?.Code ?? "";
    if (nome === "NoSuchCORSConfiguration") return null;
    if (e?.$metadata?.httpStatusCode === 404 && /CORS/i.test(e?.message ?? ""))
      return null;
    if (ehAccessDenied(e)) throw erroDeCorsSemPermissao();
    throw e;
  }
}

const comoJson = (v) => JSON.stringify(v, null, 2);

/** Forma canônica de uma regra, para comparar sem depender de ordem. */
function canonica(regra) {
  const ordenado = {};
  for (const chave of Object.keys(regra).sort()) {
    const valor = regra[chave];
    ordenado[chave] = Array.isArray(valor) ? [...valor].sort() : valor;
  }
  return JSON.stringify(ordenado);
}

/**
 * `PutBucketCors` **substitui a configuração inteira** — não acrescenta regra.
 * Então antes de escrever o script mostra, item a item, o que some.
 */
function mostrarDiferenca(atual, nova) {
  console.log("── política atual ──");
  console.log(
    atual === null ? "(nenhuma — o bucket não tem CORS)" : comoJson(atual),
  );
  console.log("── política que será gravada ──");
  console.log(comoJson(nova));

  const novas = new Set(nova.map(canonica));
  const perdidas = (atual ?? []).filter((r) => !novas.has(canonica(r)));
  if (perdidas.length) {
    console.log(
      `\n[r2-cors] ATENÇÃO: ${perdidas.length} regra(s) existente(s) serão APAGADAS ` +
        "(PutBucketCors troca a configuração inteira):",
    );
    console.log(comoJson(perdidas));
    console.log(
      "Se alguma delas serve outro app, junte-a ao --origens antes de aplicar.",
    );
  } else if (atual !== null) {
    console.log("\n[r2-cors] nenhuma regra existente se perde nesta troca.");
  }
}

async function main() {
  console.log(
    `[r2-cors] bucket "${BUCKET}" na conta ${CONTA_MASCARADA} — modo ${MODO_APLICAR ? "APLICAR" : "VER"}` +
      ` — credencial ${TEM_ADMIN ? "admin (R2_ADMIN_*)" : "da aplicação (R2_*)"}`,
  );

  const atual = await lerPolitica();

  if (!MODO_APLICAR) {
    console.log("── política de CORS atual ──");
    console.log(
      atual === null
        ? "(nenhuma — o bucket não devolve Access-Control-Allow-Origin para ninguém)"
        : comoJson(atual),
    );
    console.log(
      "\n(modo leitura: nada foi alterado. Para gravar: --aplicar --sim)",
    );
    return;
  }

  const nova = politicaDesejada();
  mostrarDiferenca(atual, nova);

  if (!CONFIRMADO) {
    console.log(
      "\n[r2-cors] nada foi gravado. Confira a diferença acima e repita com --sim para aplicar.",
    );
    process.exitCode = 2;
    return;
  }

  try {
    await cliente.send(
      new PutBucketCorsCommand({
        Bucket: BUCKET,
        CORSConfiguration: { CORSRules: nova },
      }),
    );
  } catch (e) {
    if (ehAccessDenied(e)) throw erroDeCorsSemPermissao();
    throw e;
  }
  console.log("\n[r2-cors] gravado. Relendo do bucket para conferir…");

  const confirmada = await lerPolitica();
  console.log("── política de CORS depois de gravar ──");
  console.log(confirmada === null ? "(nenhuma?!)" : comoJson(confirmada));
  console.log(
    "\n[r2-cors] a propagação pode levar até ~30 s. Confira com o curl de docs/R2-CORS.md.",
  );
}

main().catch((e) => {
  // Mensagem do erro, sem despejar o objeto inteiro (ele carrega a requisição
  // assinada, e junto dela o id da conta e o cabeçalho de autorização).
  const bruta = `${e?.name ?? "Erro"}: ${e?.message ?? e}`;
  // O id da conta some do texto acima, mas o SDK também erra por DNS
  // (`getaddrinfo ENOTFOUND <conta>.r2.cloudflarestorage.com`) e aí o host
  // completo — com o id por extenso — vem dentro da própria mensagem. Mascara
  // aqui de novo, não só no log de abertura.
  const mascarada = CONTA ? bruta.split(CONTA).join(CONTA_MASCARADA) : bruta;
  console.error(`[r2-cors] falhou: ${mascarada}`);
  process.exit(1);
});
