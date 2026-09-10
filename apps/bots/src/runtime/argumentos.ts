import type { Comando } from "./tipos";

/**
 * O parser do prefixo `!` — a alternativa ao comando de barra.
 *
 * Posicional e só. `!volume 40` e `!tocar caetano veloso` cobrem tudo que os
 * comandos deste repositório declaram, e um parser de `--chave valor` seria
 * mais código para uma entrada que quase ninguém usa quando o `/` existe.
 *
 * A regra que importa: a opção marcada `restoDaLinha` **engole o que sobrou**.
 * Sem ela, `!tocar caetano veloso` chegaria como `caetano`, e o bot buscaria a
 * música errada em silêncio — o pior tipo de defeito, porque parece que
 * funcionou.
 */
export function analisarArgumentos(comando: Comando, resto: string): Map<string, string> {
  const valores = new Map<string, string>();
  const opcoes = comando.opcoes ?? [];
  let sobra = resto.trim();

  for (let i = 0; i < opcoes.length; i++) {
    const opcao = opcoes[i]!;
    if (sobra === "") break;

    // A última opção, ou uma marcada como `restoDaLinha`, leva tudo.
    if (opcao.restoDaLinha || i === opcoes.length - 1) {
      valores.set(opcao.nome, sobra);
      sobra = "";
      break;
    }

    const espaco = sobra.search(/\s/);
    if (espaco === -1) {
      valores.set(opcao.nome, sobra);
      sobra = "";
    } else {
      valores.set(opcao.nome, sobra.slice(0, espaco));
      sobra = sobra.slice(espaco).trim();
    }
  }

  return valores;
}

/**
 * Quebra `!tocar algo aqui` em `{ nome: "tocar", resto: "algo aqui" }`.
 *
 * Devolve `null` quando a mensagem não começa com o prefixo — o caminho normal
 * de 99% das mensagens de um canal, e por isso a primeira coisa que a função
 * faz é a comparação mais barata possível.
 */
export function lerInvocacao(
  conteudo: string,
  prefixo: string,
): { nome: string; resto: string } | null {
  if (!conteudo.startsWith(prefixo)) return null;
  const semPrefixo = conteudo.slice(prefixo.length).trim();
  if (semPrefixo === "") return null;

  const espaco = semPrefixo.search(/\s/);
  if (espaco === -1) return { nome: semPrefixo.toLowerCase(), resto: "" };
  return {
    nome: semPrefixo.slice(0, espaco).toLowerCase(),
    resto: semPrefixo.slice(espaco).trim(),
  };
}

/**
 * Acha o comando por nome **ou apelido**.
 *
 * Os apelidos valem só aqui: eles não vão para o registro de comandos de barra,
 * porque no Discord (e na nossa casca) cada nome é um comando próprio e um
 * apelido registrado apareceria no composer como um segundo `/tocar` duplicado.
 */
export function acharComando(comandos: Comando[], nome: string): Comando | undefined {
  return comandos.find((c) => c.nome === nome || (c.apelidos ?? []).includes(nome));
}
