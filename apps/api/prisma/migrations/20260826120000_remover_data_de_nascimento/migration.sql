-- Registro deixou de pedir data de nascimento: a coluna sai junto.
ALTER TABLE "User" DROP COLUMN IF EXISTS "birthDate";
