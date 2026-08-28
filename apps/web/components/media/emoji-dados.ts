/**
 * Catálogo de emojis unicode por categoria, para a grade própria do seletor.
 *
 * Por que os dados vêm do JSON da `emoji-picker-react` e não do componente
 * dela: o seletor do Discord tem **coluna vertical** de categorias com os
 * ícones dos servidores misturados aos das categorias unicode, cabeçalhos
 * grudados no topo e uma busca só que cobre unicode e personalizado ao mesmo
 * tempo. Nada disso é configurável no componente pronto — mas o pacote de
 * dados dele é bom e já está instalado, então ficamos com os dados e
 * desenhamos a grade. A dependência continua no `package.json` justamente por
 * isso. O JSON, e não o `.js` ao lado dele, porque aquele arquivo é ESM dentro
 * de um pacote CommonJS — JSON o bundler e o Node carregam igual.
 *
 * O JSON traz `{ n: [palavras…, nome], u: unificado, v?: [tons] }`.
 * O último item de `n` é o nome por extenso; os anteriores são as palavras de
 * busca em inglês. As palavras em português vêm da nossa lista curta do
 * autocomplete, casadas pelo caractere — é o que faz "coracao" achar ❤️.
 */

import dadosBrutos from "emoji-picker-react/dist/data/emojis.json";
import { EMOJIS_UNICODE } from "@/lib/emojis-unicode";

interface EmojiBruto {
  n: string[];
  u: string;
  v?: string[];
}

export interface EmojiItem {
  /** unificado sem tom de pele; é a chave estável do item. */
  u: string;
  char: string;
  /** nome no estilo `:rosto_sorrindo:` (sem os dois-pontos). */
  nome: string;
  /** demais palavras que a biblioteca guarda para este emoji. */
  aliases: string[];
  /** unificados dos cinco tons de pele, quando o emoji aceita. */
  variacoes?: string[];
  /** tudo em minúsculo e sem acento, para a busca única do seletor. */
  busca: string;
}

export interface CategoriaUnicode {
  id: string;
  titulo: string;
  itens: EmojiItem[];
}

/** Ordem e nomes das categorias, como o seletor as empilha. */
const CATEGORIAS_PT: { id: string; titulo: string }[] = [
  { id: "smileys_people", titulo: "Pessoas" },
  { id: "animals_nature", titulo: "Natureza" },
  { id: "food_drink", titulo: "Comida e bebida" },
  { id: "travel_places", titulo: "Viagem e lugares" },
  { id: "activities", titulo: "Atividades" },
  { id: "objects", titulo: "Objetos" },
  { id: "symbols", titulo: "Símbolos" },
  { id: "flags", titulo: "Bandeiras" },
];

/**
 * Tons de pele, na ordem do padrão unicode. `hex` é o modificador que aparece
 * no fim do unificado da variação (`1f44b-1f3fb`); `neutro` não tem nenhum.
 */
export const TONS_DE_PELE = [
  { id: "neutro", rotulo: "Padrão", hex: null, amostra: "#ffc83d" },
  { id: "claro", rotulo: "Claro", hex: "1f3fb", amostra: "#f7dece" },
  { id: "medio-claro", rotulo: "Médio-claro", hex: "1f3fc", amostra: "#f3d2a2" },
  { id: "medio", rotulo: "Médio", hex: "1f3fd", amostra: "#d5ab88" },
  { id: "medio-escuro", rotulo: "Médio-escuro", hex: "1f3fe", amostra: "#af7e57" },
  { id: "escuro", rotulo: "Escuro", hex: "1f3ff", amostra: "#7c533e" },
] as const;

export type TomDePele = (typeof TONS_DE_PELE)[number]["id"];

/** Converte `1f44b-1f3fb` no caractere correspondente. */
function paraCaractere(unificado: string): string {
  return unificado
    .split("-")
    .map((hex) => String.fromCodePoint(parseInt(hex, 16)))
    .join("");
}

/** Tira acento e caixa: a busca compara "coracao" com o que a pessoa digitou. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function paraSlug(nome: string): string {
  return normalizar(nome)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

let catalogo: CategoriaUnicode[] | null = null;
let porCaractere: Map<string, EmojiItem> | null = null;

/**
 * Monta o catálogo na primeira vez que alguém precisa dele.
 *
 * São ~1.900 emojis: fazer isso no import faria toda página que carrega o
 * módulo pagar o custo, inclusive na renderização do servidor, sem usar nada.
 */
function garantirCatalogo(): CategoriaUnicode[] {
  if (catalogo) return catalogo;

  // palavras em português da nossa lista curta, casadas pelo caractere
  const ptPorChar = new Map(EMOJIS_UNICODE.map((e) => [e.char, `${e.nome} ${e.busca}`]));
  const brutos: Record<string, EmojiBruto[]> = dadosBrutos.emojis;
  const indice = new Map<string, EmojiItem>();

  catalogo = CATEGORIAS_PT.map(({ id, titulo }) => {
    const itens = (brutos[id] ?? []).map((bruto) => {
      const char = paraCaractere(bruto.u);
      const nomeLongo = bruto.n[bruto.n.length - 1] ?? bruto.u;
      const aliases = bruto.n.slice(0, -1);
      const item: EmojiItem = {
        u: bruto.u,
        char,
        nome: paraSlug(nomeLongo),
        aliases,
        variacoes: bruto.v,
        busca: normalizar(
          [nomeLongo, ...aliases, ptPorChar.get(char) ?? ""].join(" "),
        ),
      };
      indice.set(char, item);
      return item;
    });
    return { id, titulo, itens };
  });

  porCaractere = indice;
  return catalogo;
}

export function categoriasUnicode(): CategoriaUnicode[] {
  return garantirCatalogo();
}

/** Reencontra o item a partir do caractere gravado nos "usados com frequência". */
export function emojiPorCaractere(char: string): EmojiItem | undefined {
  garantirCatalogo();
  return porCaractere?.get(char);
}

/**
 * O caractere com o tom de pele escolhido, ou o neutro quando o emoji não
 * aceita tom (a maioria não aceita — só mãos, rostos e corpos).
 */
export function comTomDePele(item: EmojiItem, tom: TomDePele): string {
  if (tom === "neutro" || !item.variacoes?.length) return item.char;
  const hex = TONS_DE_PELE.find((t) => t.id === tom)?.hex;
  const variacao = hex && item.variacoes.find((v) => v.includes(hex));
  return variacao ? paraCaractere(variacao) : item.char;
}

/**
 * Emojis unicode que casam com o termo. Devolve na ordem "começa com o termo"
 * antes de "contém o termo" — quem digita `fo` quer `fogo` antes de `sofá`.
 */
export function buscarUnicode(termo: string, limite = 120): EmojiItem[] {
  const q = normalizar(termo.trim());
  if (!q) return [];
  const comeca: EmojiItem[] = [];
  const contem: EmojiItem[] = [];
  for (const categoria of garantirCatalogo()) {
    for (const item of categoria.itens) {
      if (item.nome.startsWith(q)) comeca.push(item);
      else if (item.busca.includes(q)) contem.push(item);
    }
  }
  return [...comeca, ...contem].slice(0, limite);
}
