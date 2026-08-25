/**
 * Postgres embutido para desenvolvimento, sem Docker nem instalação com admin.
 *
 * `pnpm db:embedded` baixa (uma vez) os binários do Postgres via
 * `embedded-postgres`, inicializa `./.pgdata` e sobe em localhost:5432 com as
 * mesmas credenciais do docker-compose — o `DATABASE_URL` do .env.example
 * funciona sem mudança. Ctrl+C para parar; os dados ficam em ./.pgdata.
 *
 * É a alternativa ao `pnpm db:up` (docker-compose) para máquinas em que o
 * Docker Desktop não sobe (ex.: WSL indisponível).
 */
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const dir = resolve(process.cwd(), ".pgdata");
const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: process.env.POSTGRES_USER ?? "newdisc",
  password: process.env.POSTGRES_PASSWORD ?? "newdisc",
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  persistent: true,
});

const novo = !existsSync(resolve(dir, "PG_VERSION"));
if (novo) {
  console.log("[db] inicializando cluster em", dir);
  await pg.initialise();
}
await pg.start();
if (novo) {
  await pg.createDatabase(process.env.POSTGRES_DB ?? "newdisc");
  console.log("[db] banco criado");
}
console.log(`[db] Postgres no ar em localhost:${process.env.POSTGRES_PORT ?? 5432} (Ctrl+C para parar)`);

const parar = async () => {
  console.log("\n[db] parando…");
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", parar);
process.on("SIGTERM", parar);
