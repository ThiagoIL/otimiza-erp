import "server-only";
import { sql } from "drizzle-orm";
import { db } from "./db";

/**
 * Limite de tentativas guardado no banco (funciona com várias instâncias da aplicação).
 * Devolve true se ainda está dentro do limite.
 */
export async function hit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const res = await db.execute<{ count: number }>(sql`
    insert into rate_limits (key, count, reset_at) values (${key}, 1, now() + make_interval(secs => ${windowSeconds}))
    on conflict (key) do update set
      count = case when rate_limits.reset_at < now() then 1 else rate_limits.count + 1 end,
      reset_at = case when rate_limits.reset_at < now() then now() + make_interval(secs => ${windowSeconds}) else rate_limits.reset_at end
    returning count`);
  // limpeza oportunista de registros antigos
  if (Math.random() < 0.02) {
    await db.execute(sql`delete from rate_limits where reset_at < now() - interval '1 day'`);
    await db.execute(sql`delete from sessions where expires_at < now()`);
  }
  return Number(res.rows[0]?.count ?? 0) <= limit;
}
