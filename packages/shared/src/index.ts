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
export * from "./social";
export * from "./moderacao";
export * from "./comunidade";
export * from "./conta";
export * from "./admin";
export * from "./eventos";
