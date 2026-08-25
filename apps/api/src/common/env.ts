import { z } from "zod";

/**
 * Validação do ambiente no boot.
 *
 * A ideia é falhar cedo e alto: sem `JWT_SECRET`, por exemplo, `jwt.verify`
 * passava a aceitar/assinar com `undefined` e o problema só aparecia como
 * comportamento estranho de autenticação em produção. Aqui o processo nem sobe.
 *
 * Só entram aqui as variáveis **obrigatórias**. As opcionais (LiveKit, R2)
 * seguem checadas em tempo de execução pelos respectivos `isConfigured()`, que
 * respondem 503 — o app roda sem elas de propósito (ver PENDENCIAS.md).
 */
const envSchema = z
  .object({
    DATABASE_URL: z
      .string()
      .min(1, "DATABASE_URL é obrigatória (ex.: file:./dev.db)"),
    JWT_SECRET: z
      .string()
      .min(16, "JWT_SECRET precisa de ao menos 16 caracteres aleatórios"),
    JWT_REFRESH_SECRET: z
      .string()
      .min(16, "JWT_REFRESH_SECRET precisa de ao menos 16 caracteres aleatórios"),
  })
  // segredos iguais fariam um refresh token valer como access token
  .refine((e) => e.JWT_SECRET !== e.JWT_REFRESH_SECRET, {
    message: "JWT_SECRET e JWT_REFRESH_SECRET precisam ser diferentes",
    path: ["JWT_REFRESH_SECRET"],
  });

/**
 * Passada ao `ConfigModule.forRoot({ validate })`. Devolve a config inteira —
 * inclusive as chaves que não validamos —, já que o resto do código lê de
 * `process.env` direto.
 */
export function validateEnv(config: Record<string, unknown>) {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const problemas = result.error.issues
      .map((i) => `  - ${i.message}`)
      .join("\n");
    throw new Error(
      `Ambiente inválido — a API não vai subir:\n${problemas}\n` +
        "Copie .env.example para .env e preencha (ver PENDENCIAS.md).",
    );
  }
  return config;
}
