import { z } from "zod";

/**
 * Contratos compartilhados entre a API (NestJS) e o cliente (Next.js).
 * Um único lugar para os tipos de payload e os schemas de validação.
 */

export * from "./dominio";
export * from "./auth";
export * from "./permissoes";
export * from "./canais";
export * from "./mensagens";
export * from "./midia";
export * from "./voz";
export * from "./soundboard";
export * from "./social";
export * from "./moderacao";
export * from "./comunidade";
export * from "./conta";
export * from "./admin";
export * from "./eventos";
// ── j-bots ──
export * from "./snowflake";
export * from "./aplicativos";
export * from "./permissoes-discord";
// ── onda 3 ── embeds, componentes, modais e interações de componente
export * from "./mensagens-de-bot";
// ── menus de contexto ── fixar DM, notas, apelidos, ignorar, comandos de contexto
export * from "./menus";
