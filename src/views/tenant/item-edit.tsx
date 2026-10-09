import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { withTenant } from "@/lib/db";
import { itemGroups, items, stockBalances, stockLocations, stockMovements } from "@/db/schema";
import { fmtDateTime, fmtQty, movementOriginLabel } from "@/lib/format";
import { requireTenantUser } from "@/lib/context";
import { ItemForm } from "@/components/ItemForm";
import { Form, Hidden, Submit } from "@/components/Form";
import { deleteItemAction } from "@/server/item-actions";

export async function TenantEditItem({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireTenantUser();
  const { id } = await params;
  const [item, groups, bals, moves] = await withTenant(s.tenant.id, async (tx) => [
    (await tx.select().from(items).where(and(eq(items.id, id), eq(items.tenantId, s.tenant.id))).limit(1))[0],
    await tx.select({ id: itemGroups.id, name: itemGroups.name }).from(itemGroups).orderBy(asc(itemGroups.name)),
    await tx.select({ loc: stockLocations.name, q: stockBalances.quantity }).from(stockBalances).innerJoin(stockLocations, eq(stockLocations.id, stockBalances.locationId))
      .where(eq(stockBalances.itemId, id)).orderBy(asc(stockLocations.name)),
    await tx.select({ m: stockMovements, loc: stockLocations.name }).from(stockMovements).innerJoin(stockLocations, eq(stockLocations.id, stockMovements.locationId))
      .where(eq(stockMovements.itemId, id)).orderBy(desc(stockMovements.createdAt)).limit(10),
  ] as const);
  if (!item) notFound();
  return (
    <>
      <div className="ph"><div><Link className="back" href="/estoque/itens">‹ Itens</Link><h1>{item.name}</h1><p>Código {item.code}</p></div>
        <div className="acts"><Link className="btn" href={`/estoque/movimentar?tipo=SAIDA&item=${item.id}`}>− Saída</Link><Link className="btn" href={`/estoque/movimentar?tipo=ENTRADA&item=${item.id}`}>+ Entrada</Link></div></div>
      <div className="grid2" style={{ gridTemplateColumns: "minmax(0, 820px) minmax(260px, 1fr)" }}>
        <section className="panel"><div className="pb"><ItemForm item={item} groups={groups} /></div></section>
        <div className="stack">
          <section className="panel"><h2>Saldo por local</h2><div className="pb">
            {bals.length ? <div className="tbl solo"><table><tbody>{bals.map((b) => <tr key={b.loc}><td>{b.loc}</td><td className="num"><b>{fmtQty(b.q)}</b> {item.unit}</td></tr>)}
              <tr><td><b>Total</b></td><td className="num"><b>{fmtQty(bals.reduce((a, b) => a + Number(b.q), 0))}</b> {item.unit}</td></tr></tbody></table></div>
              : <p className="muted" style={{ margin: 0 }}>Ainda sem movimentação de estoque.</p>}
          </div></section>
          {moves.length > 0 && <section className="panel"><h2>Últimas movimentações</h2><div className="pb">
            <ul className="feed">{moves.map(({ m, loc }) => (
              <li key={m.id}><span className={`badge ${m.kind === "ENTRADA" ? "ok" : "bad"}`}>{m.kind === "ENTRADA" ? "+" : "−"}{fmtQty(m.quantity)}</span>
                <span>{movementOriginLabel(m.origin)} · {loc}<small className="sub">{fmtDateTime(m.createdAt)}{m.userName ? ` · ${m.userName}` : ""}</small></span></li>))}</ul>
            <Link href={`/estoque/movimentacoes?q=${encodeURIComponent(item.code)}`}>Ver todas</Link>
          </div></section>}
        </div>
      </div>
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
