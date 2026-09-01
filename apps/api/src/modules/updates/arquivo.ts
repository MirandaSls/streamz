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
 */
const EXTENSOES = [".exe", ".msi"];

export function caminhoDoInstalador(dir: string, nome: string): string | null {
  const limpo = basename(nome);
  if (!limpo || limpo.startsWith(".")) return null;
  if (!EXTENSOES.includes(extname(limpo).toLowerCase())) return null;

  const base = resolve(dir);
  const caminho = join(base, limpo);
  if (caminho !== base && !caminho.startsWith(base + sep)) return null;
  return caminho;
}
