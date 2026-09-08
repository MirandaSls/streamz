import { lookup as resolverDns } from "node:dns";
import { lookup as resolverDnsAsync } from "node:dns/promises";
import { request as pedirHttp, type IncomingMessage } from "node:http";
import { request as pedirHttps } from "node:https";
import { isIP, type LookupFunction } from "node:net";

/**
 * Busca de página para a prévia de link, endurecida contra SSRF.
 *
 * A API busca a página por conta do usuário, então a URL é escolhida por quem
 * ataca. Duas brechas moravam aqui:
 *
 * 1. O `fetch(url, { redirect: "follow" })` conferia o host UMA vez, o digitado.
 *    Bastava o servidor do atacante responder `302 Location:
 *    http://169.254.169.254/latest/meta-data/` que o undici seguia sem conferir
 *    nada, e o `<title>`/`og:description` de qualquer coisa interna que sirva
 *    HTML (Grafana, Kibana, a própria API) voltava dentro da prévia.
 * 2. Mesmo sem redirecionamento, o `lookup()` de conferência e o `fetch`
 *    resolviam o nome SEPARADAMENTE — um domínio com TTL 0 devolvia IP público
 *    na primeira consulta e `169.254.169.254` na segunda (DNS rebinding).
 *
 * A resposta para as duas é a mesma: conferir o IP no momento em que o socket
 * conecta, e não antes. É por isso que aqui se usa `node:http`/`node:https` em
 * vez de `fetch`: eles aceitam um `lookup` próprio, que o `net.connect` chama
 * com o IP que VAI ser usado — não sobra janela entre conferir e conectar. O
 * `fetch` do Node só aceitaria isso por um `dispatcher` do undici, que não é
 * dependência deste projeto (só `undici-types` entra, via `@types/node`), e
 * conectar direto no IP com o `Host` na mão quebraria o SNI do TLS.
 *
 * Os redirecionamentos passaram a ser seguidos à mão, com teto de saltos e a
 * conferência de esquema refeita a cada salto: o `lookup` sozinho fecharia o
 * IP, mas não impede um laço infinito de redirecionamentos nem um `Location:
 * file:///etc/passwd`.
 */

/** Redirecionamentos seguidos; acima disto é laço ou sonda, não navegação. */
const MAX_SALTOS = 3;
/** Bytes lidos da página, no máximo; as tags OG ficam no <head>. */
const MAX_BYTES = 512 * 1024;
/** Tempo limite da operação inteira, redirecionamentos e leitura incluídos. */
const TIMEOUT_MS = 5_000;

const REDIRECIONAMENTOS = new Set([301, 302, 303, 307, 308]);

export interface OpcoesDeBusca {
  /**
   * Diz se um IP pode ser conectado. Vale tanto para o nome digitado quanto
   * para cada salto e cada conexão. Injetável para os testes poderem usar um
   * servidor em 127.0.0.1 sem afrouxar a regra de verdade.
   */
  ipPermitido?: (ip: string) => boolean;
  maxSaltos?: number;
  maxBytes?: number;
  timeoutMs?: number;
}

/** Recusa loopback, redes privadas, CGNAT, multicast e reservados. */
export function ehIpPrivado(ip: string): boolean {
  // O que não é IP reconhecível não é conectável com segurança: nega.
  if (isIP(ip) === 0) return true;
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    return (
      v === "::" || // não especificado: em muitos sistemas conecta no loopback
      v === "::1" ||
      v.startsWith("fc") || // fc00::/7, únicos locais
      v.startsWith("fd") ||
      v.startsWith("fe80") ||
      v.startsWith("ff") || // ff00::/8, multicast
      v.startsWith("::ffff:") // IPv4 mapeado: não dá para confiar no que vem depois
    );
  }
  const [a, b, c] = ip.split(".").map(Number);
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10, CGNAT
    (a === 169 && b === 254) || // link-local, onde ficam os metadados da nuvem
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) || // 192.0.0.0/24, atribuições do IETF
    (a === 192 && b === 168) ||
    (a === 198 && b >= 18 && b <= 19) || // 198.18.0.0/15, testes de rede
    (a >= 224 && a <= 239) || // 224.0.0.0/4, multicast
    a >= 240 // 240.0.0.0/4, reservado, e 255.255.255.255
  );
}

const PUBLICO = (ip: string) => !ehIpPrivado(ip);

/** Só http(s): `file:`, `gopher:` e afins não são páginas, são leitura de disco/rede. */
export function exigirEsquemaWeb(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`esquema ${url.protocol} não é http(s)`);
  }
}

/** Confere o host antes de conectar. O `lookup` confere de novo, na conexão. */
export async function exigirHostPublico(host: string, ipPermitido: (ip: string) => boolean = PUBLICO) {
  // `new URL("http://[::1]/").hostname` vem com colchetes; sem tirá-los o
  // endereço não seria reconhecido como IP e escaparia da conferência.
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (!h || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) {
    throw new Error(`host interno ${host}`);
  }
  const ips = isIP(h) ? [h] : (await resolverDnsAsync(h, { all: true })).map((r) => r.address);
  for (const ip of ips) {
    if (!ipPermitido(ip)) throw new Error(`ip privado ${ip}`);
  }
}

/**
 * Busca o HTML da página seguindo os redirecionamentos à mão.
 *
 * Devolve o corpo já limitado a `maxBytes`; lança se o destino não for uma
 * página pública em http(s) devolvendo `text/html`.
 */
export async function buscarHtml(url: URL, opcoes: OpcoesDeBusca = {}): Promise<string> {
  const ipPermitido = opcoes.ipPermitido ?? PUBLICO;
  const maxSaltos = opcoes.maxSaltos ?? MAX_SALTOS;
  const maxBytes = opcoes.maxBytes ?? MAX_BYTES;
  const ctrl = new AbortController();
  const relogio = setTimeout(() => ctrl.abort(new Error("tempo limite")), opcoes.timeoutMs ?? TIMEOUT_MS);
  try {
    let atual = url;
    for (let saltos = 0; ; saltos += 1) {
      // Refeitos a cada salto: o destino do `Location` é tão do atacante
      // quanto a URL digitada, e vale exatamente a mesma desconfiança.
      exigirEsquemaWeb(atual);
      await exigirHostPublico(atual.hostname, ipPermitido);
      const res = await abrir(atual, ipPermitido, ctrl.signal);
      const destino = REDIRECIONAMENTOS.has(res.statusCode ?? 0) ? res.headers.location : undefined;
      if (!destino) return await lerPagina(res, maxBytes);
      descartar(res);
      if (saltos >= maxSaltos) throw new Error(`redirecionamentos demais (teto ${maxSaltos})`);
      atual = proximaUrl(destino, atual);
    }
  } finally {
    clearTimeout(relogio);
  }
}

/** `Location` pode ser relativo — resolver contra a URL do salto, não a original. */
function proximaUrl(destino: string, atual: URL): URL {
  try {
    return new URL(destino, atual);
  } catch {
    throw new Error(`Location inválido: ${destino}`);
  }
}

function abrir(url: URL, ipPermitido: (ip: string) => boolean, signal: AbortSignal): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const pedir = url.protocol === "https:" ? pedirHttps : pedirHttp;
    const req = pedir(
      url,
      {
        signal,
        lookup: criarLookupSeguro(ipPermitido),
        headers: {
          // alguns sites só entregam OG para "bots" conhecidos
          "user-agent": "Mozilla/5.0 (compatible; StreamzBot/1.0; +https://streamz.dev)",
          accept: "text/html,application/xhtml+xml",
        },
      },
      resolve,
    );
    req.on("error", reject);
    req.end();
  });
}

/**
 * DNS que recusa a conexão quando o nome cai num IP interno.
 *
 * Este é o ponto que fecha o rebinding: quem responde aqui é quem o socket vai
 * usar, então não existe mais "resolveu público, conectou privado". O
 * `net.connect` chama isto com `all: true` ou `all: false` conforme a versão e
 * as opções, daí os dois formatos de resposta serem tratados.
 */
export function criarLookupSeguro(ipPermitido: (ip: string) => boolean = PUBLICO): LookupFunction {
  return (hostname, opcoes, callback) => {
    resolverDns(hostname, opcoes, (erro, endereco, familia) => {
      if (erro) return callback(erro, endereco, familia);
      const lista = Array.isArray(endereco) ? endereco.map((e) => e.address) : [endereco];
      const barrado = lista.find((ip) => !ipPermitido(ip));
      if (barrado) return callback(new Error(`ip privado ${barrado}`), "", 0);
      callback(null, endereco, familia);
    });
  };
}

/** Larga o corpo que não interessa sem deixar um 'error' sem ouvinte derrubar o processo. */
function descartar(res: IncomingMessage) {
  res.on("error", () => undefined);
  res.destroy();
}

function lerPagina(res: IncomingMessage, maxBytes: number): Promise<string> {
  const tipo = res.headers["content-type"] ?? "";
  const status = res.statusCode ?? 0;
  if (status < 200 || status > 299 || !tipo.includes("html")) {
    descartar(res);
    return Promise.reject(new Error(`resposta ${status} ${tipo}`));
  }
  return new Promise((resolve, reject) => {
    const partes: Buffer[] = [];
    let total = 0;
    res.on("data", (parte: Buffer) => {
      partes.push(parte);
      total += parte.byteLength;
      // Página grande é derrubada no meio: o <head> já passou faz tempo.
      if (total >= maxBytes) {
        res.destroy();
        resolve(Buffer.concat(partes).toString("utf8"));
      }
    });
    res.on("end", () => resolve(Buffer.concat(partes).toString("utf8")));
    res.on("error", reject);
  });
}
