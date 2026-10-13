import { notFound } from "next/navigation";
import { and, asc, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { page } from "@/lib/access";
import * as E from "@/db/erp";
import { BtnLink, Empty, PageHead, Pager, pageLink } from "@/components/ui";
import { ActionButton, ClickRow, FilterBar, FilterTabs } from "@/components/client";
import { Icon } from "@/components/Icon";
import { InvoiceForm } from "@/components/InvoiceForm";
import { DocReport } from "@/components/DocReport";
import { cancelInvoiceAction } from "@/server/invoice-actions";
import { balances, balanceOf, companyHeader, partnerAddress } from "@/server/common";
import { fmtMoney } from "@/lib/format";
import { docTotals, fmtD, isDate } from "@/lib/dates";

type SP = Record<string, string | undefined>;
const PAGE = 60;

export async function InvoiceList({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await page("comercial");
  const sp = await searchParams;
  const pg = Math.max(1, Number(sp.p) || 1);
  const c: SQL[] = [eq(E.invoices.tenantId, s.tenant.id)];
  if (sp.num && /^\d+$/.test(sp.num)) c.push(eq(E.invoices.number, Number(sp.num)));
  if (sp.cli) c.push(eq(E.invoices.partnerId, sp.cli));
  if (sp.de && isDate(sp.de)) c.push(gte(E.invoices.issueDate, sp.de));
  if (sp.ate && isDate(sp.ate)) c.push(lte(E.invoices.issueDate, sp.ate));
  if (sp.st) c.push(eq(E.invoices.status, sp.st));
  const where = and(...c);
  const d = await s.tx(async (tx) => {
    const rows = await tx.select({ n: E.invoices, cli: sql<string>`coalesce(${E.partners.tradeName}, ${E.partners.name})`, pv: E.salesOrders.number }).from(E.invoices)
      .innerJoin(E.partners, eq(E.partners.id, E.invoices.partnerId)).leftJoin(E.salesOrders, eq(E.salesOrders.id, E.invoices.salesOrderId))
      .where(where).orderBy(desc(E.invoices.issueDate), desc(E.invoices.number)).limit(PAGE).offset((pg - 1) * PAGE);
    const [{ total, sum }] = await tx.select({ total: sql<number>`count(*)::int`, sum: sql<string>`coalesce(sum(${E.invoices.total}) filter (where ${E.invoices.status} = 'EMITIDA'),0)::text` }).from(E.invoices).where(where);
    const [{ pend }] = await tx.select({ pend: sql<number>`count(*)::int` }).from(E.salesOrders).where(eq(E.salesOrders.status, "APROVADO"));
    const clients = await tx.select({ id: E.partners.id, n: sql<string>`coalesce(${E.partners.tradeName}, ${E.partners.name})` }).from(E.partners).where(sql`'Cliente' = any(${E.partners.kinds})`).orderBy(sql`2`);
    return { rows, total, sum, pend, clients };
  });
  return (
    <>
      <PageHead title="Faturamento" sub="Notas registradas a partir dos pedidos de venda aprovados. O faturamento baixa o estoque e gera as contas a receber."
        actions={s.edit && <BtnLink href="/faturamento/novo" primary icon="doc">Faturar pedido{d.pend ? ` (${d.pend})` : ""}</BtnLink>} />
      <FilterBar right={<span className="count">{d.total} notas · {fmtMoney(d.sum)}</span>}
        tabs={<FilterTabs name="st" value={sp.st ?? ""} options={[{ v: "", label: "Todas" }, { v: "EMITIDA", label: "Emitidas" }, { v: "CANCELADA", label: "Canceladas" }]} />}>
        <input type="text" name="num" defaultValue={sp.num ?? ""} placeholder="Nº da nota" aria-label="Número da nota" style={{ width: 120 }} />
        <select name="cli" defaultValue={sp.cli ?? ""} aria-label="Cliente" style={{ maxWidth: 230 }}><option value="">Todos os clientes</option>{d.clients.map((x) => <option key={x.id} value={x.id}>{x.n}</option>)}</select>
        <label className="fl">Emissão de <input type="date" name="de" defaultValue={sp.de ?? ""} /></label>
        <label className="fl">até <input type="date" name="ate" defaultValue={sp.ate ?? ""} /></label>
      </FilterBar>
      <div className="tbl">
        {d.rows.length ? (
          <table><thead><tr><th className="num">Nota</th><th>Série</th><th>Emissão</th><th>Cliente</th><th>Pedido</th><th className="num">Valor</th><th>Baixa no estoque</th><th>Situação</th></tr></thead>
            <tbody>{d.rows.map(({ n, cli, pv }) => (
              <ClickRow key={n.id} href={`/faturamento/${n.id}`} style={n.status === "CANCELADA" ? { opacity: 0.55 } : undefined}>
                <td className="num"><b>{n.number}</b></td><td>{n.series}</td><td className="code">{fmtD(n.issueDate)}</td><td>{cli}</td><td>{pv ? `Pedido ${pv}` : "—"}</td>
                <td className="num"><b>{fmtMoney(n.total)}</b></td><td>{n.stockOut ? "Sim" : "Não"}</td>
                <td><span className={`badge ${n.status === "CANCELADA" ? "bad" : "ok"}`}>{n.status === "CANCELADA" ? "Cancelada" : "Emitida"}</span></td>
              </ClickRow>))}</tbody></table>
        ) : <Empty title="Nenhuma nota neste filtro">Fature um pedido aprovado para começar.</Empty>}
        <Pager page={pg} pages={Math.max(1, Math.ceil(d.total / PAGE))} qs={pageLink(sp)} />
      </div>
    </>
  );
}

export async function InvoiceNew({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await page("comercial", { edit: true });
  const sp = await searchParams;
  const d = await s.tx(async (tx) => {
    const orders = await tx.select({ o: E.salesOrders, cli: sql<string>`coalesce(${E.partners.tradeName}, ${E.partners.name})`, days: E.paymentTerms.days, term: E.paymentTerms.name, method: E.paymentMethods.name })
      .from(E.salesOrders).innerJoin(E.partners, eq(E.partners.id, E.salesOrders.partnerId)).leftJoin(E.paymentTerms, eq(E.paymentTerms.id, E.salesOrders.paymentTermId)).leftJoin(E.paymentMethods, eq(E.paymentMethods.id, E.salesOrders.paymentMethodId))
      .where(eq(E.salesOrders.status, "APROVADO")).orderBy(asc(E.salesOrders.number));
    const ids = orders.map((o) => o.o.id);
    const lines = ids.length ? await tx.select({ l: E.salesOrderItems, i: E.items }).from(E.salesOrderItems).innerJoin(E.items, eq(E.items.id, E.salesOrderItems.itemId)).where(sql`${E.salesOrderItems.orderId} in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`) : [];
    const bal = await balances(tx, { itemIds: [...new Set(lines.map((x) => x.i.id))] });
    const locs = await tx.select().from(E.stockLocations).where(eq(E.stockLocations.active, true)).orderBy(asc(E.stockLocations.code));
    const [{ m }] = await tx.select({ m: sql<number>`coalesce(max(${E.invoices.number}), 0)::int` }).from(E.invoices).where(eq(E.invoices.series, "1"));
    return { orders, lines, bal, locs, next: m + 1 };
  });
  const orders = d.orders.map(({ o, cli, days, term, method }) => ({
    id: o.id, number: o.number, client: cli, total: Number(o.total), days: days ?? [0], term: term ?? (o.installments.length ? "Manual" : ""), method: method ?? "",
    manual: !o.paymentTermId && o.installments.length > 0 ? o.installments : null,
    items: d.lines.filter((x) => x.l.orderId === o.id).map(({ l, i }) => ({ itemId: i.id, name: i.name, unit: i.unit, qty: Number(l.qty), bal: Object.fromEntries(d.locs.map((lc) => [lc.id, balanceOf(d.bal, i.id, lc.id)])) })),
  }));
  const def = d.locs.find((l) => l.type === "Expedição") ?? d.locs[0];
  return (
    <>
      <PageHead title="Faturar pedido" sub="A nota é registrada no sistema, baixa o estoque (se marcado) e gera as contas a receber pela condição do pedido." back={{ href: "/faturamento", label: "Faturamento" }} />
      <InvoiceForm orders={orders} selected={sp.pedido} nextNumber={d.next} locations={d.locs.map((l) => [l.id, `${l.code} · ${l.name}`])} defaultLocation={def?.id ?? ""} />
    </>
  );
}

export async function InvoiceView({ params }: { params: Promise<{ id: string }> }) {
  const s = await page("comercial");
  const { id } = await params;
  const d = await s.tx(async (tx) => {
    const [n] = await tx.select().from(E.invoices).where(eq(E.invoices.id, id)).limit(1);
    if (!n) return null;
    const [p] = await tx.select().from(E.partners).where(eq(E.partners.id, n.partnerId));
    const lines = await tx.select({ l: E.invoiceItems, i: E.items }).from(E.invoiceItems).innerJoin(E.items, eq(E.items.id, E.invoiceItems.itemId)).where(eq(E.invoiceItems.invoiceId, id));
    const [so] = n.salesOrderId ? await tx.select().from(E.salesOrders).where(eq(E.salesOrders.id, n.salesOrderId)) : [];
    const tits = await tx.select().from(E.finTitles).where(and(eq(E.finTitles.originType, "NF"), eq(E.finTitles.originId, id))).orderBy(asc(E.finTitles.dueDate));
    const [pm] = so?.paymentMethodId ? await tx.select({ n: E.paymentMethods.name }).from(E.paymentMethods).where(eq(E.paymentMethods.id, so.paymentMethodId)) : [];
    return { n, p, lines, so, tits, pm, company: await companyHeader(tx, s.tenant.name) };
  });
  if (!d) notFound();
  const { n, p, so } = d;
  const items = d.lines.map(({ l, i }) => ({ code: i.code, name: i.name, unit: i.unit, qty: Number(l.qty), price: Number(l.price), discountPct: Number(l.discountPct) }));
  const t = docTotals(items, Number(so?.discount ?? 0), Number(so?.freight ?? 0));
  return (
    <>
      {s.edit && n.status === "EMITIDA" && (
        <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", marginBottom: -36 }}>
          <ActionButton className="btn btn-danger" confirm={`Cancelar a nota ${n.number}? As contas a receber em aberto serão canceladas, a baixa de estoque estornada e o pedido volta para aprovado.`} action={cancelInvoiceAction.bind(null, n.id)}><Icon name="x" size={16} /> Cancelar nota</ActionButton>
        </div>
      )}
      <DocReport r={{
        title: `Nota fiscal nº ${n.number} · série ${n.series}`, status: n.status === "CANCELADA" ? "Cancelada" : `Emitida${so ? ` · Pedido ${so.number}` : ""}`, back: { href: "/faturamento", label: "Faturamento" },
        company: d.company, partnerLabel: "Cliente", partner: { name: p.name, trade: p.tradeName, doc: p.document, address: partnerAddress(p), contact: [p.phone, p.email].filter(Boolean).join(" · ") },
        dates: [["Emissão", n.issueDate]], payment: [d.pm?.n ?? "", n.stockOut ? "Baixa no estoque: sim" : "Sem baixa no estoque"].filter(Boolean),
        items, totals: { ...t, discount: Number(so?.discount ?? 0), freight: Number(so?.freight ?? 0) },
        installments: d.tits.map((x) => ({ n: `${x.installment ?? ""} ${x.status === "PAGO" ? "(recebida)" : x.status === "CANCELADO" ? "(cancelada)" : ""}`, due: x.dueDate, value: Number(x.amount) })),
        notes: n.notes, signs: ["Emitente", "Recebedor"],
        extra: n.status === "CANCELADA" ? <div className="rep-wm">Nota cancelada</div> : undefined,
      }} />
    </>
  );
}
