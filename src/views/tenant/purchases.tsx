import Link from "next/link";
import { Sel } from "@/components/SearchPicker";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { page, type PageCtx } from "@/lib/access";
import * as E from "@/db/erp";
import { BtnLink, Empty, PageHead, StatusBadge } from "@/components/ui";
import { ActionButton, ClickRow, FilterBar, FilterTabs } from "@/components/client";
import { Icon } from "@/components/Icon";
import { PurchaseOrderEditor, QuotationEditor, QuoteFromRequests, ReceiveButton, RequestEditor } from "@/components/PurchaseUI";
import { Attachments } from "@/components/Attachments";
import { DocReport } from "@/components/DocReport";
import { cancelQuotationAction, deletePurchaseOrderAction, deleteRequestAction, setRequestStatusAction, suggestRequestAction } from "@/server/purchase-actions";
import { balances, balanceOf, companyHeader, loadAttachments, partnerAddress } from "@/server/common";
import { fmtMoney, fmtQty } from "@/lib/format";
import { docTotals, fmtD, isDate, today } from "@/lib/dates";
import { PO_STATUS, PR_STATUS, QT_STATUS } from "@/lib/consts";

type SP = Record<string, string | undefined>;
const suppliersOf = (s: PageCtx) => s.tx((tx) => tx.select({ id: E.partners.id, n: sql<string>`coalesce(${E.partners.tradeName}, ${E.partners.name})` }).from(E.partners).where(sql`'Fornecedor' = any(${E.partners.kinds}) and ${E.partners.active}`).orderBy(sql`2`));

// ---------------------------------------------------------------- Solicitações
export async function RequestsList({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await page("compras");
  const sp = await searchParams;
  const c: SQL[] = [eq(E.purchaseRequests.tenantId, s.tenant.id)];
  if (sp.st) c.push(eq(E.purchaseRequests.status, sp.st));
  if (sp.q) c.push(sql`("purchase_requests"."requester" ilike ${"%" + sp.q + "%"} or "purchase_requests"."department" ilike ${"%" + sp.q + "%"} or "purchase_requests"."number"::text = ${sp.q} or exists (select 1 from purchase_request_items ri join items i on i.id = ri.item_id where ri.request_id = "purchase_requests"."id" and (i.name ilike ${"%" + sp.q + "%"} or i.code ilike ${"%" + sp.q + "%"})))`);
  if (sp.de && isDate(sp.de)) c.push(sql`${E.purchaseRequests.createdAt}::date >= ${sp.de}`);
  if (sp.ate && isDate(sp.ate)) c.push(sql`${E.purchaseRequests.createdAt}::date <= ${sp.ate}`);
  const d = await s.tx(async (tx) => ({
    rows: await tx.select({ r: E.purchaseRequests, n: sql<number>`(select count(*)::int from purchase_request_items x where x.request_id = "purchase_requests"."id")`,
      first: sql<string | null>`(select i.name from purchase_request_items x join items i on i.id = x.item_id where x.request_id = "purchase_requests"."id" limit 1)` })
      .from(E.purchaseRequests).where(and(...c)).orderBy(desc(E.purchaseRequests.number)),
    counts: await tx.select({ st: E.purchaseRequests.status, n: sql<number>`count(*)::int` }).from(E.purchaseRequests).groupBy(E.purchaseRequests.status),
    open: await tx.select({ id: E.purchaseRequests.id, n: E.purchaseRequests.number, who: E.purchaseRequests.requester, st: E.purchaseRequests.status }).from(E.purchaseRequests).where(inArray(E.purchaseRequests.status, ["ABERTA", "APROVADA"])).orderBy(asc(E.purchaseRequests.number)),
  }));
  const cnt = (k: string) => (k ? d.counts.find((x) => x.st === k)?.n ?? 0 : d.counts.reduce((a, x) => a + x.n, 0));
  return (
    <>
      <PageHead title="Solicitações de compra" sub="O primeiro passo da compra: quem precisa pede os itens. Depois de aprovadas, as solicitações vão para cotação com os fornecedores e viram pedido de compra."
        actions={s.edit && <>
          <ActionButton className="btn" action={suggestRequestAction}><Icon name="alert" size={16} /> Sugestão de compra</ActionButton>
          <QuoteFromRequests requests={d.open.map((r) => ({ id: r.id, label: `Solicitação ${r.n} · ${r.who ?? ""} · ${PR_STATUS[r.st]?.label}` }))} />
          <BtnLink href="/compras/solicitacoes/nova" primary icon="plus">Nova solicitação</BtnLink>
        </>} />
      <FilterBar right={<span className="count">{d.rows.length} solicitações</span>}
        tabs={<FilterTabs name="st" value={sp.st ?? ""} options={[{ v: "", label: "Todas", n: cnt("") }, ...Object.entries(PR_STATUS).map(([v, x]) => ({ v, label: x.label, n: cnt(v) }))]} />}>
        <div className="search"><Icon name="search" size={16} /><input type="search" name="q" defaultValue={sp.q ?? ""} placeholder="Nº, solicitante, setor ou item" aria-label="Buscar" /></div>
        <label className="fl">De <input type="date" name="de" defaultValue={sp.de ?? ""} /></label>
        <label className="fl">até <input type="date" name="ate" defaultValue={sp.ate ?? ""} /></label>
      </FilterBar>
      <div className="tbl">
        {d.rows.length ? (
          <table><thead><tr><th className="num">Nº</th><th>Data</th><th>Solicitante</th><th>Setor</th><th>Itens</th><th>Necessário até</th><th>Situação</th></tr></thead>
            <tbody>{d.rows.map(({ r, n, first }) => (
              <ClickRow key={r.id} href={`/compras/solicitacoes/${r.id}`}><td className="num"><b>{r.number}</b></td><td className="code">{r.createdAt.toLocaleDateString("pt-BR")}</td><td>{r.requester ?? "—"}</td><td>{r.department ?? "—"}</td>
                <td className="wrap" style={{ fontSize: 12.5 }}>{first ?? "—"}{n > 1 && <span className="muted"> +{n - 1}</span>}</td><td className={`code${r.needDate && r.needDate < today() && ["ABERTA", "APROVADA"].includes(r.status) ? " t-bad" : ""}`}>{fmtD(r.needDate)}</td>
                <td><StatusBadge color={PR_STATUS[r.status]?.color ?? "#6B7785"} label={PR_STATUS[r.status]?.label ?? r.status} /></td></ClickRow>))}</tbody></table>
        ) : <Empty title="Nenhuma solicitação">Crie uma solicitação ou use a sugestão de compra.</Empty>}
      </div>
    </>
  );
}

export async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isNew = id === "nova";
  const s = await page("compras");
  const d = isNew ? null : await s.tx(async (tx) => {
    const [r] = await tx.select().from(E.purchaseRequests).where(eq(E.purchaseRequests.id, id)).limit(1);
    if (!r) return null;
    const lines = await tx.select({ l: E.purchaseRequestItems, i: E.items }).from(E.purchaseRequestItems).innerJoin(E.items, eq(E.items.id, E.purchaseRequestItems.itemId)).where(eq(E.purchaseRequestItems.requestId, id));
    const bal = await balances(tx, { itemIds: lines.map((x) => x.i.id) });
    const files = await loadAttachments(tx, "purchase_request", id);
    return { r, lines, bal, files };
  });
  if (!isNew && !d) notFound();
  const editable = s.edit && (isNew || ["ABERTA", "APROVADA"].includes(d!.r.status));
  const r = d?.r;
  return (
    <>
      <PageHead title={isNew ? "Nova solicitação de compra" : `Solicitação de compra ${r!.number}`} back={{ href: "/compras/solicitacoes", label: "Solicitações de compra" }}
        actions={!isNew && s.edit && <>
          {r!.status === "ABERTA" && <ActionButton className="btn btn-primary" action={setRequestStatusAction.bind(null, r!.id, "APROVADA")}><Icon name="check" size={16} /> Aprovar</ActionButton>}
          {r!.status === "APROVADA" && <ActionButton className="btn" action={setRequestStatusAction.bind(null, r!.id, "ABERTA")}>Voltar para aberta</ActionButton>}
          {["ABERTA", "APROVADA"].includes(r!.status) && <ActionButton className="btn" confirm="Cancelar esta solicitação?" action={setRequestStatusAction.bind(null, r!.id, "CANCELADA")}>Cancelar</ActionButton>}
          {r!.status === "CANCELADA" && <ActionButton className="btn" action={setRequestStatusAction.bind(null, r!.id, "ABERTA")}>Reabrir</ActionButton>}
          {["ABERTA", "CANCELADA"].includes(r!.status) && <ActionButton className="btn btn-danger" confirm="Excluir esta solicitação?" action={deleteRequestAction.bind(null, r!.id)}><Icon name="trash" size={16} /></ActionButton>}
        </>}>
        {r && <div className="tl" style={{ marginTop: 6 }}><StatusBadge color={PR_STATUS[r.status]?.color ?? "#6B7785"} label={PR_STATUS[r.status]?.label ?? r.status} /></div>}
      </PageHead>
      <RequestEditor key={r?.updatedAt.toISOString() ?? "nova"} editable={editable} data={{
        id: r?.id, requester: r?.requester ?? s.user.name, department: r?.department ?? "", needDate: r?.needDate ?? "", notes: r?.notes ?? "",
        lines: (d?.lines ?? []).map(({ l, i }) => ({ key: l.id, itemId: i.id, code: i.code, name: i.name, unit: i.unit, qty: Number(l.qty), notes: l.notes ?? "", balance: balanceOf(d!.bal, i.id) })),
      }} />
      {r && <div className="sheet" style={{ marginTop: 16 }}><Attachments entity="purchase_request" entityId={r.id} rows={d!.files} canEdit={s.edit} /></div>}
    </>
  );
}

// ---------------------------------------------------------------- Cotações
export async function QuotationsList({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await page("compras");
  const sp = await searchParams;
  const d = await s.tx(async (tx) => ({
    rows: await tx.select({ q: E.quotations,
      n: sql<number>`(select count(*)::int from quotation_items x where x.quotation_id = "quotations"."id")`,
      f: sql<number>`(select count(*)::int from quotation_suppliers x where x.quotation_id = "quotations"."id")`,
      first: sql<string | null>`(select i.name from quotation_items x join items i on i.id = x.item_id where x.quotation_id = "quotations"."id" order by x.position limit 1)` })
      .from(E.quotations).where(sp.st ? eq(E.quotations.status, sp.st) : sql`true`).orderBy(desc(E.quotations.number)),
    open: await tx.select({ id: E.purchaseRequests.id, n: E.purchaseRequests.number, who: E.purchaseRequests.requester, st: E.purchaseRequests.status }).from(E.purchaseRequests).where(inArray(E.purchaseRequests.status, ["ABERTA", "APROVADA"])).orderBy(asc(E.purchaseRequests.number)),
  }));
  return (
    <>
      <PageHead title="Cotações" sub="Compare os preços de vários fornecedores para os mesmos itens, marque o vencedor de cada item e gere os pedidos de compra."
        actions={s.edit && <QuoteFromRequests requests={d.open.map((r) => ({ id: r.id, label: `Solicitação ${r.n} · ${r.who ?? ""} · ${PR_STATUS[r.st]?.label}` }))} />} />
      <FilterBar right={<span className="count">{d.rows.length} cotações</span>}>
        <select name="st" defaultValue={sp.st ?? ""} aria-label="Situação"><option value="">Todas as situações</option>{Object.entries(QT_STATUS).map(([v, x]) => <option key={v} value={v}>{x.label}</option>)}</select>
      </FilterBar>
      <div className="tbl">
        {d.rows.length ? (
          <table><thead><tr><th className="num">Nº</th><th>Data</th><th>Responder até</th><th>Itens</th><th className="num">Fornecedores</th><th>Observações</th><th>Situação</th></tr></thead>
            <tbody>{d.rows.map(({ q, n, f, first }) => (
              <ClickRow key={q.id} href={`/compras/cotacoes/${q.id}`}><td className="num"><b>{q.number}</b></td><td className="code">{fmtD(q.date)}</td><td className="code">{fmtD(q.dueDate)}</td>
                <td className="wrap" style={{ fontSize: 12.5 }}>{first ?? "—"}{n > 1 && <span className="muted"> +{n - 1}</span>}</td><td className="num">{f}</td><td className="ell">{q.notes ?? "—"}</td>
                <td><StatusBadge color={QT_STATUS[q.status]?.color ?? "#6B7785"} label={QT_STATUS[q.status]?.label ?? q.status} /></td></ClickRow>))}</tbody></table>
        ) : <Empty title="Nenhuma cotação">Crie uma cotação a partir das solicitações aprovadas.</Empty>}
      </div>
    </>
  );
}

export async function QuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await page("compras");
  const { id } = await params;
  const d = await s.tx(async (tx) => {
    const [q] = await tx.select().from(E.quotations).where(eq(E.quotations.id, id)).limit(1);
    if (!q) return null;
    const items = await tx.select({ x: E.quotationItems, i: E.items }).from(E.quotationItems).innerJoin(E.items, eq(E.items.id, E.quotationItems.itemId)).where(eq(E.quotationItems.quotationId, id)).orderBy(asc(E.quotationItems.position));
    const sups = await tx.select().from(E.quotationSuppliers).where(eq(E.quotationSuppliers.quotationId, id)).orderBy(asc(E.quotationSuppliers.createdAt));
    const prices = await tx.select().from(E.quotationPrices).where(eq(E.quotationPrices.quotationId, id));
    const pos = await tx.select({ id: E.purchaseOrders.id, n: E.purchaseOrders.number }).from(E.purchaseOrders).where(eq(E.purchaseOrders.quotationId, id));
    return { q, items, sups, prices, pos };
  });
  if (!d) notFound();
  const partners = await suppliersOf(s);
  const { q } = d;
  const prices: Record<string, { price: number | null; selected: boolean }> = {};
  for (const p of d.prices) prices[`${p.quotationItemId}|${p.quotationSupplierId}`] = { price: p.unitPrice == null ? null : Number(p.unitPrice), selected: p.selected };
  return (
    <>
      <PageHead title={`Cotação ${q.number}`} sub={`${fmtD(q.date)}${q.notes ? " · " + q.notes : ""}`} back={{ href: "/compras/cotacoes", label: "Cotações" }}
        actions={s.edit && q.status === "ABERTA" && <ActionButton className="btn btn-danger" confirm="Cancelar esta cotação? As solicitações voltam para aprovadas." action={cancelQuotationAction.bind(null, q.id)}>Cancelar cotação</ActionButton>}>
        <div className="tl" style={{ marginTop: 6 }}><StatusBadge color={QT_STATUS[q.status]?.color ?? "#6B7785"} label={QT_STATUS[q.status]?.label ?? q.status} />
          {d.pos.map((p) => <Link key={p.id} href={`/compras/pedidos/${p.id}`} className="badge ok" style={{ textDecoration: "none" }}>Pedido de compra {p.n}</Link>)}</div>
      </PageHead>
      <QuotationEditor key={q.updatedAt.toISOString()} id={q.id} open={s.edit && q.status === "ABERTA"} dueDate={q.dueDate ?? ""} notes={q.notes ?? ""} partners={[...partners.map((p) => [p.id, p.n] as [string, string])]}
        items={d.items.map(({ x, i }) => ({ key: x.id, itemId: i.id, code: i.code, name: i.name, unit: i.unit, qty: Number(x.qty) }))}
        suppliers={d.sups.map((x) => ({ key: x.id, partnerId: x.partnerId, freight: Number(x.freight), paymentTerms: x.paymentTerms ?? "", deliveryDays: x.deliveryDays }))} prices={prices} />
    </>
  );
}

// ---------------------------------------------------------------- Pedidos de compra
export async function POList({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await page("compras");
  const sp = await searchParams;
  const c: SQL[] = [eq(E.purchaseOrders.tenantId, s.tenant.id)];
  if (sp.st) c.push(eq(E.purchaseOrders.status, sp.st));
  if (sp.num && /^\d+$/.test(sp.num)) c.push(eq(E.purchaseOrders.number, Number(sp.num)));
  if (sp.forn) c.push(eq(E.purchaseOrders.partnerId, sp.forn));
  if (sp.de && isDate(sp.de)) c.push(gte(E.purchaseOrders.issueDate, sp.de));
  if (sp.ate && isDate(sp.ate)) c.push(lte(E.purchaseOrders.issueDate, sp.ate));
  if (sp.item) c.push(sql`exists (select 1 from purchase_order_items x join items i on i.id = x.item_id where x.order_id = "purchase_orders"."id" and (i.name ilike ${"%" + sp.item + "%"} or i.code ilike ${"%" + sp.item + "%"}))`);
  const base = and(eq(E.purchaseOrders.tenantId, s.tenant.id));
  const d = await s.tx(async (tx) => ({
    rows: await tx.select({ o: E.purchaseOrders, f: sql<string>`coalesce(${E.partners.tradeName}, ${E.partners.name})`,
      q: sql<string>`(select coalesce(sum(qty),0)::text from purchase_order_items x where x.order_id = "purchase_orders"."id")`, r: sql<string>`(select coalesce(sum(least(received_qty, qty)),0)::text from purchase_order_items x where x.order_id = "purchase_orders"."id")`,
      first: sql<string | null>`(select i.name from purchase_order_items x join items i on i.id = x.item_id where x.order_id = "purchase_orders"."id" order by x.position limit 1)`, n: sql<number>`(select count(*)::int from purchase_order_items x where x.order_id = "purchase_orders"."id")` })
      .from(E.purchaseOrders).innerJoin(E.partners, eq(E.partners.id, E.purchaseOrders.partnerId)).where(and(...c)).orderBy(desc(E.purchaseOrders.number)),
    counts: await tx.select({ st: E.purchaseOrders.status, n: sql<number>`count(*)::int` }).from(E.purchaseOrders).where(base).groupBy(E.purchaseOrders.status),
  }));
  const sups = await suppliersOf(s);
  const cnt = (k: string) => (k ? d.counts.find((x) => x.st === k)?.n ?? 0 : d.counts.reduce((a, x) => a + x.n, 0));
  const tot = d.rows.reduce((a, r) => a + Number(r.o.total), 0);
  const hoje = today();
  return (
    <>
      <PageHead title="Pedidos de compra" sub="Compras de materiais. O recebimento dá entrada no estoque e gera as contas a pagar."
        actions={s.edit && <BtnLink href="/compras/pedidos/novo" primary icon="plus">Novo pedido</BtnLink>} />
      <FilterBar right={<span className="count">{d.rows.length} pedidos · {fmtMoney(tot)}</span>} moreActive={sp.item ? 1 : 0}
        tabs={<FilterTabs name="st" value={sp.st ?? ""} options={[{ v: "", label: "Todos", n: cnt("") }, ...Object.entries(PO_STATUS).map(([v, x]) => ({ v, label: x.label, n: cnt(v) }))]} />}
        more={<label className="fl">Item <input type="text" name="item" defaultValue={sp.item ?? ""} placeholder="código ou descrição" /></label>}>
        <input type="text" name="num" defaultValue={sp.num ?? ""} placeholder="Nº do pedido" aria-label="Número" style={{ width: 120 }} />
        <Sel name="forn" defaultValue={sp.forn ?? ""} aria-label="Fornecedor" style={{ maxWidth: 230 }}><option value="">Todos os fornecedores</option>{sups.map((x) => <option key={x.id} value={x.id}>{x.n}</option>)}</Sel>
        <label className="fl">Emissão de <input type="date" name="de" defaultValue={sp.de ?? ""} /></label>
        <label className="fl">até <input type="date" name="ate" defaultValue={sp.ate ?? ""} /></label>
      </FilterBar>
      <div className="tbl">
        {d.rows.length ? (
          <table><thead><tr><th className="num">Nº</th><th>Emissão</th><th>Fornecedor</th><th>Itens</th><th>Previsão</th><th className="num">Total</th><th>Situação</th><th>Recebido</th></tr></thead>
            <tbody>{d.rows.map(({ o, f, q, r, first, n }) => {
              const late = o.deliveryDate && o.deliveryDate < hoje && ["ENVIADO", "RECEBIDO_PARCIAL"].includes(o.status);
              const pct = Number(q) ? (Number(r) / Number(q)) * 100 : 0;
              return (
                <ClickRow key={o.id} href={`/compras/pedidos/${o.id}`}><td className="num"><b>{o.number}</b></td><td className="code">{fmtD(o.issueDate)}</td><td>{f}</td>
                  <td className="wrap" style={{ fontSize: 12.5, maxWidth: 260 }}>{first ?? "—"}{n > 1 && <span className="muted"> +{n - 1}</span>}</td>
                  <td><span className={`badge${late ? " bad" : ""}`}>{fmtD(o.deliveryDate)}</span></td><td className="num"><b>{fmtMoney(o.total)}</b></td>
                  <td><StatusBadge color={PO_STATUS[o.status]?.color ?? "#6B7785"} label={PO_STATUS[o.status]?.label ?? o.status} /></td>
                  <td><div className="cell-prog" style={{ ["--c" as string]: "#2E7D4F", minWidth: 90 }}><div className="prog"><i style={{ width: `${pct}%` }} /></div><span className="prog-t">{Math.round(pct)}%</span></div></td></ClickRow>
              );
            })}</tbody></table>
        ) : <Empty title="Nenhum pedido de compra">Crie um pedido ou conclua uma cotação.</Empty>}
      </div>
    </>
  );
}

export async function POPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isNew = id === "novo";
  const s = await page("compras");
  const [sups, opts] = await Promise.all([suppliersOf(s), s.tx(async (tx) => ({
    methods: await tx.select({ id: E.paymentMethods.id, n: E.paymentMethods.name }).from(E.paymentMethods).where(eq(E.paymentMethods.active, true)).orderBy(asc(E.paymentMethods.name)),
    terms: await tx.select({ id: E.paymentTerms.id, name: E.paymentTerms.name, days: E.paymentTerms.days }).from(E.paymentTerms).where(eq(E.paymentTerms.active, true)).orderBy(asc(E.paymentTerms.name)),
    locs: await tx.select().from(E.stockLocations).where(eq(E.stockLocations.active, true)).orderBy(asc(E.stockLocations.code)),
  }))]);
  const d = isNew ? null : await s.tx(async (tx) => {
    const [o] = await tx.select().from(E.purchaseOrders).where(eq(E.purchaseOrders.id, id)).limit(1);
    if (!o) return null;
    const lines = await tx.select({ l: E.purchaseOrderItems, i: E.items }).from(E.purchaseOrderItems).innerJoin(E.items, eq(E.items.id, E.purchaseOrderItems.itemId)).where(eq(E.purchaseOrderItems.orderId, id)).orderBy(asc(E.purchaseOrderItems.position));
    const moves = await tx.select({ m: E.stockMovements, i: E.items }).from(E.stockMovements).innerJoin(E.items, eq(E.items.id, E.stockMovements.itemId)).where(eq(E.stockMovements.purchaseOrderId, id)).orderBy(desc(E.stockMovements.date));
    const tits = await tx.select().from(E.finTitles).where(and(eq(E.finTitles.originType, "PC"), eq(E.finTitles.originId, id))).orderBy(asc(E.finTitles.dueDate));
    const files = await loadAttachments(tx, "purchase_order", id);
    return { o, lines, moves, tits, files };
  });
  if (!isNew && !d) notFound();
  const o = d?.o;
  const canReceive = s.edit && o && ["RASCUNHO", "ENVIADO", "RECEBIDO_PARCIAL"].includes(o.status);
  const defLoc = d?.lines[0]?.i.defaultLocationId ?? opts.locs[0]?.id ?? "";
  return (
    <>
      <PageHead title={isNew ? "Novo pedido de compra" : `Pedido de compra ${o!.number}`} back={{ href: "/compras/pedidos", label: "Pedidos de compra" }}
        actions={o && <>
          <BtnLink href={`/compras/pedidos/${o.id}/imprimir`} icon="print">Imprimir</BtnLink>
          {canReceive && <ReceiveButton poId={o.id} locations={opts.locs.map((l) => [l.id, `${l.code} · ${l.name}`])} defaultLocation={defLoc}
            lines={d!.lines.map(({ l, i }) => ({ id: l.id, name: i.name, unit: i.unit, qty: Number(l.qty), received: Number(l.receivedQty), price: Number(l.price) * (1 - Number(l.discountPct) / 100) }))} />}
          {s.edit && ["RASCUNHO", "CANCELADO"].includes(o.status) && <ActionButton className="btn btn-danger" confirm={`Excluir o pedido de compra ${o.number}?`} action={deletePurchaseOrderAction.bind(null, o.id)}><Icon name="trash" size={16} /></ActionButton>}
        </>}>
        {o && <div className="tl" style={{ marginTop: 6 }}><StatusBadge color={PO_STATUS[o.status]?.color ?? "#6B7785"} label={PO_STATUS[o.status]?.label ?? o.status} /></div>}
      </PageHead>
      <PurchaseOrderEditor key={o?.updatedAt.toISOString() ?? "novo"} canEdit={s.edit} suppliers={sups.map((x) => [x.id, x.n])} methods={opts.methods.map((m) => [m.id, m.n])} terms={opts.terms}
        data={{ id: o?.id, status: o?.status ?? "RASCUNHO", partnerId: o?.partnerId ?? "", issueDate: o?.issueDate ?? today(), deliveryDate: o?.deliveryDate ?? "", buyer: o?.buyer ?? s.user.name,
          paymentMethodId: o?.paymentMethodId ?? opts.methods.find((m) => m.n === "Boleto")?.id ?? "", paymentTermId: o?.paymentTermId ?? "", installments: o?.installments ?? [], discount: Number(o?.discount ?? 0), freight: Number(o?.freight ?? 0), notes: o?.notes ?? "",
          lines: (d?.lines ?? []).map(({ l, i }) => ({ key: l.id, itemId: i.id, code: i.code, name: i.name, unit: i.unit, qty: Number(l.qty), price: Number(l.price), discountPct: Number(l.discountPct), received: Number(l.receivedQty) })) }} />
      {d && (
        <div className="sheet" style={{ marginTop: 16 }}>
          {d.moves.length > 0 && <section className="panel"><h2>Recebimentos</h2><div className="tbl solo" style={{ border: 0, borderRadius: 0, maxHeight: "none" }}><table>
            <thead><tr><th>Data</th><th>Documento</th><th>Item</th><th className="num">Quantidade</th><th className="num">Custo</th><th>Usuário</th></tr></thead>
            <tbody>{d.moves.map(({ m, i }) => <tr key={m.id}><td className="code">{fmtD(m.date)}</td><td>{m.document}</td><td className="desc">{i.name}</td><td className="num">{fmtQty(m.qty)} {i.unit}</td><td className="num">{fmtMoney(m.unitCost)}</td><td>{m.userName}</td></tr>)}</tbody></table></div></section>}
          {d.tits.length > 0 && <section className="panel"><h2>Contas a pagar geradas</h2><div className="tbl solo" style={{ border: 0, borderRadius: 0, maxHeight: "none" }}><table>
            <thead><tr><th>Parcela</th><th>Vencimento</th><th className="num">Valor</th><th>Situação</th></tr></thead>
            <tbody>{d.tits.map((t) => <ClickRow key={t.id} href={`/financeiro/pagar?id=${t.id}`}><td>{t.installment}</td><td className="code">{fmtD(t.dueDate)}</td><td className="num">{fmtMoney(t.amount)}</td><td>{t.status === "PAGO" ? <span className="badge ok">Paga</span> : t.status === "CANCELADO" ? <span className="badge">Cancelada</span> : <span className="badge warn">Em aberto</span>}</td></ClickRow>)}</tbody></table></div></section>}
          <Attachments entity="purchase_order" entityId={d.o.id} rows={d.files} canEdit={s.edit} />
        </div>
      )}
    </>
  );
}

export async function POPrint({ params }: { params: Promise<{ id: string }> }) {
  const s = await page("compras");
  const { id } = await params;
  const d = await s.tx(async (tx) => {
    const [o] = await tx.select().from(E.purchaseOrders).where(eq(E.purchaseOrders.id, id)).limit(1);
    if (!o) return null;
    const [p] = await tx.select().from(E.partners).where(eq(E.partners.id, o.partnerId));
    const lines = await tx.select({ l: E.purchaseOrderItems, i: E.items }).from(E.purchaseOrderItems).innerJoin(E.items, eq(E.items.id, E.purchaseOrderItems.itemId)).where(eq(E.purchaseOrderItems.orderId, id)).orderBy(asc(E.purchaseOrderItems.position));
    const [pm] = o.paymentMethodId ? await tx.select({ n: E.paymentMethods.name }).from(E.paymentMethods).where(eq(E.paymentMethods.id, o.paymentMethodId)) : [];
    return { o, p, lines, pm, company: await companyHeader(tx, s.tenant.name) };
  });
  if (!d) notFound();
  const { o, p } = d;
  const items = d.lines.map(({ l, i }) => ({ code: i.code, name: i.name, unit: i.unit, qty: Number(l.qty), price: Number(l.price), discountPct: Number(l.discountPct) }));
  return <DocReport r={{
    title: `Pedido de compra nº ${o.number}`, status: PO_STATUS[o.status]?.label, back: { href: `/compras/pedidos/${o.id}`, label: `Voltar ao pedido ${o.number}` }, company: d.company, partnerLabel: "Fornecedor",
    partner: { name: p.name, trade: p.tradeName, doc: p.document, address: partnerAddress(p), contact: [p.phone, p.email].filter(Boolean).join(" · ") },
    dates: [["Emissão", o.issueDate], ["Previsão de chegada", o.deliveryDate]], payment: [d.pm?.n ?? "", o.buyer ? `Comprador: ${o.buyer}` : ""].filter(Boolean),
    items, totals: { ...docTotals(items, Number(o.discount), Number(o.freight)), discount: Number(o.discount), freight: Number(o.freight) },
    installments: o.installments.map((x) => ({ n: `${x.n}/${o.installments.length}`, due: x.due, value: x.value })), notes: o.notes, signs: ["Comprador", "Fornecedor"],
  }} />;
}

