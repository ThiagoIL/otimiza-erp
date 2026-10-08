import "server-only";
import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@/db/schema";
import { env } from "./env";

type DB = NodePgDatabase<typeof schema>;
const g = globalThis as unknown as { __erpPool?: pg.Pool; __erpDb?: DB };

const pool =
  g.__erpPool ??
  new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000,
  });
pool.on("error", (err) => console.error("[db] erro na conexão ociosa:", err.message));

/** Acesso administrativo (usuários, sessões, empresas, auditoria). Use apenas no servidor. */
export const db: DB = g.__erpDb ?? drizzle(pool, { schema });
g.__erpPool = pool;
g.__erpDb = db;

export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

/**
 * Executa operações de negócio isoladas na empresa informada.
 * Dentro da transação o banco só enxerga e aceita linhas desta empresa (Row Level Security),
 * mesmo que alguma consulta esqueça o filtro por tenant_id.
 */
export async function withTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!tenantId) throw new Error("withTenant: empresa não informada");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    await tx.execute(sql`set local role erp_app`);
    return fn(tx);
  });
}

export async function pingDb(): Promise<boolean> {
  try { await pool.query("select 1"); return true; } catch { return false; }
}
