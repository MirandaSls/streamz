import type { AuditLogChange } from "@streamz/shared";

/**
 * Diferença entre o estado anterior e o novo, no formato do registro de
 * auditoria.
 *
 * Só entram os campos que a chamada declara (`fields`) e que de fato mudaram —
 * um `PATCH` que reenvia o nome igual não deve virar linha de "editou o nome".
 * É função pura de propósito: quem registra a auditoria nunca deve depender de
 * ir ao banco para descobrir o que mudou.
 */
export function diffChanges<T extends object>(
  before: Partial<T>,
  after: Partial<T>,
  fields: (keyof T & string)[],
): AuditLogChange[] {
  const out: AuditLogChange[] = [];
  for (const field of fields) {
    // campo ausente no payload = "não mexeu nisso", diferente de "virou null"
    if (!(field in after)) continue;
    const antes = before[field] ?? null;
    const depois = after[field] ?? null;
    if (mesmoValor(antes, depois)) continue;
    out.push({ field, before: antes, after: depois });
  }
  return out;
}

/** Igualdade rasa boa o bastante para campo de formulário (inclui listas). */
function mesmoValor(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => mesmoValor(v, b[i]));
  }
  return false;
}
