import { BadRequestException, Injectable, type PipeTransform } from "@nestjs/common";
import type { ZodSchema } from "zod";

/**
 * Valida o corpo da requisição com um schema de `@newdisc/shared`.
 *
 * O resto da API usa DTOs de `class-validator`, e continua usando. As rotas de
 * conta e segurança não usam porque o contrato delas **já existe** em zod no
 * pacote compartilhado (`contaRegistroSchema`, `alterarSenhaSchema`, …): copiar
 * as mesmas regras para uma classe de decorators criaria duas fontes de verdade
 * — e a que a web usa para recusar antes do round-trip seria a de zod, não a da
 * classe. Aqui os dois lados leem o mesmo schema.
 *
 * A mensagem devolvida é a primeira falha, no formato que a web já espera de um
 * 400 (`{ message: string }`).
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const resultado = this.schema.safeParse(value);
    if (resultado.success) return resultado.data;

    const primeira = resultado.error.issues[0];
    const campo = primeira?.path.join(".");
    const texto = primeira?.message ?? "Dados inválidos";
    throw new BadRequestException(campo ? `${campo}: ${texto}` : texto);
  }
}

/** Açúcar para `@Body(zodBody(schema))`. */
export function zodBody<T>(schema: ZodSchema<T>): ZodValidationPipe<T> {
  return new ZodValidationPipe(schema);
}
