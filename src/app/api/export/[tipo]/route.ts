import type { NextRequest } from "next/server";
import { tenantSession } from "@/lib/context";
import { accessOf } from "@/lib/access";
import { withTenant } from "@/lib/db";
import { EXPORTS } from "@/server/exports";
import { csvResponse } from "@/server/csv";
import type { Tenant } from "@/db/schema";

export const dynamic = "force-dynamic";

/** Downloads em CSV (listas e relatórios). Respeita o acesso de consulta de cada módulo. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ tipo: string }> }) {
  const { tipo } = await params;
  const ex = EXPORTS[tipo];
  if (!ex) return new Response("Relatório não encontrado.", { status: 404 });
  const s = await tenantSession();
  if (!s || !s.tenant) return new Response("Sessão expirada. Entre novamente.", { status: 401 });
  const access = await accessOf({ ...s, tenant: s.tenant as Tenant });
  if (access.mods[ex.mod] === "nenhum") return new Response("Sem acesso.", { status: 403 });
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const { name, csv } = await withTenant(s.tenant.id, (tx) => ex.run(tx, s.tenant!.id, sp, access.costs));
  return csvResponse(name, csv);
}
