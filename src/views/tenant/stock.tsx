import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { page, type PageCtx } from "@/lib/access";
import * as E from "@/db/erp";
import { Empty, PageHead, Pager, pageLink, Kpi } from "@/components/ui";
import { ActionButton, ClickRow, FilterBar } from "@/components/client";
import { Icon } from "@/components/Icon";
import { StockMoveButtons } from "@/components/StockMove";
import { MovementQty } from "@/components/MovementActions";
import { InventoryCount, NewInventory, CloseStock } from "@/components/StockTools";
import { avgCosts, balances, balanceOf, closedUntil } from "@/server/common";
import { cancelInventoryAction, closeInventoryAction, reopenStockAction } from "@/server/stock-actions";
import { fmtMoney, fmtQty } from "@/lib/format";
import { fmtD, isDate } from "@/lib/dates";
import { MV_TYPES } from "@/lib/consts";

type SP = Record<string, string | undefined>;

async function lookups(s: PageCtx) {
  return s.tx(async (tx) => ({
    locs: await tx.select().from(E.stockLocations).orderBy(asc(E.stockLocations.code)),
    groups: await tx.select({ id: E.itemGroups.id, n: E.itemGroups.name }).from(E.itemGroups).orderBy(asc(E.itemGroups.name)),
    types: await tx.select({ id: E.itemTypes.id, n: E.itemTypes.name }).from(E.itemTypes).orderBy(asc(E.itemTypes.name)),
    sups: await tx.select({ id: E.partners.id, n: sql<string>`coalesce(${E.partners.tradeName}, ${E.partners.name})` }).from(E.partners).where(sql`'Fornecedor' = any(${E.partners.kinds})`).orderBy(sql`2`),
    ops: await tx.select({ id: E.productionOrders.id, n: E.productionOrders.number, it: E.items.name }).from(E.productionOrders).innerJoin(E.items, eq(E.items.id, E.productionOrders.itemId))
      .innerJoin(E.productionStages, eq(E.productionStages.id, E.productionOrders.stageId)).where(sql`${E.productionStages.kind} not in ('finalizada','cancelada')`).orderBy(desc(E.productionOrders.number)),
  }));
}

// ---------------------------------------------------------------- Posição
export async function StockPosition({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await page("estoque");
  const sp = await searchParams;
  const L = await lookups(s);
  const c: SQL[] = [eq(E.items.active, true)];
  if (sp.q) { const q = `%${sp.q.trim()}%`; c.push(or(ilike(E.items.code, q), ilike(E.items.name, q), ilike(E.items.complement, q))!); }
  if (sp.grupo) c.push(eq(E.items.groupId, sp.grupo));
  if (sp.tipo) c.push(eq(E.items.typeId, sp.tipo));
  if (sp.end) c.push(ilike(E.items.stockAddress, `%${sp.end.trim()}%`));
  const d = await s.tx(async (tx) => {
    const items = await tx.select({ i: E.items, g: E.itemGroups.name }).from(E.items).leftJoin(E.itemGroups, eq(E.itemGroups.id, E.items.groupId)).where(and(...c)).orderBy(asc(E.items.name));
    const ids = items.map((x) => x.i.id);
    const [bal, cost] = await Promise.all([balances(tx, { itemIds: ids }), avgCosts(tx, ids)]);
    return { items, bal, cost };
  });
  let rows = d.items.map(({ i, g }) => {
    const qty = balanceOf(d.bal, i.id, sp.local || undefined);
    const tot = balanceOf(d.bal, i.id);
    const cm = d.cost.get(i.id) ?? 0;
    return { i, g, qty, cm, val: qty * cm, below: Number(i.minStock) > 0 && tot < Number(i.minStock), above: Number(i.maxStock) > 0 && tot > Number(i.maxStock) };
  });
  if (sp.local) rows = rows.filter((r) => Math.abs(r.qty) > 1e-9);
  if (sp.sit === "abaixo") rows = rows.filter((r) => r.below);
  else if (sp.sit === "acima") rows = rows.filter((r) => r.above);
  else if (sp.sit === "com") rows = rows.filter((r) => r.qty > 1e-9);
  else if (sp.sit === "sem") rows = rows.filter((r) => Math.abs(r.qty) <= 1e-9);
  else if (sp.sit === "negativo") rows = rows.filter((r) => r.qty < -1e-9);
  const total = rows.reduce((a, r) => a + r.val, 0);
  const locName = new Map(L.locs.map((l) => [l.id, l.code]));
  const where = (id: string) => [...d.bal].filter(([k, v]) => k.startsWith(id + "|") && Math.abs(v) > 1e-9).map(([k, v]) => `${locName.get(k.split("|")[1]) ?? "?"}: ${fmtQty(v)}`).join(" · ");
  const locOpts = L.locs.filter((l) => l.active).map((l) => [l.id, `${l.code} · ${l.name}`] as [string, string]);
  const supOpts = L.sups.map((x) => [x.id, x.n] as [string, string]);
  const opOpts = L.ops.map((o) => [o.id, `OP ${o.n} · ${o.it}`] as [string, string]);
  return (
    <>
      <PageHead title="Posição de estoque" sub="Saldo atual de cada item, calculado a partir das movimentações. Dê entrada, saída ou transfira direto da lista."
        actions={<>
          <a className="btn" href={`/api/export/estoque?${new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][])}`}><Icon name="download" size={16} /> Exportar CSV</a>
          {s.edit && <StockMoveButtons locations={locOpts} suppliers={supOpts} ops={opOpts} only={["TRANSFERENCIA", "SAIDA", "ENTRADA"]} />}
        </>} />
      <FilterBar right={<span className="count">{rows.length} itens · {fmtMoney(total)}</span>} moreActive={sp.end ? 1 : 0}
        more={<label className="fl">Endereço no estoque <input type="text" name="end" defaultValue={sp.end ?? ""} /></label>}>
        <div className="search"><Icon name="search" size={16} /><input type="search" name="q" defaultValue={sp.q ?? ""} placeholder="Código ou descrição" aria-label="Buscar item" /></div>
        <select name="local" defaultValue={sp.local ?? ""} aria-label="Local"><option value="">Todos os locais</option>{L.locs.map((l) => <option key={l.id} value={l.id}>{l.code} · {l.name}</option>)}</select>
        <select name="grupo" defaultValue={sp.grupo ?? ""} aria-label="Grupo"><option value="">Todos os grupos</option>{L.groups.map((g) => <option key={g.id} value={g.id}>{g.n}</option>)}</select>
        <select name="tipo" defaultValue={sp.tipo ?? ""} aria-label="Tipo"><option value="">Todos os tipos</option>{L.types.map((g) => <option key={g.id} value={g.id}>{g.n}</option>)}</select>
        <select name="sit" defaultValue={sp.sit ?? ""} aria-label="Situação"><option value="">Todas as situações</option><option value="com">Com saldo</option><option value="sem">Sem saldo</option><option value="abaixo">Abaixo do mínimo</option><option value="acima">Acima do máximo</option><option value="negativo">Saldo negativo</option></select>
      </FilterBar>
      <div className="tbl">
        {rows.length ? (
          <table>
            <thead><tr><th>Código</th><th>Descrição</th><th>Grupo</th><th>{sp.local ? "Local" : "Onde está"}</th><th className="num">Mínimo</th><th className="num">Quantidade</th><th>Un.</th><th className="num">Custo médio</th><th className="num">Custo total</th><th>Situação</th><th><span className="sr">Ações</span></th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.i.id} className={r.below ? "flag" : ""}>
                <td className="code">{r.i.code}</td>
                <td className="desc"><Link className="row-link" href={`/estoque/movimentacoes?item=${encodeURIComponent(r.i.code)}`} style={{ fontWeight: 500 }}>{r.i.name}</Link>{r.i.stockAddress && <div className="muted" style={{ fontSize: 12, fontWeight: 400 }}>{r.i.stockAddress}</div>}</td>
                <td style={{ fontSize: 12.5 }}>{r.g ?? "—"}</td>
                <td style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{sp.local ? L.locs.find((l) => l.id === sp.local)?.name : where(r.i.id) || "—"}</td>
                <td className="num">{fmtQty(r.i.minStock)}</td><td className="num"><b className={r.qty < 0 ? "t-bad" : ""}>{fmtQty(r.qty)}</b></td><td>{r.i.unit}</td>
                <td className="num">{fmtMoney(r.cm)}</td><td className="num">{fmtMoney(r.val)}</td>
                <td>{r.below ? <span className="badge bad">Abaixo do mínimo</span> : r.qty <= 0 ? <span className="badge">Sem saldo</span> : r.above ? <span className="badge warn">Acima do máximo</span> : <span className="badge ok">Normal</span>}</td>
                <td className="acts">{s.edit && <StockMoveButtons compact locations={locOpts} suppliers={supOpts} ops={opOpts} item={{ id: r.i.id, label: `${r.i.name} · ${r.i.code}` }} only={["ENTRADA", "SAIDA", "TRANSFERENCIA"]} />}</td>
              </tr>))}</tbody>
            <tfoot><tr><td colSpan={8}>Total</td><td className="num">{fmtMoney(total)}</td><td colSpan={2} /></tr></tfoot>
          </table>
        ) : <Empty title="Nenhum item neste filtro">Ajuste a busca ou os filtros.</Empty>}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Movimentações
const PAGE = 100;
export async function StockMovements({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await page("estoque");
  const sp = await searchParams;
  const pg = Math.max(1, Number(sp.p) || 1);
  const L = await lookups(s);
  const c: SQL[] = [eq(E.stockMovements.tenantId, s.tenant.id)];
  if (sp.q) { const q = `%${sp.q.trim()}%`; c.push(or(ilike(E.items.code, q), ilike(E.items.name, q), ilike(E.stockMovements.document, q), ilike(E.stockMovements.notes, q))!); }
  if (sp.item) c.push(eq(E.items.code, sp.item));
  if (sp.tipo) c.push(eq(E.stockMovements.type, sp.tipo));
  if (sp.local) c.push(or(eq(E.stockMovements.locationId, sp.local), eq(E.stockMovements.destLocationId, sp.local))!);
  if (sp.de && isDate(sp.de)) c.push(gte(E.stockMovements.date, sp.de));
  if (sp.ate && isDate(sp.ate)) c.push(lte(E.stockMovements.date, sp.ate));
  if (sp.grupo) c.push(eq(E.items.groupId, sp.grupo));
  if (sp.doc) c.push(ilike(E.stockMovements.document, `%${sp.doc.trim()}%`));
  if (sp.usuario) c.push(ilike(E.stockMovements.userName, `%${sp.usuario.trim()}%`));
  if (sp.forn) c.push(eq(E.stockMovements.partnerId, sp.forn));
  if (sp.op) c.push(eq(E.stockMovements.productionOrderId, sp.op));
  if (sp.origem === "manual") c.push(sql`${E.stockMovements.invoiceId} is null and ${E.stockMovements.purchaseOrderId} is null and ${E.stockMovements.inventoryId} is null and ${E.stockMovements.productionOrderId} is null`);
  if (sp.origem === "op") c.push(sql`${E.stockMovements.productionOrderId} is not null`);
  if (sp.origem === "nf") c.push(sql`${E.stockMovements.invoiceId} is not null`);
  if (sp.origem === "pc") c.push(sql`${E.stockMovements.purchaseOrderId} is not null`);
  if (sp.origem === "inv") c.push(sql`${E.stockMovements.inventoryId} is not null`);
  const where = and(...c);
  const d = await s.tx(async (tx) => {
    const rows = await tx.select({ m: E.stockMovements, i: E.items }).from(E.stockMovements).innerJoin(E.items, eq(E.items.id, E.stockMovements.itemId))
      .where(where).orderBy(desc(E.stockMovements.date), desc(E.stockMovements.createdAt)).limit(PAGE).offset((pg - 1) * PAGE);
    const [{ total }] = await tx.select({ total: sql<number>`count(*)::int` }).from(E.stockMovements).innerJoin(E.items, eq(E.items.id, E.stockMovements.itemId)).where(where);
    return { rows, total, lock: await closedUntil(tx) };
  });
  const loc = new Map(L.locs.map((l) => [l.id, `${l.code} · ${l.name}`]));
  const locOpts = L.locs.filter((l) => l.active).map((l) => [l.id, `${l.code} · ${l.name}`] as [string, string]);
  const moreActive = ["grupo", "doc", "usuario", "forn", "op", "origem", "item"].filter((k) => sp[k]).length;
  const lockOf = (m: typeof E.stockMovements.$inferSelect) => m.invoiceId ? "Veio de nota fiscal: cancele a nota para estornar." : m.purchaseOrderId ? "Veio de recebimento de compra." : m.inventoryId ? "Veio de inventário concluído." : d.lock && m.date <= d.lock ? "Período com estoque fechado." : undefined;
  return (
    <>
      <PageHead title="Movimentações de estoque" sub="Histórico de tudo que entrou, saiu ou mudou de local. Use os botões pequenos ao lado da quantidade para corrigir ou excluir um lançamento manual."
        actions={s.edit && <StockMoveButtons locations={locOpts} suppliers={L.sups.map((x) => [x.id, x.n])} ops={L.ops.map((o) => [o.id, `OP ${o.n} · ${o.it}`])} only={["ENTRADA", "SAIDA", "TRANSFERENCIA"]} />} />
      {d.lock && <div className="infoline"><Icon name="lock" size={14} className="ic" /> Estoque fechado até {fmtD(d.lock)}: lançamentos até essa data não podem ser alterados.</div>}
      <FilterBar moreActive={moreActive} right={<span className="count">{d.total} lançamentos</span>}
        more={<>
          <select name="grupo" defaultValue={sp.grupo ?? ""} aria-label="Grupo"><option value="">Todos os grupos</option>{L.groups.map((g) => <option key={g.id} value={g.id}>{g.n}</option>)}</select>
          <select name="origem" defaultValue={sp.origem ?? ""} aria-label="Origem"><option value="">Todas as origens</option><option value="manual">Lançamento manual</option><option value="op">Ordem de produção</option><option value="nf">Nota fiscal</option><option value="pc">Recebimento de compra</option><option value="inv">Inventário</option></select>
          <select name="op" defaultValue={sp.op ?? ""} aria-label="OP" style={{ maxWidth: 200 }}><option value="">Qualquer OP</option>{L.ops.map((o) => <option key={o.id} value={o.id}>OP {o.n}</option>)}</select>
          <select name="forn" defaultValue={sp.forn ?? ""} aria-label="Fornecedor" style={{ maxWidth: 200 }}><option value="">Qualquer fornecedor</option>{L.sups.map((x) => <option key={x.id} value={x.id}>{x.n}</option>)}</select>
          <label className="fl">Documento <input type="text" name="doc" defaultValue={sp.doc ?? ""} style={{ width: 120 }} /></label>
          <label className="fl">Usuário <input type="text" name="usuario" defaultValue={sp.usuario ?? ""} style={{ width: 120 }} /></label>
          <label className="fl">Código exato <input type="text" name="item" defaultValue={sp.item ?? ""} style={{ width: 140 }} /></label>
        </>}>
        <div className="search"><Icon name="search" size={16} /><input type="search" name="q" defaultValue={sp.q ?? ""} placeholder="Item, documento ou observação" aria-label="Buscar" /></div>
        <select name="tipo" defaultValue={sp.tipo ?? ""} aria-label="Tipo"><option value="">Todos os tipos</option>{Object.entries(MV_TYPES).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}</select>
        <select name="local" defaultValue={sp.local ?? ""} aria-label="Local"><option value="">Todos os locais</option>{L.locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
        <label className="fl">De <input type="date" name="de" defaultValue={sp.de ?? ""} /></label>
        <label className="fl">até <input type="date" name="ate" defaultValue={sp.ate ?? ""} /></label>
      </FilterBar>
      <div className="tbl">
        {d.rows.length ? (
          <table>
            <thead><tr><th>Data</th><th>Tipo</th><th>Item</th><th>Local</th><th className="num">Quantidade</th><th className="num">Custo unit.</th><th className="num">Valor</th><th>Documento</th><th>Observação</th><th>Usuário</th></tr></thead>
            <tbody>{d.rows.map(({ m, i }) => {
              const t = MV_TYPES[m.type];
              const qn = Number(m.qty);
              const sign = m.type === "SAIDA" ? "−" : m.type === "TRANSFERENCIA" ? "" : qn > 0 ? "+" : "";
              const cls = m.type === "AJUSTE" ? (qn >= 0 ? "mv-in" : "mv-out") : t?.cls ?? "";
              const lr = lockOf(m);
              return (
                <tr key={m.id}>
                  <td className="code">{fmtD(m.date)}</td><td><span className={t?.cls}>{t?.label ?? m.type}</span></td>
                  <td className="desc">{i.name}<div className="muted" style={{ fontSize: 12, fontWeight: 400 }}>{i.code}</div></td>
                  <td style={{ fontSize: 12.5 }}>{m.type === "TRANSFERENCIA" ? <>{loc.get(m.locationId)}<br />→ {loc.get(m.destLocationId ?? "")}</> : loc.get(m.locationId)}</td>
                  <td className="num">{s.edit ? <MovementQty id={m.id} qty={qn} label={`${sign}${fmtQty(Math.abs(qn))} ${i.unit}`} cls={cls} editable={!lr} lockReason={lr} /> : <span className={cls}>{sign}{fmtQty(Math.abs(qn))} {i.unit}</span>}</td>
                  <td className="num">{fmtMoney(m.unitCost)}</td><td className="num">{fmtMoney(Math.abs(qn * Number(m.unitCost)))}</td>
                  <td>{m.productionOrderId ? <Link href={`/ops/${m.productionOrderId}`}>{m.document ?? "OP"}</Link> : m.document ?? "—"}</td>
                  <td className="wrap" style={{ maxWidth: 240, fontSize: 12.5, color: "var(--ink-2)" }}>{m.notes}</td><td style={{ fontSize: 12.5 }}>{m.userName}</td>
                </tr>
              );
            })}</tbody>
          </table>
        ) : <Empty title="Nenhuma movimentação">Ajuste os filtros ou registre a primeira entrada.</Empty>}
        <Pager page={pg} pages={Math.max(1, Math.ceil(d.total / PAGE))} qs={pageLink(sp)} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Inventário
const INV_ST: Record<string, [string, "warn" | "ok" | "bad"]> = { ABERTO: ["Em contagem", "warn"], CONCLUIDO: ["Concluído", "ok"], CANCELADO: ["Cancelado", "bad"] };
export async function InventoryList({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await page("estoque");
  const sp = await searchParams;
  const L = await lookups(s);
  const rows = await s.tx((tx) => tx.select({ v: E.inventories, loc: E.stockLocations.name, g: E.itemGroups.name,
    n: sql<number>`(select count(*)::int from inventory_items x where x.inventory_id = "inventories"."id")`,
    c: sql<number>`(select count(*)::int from inventory_items x where x.inventory_id = "inventories"."id" and x.counted_qty is not null)`,
    dif: sql<number>`(select count(*)::int from inventory_items x where x.inventory_id = "inventories"."id" and x.counted_qty is not null and x.counted_qty <> x.system_qty)` })
    .from(E.inventories).innerJoin(E.stockLocations, eq(E.stockLocations.id, E.inventories.locationId)).leftJoin(E.itemGroups, eq(E.itemGroups.id, E.inventories.groupId))
    .where(sp.st ? eq(E.inventories.status, sp.st) : sql`true`).orderBy(desc(E.inventories.number)));
  return (
    <>
      <PageHead title="Inventário" sub="Contagem física do estoque, separada das movimentações do dia a dia. Abra um inventário por local, informe o que foi contado e conclua: as diferenças viram ajustes." />
      {s.edit && <NewInventory locations={L.locs.filter((l) => l.active).map((l) => [l.id, `${l.code} · ${l.name}`])} groups={L.groups.map((g) => [g.id, g.n])} />}
      <FilterBar right={<span className="count">{rows.length} inventários</span>}>
        <select name="st" defaultValue={sp.st ?? ""} aria-label="Situação"><option value="">Todas as situações</option>{Object.entries(INV_ST).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
      </FilterBar>
      <div className="tbl">
        {rows.length ? (
          <table><thead><tr><th className="num">Nº</th><th>Data</th><th>Local</th><th>Grupo</th><th>Descrição</th><th className="num">Itens</th><th className="num">Contados</th><th className="num">Com diferença</th><th>Situação</th></tr></thead>
            <tbody>{rows.map(({ v, loc, g, n, c, dif }) => (
              <ClickRow key={v.id} href={`/estoque/inventarios/${v.id}`}><td className="num"><b>{v.number}</b></td><td className="code">{fmtD(v.date)}</td><td>{loc}</td><td>{g ?? "Todos"}</td><td>{v.description ?? "—"}</td>
                <td className="num">{n}</td><td className="num">{c}</td><td className="num">{dif || "—"}</td><td><span className={`badge ${INV_ST[v.status]?.[1]}`}>{INV_ST[v.status]?.[0]}</span></td></ClickRow>))}</tbody></table>
        ) : <Empty title="Nenhum inventário">Abra o primeiro inventário para contar o estoque de um local.</Empty>}
      </div>
    </>
  );
}

export async function InventoryPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await page("estoque");
  const { id } = await params;
  const d = await s.tx(async (tx) => {
    const [v] = await tx.select({ v: E.inventories, loc: E.stockLocations.name }).from(E.inventories).innerJoin(E.stockLocations, eq(E.stockLocations.id, E.inventories.locationId)).where(eq(E.inventories.id, id)).limit(1);
    if (!v) return null;
    const rows = await tx.select({ r: E.inventoryItems, i: E.items }).from(E.inventoryItems).innerJoin(E.items, eq(E.items.id, E.inventoryItems.itemId)).where(eq(E.inventoryItems.inventoryId, id)).orderBy(asc(E.items.name));
    return { ...v, rows };
  });
  if (!d) notFound();
  const { v } = d;
  const open = v.status === "ABERTO";
  const counted = d.rows.filter((x) => x.r.countedQty != null);
  const difVal = counted.reduce((a, x) => a + (Number(x.r.countedQty) - Number(x.r.systemQty)) * Number(x.r.unitCost), 0);
  return (
    <>
      <PageHead title={`Inventário ${v.number}`} sub={`${d.loc} · ${fmtD(v.date)}${v.description ? " · " + v.description : ""}`} back={{ href: "/estoque/inventarios", label: "Inventário" }}
        actions={s.edit && open && <>
          <ActionButton className="btn btn-danger" confirm="Cancelar este inventário? Nenhum ajuste será gerado." action={cancelInventoryAction.bind(null, v.id)}>Cancelar inventário</ActionButton>
          <ActionButton className="btn btn-primary" confirm="Concluir o inventário? As diferenças entre o contado e o saldo do sistema viram ajustes de estoque na data do inventário." action={closeInventoryAction.bind(null, v.id)}><Icon name="check" size={16} /> Concluir inventário</ActionButton>
        </>} />
      <div className="kpis k4" style={{ marginBottom: 14 }}>
        <Kpi value={d.rows.length} label="Itens no inventário" />
        <Kpi value={counted.length} label="Itens contados" />
        <Kpi value={counted.filter((x) => Number(x.r.countedQty) !== Number(x.r.systemQty)).length} label="Com diferença" alert={counted.some((x) => Number(x.r.countedQty) !== Number(x.r.systemQty))} />
        <Kpi value={fmtMoney(difVal)} label="Diferença em valor" alert={difVal < 0} />
      </div>
      <InventoryCount inventoryId={v.id} editable={open && s.edit} rows={d.rows.map(({ r, i }) => ({ id: r.id, code: i.code, name: i.name, unit: i.unit, address: i.stockAddress, system: Number(r.systemQty), counted: r.countedQty == null ? null : Number(r.countedQty), cost: Number(r.unitCost) }))} />
    </>
  );
}

// ---------------------------------------------------------------- Fechamento
export async function StockClosings() {
  const s = await page("estoque");
  const rows = await s.tx((tx) => tx.select().from(E.stockClosings).orderBy(desc(E.stockClosings.closingDate), desc(E.stockClosings.createdAt)));
  const active = rows.filter((r) => !r.reopenedAt);
  const last = active[0];
  return (
    <>
      <PageHead title="Fechamento de estoque" sub="Congela o saldo e o valor do estoque numa data (normalmente o último dia do mês). Depois do fechamento, nada com data igual ou anterior pode ser lançado, alterado ou excluído." />
      {s.edit && <CloseStock lastDate={last?.closingDate ?? null} />}
      <div className="tbl solo">
        {rows.length ? (
          <table><thead><tr><th>Fechado até</th><th className="num">Itens com saldo</th><th className="num">Valor do estoque</th><th>Observação</th><th>Fechado por</th><th>Em</th><th>Situação</th><th /></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} style={r.reopenedAt ? { opacity: 0.55 } : undefined}>
                <td className="code"><b>{fmtD(r.closingDate)}</b></td><td className="num">{r.itemCount}</td><td className="num"><b>{fmtMoney(r.totalValue)}</b></td><td>{r.notes ?? "—"}</td>
                <td>{r.userName}</td><td className="code">{r.createdAt.toLocaleDateString("pt-BR")}</td>
                <td>{r.reopenedAt ? <span className="badge">Reaberto</span> : <span className="badge ok">Fechado</span>}</td>
                <td className="acts show">
                  <a className="btn btn-ghost btn-sm" href={`/api/export/fechamento?id=${r.id}`} title="Baixar posição do fechamento"><Icon name="download" size={15} /></a>
                  {s.access.isAdmin && last?.id === r.id && <ActionButton className="btn btn-sm" confirm="Reabrir este fechamento? As movimentações do período voltam a poder ser alteradas." action={reopenStockAction.bind(null, r.id)}>Reabrir</ActionButton>}
                </td>
              </tr>))}</tbody></table>
        ) : <Empty title="Nenhum fechamento">Feche o estoque no fim de cada mês para guardar a posição e travar o período.</Empty>}
      </div>
    </>
  );
}
