import Link from "next/link";
import { asc } from "drizzle-orm";
import { withTenant } from "@/lib/db";
import { itemGroups } from "@/db/schema";
import { requireTenantUser } from "@/lib/context";
import { ItemForm } from "@/components/ItemForm";

export async function TenantNewItem() {
  const s = await requireTenantUser();
  const groups = await withTenant(s.tenant.id, (tx) => tx.select({ id: itemGroups.id, name: itemGroups.name }).from(itemGroups).orderBy(asc(itemGroups.name)));
  return (
    <>
      <div className="ph"><div><Link className="back" href="/estoque/itens">‹ Itens</Link><h1>Novo item</h1></div></div>
      <section className="panel" style={{ maxWidth: 820 }}><div className="pb"><ItemForm groups={groups} /></div></section>
    </>
  );
}
