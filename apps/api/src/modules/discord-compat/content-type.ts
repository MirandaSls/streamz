/**
 * `Content-Type: application/json` — **sem** `; charset=utf-8`.
 *
 * Não é preciosismo. O `json_or_text` do discord.py compara o cabeçalho por
 * **igualdade exata**:
 *
 * ```python
 * if response.headers['content-type'] == 'application/json':
 *     return utils._from_json(text)
 * return text
 * ```
 *
 * Com o charset, a comparação falha e **todo corpo chega ao bot como string**.
 * O sintoma fica a três camadas da causa: o `login()` morre em
 * `discord/user.py` com `TypeError: string indices must be integers`, que é o
 * `data['username']` de um `data` que virou texto. Foi assim que a prova 4 da
 * F1 falhou. O Discord de verdade responde `application/json` puro, então
 * imitar é a tradução fiel — e o discord.js não se importa com o parâmetro.
 *
 * **Por que não basta um `setHeader` antes do corpo** (foi a primeira tentativa,
 * e ela não funciona): o `res.send` do Express, ao escrever um corpo de texto,
 * relê o `Content-Type` e o **reescreve** com `setCharset(type, 'utf-8')`. Como
 * o `res.json` do Nest passa por lá, o charset volta depois de qualquer coisa
 * que se ponha antes.
 *
 * Então a saída é interceptar o próprio `setHeader`: qualquer tentativa de
 * gravar um `Content-Type` de JSON vira a forma sem parâmetro. É cirúrgico (só
 * neste cabeçalho, só nesta resposta, só nas rotas de compat) e sobrevive ao
 * Express, ao Nest e a quem vier depois.
 */

/** O mínimo do `Response` do Express que isto usa (o repo não tem `@types/express`). */
export interface RespostaComCabecalho {
  setHeader(nome: string, valor: string): unknown;
}

export const JSON_DO_DISCORD = "application/json";

/** Marca a resposta já tratada: o interceptor e o filtro podem chamar os dois. */
const MARCA = Symbol.for("streamz.discord-compat.content-type");

export function aplicarContentTypeDoDiscord(resposta: RespostaComCabecalho): void {
  const marcada = resposta as RespostaComCabecalho & { [MARCA]?: true };
  if (marcada[MARCA]) return;

  try {
    const original = resposta.setHeader.bind(resposta);

    resposta.setHeader = (nome: string, valor: string) => {
      // `startsWith` e não igualdade: o que chega aqui do Express é
      // "application/json; charset=utf-8", e o que queremos gravar é o prefixo.
      if (
        String(nome).toLowerCase() === "content-type" &&
        String(valor).startsWith(JSON_DO_DISCORD)
      ) {
        return original(nome, JSON_DO_DISCORD);
      }
      return original(nome, valor);
    };

    marcada[MARCA] = true;
    original("Content-Type", JSON_DO_DISCORD);
  } catch {
    // resposta já enviada (só acontece em caminho de erro duplo): não é aqui
    // que se resolve, e lançar daqui esconderia o erro de verdade.
  }
}
