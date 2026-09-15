import { extname } from "node:path";

/** Um arquivo candidato a instalador, já com o que a escolha precisa saber. */
export interface EntradaInstalador {
  nome: string;
  mtime: Date;
  tamanho: number;
}

/**
 * Escolhe, entre os candidatos de uma pasta, qual instalador a plataforma recebe.
 *
 * `extensoes` é ORDEM DE PREFERÊNCIA, não um conjunto: o Linux passou a gerar
 * `.AppImage` e `.deb` no mesmo build (Windows, às vezes `.exe` e `.msi`), e o
 * mtime dos dois fica perto demais para decidir sozinho — bastaria publicar
 * primeiro o pacote "errado" para a página passar a entregá-lo. Por isso a
 * extensão mais preferida presente **sempre** vence; só entre arquivos da
 * mesma extensão o mais recente decide — o raciocínio de "publicar é copiar o
 * novo, o antigo fica como histórico" (`DownloadsService.arquivoDe`) continua
 * valendo, só que agora por extensão em vez de pasta inteira.
 *
 * A extensão de cada entrada é recalculada aqui, sem confiar em filtro alheio:
 * arquivos do atualizador que não são instaladores (`.sig`, `.app.tar.gz`) são
 * inofensivos mesmo se vierem na lista, porque `extname` deles não bate com
 * nenhuma extensão de preferência.
 */
export function escolherInstalador(
  entradas: readonly EntradaInstalador[],
  extensoes: readonly string[],
): EntradaInstalador | null {
  for (const extensao of extensoes) {
    let melhor: EntradaInstalador | null = null;
    for (const entrada of entradas) {
      if (extname(entrada.nome).toLowerCase() !== extensao) continue;
      if (!melhor || entrada.mtime > melhor.mtime) melhor = entrada;
    }
    if (melhor) return melhor;
  }
  return null;
}
