import { notFound } from "next/navigation";
import { and, asc, desc, eq, gte, ilike, lte, sql, type SQL } from "drizzle-orm";
import { page, type PageCtx } from "@/lib/access";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import * as E from "@/db/erp";
import { BtnLink, Empty, PageHead, Pager, pageLink, StatusBadge } from "@/components/ui";
import { ActionButton, ClickRow, FilterBar, FilterTabs } from "@/components/client";
import { Icon } from "@/components/Icon";
import { SalesOrderEditor, type SOData } from "@/components/SalesOrderEditor";
import { Attachments } from "@/components/Attachments";
import { deleteSalesOrderAction, duplicateSalesOrderAction, setSalesStatusAction } from "@/server/sales-actions";
import { companyHeader, loadAttachments, partnerAddress } from "@/server/common";
import { salesWhere } from "@/server/queries";
import { DocReport } from "@/components/DocReport";
import { fmtMoney } from "@/lib/format";
import { docTotals, fmtD, isDate, today } from "@/lib/dates";
import { PROD_STATUS, SO_STATUS } from "@/lib/consts";

const PAGE = 60;
type SP = Record<string, string | undefined>;

export async function SalesList({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await page("comercial");
  const sp = await searchParams;
  const pg = Math.max(1, Number(sp.p) || 1);
  const base = await salesWhere(s.tenant.id, sp, false);
  const where = await salesWhere(s.tenant.id, sp);
  const d = await s.tx(async (tx) => {
    const rows = await tx.select({
      o: E.salesOrders, cli: sql<string>`coalesce(${E.partners.tradeName}, ${E.partners.name})`,
      first: sql<string | null>`(select i.name from sales_order_items si join items i on i.id = si.item_id where si.order_id = "sales_orders"."id" order by si.position limit 1)`,
      nitems: sql<number>`(select count(*)::int from sales_order_items si where si.order_id = "sales_orders"."id")`,
      pm: E.paymentMethods.name, pt: E.paymentTerms.name,
    }).from(E.salesOrders).innerJoin(E.partners, eq(E.partners.id, E.salesOrders.partnerId))
      .leftJoin(E.paymentMethods, eq(E.paymentMethods.id, E.salesOrders.paymentMethodId)).leftJoin(E.paymentTerms, eq(E.paymentTerms.id, E.salesOrders.paymentTermId))
      .where(where).orderBy(desc(E.salesOrders.number)).limit(PAGE).offset((pg - 1) * PAGE);
    const [{ total, sum }] = await tx.select({ total: sql<number>`count(*)::int`, sum: sql<string>`coalesce(sum(${E.salesOrders.total}),0)::text` }).from(E.salesOrders).where(where);
    const counts = await tx.select({ st: E.salesOrders.status, n: sql<number>`count(*)::int` }).from(E.salesOrders).where(base).groupBy(E.salesOrders.status);
    const clients = await tx.select({ id: E.partners.id, n: sql<string>`coalesce(${E.partners.tradeName}, ${E.partners.name})` }).from(E.partners).where(sql`'Cliente' = any(${E.partners.kinds})`).orderBy(sql`2`);
    return { rows, total, sum, counts, clients };
  });
  const sellers = await db.select({ id: users.id, n: users.name }).from(users).where(eq(users.tenantId, s.tenant.id)).orderBy(asc(users.name));
  const cnt = (st: string) => (st ? d.counts.find((c) => c.st === st)?.n ?? 0 : d.counts.reduce((a, c) => a + c.n, 0));
  const moreActive = ["vend", "local", "item", "prod"].filter((k) => sp[k]).length;
  const hoje = today();
  const csv = `/api/export/pedidos?${new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "p") as [string, string][])}`;
  return (
    <>
      <PageHead title="Pedidos de venda" sub="Propostas e pedidos com itens, descontos, prazos e condições de pagamento. Ao aprovar, o pedido vai para a fila da produção, que decide se gera ordem de produção."
        actions={<><a className="btn" href={csv}><Icon name="download" size={16} /> Exportar CSV</a>{s.edit && <BtnLink href="/pedidos/novo" primary icon="plus">Nova proposta</BtnLink>}</>} />
      <FilterBar moreActive={moreActive} right={<span className="count">{d.total} pedidos · {fmtMoney(d.sum)}</span>}
        tabs={<FilterTabs name="st" value={sp.st ?? ""} options={[{ v: "", label: "Todos", n: cnt("") }, ...Object.entries(SO_STATUS).map(([v, x]) => ({ v, label: x.label === "Proposta" ? "Propostas" : x.label === "Aprovado" ? "Aprovados" : x.label === "Faturado" ? "Faturados" : "Cancelados", n: cnt(v) }))]} />}
        more={<>
          <select name="vend" defaultValue={sp.vend ?? ""} aria-label="Vendedor"><option value="">Todos os vendedores</option>{sellers.map((u) => <option key={u.id} value={u.id}>{u.n}</option>)}</select>
          <label className="fl">Local de entrega <input type="text" name="local" defaultValue={sp.local ?? ""} /></label>
          <label className="fl">Produto <input type="text" name="item" defaultValue={sp.item ?? ""} placeholder="código ou descrição" /></label>
          <select name="prod" defaultValue={sp.prod ?? ""} aria-label="Produção"><option value="">Produção: todas</option>{Object.entries(PROD_STATUS).map(([v, x]) => <option key={v} value={v}>{x.label}</option>)}</select>
        </>}>
        <input type="text" name="num" defaultValue={sp.num ?? ""} placeholder="Nº do pedido" aria-label="Número do pedido" style={{ width: 120 }} inputMode="numeric" />
        <select name="cli" defaultValue={sp.cli ?? ""} aria-label="Cliente" style={{ maxWidth: 230 }}><option value="">Todos os clientes</option>{d.clients.map((c) => <option key={c.id} value={c.id}>{c.n}</option>)}</select>
        <label className="fl">Emissão de <input type="date" name="de" defaultValue={sp.de ?? ""} /></label>
        <label className="fl">até <input type="date" name="ate" defaultValue={sp.ate ?? ""} /></label>
        <label className="fl">Entrega de <input type="date" name="ent_de" defaultValue={sp.ent_de ?? ""} /></label>
        <label className="fl">até <input type="date" name="ent_ate" defaultValue={sp.ent_ate ?? ""} /></label>
      </FilterBar>
      <div className="tbl">
        {d.rows.length ? (
          <table>
            <thead><tr><th className="num">Nº</th><th>Emissão</th><th>Cliente</th><th>Itens</th><th>Entrega</th><th className="num">Total</th><th>Pagamento</th><th>Situação</th><th>Produção</th></tr></thead>
            <tbody>{d.rows.map(({ o, cli, first, nitems, pm, pt }) => {
              const late = o.deliveryDate && o.deliveryDate < hoje && o.status === "APROVADO";
              return (
                <ClickRow key={o.id} href={`/pedidos/${o.id}`}>
                  <td className="num"><b>{o.number}</b></td><td className="code">{fmtD(o.issueDate)}</td><td>{cli}{o.salespersonName && <div className="muted" style={{ fontSize: 12 }}>{o.salespersonName}</div>}</td>
                  <td className="wrap" style={{ maxWidth: 260, fontSize: 12.5 }}>{first ?? "—"}{nitems > 1 && <span className="muted"> +{nitems - 1}</span>}</td>
                  <td><span className={`badge${late ? " bad" : ""}`}>{fmtD(o.deliveryDate)}</span>
                    {o.deliveryPlace && o.deliveryPlace !== "Retira na fábrica" && <div className="t-sub ell" style={{ maxWidth: 110 }} title={o.deliveryPlace}>{o.deliveryPlace}</div>}</td>
                  <td className="num"><b>{fmtMoney(o.total)}</b></td>
                  <td style={{ fontSize: 12.5 }}>{pm ?? ""}<div className="muted">{pt ?? ""}</div></td>
                  <td><StatusBadge color={SO_STATUS[o.status]?.color ?? "#6B7785"} label={SO_STATUS[o.status]?.label ?? o.status} /></td>
                  <td>{o.productionStatus ? <span className="badge" style={{ color: PROD_STATUS[o.productionStatus]?.color }}>{PROD_STATUS[o.productionStatus]?.label}</span> : <span className="muted">—</span>}</td>
                </ClickRow>
              );
            })}</tbody>
            <tfoot><tr><td colSpan={5}>Total</td><td className="num">{fmtMoney(d.sum)}</td><td colSpan={3} /></tr></tfoot>
          </table>
        ) : <Empty title="Nenhum pedido neste filtro">Ajuste a busca ou os filtros, ou crie uma nova proposta.</Empty>}
        <Pager page={pg} pages={Math.max(1, Math.ceil(d.total / PAGE))} qs={pageLink(sp)} />
      </div>
    </>
  );
}

async function editorOptions(s: PageCtx) {
  const o = await s.tx(async (tx) => ({
    partners: await tx.select({ id: E.partners.id, name: E.partners.name, trade: E.partners.tradeName, city: E.partners.city, uf: E.partners.uf, street: E.partners.street, number: E.partners.number })
      .from(E.partners).where(sql`'Cliente' = any(${E.partners.kinds}) and ${E.partners.active}`).orderBy(asc(E.partners.name)),
    methods: await tx.select({ id: E.paymentMethods.id, n: E.paymentMethods.name }).from(E.paymentMethods).where(eq(E.paymentMethods.active, true)).orderBy(asc(E.paymentMethods.name)),
    terms: await tx.select({ id: E.paymentTerms.id, name: E.paymentTerms.name, days: E.paymentTerms.days }).from(E.paymentTerms).where(eq(E.paymentTerms.active, true)).orderBy(asc(E.paymentTerms.name)),
    fields: await tx.select().from(E.customFields).where(and(eq(E.customFields.entity, "sales_order"), eq(E.customFields.active, true))).orderBy(asc(E.customFields.position)),
  }));
  const sellers = await db.select({ id: users.id, n: users.name }).from(users).where(and(eq(users.tenantId, s.tenant.id), eq(users.status, "ACTIVE"))).orderBy(asc(users.name));
  return {
    partners: o.partners.map((p) => ({ id: p.id, label: p.trade ? `${p.trade} · ${p.name}` : p.name, place: [p.street && `${p.street}${p.number ? ", " + p.number : ""}`, p.city && `${p.city}/${p.uf ?? ""}`].filter(Boolean).join(" · ") })),
    sellers: sellers.map((u) => [u.id, u.n] as [string, string]),
    methods: o.methods.map((m) => [m.id, m.n] as [string, string]),
    terms: o.terms,
    fields: o.fields.map((f) => ({ id: f.id, label: f.label, type: f.type, options: f.options, required: f.required })),
  };
}

export async function SalesNew({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await page("comercial", { edit: true });
  const sp = await searchParams;
  const o = await editorOptions(s);
  const cli = o.partners.find((p) => p.id === sp.cliente);
  const data: SOData = {
    status: "PROPOSTA", productionStatus: null, partnerId: cli?.id ?? "", salespersonId: s.user.id, issueDate: today(), deliveryDate: "", deliveryPlace: cli?.place ?? "",
    paymentMethodId: o.methods.find(([, n]) => n === "Boleto")?.[0] ?? "", paymentTermId: "", installments: [], discount: 0, freight: 0, notes: "", internalNotes: "", custom: {}, lines: [],
  };
  return (
    <>
      <PageHead title="Nova proposta de venda" sub="Preencha o principal, inclua os itens pela tela de pesquisa e salve. Ao aprovar, ela vira pedido e vai para a produção." back={{ href: "/pedidos", label: "Pedidos de venda" }} />
      <SalesOrderEditor data={data} {...o} locked={false} canEdit />
    </>
  );
}

export async function SalesEdit({ params }: { params: Promise<{ id: string }> }) {
  const s = await page("comercial");
  const { id } = await params;
  const o = await editorOptions(s);
  const d = await s.tx(async (tx) => {
    const [so] = await tx.select().from(E.salesOrders).where(eq(E.salesOrders.id, id)).limit(1);
    if (!so) return null;
    const lines = await tx.select({ l: E.salesOrderItems, i: E.items }).from(E.salesOrderItems).innerJoin(E.items, eq(E.items.id, E.salesOrderItems.itemId)).where(eq(E.salesOrderItems.orderId, id)).orderBy(asc(E.salesOrderItems.position));
    const ops = await tx.select({ id: E.productionOrders.id, n: E.productionOrders.number, st: E.productionStages.name, c: E.productionStages.color }).from(E.productionOrders).innerJoin(E.productionStages, eq(E.productionStages.id, E.productionOrders.stageId)).where(eq(E.productionOrders.salesOrderId, id));
    const nfs = await tx.select().from(E.invoices).where(eq(E.invoices.salesOrderId, id));
    const [p] = await tx.select({ id: E.partners.id, name: E.partners.name, trade: E.partners.tradeName }).from(E.partners).where(eq(E.partners.id, so.partnerId));
    const files = await loadAttachments(tx, "sales_order", id);
    return { so, lines, ops, nfs, p, files };
  });
  if (!d) notFound();
  const { so } = d;
  // cliente inativo continua aparecendo no pedido antigo
  const partners = o.partners.some((x) => x.id === so.partnerId) ? o.partners : [{ id: d.p.id, label: d.p.trade ?? d.p.name, place: "" }, ...o.partners];
  const data: SOData = {
    id: so.id, number: so.number, status: so.status, productionStatus: so.productionStatus, partnerId: so.partnerId, salespersonId: so.salespersonId ?? "",
    issueDate: so.issueDate, deliveryDate: so.deliveryDate ?? "", deliveryPlace: so.deliveryPlace ?? "", paymentMethodId: so.paymentMethodId ?? "", paymentTermId: so.paymentTermId ?? "",
    installments: so.installments, discount: Number(so.discount), freight: Number(so.freight), notes: so.notes ?? "", internalNotes: so.internalNotes ?? "", custom: so.custom,
    lines: d.lines.map(({ l, i }) => ({ key: l.id, itemId: i.id, code: i.code, name: i.name, unit: i.unit, qty: Number(l.qty), price: Number(l.price), discountPct: Number(l.discountPct), notes: l.notes ?? "" })),
  };
  const st = SO_STATUS[so.status];
  const nfOk = d.nfs.filter((n) => n.status === "EMITIDA");
  return (
    <>
      <PageHead title={`${so.status === "PROPOSTA" ? "Proposta" : "Pedido"} de venda nº ${so.number}`} back={{ href: "/pedidos", label: "Pedidos de venda" }}
        actions={<>
          <BtnLink href={`/pedidos/${so.id}/imprimir`} icon="print">Imprimir</BtnLink>
          {s.edit && <ActionButton className="btn" action={duplicateSalesOrderAction.bind(null, so.id)}><Icon name="copy" size={16} /> Duplicar</ActionButton>}
          {s.edit && so.status === "CANCELADO" && <ActionButton className="btn" action={setSalesStatusAction.bind(null, so.id, "PROPOSTA")}>Reabrir como proposta</ActionButton>}
          {s.edit && so.status === "APROVADO" && <BtnLink href={`/faturamento/novo?pedido=${so.id}`} icon="doc">Faturar</BtnLink>}
          {s.edit && (so.status === "PROPOSTA" || so.status === "CANCELADO") && <ActionButton className="btn btn-danger" confirm={`Excluir o pedido ${so.number}?`} action={deleteSalesOrderAction.bind(null, so.id)}><Icon name="trash" size={16} /> Excluir</ActionButton>}
        </>}>
        <div className="tl" style={{ marginTop: 6 }}>
          <StatusBadge color={st?.color ?? "#6B7785"} label={st?.label ?? so.status} />
          {d.ops.map((op) => <a key={op.id} className="badge" href={`/ops/${op.id}`} style={{ textDecoration: "none" }}>OP {op.n} · {op.st}</a>)}
          {nfOk.map((n) => <a key={n.id} className="badge ok" href={`/faturamento/${n.id}`} style={{ textDecoration: "none" }}>NF {n.number}</a>)}
        </div>
      </PageHead>
      <SalesOrderEditor key={so.updatedAt.toISOString()} data={data} {...o} partners={partners} locked={so.status === "FATURADO" || so.status === "CANCELADO"} canEdit={s.edit} />
      <div className="sheet" style={{ marginTop: 16 }}>
        <Attachments entity="sales_order" entityId={so.id} rows={d.files} canEdit={s.edit} />
      </div>
    </>
  );
}

export async function SalesPrint({ params }: { params: Promise<{ id: string }> }) {
  const s = await page("comercial");
  const { id } = await params;
  const d = await s.tx(async (tx) => {
    const [so] = await tx.select().from(E.salesOrders).where(eq(E.salesOrders.id, id)).limit(1);
    if (!so) return null;
    const [p] = await tx.select().from(E.partners).where(eq(E.partners.id, so.partnerId));
    const lines = await tx.select({ l: E.salesOrderItems, i: E.items }).from(E.salesOrderItems).innerJoin(E.items, eq(E.items.id, E.salesOrderItems.itemId)).where(eq(E.salesOrderItems.orderId, id)).orderBy(asc(E.salesOrderItems.position));
    const [pm] = so.paymentMethodId ? await tx.select({ n: E.paymentMethods.name }).from(E.paymentMethods).where(eq(E.paymentMethods.id, so.paymentMethodId)) : [];
    const [pt] = so.paymentTermId ? await tx.select({ n: E.paymentTerms.name }).from(E.paymentTerms).where(eq(E.paymentTerms.id, so.paymentTermId)) : [];
    const fields = await tx.select().from(E.customFields).where(eq(E.customFields.entity, "sales_order")).orderBy(asc(E.customFields.position));
    return { so, p, lines, pm, pt, fields, company: await companyHeader(tx, s.tenant.name) };
  });
  if (!d) notFound();
  const { so, p } = d;
  const items = d.lines.map(({ l, i }) => ({ code: i.code, name: i.name, unit: i.unit, qty: Number(l.qty), price: Number(l.price), discountPct: Number(l.discountPct), notes: l.notes }));
  const t = docTotals(items, Number(so.discount), Number(so.freight));
  const custom = d.fields.filter((f) => so.custom[f.id]).map((f) => [f.label, so.custom[f.id]] as const);
  return (
    <DocReport r={{
      title: `${so.status === "PROPOSTA" ? "Proposta comercial" : "Pedido de venda"} nº ${so.number}`, status: SO_STATUS[so.status]?.label, back: { href: `/pedidos/${so.id}`, label: `Voltar ao pedido ${so.number}` },
      company: d.company, partnerLabel: "Cliente",
      partner: { name: p.name, trade: p.tradeName, doc: p.document, address: partnerAddress(p), contact: [p.phone || p.mobile1, p.email].filter(Boolean).join(" · ") },
      dates: [["Emissão", so.issueDate], ["Entrega prevista", so.deliveryDate]], payment: [d.pm?.n ?? "", d.pt?.n ?? "", so.salespersonName ? `Vendedor: ${so.salespersonName}` : ""].filter(Boolean),
      items, totals: { ...t, discount: Number(so.discount), freight: Number(so.freight) },
      installments: so.installments.map((x) => ({ n: `${x.n}/${so.installments.length}`, due: x.due, value: x.value })),
      notes: so.notes, signs: ["Vendedor", "Cliente"],
      extra: (so.deliveryPlace || custom.length > 0) && (
        <section className="rep-obs"><h4>Informações do pedido</h4>
          {so.deliveryPlace && <div>Local de entrega: <b>{so.deliveryPlace}</b></div>}
          {custom.map(([l, v]) => <div key={l}>{l}: <b>{v}</b></div>)}
        </section>
      ),
    }} />
  );
}
