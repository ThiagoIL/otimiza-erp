import Link from "next/link";
import { and, asc, eq, ilike, sql, type SQL } from "drizzle-orm";
import { withTenant } from "@/lib/db";
import { partners, receivables, salesOrders } from "@/db/schema";
import { requireTenantUser } from "@/lib/context";
import { addDays, fmtDay, fmtMoney, paymentLabel, pvNumber, today } from "@/lib/format";
import { Form, Hidden, Submit } from "@/components/Form";
import { settleReceivableAction } from "@/server/sales-actions";

const VIEWS = [["abertas", "A receber"], ["vencidas", "Vencidas"], ["semana", "Vencem em 7 dias"], ["recebidas", "Recebidas"], ["todas", "Todas"]] as const;

export async function Receivables({ searchParams }: { searchParams: Promise<{ ver?: string; q?: string }> }) {
  const s = await requireTenantUser();
  const sp = await searchParams;
  const ver = VIEWS.some(([k]) => k === sp.ver) ? sp.ver! : "abertas";
  const q = (sp.q ?? "").trim().slice(0, 80);
  const hoje = today();
  const conds: SQL[] = [eq(receivables.tenantId, s.tenant.id)];
  if (ver === "abertas") conds.push(sql`${receivables.paidAt} is null`);
  if (ver === "vencidas") conds.push(sql`${receivables.paidAt} is null and ${receivables.dueDate} < ${hoje}::date`);
  if (ver === "semana") conds.push(sql`${receivables.paidAt} is null and ${receivables.dueDate} between ${hoje}::date and ${addDays(hoje, 7)}::date`);
  if (ver === "recebidas") conds.push(sql`${receivables.paidAt} is not null`);
  if (q) conds.push(ilike(partners.name, `%${q}%`));
  const [rows, [k]] = await withTenant(s.tenant.id, async (tx) => [
    await tx.select({ r: receivables, customer: partners.name, pv: salesOrders.number }).from(receivables)
      .innerJoin(partners, eq(partners.id, receivables.customerId)).leftJoin(salesOrders, eq(salesOrders.id, receivables.salesOrderId))
      .where(and(...conds)).orderBy(ver === "recebidas" ? sql`${receivables.paidAt} desc` : asc(receivables.dueDate)).limit(300),
    await tx.select({
      aberto: sql<string>`coalesce(sum(${receivables.amount}) filter (where ${receivables.paidAt} is null), 0)`,
      vencido: sql<string>`coalesce(sum(${receivables.amount}) filter (where ${receivables.paidAt} is null and ${receivables.dueDate} < ${hoje}::date), 0)`,
      semana: sql<string>`coalesce(sum(${receivables.amount}) filter (where ${receivables.paidAt} is null and ${receivables.dueDate} between ${hoje}::date and ${addDays(hoje, 7)}::date), 0)`,
      mes: sql<string>`coalesce(sum(${receivables.amount}) filter (where date_trunc('month', ${receivables.paidAt}) = date_trunc('month', ${hoje}::date)), 0)`,
    }).from(receivables),
  ] as const);
  return (
    <>
      <div className="ph"><div><h1>Contas a receber</h1><p>Parcelas geradas pelos pedidos de venda. Marque como recebida quando o pagamento entrar.</p></div></div>
      <div className="kpis">
        <Link className="kpi" href="?ver=abertas"><b>{fmtMoney(k.aberto)}</b><span>Total a receber</span></Link>
        <Link className={`kpi${Number(k.vencido) ? " kpi-bad" : ""}`} href="?ver=vencidas"><b>{fmtMoney(k.vencido)}</b><span>Vencido</span></Link>
        <Link className="kpi" href="?ver=semana"><b>{fmtMoney(k.semana)}</b><span>Vence nos próximos 7 dias</span></Link>
        <Link className="kpi" href="?ver=recebidas"><b>{fmtMoney(k.mes)}</b><span>Recebido no mês</span></Link>
      </div>
      <nav className="chips" aria-label="Filtro">{VIEWS.map(([key, l]) => <Link key={key} href={`?ver=${key}`} aria-current={ver === key ? "true" : undefined}>{l}</Link>)}</nav>
      <form className="bar" role="search">
        <input type="hidden" name="ver" value={ver} />
        <input type="search" name="q" defaultValue={q} placeholder="Cliente" aria-label="Buscar cliente" />
        <button className="btn" type="submit">Buscar</button><span className="grow" /><span className="muted">{rows.length} parcelas · {fmtMoney(rows.reduce((a, r) => a + Number(r.r.amount), 0))}</span>
      </form>
      <div className="tbl">
        {rows.length ? (
          <table><thead><tr><th>Vencimento</th><th>Cliente</th><th>Pedido</th><th>Parcela</th><th>Forma</th><th className="num">Valor</th><th>Situação</th><th /></tr></thead>
            <tbody>{rows.map(({ r, customer, pv }) => {
              const late = !r.paidAt && r.dueDate < hoje;
              return (
                <tr key={r.id}>
                  <td className={late ? "late" : undefined}>{fmtDay(r.dueDate)}</td><td>{customer}</td>
                  <td>{pv != null ? <Link href={`/comercial/pedidos/${r.salesOrderId}`}>{pvNumber(pv)}</Link> : "—"}</td>
                  <td>{r.installment}/{r.installmentsTotal}</td><td>{paymentLabel(r.paymentMethod)}</td>
                  <td className="num"><b>{fmtMoney(r.amount)}</b></td>
                  <td>{r.paidAt ? <span className="badge ok">Recebida {fmtDay(r.paidAt)}</span> : late ? <span className="badge bad">Vencida</span> : <span className="badge">Em aberto</span>}</td>
                  <td className="num"><Form action={settleReceivableAction} className="inline-form"><Hidden name="id" value={r.id} />{r.paidAt && <Hidden name="desfazer" value="1" />}
                    <Submit variant="default" pending="…" confirm={r.paidAt ? "Desfazer o recebimento desta parcela?" : undefined}>{r.paidAt ? "Desfazer" : "Receber"}</Submit></Form></td>
                </tr>
              );
            })}</tbody></table>
        ) : <div className="empty"><strong>Nenhuma parcela aqui</strong>As parcelas aparecem quando um pedido de venda é criado.</div>}
      </div>
    </>
  );
}
