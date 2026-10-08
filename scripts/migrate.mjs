// Aplica as migrações pendentes da pasta ./drizzle no banco DATABASE_URL.
// Usado em desenvolvimento (npm run db:migrate) e automaticamente no início do container.
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";

const url = process.env.DATABASE_URL;
if (!url) { console.error("[migrate] defina DATABASE_URL"); process.exit(1); }
const here = path.dirname(fileURLToPath(import.meta.url));
const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  console.log("[migrate] aplicando migrações…");
  await migrate(drizzle(pool), { migrationsFolder: path.join(here, "..", "drizzle") });
  console.log("[migrate] banco atualizado.");
} catch (err) {
  console.error("[migrate] falhou:", err?.message ?? err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
