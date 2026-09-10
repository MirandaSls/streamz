/**
 * As mensagens do **Streamz Boas-vindas** — tudo função pura.
 *
 * É a parte que dá para testar sem gateway, sem banco e sem servidor de pé, e
 * é onde mora o defeito clássico deste tipo de bot: a substituição de
 * variáveis que roda **duas vezes** e deixa um apelido de usuário virar
 * comando. Ver `substituirVariaveis`.
 */

import { MAX_MESSAGE_LENGTH } from "@streamz/shared";

/** As variáveis que uma mensagem pode usar. A lista é o contrato com quem configura. */
export const VARIAVEIS = ["usuario", "nome", "servidor", "contagem"] as const;

export type Variavel = (typeof VARIAVEIS)[number];

/** O que a mensagem sabe sobre quem entrou (ou saiu). */
export interface DadosDoMembro {
  /**
   * A **menção**. No Streamz uma menção é `@usuario` e não `<@id>`: o parser do
   * cliente (`apps/web/lib/markdown-core.ts`) só reconhece `@nome`, e
   * `mentionsUser` de `@streamz/shared` — quem decide se o sino toca — casa a
   * mesma forma. Escrever `<@snowflake>` sairia como texto cru e não avisaria
   * ninguém: seria uma boas-vindas que não chama a pessoa.
   */
  usuario: string;
  /** Nome de exibição (apelido no servidor, se houver). */
  nome: string;
  /** Nome do servidor. */
  servidor: string;
  /** Quantos membros o servidor tem **depois** da entrada (ou da saída). */
  contagem: number;
}

export const MENSAGEM_ENTRADA_PADRAO =
  "{usuario} chegou! Bem-vindo(a) ao **{servidor}** — já somos {contagem}.";

export const MENSAGEM_SAIDA_PADRAO = "**{nome}** saiu do servidor. Agora somos {contagem}.";

export const MENSAGEM_DM_PADRAO =
  "Oi, {nome}! Boas-vindas ao **{servidor}**. Qualquer dúvida, é só perguntar por lá.";

/** `{usuario}` etc., numa passada só. */
const MARCADOR = new RegExp(`\\{(${VARIAVEIS.join("|")})\\}`, "g");

/** Qualquer `{palavra}`, para apontar o que foi digitado errado. */
const QUALQUER_MARCADOR = /\{([a-zA-Z0-9_]+)\}/g;

/**
 * Troca `{usuario}`, `{nome}`, `{servidor}` e `{contagem}` pelos valores.
 *
 * **Uma passada só**, com `replace` e função — e isto não é detalhe de estilo.
 * Um encadeamento de `.replace("{usuario}", …).replace("{servidor}", …)` faz o
 * valor já substituído voltar a ser procurado: alguém com o apelido
 * `{servidor}` faria a segunda passada trocar o próprio nome pelo do servidor.
 * Bobo, mas é o caminho por onde um nome escolhido pelo usuário vira conteúdo
 * escolhido pelo usuário.
 *
 * Marcador desconhecido fica **como está**: quem escreveu `{data}` vê `{data}`
 * na mensagem e entende que errou, em vez de ver um buraco.
 */
export function substituirVariaveis(modelo: string, dados: DadosDoMembro): string {
  return modelo.replace(MARCADOR, (_inteiro, nome: string) => {
    switch (nome as Variavel) {
      case "usuario":
        return dados.usuario;
      case "nome":
        return dados.nome;
      case "servidor":
        return dados.servidor;
      case "contagem":
        return String(dados.contagem);
    }
  });
}

/** Os `{marcadores}` que o modelo usa e o bot não conhece. Sem repetição. */
export function variaveisDesconhecidas(modelo: string): string[] {
  const fora = new Set<string>();
  for (const achado of modelo.matchAll(QUALQUER_MARCADOR)) {
    const nome = achado[1]!;
    if (!(VARIAVEIS as readonly string[]).includes(nome)) fora.add(nome);
  }
  return [...fora];
}

/**
 * Corta a mensagem no limite do Streamz.
 *
 * A substituição pode estourar o que a configuração não estourava: um modelo de
 * 1.900 caracteres com `{servidor}` num servidor de nome comprido passa dos
 * 2.000, e a API responde 400 — a boas-vindas sumiria e o log diria "erro de
 * validação". Cortar é feio; não mandar nada é pior.
 */
export function limitarAoLimiteDaMensagem(texto: string): string {
  if (texto.length <= MAX_MESSAGE_LENGTH) return texto;
  return `${texto.slice(0, MAX_MESSAGE_LENGTH - 1)}…`;
}

/** Modelo + dados, já pronto para `channel.send`. */
export function montarMensagem(modelo: string, dados: DadosDoMembro): string {
  return limitarAoLimiteDaMensagem(substituirVariaveis(modelo, dados));
}
