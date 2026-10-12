import { notFound } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";
import { page, type PageCtx } from "@/lib/access";
import * as E from "@/db/erp";
import { ItemForm } from "@/components/ItemForm";
import { BomEditor } from "@/components/BomEditor";
import { ItemSuppliers } from "@/components/ItemSuppliers";
import { ActionButton } from "@/components/client";
import { PageHead } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { deleteItemAction } from "@/server/item-actions";
import { avgCosts, balances, balanceOf } from "@/server/common";
import { fmtMoney, fmtQty } from "@/lib/format";

/** Opções dos campos do cadastro de item. */
async function formOptions(s: PageCtx) {
  return s.tx(async (tx) => {
    const groups = await tx.select({ id: E.itemGroups.id, name: E.itemGroups.name, prefix: E.codePrefixes.prefix, digits: E.codePrefixes.digits, n: E.codePrefixes.nextNumber })
      .from(E.itemGroups).leftJoin(E.codePrefixes, eq(E.codePrefixes.id, E.itemGroups.prefixId)).orderBy(asc(E.itemGroups.name));
    const types = await tx.select({ id: E.itemTypes.id, name: E.itemTypes.name, kind: E.itemTypes.kind }).from(E.itemTypes).where(eq(E.itemTypes.active, true)).orderBy(asc(E.itemTypes.name));
    const units = await tx.select({ c: E.units.code, n: E.units.name }).from(E.units).where(eq(E.units.active, true)).orderBy(asc(E.units.code));
    const locs = await tx.select({ id: E.stockLocations.id, c: E.stockLocations.code, n: E.stockLocations.name }).from(E.stockLocations).orderBy(asc(E.stockLocations.code));
    const sups = await tx.select({ id: E.partners.id, n: sql<string>`coalesce(${E.partners.tradeName}, ${E.partners.name})` }).from(E.partners)
      .where(sql`'Fornecedor' = any(${E.partners.kinds}) and ${E.partners.active}`).orderBy(asc(E.partners.name));
    return {
      groups: groups.map((g) => ({ id: g.id, name: g.name, next: g.prefix ? g.prefix + String(g.n).padStart(g.digits ?? 3, "0") : null })),
      types, units: units.map((u) => [u.c, `${u.c} · ${u.n}`] as const), locations: locs.map((l) => [l.id, `${l.c} · ${l.n}`] as const),
      suppliers: sups.map((x) => [x.id, x.n] as [string, string]),
    };
  });
}

export async function TenantNewItem() {
  const s = await page("itens", { edit: true });
  const o = await formOptions(s);
  return (
    <>
      <PageHead title="Novo item" back={{ href: "/itens", label: "Itens" }} />
      <ItemForm {...o} canEdit={s.edit} />
    </>
  );
}

export async function TenantEditItem({ params }: { params: Promise<{ id: string }> }) {
  const s = await page("itens");
  const { id } = await params;
  const [o, d] = await Promise.all([formOptions(s), s.tx(async (tx) => {
    const [item] = await tx.select().from(E.items).where(eq(E.items.id, id)).limit(1);
    if (!item) return null;
    const bom = await tx.select({ b: E.itemBom, i: E.items }).from(E.itemBom).innerJoin(E.items, eq(E.items.id, E.itemBom.componentId)).where(eq(E.itemBom.itemId, id)).orderBy(asc(E.itemBom.position));
    const rot = await tx.select().from(E.itemRouting).where(eq(E.itemRouting.itemId, id)).orderBy(asc(E.itemRouting.position));
    const centers = await tx.select({ id: E.workCenters.id, name: E.workCenters.name, c: E.workCenters.costPerHour }).from(E.workCenters).orderBy(asc(E.workCenters.name));
    const sups = await tx.select({ s: E.itemSuppliers, n: sql<string>`coalesce(${E.partners.tradeName}, ${E.partners.name})` }).from(E.itemSuppliers).innerJoin(E.partners, eq(E.partners.id, E.itemSuppliers.partnerId)).where(eq(E.itemSuppliers.itemId, id));
    const ids = [id, ...bom.map((b) => b.i.id)];
    const [bal, costs] = await Promise.all([balances(tx, { itemIds: [id] }), avgCosts(tx, ids)]);
    const usedIn = await tx.select({ id: E.items.id, code: E.items.code, name: E.items.name }).from(E.itemBom).innerJoin(E.items, eq(E.items.id, E.itemBom.itemId)).where(eq(E.itemBom.componentId, id));
    return { item, bom, rot, centers, sups, bal, costs, usedIn };
  })]);
  if (!d) notFound();
  const { item } = d;
  const fab = item.type === "PRODUTO_ACABADO" || item.type === "SEMIACABADO";
  return (
    <>
      <PageHead title={item.name} sub={`Código ${item.code}${item.complement ? " · " + item.complement : ""}`} back={{ href: "/itens", label: "Itens" }}
        actions={s.edit && <ActionButton className="btn btn-danger" confirm={`Excluir o item ${item.code}? Itens com movimentação não podem ser excluídos.`} action={deleteItemAction.bind(null, item.id)}><Icon name="trash" size={16} /> Excluir</ActionButton>} />
      <div className="sheet">
        <ItemForm {...o} item={item} canEdit={s.edit} extra={{ balance: `${fmtQty(balanceOf(d.bal, id))} ${item.unit}`, avgCost: fmtMoney(d.costs.get(id)) }} />
        <ItemSuppliers itemId={id} canEdit={s.edit} suppliers={o.suppliers}
          rows={d.sups.map((x) => ({ id: x.s.id, partnerId: x.s.partnerId, name: x.n, supplierCode: x.s.supplierCode, lastPrice: Number(x.s.lastPrice), leadDays: x.s.leadDays }))} />
        {fab ? (
          <BomEditor itemId={id} unit={item.unit} canEdit={s.edit} showCost={s.access.costs} salePrice={Number(item.salePrice)}
            centers={d.centers.map((c) => ({ id: c.id, name: c.name, costPerHour: Number(c.c) }))}
            initial={d.bom.map(({ b, i }) => ({ itemId: i.id, code: i.code, name: i.name, unit: i.unit, qty: Number(b.qty), lossPct: Number(b.lossPct), cost: d.costs.get(i.id) ?? 0 }))}
            routing={d.rot.map((r) => ({ workCenterId: r.workCenterId, hours: Number(r.hours) }))} />
        ) : (
          <section className="panel sec-panel" id="estrutura"><h2>Estrutura</h2><div className="pb muted" style={{ fontSize: 13 }}>
            Só itens do tipo fabricado (produto acabado ou semiacabado) têm estrutura.
            {d.usedIn.length > 0 && <> Este item é componente de: {d.usedIn.map((u, i) => <span key={u.id}>{i ? ", " : ""}<a href={`/itens/${u.id}#estrutura`}>{u.code}</a></span>)}.</>}
          </div></section>
        )}
      </div>
    </>
  );
}
