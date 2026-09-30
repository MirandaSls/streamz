import { extname } from "node:path";
import { ehMaisNova } from "../updates/versao";
import { escolherInstalador, type EntradaInstalador } from "./instalador";

/** Um instalador já escolhido para uma versão específica. */
export interface VersaoDoInstalador {
  versao: string;
  nome: string;
  mtime: Date;
  tamanho: number;
}

/**
 * `Streamz_1.3.19_universal.dmg` -> `1.3.19`.
 *
 * A versão sai do NOME, não do mtime: copiar um instalador antigo de volta
 * para a pasta muda o mtime mas não a versão, e o seletor não pode mentir.
 * Nome fora do padrão devolve `null` em vez de chute.
 */
export function versaoDoNome(nome: string): string | null {
  return /^Streamz_(\d+\.\d+\.\d+)_/.exec(nome)?.[1] ?? null;
}

/**
 * Uma entrada por versão, da mais nova para a mais antiga.
 *
 * A ordem é numérica por partes (`ehMaisNova`), nunca lexicográfica: como
 * string, `1.3.9` ganharia de `1.3.10`. Dentro da versão, quem decide o
 * arquivo é `escolherInstalador` — a mesma regra de preferência de extensão
 * do botão de download, para o seletor nunca oferecer `.pkg` onde o botão
 * entregaria `.dmg`. Entradas sem versão no nome (ou que não são instalador)
 * ficam de fora.
 */
export function listarVersoes(
  entradas: readonly EntradaInstalador[],
  extensoes: readonly string[],
): VersaoDoInstalador[] {
  const porVersao = new Map<string, EntradaInstalador[]>();
  for (const entrada of entradas) {
    if (!extensoes.includes(extname(entrada.nome).toLowerCase())) continue;
    const versao = versaoDoNome(entrada.nome);
    if (!versao) continue;
    const grupo = porVersao.get(versao);
    if (grupo) grupo.push(entrada);
    else porVersao.set(versao, [entrada]);
  }

  const lista: VersaoDoInstalador[] = [];
  for (const [versao, grupo] of porVersao) {
    const escolhida = escolherInstalador(grupo, extensoes);
    if (escolhida) {
      lista.push({
        versao,
        nome: escolhida.nome,
        mtime: escolhida.mtime,
        tamanho: escolhida.tamanho,
      });
    }
  }
  return lista.sort((a, b) =>
    ehMaisNova(a.versao, b.versao) ? -1 : ehMaisNova(b.versao, a.versao) ? 1 : 0,
  );
}
