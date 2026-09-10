/**
 * Provisionamento dos bots oficiais: garante que cada bot de `src/` exista
 * como `Application` na instância, com ícone, descrição, publicado no
 * diretório e marcado como **oficial**.
 *
 *   pnpm --filter @streamz/bots provisionar
 *   pnpm --filter @streamz/bots provisionar -- --regenerar-token
 *
 * É **idempotente**: rodar duas vezes não cria dois aplicativos. A chave é o
 * `name` (o `nome` que a pasta do bot exporta) dentro da lista de aplicativos
 * de quem está autenticado — não há campo de "slug" na `Application`, e
 * inventar um só para isto seria uma migration a mais para uma comparação de
 * string.
 *
 * ## Credencial
 *
 * `POST /api/applications` é o REST **interno**, autenticado como usuário
 * (`Authorization: Bearer`). Então o script precisa entrar como o dono dos
 * bots. Duas formas, nesta ordem:
 *
 *   - `BOTS_TOKEN` — um `accessToken` já obtido (útil em CI e na bancada);
 *   - `BOTS_EMAIL` + `BOTS_SENHA` — login normal (`POST /auth/login`), que é
 *     o caminho da mão.
 *
 * A conta precisa ser **administradora da instância** (`PLATFORM_ADMIN_EMAILS`)
 * para a marca de "oficial" pegar. Sem isso o resto funciona e o script avisa.
 *
 * ## Onde o token do bot é guardado
 *
 * Em `<BOTS_DIR>/<id>.token` (padrão `/opt/stack/streamz/.bots/`), arquivo
 * `chmod 600` num diretório `chmod 700`. **Nunca** no repositório e **nunca**
 * no `.env` da raiz: o `.env` é produção viva — a API e a web o leem —, e um
 * arquivo à parte é a mudança mais barata que não põe o site em risco. O
 * `.gitignore` já cobre `.bots/`.
 *
 * O token em claro só existe **uma vez**, na resposta do `POST /applications`.
 * Se o aplicativo já existe e o arquivo sumiu, o script avisa e não faz nada:
 * regenerar derruba o bot que estiver rodando. Com `--regenerar-token` ele
 * regenera de propósito.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { criarLog } from "./runtime/log";
import { carregarBot, idsDisponiveis } from "./runtime/registro";
import { caminhoDoToken, diretorioDosTokens } from "./runtime/token";
import type { Bot } from "./runtime/tipos";

const log = criarLog("provisionar");
const REGENERAR = process.argv.includes("--regenerar-token");

function api(): string {
  return (process.env.STREAMZ_API_URL ?? "http://localhost:3333/api").replace(/\/+$/, "");
}

interface Resposta<T> {
  status: number;
  corpo: T;
}

async function chamar<T = unknown>(
  rota: string,
  opcoes: { metodo?: string; corpo?: unknown; token?: string; forma?: FormData } = {},
): Promise<Resposta<T>> {
  const { metodo = "GET", corpo, token, forma } = opcoes;
  const resposta = await fetch(`${api()}${rota}`, {
    method: metodo,
    headers: {
      // Com `FormData` o `fetch` põe o `content-type` com o boundary sozinho;
      // defini-lo à mão aqui quebraria o upload do ícone de um jeito difícil de ver.
      ...(forma ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(forma ? { body: forma } : corpo ? { body: JSON.stringify(corpo) } : {}),
  });
  const texto = await resposta.text();
  return {
    status: resposta.status,
    corpo: (texto ? JSON.parse(texto) : null) as T,
  };
}

/** Entra como o dono dos bots e devolve o `accessToken`. */
async function autenticar(): Promise<string> {
  const pronto = process.env.BOTS_TOKEN?.trim();
  if (pronto) return pronto;

  const identificador = process.env.BOTS_EMAIL?.trim();
  const senha = process.env.BOTS_SENHA;
  if (!identificador || !senha) {
    throw new Error(
      "defina BOTS_EMAIL e BOTS_SENHA (ou BOTS_TOKEN com um accessToken já obtido)",
    );
  }

  const r = await chamar<{ tokens?: { accessToken?: string }; ticket?: string }>("/auth/login", {
    metodo: "POST",
    corpo: { identificador, password: senha },
  });
  if (r.status !== 200 && r.status !== 201) {
    throw new Error(`login falhou (${r.status}): ${JSON.stringify(r.corpo).slice(0, 200)}`);
  }
  if (r.corpo?.ticket && !r.corpo?.tokens) {
    throw new Error(
      "essa conta tem 2FA: o provisionamento não sabe responder ao desafio. " +
        "Use BOTS_TOKEN com um accessToken de uma sessão já aberta.",
    );
  }
  const acesso = r.corpo?.tokens?.accessToken;
  if (!acesso) throw new Error("o login não devolveu accessToken");
  return acesso;
}

/** Grava o token do bot com permissão restrita. */
function gravarToken(id: string, token: string) {
  const pasta = diretorioDosTokens();
  mkdirSync(pasta, { recursive: true, mode: 0o700 });
  // O `mode` do `mkdirSync` não vale quando a pasta já existe, e o do
  // `writeFileSync` é filtrado pelo umask. Os dois `chmod` fecham os dois
  // buracos — sem eles um token nasce 644 numa máquina com umask 022.
  chmodSync(pasta, 0o700);
  const caminho = caminhoDoToken(id);
  writeFileSync(caminho, `${token}\n`, { mode: 0o600 });
  chmodSync(caminho, 0o600);
  log.info("token gravado", { caminho });
}

interface AppDaLista {
  id: string;
  name: string;
  description: string | null;
}

/** O ícone, se o bot declarou um e o arquivo existe. */
function lerIcone(bot: Bot): { nome: string; bytes: Buffer } | null {
  if (!bot.icone) return null;
  // `__dirname` é `dist/`; os assets ficam na raiz do pacote, ao lado dele.
  const caminho = join(__dirname, "..", bot.icone);
  if (!existsSync(caminho)) {
    log.aviso("o bot declara um ícone que não existe", { caminho });
    return null;
  }
  return { nome: caminho.split("/").pop() ?? "icone.png", bytes: readFileSync(caminho) };
}

async function provisionarUm(id: string, acesso: string, existentes: AppDaLista[]) {
  const bot = carregarBot(id);
  const jaExiste = existentes.find((a) => a.name === bot.nome);

  let applicationId: string;
  if (!jaExiste) {
    const r = await chamar<{ app: { id: string }; token: { token: string } }>("/applications", {
      metodo: "POST",
      corpo: { name: bot.nome },
      token: acesso,
    });
    if (r.status !== 200 && r.status !== 201) {
      throw new Error(`não deu para criar "${bot.nome}" (${r.status}): ${JSON.stringify(r.corpo)}`);
    }
    applicationId = r.corpo.app.id;
    gravarToken(id, r.corpo.token.token);
    log.info("aplicativo criado", { bot: id, nome: bot.nome, applicationId });
  } else {
    applicationId = jaExiste.id;
    log.info("aplicativo já existia", { bot: id, nome: bot.nome, applicationId });

    const temArquivo = existsSync(caminhoDoToken(id));
    if (!temArquivo && REGENERAR) {
      const r = await chamar<{ token: string }>(`/applications/${applicationId}/token`, {
        metodo: "POST",
        token: acesso,
      });
      if (r.status !== 200 && r.status !== 201) {
        throw new Error(`não deu para regenerar o token (${r.status})`);
      }
      gravarToken(id, r.corpo.token);
      log.aviso("token regenerado: o bot que estivesse com o antigo parou agora", { bot: id });
    } else if (!temArquivo) {
      log.aviso(
        "o aplicativo existe mas não há token guardado. O token em claro só sai na criação; " +
          "rode com --regenerar-token para emitir um novo (isso derruba o bot que estiver no ar).",
        { bot: id, caminho: caminhoDoToken(id) },
      );
    }
  }

  // Identidade e publicação no diretório. `publico: true` é o que faz o bot
  // aparecer em "Descobrir aplicativos".
  const patch = await chamar(`/applications/${applicationId}`, {
    metodo: "PATCH",
    token: acesso,
    corpo: {
      name: bot.nome,
      description: bot.descricao,
      publico: true,
      ...(bot.permissoesPadrao !== undefined ? { permissoesPadrao: bot.permissoesPadrao } : {}),
    },
  });
  if (patch.status !== 200) {
    // O corpo vai junto de propósito: um 400 do `appEditarSchema` diz **qual**
    // campo não passou, e sem ele o erro é "400" e mais nada.
    throw new Error(
      `não deu para publicar "${bot.nome}" (${patch.status}): ${JSON.stringify(patch.corpo).slice(0, 300)}`,
    );
  }

  // O selo de oficial é do administrador da instância. Sem ele o bot funciona
  // igual — só não aparece na frente no diretório —, então 403 é aviso, não erro.
  const selo = await chamar(`/admin/applications/${applicationId}/oficial`, {
    metodo: "POST",
    token: acesso,
    corpo: { oficial: true },
  });
  if (selo.status === 403) {
    log.aviso(
      "a conta usada não é administradora da instância: o aplicativo ficou publicado, " +
        "mas sem o selo de oficial. Ver PLATFORM_ADMIN_EMAILS.",
      { bot: id },
    );
  } else if (selo.status !== 200 && selo.status !== 201) {
    log.aviso("não deu para marcar como oficial", { bot: id, status: selo.status });
  }

  // O ícone precisa do R2 configurado; sem ele a API responde 503 e o
  // aplicativo fica com a inicial do nome. Não é motivo para falhar tudo.
  const icone = lerIcone(bot);
  if (icone) {
    const forma = new FormData();
    forma.append("file", new Blob([new Uint8Array(icone.bytes)], { type: "image/png" }), icone.nome);
    const r = await chamar(`/applications/${applicationId}/icone`, {
      metodo: "POST",
      token: acesso,
      forma,
    });
    if (r.status === 200 || r.status === 201) log.info("ícone enviado", { bot: id });
    else if (r.status === 503) log.aviso("sem armazenamento (R2): o ícone ficou para depois", { bot: id });
    else log.aviso("o envio do ícone falhou", { bot: id, status: r.status });
  }

  return { id, nome: bot.nome, applicationId };
}

async function principal() {
  const ids = idsDisponiveis();
  log.info("provisionando", { api: api(), bots: ids, tokensEm: diretorioDosTokens() });

  const acesso = await autenticar();
  const lista = await chamar<AppDaLista[]>("/applications", { token: acesso });
  if (lista.status !== 200) {
    throw new Error(`não deu para listar os aplicativos (${lista.status})`);
  }

  const feitos = [];
  for (const id of ids) feitos.push(await provisionarUm(id, acesso, lista.corpo));

  log.info("pronto", { bots: feitos });
}

principal().catch((erro) => {
  log.erro("o provisionamento falhou", { erro });
  process.exit(1);
});
