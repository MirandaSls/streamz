/**
 * A parte **pura** das ações sobre uma imagem: como chamar o arquivo salvo,
 * que tipo a área de transferência aceita e por onde um endereço externo é
 * aberto.
 *
 * Fica separada do componente porque é o que dá para travar em teste: o resto
 * (buscar o blob, falar com o Tauri, desenhar a barra) só existe com um
 * navegador de verdade na frente, e ninguém abre o app neste servidor.
 */

/** Extensões que reconhecemos num nome vindo da URL. */
const EXTENSOES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
};

/** Toda extensão de imagem conhecida, para decidir se o nome já tem uma. */
const CONHECIDAS = new Set([...Object.values(EXTENSOES), "jpeg"]);

/** Caracteres que o Windows recusa num nome de arquivo (o alvo do desktop). */
// eslint-disable-next-line no-control-regex
const PROIBIDOS = /[\u0000-\u001f<>:"/\\|?*]/g;

/** Nome de arquivo não pode passar disto; o resto do caminho já é longo. */
const MAX_NOME = 80;

/** A extensão canônica de um content-type de imagem, ou `null` se não é uma. */
export function extensaoDoTipo(tipo: string | undefined | null): string | null {
  if (!tipo) return null;
  const limpo = tipo.split(";")[0].trim().toLowerCase();
  return EXTENSOES[limpo] ?? null;
}

/**
 * A área de transferência do navegador só aceita **PNG** como bitmap
 * (`ClipboardItem` com `image/png`); JPEG, WEBP e GIF precisam passar por um
 * canvas antes. Um GIF animado perde a animação nessa conversão — o primeiro
 * quadro é o que a área de transferência guarda, e é o que o Discord também
 * entrega.
 */
export function precisaConverterParaPng(tipo: string | undefined | null): boolean {
  if (!tipo) return true;
  return tipo.split(";")[0].trim().toLowerCase() !== "image/png";
}

/**
 * O nome com que a imagem é salva.
 *
 * O **alternativo** ganha quando já parece um nome de arquivo (o visualizador
 * passa ali o nome do anexo, que é o que a pessoa mandou); senão vale o último
 * segmento do caminho da URL, que é onde o storage guarda o nome original.
 * Sem nenhum dos dois, `imagem`.
 *
 * A query é descartada — a URL do anexo é assinada, e
 * `foto.png?X-Amz-Signature=…` viraria um nome gigante e inválido. Já a URL do
 * proxy da API termina no **id** do anexo (`/api/uploads/file/abc123`), e é
 * justamente por isso que o alternativo tem prioridade.
 *
 * A extensão vem do content-type quando o nome não trouxe uma.
 */
export function nomeDeArquivoDaImagem(
  url: string,
  alternativa?: string | null,
  tipo?: string | null,
): string {
  const doAlternativo = limpar(alternativa ?? "");
  const daUrl = limpar(segmentoFinal(url));
  const base = temExtensao(doAlternativo)
    ? doAlternativo
    : daUrl || doAlternativo || "imagem";
  return comExtensao(base, tipo);
}

/** O último segmento do caminho, sem query nem fragmento, já decodificado. */
function segmentoFinal(url: string): string {
  const semFragmento = url.split("#")[0];
  const semQuery = semFragmento.split("?")[0];
  const partes = semQuery.split("/");
  const ultimo = partes[partes.length - 1] ?? "";
  try {
    return decodeURIComponent(ultimo);
  } catch {
    // percent-encoding quebrado: o cru já serve de nome
    return ultimo;
  }
}

/** Tira o que não pode virar nome de arquivo e limita o tamanho. */
function limpar(nome: string): string {
  const seco = nome.replace(PROIBIDOS, "").replace(/\s+/g, " ").trim();
  // ponto no fim é ignorado pelo Windows e deixaria "foto." virando "foto"
  const semPontoFinal = seco.replace(/\.+$/, "");
  return semPontoFinal.slice(0, MAX_NOME);
}

/** O nome já termina numa extensão de imagem que reconhecemos? */
function temExtensao(nome: string): boolean {
  const ponto = nome.lastIndexOf(".");
  return ponto > 0 && CONHECIDAS.has(nome.slice(ponto + 1).toLowerCase());
}

/** Garante uma extensão de imagem no fim do nome. */
function comExtensao(nome: string, tipo?: string | null): string {
  if (temExtensao(nome)) return nome;
  return `${nome}.${extensaoDoTipo(tipo) ?? "png"}`;
}

/** Como um endereço externo deve ser aberto a partir daqui. */
export type Abertura =
  /** desktop: o navegador padrão do sistema, pelo plugin `opener`. */
  | { via: "sistema"; url: string }
  /** site: uma aba nova, sem dar `window.opener` para a página aberta. */
  | { via: "aba"; url: string; features: string };

/**
 * Por onde abrir `url`, e com quê.
 *
 * No app de desktop **não existe** abrir aba: o WebView2 engole
 * `window.open`/`target="_blank"` e o clique não fazia nada (era o defeito do
 * "Abrir no navegador" do visualizador). Lá quem abre é o sistema, pelo plugin
 * `opener`. No site é uma aba nova com `noopener,noreferrer` — sem isso a
 * página aberta recebe `window.opener` e pode navegar a nossa.
 *
 * Devolve `null` para qualquer coisa que não seja `http`/`https`: um
 * `javascript:` ou um `data:` vindo do conteúdo de uma mensagem não pode virar
 * "abrir" nem aqui nem no sistema operacional.
 */
export function comoAbrir(url: string, noDesktop: boolean): Abertura | null {
  if (!ehHttp(url)) return null;
  const limpa = url.trim();
  return noDesktop
    ? { via: "sistema", url: limpa }
    : { via: "aba", url: limpa, features: "noopener,noreferrer" };
}

/** `http:`/`https:` e nada mais — inclusive contra espaço e caixa alta. */
export function ehHttp(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

/**
 * Os endereços a tentar, **em ordem**, para conseguir os bytes de uma imagem.
 *
 * O primeiro é sempre o que já está na tela: no caso normal é a URL assinada
 * do R2, que responde direto do bucket, sem passar pela nossa API — é o
 * caminho rápido e é o que quase sempre funciona. Ele vence junto com a
 * assinatura (`ATTACHMENT_URL_TTL_SECONDS`, 1 h): a partir daí o `<img>`
 * continua mostrando o que já carregou, mas um `fetch` novo leva 403 do
 * bucket. Era aí que "Copiar imagem" e "Salvar imagem" morriam numa janela
 * aberta a tarde inteira.
 *
 * O segundo endereço é a saída: o proxy autenticado da API
 * (`GET /api/uploads/file/:id`), que não tem prazo e responde CORS para as
 * nossas origens. Ele só existe quando sabemos o **id do anexo** — a chave no
 * bucket é `attachments/<uuid aleatório>/<nome>` e esse uuid **não** é o id do
 * registro (`uploads.service.ts`), então não há como derivá-lo da URL
 * assinada: quem abriu a imagem a partir de um `Attachment` é que tem de
 * trazer o id junto.
 *
 * Imagem que não é anexo nosso (prévia de link, GIF do provedor, avatar) fica
 * com um endereço só, exatamente como antes.
 *
 * O proxy é omitido quando a URL recebida **já** aponta para ele: buscar duas
 * vezes o mesmo caminho não descobre nada de novo — quem repete essa, aí sim
 * com `Authorization`, é o `baixar` de `imagem-arquivo.ts`.
 */
export function enderecosParaBaixar(
  url: string,
  opcoes?: { idDoAnexo?: string | null; baseDaApi?: string | null },
): string[] {
  const id = opcoes?.idDoAnexo?.trim();
  const base = opcoes?.baseDaApi?.trim().replace(/\/+$/, "");
  if (!id || !base) return [url];
  const proxy = `${base}/api/uploads/file/${encodeURIComponent(id)}`;
  return mesmoRecurso(url, proxy) ? [url] : [url, proxy];
}

/** Dois endereços apontando para o mesmo recurso — a query não conta. */
function mesmoRecurso(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return ua.origin === ub.origin && ua.pathname === ub.pathname;
  } catch {
    // relativo ou lixo: não dá para afirmar que é o mesmo, e afirmar de menos
    // só custa uma tentativa extra
    return false;
  }
}
