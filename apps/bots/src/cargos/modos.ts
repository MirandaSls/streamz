import type { ChaveDeEmoji } from "./emoji";

/**
 * Os quatro modos de painel, e a decisão que cada um toma — puro, sem rede.
 *
 * Toda a regra do bot cabe em duas funções (`decidirAoReagir` e
 * `decidirAoDesreagir`). Elas não sabem o que é um cargo do Streamz nem o que é
 * uma reação: recebem o painel, a chave do emoji e os cargos que o membro já
 * tem, e devolvem **o que fazer**. Quem faz é o `servico.ts`.
 *
 * A separação não é enfeite. "Reagir no modo único troca o cargo" é a frase que
 * o usuário lê na descrição do bot, e é a única parte deste código que dá para
 * testar sem subir um Streamz inteiro.
 */

export const MODOS = ["normal", "unico", "so-adicionar", "travado"] as const;
export type Modo = (typeof MODOS)[number];

export const MODO_PADRAO: Modo = "normal";

/** O que cada modo faz, em uma linha — é o texto que o `/painel listar` mostra. */
export const EXPLICACAO_DO_MODO: Record<Modo, string> = {
  normal: "vários cargos ao mesmo tempo; tirar a reação tira o cargo",
  unico: "um cargo por vez; pegar outro troca (e tira a reação anterior)",
  "so-adicionar": "dá o cargo, mas tirar a reação **não** tira o cargo",
  travado: "a primeira escolha vale; depois não dá para trocar nem desistir",
};

/**
 * O que o usuário digitou → um modo.
 *
 * Aceita o acento e o hífen que qualquer pessoa escreveria (`único`,
 * `só-adicionar`, `so adicionar`): o comando é digitado à mão e recusar por
 * causa de um acento é a recusa mais irritante que existe.
 */
export function normalizarModo(bruto: string | null | undefined): Modo | null {
  if (!bruto) return null;
  const limpo = bruto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    // combina os acentos fora; `\p{Diacritic}` cobre til, agudo e circunflexo
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\s_]+/g, "-");
  if (limpo === "unico" || limpo === "um" || limpo === "so-um") return "unico";
  if (limpo === "so-adicionar" || limpo === "somente-adicionar" || limpo === "adicionar") {
    return "so-adicionar";
  }
  if (limpo === "travado" || limpo === "trancado" || limpo === "fixo") return "travado";
  if (limpo === "normal" || limpo === "varios" || limpo === "livre") return "normal";
  return null;
}

/** Um painel, do ponto de vista da decisão. O `estado.ts` guarda mais campos. */
export interface PainelParaDecidir {
  modo: Modo;
  itens: Record<ChaveDeEmoji, { cargoId: string }>;
}

/** O que fazer quando alguém reage. */
export interface DecisaoAoReagir {
  /** Cargo a dar, ou `null` se nada muda. */
  darCargo: string | null;
  /** Cargos a tirar junto (modo `unico`). */
  tirarCargos: string[];
  /** Reações **do próprio usuário** que devem sair da mensagem do painel. */
  tirarReacoes: ChaveDeEmoji[];
  /** Preenchido quando o modo recusou a mudança — vira log e nada mais. */
  recusa?: string;
}

/** O que fazer quando alguém tira a reação. */
export interface DecisaoAoDesreagir {
  tirarCargo: string | null;
  recusa?: string;
}

const NADA: DecisaoAoReagir = { darCargo: null, tirarCargos: [], tirarReacoes: [] };

/**
 * Reagiu: quem ganha o quê.
 *
 * `cargosDoMembro` são os cargos que o membro **já tem** — é o que faz o modo
 * `unico` saber o que tirar e o `travado` saber que já houve escolha.
 */
export function decidirAoReagir(
  painel: PainelParaDecidir,
  chave: ChaveDeEmoji,
  cargosDoMembro: readonly string[],
): DecisaoAoReagir {
  const item = painel.itens[chave];
  // Reação num emoji que não é do painel: não é erro, é alguém reagindo à
  // mensagem como reagiria a qualquer outra. Não mexemos.
  if (!item) return NADA;

  const tem = new Set(cargosDoMembro);
  // Os outros cargos **deste painel** que o membro já veste.
  const outros = Object.entries(painel.itens)
    .filter(([outraChave, outro]) => outraChave !== chave && tem.has(outro.cargoId))
    .map(([outraChave, outro]) => ({ chave: outraChave, cargoId: outro.cargoId }));

  if (painel.modo === "travado") {
    if (tem.has(item.cargoId)) return NADA;
    if (outros.length > 0) {
      // Já escolheu. A reação nova é desfeita para o painel não mentir sobre o
      // que a pessoa tem — sem isso, a mensagem mostraria duas escolhas e o
      // servidor só uma.
      return { darCargo: null, tirarCargos: [], tirarReacoes: [chave], recusa: "travado" };
    }
    return { darCargo: item.cargoId, tirarCargos: [], tirarReacoes: [] };
  }

  if (painel.modo === "unico") {
    return {
      darCargo: tem.has(item.cargoId) ? null : item.cargoId,
      tirarCargos: outros.map((o) => o.cargoId),
      tirarReacoes: outros.map((o) => o.chave),
    };
  }

  // normal e so-adicionar são iguais **ao reagir**; o que os separa é o
  // desreagir.
  return {
    darCargo: tem.has(item.cargoId) ? null : item.cargoId,
    tirarCargos: [],
    tirarReacoes: [],
  };
}

/** Desreagiu: tira o cargo, ou não, conforme o modo. */
export function decidirAoDesreagir(
  painel: PainelParaDecidir,
  chave: ChaveDeEmoji,
  cargosDoMembro: readonly string[],
): DecisaoAoDesreagir {
  const item = painel.itens[chave];
  if (!item) return { tirarCargo: null };

  if (painel.modo === "so-adicionar") return { tirarCargo: null, recusa: "so-adicionar" };
  if (painel.modo === "travado") return { tirarCargo: null, recusa: "travado" };

  // Não temos o cargo? Nada a tirar — e evita um PUT/DELETE inútil na API a
  // cada reação que o próprio bot removeu (modo `unico`).
  if (!cargosDoMembro.includes(item.cargoId)) return { tirarCargo: null };
  return { tirarCargo: item.cargoId };
}
