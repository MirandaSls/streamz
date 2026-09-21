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
 * ## O limite conhecido: CORS do bucket e CSP do app
 *
 * Copiar e salvar precisam dos **bytes**, e a URL de um anexo é uma **URL
 * assinada do R2** (`StorageService.attachmentUrl`). O `<img>` mostra essa URL
 * sem CORS nenhum, mas `fetch` não: sem `Access-Control-Allow-Origin` para a
 * nossa origem, o bucket recusa a leitura e as duas ações morrem no mesmo
 * ponto. **Enquanto o CORS do bucket R2 não liberar `https://streamz.chat` (e
 * as origens do app, `http://tauri.localhost` e `tauri://localhost`), nenhum
 * código aqui consegue os bytes de um anexo** — o fallback abaixo abre a
 * imagem fora do app e avisa, que é o máximo honesto.
 *
 * O proxy da API (`GET /api/uploads/file/:id`) não tem esse problema: responde
 * CORS para as nossas origens e aceita `Authorization: Bearer` quando o token
 * curto `?t=` da URL já venceu (ele dura `ATTACHMENT_URL_TTL_SECONDS`, 1 h, e
 * a URL de uma mensagem antiga é bem mais velha que isso). Por isso `baixar`
 * repete a busca com o token da sessão — **só** para esse endereço, que mandar
 * `Authorization` para o bucket ou para o Giphy seria vazar a credencial.
 *
 * No desktop existe um segundo obstáculo, o `connect-src` da CSP: `api.streamz.chat`,
 * o bucket R2 e o Giphy estão liberados (`tauri.conf.json`); uma imagem
 * hospedada em qualquer outro lugar aparece na tela (`img-src` é `https:`) mas
 * não deixa buscar os bytes.
 */

import {
  comoAbrir,
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
 * Os bytes não vieram — CORS do bucket, CSP do app, rede fora ou URL vencida.
 *
 * É um erro à parte porque muda o que o usuário vê e o que ele pode fazer:
 * "não deu para baixar a imagem" tem outra saída (abrir fora e salvar de lá)
 * que "a área de transferência recusou".
 */
class FalhaAoBaixar extends Error {}

/**
 * Busca os bytes da imagem, com uma segunda tentativa autenticada quando o
 * endereço é o proxy de anexo da nossa API (ver o cabeçalho).
 */
async function baixar(url: string): Promise<Baixada> {
  try {
    return await buscar(url);
  } catch (erro) {
    if (!ehProxyDaApi(url)) throw erro;
    const token = await getAccessToken();
    if (!token) throw erro;
    return await buscar(url, { Authorization: `Bearer ${token}` });
  }
}

/** Um `fetch` de imagem; toda recusa vira `FalhaAoBaixar`. */
async function buscar(url: string, headers?: Record<string, string>): Promise<Baixada> {
  let resposta: Response;
  try {
    resposta = await fetch(url, { credentials: "omit", headers });
  } catch {
    // o browser não conta qual foi (CORS, CSP ou rede) — de propósito, para
    // uma página não descobrir o que existe do outro lado
    throw new FalhaAoBaixar("sem acesso aos bytes (CORS, CSP ou rede)");
  }
  if (!resposta.ok) throw new FalhaAoBaixar(`HTTP ${resposta.status}`);
  const blob = await resposta.blob();
  return { blob, tipo: blob.type || resposta.headers.get("content-type") || "" };
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
async function pngDaImagem(url: string): Promise<Blob> {
  const { blob, tipo } = await baixar(url);
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
 */
export async function copiarImagem(url: string): Promise<void> {
  // nada de `await` antes daqui: a busca começa agora, mas quem espera por ela
  // é o `ClipboardItem`, não nós
  const bytes = pngDaImagem(url);
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
  } catch {
    ui.toast("Não foi possível baixar esta imagem para copiar", "error");
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
 * Salva a imagem: no desktop pelo "Salvar como" do sistema, no site pelo
 * download do navegador. Cancelar o diálogo não é erro e não vira toast.
 */
export async function salvarImagem(url: string, alt?: string | null): Promise<void> {
  try {
    const { blob, tipo } = await baixar(url);
    const nome = nomeDeArquivoDaImagem(url, alt, tipo);

    if (isTauri()) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const caminho = await salvarArquivoNativo(nome, bytes);
      if (caminho) ui.toast(`Salvo em ${caminho}`);
      return;
    }

    baixarPeloNavegador(URL.createObjectURL(blob), nome, true);
    ui.toast(`Imagem salva como ${nome}`);
  } catch (erro) {
    if (erro instanceof FalhaAoBaixar) {
      await salvarSemOsBytes(url, alt);
      return;
    }
    // os bytes vieram e o que falhou foi guardar: permissão do `fs`, disco
    // cheio, diálogo indisponível
    ui.toast("Não foi possível salvar a imagem", "error");
  }
}

/**
 * Último recurso de "Salvar" quando os bytes não vieram.
 *
 * Em mesma origem o `<a download>` ainda baixa sozinho. Fora dela **não**
 * (regra 2 do cabeçalho: o atributo é ignorado e a navegação levava o app
 * embora), então a saída é abrir a imagem fora do app — aba nova no site,
 * navegador padrão no desktop — e dizer que o "Salvar como" agora é lá. Se nem
 * isso funcionar (bloqueador de pop-up, plugin `opener` recusando), o erro
 * aparece: silêncio aqui é o pior dos mundos.
 */
async function salvarSemOsBytes(url: string, alt?: string | null): Promise<void> {
  if (ehMesmaOrigem(url)) {
    baixarPeloNavegador(url, nomeDeArquivoDaImagem(url, alt), false);
    return;
  }

  const alvo = comoAbrir(url, isTauri());
  if (alvo?.via === "sistema") {
    if (await abrirNoSistema(alvo.url)) {
      ui.toast("Não deu para baixar aqui; a imagem abriu no navegador — salve por lá");
      return;
    }
  } else if (alvo && window.open(alvo.url, "_blank", alvo.features)) {
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
