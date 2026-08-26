import { z } from "zod";

/**
 * Validação do ambiente no boot.
 *
 * A ideia é falhar cedo e alto: sem `JWT_SECRET`, por exemplo, `jwt.verify`
 * passava a aceitar/assinar com `undefined` e o problema só aparecia como
 * comportamento estranho de autenticação em produção. Aqui o processo nem sobe.
 *
 * Só entram aqui as variáveis **obrigatórias**. As opcionais (LiveKit, R2,
 * REDIS_URL) seguem checadas em tempo de execução — o app roda sem elas de
 * propósito (ver PENDENCIAS.md); sem Redis, presença e broadcast ficam
 * single-process.
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
    NODE_ENV: z.string().optional(),
    THROTTLE_DISABLED: z.string().optional(),
  })
  // segredos iguais fariam um refresh token valer como access token
  .refine((e) => e.JWT_SECRET !== e.JWT_REFRESH_SECRET, {
    message: "JWT_SECRET e JWT_REFRESH_SECRET precisam ser diferentes",
    path: ["JWT_REFRESH_SECRET"],
  })
  // THROTTLE_DISABLED=1 existe só para a bateria e2e local (app.module.ts);
  // em produção deixaria login/registro sem teto de tentativas.
  .refine(
    (e) => !(e.NODE_ENV === "production" && e.THROTTLE_DISABLED === "1"),
    {
      message: "THROTTLE_DISABLED=1 não pode ser usado com NODE_ENV=production",
      path: ["THROTTLE_DISABLED"],
    },
  );

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
