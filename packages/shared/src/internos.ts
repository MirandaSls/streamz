// Blocos de construção usados por vários módulos do contrato.
//
// **Não faz parte da API pública**: o `index.ts` não reexporta este arquivo, e
// é de propósito. Eram `const` privadas do index.ts de 3 mil linhas, onde
// "privado ao arquivo" bastava; com o contrato repartido, elas precisavam de um
// lugar sem virar superfície pública. Quem consome `@streamz/shared` continua
// sem enxergá-las.
//
// A única exceção é `MAX_MESSAGE_LENGTH`, que sempre foi pública: mora aqui
// porque o schema do conteúdo depende dela, e `mensagens.ts` a reexporta.

import { z } from "zod";

/** Teto de caracteres de uma mensagem (canal ou DM). */
export const MAX_MESSAGE_LENGTH = 2000;

/** id opaco (cuid) — só precisamos rejeitar vazio e string absurda. */
export const idSchema = z
  .string({ required_error: "obrigatório", invalid_type_error: "deve ser texto" })
  .min(1, "id ausente")
  .max(64, "id inválido");

/** Corpo de mensagem: texto dentro do teto. `min` fica a cargo de quem usa. */
export const conteudoSchema = z
  .string({ required_error: "obrigatório", invalid_type_error: "deve ser texto" })
  .max(MAX_MESSAGE_LENGTH, `Mensagem acima de ${MAX_MESSAGE_LENGTH} caracteres`);

/** Idem, mas rejeitando mensagem só de espaço. */
export const conteudoNaoVazioSchema = conteudoSchema.refine((c) => c.trim().length > 0, {
  message: "Mensagem vazia",
});
