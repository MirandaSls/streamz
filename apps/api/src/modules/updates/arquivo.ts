import { basename, join, resolve, sep } from "node:path";

/**
 * Resolve o caminho do instalador pedido pelo atualizador.
 *
 * Fica separado do serviço porque é a parte perigosa e a parte testável: o nome
 * vem da URL, e um nome vindo da URL que vira caminho de arquivo é como se lê
 * `/etc/passwd` de um servidor descuidado.
 *
 * Três travas, e nenhuma delas confia na anterior:
 *   1. `basename` descarta qualquer diretório que venha no nome;
 *   2. só sufixo de instalador passa;
 *   3. o caminho final tem de continuar **dentro** da pasta configurada.
 *
 * `.apk` entrou na lista quando o app Android passou a se atualizar sozinho
 * (`ANDROID_UPDATE_URL` aponta para esta mesma rota). Ele é servido da mesma
 * pasta aberta que o `.exe`, e pelo mesmo raciocínio: o que garante que o
 * pacote é nosso não é o sigilo do endereço. No Windows é a assinatura
 * minisign; no Android é o **sha256** que vai no manifesto e que o app confere
 * antes de abrir o instalador do sistema (ver `UpdatesService`).
 *
 * `.app.tar.gz` (macOS) e `.AppImage` (Linux) entraram quando esses dois
 * desktops passaram a se atualizar pelo mesmo atualizador do Tauri, e são
 * exatamente o que ele baixa: o `.app` empacotado em tar.gz e o próprio
 * AppImage (formato do `createUpdaterArtifacts: true`). A proteção é a mesma
 * assinatura minisign do Windows.
 *
 * A comparação é por **sufixo**, não por `extname`, por causa do mac:
 * `extname("Streamz.app.tar.gz")` é `.gz`, e aceitar `.gz` abriria a pasta
 * para qualquer compactado que alguém deixasse lá (um backup, um dump). O
 * sufixo composto inteiro é o que identifica o pacote do updater. Sem
 * diferenciar caixa porque o bundler escreve `.AppImage` e ninguém garante que
 * quem copiou para o servidor manteve.
 *
 * O `.sig` **não** está na lista: a assinatura vai no manifesto, lida do
 * ambiente, e o cliente nunca a baixa desta pasta.
 */
const SUFIXOS = [".exe", ".msi", ".apk", ".app.tar.gz", ".appimage"];

export function caminhoDoInstalador(dir: string, nome: string): string | null {
  const limpo = basename(nome);
  if (!limpo || limpo.startsWith(".")) return null;
  const minusculo = limpo.toLowerCase();
  // `startsWith(".")` já barrou o nome que é só o sufixo (`.app.tar.gz`), então
  // todo nome que passa aqui tem algo antes dele
  if (!SUFIXOS.some((sufixo) => minusculo.endsWith(sufixo))) return null;

  const base = resolve(dir);
  const caminho = join(base, limpo);
  if (caminho !== base && !caminho.startsWith(base + sep)) return null;
  return caminho;
}
