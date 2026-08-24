import { Prisma } from "@prisma/client";

/** True quando o erro é uma violação de constraint única (P2002) do Prisma. */
export function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}
