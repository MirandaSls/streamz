/**
 * **Onde o estado de um bot mora: `/dados`.**
 *
 * Todo bot com estado durável grava em `/dados`, e todo bot lê o mesmo
 * `BOTS_DADOS_DIR` para saber onde isso é. Um caminho e uma variável, não um
 * par por bot — o compose dá a *cada* container o seu próprio volume nomeado
 * nesse ponto, então dois bots nunca disputam o mesmo arquivo mesmo usando o
 * mesmo caminho.
 *
 * ## Por que o caminho não é escolha de cada bot
 *
 * Porque a permissão do ponto de montagem é. O Docker cria o ponto de montagem
 * de um volume nomeado com o dono que aquele caminho tem **na imagem**; para um
 * caminho que a imagem não tem, isso é `root:root`. A imagem dos bots roda como
 * `USER node`, então um bot que inventasse `/estado` ganharia um diretório em
 * que não escreve — e descobriria isso no primeiro comando de quem usa, não na
 * subida:
 *
 * ```
 * docker run --rm -v vol:/dados -u node node:22-alpine touch /dados/x
 * touch: /dados/x: Permission denied
 * ```
 *
 * O `apps/bots/Dockerfile` cria `/dados` com `chown node:node` justamente para
 * fechar esse buraco de uma vez. É um `mkdir` no lugar de cada bot ter de saber
 * dessa regra do Docker — que é o tipo de coisa que só o quarto bot descobre.
 *
 * Ver `apps/bots/CONTRATO.md`, §7.
 */

/** O caminho do volume. Igual para todos os bots; o volume é que é de cada um. */
export const DIRETORIO_PADRAO = "/dados";

/**
 * O diretório de estado deste bot.
 *
 * `BOTS_DADOS_DIR` existe para os testes e para a bancada descartável, onde o
 * estado vai para uma pasta temporária. Em produção o compose não precisa
 * defini-la: o `ENV` da imagem já aponta para `/dados`.
 */
export function diretorioDosDados(): string {
  return process.env.BOTS_DADOS_DIR?.trim() || DIRETORIO_PADRAO;
}
