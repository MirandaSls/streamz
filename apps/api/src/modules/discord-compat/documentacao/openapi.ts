import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_ATTACHMENT_SIZE,
  MAX_BULK_DELETE,
  MAX_MESSAGE_LENGTH,
  MAX_ROLE_NAME,
} from "@streamz/shared";

/**
 * A especificação **OpenAPI 3.1** da API compatível com o Discord.
 *
 * É o que a página de documentação do site renderiza, e é escrita **à mão**, a
 * partir da leitura dos controllers de `rest/`. Três motivos para não gerar por
 * decorator (`@nestjs/swagger`):
 *
 * 1. `modules/discord-compat` é uma **casca** (§3 do documento): ela não
 *    implementa regra de negócio, traduz. Encher os controllers de
 *    `@ApiProperty` acoplaria a casca à documentação e dobraria o tamanho de
 *    cada arquivo com metadado que não muda comportamento nenhum.
 *  2. Os corpos são validados por **zod** e não por DTO de `class-validator`
 *    (§5, o `ValidationPipe` global com `whitelist: true` comeria `embeds`,
 *    `components` e `flags`) — o gerador do Nest lê a classe do DTO, e aqui não
 *    há classe para ele ler. O que ele produziria seria um `Object` vazio.
 * 3. Dependência nova. A especificação é um objeto literal; o `tsc` já confere
 *    a forma dele contra os tipos abaixo.
 *
 * O preço é o óbvio: **rota nova aqui não aparece sozinha.** O
 * `openapi.spec.ts` ao lado é quem cobra — ele varre os `@Controller`/`@Get`/…
 * dos arquivos de `rest/` e falha quando um dos dois lados tem uma rota que o
 * outro não tem.
 *
 * As extensões `x-` carregam o que não cabe no vocabulário do OpenAPI e a
 * página precisa (os guias, a tabela de permissões, os eventos do gateway, os
 * exemplos em discord.js). Todas estão listadas no fim deste arquivo, em
 * `OPENAPI_COMPAT`, e o contrato delas é o que a página consome.
 *
 * Ver `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` §5 (REST), §6 (permissões),
 * §7 (gateway) e §9 (interações).
 */

// ── os tipos mínimos do OpenAPI ──────────────────────────────
//
// Escritos aqui, e não importados de um pacote de tipos: são ~60 linhas, e uma
// dependência a mais no `package.json` da API para documentar a API seria
// desproporcional. O que eles precisam fazer é impedir erro de digitação em
// `responses`/`schema` — e fazem.

/** Um schema JSON, no subconjunto que esta especificação usa. */
export interface Esquema {
  $ref?: string;
  type?: string | string[];
  format?: string;
  title?: string;
  description?: string;
  enum?: (string | number | null)[];
  const?: string | number;
  default?: unknown;
  examples?: unknown[];
  items?: Esquema;
  properties?: Record<string, Esquema>;
  required?: string[];
  additionalProperties?: boolean | Esquema;
  oneOf?: Esquema[];
  allOf?: Esquema[];
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  [extensao: `x-${string}`]: unknown;
}

/** O conteúdo de um corpo ou de uma resposta, por media type. */
export interface Conteudo {
  schema: Esquema;
  example?: unknown;
}

export interface ParametroOpenAPI {
  name: string;
  in: "path" | "query" | "header";
  required?: boolean;
  description: string;
  schema: Esquema;
  example?: unknown;
}

/** Um parâmetro, ou a referência a um dos reaproveitados em `components`. */
export type ParametroOuRef = ParametroOpenAPI | { $ref: string };

export interface CorpoDeRequisicao {
  required?: boolean;
  description?: string;
  content: Record<string, Conteudo>;
}

export interface RespostaOpenAPI {
  description: string;
  headers?: Record<string, { description: string; schema: Esquema }>;
  content?: Record<string, Conteudo>;
}

/** Uma resposta, ou a referência a uma das reaproveitadas em `components`. */
export type RespostaOuRef = RespostaOpenAPI | { $ref: string };

/** Um esquema de autenticação de `components.securitySchemes`. */
export interface EsquemaDeSeguranca {
  /** `apiKey`, `http`, … — aqui só há `apiKey`. */
  type: string;
  /** onde o valor viaja (`header`). */
  in?: string;
  /** o nome do cabeçalho (`Authorization`). */
  name?: string;
  description: string;
}

export interface OperacaoOpenAPI {
  operationId: string;
  tags: string[];
  summary: string;
  description: string;
  deprecated?: boolean;
  /** `[]` = rota pública (sem `Authorization`). Ausente = herda a global. */
  security?: Record<string, string[]>[];
  parameters?: ParametroOuRef[];
  requestBody?: CorpoDeRequisicao;
  responses: Record<string, RespostaOuRef>;
  [extensao: `x-${string}`]: unknown;
}

export interface CaminhoOpenAPI {
  summary?: string;
  description?: string;
  /** Os parâmetros de rota, declarados uma vez para todos os métodos. */
  parameters?: ParametroOuRef[];
  get?: OperacaoOpenAPI;
  put?: OperacaoOpenAPI;
  post?: OperacaoOpenAPI;
  patch?: OperacaoOpenAPI;
  delete?: OperacaoOpenAPI;
}

export interface DocumentoOpenAPI {
  openapi: string;
  info: {
    title: string;
    version: string;
    summary: string;
    description: string;
    contact?: { name: string; url?: string };
    license?: { name: string; identifier?: string };
  };
  servers: {
    url: string;
    description: string;
    variables?: Record<string, { default: string; enum?: string[]; description: string }>;
  }[];
  tags: { name: string; description: string }[];
  security: Record<string, string[]>[];
  paths: Record<string, CaminhoOpenAPI>;
  components: {
    securitySchemes: Record<string, EsquemaDeSeguranca>;
    parameters: Record<string, ParametroOpenAPI>;
    responses: Record<string, RespostaOpenAPI>;
    schemas: Record<string, Esquema>;
  };
  [extensao: `x-${string}`]: unknown;
}

// ── atalhos ──────────────────────────────────────────────────

/** `#/components/schemas/<nome>`. */
const ref = (nome: string): Esquema => ({ $ref: `#/components/schemas/${nome}` });

/** Uma lista de `<nome>`. */
const lista = (nome: string): Esquema => ({ type: "array", items: ref(nome) });

/** `application/json` com um schema e nada mais. */
const json = (schema: Esquema, descricao: string): RespostaOpenAPI => ({
  description: descricao,
  content: { "application/json": { schema } },
});

/** O 204 que o Discord devolve em toda rota que não tem o que dizer. */
const semConteudo = (descricao: string): RespostaOpenAPI => ({ description: descricao });

/** `#/components/responses/<nome>`. */
const erroRef = (nome: string): { $ref: string } => ({ $ref: `#/components/responses/${nome}` });

/** Um snowflake na rota. */
const naRota = (name: string, description: string): ParametroOpenAPI => ({
  name,
  in: "path",
  required: true,
  description,
  schema: ref("Snowflake"),
});

/** O conjunto de erros que **toda** rota autenticada pode devolver. */
const ERROS_COMUNS: Record<string, RespostaOuRef> = {
  "401": erroRef("NaoAutenticado"),
  "429": erroRef("LimiteExcedido"),
  "500": erroRef("ErroInterno"),
};

/**
 * A versão anunciada no `info`.
 *
 * `APP_VERSION` é a mesma variável que o `/health` publica (é a tag da imagem
 * no deploy); fora do contêiner ela não existe e "dev" é a resposta honesta.
 */
function versaoDaApi(): string {
  return process.env.APP_VERSION ?? "dev";
}

// ── os guias (x-guias) ───────────────────────────────────────

/** Um capítulo de texto corrido da página, em Markdown. */
export interface GuiaDaDocumentacao {
  /** âncora estável da página (`#primeiros-passos`). */
  id: string;
  titulo: string;
  /** uma linha, para o índice e para o card. */
  resumo: string;
  /** o texto, em Markdown (títulos a partir de `##`). */
  conteudo: string;
}

const GUIAS: GuiaDaDocumentacao[] = [
  {
    id: "primeiros-passos",
    titulo: "Primeiros passos",
    resumo:
      "Crie o aplicativo, copie o token e aponte a sua biblioteca favorita para cá — o código do bot não muda.",
    conteudo: `## O que isto é

A API de bots do Streamz fala o **mesmo protocolo do Discord**: as mesmas rotas,
os mesmos nomes de campo, os mesmos códigos de erro e o mesmo gateway
WebSocket. Um bot escrito com \`discord.js\`, \`discord.py\` ou qualquer
biblioteca que fale com \`discord.com\` roda aqui trocando **duas coisas**: a
URL base e o token.

## Os três passos

1. **Crie o aplicativo.** Entre no Streamz, abra as configurações e vá em
   *Desenvolvedor* → *Novo aplicativo*. Cada aplicativo nasce com um
   usuário-bot próprio.
2. **Gere o token.** No mesmo lugar, *Gerar token*. Ele aparece **uma vez** —
   guardamos apenas o SHA-256, então não há como mostrá-lo de novo; gerar outro
   revoga o anterior.
3. **Aponte a biblioteca para cá.** Em discord.js:

\`\`\`js
const { Client, GatewayIntentBits } = require("discord.js");

// as duas linhas que mudam
process.env.DISCORD_TOKEN = "<o seu token do Streamz>";
const client = new Client({
  rest: { api: "https://api.streamz.chat/api" },
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.once("ready", () => console.log("no ar como", client.user.tag));
client.on("messageCreate", (m) => { if (m.content === "!ping") m.reply("pong"); });
client.login(process.env.DISCORD_TOKEN);
\`\`\`

O \`rest.api\` é o único ajuste: a biblioteca descobre a URL do WebSocket
chamando \`GET /gateway/bot\` por esse mesmo REST, então **não existe** (nem é
preciso) uma opção separada para o gateway.

Em discord.py, o equivalente é sobrescrever \`discord.http.Route.BASE\` antes
de \`bot.run(...)\`.

## O que colocar o bot para dentro de um servidor

Um bot só enxerga servidor de que ele é **membro**. A instalação é feita pela
tela do Streamz (*Descobrir aplicativos*, ou o botão *Adicionar ao servidor* na
página do aplicativo) — não há o fluxo OAuth2 de autorização do Discord, porque
ele é uma página do \`discord.com\`, e aqui a página é a nossa.

## O que não vai funcionar, e por quê

Bots **públicos de terceiros** (MEE6, Dyno, Carl-bot, Groovy…) nunca vão
funcionar aqui, e isso não é limitação técnica nossa: esses bots são processos
rodando na infraestrutura de quem os fez, conectados ao gateway do Discord com
o token deles. Não há nada que o Streamz possa expor que faça o servidor da MEE6
abrir uma segunda conexão para cá. O que funciona é o bot que **você hospeda**:
o seu processo, o seu código, apontando para a nossa URL.`,
  },
  {
    id: "autenticacao",
    titulo: "Autenticação",
    resumo: "`Authorization: Bot <token>`, um token de três partes, guardado como SHA-256.",
    conteudo: `## O cabeçalho

Toda rota de \`/api/v10\` (com a exceção das duas de interação, abaixo) exige:

\`\`\`http
Authorization: Bot MTM4MjkxNTc3MDA1NzI0OTQ3Mg.aGVjNzUx.j3lQ_9d…
\`\`\`

O prefixo \`Bot \` é **obrigatório**. É ele que faz os dois esquemas de
autenticação do Streamz conviverem sem se pisarem: o app web usa
\`Authorization: Bearer <jwt>\` e continua intocado. Cabeçalho ausente, prefixo
errado, token desconhecido ou token revogado dão sempre a mesma resposta:

\`\`\`http
HTTP/1.1 401 Unauthorized
{"code": 0, "message": "401: Unauthorized"}
\`\`\`

401, nunca 403 — o \`TokenInvalid\` do discord.js nasce do 401, e um 403 no
lugar deixaria a biblioteca em retry cego.

## O formato do token

Três partes separadas por ponto, como o do Discord:

| Parte | Conteúdo | Tamanho |
|---|---|---|
| 1 | \`base64url\` do id decimal do usuário-bot | 24 ou 26 |
| 2 | \`base64url\` de 4 bytes do unix time da emissão | 6 |
| 3 | \`base64url\` de 32 bytes aleatórios | 43 |

Ninguém valida o formato (nem o Discord, nem as bibliotecas — o discord.js
loga com \`login("abc")\`). Ele é imitado porque **algumas ferramentas leem**:
o censurador de logs do discord.js corta no ponto, a Nostrum tem um caminho
rápido que casa o gabarito, e os scanners de segredo procuram exatamente esse
desenho. Manter o formato é grátis e evita uma classe inteira de surpresa.

## Como ele é guardado

Como **SHA-256**, não com argon2. O token é 256 bits de aleatório puro: não há
dicionário para atacar, e derivar uma senha a cada requisição de um bot de
música — que faz dezenas por minuto — seria um desastre de CPU sem ganho de
segurança. Consequência prática: **não dá para recuperar um token perdido**,
só gerar outro (o que revoga o anterior).

## As rotas sem token

\`POST /interactions/{id}/{token}/callback\` e as de
\`/webhooks/{application_id}/{token}\` **não** levam \`Authorization\`. É assim
no Discord — o \`@discordjs/rest\` manda o callback com \`auth: false\` —, e o
credencial ali é o token da interação, que vem no caminho e vale 15 minutos.`,
  },
  {
    id: "rate-limit",
    titulo: "Limites de requisição",
    resumo: "50 req/s por bot, com os cabeçalhos `X-RateLimit-*` que as bibliotecas já entendem.",
    conteudo: `## Os cabeçalhos

**Toda** resposta de \`/api/v10\` traz os cabeçalhos que o \`@discordjs/rest\`
usa para montar as filas por rota:

\`\`\`http
X-RateLimit-Limit: 50
X-RateLimit-Remaining: 47
X-RateLimit-Reset: 1789045123.482       # epoch em segundos, com fração
X-RateLimit-Reset-After: 0.518          # segundos até a janela zerar
X-RateLimit-Bucket: hQ2f8sJ1…           # string opaca, estável por rota+recurso
\`\`\`

O \`X-RateLimit-Bucket\` é usado pela biblioteca só como **chave** da fila que
ela mantém: rotas com o mesmo bucket esperam juntas. Ele é estável entre
reinícios e distingue rota + recurso maior (o canal, o servidor, o webhook).

## O 429

A contagem é **por aplicativo**, numa janela de 1 segundo, com teto de **50
requisições por segundo** — o mesmo do Discord. Estourando:

\`\`\`http
HTTP/1.1 429 Too Many Requests
Retry-After: 1
X-RateLimit-Scope: user
X-RateLimit-Remaining: 0

{"message": "You are being rate limited.", "retry_after": 0.734, "global": false}
\`\`\`

\`retry_after\` é **float em segundos** — nunca milissegundos. Se a sua
biblioteca dormir 734 segundos, ela está lendo o campo errado.

Note que o corpo do 429 **não tem \`code\`**: é o único erro da API em que isso
acontece, e é assim no Discord.

## O que ainda é de uma instância só

A contagem vive na memória do processo da API. Com mais de uma instância o teto
efetivo vira N × 50/s. Está registrado como dívida no código — e, por ora, a API
roda num contêiner só.`,
  },
  {
    id: "gateway",
    titulo: "Gateway (WebSocket)",
    resumo: "O protocolo cru do Discord em `/gateway`: HELLO, IDENTIFY, READY, heartbeat, RESUME.",
    conteudo: `## Onde ele fica

\`GET /api/v10/gateway/bot\` devolve a URL. A biblioteca acrescenta a query
(\`?v=10&encoding=json\`) sozinha. Não há opção de configuração separada: quem
troca o REST já trocou o gateway.

\`\`\`
bot                                          streamz
 │  GET /api/v10/gateway/bot  (Bot <token>)        │
 │ ───────────────────────────────────────────────►│
 │ ◄──── {"url":"wss://api.streamz.chat/gateway", "shards":1, …}
 │                                                 │
 │  WS CONNECT /gateway?v=10&encoding=json         │
 │ ───────────────────────────────────────────────►│
 │ ◄──── op 10 HELLO {"heartbeat_interval":41250}
 │  op 2 IDENTIFY {token, intents, properties, shard:[0,1]}
 │ ───────────────────────────────────────────────►│
 │ ◄──── op 11 HEARTBEAT_ACK  (a cada op 1 seu)
 │ ◄──── op 0 READY {v, user, guilds:[{id, unavailable:true}…], session_id,
 │                   resume_gateway_url, shard, application}
 │ ◄──── op 0 GUILD_CREATE  (um por servidor, completo)
\`\`\`

O \`READY\` sai com as guilds **indisponíveis** e o \`GUILD_CREATE\` completo
vem logo atrás: é exatamente isso que resolve a promessa de
\`client.once("ready")\` no discord.js.

## Heartbeat

O intervalo é ~41250 ms (o mesmo do Discord, para bot nenhum encostar num
relógio diferente do que já testou lá). O relógio é do **cliente**: quem manda
\`op 1\` é você, e respondemos \`op 11\`. Duas janelas sem \`op 1\` e a conexão
é considerada zumbi e fechada.

## RESUME

\`op 6 {token, session_id, seq}\` repõe os dispatches que você perdeu (os
últimos ~500, guardados por alguns minutos) e termina com \`RESUMED\`. Sessão
que já não existe leva \`op 9 INVALID_SESSION\` com \`d: false\`, e a
biblioteca reidentifica sozinha.

## Sharding

**Sempre um shard.** \`shards: 1\` no \`/gateway/bot\`, e um \`IDENTIFY\` com
\`shard: [n, m]\` e \`m > 1\` leva close **4010**. Um erro claro é melhor que um
bot metade conectado.

## Compressão e encoding

- \`compress=zlib-stream\` é suportado de verdade (deflate com
  \`Z_SYNC_FLUSH\`, um fluxo por conexão).
- \`compress=zstd-stream\`, \`compress: true\` no IDENTIFY, ou qualquer outro
  valor: respondemos **quadro de texto**, com um aviso no nosso log. Isso
  funciona porque as bibliotecas só descomprimem quando o quadro é binário.
- \`encoding=etf\`: **close 4000** com a razão. É o único caso estrito — ali não
  há resposta que o cliente entenda.

## Intents

O dispatch é filtrado pelos intents que você pediu no \`IDENTIFY\`, com uma
diferença declarada: **\`MESSAGE_CONTENT\` é sempre concedido** aqui. O campo
\`content\` vem preenchido mesmo sem ele — não existe verificação de bot nem
intent privilegiado no Streamz.

A lista completa de intents e de eventos está em \`x-intents\` e
\`x-eventos-gateway\` nesta especificação.`,
  },
  {
    id: "interacoes",
    titulo: "Interações e comandos de barra",
    resumo: "Chegam pelo gateway (`INTERACTION_CREATE`) — nunca por webhook HTTP.",
    conteudo: `## A diferença que importa

No Discord você pode receber interações por **webhook HTTP** (um endpoint seu,
com assinatura Ed25519) ou pelo gateway. **Aqui só existe o gateway.** Não há
"Interactions Endpoint URL" a configurar, e o campo \`verify_key\` do
aplicativo vem vazio de propósito: ele existe porque as bibliotecas o leem, mas
nada é assinado porque nada chega por HTTP.

Consequência prática: um bot que só sabe responder por webhook (alguns
frameworks serverless) **não funciona**. Um bot de gateway — que é o padrão de
discord.js e discord.py — funciona sem mudança.

## O ciclo

1. Você registra os comandos: \`PUT /applications/{id}/commands\` (global) ou
   \`PUT /applications/{id}/guilds/{gid}/commands\` (num servidor só). É o
   \`deploy-commands.js\` de todo tutorial, e ele é **idempotente**: o \`PUT\`
   sobrescreve o escopo inteiro.
2. Alguém digita \`/comando\` no Streamz. Você recebe \`INTERACTION_CREATE\`
   pelo gateway — **sem intent**, sempre.
3. Você tem **3 segundos** para o callback:
   \`POST /interactions/{id}/{token}/callback\`. Tipo 4 responde na hora; tipo 5
   mostra "pensando…" e te dá 15 minutos.
4. Depois disso, o token da interação vale 15 minutos nas rotas de
   \`/webhooks/{application_id}/{token}\`: \`editReply()\`, \`fetchReply()\`,
   \`deleteReply()\` e \`followUp()\`.

## Os tipos de callback implementados

| Tipo | Nome | O que faz |
|---|---|---|
| 4 | \`CHANNEL_MESSAGE_WITH_SOURCE\` | responde já |
| 5 | \`DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE\` | "pensando…" |
| 6 | \`DEFERRED_UPDATE_MESSAGE\` | reconhece o clique sem mexer na mensagem |
| 7 | \`UPDATE_MESSAGE\` | edita a mensagem do componente |
| 8 | \`APPLICATION_COMMAND_AUTOCOMPLETE_RESULT\` | sugestões |
| 9 | \`MODAL\` | abre um modal |

\`flags: 64\` (efêmera) é entregue de verdade: a resposta só aparece para quem
disparou a interação.

## O que ainda não existe

- **Subcomandos e grupos de subcomando** (opções de tipo 1 e 2): um comando que
  os declare é **recusado** com \`50035\`, em vez de subir pela metade. Um
  comando que aparece no compositor e não funciona é pior que um comando que o
  dono descobre que não subiu.
- **Menus de contexto** (comandos de tipo 2 \`USER\` e 3 \`MESSAGE\`): não há
  onde eles apareceriam na interface. Recusados com \`50035\`.
- \`PATCH /applications/{id}/commands/{cmd}\`: **501**. Use o \`PUT\` do escopo
  inteiro ou o \`POST\`, que atualiza o comando de mesmo nome.
- Followup por id (\`/webhooks/{app}/{token}/messages/{id}\` com um id de
  mensagem): **501**. \`@original\` funciona, e é o que \`editReply()\` e
  \`deleteReply()\` usam.`,
  },
  {
    id: "permissoes",
    titulo: "Permissões",
    resumo:
      "Os 21 bits do Streamz mapeiam um a um; dos bits do Discord que sobram, nove saem sempre ligadas e o resto, sempre apagado.",
    conteudo: `## A conta

O \`permissions\` que você lê num cargo é um **bitfield de 64 bits serializado
como string decimal** — exatamente como no Discord, e pelo mesmo motivo: acima
de 2^53 um \`number\` de JavaScript perde bits em silêncio.

Por dentro, o Streamz tem 21 permissões. A tradução é uma tabela fixa, nos dois
sentidos, e está inteira em \`x-tabela-permissoes\` nesta especificação.

## Os bits do Discord que não têm par

O Discord tem mais de cinquenta permissões; as que não encontram par aqui se
dividem em dois grupos, e a diferença é deliberada (as duas listas completas
estão em \`x-tabela-permissoes\`):

**Sempre ligadas** — a coisa simplesmente é permitida aqui, então apagar o bit
faria um bot bem-comportado desistir antes de tentar. É o caso de
\`READ_MESSAGE_HISTORY\`, \`EMBED_LINKS\`, \`USE_EXTERNAL_EMOJIS\`,
\`USE_APPLICATION_COMMANDS\`, \`USE_VAD\` e companhia: vários bots de música
checam \`READ_MESSAGE_HISTORY\` e \`EMBED_LINKS\` antes de responder, e o
\`@discordjs/voice\` checa \`CONNECT\`/\`SPEAK\`.

**Sempre apagadas** — a funcionalidade não existe no Streamz (threads, eventos,
automod, webhooks de canal, apelido por servidor…). Um bot que peça essas
permissões vê o bit zerado e sabe antes de tentar; tentando mesmo assim, ele
recebe 501 ou 50013.

## Na direção contrária

Quando **você** manda um bitfield (criar cargo, editar cargo), só os 21 bits com
par são considerados. O resto é descartado **em silêncio**: pedir
\`MANAGE_THREADS\` não é erro, simplesmente não concede nada, porque a coisa não
existe aqui.

## Cargo e hierarquia

Papel (dono/admin/membro) **não** decide o que alguém pode fazer — decide
*sobre quem* pode agir. Dar um cargo exige \`MANAGE_ROLES\` **e** que o cargo
alvo esteja estritamente abaixo do cargo mais alto do bot; sem essa segunda
regra, \`MANAGE_ROLES\` valeria \`ADMINISTRATOR\` em dois passos.`,
  },
  {
    id: "snowflakes",
    titulo: "Snowflakes",
    resumo: "Todo id é numérico, com o epoch do Discord — a data que a sua biblioteca deriva bate.",
    conteudo: `## O formato

Todo id que sai desta API é um **snowflake**: inteiro de 64 bits serializado
como string decimal, com o mesmo layout do Discord.

\`\`\`
 63                    22 21   17 16   12 11         0
+------------------------+-------+-------+------------+
|  ms desde 2015-01-01   | worker| proc  | incremento |
|        42 bits         | 5 bits| 5 bits|  12 bits   |
+------------------------+-------+-------+------------+
\`\`\`

O epoch é **o do Discord** (1420070400000), e não um epoch nosso. O motivo é
prático: \`SnowflakeUtil.timestampFrom(id)\` do discord.js e
\`discord.utils.snowflake_time()\` do discord.py alimentam \`message.createdAt\`.
Com um epoch diferente, toda mensagem do Streamz apareceria datada de 2015 no
log de qualquer bot.

## O que isso te dá de graça

- \`message.createdAt\` correto, sem ir à API.
- Paginação por id: \`before\`, \`after\` e \`around\` no histórico são
  snowflakes, e ordenar por id é ordenar por tempo.
- A regra dos 14 dias do \`bulk-delete\` é conferida **a partir do próprio id**,
  sem consultar o banco — é exatamente assim que o servidor do Discord valida.

## O limite honesto

4096 ids por milissegundo, o que também é o limite da monotonicidade. São 4
milhões de linhas por segundo: não é o regime deste banco.`,
  },
  {
    id: "voz",
    titulo: "Voz",
    resumo: "O caminho existe ponta a ponta; o áudio depende da ponte de voz estar no ar.",
    conteudo: `## Como entrar num canal

Pelo gateway, com \`op 4 VOICE_STATE_UPDATE\` — igual ao Discord. **Não há rota
REST de voz**; \`GET /guilds/{id}/voice-states/{uid}\` e
\`PATCH /guilds/{id}/voice-states/@me\` não existem aqui.

\`\`\`
bot → op 4 {guild_id, channel_id, self_mute, self_deaf}
  ├─ conferimos que o canal é de voz daquele servidor
  ├─ conferimos CONNECT e SPEAK
  ├─ VOICE_STATE_UPDATE   (com o session_id desta sessão)
  └─ VOICE_SERVER_UPDATE  {token, guild_id, endpoint}
\`\`\`

A ordem importa e não é decorativa: o \`@discordjs/voice\` guarda o pacote de
estado e é o de **servidor** que dispara a conexão. Invertendo, a biblioteca
tentaria conectar sem \`session_id\`.

\`channel_id: null\` é sair — só o \`VOICE_STATE_UPDATE\`, sem
\`VOICE_SERVER_UPDATE\` atrás.

## O estado de hoje, sem maquiagem

O protocolo de voz do Discord (WebSocket + UDP + AEAD) é falado por um serviço
separado, a **ponte de voz**, que repassa os quadros Opus para o LiveKit sem
transcodificar. O caminho está escrito e testado, mas **depende de infra que o
dono da instância precisa ligar**: um registro de DNS apontando para a ponte e
a porta UDP aberta no firewall.

Enquanto isso não estiver de pé nesta instância, um bot de música conecta,
registra os comandos, responde a tudo e **não emite som** — e o comando de
tocar responde "a voz ainda não está configurada neste servidor", de propósito,
em vez de falhar em silêncio.

Se \`op 4\` não achar o segredo da ponte ou as credenciais de mídia, ele
**falha cedo**: o bot nem entra no canal. Entrar e ficar mudo para sempre seria
pior — o dono do bot procuraria o defeito no lugar errado.`,
  },
  {
    id: "limitacoes",
    titulo: "O que não existe aqui",
    resumo: "A lista honesta das divergências em relação ao Discord, com o motivo de cada uma.",
    conteudo: `## Rotas que o Discord tem e nós não

| Rota | Situação |
|---|---|
| \`GET /guilds/{id}/members\` (listar membros) | não existe; use o \`GUILD_CREATE\`, que traz \`members[]\` inteiro |
| \`DELETE /guilds/{id}/roles/{rid}\` | não existe |
| \`PUT/DELETE /channels/{id}/permissions/{oid}\` | não existe |
| \`GET/PATCH /guilds/{id}/voice-states/…\` | não existe; voz é \`op 4\` do gateway |
| \`/oauth2/*\` além de \`/oauth2/applications/@me\` | não existe; a autorização é uma tela nossa |
| webhooks de canal (os que não são de interação) | não existem |
| threads, eventos agendados, automod, palco, stickers | não existem |

## Rotas que existem mas respondem 501

- \`PATCH /applications/{id}/commands/{cmd}\` e a versão por servidor.
- \`GET/PATCH/DELETE /webhooks/{app}/{token}/messages/{id}\` com um id que não
  seja \`@original\`.

Elas **existem** de propósito, em vez de caírem no 404 genérico: assim a sua
biblioteca recebe \`{"code": 20012, "message": "Not implemented: …"}\` e você
lê no log o que falta, em vez de um erro desconhecido.

## Divergências de comportamento

- **Banir** exige \`BAN_MEMBERS\` **e** \`MODERATE_MEMBERS\`. No Discord a
  primeira basta. Não duplicamos a regra de autorização para consertar a
  diferença — um segundo caminho de permissão é exatamente o que a arquitetura
  do Streamz proíbe. Na prática, o cargo de um bot de moderação tem as duas.
- **Só se bane quem é membro.** No Discord dá para banir um id qualquer; aqui a
  regra age sobre o membro, e quem não é membro leva \`10007\` em vez de um 204
  mentiroso.
- **\`nick\`** (apelido por servidor) não existe. Um \`PATCH\` de membro com
  \`nick\` preenchido leva \`50013\`; \`nick: null\` passa, porque limpar o que
  não existe é verdade.
- **\`mute\`/\`deaf\`/\`channel_id\`** num \`PATCH\` de membro são ignorados em
  silêncio: as bibliotecas os mandam juntos num \`edit()\` genérico, e recusar
  quebraria um pedido que só queria mexer nos cargos.
- **\`GET /guilds/{id}/bans\` não pagina.** O \`guild.bans.fetch()\` sem cursor
  lê a lista inteira, que é o caso de todo bot que a usa.
- **Avatares são sempre \`null\`.** Não servimos CDN no formato do Discord; o
  campo existe porque as bibliotecas o leem.
- **\`discriminator\` é sempre \`"0"\`**, como no Discord de hoje.
- Servidor de que o bot não participa responde \`10004 Unknown Guild\`, nunca
  403 — não confirmamos a existência de um servidor que não é da conta dele.
- **Status de sucesso.** Alguns \`POST\` devolvem **201** onde o Discord
  devolve 200 (escrever mensagem, criar cargo, abrir conversa, criar comando).
  Nenhuma biblioteca distingue — todas tratam 2xx como sucesso —, e inventar um
  status só para igualar seria mentir sobre o que o servidor faz.`,
  },
];

// ── a tabela de permissões (x-tabela-permissoes) ─────────────

/**
 * A tradução do §6 (D8), na forma que a página renderiza.
 *
 * Os números vêm da mesma tabela que `@streamz/shared` implementa em
 * `permissoes-discord.ts`; aqui eles são **texto para humanos**, não a
 * implementação — quem traduz de verdade é `paraBitfieldDoDiscord`.
 */
const TABELA_DE_PERMISSOES = {
  pares: [
    { streamz: "VIEW_CHANNEL", bitStreamz: 0, discord: "VIEW_CHANNEL", bitDiscord: 10 },
    { streamz: "SEND_MESSAGES", bitStreamz: 1, discord: "SEND_MESSAGES", bitDiscord: 11 },
    { streamz: "MANAGE_MESSAGES", bitStreamz: 2, discord: "MANAGE_MESSAGES", bitDiscord: 13 },
    { streamz: "MANAGE_CHANNELS", bitStreamz: 3, discord: "MANAGE_CHANNELS", bitDiscord: 4 },
    { streamz: "MANAGE_ROLES", bitStreamz: 4, discord: "MANAGE_ROLES", bitDiscord: 28 },
    { streamz: "KICK_MEMBERS", bitStreamz: 5, discord: "KICK_MEMBERS", bitDiscord: 1 },
    { streamz: "BAN_MEMBERS", bitStreamz: 6, discord: "BAN_MEMBERS", bitDiscord: 2 },
    { streamz: "MANAGE_GUILD", bitStreamz: 7, discord: "MANAGE_GUILD", bitDiscord: 5 },
    { streamz: "CREATE_INVITE", bitStreamz: 8, discord: "CREATE_INSTANT_INVITE", bitDiscord: 0 },
    { streamz: "ATTACH_FILES", bitStreamz: 9, discord: "ATTACH_FILES", bitDiscord: 15 },
    { streamz: "ADD_REACTIONS", bitStreamz: 10, discord: "ADD_REACTIONS", bitDiscord: 6 },
    { streamz: "MENTION_EVERYONE", bitStreamz: 11, discord: "MENTION_EVERYONE", bitDiscord: 17 },
    { streamz: "CONNECT", bitStreamz: 12, discord: "CONNECT", bitDiscord: 20 },
    { streamz: "SPEAK", bitStreamz: 13, discord: "SPEAK", bitDiscord: 21 },
    { streamz: "MUTE_MEMBERS", bitStreamz: 14, discord: "MUTE_MEMBERS", bitDiscord: 22 },
    { streamz: "MODERATE_MEMBERS", bitStreamz: 15, discord: "MODERATE_MEMBERS", bitDiscord: 40 },
    { streamz: "MANAGE_EMOJIS", bitStreamz: 16, discord: "MANAGE_GUILD_EXPRESSIONS", bitDiscord: 30 },
    { streamz: "VIEW_AUDIT_LOG", bitStreamz: 17, discord: "VIEW_AUDIT_LOG", bitDiscord: 7 },
    { streamz: "ADMINISTRATOR", bitStreamz: 18, discord: "ADMINISTRATOR", bitDiscord: 3 },
    { streamz: "MOVE_MEMBERS", bitStreamz: 19, discord: "MOVE_MEMBERS", bitDiscord: 24 },
    { streamz: "STREAM", bitStreamz: 20, discord: "STREAM", bitDiscord: 9 },
  ],
  sempreConcedidas: [
    { discord: "READ_MESSAGE_HISTORY", bitDiscord: 16, porque: "todo mundo lê o histórico de um canal que já pode ver" },
    { discord: "EMBED_LINKS", bitDiscord: 14, porque: "embeds são parte da mensagem, não uma permissão à parte" },
    { discord: "USE_EXTERNAL_EMOJIS", bitDiscord: 18, porque: "não há restrição de emoji externo" },
    { discord: "USE_EXTERNAL_STICKERS", bitDiscord: 37, porque: "idem, para figurinhas" },
    { discord: "USE_APPLICATION_COMMANDS", bitDiscord: 31, porque: "quem vê o canal usa os comandos dele" },
    { discord: "USE_VAD", bitDiscord: 25, porque: "detecção de voz é escolha do cliente" },
    { discord: "CHANGE_NICKNAME", bitDiscord: 26, porque: "o nome de exibição é global e o próprio dono muda" },
    { discord: "SEND_POLLS", bitDiscord: 49, porque: "derivada de SEND_MESSAGES" },
    { discord: "USE_SOUNDBOARD", bitDiscord: 42, porque: "o soundboard existe e é aberto" },
  ],
  sempreApagadas: [
    "PRIORITY_SPEAKER",
    "DEAFEN_MEMBERS",
    "MANAGE_NICKNAMES",
    "MANAGE_WEBHOOKS",
    "VIEW_GUILD_INSIGHTS",
    "REQUEST_TO_SPEAK",
    "MANAGE_EVENTS",
    "CREATE_EVENTS",
    "MANAGE_THREADS",
    "CREATE_PUBLIC_THREADS",
    "CREATE_PRIVATE_THREADS",
    "SEND_MESSAGES_IN_THREADS",
    "USE_EMBEDDED_ACTIVITIES",
    "VIEW_CREATOR_MONETIZATION_ANALYTICS",
    "CREATE_GUILD_EXPRESSIONS",
    "USE_EXTERNAL_SOUNDS",
    "SEND_VOICE_MESSAGES",
    "SET_VOICE_CHANNEL_STATUS",
    "USE_EXTERNAL_APPS",
    "PIN_MESSAGES",
    "BYPASS_SLOWMODE",
    "SEND_TTS_MESSAGES",
    "AUTO_MODERATION_CONFIGURATION",
    "AUTO_MODERATION_EXECUTION",
  ],
  nota:
    "As 'sempre apagadas' são as funcionalidades que o Streamz não tem. O bit " +
    "zerado é a resposta honesta: um bot que o lê desiste antes de tentar, em " +
    "vez de tomar 501 no meio de um fluxo.",
};

// ── gateway: intents, opcodes, eventos e closes ──────────────

const INTENTS_DOCUMENTADOS = [
  { nome: "GUILDS", bit: 0, valor: 1, eventos: ["GUILD_CREATE", "GUILD_DELETE", "CHANNEL_CREATE", "CHANNEL_UPDATE", "CHANNEL_DELETE", "GUILD_ROLE_CREATE", "GUILD_ROLE_UPDATE", "GUILD_ROLE_DELETE"] },
  { nome: "GUILD_MEMBERS", bit: 1, valor: 2, eventos: ["GUILD_MEMBER_ADD", "GUILD_MEMBER_UPDATE", "GUILD_MEMBER_REMOVE"] },
  { nome: "GUILD_MODERATION", bit: 2, valor: 4, eventos: [] },
  { nome: "GUILD_EXPRESSIONS", bit: 3, valor: 8, eventos: [] },
  { nome: "GUILD_VOICE_STATES", bit: 7, valor: 128, eventos: ["VOICE_STATE_UPDATE"] },
  { nome: "GUILD_PRESENCES", bit: 8, valor: 256, eventos: [] },
  { nome: "GUILD_MESSAGES", bit: 9, valor: 512, eventos: ["MESSAGE_CREATE", "MESSAGE_UPDATE", "MESSAGE_DELETE"] },
  { nome: "GUILD_MESSAGE_REACTIONS", bit: 10, valor: 1024, eventos: ["MESSAGE_REACTION_ADD", "MESSAGE_REACTION_REMOVE", "MESSAGE_REACTION_REMOVE_ALL", "MESSAGE_REACTION_REMOVE_EMOJI"] },
  { nome: "GUILD_MESSAGE_TYPING", bit: 11, valor: 2048, eventos: ["TYPING_START"] },
  { nome: "DIRECT_MESSAGES", bit: 12, valor: 4096, eventos: ["MESSAGE_CREATE", "MESSAGE_UPDATE", "MESSAGE_DELETE"] },
  { nome: "DIRECT_MESSAGE_REACTIONS", bit: 13, valor: 8192, eventos: ["MESSAGE_REACTION_ADD", "MESSAGE_REACTION_REMOVE", "MESSAGE_REACTION_REMOVE_ALL", "MESSAGE_REACTION_REMOVE_EMOJI"] },
  { nome: "DIRECT_MESSAGE_TYPING", bit: 14, valor: 16384, eventos: ["TYPING_START"] },
  {
    nome: "MESSAGE_CONTENT",
    bit: 15,
    valor: 32768,
    eventos: [],
    nota: "aceito e ignorado: o `content` vem preenchido com ou sem ele. Não há intent privilegiado no Streamz.",
  },
];

const OPCODES_DOCUMENTADOS = [
  { codigo: 0, nome: "DISPATCH", direcao: "servidor → bot", suporte: "sim" },
  { codigo: 1, nome: "HEARTBEAT", direcao: "ambos", suporte: "sim" },
  { codigo: 2, nome: "IDENTIFY", direcao: "bot → servidor", suporte: "sim" },
  { codigo: 3, nome: "PRESENCE_UPDATE", direcao: "bot → servidor", suporte: "aceito e ignorado" },
  { codigo: 4, nome: "VOICE_STATE_UPDATE", direcao: "bot → servidor", suporte: "sim — é a porta de entrada da voz" },
  { codigo: 6, nome: "RESUME", direcao: "bot → servidor", suporte: "sim" },
  { codigo: 7, nome: "RECONNECT", direcao: "servidor → bot", suporte: "sim" },
  { codigo: 8, nome: "REQUEST_GUILD_MEMBERS", direcao: "bot → servidor", suporte: "não — o GUILD_CREATE já traz todos os membros" },
  { codigo: 9, nome: "INVALID_SESSION", direcao: "servidor → bot", suporte: "sim" },
  { codigo: 10, nome: "HELLO", direcao: "servidor → bot", suporte: "sim" },
  { codigo: 11, nome: "HEARTBEAT_ACK", direcao: "servidor → bot", suporte: "sim" },
];

const EVENTOS_DO_GATEWAY = [
  { nome: "READY", intent: null, quando: "logo depois do IDENTIFY aceito; as guilds vêm como `{id, unavailable: true}`." },
  { nome: "RESUMED", intent: null, quando: "depois de um `op 6` aceito, no fim do replay." },
  { nome: "GUILD_CREATE", intent: "GUILDS", quando: "o bot entrou num servidor (ou está conectando). Payload gordo: cargos, canais, categorias, membros, estados de voz.", payload: { $ref: "#/components/schemas/Servidor" } },
  { nome: "GUILD_DELETE", intent: "GUILDS", quando: "o bot foi removido do servidor. `unavailable: false`, que é o que diz 'você saiu' em vez de 'o servidor caiu'." },
  { nome: "CHANNEL_CREATE", intent: "GUILDS", quando: "canal criado onde o bot enxerga.", payload: { $ref: "#/components/schemas/Canal" } },
  { nome: "CHANNEL_UPDATE", intent: "GUILDS", quando: "canal renomeado, movido ou com tópico/slowmode alterado." },
  { nome: "CHANNEL_DELETE", intent: "GUILDS", quando: "canal apagado." },
  { nome: "GUILD_ROLE_CREATE", intent: "GUILDS", quando: "cargo criado.", payload: { $ref: "#/components/schemas/Cargo" } },
  { nome: "GUILD_ROLE_UPDATE", intent: "GUILDS", quando: "cargo editado (nome, cor, permissões, posição)." },
  { nome: "GUILD_ROLE_DELETE", intent: "GUILDS", quando: "cargo apagado." },
  { nome: "GUILD_MEMBER_ADD", intent: "GUILD_MEMBERS", quando: "alguém entrou no servidor.", payload: { $ref: "#/components/schemas/Membro" } },
  { nome: "GUILD_MEMBER_UPDATE", intent: "GUILD_MEMBERS", quando: "cargos ou castigo do membro mudaram." },
  { nome: "GUILD_MEMBER_REMOVE", intent: "GUILD_MEMBERS", quando: "saiu, foi expulso ou banido." },
  { nome: "MESSAGE_CREATE", intent: "GUILD_MESSAGES / DIRECT_MESSAGES", quando: "mensagem nova num canal que o bot vê. Inclui as do próprio bot — como no Discord; filtre por `author.bot`.", payload: { $ref: "#/components/schemas/Mensagem" } },
  { nome: "MESSAGE_UPDATE", intent: "GUILD_MESSAGES / DIRECT_MESSAGES", quando: "mensagem **editada**. Reação não gera mais MESSAGE_UPDATE." },
  { nome: "MESSAGE_DELETE", intent: "GUILD_MESSAGES / DIRECT_MESSAGES", quando: "mensagem apagada." },
  { nome: "MESSAGE_REACTION_ADD", intent: "GUILD_MESSAGE_REACTIONS / DIRECT_MESSAGE_REACTIONS", quando: "alguém reagiu. Traz `user_id`, `emoji` e `message_id`." },
  { nome: "MESSAGE_REACTION_REMOVE", intent: "GUILD_MESSAGE_REACTIONS / DIRECT_MESSAGE_REACTIONS", quando: "alguém tirou a reação." },
  { nome: "MESSAGE_REACTION_REMOVE_ALL", intent: "GUILD_MESSAGE_REACTIONS / DIRECT_MESSAGE_REACTIONS", quando: "todas as reações da mensagem foram limpas." },
  { nome: "MESSAGE_REACTION_REMOVE_EMOJI", intent: "GUILD_MESSAGE_REACTIONS / DIRECT_MESSAGE_REACTIONS", quando: "as reações de um emoji só foram limpas." },
  { nome: "TYPING_START", intent: "GUILD_MESSAGE_TYPING / DIRECT_MESSAGE_TYPING", quando: "alguém começou a digitar." },
  { nome: "VOICE_STATE_UPDATE", intent: "GUILD_VOICE_STATES", quando: "alguém entrou, saiu ou mudou o estado numa sala de voz." },
  { nome: "VOICE_SERVER_UPDATE", intent: null, quando: "logo depois do VOICE_STATE_UPDATE do próprio bot, ao entrar numa sala. Traz `{token, guild_id, endpoint}` da ponte de voz." },
  { nome: "INTERACTION_CREATE", intent: null, quando: "comando de barra, clique em componente, autocomplete ou envio de modal. **Nunca** filtrado por intent.", payload: { $ref: "#/components/schemas/Interacao" } },
];

const FECHAMENTOS_DOCUMENTADOS = [
  { codigo: 4000, nome: "Unknown error", quando: "`encoding=etf` — o único encoding que recusamos.", reconecta: true },
  { codigo: 4001, nome: "Unknown opcode", quando: "opcode que não existe no protocolo.", reconecta: true },
  { codigo: 4002, nome: "Decode error", quando: "quadro que não é JSON, ou `d` com a forma errada.", reconecta: true },
  { codigo: 4003, nome: "Not authenticated", quando: "qualquer op antes do IDENTIFY.", reconecta: true },
  { codigo: 4004, nome: "Authentication failed", quando: "IDENTIFY sem token, ou com token que não vale.", reconecta: false },
  { codigo: 4005, nome: "Already authenticated", quando: "um segundo IDENTIFY na mesma conexão.", reconecta: true },
  { codigo: 4007, nome: "Invalid seq", quando: "RESUME com `seq` que não é um inteiro não negativo.", reconecta: true },
  { codigo: 4008, nome: "Rate limited", quando: "quadros demais na mesma conexão.", reconecta: true },
  { codigo: 4009, nome: "Session timed out", quando: "a sessão expirou e não dá para retomar.", reconecta: true },
  { codigo: 4010, nome: "Invalid shard", quando: "`shard: [n, m]` com `m > 1`. **O Streamz opera com um shard, ponto.**", reconecta: false },
  { codigo: 4013, nome: "Invalid intents", quando: "`intents` ausente ou que não é inteiro não negativo.", reconecta: false },
];

/** Os códigos de erro do corpo, que é por onde as bibliotecas classificam. */
const CODIGOS_DE_ERRO = [
  { code: 0, http: 401, nome: "Unauthorized", quando: "token ausente, mal formado, desconhecido ou revogado." },
  { code: 10003, http: 404, nome: "Unknown Channel", quando: "o canal não existe, ou o bot não pode vê-lo." },
  { code: 10004, http: 404, nome: "Unknown Guild", quando: "o servidor não existe **ou o bot não é membro dele**." },
  { code: 10007, http: 404, nome: "Unknown Member", quando: "a pessoa não é membro daquele servidor." },
  { code: 10008, http: 404, nome: "Unknown Message", quando: "a mensagem não existe, ou não é daquele canal." },
  { code: 10011, http: 404, nome: "Unknown Role", quando: "o cargo não é daquele servidor." },
  { code: 10013, http: 404, nome: "Unknown User", quando: "o usuário não existe." },
  { code: 10014, http: 404, nome: "Unknown Emoji", quando: "emoji personalizado que não é deste Streamz (copiar um id do Discord é o caso comum)." },
  { code: 10026, http: 404, nome: "Unknown Ban", quando: "desbanir quem não está banido." },
  { code: 10062, http: 404, nome: "Unknown interaction", quando: "token de interação inexistente, vencido (>15 min) ou apresentado com o id/aplicativo errado." },
  { code: 10063, http: 404, nome: "Unknown application command", quando: "o comando não existe naquele escopo." },
  { code: 20012, http: 501, nome: "Not implemented", quando: "a rota existe mas a funcionalidade ainda não. A mensagem diz o que falta." },
  { code: 40060, http: 400, nome: "Interaction has already been acknowledged", quando: "segundo callback na mesma interação." },
  { code: 50001, http: 403, nome: "Missing Access", quando: "o token é de outro aplicativo, ou o bot não está no servidor do comando." },
  { code: 50013, http: 403, nome: "Missing Permissions", quando: "falta o bit de permissão, ou a hierarquia de cargo não permite." },
  { code: 50028, http: 400, nome: "Invalid Role", quando: "cargo que não se atribui à mão (o `@everyone`)." },
  { code: 50034, http: 400, nome: "Message too old", quando: "`bulk-delete` com mensagem de mais de 14 dias." },
  { code: 50035, http: 400, nome: "Invalid Form Body", quando: "corpo inválido. Vem com `errors`, o detalhe por campo." },
  { code: 50109, http: 400, nome: "Invalid JSON", quando: "`payload_json` de um multipart que não é um objeto JSON." },
];

// ── components.schemas ───────────────────────────────────────

const ESQUEMAS: Record<string, Esquema> = {
  Snowflake: {
    type: "string",
    pattern: "^\\d{17,20}$",
    description:
      "Id de 64 bits em string decimal, com o epoch do Discord (2015-01-01). A data de criação é derivável do próprio número — ver o guia de snowflakes.",
    examples: ["1382915770057249472"],
  },

  Erro: {
    type: "object",
    description:
      "O formato de erro do Discord. As bibliotecas classificam pelo `code`, não pelo texto: `10008` é 'a mensagem sumiu' (não é bug) e `50013` é 'falta permissão' (avise o humano).",
    required: ["code", "message"],
    properties: {
      code: { type: "integer", description: "O código do Discord. `0` quer dizer 'sem código específico'." },
      message: { type: "string", description: "Texto em inglês, letra por letra igual ao do Discord." },
      errors: {
        type: "object",
        description:
          "Só no `50035`. Detalhe por campo, aninhado seguindo o caminho do campo, com os índices de lista como chave de texto: `{\"embeds\":{\"0\":{\"title\":{\"_errors\":[…]}}}}`.",
        additionalProperties: true,
      },
    },
  },

  ErroDeLimite: {
    type: "object",
    description:
      "O corpo do 429. É o único erro da API **sem** `code` — e é assim no Discord.",
    required: ["message", "retry_after", "global"],
    properties: {
      message: { type: "string", const: "You are being rate limited." },
      retry_after: {
        type: "number",
        description: "Segundos (float) até poder tentar de novo. **Não** milissegundos.",
        examples: [0.734],
      },
      global: { type: "boolean", description: "Sempre `false`: o limite é por aplicativo, não global." },
    },
  },

  Usuario: {
    type: "object",
    title: "User",
    description: "Uma pessoa ou um bot. É o mesmo objeto em `author`, `recipients`, `member.user` e `mentions`.",
    required: ["id", "username", "discriminator", "global_name", "avatar", "bot", "system", "public_flags"],
    properties: {
      id: ref("Snowflake"),
      username: { type: "string", description: "O nome único, sem `@`." },
      discriminator: { type: "string", const: "0", description: "Sempre `\"0\"`, como no Discord de hoje. O campo existe porque as bibliotecas o leem." },
      global_name: { type: ["string", "null"], description: "O nome de exibição, quando a pessoa escolheu um." },
      avatar: { type: "null", description: "Sempre `null`: não servimos CDN no formato do Discord. O avatar real está na interface do Streamz." },
      bot: { type: "boolean", description: "`true` para usuário-bot de um aplicativo." },
      system: { type: "boolean", description: "Sempre `false`: não há usuário de sistema aqui." },
      public_flags: { type: "integer", description: "Sempre `0`." },
    },
  },

  Cargo: {
    type: "object",
    title: "Role",
    description:
      "Um cargo do servidor. O `@everyone` sai com `id` **igual ao id do servidor**, como no Discord — internamente ele é uma linha própria.",
    required: ["id", "name", "color", "hoist", "position", "permissions", "managed", "mentionable", "flags"],
    properties: {
      id: ref("Snowflake"),
      name: { type: "string", maxLength: MAX_ROLE_NAME },
      color: { type: "integer", description: "`0xRRGGBB` como inteiro. `0` = sem cor." },
      hoist: { type: "boolean", description: "Exibe os membros deste cargo em separado na lista." },
      position: { type: "integer", description: "A hierarquia. Maior = mais alto." },
      permissions: {
        type: "string",
        description: "Bitfield de 64 bits em **string decimal**. Ver o guia de permissões.",
        examples: ["137411140374081"],
      },
      managed: { type: "boolean", description: "Sempre `false`: não modelamos cargo de integração." },
      mentionable: { type: "boolean" },
      flags: { type: "integer", description: "Sempre `0`." },
    },
  },

  Canal: {
    type: "object",
    title: "Channel",
    description:
      "Canal de texto, de voz, anúncio, categoria ou conversa direta. **Categoria no Discord é canal** (tipo 4) — e aqui também, embora por dentro seja outra tabela.",
    required: ["id", "type"],
    properties: {
      id: ref("Snowflake"),
      type: {
        type: "integer",
        enum: [0, 1, 2, 3, 4, 5],
        description: "0 texto · 1 conversa direta · 2 voz · 3 grupo · 4 categoria · 5 anúncio.",
      },
      guild_id: ref("Snowflake"),
      name: { type: ["string", "null"] },
      position: { type: "integer" },
      parent_id: { type: ["string", "null"], description: "A categoria do canal, como snowflake." },
      topic: { type: ["string", "null"] },
      nsfw: { type: "boolean" },
      rate_limit_per_user: { type: "integer", description: "Modo lento, em segundos." },
      last_message_id: { type: ["string", "null"] },
      recipients: {
        ...lista("Usuario"),
        description: "Só em conversa direta e grupo. É o que o `DMChannel` lê para saber com quem a conversa é.",
      },
      permission_overwrites: {
        type: "array",
        items: { type: "object", additionalProperties: true },
        description: "As exceções de permissão do canal.",
      },
      bitrate: { type: "integer", description: "Só em canal de voz. **Obrigatório** ali: o discord.py o lê sem default." },
      user_limit: { type: "integer", description: "Só em canal de voz. Obrigatório pelo mesmo motivo do `bitrate`." },
      rtc_region: { type: ["string", "null"] },
    },
  },

  Membro: {
    type: "object",
    title: "Guild Member",
    description: "A ligação entre uma pessoa e um servidor: cargos, entrada e castigo.",
    required: ["nick", "avatar", "roles", "joined_at", "deaf", "mute", "flags", "pending", "communication_disabled_until"],
    properties: {
      user: ref("Usuario"),
      nick: {
        type: "null",
        description:
          "Sempre `null`: **o Streamz não tem apelido por servidor**. Um PATCH com `nick` preenchido leva 50013; `nick: null` passa.",
      },
      avatar: { type: "null", description: "Não há avatar por servidor." },
      roles: { ...lista("Snowflake"), description: "Os cargos do membro, **sem** o `@everyone` — como no Discord." },
      joined_at: { type: "string", format: "date-time" },
      premium_since: { type: "null" },
      deaf: { type: "boolean", description: "Sempre `false` aqui: o estado de voz não vive no membro." },
      mute: { type: "boolean", description: "Idem." },
      flags: { type: "integer" },
      pending: { type: "boolean" },
      communication_disabled_until: {
        type: ["string", "null"],
        format: "date-time",
        description: "Fim do castigo (timeout). `null` = sem castigo.",
      },
    },
  },

  Servidor: {
    type: "object",
    title: "Guild",
    description:
      "Um servidor. A forma completa (com `roles`, `channels`, `members`, `voice_states`) aparece no `GUILD_CREATE` do gateway; a rota REST devolve a forma reduzida.",
    required: ["id", "name", "owner_id"],
    properties: {
      id: ref("Snowflake"),
      name: { type: "string" },
      icon: { type: "null", description: "Sem CDN no formato do Discord." },
      owner_id: ref("Snowflake"),
      afk_channel_id: { type: "null" },
      afk_timeout: { type: "integer" },
      system_channel_id: { type: ["string", "null"] },
      rules_channel_id: { type: ["string", "null"] },
      verification_level: { type: "integer" },
      default_message_notifications: { type: "integer" },
      explicit_content_filter: { type: "integer" },
      mfa_level: { type: "integer" },
      premium_tier: { type: "integer" },
      nsfw_level: { type: "integer" },
      member_count: { type: "integer" },
      unavailable: { type: "boolean" },
      features: { type: "array", items: { type: "string" }, description: "Sempre vazio." },
      roles: lista("Cargo"),
      emojis: { type: "array", items: { type: "object", additionalProperties: true } },
      stickers: { type: "array", items: { type: "object", additionalProperties: true } },
    },
  },

  Anexo: {
    type: "object",
    title: "Attachment",
    description:
      "Um arquivo da mensagem. A `url` é **assinada e expira** — o bot deve baixar o arquivo, não guardar o link.",
    required: ["id", "filename", "size", "url", "proxy_url"],
    properties: {
      id: ref("Snowflake"),
      filename: { type: "string" },
      size: { type: "integer", description: `Bytes. O teto é ${MAX_ATTACHMENT_SIZE} (25 MB).` },
      url: { type: "string", format: "uri", description: "URL assinada, com validade curta." },
      proxy_url: { type: "string", format: "uri" },
      content_type: { type: "string", description: "Detectado por magic bytes no envio — nunca o que o cliente declarou." },
      width: { type: ["integer", "null"] },
      height: { type: ["integer", "null"] },
      description: { type: "string" },
    },
  },

  Embed: {
    type: "object",
    title: "Embed",
    description:
      "Um embed no formato do Discord, guardado como veio. Os limites são os do Discord (título 256, descrição 4096, 25 campos, 6000 no total) e o estouro vira `50035` com o caminho do campo.",
    properties: {
      title: { type: "string", maxLength: 256 },
      type: { type: "string" },
      description: { type: "string", maxLength: 4096 },
      url: { type: "string", format: "uri" },
      timestamp: { type: "string", format: "date-time" },
      color: { type: "integer" },
      footer: { type: "object", additionalProperties: true },
      image: { type: "object", additionalProperties: true, description: "`url` aceita `attachment://<nome do arquivo>` quando o arquivo vem no multipart." },
      thumbnail: { type: "object", additionalProperties: true },
      author: { type: "object", additionalProperties: true },
      fields: { type: "array", maxItems: 25, items: { type: "object", additionalProperties: true } },
    },
  },

  Componente: {
    type: "object",
    title: "Message Component",
    description:
      "Botão, select ou linha de ação, guardados no formato do Discord e devolvidos como vieram. O clique chega como `INTERACTION_CREATE` de tipo 3.",
    additionalProperties: true,
    properties: {
      type: { type: "integer", description: "1 linha de ação · 2 botão · 3 select de texto · 5..8 selects especializados." },
      custom_id: { type: "string" },
      components: { type: "array", items: { type: "object", additionalProperties: true } },
    },
  },

  Emoji: {
    type: "object",
    title: "Emoji",
    description:
      "Unicode (`{id: null, name: \"👍\"}`) ou personalizado (`{id: \"<snowflake>\", name: \"caneca\", animated: false}`).",
    required: ["id", "name"],
    properties: {
      id: { type: ["string", "null"] },
      name: { type: ["string", "null"] },
      animated: { type: "boolean" },
    },
  },

  Reacao: {
    type: "object",
    title: "Reaction",
    required: ["count", "me", "emoji"],
    properties: {
      count: { type: "integer" },
      me: { type: "boolean", description: "O bot desta sessão reagiu?" },
      emoji: ref("Emoji"),
    },
  },

  Mensagem: {
    type: "object",
    title: "Message",
    description: "Uma mensagem de canal, de anúncio ou de conversa direta — o mesmo objeto nos três casos.",
    required: [
      "id",
      "channel_id",
      "author",
      "content",
      "timestamp",
      "edited_timestamp",
      "tts",
      "mention_everyone",
      "mentions",
      "mention_roles",
      "attachments",
      "embeds",
      "components",
      "pinned",
      "type",
      "flags",
    ],
    properties: {
      id: ref("Snowflake"),
      channel_id: ref("Snowflake"),
      guild_id: ref("Snowflake"),
      author: ref("Usuario"),
      member: { ...ref("Membro"), description: "O membro do autor, sem `user` (ele já está em `author`). Só em canal de servidor." },
      content: { type: "string", maxLength: MAX_MESSAGE_LENGTH },
      timestamp: { type: "string", format: "date-time" },
      edited_timestamp: { type: ["string", "null"], format: "date-time" },
      tts: { type: "boolean", description: "Aceito na entrada e sempre `false` na saída: não há text-to-speech." },
      mention_everyone: { type: "boolean" },
      mentions: lista("Usuario"),
      mention_roles: lista("Snowflake"),
      attachments: lista("Anexo"),
      embeds: lista("Embed"),
      components: lista("Componente"),
      reactions: lista("Reacao"),
      pinned: { type: "boolean" },
      type: { type: "integer", description: "0 para mensagem comum, 19 para resposta." },
      flags: { type: "integer", description: "Bitfield. `64` = efêmera (só em resposta de interação)." },
      message_reference: {
        type: "object",
        description: "A mensagem citada.",
        properties: { message_id: ref("Snowflake"), channel_id: ref("Snowflake"), guild_id: ref("Snowflake") },
      },
      referenced_message: { type: ["object", "null"], additionalProperties: true, description: "A mensagem citada, em forma reduzida." },
      nonce: { type: "string", description: "Ecoado de volta quando você o manda, como no Discord." },
    },
  },

  Aplicativo: {
    type: "object",
    title: "Application",
    description: "O aplicativo do token. O payload é completo mesmo onde o valor é vazio: o `AppInfo` do discord.py lê vários campos sem default e um faltando vira `KeyError` no meio do login.",
    required: ["id", "name", "description", "bot_public", "bot_require_code_grant", "flags", "bot", "owner", "verify_key"],
    properties: {
      id: ref("Snowflake"),
      name: { type: "string" },
      icon: { type: "null" },
      description: { type: "string", description: "String vazia quando não há descrição — nunca `null` (o `__repr__` do discord.py concatena o valor)." },
      bot_public: { type: "boolean", description: "Sempre `false`: instalar aplicativo de terceiro é tela nossa." },
      bot_require_code_grant: { type: "boolean" },
      flags: { type: "integer" },
      bot: ref("Usuario"),
      owner: { ...ref("Usuario"), description: "O dono do aplicativo. É daqui que o `is_owner()` do discord.py tira a resposta." },
      verify_key: {
        type: "string",
        const: "",
        description: "Vazio **de propósito**: nossas interações chegam pelo gateway, nunca por webhook assinado. O campo existe porque as bibliotecas o leem.",
      },
      rpc_origins: { type: "array", items: { type: "string" } },
      team: { type: "null" },
    },
  },

  OpcaoDeComando: {
    type: "object",
    title: "Application Command Option",
    description: "Uma opção de um comando de barra. **Tipos 1 (subcomando) e 2 (grupo) são recusados** com 50035.",
    required: ["name", "description", "type"],
    properties: {
      name: { type: "string", maxLength: 32, pattern: "^\\S+$", description: "Sem espaços: `/tocar url` é o comando `tocar` com a opção `url`." },
      description: { type: "string", minLength: 1, maxLength: 100 },
      type: { type: "integer", description: "3 texto · 4 inteiro · 5 booleano · 6 usuário · 7 canal · 8 cargo · 10 número." },
      required: { type: "boolean" },
      autocomplete: { type: "boolean", description: "Pede sugestões ao bot (interação de tipo 4, callback 8)." },
      choices: {
        type: "array",
        maxItems: 25,
        items: {
          type: "object",
          required: ["name", "value"],
          properties: { name: { type: "string" }, value: { type: ["string", "number"] } },
        },
      },
    },
  },

  Comando: {
    type: "object",
    title: "Application Command",
    description: "Um comando de barra registrado. `version` aqui é o próprio id do comando — opaco e estável.",
    required: ["id", "application_id", "version", "type", "name", "description", "options"],
    properties: {
      id: ref("Snowflake"),
      application_id: ref("Snowflake"),
      guild_id: { ...ref("Snowflake"), description: "Só em comando por servidor." },
      version: ref("Snowflake"),
      type: { type: "integer", const: 1, description: "Sempre 1 (CHAT_INPUT): menus de contexto não existem aqui." },
      name: { type: "string", maxLength: 32 },
      name_localizations: { type: "null" },
      description: { type: "string", maxLength: 100 },
      description_localizations: { type: "null" },
      options: lista("OpcaoDeComando"),
      default_member_permissions: { type: ["string", "null"], description: "Guardado e devolvido; ainda não aplicado na checagem." },
      nsfw: { type: "boolean" },
      dm_permission: { type: "boolean", description: "Só em comando global. Sempre `false`." },
    },
  },

  Interacao: {
    type: "object",
    title: "Interaction",
    description:
      "O que chega no `INTERACTION_CREATE` do gateway. **Nunca chega por HTTP** — não há endpoint de interações a configurar.",
    required: ["id", "application_id", "type", "token", "version"],
    properties: {
      id: ref("Snowflake"),
      application_id: ref("Snowflake"),
      type: { type: "integer", enum: [2, 3, 4, 5], description: "2 comando de barra · 3 componente · 4 autocomplete · 5 envio de modal." },
      token: { type: "string", description: "O credencial das rotas de callback e followup. Vale **15 minutos**." },
      version: { type: "integer", const: 1 },
      guild_id: ref("Snowflake"),
      channel_id: ref("Snowflake"),
      channel: ref("Canal"),
      member: ref("Membro"),
      user: ref("Usuario"),
      data: { type: "object", additionalProperties: true, description: "O comando e as opções, o `custom_id` do componente, ou os campos do modal." },
      message: { ...ref("Mensagem"), description: "Só em interação de componente: a mensagem onde o botão estava." },
      app_permissions: { type: "string", description: "As permissões do bot naquele canal, como bitfield do Discord." },
      locale: { type: "string", const: "pt-BR" },
      guild_locale: { type: "string", const: "pt-BR" },
    },
  },

  RespostaDeCallback: {
    type: "object",
    title: "Interaction Callback Response",
    description:
      "O corpo do callback quando você manda `?with_response=1`. Sem esse parâmetro, o callback responde **204 sem corpo**. O discord.py 2.6+ manda o parâmetro e lê o corpo sem default.",
    required: ["interaction", "resource"],
    properties: {
      interaction: {
        type: "object",
        required: ["id", "type", "response_message_loading", "response_message_ephemeral"],
        properties: {
          id: ref("Snowflake"),
          type: { type: "integer" },
          activity_instance_id: { type: "null" },
          response_message_id: { type: ["string", "null"] },
          response_message_loading: { type: "boolean", description: "`true` no tipo 5 (o 'pensando…')." },
          response_message_ephemeral: { type: "boolean" },
        },
      },
      resource: {
        type: "object",
        required: ["type"],
        properties: {
          type: { type: "integer", description: "O tipo de callback que você mandou." },
          activity_instance: { type: "null" },
          message: { ...ref("Mensagem"), description: "Só nos tipos 4, 5 e 7." },
        },
      },
    },
  },

  InfoDoGateway: {
    type: "object",
    title: "Gateway",
    required: ["url"],
    properties: {
      url: { type: "string", format: "uri", description: "A URL do WebSocket. A biblioteca acrescenta a query sozinha.", examples: ["wss://api.streamz.chat/gateway"] },
    },
  },

  InfoDoGatewayDoBot: {
    type: "object",
    title: "Gateway Bot",
    required: ["url", "shards", "session_start_limit"],
    properties: {
      url: { type: "string", format: "uri" },
      shards: { type: "integer", const: 1, description: "**Sempre 1.** Um IDENTIFY com mais de um shard leva close 4010." },
      session_start_limit: {
        type: "object",
        description: "Números de fachada: não limitamos início de sessão. Os quatro campos existem porque o discord.js divide um pelo outro — um `0` ali daria `Infinity`.",
        required: ["total", "remaining", "reset_after", "max_concurrency"],
        properties: {
          total: { type: "integer" },
          remaining: { type: "integer" },
          reset_after: { type: "integer" },
          max_concurrency: { type: "integer" },
        },
      },
    },
  },

  Banimento: {
    type: "object",
    title: "Ban",
    required: ["reason", "user"],
    properties: {
      reason: { type: ["string", "null"] },
      user: ref("Usuario"),
    },
  },

  // ── corpos de requisição ──

  CriacaoDeMensagem: {
    type: "object",
    title: "Create Message",
    description:
      "Pelo menos um entre `content`, `embeds`, `components` e anexo é obrigatório — corpo vazio leva `content[BASE_TYPE_REQUIRED]`. Campos que ainda não implementamos são **aceitos e ignorados**, nunca recusados: recusar faria um bot escrito para o Discord parar por causa de um campo que ele sempre manda.",
    properties: {
      content: { type: "string", maxLength: MAX_MESSAGE_LENGTH },
      tts: { type: "boolean", description: "Aceito e ignorado." },
      nonce: { type: ["string", "number"], description: "Ecoado de volta para o cliente trocar a mensagem otimista." },
      embeds: lista("Embed"),
      components: lista("Componente"),
      flags: { type: "integer", description: "`EPHEMERAL` (64) é removido aqui: ela só vale em resposta de interação." },
      allowed_mentions: {
        type: "object",
        description: "Só o `replied_user` muda comportamento: ele é o '@ ligado' da resposta, e o padrão é `true`, como no Discord.",
        properties: {
          parse: { type: "array", items: { type: "string" } },
          users: lista("Snowflake"),
          roles: lista("Snowflake"),
          replied_user: { type: "boolean", default: true },
        },
      },
      message_reference: {
        type: "object",
        description: "Responder a uma mensagem. Sem a mensagem citada, `10008` — a menos que `fail_if_not_exists` seja `false`.",
        properties: {
          message_id: ref("Snowflake"),
          channel_id: ref("Snowflake"),
          guild_id: ref("Snowflake"),
          fail_if_not_exists: { type: "boolean", default: true },
        },
      },
      attachments: {
        type: "array",
        description: "No multipart, pareia cada `files[n]` pelo `id` e dá o `filename` que vale. `attachment://<filename>` num embed resolve por aqui.",
        items: {
          type: "object",
          properties: {
            id: { type: ["integer", "string"], description: "O `n` de `files[n]`." },
            filename: { type: "string" },
            description: { type: "string" },
          },
        },
      },
      attachment_ids: {
        type: "array",
        items: { type: "string" },
        maxItems: MAX_ATTACHMENTS_PER_MESSAGE,
        description:
          "**Extensão do Streamz**, não existe no Discord: ids de anexo já enviados por `POST /api/uploads`. Só anexos do próprio bot e ainda não vinculados. Nenhuma biblioteca conhece este campo — use o multipart.",
      },
    },
  },

  EdicaoDeMensagem: {
    type: "object",
    title: "Edit Message",
    description: "Semântica de PATCH: campo ausente não mexe, campo presente substitui. Um corpo sem nenhum dos quatro é um no-op que devolve a mensagem.",
    properties: {
      content: { type: "string", maxLength: MAX_MESSAGE_LENGTH },
      embeds: lista("Embed"),
      components: lista("Componente"),
      flags: { type: "integer" },
      allowed_mentions: { type: "object", additionalProperties: true },
    },
  },

  RemocaoEmLote: {
    type: "object",
    title: "Bulk Delete",
    required: ["messages"],
    properties: {
      messages: {
        ...lista("Snowflake"),
        minItems: 2,
        maxItems: MAX_BULK_DELETE,
        description:
          "De 2 a 100 ids. Repetidos são ignorados; mensagem que já sumiu é ignorada em silêncio (o bot costuma ter buscado a lista segundos antes). Nada com mais de 14 dias — a idade sai do próprio id.",
      },
    },
  },

  AberturaDeConversa: {
    type: "object",
    title: "Create DM",
    required: ["recipient_id"],
    properties: {
      recipient_id: { ...ref("Snowflake"), description: "Com quem abrir a conversa." },
    },
  },

  EdicaoDeMembro: {
    type: "object",
    title: "Modify Guild Member",
    description: "`null` e ausente querem dizer coisas diferentes: ausente é 'não mexe', `null` é 'limpa'.",
    properties: {
      roles: {
        ...lista("Snowflake"),
        description:
          "**Substitui** o conjunto inteiro (é o `member.roles.set([...])`). O diff é aplicado cargo a cargo, para que cada um passe pela hierarquia. O `@everyone` na lista é descartado em silêncio.",
      },
      nick: { type: ["string", "null"], description: "Apelido por servidor **não existe** no Streamz: texto leva 50013, `null` passa." },
      communication_disabled_until: { type: ["string", "null"], format: "date-time", description: "O castigo. `null` tira. Data inválida leva 50035." },
      mute: { type: "boolean", description: "Aceito e ignorado: o estado de voz não vive no membro." },
      deaf: { type: "boolean", description: "Aceito e ignorado." },
      channel_id: { type: ["string", "null"], description: "Mover na voz: aceito e ignorado." },
    },
  },

  Banir: {
    type: "object",
    title: "Create Guild Ban",
    properties: {
      delete_message_seconds: { type: "integer", minimum: 0, maximum: 604800, description: "Quanto de histórico apagar. Convertido para horas, arredondado **para cima**." },
      delete_message_days: { type: "integer", minimum: 0, maximum: 7, description: "O campo antigo. Aceito para bots mais velhos." },
      reason: { type: "string", maxLength: 512, description: "Cai na auditoria e na mensagem que o banido recebe." },
    },
  },

  CorpoDeCargo: {
    type: "object",
    title: "Create/Modify Role",
    description: "Campo ausente não é tocado. No `PATCH` do `@everyone`, só `permissions` tem efeito — nome, cor e posição dele não são editáveis, e isso é ignorado em silêncio, como no Discord.",
    properties: {
      name: { type: "string", maxLength: MAX_ROLE_NAME },
      permissions: {
        type: ["string", "number", "null"],
        description:
          "Bitfield de 64 bits do Discord, em string decimal. Os 35 bits sem par aqui são descartados **em silêncio**. Você não pode conceder permissão que você mesmo não tem.",
      },
      color: { type: ["integer", "null"], minimum: 0, maximum: 16777215, description: "`0xRRGGBB`. `0` e `null` = sem cor." },
      hoist: { type: ["boolean", "null"] },
      mentionable: { type: ["boolean", "null"] },
      icon: { description: "Aceito e ignorado." },
      unicode_emoji: { description: "Aceito e ignorado." },
    },
  },

  RegistroDeComando: {
    type: "object",
    title: "Create Application Command",
    description:
      "Tolerante com o que não usamos (`name_localizations`, `dm_permission`, `nsfw`, `contexts`, `integration_types` passam e são descartados) e **duro** com o que não suportamos: subcomando, grupo de subcomando e menu de contexto são recusados com 50035.",
    required: ["name", "description"],
    properties: {
      name: { type: "string", maxLength: 32, pattern: "^\\S+$" },
      description: { type: "string", minLength: 1, maxLength: 100 },
      type: { type: "integer", const: 1, description: "Só 1 (CHAT_INPUT)." },
      options: { ...lista("OpcaoDeComando"), maxItems: 25 },
      default_member_permissions: { type: ["string", "null"] },
    },
  },

  CorpoDeCallback: {
    type: "object",
    title: "Interaction Response",
    required: ["type"],
    properties: {
      type: {
        type: "integer",
        enum: [4, 5, 6, 7, 8, 9],
        description: "4 responder · 5 'pensando…' · 6 reconhecer o clique · 7 editar a mensagem do componente · 8 sugestões · 9 modal.",
      },
      data: {
        type: "object",
        additionalProperties: true,
        description: "O corpo da resposta (como o de `CriacaoDeMensagem`, mais `flags: 64` para efêmera), ou `choices` no tipo 8, ou o modal no tipo 9.",
      },
    },
  },

  CorpoDeFollowup: {
    type: "object",
    title: "Followup Message",
    description: "O mesmo vocabulário de uma mensagem. `flags: 64` faz o followup ser efêmero.",
    properties: {
      content: { type: "string", maxLength: MAX_MESSAGE_LENGTH },
      embeds: lista("Embed"),
      components: lista("Componente"),
      flags: { type: "integer" },
      allowed_mentions: { type: "object", additionalProperties: true },
      attachments: { type: "array", items: { type: "object", additionalProperties: true } },
    },
  },
};

// ── components.responses: os erros que se repetem ────────────

const RESPOSTAS_REAPROVEITADAS: Record<string, RespostaOpenAPI> = {
  NaoAutenticado: {
    description: "Token ausente, mal formado, desconhecido ou revogado. Nunca 403 — o `TokenInvalid` das bibliotecas nasce deste 401.",
    content: { "application/json": { schema: ref("Erro"), example: { code: 0, message: "401: Unauthorized" } } },
  },
  SemPermissao: {
    description: "Falta o bit de permissão, ou a hierarquia de cargo não permite agir sobre o alvo.",
    content: { "application/json": { schema: ref("Erro"), example: { code: 50013, message: "Missing Permissions" } } },
  },
  SemAcesso: {
    description: "O token é de outro aplicativo, ou o bot não é membro do servidor em questão.",
    content: { "application/json": { schema: ref("Erro"), example: { code: 50001, message: "Missing Access" } } },
  },
  CanalDesconhecido: {
    description: "O canal não existe, ou o bot não pode vê-lo — os dois casos dão a mesma resposta.",
    content: { "application/json": { schema: ref("Erro"), example: { code: 10003, message: "Unknown Channel" } } },
  },
  ServidorDesconhecido: {
    description: "O servidor não existe **ou o bot não é membro dele**. Não confirmamos a existência de servidor que não é da conta do bot.",
    content: { "application/json": { schema: ref("Erro"), example: { code: 10004, message: "Unknown Guild" } } },
  },
  MensagemDesconhecida: {
    description: "A mensagem não existe, ou não é do canal do caminho.",
    content: { "application/json": { schema: ref("Erro"), example: { code: 10008, message: "Unknown Message" } } },
  },
  UsuarioDesconhecido: {
    description: "O usuário não existe.",
    content: { "application/json": { schema: ref("Erro"), example: { code: 10013, message: "Unknown User" } } },
  },
  InteracaoDesconhecida: {
    description:
      "Token de interação inexistente, vencido (mais de 15 minutos) ou apresentado com o id/aplicativo errado. Os três casos dão a mesma resposta: para quem não tem o token, a interação não existe.",
    content: { "application/json": { schema: ref("Erro"), example: { code: 10062, message: "Unknown interaction" } } },
  },
  CorpoInvalido: {
    description: "Corpo recusado. O `errors` traz o detalhe por campo, no caminho do campo.",
    content: {
      "application/json": {
        schema: ref("Erro"),
        example: {
          code: 50035,
          message: "Invalid Form Body",
          errors: { embeds: { "0": { title: { _errors: [{ code: "BASE_TYPE_MAX_LENGTH", message: "Must be 256 or fewer in length." }] } } } },
        },
      },
    },
  },
  NaoImplementado: {
    description: "A rota existe, a funcionalidade ainda não. A mensagem diz exatamente o que falta.",
    content: {
      "application/json": {
        schema: ref("Erro"),
        example: { code: 20012, message: "Not implemented: PATCH /applications/:app/commands/:id" },
      },
    },
  },
  LimiteExcedido: {
    description: "Mais de 50 requisições num segundo, para este aplicativo.",
    headers: {
      "Retry-After": { description: "Segundos inteiros.", schema: { type: "string" } },
      "X-RateLimit-Scope": { description: "Sempre `user`.", schema: { type: "string" } },
    },
    content: {
      "application/json": {
        schema: ref("ErroDeLimite"),
        example: { message: "You are being rate limited.", retry_after: 0.734, global: false },
      },
    },
  },
  ErroInterno: {
    description: "Defeito nosso. Nada de stack vaza para o bot; o log estruturado guarda o original.",
    content: { "application/json": { schema: ref("Erro"), example: { code: 0, message: "500: Internal Server Error" } } },
  },
};

// ── components.parameters ────────────────────────────────────

const PARAMETROS: Record<string, ParametroOpenAPI> = {
  MotivoDeAuditoria: {
    name: "x-audit-log-reason",
    in: "header",
    required: false,
    description: "O motivo, que vai para a auditoria do servidor e para a mensagem que o alvo recebe.",
    schema: { type: "string", maxLength: 512 },
  },
};

// ── paths ────────────────────────────────────────────────────

const CAMINHOS: Record<string, CaminhoOpenAPI> = {
  "/gateway": {
    get: {
      operationId: "obterGateway",
      tags: ["Gateway"],
      summary: "A URL do WebSocket",
      description:
        "A forma curta, sem os números de sessão. A maior parte das bibliotecas usa `/gateway/bot`; esta existe porque algumas pedem as duas.",
      responses: { "200": json(ref("InfoDoGateway"), "A URL do gateway."), ...ERROS_COMUNS },
      "x-permissao": null,
      "x-estado": "estavel",
    },
  },

  "/gateway/bot": {
    get: {
      operationId: "obterGatewayDoBot",
      tags: ["Gateway"],
      summary: "A URL do WebSocket, com os limites de sessão",
      description:
        "**A primeira rota que a sua biblioteca chama.** Ela monta a URL do WebSocket a partir daqui, pelo mesmo cliente REST — por isso trocar a URL base já redireciona o gateway, e não existe (nem é preciso) uma opção separada. Um 401 aqui vira `TokenInvalid` na biblioteca.\n\nA URL vem de `GATEWAY_PUBLIC_URL` quando configurada; sem ela, é montada a partir do host da requisição, o que faz o teste local funcionar sem configurar nada.",
      responses: { "200": json(ref("InfoDoGatewayDoBot"), "A URL e os limites de sessão."), ...ERROS_COMUNS },
      "x-permissao": null,
      "x-estado": "estavel",
      "x-exemplo-discordjs": {
        titulo: "É a própria biblioteca que chama",
        codigo: `const client = new Client({
  rest: { api: "https://api.streamz.chat/api" },
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});
await client.login(token); // por dentro: GET /gateway/bot, depois o WebSocket`,
      },
    },
  },

  "/users/@me": {
    get: {
      operationId: "obterUsuarioAtual",
      tags: ["Usuários"],
      summary: "O usuário-bot deste token",
      description: "A rota mais simples da API, e a que prova que o token vale: o bot é um usuário como qualquer outro, com `bot: true`.",
      responses: { "200": json(ref("Usuario"), "O usuário-bot."), ...ERROS_COMUNS },
      "x-permissao": null,
      "x-estado": "estavel",
    },
  },

  "/users/@me/channels": {
    post: {
      operationId: "abrirConversa",
      tags: ["Usuários"],
      summary: "Abre uma conversa direta",
      description:
        "É a primeira metade do `user.send(\"oi\")`: a biblioteca chama esta rota, guarda o `id` do canal e escreve nele por `POST /channels/{id}/messages`.\n\nÉ **get-or-create**: chamar duas vezes devolve o mesmo canal. Quem bloqueou o bot não recebe conversa dele — esse caso é `50013`.",
      requestBody: { required: true, content: { "application/json": { schema: ref("AberturaDeConversa") } } },
      responses: {
        "201": json(ref("Canal"), "O canal de conversa direta (tipo 1)."),
        "403": erroRef("SemPermissao"),
        "404": erroRef("UsuarioDesconhecido"),
        ...ERROS_COMUNS,
      },
      "x-permissao": null,
      "x-estado": "estavel",
      "x-exemplo-discordjs": {
        titulo: "Mandar uma DM",
        codigo: `const user = await client.users.fetch("1382915770057249472");
await user.send("olá — mensagem de bot"); // abre a conversa e escreve nela`,
      },
    },
  },

  "/users/{user_id}": {
    parameters: [naRota("user_id", "O id da pessoa.")],
    get: {
      operationId: "obterUsuario",
      tags: ["Usuários"],
      summary: "Um usuário pelo id",
      description: "Funciona para qualquer usuário da instância, membro do mesmo servidor ou não — como no Discord.",
      responses: { "200": json(ref("Usuario"), "O usuário."), "404": erroRef("UsuarioDesconhecido"), ...ERROS_COMUNS },
      "x-permissao": null,
      "x-estado": "estavel",
    },
  },

  "/applications/@me": {
    get: {
      operationId: "obterAplicativoAtual",
      tags: ["Aplicativos"],
      summary: "O aplicativo deste token",
      description:
        "O que o `client.application.fetch()` do discord.js lê. Não confunda com `/api/applications` (sem `v10`), que é o REST interno do portal do desenvolvedor, autenticado com `Bearer` pelo **dono** do bot.",
      responses: { "200": json(ref("Aplicativo"), "O aplicativo."), ...ERROS_COMUNS },
      "x-permissao": null,
      "x-estado": "estavel",
    },
  },

  "/oauth2/applications/@me": {
    get: {
      operationId: "obterAplicativoAtualOAuth2",
      tags: ["Aplicativos"],
      summary: "O aplicativo deste token (caminho do discord.py)",
      description:
        "Mesmo payload de `/applications/@me`, outro caminho. **É a rota que o `commands.Bot` do discord.py chama no login**, para descobrir o dono — é assim que o `is_owner()` funciona.\n\nNão implementamos mais nada de `/oauth2/*`: o fluxo de autorização do Discord é uma página do `discord.com`, e o nosso equivalente é a nossa própria tela.",
      responses: { "200": json(ref("Aplicativo"), "O aplicativo."), ...ERROS_COMUNS },
      "x-permissao": null,
      "x-estado": "estavel",
    },
  },

  "/applications/{application_id}/commands": {
    parameters: [
      {
        name: "application_id",
        in: "path",
        required: true,
        description: "O id do aplicativo do token. `@me` também é aceito (o Discord não aceita; aqui não custa nada). Outro valor é **403 `50001`**, não 404: o aplicativo até existe, mas este token não fala por ele.",
        schema: { type: "string", examples: ["@me"] },
      },
    ],
    get: {
      operationId: "listarComandosGlobais",
      tags: ["Comandos"],
      summary: "Lista os comandos globais",
      description:
        "Os comandos que valem em **todos** os servidores onde o bot está, ordenados por nome. Comando global e comando de servidor são escopos separados: esta rota não mostra os do outro.",
      responses: { "200": json(lista("Comando"), "Os comandos globais do aplicativo."), "403": erroRef("SemAcesso"), ...ERROS_COMUNS },
      "x-permissao": null,
      "x-estado": "estavel",
    },
    put: {
      operationId: "sobrescreverComandosGlobais",
      tags: ["Comandos"],
      summary: "Sobrescreve **todos** os comandos globais",
      description:
        "É o `deploy-commands.js` de todo tutorial, e é **sobrescrita em bloco**: o que não veio no corpo some. Numa transação, e por isso idempotente — rodar duas vezes deixa o banco idêntico.\n\nComando que já existe é **atualizado pelo nome**, não recriado: o id sobrevive, e o compositor do Streamz não perde a referência que já carregou. Lista vazia apaga tudo.",
      requestBody: {
        required: true,
        description: "A lista inteira do escopo.",
        content: { "application/json": { schema: { ...lista("RegistroDeComando"), maxItems: 100 } } },
      },
      responses: {
        "200": json(lista("Comando"), "Os comandos como ficaram."),
        "400": erroRef("CorpoInvalido"),
        "403": erroRef("SemAcesso"),
        ...ERROS_COMUNS,
      },
      "x-permissao": null,
      "x-estado": "estavel",
      "x-exemplo-discordjs": {
        titulo: "deploy-commands.js",
        codigo: `const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const comandos = [
  new SlashCommandBuilder().setName("ping").setDescription("responde pong"),
].map((c) => c.toJSON());

const rest = new REST({ version: "10", api: "https://api.streamz.chat/api" }).setToken(token);
await rest.put(Routes.applicationCommands(APP_ID), { body: comandos });`,
      },
    },
    post: {
      operationId: "criarComandoGlobal",
      tags: ["Comandos"],
      summary: "Cria (ou atualiza) um comando global",
      description:
        "Nome que já existe **atualiza** o comando, e não dá 400 — é o que o Discord faz.\n\nO status é **201**, e o do Discord é 200 ou 201 conforme o caso; nenhuma biblioteca distingue os dois (todas tratam 2xx como sucesso), e um status inventado aqui seria pior que a diferença.",
      requestBody: { required: true, content: { "application/json": { schema: ref("RegistroDeComando") } } },
      responses: {
        "201": json(ref("Comando"), "O comando criado ou atualizado."),
        "400": erroRef("CorpoInvalido"),
        "403": erroRef("SemAcesso"),
        ...ERROS_COMUNS,
      },
      "x-permissao": null,
      "x-estado": "estavel",
    },
  },

  "/applications/{application_id}/commands/{command_id}": {
    parameters: [
      { name: "application_id", in: "path", required: true, description: "O aplicativo do token, ou `@me`.", schema: { type: "string" } },
      naRota("command_id", "O id do comando."),
    ],
    get: {
      operationId: "obterComandoGlobal",
      tags: ["Comandos"],
      summary: "Um comando global",
      description: "Id que não é snowflake leva `10063` — simplesmente não existe.",
      responses: { "200": json(ref("Comando"), "O comando."), "403": erroRef("SemAcesso"), "404": json(ref("Erro"), "`10063 Unknown application command`."), ...ERROS_COMUNS },
      "x-permissao": null,
      "x-estado": "estavel",
    },
    patch: {
      operationId: "editarComandoGlobal",
      tags: ["Comandos"],
      summary: "Edita um comando global — **não implementado**",
      description:
        "**501.** A rota existe para você receber `20012` com a explicação, em vez do 404 genérico que a biblioteca leria como 'erro desconhecido'. Use o `PUT` do escopo inteiro, ou o `POST`, que atualiza o comando de mesmo nome.",
      deprecated: true,
      responses: { "501": erroRef("NaoImplementado"), ...ERROS_COMUNS },
      "x-permissao": null,
      "x-estado": "nao-implementado",
    },
    delete: {
      operationId: "apagarComandoGlobal",
      tags: ["Comandos"],
      summary: "Apaga um comando global",
      description:
        "204 sem corpo. Apagar o comando o tira do compositor de todos os servidores; para trocar a lista inteira de uma vez, o `PUT` é mais barato que uma sequência de `DELETE`.",
      responses: { "204": semConteudo("Apagado."), "403": erroRef("SemAcesso"), "404": json(ref("Erro"), "`10063 Unknown application command`."), ...ERROS_COMUNS },
      "x-permissao": null,
      "x-estado": "estavel",
    },
  },

  "/applications/{application_id}/guilds/{guild_id}/commands": {
    parameters: [
      { name: "application_id", in: "path", required: true, description: "O aplicativo do token, ou `@me`.", schema: { type: "string" } },
      naRota("guild_id", "O servidor onde os comandos valem."),
    ],
    get: {
      operationId: "listarComandosDoServidor",
      tags: ["Comandos"],
      summary: "Lista os comandos daquele servidor",
      description: "Servidor onde o **usuário-bot não é membro** leva 403 `50001`: registrar comando lá gravaria linhas que ninguém veria.",
      responses: { "200": json(lista("Comando"), "Os comandos daquele servidor."), "403": erroRef("SemAcesso"), "404": erroRef("ServidorDesconhecido"), ...ERROS_COMUNS },
      "x-permissao": null,
      "x-estado": "estavel",
    },
    put: {
      operationId: "sobrescreverComandosDoServidor",
      tags: ["Comandos"],
      summary: "Sobrescreve **todos** os comandos daquele servidor",
      description: "Igual ao `PUT` global, num escopo só. É o caminho recomendado enquanto você desenvolve: comando de servidor aparece na hora.",
      requestBody: { required: true, content: { "application/json": { schema: { ...lista("RegistroDeComando"), maxItems: 100 } } } },
      responses: {
        "200": json(lista("Comando"), "Os comandos como ficaram."),
        "400": erroRef("CorpoInvalido"),
        "403": erroRef("SemAcesso"),
        "404": erroRef("ServidorDesconhecido"),
        ...ERROS_COMUNS,
      },
      "x-permissao": null,
      "x-estado": "estavel",
    },
    post: {
      operationId: "criarComandoNoServidor",
      tags: ["Comandos"],
      summary: "Cria (ou atualiza) um comando naquele servidor",
      description:
        "Nome que já existe **atualiza** o comando em vez de dar 400 — é o que o Discord faz, e é o que permite subir um comando de cada vez sem apagar os outros do escopo. O status é **201**, como no `POST` global.",
      requestBody: { required: true, content: { "application/json": { schema: ref("RegistroDeComando") } } },
      responses: {
        "201": json(ref("Comando"), "O comando criado ou atualizado."),
        "400": erroRef("CorpoInvalido"),
        "403": erroRef("SemAcesso"),
        "404": erroRef("ServidorDesconhecido"),
        ...ERROS_COMUNS,
      },
      "x-permissao": null,
      "x-estado": "estavel",
    },
  },

  "/applications/{application_id}/guilds/{guild_id}/commands/{command_id}": {
    parameters: [
      { name: "application_id", in: "path", required: true, description: "O aplicativo do token, ou `@me`.", schema: { type: "string" } },
      naRota("guild_id", "O servidor do comando."),
      naRota("command_id", "O id do comando."),
    ],
    get: {
      operationId: "obterComandoDoServidor",
      tags: ["Comandos"],
      summary: "Um comando daquele servidor",
      description:
        "Mesmo comportamento da versão global, restrito ao escopo daquele servidor: um comando global não aparece aqui, e vice-versa. Id que não é snowflake leva `10063`.",
      responses: { "200": json(ref("Comando"), "O comando."), "403": erroRef("SemAcesso"), "404": json(ref("Erro"), "`10063` ou `10004`."), ...ERROS_COMUNS },
      "x-permissao": null,
      "x-estado": "estavel",
    },
    patch: {
      operationId: "editarComandoDoServidor",
      tags: ["Comandos"],
      summary: "Edita um comando daquele servidor — **não implementado**",
      description: "**501**, pelo mesmo motivo da versão global. Use o `PUT` do escopo ou o `POST`.",
      deprecated: true,
      responses: { "501": erroRef("NaoImplementado"), ...ERROS_COMUNS },
      "x-permissao": null,
      "x-estado": "nao-implementado",
    },
    delete: {
      operationId: "apagarComandoDoServidor",
      tags: ["Comandos"],
      summary: "Apaga um comando daquele servidor",
      description:
        "204 sem corpo. Só apaga dentro daquele escopo — o comando global de mesmo nome, se houver, continua de pé.",
      responses: { "204": semConteudo("Apagado."), "403": erroRef("SemAcesso"), "404": json(ref("Erro"), "`10063` ou `10004`."), ...ERROS_COMUNS },
      "x-permissao": null,
      "x-estado": "estavel",
    },
  },

  "/guilds/{guild_id}": {
    parameters: [naRota("guild_id", "O id do servidor.")],
    get: {
      operationId: "obterServidor",
      tags: ["Servidores"],
      summary: "Um servidor",
      description:
        "Forma reduzida. A forma gorda — com cargos, canais, membros e estados de voz — chega no `GUILD_CREATE` do gateway, que é de onde o cache do seu bot nasce.\n\nServidor de que o bot não participa responde `10004`, **não** 403: não confirmamos a existência de servidor que não é da conta dele.",
      responses: { "200": json(ref("Servidor"), "O servidor."), "404": erroRef("ServidorDesconhecido"), ...ERROS_COMUNS },
      "x-permissao": null,
      "x-estado": "estavel",
    },
  },

  "/guilds/{guild_id}/channels": {
    parameters: [naRota("guild_id", "O id do servidor.")],
    get: {
      operationId: "listarCanaisDoServidor",
      tags: ["Servidores"],
      summary: "Os canais do servidor",
      description:
        "**Inclui as categorias, como canais de tipo 4.** Elas vêm primeiro na lista, porque são o `parent_id` dos canais: quem constrói o cache lendo em ordem já tem o pai quando chega no filho.",
      responses: { "200": json(lista("Canal"), "Categorias e canais, nessa ordem."), "404": erroRef("ServidorDesconhecido"), ...ERROS_COMUNS },
      "x-permissao": null,
      "x-estado": "estavel",
    },
  },

  "/guilds/{guild_id}/roles": {
    parameters: [naRota("guild_id", "O id do servidor.")],
    get: {
      operationId: "listarCargos",
      tags: ["Cargos"],
      summary: "Os cargos do servidor",
      description: "O `@everyone` sai com `id` igual ao id do servidor, como no Discord.",
      responses: { "200": json(lista("Cargo"), "Os cargos."), "404": erroRef("ServidorDesconhecido"), ...ERROS_COMUNS },
      "x-permissao": null,
      "x-estado": "estavel",
    },
    post: {
      operationId: "criarCargo",
      tags: ["Cargos"],
      summary: "Cria um cargo",
      description:
        "O cargo nasce logo **abaixo** do cargo mais alto de quem o criou. Você não pode conceder uma permissão que você mesmo não tem — sem essa regra, `MANAGE_ROLES` seria `ADMINISTRATOR` em duas chamadas.",
      requestBody: { required: true, content: { "application/json": { schema: ref("CorpoDeCargo") } } },
      responses: {
        "201": json(ref("Cargo"), "O cargo criado."),
        "400": erroRef("CorpoInvalido"),
        "403": erroRef("SemPermissao"),
        "404": erroRef("ServidorDesconhecido"),
        ...ERROS_COMUNS,
      },
      "x-permissao": "MANAGE_ROLES",
      "x-estado": "estavel",
      "x-exemplo-discordjs": {
        titulo: "Criar um cargo",
        codigo: `const guild = await client.guilds.fetch(GUILD_ID);
await guild.roles.create({
  name: "DJ",
  color: 0x5865f2,
  permissions: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak],
});`,
      },
    },
  },

  "/guilds/{guild_id}/roles/{role_id}": {
    parameters: [naRota("guild_id", "O id do servidor."), naRota("role_id", "O id do cargo.")],
    patch: {
      operationId: "editarCargo",
      tags: ["Cargos"],
      summary: "Edita um cargo",
      description:
        "Campo ausente não é tocado. O cargo alvo precisa estar **estritamente abaixo** do cargo mais alto do bot.\n\nNo `@everyone`, só `permissions` tem efeito; nome, cor e posição são ignorados em silêncio, como no Discord.\n\n**Apagar cargo não existe aqui** — `DELETE /guilds/{id}/roles/{rid}` não está implementado.",
      requestBody: { required: true, content: { "application/json": { schema: ref("CorpoDeCargo") } } },
      responses: {
        "200": json(ref("Cargo"), "O cargo como ficou."),
        "400": erroRef("CorpoInvalido"),
        "403": erroRef("SemPermissao"),
        "404": json(ref("Erro"), "`10011 Unknown Role` ou `10004 Unknown Guild`."),
        ...ERROS_COMUNS,
      },
      "x-permissao": "MANAGE_ROLES",
      "x-estado": "estavel",
    },
  },

  "/guilds/{guild_id}/members/{user_id}": {
    parameters: [naRota("guild_id", "O id do servidor."), naRota("user_id", "O id da pessoa.")],
    get: {
      operationId: "obterMembro",
      tags: ["Membros"],
      summary: "Um membro do servidor",
      description:
        "Os cargos, a data de entrada e o castigo de uma pessoa naquele servidor. Quem não é membro leva `10007`; servidor de que o **bot** não participa leva `10004`.\n\nNão existe rota para **listar** os membros: o `GUILD_CREATE` do gateway já traz todos.",
      responses: { "200": json(ref("Membro"), "O membro."), "404": json(ref("Erro"), "`10007` ou `10004`."), ...ERROS_COMUNS },
      "x-permissao": null,
      "x-estado": "estavel",
    },
    patch: {
      operationId: "editarMembro",
      tags: ["Membros"],
      summary: "Edita um membro (cargos, castigo)",
      description:
        "`roles` **substitui** o conjunto inteiro — é o `member.roles.set([...])`. O diff é aplicado cargo a cargo para que cada um passe pela hierarquia.\n\nA ordem é: valida tudo, depois escreve. Um PATCH que mexesse nos cargos e só então descobrisse que o castigo é inválido deixaria metade do pedido feito, e você não teria como saber qual metade.\n\nDuas divergências declaradas: `nick` (não existe apelido por servidor → 50013 quando preenchido) e `mute`/`deaf`/`channel_id` (ignorados em silêncio, porque as bibliotecas os mandam junto num `edit()` genérico).",
      parameters: [{ $ref: "#/components/parameters/MotivoDeAuditoria" }],
      requestBody: { required: true, content: { "application/json": { schema: ref("EdicaoDeMembro") } } },
      responses: {
        "200": json(ref("Membro"), "O membro como ficou."),
        "400": erroRef("CorpoInvalido"),
        "403": erroRef("SemPermissao"),
        "404": json(ref("Erro"), "`10007` ou `10004`."),
        ...ERROS_COMUNS,
      },
      "x-permissao": "MANAGE_ROLES (cargos) · MODERATE_MEMBERS (castigo) — mais a hierarquia",
      "x-estado": "parcial",
      "x-exemplo-discordjs": {
        titulo: "Castigar por 10 minutos",
        codigo: `const membro = await guild.members.fetch(userId);
await membro.timeout(10 * 60 * 1000, "flood no #geral");`,
      },
    },
    delete: {
      operationId: "expulsarMembro",
      tags: ["Membros"],
      summary: "Expulsa um membro",
      description:
        "204 sem corpo. O expulso perde o acesso **em tempo real**: os sockets dele saem das salas do servidor na hora, sem esperar um recarregamento. Ele também recebe um aviso na conversa direta.",
      parameters: [{ $ref: "#/components/parameters/MotivoDeAuditoria" }],
      responses: {
        "204": semConteudo("Expulso."),
        "403": erroRef("SemPermissao"),
        "404": json(ref("Erro"), "`10007` ou `10004`."),
        ...ERROS_COMUNS,
      },
      "x-permissao": "KICK_MEMBERS + hierarquia",
      "x-estado": "estavel",
    },
  },

  "/guilds/{guild_id}/members/{user_id}/roles/{role_id}": {
    parameters: [naRota("guild_id", "O id do servidor."), naRota("user_id", "O id da pessoa."), naRota("role_id", "O id do cargo.")],
    put: {
      operationId: "darCargoAoMembro",
      tags: ["Membros"],
      summary: "Dá um cargo a um membro",
      description:
        "204 sem corpo, e **idempotente**: dar de novo um cargo que o membro já tem responde 204.\n\nO cargo alvo precisa estar **estritamente abaixo** do cargo mais alto do bot; sem essa regra, `MANAGE_ROLES` valeria `ADMINISTRATOR` (bastaria criar um cargo com tudo ligado e vesti-lo).\n\nO `@everyone` não se atribui à mão: `50028`.",
      responses: {
        "204": semConteudo("Cargo atribuído."),
        "400": json(ref("Erro"), "`50028 Invalid Role` — o `@everyone` (ou um cargo de integração)."),
        "403": erroRef("SemPermissao"),
        "404": json(ref("Erro"), "`10007`, `10011` ou `10004`."),
        ...ERROS_COMUNS,
      },
      "x-permissao": "MANAGE_ROLES + hierarquia",
      "x-estado": "estavel",
      "x-exemplo-discordjs": {
        titulo: "Cargo por reação",
        codigo: `client.on("messageReactionAdd", async (reacao, usuario) => {
  if (reacao.message.id !== MENSAGEM_DE_CARGOS) return;
  const membro = await reacao.message.guild.members.fetch(usuario.id);
  await membro.roles.add(CARGO_DJ);
});`,
      },
    },
    delete: {
      operationId: "tirarCargoDoMembro",
      tags: ["Membros"],
      summary: "Tira um cargo de um membro",
      description: "204, e tirar um cargo que ele não tem também é 204.",
      responses: {
        "204": semConteudo("Cargo removido."),
        "400": json(ref("Erro"), "`50028 Invalid Role`."),
        "403": erroRef("SemPermissao"),
        "404": json(ref("Erro"), "`10007`, `10011` ou `10004`."),
        ...ERROS_COMUNS,
      },
      "x-permissao": "MANAGE_ROLES + hierarquia",
      "x-estado": "estavel",
    },
  },

  "/guilds/{guild_id}/bans": {
    parameters: [naRota("guild_id", "O id do servidor.")],
    get: {
      operationId: "listarBanimentos",
      tags: ["Banimentos"],
      summary: "A lista de banidos",
      description:
        "**Sem paginação**, divergência declarada: o Discord aceita `?limit&before&after` aqui, mas um servidor do Streamz tem dezenas de banidos, não milhares, e o `guild.bans.fetch()` sem cursor lê a lista inteira — que é o caso de todo bot que a usa.",
      responses: { "200": json(lista("Banimento"), "Os banidos."), "403": erroRef("SemPermissao"), "404": erroRef("ServidorDesconhecido"), ...ERROS_COMUNS },
      "x-permissao": "BAN_MEMBERS",
      "x-estado": "parcial",
    },
  },

  "/guilds/{guild_id}/bans/{user_id}": {
    parameters: [naRota("guild_id", "O id do servidor."), naRota("user_id", "O id da pessoa.")],
    put: {
      operationId: "banir",
      tags: ["Banimentos"],
      summary: "Bane alguém",
      description:
        "204 sem corpo. `delete_message_seconds` apaga o histórico recente do banido, convertido para horas arredondadas **para cima** — 'apaga a última hora' nunca apaga menos do que você pediu.\n\n**Duas divergências declaradas.** (1) Banir aqui exige `MODERATE_MEMBERS` **além** de `BAN_MEMBERS`, porque é isso que a regra de moderação do Streamz pede; não duplicamos o caminho de autorização só para igualar o Discord. Na prática, o cargo de um bot de moderação tem as duas. (2) **Só se bane quem é membro**: no Discord dá para banir um id qualquer, aqui a regra age sobre o membro, e quem não é (inclusive quem já está banido) leva `10007` em vez de um 204 mentiroso.",
      parameters: [{ $ref: "#/components/parameters/MotivoDeAuditoria" }],
      requestBody: { required: false, content: { "application/json": { schema: ref("Banir") } } },
      responses: {
        "204": semConteudo("Banido."),
        "400": erroRef("CorpoInvalido"),
        "403": erroRef("SemPermissao"),
        "404": json(ref("Erro"), "`10007 Unknown Member` — inclusive quem nunca entrou no servidor."),
        ...ERROS_COMUNS,
      },
      "x-permissao": "BAN_MEMBERS + MODERATE_MEMBERS + hierarquia",
      "x-estado": "parcial",
      "x-exemplo-discordjs": {
        titulo: "Banir apagando um dia de mensagens",
        codigo: `await guild.bans.create(userId, {
  reason: "spam",
  deleteMessageSeconds: 24 * 60 * 60,
});`,
      },
    },
    delete: {
      operationId: "desbanir",
      tags: ["Banimentos"],
      summary: "Desbane alguém",
      description: "204. Quem não estava banido leva `10026 Unknown Ban` — que é o código que a biblioteca usa para dizer 'esse já não estava banido'.",
      responses: {
        "204": semConteudo("Desbanido."),
        "403": erroRef("SemPermissao"),
        "404": json(ref("Erro"), "`10026 Unknown Ban`."),
        ...ERROS_COMUNS,
      },
      "x-permissao": "BAN_MEMBERS",
      "x-estado": "estavel",
    },
  },

  "/channels/{channel_id}": {
    parameters: [naRota("channel_id", "O id do canal — ou de uma **categoria**, que no Discord também é canal.")],
    get: {
      operationId: "obterCanal",
      tags: ["Canais"],
      summary: "Um canal",
      description:
        "Resolve canal **e** categoria (tipo 4). A autorização é a de sempre: cargos do servidor mais as exceções do canal; canal privado de que o bot não faz parte responde `10003`, como se não existisse.",
      responses: { "200": json(ref("Canal"), "O canal ou a categoria."), "403": erroRef("SemPermissao"), "404": erroRef("CanalDesconhecido"), ...ERROS_COMUNS },
      "x-permissao": "VIEW_CHANNEL",
      "x-estado": "estavel",
    },
  },

  "/channels/{channel_id}/typing": {
    parameters: [naRota("channel_id", "O id do canal.")],
    post: {
      operationId: "marcarDigitando",
      tags: ["Canais"],
      summary: "Mostra 'o bot está digitando…'",
      description:
        "204 sem corpo. O indicador aparece na interface do Streamz como o de qualquer pessoa — o navegador não sabe que veio de um bot. Categoria não recebe mensagem, logo ninguém digita nela: `10003`.",
      responses: { "204": semConteudo("Indicador emitido."), "403": erroRef("SemPermissao"), "404": erroRef("CanalDesconhecido"), ...ERROS_COMUNS },
      "x-permissao": "VIEW_CHANNEL",
      "x-estado": "estavel",
      "x-exemplo-discordjs": {
        titulo: "Enquanto o bot pensa",
        codigo: `await canal.sendTyping();
const resposta = await tarefaDemorada();
await canal.send(resposta);`,
      },
    },
  },

  "/channels/{channel_id}/messages": {
    parameters: [naRota("channel_id", "O id do canal (de servidor ou de conversa direta).")],
    get: {
      operationId: "listarMensagens",
      tags: ["Mensagens"],
      summary: "O histórico do canal",
      description:
        "Paginação por snowflake. Um cursor que não é snowflake é tratado como **ausente**, não como erro — é o que o Discord faz.\n\nConversa direta e canal de servidor usam a mesma rota: aqui, DM **é** canal.",
      parameters: [
        { name: "limit", in: "query", required: false, description: "1..100. Padrão 50.", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
        { name: "before", in: "query", required: false, description: "Mensagens anteriores a este id.", schema: ref("Snowflake") },
        { name: "after", in: "query", required: false, description: "Mensagens posteriores a este id.", schema: ref("Snowflake") },
        { name: "around", in: "query", required: false, description: "Uma janela em torno deste id.", schema: ref("Snowflake") },
      ],
      responses: { "200": json(lista("Mensagem"), "As mensagens, da mais nova para a mais velha."), "403": erroRef("SemPermissao"), "404": erroRef("CanalDesconhecido"), ...ERROS_COMUNS },
      "x-permissao": "VIEW_CHANNEL",
      "x-estado": "estavel",
    },
    post: {
      operationId: "criarMensagem",
      tags: ["Mensagens"],
      summary: "Escreve uma mensagem",
      description:
        "Aceita **JSON** ou **`multipart/form-data`** (`payload_json` + `files[0]`, `files[1]`…), que é como toda biblioteca envia arquivo. O `attachments[]` do payload pareia cada arquivo pelo índice e dá o nome que vale; `attachment://<nome>` num embed resolve para o arquivo pareado.\n\nA validação vem **antes** do upload: corpo recusado não deixa arquivo órfão no armazenamento.\n\nA mensagem aparece na interface do Streamz na hora, sem recarregar — a casca emite o mesmo evento interno que o compositor do navegador emitiria.\n\nRegras que valem aqui e você não controla: modo lento do canal, castigo do membro, e 'escrever exige poder ler'.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: ref("CriacaoDeMensagem"),
            example: { content: "pong", message_reference: { message_id: "1382915770057249472" } },
          },
          "multipart/form-data": {
            schema: {
              type: "object",
              description: `No máximo ${MAX_ATTACHMENTS_PER_MESSAGE} arquivos, ${MAX_ATTACHMENT_SIZE} bytes cada.`,
              properties: {
                payload_json: { type: "string", description: "O JSON de `CriacaoDeMensagem`, como texto. JSON quebrado leva `50109`." },
                "files[0]": { type: "string", format: "binary", description: "O arquivo. `files[1]`, `files[2]`… para os demais." },
              },
            },
          },
        },
      },
      responses: {
        "201": json(ref("Mensagem"), "A mensagem criada."),
        "400": erroRef("CorpoInvalido"),
        "403": erroRef("SemPermissao"),
        "404": json(ref("Erro"), "`10003 Unknown Channel`, ou `10008` quando a mensagem citada não existe."),
        "501": erroRef("NaoImplementado"),
        ...ERROS_COMUNS,
      },
      "x-permissao": "VIEW_CHANNEL + SEND_MESSAGES (+ ATTACH_FILES com arquivo)",
      "x-estado": "estavel",
      "x-exemplo-discordjs": {
        titulo: "Responder com embed e arquivo",
        codigo: `client.on("messageCreate", async (m) => {
  if (m.content !== "!placar") return;
  await m.reply({
    embeds: [{ title: "Placar", image: { url: "attachment://placar.png" } }],
    files: [{ attachment: "./placar.png", name: "placar.png" }],
  });
});`,
      },
    },
  },

  "/channels/{channel_id}/messages/bulk-delete": {
    parameters: [naRota("channel_id", "O id do canal.")],
    post: {
      operationId: "apagarMensagensEmLote",
      tags: ["Mensagens"],
      summary: "Apaga de 2 a 100 mensagens de uma vez",
      description:
        "204 sem corpo. É o `channel.bulkDelete(5)` e o `/limpar` de todo bot de moderação.\n\nDuas regras do Discord valem aqui: **2 a 100** (um lote de 1 é recusado com `50035`, e é isso que faz a biblioteca cair para o `DELETE` de uma mensagem só) e **nada com mais de 14 dias** (`50034`) — a idade sai do próprio id, sem consultar o banco.\n\nIds de **outro canal** são recusados: senão a rota seria um jeito de apagar onde o bot não modera.",
      requestBody: { required: true, content: { "application/json": { schema: ref("RemocaoEmLote") } } },
      responses: {
        "204": semConteudo("Apagadas."),
        "400": json(ref("Erro"), "`50035` (fora de 2..100) ou `50034` (mensagem de mais de 14 dias)."),
        "403": erroRef("SemPermissao"),
        "404": json(ref("Erro"), "`10008` quando nenhum dos ids existe mais."),
        ...ERROS_COMUNS,
      },
      "x-permissao": "MANAGE_MESSAGES",
      "x-estado": "estavel",
    },
  },

  "/channels/{channel_id}/messages/{message_id}": {
    parameters: [naRota("channel_id", "O id do canal."), naRota("message_id", "O id da mensagem.")],
    get: {
      operationId: "obterMensagem",
      tags: ["Mensagens"],
      summary: "Uma mensagem",
      description: "Mensagem que existe mas é de **outro** canal responde `10008`: o `channel_id` do caminho é o que autoriza a leitura.",
      responses: { "200": json(ref("Mensagem"), "A mensagem."), "403": erroRef("SemPermissao"), "404": erroRef("MensagemDesconhecida"), ...ERROS_COMUNS },
      "x-permissao": "VIEW_CHANNEL",
      "x-estado": "estavel",
    },
    patch: {
      operationId: "editarMensagem",
      tags: ["Mensagens"],
      summary: "Edita uma mensagem",
      description:
        "Só o autor edita — e o bot é autor das mensagens dele. Semântica de PATCH: ausente não mexe, presente substitui. Um corpo sem `content`, `embeds`, `components` nem `flags` é um no-op que devolve a mensagem.",
      requestBody: { required: true, content: { "application/json": { schema: ref("EdicaoDeMensagem") } } },
      responses: {
        "200": json(ref("Mensagem"), "A mensagem como ficou."),
        "400": erroRef("CorpoInvalido"),
        "403": erroRef("SemPermissao"),
        "404": erroRef("MensagemDesconhecida"),
        ...ERROS_COMUNS,
      },
      "x-permissao": "ser o autor",
      "x-estado": "estavel",
    },
    delete: {
      operationId: "apagarMensagem",
      tags: ["Mensagens"],
      summary: "Apaga uma mensagem",
      description: "204 sem corpo. O autor apaga a dele; apagar a de outra pessoa exige `MANAGE_MESSAGES`.",
      responses: { "204": semConteudo("Apagada."), "403": erroRef("SemPermissao"), "404": erroRef("MensagemDesconhecida"), ...ERROS_COMUNS },
      "x-permissao": "ser o autor, ou MANAGE_MESSAGES",
      "x-estado": "estavel",
    },
  },

  "/channels/{channel_id}/messages/{message_id}/reactions": {
    parameters: [naRota("channel_id", "O id do canal."), naRota("message_id", "O id da mensagem.")],
    delete: {
      operationId: "limparTodasAsReacoes",
      tags: ["Reações"],
      summary: "Limpa **todas** as reações da mensagem",
      description: "204 sem corpo. Gera `MESSAGE_REACTION_REMOVE_ALL` no gateway.",
      responses: { "204": semConteudo("Limpas."), "403": erroRef("SemPermissao"), "404": erroRef("MensagemDesconhecida"), ...ERROS_COMUNS },
      "x-permissao": "MANAGE_MESSAGES",
      "x-estado": "estavel",
    },
  },

  "/channels/{channel_id}/messages/{message_id}/reactions/{emoji}": {
    parameters: [
      naRota("channel_id", "O id do canal."),
      naRota("message_id", "O id da mensagem."),
      {
        name: "emoji",
        in: "path",
        required: true,
        description:
          "Unicode **percent-encoded** (`%F0%9F%91%8D` para 👍) ou personalizado como `nome:snowflake`. Emoji personalizado que não é deste Streamz leva `10014` — o caso comum é copiar o id de um emoji do Discord.",
        schema: { type: "string" },
        example: "%F0%9F%91%8D",
      },
    ],
    get: {
      operationId: "listarQuemReagiu",
      tags: ["Reações"],
      summary: "Quem reagiu com aquele emoji",
      description: "A rota do bot de votação (`reaction.users.fetch()`). O cursor é o snowflake do usuário.",
      parameters: [
        { name: "limit", in: "query", required: false, description: "1..100. Padrão 25.", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
        { name: "after", in: "query", required: false, description: "Depois deste usuário.", schema: ref("Snowflake") },
      ],
      responses: { "200": json(lista("Usuario"), "Quem reagiu."), "403": erroRef("SemPermissao"), "404": json(ref("Erro"), "`10008` ou `10014`."), ...ERROS_COMUNS },
      "x-permissao": "VIEW_CHANNEL",
      "x-estado": "estavel",
    },
    delete: {
      operationId: "limparReacoesDeUmEmoji",
      tags: ["Reações"],
      summary: "Limpa as reações de um emoji só",
      description: "204 sem corpo. Gera `MESSAGE_REACTION_REMOVE_EMOJI`.",
      responses: { "204": semConteudo("Limpas."), "403": erroRef("SemPermissao"), "404": json(ref("Erro"), "`10008` ou `10014`."), ...ERROS_COMUNS },
      "x-permissao": "MANAGE_MESSAGES",
      "x-estado": "estavel",
    },
  },

  "/channels/{channel_id}/messages/{message_id}/reactions/{emoji}/@me": {
    parameters: [
      naRota("channel_id", "O id do canal."),
      naRota("message_id", "O id da mensagem."),
      { name: "emoji", in: "path", required: true, description: "Unicode percent-encoded, ou `nome:snowflake`.", schema: { type: "string" } },
    ],
    put: {
      operationId: "reagir",
      tags: ["Reações"],
      summary: "O bot reage",
      description: "204 sem corpo. Gera `MESSAGE_REACTION_ADD` para os bots e atualiza a mensagem na interface.",
      responses: { "204": semConteudo("Reagiu."), "403": erroRef("SemPermissao"), "404": json(ref("Erro"), "`10008` ou `10014`."), ...ERROS_COMUNS },
      "x-permissao": "ADD_REACTIONS",
      "x-estado": "estavel",
      "x-exemplo-discordjs": {
        titulo: "Enquete de um botão só",
        codigo: `const m = await canal.send("Vamos hoje?");
await m.react("👍");
await m.react("👎");`,
      },
    },
    delete: {
      operationId: "desreagir",
      tags: ["Reações"],
      summary: "O bot tira a própria reação",
      description:
        "204 sem corpo, e idempotente: tirar uma reação que o bot não tinha posto também responde 204. Gera `MESSAGE_REACTION_REMOVE` no gateway.",
      responses: { "204": semConteudo("Reação removida."), "403": erroRef("SemPermissao"), "404": json(ref("Erro"), "`10008` ou `10014`."), ...ERROS_COMUNS },
      "x-permissao": null,
      "x-estado": "estavel",
    },
  },

  "/channels/{channel_id}/messages/{message_id}/reactions/{emoji}/{user_id}": {
    parameters: [
      naRota("channel_id", "O id do canal."),
      naRota("message_id", "O id da mensagem."),
      { name: "emoji", in: "path", required: true, description: "Unicode percent-encoded, ou `nome:snowflake`.", schema: { type: "string" } },
      naRota("user_id", "De quem tirar a reação. Para o próprio bot, use a rota `/@me`."),
    ],
    delete: {
      operationId: "tirarReacaoDeAlguem",
      tags: ["Reações"],
      summary: "Tira a reação de outra pessoa",
      description:
        "204 sem corpo, e **idempotente**: usuário que não existe ou que não tinha reagido também dá 204, como no Discord.",
      responses: { "204": semConteudo("Reação removida (ou não havia nada a remover)."), "403": erroRef("SemPermissao"), "404": json(ref("Erro"), "`10008` ou `10014`."), ...ERROS_COMUNS },
      "x-permissao": "MANAGE_MESSAGES",
      "x-estado": "estavel",
    },
  },

  "/interactions/{interaction_id}/{interaction_token}/callback": {
    parameters: [
      naRota("interaction_id", "O `id` da interação que chegou no `INTERACTION_CREATE`."),
      {
        name: "interaction_token",
        in: "path",
        required: true,
        description: "O `token` da interação. **É o credencial desta rota** — não mande `Authorization`.",
        schema: { type: "string" },
      },
    ],
    post: {
      operationId: "responderInteracao",
      tags: ["Interações"],
      summary: "Responde a uma interação",
      description:
        "**Sem `Authorization`**, e isso não é esquecimento: o `@discordjs/rest` manda o callback com `auth: false`, e o discord.py faz o mesmo. Um guard aqui daria 401 em todo `reply()` do planeta. O credencial é o token do caminho.\n\nVocê tem **3 segundos**. Tipo 4 responde já; tipo 5 mostra 'pensando…' e te dá 15 minutos para o `editReply()`.\n\nA resposta padrão é **204 sem corpo**. Com `?with_response=1` ela vira **200 com o objeto de callback** — o discord.py 2.6+ manda esse parâmetro e lê o corpo sem default; devolver 204 ali trava o bot dentro da biblioteca, sem erro no log.\n\nSegundo callback na mesma interação leva `40060`.",
      security: [],
      parameters: [
        {
          name: "with_response",
          in: "query",
          required: false,
          description: "`1` ou `true` pedem o corpo. Ausente, vazio, `0` e `false` valem 'não'.",
          schema: { type: "string" },
        },
      ],
      requestBody: { required: true, content: { "application/json": { schema: ref("CorpoDeCallback"), example: { type: 4, data: { content: "pong", flags: 64 } } } } },
      responses: {
        "200": json(ref("RespostaDeCallback"), "Só com `?with_response`."),
        "204": semConteudo("O padrão: reconhecido, sem corpo."),
        "400": json(ref("Erro"), "`50035` (corpo inválido) ou `40060` (já respondida)."),
        "404": erroRef("InteracaoDesconhecida"),
        "429": erroRef("LimiteExcedido"),
        "500": erroRef("ErroInterno"),
      },
      "x-permissao": null,
      "x-estado": "estavel",
      "x-exemplo-discordjs": {
        titulo: "Comando com resposta demorada",
        codigo: `client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;
  await i.deferReply();           // callback tipo 5, dentro de 3 s
  const letra = await buscarLetra(i.options.getString("musica"));
  await i.editReply(letra);       // PATCH /webhooks/{app}/{token}/messages/@original
});`,
      },
    },
  },

  "/webhooks/{application_id}/{interaction_token}": {
    parameters: [
      naRota("application_id", "O id do aplicativo da interação."),
      { name: "interaction_token", in: "path", required: true, description: "O token da interação. É o credencial — não mande `Authorization`.", schema: { type: "string" } },
    ],
    post: {
      operationId: "criarFollowup",
      tags: ["Interações"],
      summary: "Followup: uma mensagem nova da mesma interação",
      description:
        "É o `followUp()`. **200 e não 201** — é o que o Discord devolve, e a biblioteca espera a mensagem de volta.\n\nAceita `multipart/form-data` como o `POST` de mensagem. O token é conferido **antes** do upload: sem interação válida, nenhum byte vai para o armazenamento.\n\n`:application_id` que não bate com o da interação leva `10062`, não 403: para quem não tem o token, a interação não existe.",
      security: [],
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: ref("CorpoDeFollowup") },
          "multipart/form-data": {
            schema: {
              type: "object",
              properties: {
                payload_json: { type: "string", description: "O JSON de `CorpoDeFollowup`, como texto." },
                "files[0]": { type: "string", format: "binary" },
              },
            },
          },
        },
      },
      responses: {
        "200": json(ref("Mensagem"), "A mensagem do followup. Efêmera vem com `flags: 64`."),
        "400": erroRef("CorpoInvalido"),
        "404": erroRef("InteracaoDesconhecida"),
        "429": erroRef("LimiteExcedido"),
        "500": erroRef("ErroInterno"),
      },
      "x-permissao": null,
      "x-estado": "estavel",
    },
  },

  "/webhooks/{application_id}/{interaction_token}/messages/@original": {
    parameters: [
      naRota("application_id", "O id do aplicativo da interação."),
      { name: "interaction_token", in: "path", required: true, description: "O token da interação.", schema: { type: "string" } },
    ],
    get: {
      operationId: "lerRespostaOriginal",
      tags: ["Interações"],
      summary: "Lê a resposta original",
      description:
        "É o `fetchReply()`: a mensagem que o callback criou, inclusive quando ela é efêmera (que vem com `flags: 64`). Vale enquanto o token da interação valer — 15 minutos.",
      security: [],
      responses: { "200": json(ref("Mensagem"), "A mensagem da resposta."), "404": erroRef("InteracaoDesconhecida"), "429": erroRef("LimiteExcedido"), "500": erroRef("ErroInterno") },
      "x-permissao": null,
      "x-estado": "estavel",
    },
    patch: {
      operationId: "editarRespostaOriginal",
      tags: ["Interações"],
      summary: "Edita a resposta original",
      description:
        "É o `editReply()` — o que transforma o 'pensando…' na resposta de verdade. Vale por **15 minutos** a partir da interação.\n\nA biblioteca de JavaScript manda o caminho como `%40original`; a de Python manda `@original`. As duas formas funcionam.",
      security: [],
      requestBody: { required: true, content: { "application/json": { schema: ref("CorpoDeFollowup") } } },
      responses: {
        "200": json(ref("Mensagem"), "A mensagem como ficou."),
        "400": erroRef("CorpoInvalido"),
        "404": erroRef("InteracaoDesconhecida"),
        "429": erroRef("LimiteExcedido"),
        "500": erroRef("ErroInterno"),
      },
      "x-permissao": null,
      "x-estado": "estavel",
    },
    delete: {
      operationId: "apagarRespostaOriginal",
      tags: ["Interações"],
      summary: "Apaga a resposta original",
      description:
        "É o `deleteReply()`. 204 sem corpo. Apaga a mensagem que o callback criou; os followups posteriores continuam de pé, e cada um se apaga por si.",
      security: [],
      responses: { "204": semConteudo("Apagada."), "404": erroRef("InteracaoDesconhecida"), "429": erroRef("LimiteExcedido"), "500": erroRef("ErroInterno") },
      "x-permissao": null,
      "x-estado": "estavel",
    },
  },

  "/webhooks/{application_id}/{interaction_token}/messages/{message_id}": {
    parameters: [
      naRota("application_id", "O id do aplicativo da interação."),
      { name: "interaction_token", in: "path", required: true, description: "O token da interação.", schema: { type: "string" } },
      {
        name: "message_id",
        in: "path",
        required: true,
        description: "O id da mensagem do followup. **Só `@original` (ou `%40original`) funciona**; qualquer outro id leva 501.",
        schema: { type: "string" },
      },
    ],
    get: {
      operationId: "lerFollowup",
      tags: ["Interações"],
      summary: "Lê um followup pelo id — **só `@original`**",
      description:
        "Com `@original`, é a mesma coisa que a rota acima (a biblioteca de JavaScript manda o `@` escapado, e é por aqui que ele cai). Com um id de mensagem de verdade: **501 `20012`**. Existe para você ler no log o que falta, em vez do 404 genérico.",
      deprecated: true,
      security: [],
      responses: { "200": json(ref("Mensagem"), "Quando o id é `@original`."), "404": erroRef("InteracaoDesconhecida"), "501": erroRef("NaoImplementado"), "429": erroRef("LimiteExcedido"), "500": erroRef("ErroInterno") },
      "x-permissao": null,
      "x-estado": "parcial",
    },
    patch: {
      operationId: "editarFollowup",
      tags: ["Interações"],
      summary: "Edita um followup pelo id — **só `@original`**",
      description: "Mesma história do `GET`: `@original` funciona (é por aqui que o `editReply()` do discord.js cai, com o `@` escapado); outro id leva 501.",
      deprecated: true,
      security: [],
      requestBody: { required: true, content: { "application/json": { schema: ref("CorpoDeFollowup") } } },
      responses: { "200": json(ref("Mensagem"), "Quando o id é `@original`."), "400": erroRef("CorpoInvalido"), "404": erroRef("InteracaoDesconhecida"), "501": erroRef("NaoImplementado"), "429": erroRef("LimiteExcedido"), "500": erroRef("ErroInterno") },
      "x-permissao": null,
      "x-estado": "parcial",
    },
    delete: {
      operationId: "apagarFollowup",
      tags: ["Interações"],
      summary: "Apaga um followup pelo id — **só `@original`**",
      description: "204 quando o id é `@original`; 501 para qualquer outro.",
      deprecated: true,
      security: [],
      responses: { "204": semConteudo("Apagada."), "404": erroRef("InteracaoDesconhecida"), "501": erroRef("NaoImplementado"), "429": erroRef("LimiteExcedido"), "500": erroRef("ErroInterno") },
      "x-permissao": null,
      "x-estado": "parcial",
    },
  },

  "/openapi.json": {
    get: {
      operationId: "obterEspecificacao",
      tags: ["Documentação"],
      summary: "Esta especificação",
      description:
        "Pública, sem token. É o documento que a página de documentação do site renderiza, e é a fonte que você pode apontar para um gerador de cliente.",
      security: [],
      responses: {
        "200": {
          description: "A especificação OpenAPI 3.1 desta API.",
          headers: { "Cache-Control": { description: "`public, max-age=300`.", schema: { type: "string" } } },
          content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
        },
      },
      "x-permissao": null,
      "x-estado": "estavel",
    },
  },
};

// ── o documento ──────────────────────────────────────────────

export const OPENAPI_COMPAT: DocumentoOpenAPI = {
  openapi: "3.1.0",

  info: {
    title: "API de Bots do Streamz",
    version: versaoDaApi(),
    summary: "A API compatível com o Discord: o mesmo protocolo, a sua URL.",
    description: `Esta é a superfície que um autor de bot usa no Streamz. Ela fala o **mesmo
protocolo do Discord** — as mesmas rotas, os mesmos nomes de campo, os mesmos
códigos de erro e o mesmo gateway WebSocket —, de modo que um bot escrito com
\`discord.js\`, \`discord.py\` ou Lavalink roda aqui trocando **a URL base e o
token**.

Ela é uma **casca**: nada aqui dentro reimplementa regra de negócio. Permissão,
hierarquia de cargo, modo lento, castigo e visibilidade de canal são os mesmos
do resto do Streamz — o que esta camada faz é traduzir a entrada e a saída.
Consequência prática: o que a interface recusa, a API de bots também recusa, e
pelo mesmo motivo.

Comece pelo guia **Primeiros passos**; as divergências em relação ao Discord
estão reunidas, sem maquiagem, em **O que não existe aqui**.`,
    contact: { name: "Streamz" },
  },

  servers: [
    {
      url: "https://api.streamz.chat/api/{versao}",
      description: "Produção. `v10` e `v9` servem exatamente as mesmas rotas — as diferenças reais entre as duas versões não tocam nada do que implementamos.",
      variables: {
        versao: { default: "v10", enum: ["v10", "v9"], description: "A versão da API. Use `v10`." },
      },
    },
    {
      url: "http://localhost:3333/api/{versao}",
      description: "Desenvolvimento local.",
      variables: {
        versao: { default: "v10", enum: ["v10", "v9"], description: "A versão da API." },
      },
    },
  ],

  tags: [
    { name: "Gateway", description: "A URL do WebSocket e os limites de sessão. É por onde toda biblioteca começa." },
    { name: "Usuários", description: "O usuário-bot, as outras pessoas e a abertura de conversa direta." },
    { name: "Aplicativos", description: "O aplicativo do token, nas duas rotas que as bibliotecas pedem." },
    { name: "Comandos", description: "Registro dos comandos de barra, global ou por servidor. Subcomandos e menus de contexto ainda não existem." },
    { name: "Servidores", description: "Leitura de servidor e da estrutura dele. O bot só enxerga servidor de que é membro." },
    { name: "Membros", description: "Cargos, castigo e expulsão. Tudo passa pela hierarquia de cargos." },
    { name: "Banimentos", description: "Banir, desbanir e listar. Sem paginação, e só sobre quem é membro." },
    { name: "Cargos", description: "Criar, editar e listar cargos. Não há rota para apagar." },
    { name: "Canais", description: "Leitura de canal (categoria inclusa) e o indicador de digitação." },
    { name: "Mensagens", description: "Histórico, envio (com arquivo), edição, remoção e remoção em lote. Conversa direta usa as mesmas rotas." },
    { name: "Reações", description: "As seis rotas de reação, com emoji unicode ou personalizado." },
    { name: "Interações", description: "Callback e followups. As interações **chegam pelo gateway**; estas rotas são só a resposta." },
    { name: "Documentação", description: "A própria especificação, pública." },
  ],

  security: [{ tokenDeBot: [] }],

  paths: CAMINHOS,

  components: {
    securitySchemes: {
      tokenDeBot: {
        type: "apiKey",
        in: "header",
        name: "Authorization",
        description:
          "O token do aplicativo, com o prefixo **obrigatório** `Bot `:\n\n```\nAuthorization: Bot MTM4MjkxNTc3MDA1NzI0OTQ3Mg.aGVjNzUx.j3lQ_9d…\n```\n\nO prefixo é o que faz este esquema conviver com o `Bearer` do app web sem se pisarem. Qualquer falha (ausente, prefixo errado, desconhecido, revogado) dá o mesmo 401.",
      },
    },
    parameters: PARAMETROS,
    responses: RESPOSTAS_REAPROVEITADAS,
    schemas: ESQUEMAS,
  },

  // ── as extensões que a página de documentação consome ──

  /** Os capítulos de texto corrido, em Markdown. Ver `GuiaDaDocumentacao`. */
  "x-guias": GUIAS,

  /** A tradução de permissões Streamz ↔ Discord (§6 / D8). */
  "x-tabela-permissoes": TABELA_DE_PERMISSOES,

  /** Os intents do gateway e o que cada um libera. */
  "x-intents": INTENTS_DOCUMENTADOS,

  /** Os opcodes do gateway e o suporte de cada um. */
  "x-opcodes": OPCODES_DOCUMENTADOS,

  /** Os eventos `DISPATCH` que emitimos, com o intent que os libera. */
  "x-eventos-gateway": EVENTOS_DO_GATEWAY,

  /** Os códigos de fechamento do WebSocket. `reconecta: false` = irrecuperável. */
  "x-codigos-de-fechamento": FECHAMENTOS_DOCUMENTADOS,

  /** Os códigos do corpo de erro — é por eles que as bibliotecas classificam. */
  "x-codigos-de-erro": CODIGOS_DE_ERRO,
};
