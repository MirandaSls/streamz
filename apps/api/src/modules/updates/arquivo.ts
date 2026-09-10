import { basename, extname, join, resolve, sep } from "node:path";

/**
 * Resolve o caminho do instalador pedido pelo atualizador.
 *
 * Fica separado do serviço porque é a parte perigosa e a parte testável: o nome
 * vem da URL, e um nome vindo da URL que vira caminho de arquivo é como se lê
 * `/etc/passwd` de um servidor descuidado.
 *
 * Três travas, e nenhuma delas confia na anterior:
 *   1. `basename` descarta qualquer diretório que venha no nome;
 *   2. só extensão de instalador passa;
 *   3. o caminho final tem de continuar **dentro** da pasta configurada.
 *
 * `.apk` entrou na lista quando o app Android passou a se atualizar sozinho
 * (`ANDROID_UPDATE_URL` aponta para esta mesma rota). Ele é servido da mesma
 * pasta aberta que o `.exe`, e pelo mesmo raciocínio: o que garante que o
 * pacote é nosso não é o sigilo do endereço. No Windows é a assinatura
 * minisign; no Android é o **sha256** que vai no manifesto e que o app confere
 * antes de abrir o instalador do sistema (ver `UpdatesService`).
 */
const EXTENSOES = [".exe", ".msi", ".apk"];

export function caminhoDoInstalador(dir: string, nome: string): string | null {
  const limpo = basename(nome);
  if (!limpo || limpo.startsWith(".")) return null;
  if (!EXTENSOES.includes(extname(limpo).toLowerCase())) return null;

  const base = resolve(dir);
  const caminho = join(base, limpo);
  if (caminho !== base && !caminho.startsWith(base + sep)) return null;
  return caminho;
}
