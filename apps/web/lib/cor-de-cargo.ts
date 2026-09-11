/**
 * Cor do ponto de um cargo **sem cor** (`Role.color` nulo).
 *
 * Vai em `style`, e não em classe, porque a cor de cargo com cor é um hex vindo
 * do banco — os dois caminhos precisam entrar pela mesma propriedade. É uma
 * variável CSS, não um hex: a cor tem de mudar junto com o tema (ADR-0009).
 *
 * `--channels-default` é o cinza que o Discord usa para o que não tem cor
 * própria na lista (nome de canal em repouso, membro sem cargo colorido).
 */
export const COR_DE_CARGO_SEM_COR = "var(--channels-default)";
