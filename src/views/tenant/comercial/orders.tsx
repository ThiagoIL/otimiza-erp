import Link from "next/link";
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { withTenant } from "@/lib/db";
import { partners, productionOrders, salesOrders } from "@/db/schema";
import { requireTenantUser } from "@/lib/context";
import { fmtDay, fmtMoney, paymentLabel, pvNumber, SALES_STATUS, SALES_STATUS_BADGE, salesStatusLabel, today } from "@/lib/format";
import { SalesOrderForm } from "@/components/SalesOrderForm";
import { salesLookups } from "./data";
import { col } from "@/lib/sql";

const PAGE = 50;
type Status = (typeof SALES_STATUS)[number][0];

export async function SalesOrders({ searchParams }: { searchParams: Promise<{ q?: string; situacao?: string; p?: string; msg?: string }> }) {
  const s = await requireTenantUser();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const page = Math.max(1, Math.min(1000, Number(sp.p) || 1));
  const conds: SQL[] = [eq(salesOrders.tenantId, s.tenant.id)];
  if (q) { const n = Number(q.replace(/\D/g, "")); conds.push(or(ilike(partners.name, `%${q}%`), ilike(partners.tradeName, `%${q}%`), ...(n ? [eq(salesOrders.number, n)] : []))!); }
  if (sp.situacao === "abertos") conds.push(sql`${salesOrders.status} in ('ORCAMENTO', 'APROVADO', 'EM_PRODUCAO', 'PRONTO')`);
  else if (SALES_STATUS.some(([k]) => k === sp.situacao)) conds.push(eq(salesOrders.status, sp.situacao as Status));
  const where = and(...conds);
  const [rows, [tot], [kpi]] = await withTenant(s.tenant.id, async (tx) => [
    await tx.select({ o: salesOrders, customer: partners.name, ops: sql<number>`(select count(*)::int from ${productionOrders} where ${col(productionOrders.salesOrderId)} = ${col(salesOrders.id)})` })
      .from(salesOrders).innerJoin(partners, eq(partners.id, salesOrders.customerId)).where(where).orderBy(desc(salesOrders.number)).limit(PAGE).offset((page - 1) * PAGE),
    await tx.select({ total: sql<number>`count(*)::int`, valor: sql<string>`coalesce(sum(${salesOrders.total}), 0)` }).from(salesOrders).innerJoin(partners, eq(partners.id, salesOrders.customerId)).where(where),
    await tx.select({
      orc: sql<number>`(count(*) filter (where ${salesOrders.status} = 'ORCAMENTO'))::int`,
      abertos: sql<string>`coalesce(sum(${salesOrders.total}) filter (where ${salesOrders.status} in ('APROVADO', 'EM_PRODUCAO', 'PRONTO')), 0)`,
      mes: sql<string>`coalesce(sum(${salesOrders.total}) filter (where ${salesOrders.status} not in ('ORCAMENTO', 'CANCELADO') and date_trunc('month', ${salesOrders.issueDate}) = date_trunc('month', ${today()}::date)), 0)`,
      atrasados: sql<number>`(count(*) filter (where ${salesOrders.status} in ('APROVADO', 'EM_PRODUCAO', 'PRONTO') and ${salesOrders.deliveryDate} < ${today()}::date))::int`,
    }).from(salesOrders),
  ] as const);
  const pages = Math.max(1, Math.ceil(tot.total / PAGE));
  const qs = (p: number) => `?${new URLSearchParams({ ...(q && { q }), ...(sp.situacao && { situacao: sp.situacao }), p: String(p) })}`;
  const hoje = today();
  return (
    <>
      <div className="ph"><div><h1>Pedidos de venda</h1><p>Do orçamento à entrega: os pedidos geram as ordens de produção e as parcelas a receber.</p></div>
        <div className="acts"><Link className="btn btn-primary" href="/comercial/pedidos/novo">Novo pedido</Link></div></div>
      {sp.msg && <div className="alert ok" role="status">{sp.msg.slice(0, 200)}</div>}
      <div className="kpis">
        <Link className="kpi" href="?situacao=ORCAMENTO"><b>{kpi.orc}</b><span>Orçamentos em aberto</span></Link>
        <Link className="kpi" href="?situacao=abertos"><b>{fmtMoney(kpi.abertos)}</b><span>Pedidos a entregar</span></Link>
        <div className="kpi"><b>{fmtMoney(kpi.mes)}</b><span>Vendido no mês</span></div>
        <Link className={`kpi${kpi.atrasados ? " kpi-bad" : ""}`} href="?situacao=abertos"><b>{kpi.atrasados}</b><span>Entregas atrasadas</span></Link>
      </div>
      <nav className="chips" aria-label="Situação">
        <Link href="?" aria-current={!sp.situacao ? "true" : undefined}>Todos</Link>
        <Link href="?situacao=abertos" aria-current={sp.situacao === "abertos" ? "true" : undefined}>Em aberto</Link>
        {SALES_STATUS.map(([k, l]) => <Link key={k} href={`?situacao=${k}`} aria-current={sp.situacao === k ? "true" : undefined}>{l}</Link>)}
      </nav>
      <form className="bar" role="search">
        {sp.situacao && <input type="hidden" name="situacao" value={sp.situacao} />}
        <input type="search" name="q" defaultValue={q} placeholder="Nº do pedido ou cliente" aria-label="Buscar pedido" />
        <button className="btn" type="submit">Buscar</button><span className="grow" /><span className="muted">{tot.total} pedidos · {fmtMoney(tot.valor)}</span>
      </form>
      <div className="tbl">
        {rows.length ? (
          <table><thead><tr><th>Pedido</th><th>Cliente</th><th>Data</th><th>Entrega</th><th>Pagamento</th><th>Situação</th><th className="num">OPs</th><th className="num">Total</th></tr></thead>
            <tbody>{rows.map(({ o, customer, ops }) => {
              const late = o.deliveryDate && o.deliveryDate < hoje && ["APROVADO", "EM_PRODUCAO", "PRONTO"].includes(o.status);
              return (
                <tr key={o.id}>
                  <td className="nowrap"><Link className="row-link" href={`/comercial/pedidos/${o.id}`}>{pvNumber(o.number)}</Link></td>
                  <td>{customer}</td><td>{fmtDay(o.issueDate)}</td><td className={late ? "late" : undefined}>{fmtDay(o.deliveryDate)}</td>
                  <td>{paymentLabel(o.paymentMethod)}{o.installments > 1 && <small className="sub">{o.installments}x</small>}</td>
                  <td><span className={`badge ${SALES_STATUS_BADGE[o.status]}`}>{salesStatusLabel(o.status)}</span></td>
                  <td className="num">{ops || "—"}</td>
                  <td className="num"><b>{fmtMoney(o.total)}</b></td>
                </tr>
              );
            })}</tbody></table>
        ) : <div className="empty"><strong>Nenhum pedido encontrado</strong>{q || sp.situacao ? "Ajuste a busca ou a situação." : "Crie o primeiro pedido de venda."}</div>}
        {pages > 1 && <div className="pager">{page > 1 && <Link className="btn btn-sm" href={qs(page - 1)}>Anterior</Link>}<span>Página {page} de {pages}</span>{page < pages && <Link className="btn btn-sm" href={qs(page + 1)}>Próxima</Link>}</div>}
      </div>
    </>
  );
}

export async function SalesOrderNew({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const s = await requireTenantUser();
  const sp = await searchParams;
  const lk = await withTenant(s.tenant.id, (tx) => salesLookups(tx));
  return (
    <>
      <div className="ph"><div><Link className="back" href="/comercial">‹ Pedidos de venda</Link><h1>Novo pedido de venda</h1><p>Escolha o cliente, inclua os itens com preço e desconto e defina como será pago.</p></div></div>
      <section className="panel" style={{ maxWidth: 1000 }}><div className="pb"><SalesOrderForm lk={lk} customer={sp.cliente} /></div></section>
    </>
  );
}
