import type { InteracaoDaMensagem } from "@streamz/shared";
import { toPublicUser, type PublicUserRow } from "../../common/dto";
import { tipoDoDataGuardado } from "./contexto";

/**
 * A faixa "@fulano usou /play" acima da resposta de um bot.
 *
 * ── Lote A (domínio) implementa. ──
 *
 * Puro e sem Nest de propósito: quem monta o `Message` é o `MessagesService`, e
 * injetar o `InteractionsService` lá criaria um ciclo de módulos (o
 * `InteractionsModule` já importa o `MessagesModule`). Um `import` de função não
 * cria ciclo nenhum, e o mapeador fica testável sem banco.
 *
 * **Não há coluna nova em `Message`.** A ligação mora do lado da `Interaction`,
 * em `responseMessageId` (`@unique`), e o `Message` só ganha a back-relation —
 * que é virtual. Foi de propósito: a `Message` é a maior tabela do banco e a
 * migration 4 é aditiva pura, sem `ALTER TABLE "Message"`.
 */

/**
 * O `include` que o `MESSAGE_INCLUDE` do `MessagesService` acrescenta.
 *
 * Uma linha, e o custo é uma consulta a mais por página de mensagens (o Prisma
 * resolve relação em consulta separada) contra uma tabela pequena e indexada.
 */
export const INTERACAO_DA_MENSAGEM_INCLUDE = {
  select: {
    id: true,
    commandName: true,
    user: true,
    // ── menus de contexto ── o `tipo` da faixa sai de `data.type`, como foi
    // enviado ao bot: a linha do comando pode ter sumido num re-registro, e o
    // Prisma não seleciona um caminho dentro de um Json. O custo é o `data`
    // inteiro só das mensagens que são resposta de interação.
    data: true,
  },
} as const;

/** A linha que o include acima devolve. */
export interface LinhaDaFaixa {
  id: string;
  /** ── onda 3 ── null em interação de componente/modal (não há comando). */
  commandName: string | null;
  user: PublicUserRow;
  /** ── menus de contexto ── o `data` do `INTERACTION_CREATE`; só `type` é lido. */
  data?: unknown;
}

/** `null` para toda mensagem que não veio de uma interação — quase todas. */
export function toInteracaoDaMensagem(
  linha: LinhaDaFaixa | null | undefined,
): InteracaoDaMensagem | null {
  // ── onda 3 ── a resposta a um **botão** não ganha a faixa "usou /…": não
  // houve comando, e o Discord também não a desenha
  if (!linha || linha.commandName === null) return null;
  return {
    id: linha.id,
    name: linha.commandName,
    user: toPublicUser(linha.user),
    // ── menus de contexto ── 2/3 tiram a barra da faixa; ausente/antigo = 1
    tipo: tipoDoDataGuardado(linha.data) ?? 1,
  };
}
