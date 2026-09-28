// Blocos de construção usados por vários módulos do contrato.
//
// **Não faz parte da API pública**: o `index.ts` não reexporta este arquivo, e
// é de propósito. Eram `const` privadas do index.ts de 3 mil linhas, onde
// "privado ao arquivo" bastava; com o contrato repartido, elas precisavam de um
// lugar sem virar superfície pública. Quem consome `@streamz/shared` continua
// sem enxergá-las.
//
// As exceções são `MAX_MESSAGE_LENGTH`, que sempre foi pública, e
// `MAX_BOT_MESSAGE_LENGTH`: moram aqui porque os schemas de conteúdo dependem
// delas, e `mensagens.ts` as reexporta.

import { z } from "zod";

/**
 * Teto de caracteres de uma mensagem de usuário (canal ou DM). 4000 é o teto
 * do Discord Nitro; texto maior que isso o cliente transforma em anexo
 * `message.txt` em vez de recusar.
 */
export const MAX_MESSAGE_LENGTH = 4000;
/**
 * Teto do `content` na API compatível com Discord. Bots escritos para o
 * Discord contam com 2000; aceitar mais aqui faria o bot funcionar no Streamz
 * e falhar lá.
 */
export const MAX_BOT_MESSAGE_LENGTH = 2000;

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
