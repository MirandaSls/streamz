import type { CanalDoDiscord, LinhaDeCanal, LinhaDeCategoria } from "../tipos";

/**
 * `Channel` e `Category` → objeto `channel` do Discord.
 *
 * ── Lote C (tradução) implementa. Puro. ──
 *
 * A tabela de tipos é a do §5:
 *
 * | Nosso            | Discord                 |
 * |------------------|-------------------------|
 * | `TEXT`           | 0 `GUILD_TEXT`          |
 * | `DM`             | 1 `DM`                  |
 * | `VOICE`          | 2 `GUILD_VOICE`         |
 * | `GROUP`          | 3 `GROUP_DM`            |
 * | `Category` (tab.)| 4 `GUILD_CATEGORY`      |
 * | `ANNOUNCEMENT`   | 5 `GUILD_ANNOUNCEMENT`  |
 *
 * **Categoria no Discord é canal.** É por isso que há duas funções e uma só
 * rota (`GET /channels/:id` resolve as duas tabelas).
 */

/** O número do tipo, isolado para o teste de tabela. */
export function tipoDeCanalParaDiscord(_tipo: LinhaDeCanal["type"]): number {
  throw new Error("F1 lote C: tipoDeCanalParaDiscord não implementado");
}

export function canalParaDiscord(_c: LinhaDeCanal): CanalDoDiscord {
  throw new Error("F1 lote C: canalParaDiscord não implementado");
}

/** Categoria → canal tipo 4. `parent_id` de um canal aponta para o id daqui. */
export function categoriaParaDiscord(_c: LinhaDeCategoria): CanalDoDiscord {
  throw new Error("F1 lote C: categoriaParaDiscord não implementado");
}
