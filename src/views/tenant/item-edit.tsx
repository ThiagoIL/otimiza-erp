import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { withTenant } from "@/lib/db";
import { itemGroups, items } from "@/db/schema";
import { requireTenantUser } from "@/lib/context";
import { ItemForm } from "@/components/ItemForm";
import { Form, Hidden, Submit } from "@/components/Form";
import { deleteItemAction } from "@/server/item-actions";

export async function TenantEditItem({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireTenantUser();
  const { id } = await params;
  const [item, groups] = await withTenant(s.tenant.id, async (tx) => [
    (await tx.select().from(items).where(and(eq(items.id, id), eq(items.tenantId, s.tenant.id))).limit(1))[0],
    await tx.select({ id: itemGroups.id, name: itemGroups.name }).from(itemGroups).orderBy(asc(itemGroups.name)),
  ] as const);
  if (!item) notFound();
  return (
    <>
      <div className="ph"><div><Link className="back" href="/itens">‹ Itens</Link><h1>{item.name}</h1><p>Código {item.code}</p></div></div>
      <section className="panel" style={{ maxWidth: 820 }}><div className="pb"><ItemForm item={item} groups={groups} /></div></section>
      {s.user.role === "TENANT_ADMIN" && (
        <section className="panel danger-zone" style={{ maxWidth: 820, marginTop: 16 }}><h2>Excluir item</h2><div className="pb">
          <Form action={deleteItemAction} className="">
            <Hidden name="id" value={item.id} />
            <p style={{ marginTop: 0 }}>A exclusão é definitiva. Se o item só deixou de ser usado, prefira desmarcar “Item ativo”.</p>
            <Submit variant="danger" pending="Excluindo…" confirm={`Excluir o item ${item.code}?`}>Excluir item</Submit>
          </Form>
        </div></section>
      )}
    </>
  );
}
