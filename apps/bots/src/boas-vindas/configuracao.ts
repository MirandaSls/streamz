/**
 * A configuração de um servidor, e as regras que a mantêm coerente.
 *
 * Tudo puro: nada aqui lê disco (isso é `armazem.ts`) nem fala com a API. A
 * função que importa é `normalizarConfiguracao`, e ela existe porque o estado
 * mora num **arquivo JSON que sobrevive a deploys**: o que voltar da leitura
 * pode ser de uma versão anterior do bot, pode ter sido editado à mão, e pode
 * estar truncado por um disco cheio. Nada disso pode derrubar o bot — a
 * resposta certa é cair para o padrão, campo a campo.
 */

import {
  MENSAGEM_DM_PADRAO,
  MENSAGEM_ENTRADA_PADRAO,
  MENSAGEM_SAIDA_PADRAO,
} from "./mensagem";

/** Versão do formato do arquivo. Sobe quando um campo mudar de significado. */
export const VERSAO = 1;

/**
 * Teto do modelo de mensagem, **abaixo** do limite de 2.000 do Streamz.
 *
 * A folga é de propósito: o modelo vira mensagem depois de as variáveis serem
 * trocadas, e `{servidor}` pode crescer. Ver `limitarAoLimiteDaMensagem`.
 */
export const MAX_MODELO = 1500;

export interface ConfigDeEntrada {
  /** Só é `true` com um canal escolhido — ver `normalizarConfiguracao`. */
  ligado: boolean;
  /** Snowflake do canal onde a mensagem é publicada. */
  canalId: string | null;
  mensagem: string;
  /** Mandar também uma mensagem privada a quem entrou. */
  dm: boolean;
  mensagemDm: string;
}

export interface ConfigDeSaida {
  ligado: boolean;
  canalId: string | null;
  mensagem: string;
}

export interface ConfigDeAutorole {
  ligado: boolean;
  /** Snowflake do cargo dado a quem entra. */
  cargoId: string | null;
}

export interface Configuracao {
  versao: number;
  entrada: ConfigDeEntrada;
  saida: ConfigDeSaida;
  autorole: ConfigDeAutorole;
}

/**
 * **Tudo desligado.** É o estado de um servidor que acabou de instalar o bot, e
 * é o que uma leitura de arquivo inexistente devolve.
 *
 * Um bot de boas-vindas que já chega mandando mensagem é um bot que escreve num
 * canal que ninguém escolheu, na hora em que ninguém pediu. O padrão é o
 * silêncio; a mensagem só começa quando alguém disser onde.
 */
export function configuracaoPadrao(): Configuracao {
  return {
    versao: VERSAO,
    entrada: {
      ligado: false,
      canalId: null,
      mensagem: MENSAGEM_ENTRADA_PADRAO,
      dm: false,
      mensagemDm: MENSAGEM_DM_PADRAO,
    },
    saida: { ligado: false, canalId: null, mensagem: MENSAGEM_SAIDA_PADRAO },
    autorole: { ligado: false, cargoId: null },
  };
}

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function texto(valor: unknown, padrao: string): string {
  if (typeof valor !== "string") return padrao;
  const limpo = valor.trim();
  if (limpo === "") return padrao;
  return limpo.slice(0, MAX_MODELO);
}

/**
 * Um id de snowflake, ou `null`.
 *
 * Só dígitos: é o formato dos ids que o gateway compat entrega (§10 do
 * documento) e a checagem também é a defesa do `armazem` contra um `..` vindo
 * de um arquivo editado à mão.
 */
export function idOuNulo(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  return /^[0-9]{1,32}$/.test(limpo) ? limpo : null;
}

/**
 * Qualquer coisa vinda do disco → uma `Configuracao` válida.
 *
 * As duas invariantes que ela **impõe**, e não apenas verifica:
 *
 * 1. `ligado` sem alvo é `desligado`. Um `entrada.ligado: true` com
 *    `canalId: null` faria o bot tentar publicar em lugar nenhum a cada
 *    entrada — um erro por membro, para sempre. O par ligado/alvo é a
 *    invariante do arquivo inteiro, e é aqui que ela se resolve.
 * 2. Toda mensagem tem texto. String vazia vira o padrão: publicar uma
 *    mensagem em branco é pior do que publicar a de fábrica.
 */
export function normalizarConfiguracao(bruto: unknown): Configuracao {
  const padrao = configuracaoPadrao();
  const raiz = objeto(bruto);
  const entrada = objeto(raiz["entrada"]);
  const saida = objeto(raiz["saida"]);
  const autorole = objeto(raiz["autorole"]);

  const canalDeEntrada = idOuNulo(entrada["canalId"]);
  const canalDeSaida = idOuNulo(saida["canalId"]);
  const cargo = idOuNulo(autorole["cargoId"]);

  return {
    versao: typeof raiz["versao"] === "number" ? raiz["versao"] : VERSAO,
    entrada: {
      ligado: entrada["ligado"] === true && canalDeEntrada !== null,
      canalId: canalDeEntrada,
      mensagem: texto(entrada["mensagem"], padrao.entrada.mensagem),
      dm: entrada["dm"] === true,
      mensagemDm: texto(entrada["mensagemDm"], padrao.entrada.mensagemDm),
    },
    saida: {
      ligado: saida["ligado"] === true && canalDeSaida !== null,
      canalId: canalDeSaida,
      mensagem: texto(saida["mensagem"], padrao.saida.mensagem),
    },
    autorole: {
      ligado: autorole["ligado"] === true && cargo !== null,
      cargoId: cargo,
    },
  };
}

/** `{ ok: true }` ou o motivo, na frase que o comando devolve a quem configurou. */
export type Veredito = { ok: true; texto: string } | { ok: false; motivo: string };

/** Valida o que alguém digitou em `/boas-vindas mensagem <texto>`. */
export function validarModelo(bruto: string | null): Veredito {
  const limpo = (bruto ?? "").trim();
  if (limpo === "") return { ok: false, motivo: "Escreve a mensagem depois do comando." };
  if (limpo.length > MAX_MODELO) {
    return {
      ok: false,
      motivo: `A mensagem tem ${limpo.length} caracteres; o máximo é ${MAX_MODELO}.`,
    };
  }
  return { ok: true, texto: limpo };
}

/** O bot tem o que precisa para publicar a entrada? */
export function entradaPronta(c: Configuracao): boolean {
  return c.entrada.ligado && c.entrada.canalId !== null;
}

/** O bot tem o que precisa para publicar a saída? */
export function saidaPronta(c: Configuracao): boolean {
  return c.saida.ligado && c.saida.canalId !== null;
}
