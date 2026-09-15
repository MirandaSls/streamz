/**
 * Cor do ponto de um cargo **sem cor** (`Role.color` nulo).
 *
 * Vai em `style`, e não em classe, porque a cor de cargo com cor é um hex vindo
 * do banco — os dois caminhos precisam entrar pela mesma propriedade. É uma
 * variável CSS, não um hex: a cor tem de mudar junto com o tema (ADR-0009).
 *
 * `--role-default` é o token do próprio Discord para isto — existe em
 * `apps/web/app/tokens.css` (`:root`, `[data-tema="ash"]`, `[data-tema="onyx"]`)
 * e em `apps/web/tokens.gerados.ts`. É diferente de `--channels-default`
 * (aquele é o cinza de nome de canal/membro sem cargo colorido na lista) —
 * hoje as duas variáveis têm o mesmo valor nos três temas, mas são o token
 * semântico certo para cada uso, e podem divergir se o Discord mudar um sem
 * mudar o outro.
 */
export const COR_DE_CARGO_SEM_COR = "var(--role-default)";
