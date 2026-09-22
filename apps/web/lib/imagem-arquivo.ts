/**
 * Copiar, salvar e abrir a imagem que está na tela — a parte que **toca o
 * ambiente** (rede, área de transferência, disco, sistema operacional). A
 * decisão pura (nome do arquivo, conversão de tipo, por onde abrir) mora em
 * `lib/imagem-acoes.ts`, que é o que tem teste.
 *
 * Cada função aqui já dá o próprio toast: são gestos do usuário, e ele precisa
 * ver que aconteceu (ou por que não aconteceu) sem quem chamou ter de repetir
 * a mesma mensagem em três lugares. Nenhum caminho pode terminar em silêncio —
 * era exatamente esse o defeito de "Salvar imagem": falhava sem dizer nada.
 *
 * ## O que muda entre o site e o desktop
 *
 * | | site | app de desktop (WebView2) |
 * |---|---|---|
 * | copiar | `navigator.clipboard.write` com `image/png` | idem, e o plugin `clipboard-manager` como rede |
 * | salvar | `<a download>` num blob | "Salvar como" do sistema (`dialog` + `fs`) |
 * | abrir | aba nova com `noopener` | navegador padrão (`opener`) |
 *
 * O WebView2 é Chromium e **tem** `navigator.clipboard.write` (a origem
 * `http://tauri.localhost` conta como segura), mas a escrita exige que o
 * documento esteja em foco e pode ser recusada; por isso a tentativa do
 * navegador vem primeiro e o plugin nativo é a segunda chance. Ninguém aqui
 * abre o app no Windows para confirmar qual dos dois caminhos ganha na
 * prática — só um teste manual lá diz.
 *
 * ## Duas regras que este arquivo existe para respeitar
 *
 * 1. **O `ClipboardItem` nasce no gesto, com a promessa dos bytes.** Chamar
 *    `clipboard.write` só depois de `await fetch(...)` é recusado com
 *    `NotAllowedError` (o WebKit sempre; o Chromium quando a janela perdeu o
 *    foco no meio) — a ativação do clique já expirou. Por isso `copiarImagem`
 *    dispara o download **sem esperar** e entrega a `Promise<Blob>` ao
 *    `ClipboardItem`, que aceita promessa justamente para esse caso.
 * 2. **`<a download>` só baixa em mesma origem.** Com href de outro host o
 *    atributo é ignorado (a menos que venha `Content-Disposition: attachment`)
 *    e o navegador **navega** para a imagem, jogando o app fora da tela. Como
 *    o anexo mora no bucket e o GIF mora no provedor, salvar tem de ser sempre
 *    a partir dos bytes, num `blob:`.
 *
 * ## Por que os bytes podem não vir
 *
 * Copiar e salvar precisam dos **bytes**, e a URL de um anexo é uma **URL
 * assinada do R2** (`StorageService.attachmentUrl`). O `<img>` mostra essa URL
 * sem CORS nenhum, mas `fetch` não — e daí a assimetria que confunde: a imagem
 * está na tela e mesmo assim a leitura falha. Três coisas fazem isso acontecer:
 *
 * 1. **CORS do bucket** — hoje o R2 responde `Access-Control-Allow-Origin` com
 *    `GET`/`HEAD` para `https://streamz.chat`, `http://tauri.localhost` (app no
 *    Windows/Android) e `tauri://localhost` (macOS/iOS/Linux). A política é a
 *    de `scripts/r2-cors.mjs`; `docs/R2-CORS.md` conta como aplicá-la de novo.
 * 2. **A assinatura vence em `ATTACHMENT_URL_TTL_SECONDS` (1 h).** A URL é
 *    gerada quando a mensagem é montada em DTO; numa janela aberta a tarde
 *    inteira o `<img>` continua mostrando o que já carregou e o `fetch` novo
 *    leva `403` do bucket.
 * 3. **`connect-src` da CSP do app** (`tauri.conf.json`): `api.streamz.chat`, o
 *    bucket R2 e o Giphy estão liberados; uma imagem hospedada em qualquer
 *    outro lugar aparece na tela (`img-src` é `https:`) e não deixa buscar os
 *    bytes.
 *
 * O proxy da API (`GET /api/uploads/file/:id`) não sofre de 1 nem de 2:
 * responde CORS para as nossas origens e aceita `Authorization: Bearer` quando
 * o token curto `?t=` da URL já venceu. Por isso a busca tem **duas etapas**
 * (`enderecosParaBaixar`, em `lib/imagem-acoes.ts`, decide a ordem):
 *
 * - primeiro a URL que veio na tela — direto do bucket, sem passar pela nossa
 *   API, e é o que funciona no caso normal;
 * - depois, **quando quem chamou trouxe o id do anexo**, o proxy da API com o
 *   token da sessão. É o que conserta o caso 2: a URL assinada não carrega o
 *   id (a key é `attachments/<uuid>/<nome>`, e o uuid não é o id do registro),
 *   então ele desce do `ImageModal`/`menu-da-imagem`, que abriram a partir de
 *   um `Attachment`.
 *
 * O `Authorization` vai **só** para o endereço do proxy — mandá-lo para o
 * bucket ou para o Giphy seria vazar a credencial. E quando o proxy recusa por
 * permissão (401/403 de `UploadsService.authorizeServe`: a mensagem saiu do
 * seu alcance, ou o anexo ainda está solto e é de outra pessoa) o usuário
 * ouve isso, não um "não deu" genérico — só o 403 do **bucket** é que continua
 * sendo tratado como assinatura vencida, porque é o que ele é.
 *
 * Imagem que não é anexo nosso (prévia de link, GIF do provedor, avatar) não
 * tem id e continua com um endereço só, como sempre foi.
 *
 * ## No app, falhar é dizer que falhou
 *
 * Dentro do Tauri **não existe recuo para o navegador**. Salvar termina no
 * diálogo do sistema ou numa mensagem de erro; copiar termina na área de
 * transferência ou numa mensagem de erro. Abrir a imagem no navegador padrão
 * era o que o usuário via como "ele está me levando para fora do app" — e, com
 * a URL vencida (caso 2), o navegador só mostrava o XML de erro do R2: trocava
 * a ação pedida por outra, pior, sem consertar nada. No site o recuo continua
 * valendo: lá não há diálogo nativo, e a aba nova é uma saída de verdade.
 */

import {
  comoAbrir,
  enderecosParaBaixar,
  nomeDeArquivoDaImagem,
  precisaConverterParaPng,
} from "@/lib/imagem-acoes";
import {
  abrirNoSistema,
  copiarImagemNativa,
  isTauri,
  salvarArquivoNativo,
} from "@/lib/desktop";
import { API_URL } from "@/lib/config";
import { getAccessToken } from "@/lib/session";
import { ui } from "@/stores/ui";

/** Os bytes da imagem mais o tipo que o servidor declarou. */
interface Baixada {
  blob: Blob;
  tipo: string;
}

/**
 * O que quem chama sabe sobre a imagem além do endereço dela.
 *
 * Objeto, e não mais parâmetros soltos, porque o `alt` já era opcional e o id
 * do anexo também é: com dois opcionais em sequência qualquer chamador teria
 * de contar posições para pular um.
 */
export interface OpcoesDaImagem {
  /** nome sugerido para o arquivo salvo (o `alt` da imagem na tela). */
  alt?: string | null;
  /**
   * id do `Attachment`, quando a imagem é um anexo **nosso**. É o que permite
   * cair no proxy da API depois que a assinatura do R2 vence (ver o cabeçalho).
   * Prévia de link, GIF do provedor e avatar não têm — e seguem sem.
   */
  idDoAnexo?: string | null;
}

/**
 * Os bytes não vieram — CORS do bucket, CSP do app, rede fora ou URL vencida.
 *
 * É um erro à parte porque muda o que o usuário vê e o que ele pode fazer:
 * "não deu para baixar a imagem" tem outra saída (abrir fora e salvar de lá)
 * que "a área de transferência recusou".
 */
class FalhaAoBaixar extends Error {
  /**
   * Foi a **nossa API** que recusou por permissão (401/403 do proxy), e não o
   * bucket. A distinção importa: 403 do R2 é a assinatura vencida, que o proxy
   * ainda pode resolver; 403 do proxy é `authorizeServe` dizendo não, e aí não
   * há segunda porta nem faz sentido oferecer "abra numa aba e salve de lá".
   */
  readonly recusadaPelaApi: boolean;

  constructor(mensagem: string, recusadaPelaApi = false) {
    super(mensagem);
    this.recusadaPelaApi = recusadaPelaApi;
  }
}

/**
 * Busca os bytes da imagem: o endereço que veio na tela e, quando há id de
 * anexo, o proxy da API como segunda porta (ver o cabeçalho). Cada endereço do
 * proxy ganha ainda uma repetição com `Authorization` — é como o token curto
 * `?t=` vencido é contornado.
 */
async function baixar(url: string, idDoAnexo?: string | null): Promise<Baixada> {
  const enderecos = enderecosParaBaixar(url, { idDoAnexo, baseDaApi: API_URL });
  let ultima: unknown;

  for (const endereco of enderecos) {
    const daApi = ehProxyDaApi(endereco);
    try {
      return await buscar(endereco, undefined, daApi);
    } catch (erro) {
      ultima = erro;
      // o token da sessão só vai para a nossa API; para o bucket ou para o
      // Giphy seria vazar a credencial
      if (!daApi) continue;
      const token = await getAccessToken();
      if (!token) continue;
      try {
        return await buscar(endereco, { Authorization: `Bearer ${token}` }, true);
      } catch (erroAutenticado) {
        ultima = erroAutenticado;
      }
    }
  }

  // `enderecosParaBaixar` nunca devolve lista vazia, mas um `throw undefined`
  // seria pior que uma mensagem óbvia demais
  throw ultima ?? new FalhaAoBaixar("nenhum endereço para tentar");
}

/**
 * Um `fetch` de imagem; toda recusa vira `FalhaAoBaixar`.
 *
 * `daApi` diz se este endereço é o proxy da nossa API — é o que separa "a
 * assinatura do bucket venceu" de "a API disse que você não pode".
 */
async function buscar(
  url: string,
  headers?: Record<string, string>,
  daApi = false,
): Promise<Baixada> {
  let resposta: Response;
  try {
    resposta = await fetch(url, { credentials: "omit", headers });
  } catch {
    // o browser não conta qual foi (CORS, CSP ou rede) — de propósito, para
    // uma página não descobrir o que existe do outro lado
    throw new FalhaAoBaixar("sem acesso aos bytes (CORS, CSP ou rede)");
  }
  if (!resposta.ok) {
    const negada = daApi && (resposta.status === 401 || resposta.status === 403);
    throw new FalhaAoBaixar(`HTTP ${resposta.status}`, negada);
  }
  const blob = await resposta.blob();
  return { blob, tipo: blob.type || resposta.headers.get("content-type") || "" };
}

/**
 * O recado do toast quando os bytes não vieram.
 *
 * Quando quem recusou foi a nossa API, dizer "não foi possível baixar" seria
 * mentira por omissão: o arquivo está lá, o acesso é que não é seu (a mensagem
 * saiu do seu alcance, ou o anexo ainda está solto e é de outra pessoa —
 * `UploadsService.authorizeServe`).
 */
function recadoDeFalha(erro: unknown, acao: "copiar" | "salvar"): string {
  if (erro instanceof FalhaAoBaixar && erro.recusadaPelaApi) {
    return "Você não tem mais acesso a esta imagem";
  }
  return `Não foi possível baixar esta imagem para ${acao}`;
}

/** O endereço é o proxy de anexo da nossa API (`GET /api/uploads/file/:id`)? */
function ehProxyDaApi(url: string): boolean {
  try {
    const alvo = new URL(url, window.location.href);
    return (
      alvo.origin === new URL(API_URL).origin && alvo.pathname.startsWith("/api/uploads/file/")
    );
  } catch {
    return false;
  }
}

/** O endereço é do próprio app? Só aí o `download` do `<a>` vale alguma coisa. */
function ehMesmaOrigem(url: string): boolean {
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * O mesmo bitmap como PNG, que é o único tipo que a área de transferência
 * aceita em todo lugar. Um GIF animado vira o primeiro quadro — é o que o
 * `drawImage` consegue, e o que o Discord entrega também.
 */
async function paraPng(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  try {
    const tela = document.createElement("canvas");
    tela.width = bitmap.width;
    tela.height = bitmap.height;
    const ctx = tela.getContext("2d");
    if (!ctx) throw new Error("sem contexto 2d");
    ctx.drawImage(bitmap, 0, 0);
    const png = await new Promise<Blob | null>((ok) => tela.toBlob(ok, "image/png"));
    if (!png) throw new Error("canvas não devolveu PNG");
    return png;
  } finally {
    bitmap.close();
  }
}

/** Os bytes da imagem já convertidos para PNG quando o tipo não for PNG. */
async function pngDaImagem(url: string, idDoAnexo?: string | null): Promise<Blob> {
  const { blob, tipo } = await baixar(url, idDoAnexo);
  return precisaConverterParaPng(tipo) ? await paraPng(blob) : blob;
}

/**
 * A imagem no bitmap da área de transferência (Ctrl+V cola a foto, não o
 * endereço dela).
 *
 * A ordem das tentativas é o que faz isto funcionar: a escrita com a
 * **promessa** dos bytes vai primeiro porque é a única que ainda está dentro
 * do gesto do clique (regra 1 do cabeçalho); só depois de ela falhar é que
 * esperamos o download para tentar o plugin nativo do app ou uma segunda
 * escrita com o blob pronto.
 *
 * As duas saídas do app são a área de transferência do sistema e um erro
 * escrito — nunca abrir a imagem fora dali. A do WebView2 e a do plugin
 * `clipboard-manager` são a **mesma** área de transferência do Windows; o
 * plugin só existe aqui porque o WebView2 exige a janela em foco e nega sem
 * dizer por quê.
 *
 * A segunda tentativa de download (o proxy da API) mora **dentro** de
 * `pngDaImagem`, ou seja dentro da promessa entregue ao `ClipboardItem`: é por
 * isso que ela não custa nada aqui. Qualquer `await` acrescentado antes da
 * construção do `ClipboardItem` mataria a ativação do clique e quebraria a
 * cópia no WebKit — a regra 1 do cabeçalho.
 */
export async function copiarImagem(url: string, opcoes?: OpcoesDaImagem): Promise<void> {
  // nada de `await` antes daqui: a busca começa agora, mas quem espera por ela
  // é o `ClipboardItem`, não nós
  const bytes = pngDaImagem(url, opcoes?.idDoAnexo);
  // a promessa é consumida em mais de um lugar abaixo; sem este ouvinte de
  // reserva, uma falha de download viraria "unhandled rejection" no console
  void bytes.catch(() => {});

  if (await escreverNaAreaDeTransferencia(bytes)) {
    ui.toast("Imagem copiada");
    return;
  }

  let png: Blob;
  try {
    png = await bytes;
  } catch (erro) {
    ui.toast(recadoDeFalha(erro, "copiar"), "error");
    return;
  }

  // No app, o plugin nativo é a segunda chance: o WebView2 exige a janela em
  // foco e nega sem dizer por quê.
  if (isTauri()) {
    if (await copiarImagemNativa(new Uint8Array(await png.arrayBuffer()))) {
      ui.toast("Imagem copiada");
      return;
    }
    ui.toast("A área de transferência recusou a imagem", "error");
    return;
  }

  // No site, repetir o `write` com os bytes na mão: alguns motores recusam a
  // promessa (ela demorou demais) e aceitam o blob pronto.
  if (await escreverNaAreaDeTransferencia(Promise.resolve(png))) {
    ui.toast("Imagem copiada");
    return;
  }
  ui.toast("A área de transferência recusou a imagem", "error");
}

/**
 * `navigator.clipboard.write` com `image/png`; `false` quando não rolou.
 *
 * **Não é `async` de propósito**: tudo daqui até o `write` roda no mesmo tick
 * de quem chamou, que é o que mantém a escrita dentro da ativação do clique
 * (regra 1 do cabeçalho). Recebe a promessa dos bytes porque quem espera por
 * ela tem de ser o navegador.
 *
 * Fora de contexto seguro (`http://` que não seja localhost) a API nem existe,
 * e aí o `false` manda o fluxo para os outros caminhos.
 */
function escreverNaAreaDeTransferencia(png: Promise<Blob>): Promise<boolean> {
  try {
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
      return Promise.resolve(false);
    }
    return navigator.clipboard.write([new ClipboardItem({ "image/png": png })]).then(
      () => true,
      () => false,
    );
  } catch {
    // o próprio construtor pode lançar (tipo não suportado pelo motor)
    return Promise.resolve(false);
  }
}

/**
 * Salva a imagem: no app pelo "Salvar como" do sistema, no site pelo download
 * do navegador. Cancelar o diálogo não é erro e não vira toast.
 *
 * Os dois caminhos são funções separadas de propósito — o do app **não pode**
 * terminar no navegador, e um `if (isTauri())` no meio de um `try` comum já
 * deixou isso acontecer uma vez (ver "No app, falhar é dizer que falhou", no
 * cabeçalho).
 */
export async function salvarImagem(url: string, opcoes?: OpcoesDaImagem): Promise<void> {
  return isTauri() ? salvarNoApp(url, opcoes) : salvarNoSite(url, opcoes);
}

/**
 * Salvar dentro do app: os bytes, o diálogo nativo, o disco. Só isso.
 *
 * Os dois `try` são separados porque as falhas são diferentes e o usuário
 * precisa saber qual foi: "não deu para baixar" é a rede/CORS/assinatura
 * vencida, "não deu para salvar" é o diálogo ou a ACL do `fs`. Nenhum dos dois
 * abre nada fora do app.
 */
async function salvarNoApp(url: string, opcoes?: OpcoesDaImagem): Promise<void> {
  let baixada: Baixada;
  try {
    baixada = await baixar(url, opcoes?.idDoAnexo);
  } catch (erro) {
    ui.toast(recadoDeFalha(erro, "salvar"), "error");
    return;
  }

  try {
    const nome = nomeDeArquivoDaImagem(url, opcoes?.alt, baixada.tipo);
    const bytes = new Uint8Array(await baixada.blob.arrayBuffer());
    const caminho = await salvarArquivoNativo(nome, bytes);
    // `null` é o usuário tendo cancelado o diálogo: não é erro, não vira toast
    if (caminho) ui.toast(`Salvo em ${caminho}`);
  } catch {
    // permissão do `fs`, disco cheio, diálogo indisponível
    ui.toast("Não foi possível salvar a imagem", "error");
  }
}

/** Salvar no site: um `blob:` num `<a download>`, com o recuo da aba nova. */
async function salvarNoSite(url: string, opcoes?: OpcoesDaImagem): Promise<void> {
  try {
    const { blob, tipo } = await baixar(url, opcoes?.idDoAnexo);
    const nome = nomeDeArquivoDaImagem(url, opcoes?.alt, tipo);
    baixarPeloNavegador(URL.createObjectURL(blob), nome, true);
    ui.toast(`Imagem salva como ${nome}`);
  } catch (erro) {
    if (erro instanceof FalhaAoBaixar) {
      // recusa por permissão não tem recuo: a aba nova mostraria o XML de erro
      // do bucket e trocaria a ação pedida por uma pior, calada sobre o motivo
      if (erro.recusadaPelaApi) {
        ui.toast(recadoDeFalha(erro, "salvar"), "error");
        return;
      }
      salvarSemOsBytes(url, opcoes?.alt);
      return;
    }
    ui.toast("Não foi possível salvar a imagem", "error");
  }
}

/**
 * Último recurso de "Salvar" **no site**, quando os bytes não vieram.
 *
 * Em mesma origem o `<a download>` ainda baixa sozinho. Fora dela **não**
 * (regra 2 do cabeçalho: o atributo é ignorado e a navegação levava a página
 * embora), então a saída é abrir a imagem numa aba e dizer que o "Salvar como"
 * agora é lá. Se nem isso funcionar (bloqueador de pop-up), o erro aparece:
 * silêncio aqui é o pior dos mundos.
 *
 * **Não é chamada no app.** Lá o equivalente seria jogar o usuário no navegador
 * do sistema, que é exatamente o defeito que esta separação existe para matar.
 */
function salvarSemOsBytes(url: string, alt?: string | null): void {
  if (ehMesmaOrigem(url)) {
    baixarPeloNavegador(url, nomeDeArquivoDaImagem(url, alt), false);
    return;
  }

  const alvo = comoAbrir(url, false);
  if (alvo?.via === "aba" && window.open(alvo.url, "_blank", alvo.features)) {
    ui.toast("Não deu para baixar aqui; a imagem abriu numa aba — salve por lá");
    return;
  }
  ui.toast("Não foi possível salvar a imagem", "error");
}

/** O `<a download>` de sempre, criado e descartado no mesmo gesto. */
function baixarPeloNavegador(href: string, nome: string, revogar: boolean): void {
  const a = document.createElement("a");
  a.href = href;
  a.download = nome;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // o objeto só pode morrer depois de o download começar
  if (revogar) window.setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

/** O endereço da imagem como texto. */
export function copiarLinkDaImagem(url: string): void {
  void navigator.clipboard?.writeText(url);
  ui.toast("Link da imagem copiado");
}

/**
 * Abre a imagem fora do app. No desktop quem abre é o navegador padrão do
 * sistema — o WebView2 não tem abas, e era isso que fazia o botão do
 * visualizador não fazer nada.
 */
export async function abrirImagemNoNavegador(url: string): Promise<void> {
  const alvo = comoAbrir(url, isTauri());
  if (!alvo) {
    ui.toast("Endereço de imagem inválido", "error");
    return;
  }
  if (alvo.via === "sistema") {
    if (!(await abrirNoSistema(alvo.url))) {
      ui.toast("Não foi possível abrir no navegador", "error");
    }
    return;
  }
  window.open(alvo.url, "_blank", alvo.features);
}
