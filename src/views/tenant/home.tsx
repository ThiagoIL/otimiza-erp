import Link from "next/link";
import { sql } from "drizzle-orm";
import { withTenant } from "@/lib/db";
import { itemGroups, items } from "@/db/schema";
import { requireTenantUser } from "@/lib/context";

export async function TenantHome({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const s = await requireTenantUser();
  const [ni, ng] = await withTenant(s.tenant.id, async (tx) => [
    await tx.select({ ativos: sql<number>`(count(*) filter (where active))::int` }).from(items),
    await tx.select({ c: sql<number>`count(*)::int` }).from(itemGroups),
  ] as const);
  return (
    <>
      {searchParams["sem-permissao"] && <div className="alert warn">Essa área é exclusiva dos administradores da empresa.</div>}
      <div className="ph"><div><h1>Olá, {s.user.name.split(" ")[0]}.</h1><p>{s.tenant.name}</p></div></div>
      <div className="kpis">
        <Link className="kpi" href="/itens"><b>{ni[0].ativos}</b><span>Itens ativos</span></Link>
        <Link className="kpi" href="/itens"><b>{ng[0].c}</b><span>Grupos de itens</span></Link>
      </div>
      <section className="panel"><h2>Bem-vindo ao Otimiza+ ERP</h2><div className="pb">
        <p style={{ marginTop: 0 }}>Comece cadastrando os itens da fábrica: matérias-primas, componentes e produtos acabados. Produção, compras, vendas e financeiro chegam nas próximas versões.</p>
        <Link className="btn btn-primary" href="/itens/novo">Cadastrar item</Link>
      </div></section>
    </>
  );
}
