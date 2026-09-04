/**
 * Copiar, salvar e abrir a imagem que está na tela — a parte que **toca o
 * ambiente** (rede, área de transferência, disco, sistema operacional). A
 * decisão pura (nome do arquivo, conversão de tipo, por onde abrir) mora em
 * `lib/imagem-acoes.ts`, que é o que tem teste.
 *
 * Cada função aqui já dá o próprio toast: são gestos do usuário, e ele precisa
 * ver que aconteceu (ou por que não aconteceu) sem quem chamou ter de repetir
 * a mesma mensagem em três lugares.
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
 * ## O limite conhecido: CSP e host da imagem
 *
 * Copiar e salvar precisam dos **bytes**, e no desktop o `connect-src` da CSP
 * governa o `fetch`. `api.streamz.chat`, o bucket R2 e o Giphy estão liberados
 * lá (`tauri.conf.json`); uma imagem hospedada em qualquer outro lugar
 * aparece na tela (`img-src` é `https:`) mas não deixa buscar os bytes. Nesse
 * caso "Salvar" cai no download direto pela URL e "Copiar imagem" avisa que
 * não deu. No site o obstáculo é outro e igualmente fora do nosso alcance: um
 * host sem CORS recusa o `fetch`.
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
import { ui } from "@/stores/ui";

/** Os bytes da imagem mais o tipo que o servidor declarou. */
interface Baixada {
  blob: Blob;
  tipo: string;
}

/** Busca os bytes da imagem. Lança quando a CSP, o CORS ou a rede recusam. */
async function baixar(url: string): Promise<Baixada> {
  const resposta = await fetch(url, { credentials: "omit" });
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
  const blob = await resposta.blob();
  return { blob, tipo: blob.type || resposta.headers.get("content-type") || "" };
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

/**
 * A imagem no bitmap da área de transferência (Ctrl+V cola a foto, não o
 * endereço dela). Converte para PNG quando o tipo não for PNG.
 */
export async function copiarImagem(url: string): Promise<void> {
  try {
    const { blob, tipo } = await baixar(url);
    const png = precisaConverterParaPng(tipo) ? await paraPng(blob) : blob;

    const escrita = await escreverNaAreaDeTransferencia(png);
    if (!escrita && isTauri()) {
      const bytes = new Uint8Array(await png.arrayBuffer());
      if (!(await copiarImagemNativa(bytes))) throw new Error("clipboard recusou");
    } else if (!escrita) {
      throw new Error("clipboard recusou");
    }
    ui.toast("Imagem copiada");
  } catch {
    ui.toast("Não foi possível copiar a imagem", "error");
  }
}

/** `navigator.clipboard.write` com `image/png`; `false` quando não rolou. */
async function escreverNaAreaDeTransferencia(png: Blob): Promise<boolean> {
  try {
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return false;
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    return true;
  } catch {
    return false;
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
  } catch {
    // sem os bytes ainda dá para pedir o arquivo direto ao servidor; o nome
    // fica a cargo dele, mas baixar é melhor do que só reclamar
    if (!isTauri()) {
      baixarPeloNavegador(url, nomeDeArquivoDaImagem(url, alt), false);
      return;
    }
    ui.toast("Não foi possível salvar a imagem", "error");
  }
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
