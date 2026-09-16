import { TIPO_DE_COMANDO_DE_APP, type TipoDeComandoDeApp } from "@streamz/shared";
import type { Recusa } from "./componentes";

/**
 * ── menus de contexto ── As regras puras dos comandos de app de contexto
 * (`docs/CONTRATO-MENUS.md` §7): "Apps >" no clique direito de uma mensagem
 * (tipo 3) ou de uma pessoa (tipo 2).
 *
 * Puras e sem Nest pelo mesmo motivo de `componentes.ts`: cabem num teste sem
 * banco, e o service só as chama.
 */

const TIPOS_VALIDOS: readonly number[] = Object.values(TIPO_DE_COMANDO_DE_APP);

/** O `?tipos=` ausente: só o comando de barra, para o composer antigo. */
export const TIPOS_PADRAO: readonly TipoDeComandoDeApp[] = [TIPO_DE_COMANDO_DE_APP.CHAT_INPUT];

/**
 * `?tipos=2,3` → `[2, 3]`. Ausente (ou vazio) é `[1]`. Qualquer pedaço que não
 * seja 1, 2 ou 3 é `null` — o controller responde 400. `?tipos=1&tipos=2`
 * chega como array, que não é o formato do contrato: também `null`.
 */
export function lerTiposDeComando(bruto: unknown): TipoDeComandoDeApp[] | null {
  if (bruto === undefined) return [...TIPOS_PADRAO];
  if (typeof bruto !== "string") return null;
  if (bruto.trim() === "") return [...TIPOS_PADRAO];
  const saida: TipoDeComandoDeApp[] = [];
  for (const pedaco of bruto.split(",")) {
    const texto = pedaco.trim();
    if (!/^\d$/u.test(texto)) return null;
    const tipo = Number(texto);
    if (!TIPOS_VALIDOS.includes(tipo)) return null;
    if (!saida.includes(tipo as TipoDeComandoDeApp)) saida.push(tipo as TipoDeComandoDeApp);
  }
  return saida;
}

/** `true` para 2 (USER) e 3 (MESSAGE). */
export function tipoDeContexto(tipo: number): boolean {
  return tipo === TIPO_DE_COMANDO_DE_APP.USER || tipo === TIPO_DE_COMANDO_DE_APP.MESSAGE;
}

/**
 * O alvo contra o tipo do comando, antes de qualquer consulta ao alvo:
 * - barra com alvo → 400;
 * - contexto sem alvo → 400;
 * - contexto com opções → 400 (o comando de contexto não declara nenhuma).
 */
export function conferirAlvoDoComando(
  tipo: number,
  targetId: string | undefined,
  quantasOpcoes: number,
): Recusa | null {
  if (!tipoDeContexto(tipo)) {
    return targetId !== undefined ? { status: 400, mensagem: "Comando de barra não tem alvo" } : null;
  }
  if (targetId === undefined) return { status: 400, mensagem: "Comando de contexto sem alvo" };
  if (quantasOpcoes > 0) return { status: 400, mensagem: "Comando de contexto não tem opções" };
  return null;
}

/**
 * O `tipo` da faixa "usou …" a partir do `data` guardado na `Interaction`.
 * Sem `type` numérico válido (linhas antigas, componente) é `undefined`, que a
 * web lê como 1.
 */
export function tipoDoDataGuardado(data: unknown): TipoDeComandoDeApp | undefined {
  if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
  const tipo = (data as { type?: unknown }).type;
  return typeof tipo === "number" && TIPOS_VALIDOS.includes(tipo)
    ? (tipo as TipoDeComandoDeApp)
    : undefined;
}
