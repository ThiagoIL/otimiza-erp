import { pingDb } from "@/lib/db";
export const dynamic = "force-dynamic";
/** Verificação de saúde para o Easypanel e monitoramento: 200 se o app e o banco respondem. */
export async function GET() {
  const db = await pingDb();
  return Response.json({ status: db ? "ok" : "degraded", db }, { status: db ? 200 : 503, headers: { "cache-control": "no-store" } });
}
