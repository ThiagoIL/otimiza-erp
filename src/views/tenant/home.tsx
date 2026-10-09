import Link from "next/link";
import { and, asc, eq, sql } from "drizzle-orm";
import { withTenant } from "@/lib/db";
import {
  assemblies, assemblyAreas, items, partners, productionOrderMaterials, productionOrders, productionStatuses, receivables,
  salesOrderItems, salesOrders, stockBalances,
} from "@/db/schema";
import { requireTenantUser } from "@/lib/context";
import { addDays, fmtDay, fmtMoney, fmtQty, mtNumber, opNumber, pvNumber, today } from "@/lib/format";
import { FlowDiagram } from "@/components/FlowDiagram";
import { ensureSetup } from "@/server/stock";
import { col, leafArea } from "@/lib/sql";

/** Módulos dos alertas. Novos módulos entram aqui com os alertas deles. */
const AREAS = [["estoque", "Estoque"], ["producao", "Produção"], ["montagens", "Montagens"], ["comercial", "Comercial"], ["financeiro", "Financeiro"]] as const;
type Area = (typeof AREAS)[number][0];
type Alert = { area: Area; level: "bad" | "warn"; title: string; detail?: string; href: string };

export async function TenantHome({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const s = await requireTenantUser();
  const tid = s.tenant.id;
  const hoje = today();
  const filtro = AREAS.some(([k]) => k === searchParams.alertas) ? (searchParams.alertas as Area) : null;
  const bal = sql<string>`coalesce((select sum(${col(stockBalances.quantity)}) from ${stockBalances} where ${col(stockBalances.itemId)} = ${col(items.id)}), 0)`;
  const openOp = sql`${productionOrders.finishedAt} is null`;

  const d = await withTenant(tid, async (tx) => {
    await ensureSetup(tx, tid);
    return {
      low: await tx.select({ id: items.id, code: items.code, name: items.name, b: bal, min: items.minStock, unit: items.unit }).from(items)
        .where(and(eq(items.active, true), sql`${items.minStock} > 0 and ${bal} < ${items.minStock}`)).orderBy(asc(items.name)).limit(50),
      opLate: await tx.select({ id: productionOrders.id, number: productionOrders.number, item: items.name, due: productionOrders.dueDate }).from(productionOrders)
        .innerJoin(items, eq(items.id, productionOrders.itemId)).where(and(openOp, sql`${productionOrders.dueDate} < ${hoje}::date`)).orderBy(asc(productionOrders.dueDate)).limit(50),
      opFlag: await tx.select({ id: productionOrders.id, number: productionOrders.number, status: productionStatuses.name }).from(productionOrders)
        .innerJoin(productionStatuses, eq(productionStatuses.id, productionOrders.statusId)).where(and(openOp, eq(productionStatuses.isAlert, true))).limit(50),
      opNoResp: await tx.select({ n: sql<number>`count(*)::int` }).from(productionOrders).where(and(openOp, sql`${productionOrders.responsibleId} is null`)),
      // material previsto que falta retirar e não há em estoque
      opShort: await tx.select({ id: productionOrders.id, number: productionOrders.number, code: items.code }).from(productionOrderMaterials)
        .innerJoin(productionOrders, eq(productionOrders.id, productionOrderMaterials.orderId)).innerJoin(items, eq(items.id, productionOrderMaterials.itemId))
        .where(and(openOp, sql`${col(productionOrderMaterials.quantity)} - coalesce((select sum(m.quantity) from stock_movements m where m.production_order_id = ${col(productionOrders.id)}
          and m.item_id = ${col(productionOrderMaterials.itemId)} and m.origin = 'CONSUMO_OP'), 0) > ${bal}`)).limit(50),
      mtLate: await tx.select({ id: assemblies.id, number: assemblies.number, name: assemblies.name, due: assemblies.dueDate }).from(assemblies)
        .where(sql`${assemblies.status} in ('PLANEJADA', 'EM_ANDAMENTO') and ${assemblies.dueDate} < ${hoje}::date`).limit(50),
      mtSoon: await tx.select({ id: assemblies.id, number: assemblies.number, name: assemblies.name, due: assemblies.dueDate }).from(assemblies)
        .where(sql`${assemblies.status} in ('PLANEJADA', 'EM_ANDAMENTO') and ${assemblies.dueDate} between ${hoje}::date and ${addDays(hoje, 7)}::date`).limit(50),
      mtNoAssembler: await tx.select({ id: assemblies.id, number: assemblies.number, n: sql<number>`count(*)::int` }).from(assemblyAreas).innerJoin(assemblies, eq(assemblies.id, assemblyAreas.assemblyId))
        .where(sql`${assemblyAreas.assemblerId} is null and ${assemblies.status} in ('PLANEJADA', 'EM_ANDAMENTO') and ${leafArea()}`).groupBy(assemblies.id, assemblies.number).limit(50),
      pvLate: await tx.select({ id: salesOrders.id, number: salesOrders.number, customer: partners.name, due: salesOrders.deliveryDate }).from(salesOrders)
        .innerJoin(partners, eq(partners.id, salesOrders.customerId)).where(sql`${salesOrders.status} in ('APROVADO', 'EM_PRODUCAO', 'PRONTO') and ${salesOrders.deliveryDate} < ${hoje}::date`).limit(50),
      pvNoOp: await tx.select({ id: salesOrders.id, number: salesOrders.number, customer: partners.name }).from(salesOrders).innerJoin(partners, eq(partners.id, salesOrders.customerId))
        .where(sql`${col(salesOrders.status)} = 'APROVADO' and exists (select 1 from ${salesOrderItems} join ${items} on ${col(items.id)} = ${col(salesOrderItems.itemId)}
          where ${col(salesOrderItems.orderId)} = ${col(salesOrders.id)} and ${col(items.type)} in ('PRODUTO_ACABADO', 'SEMIACABADO'))
          and not exists (select 1 from ${productionOrders} where ${col(productionOrders.salesOrderId)} = ${col(salesOrders.id)})`).limit(50),
      pvOld: await tx.select({ n: sql<number>`count(*)::int` }).from(salesOrders).where(sql`${salesOrders.status} = 'ORCAMENTO' and ${salesOrders.issueDate} < ${addDays(hoje, -15)}::date`),
      rcLate: await tx.select({ n: sql<number>`count(*)::int`, v: sql<string>`coalesce(sum(${receivables.amount}), 0)` }).from(receivables).where(sql`${receivables.paidAt} is null and ${receivables.dueDate} < ${hoje}::date`),
      rcWeek: await tx.select({ n: sql<number>`count(*)::int`, v: sql<string>`coalesce(sum(${receivables.amount}), 0)` }).from(receivables)
        .where(sql`${receivables.paidAt} is null and ${receivables.dueDate} between ${hoje}::date and ${addDays(hoje, 7)}::date`),
      kpi: (await tx.select({
        ops: sql<number>`(select count(*)::int from ${productionOrders} where ${col(productionOrders.finishedAt)} is null)`,
        pv: sql<string>`(select coalesce(sum(${col(salesOrders.total)}), 0) from ${salesOrders} where ${col(salesOrders.status)} in ('APROVADO', 'EM_PRODUCAO', 'PRONTO'))`,
        mt: sql<number>`(select count(*)::int from ${assemblies} where ${col(assemblies.status)} in ('PLANEJADA', 'EM_ANDAMENTO'))`,
        rc: sql<string>`(select coalesce(sum(${col(receivables.amount)}), 0) from ${receivables} where ${col(receivables.paidAt)} is null)`,
      }).from(sql`(select 1) as x`))[0],
    };
  });

  const names = (xs: string[], max = 4) => xs.slice(0, max).join(", ") + (xs.length > max ? ` e mais ${xs.length - max}` : "");
  const alerts: Alert[] = [];
  if (d.low.length) alerts.push({ area: "estoque", level: d.low.some((r) => Number(r.b) <= 0) ? "bad" : "warn", title: `${d.low.length} ${d.low.length === 1 ? "item abaixo" : "itens abaixo"} do estoque mínimo`, detail: names(d.low.map((r) => `${r.code} (${fmtQty(r.b)}/${fmtQty(r.min)} ${r.unit})`), 3), href: "/estoque?sit=baixo" });
  if (d.opShort.length) alerts.push({ area: "estoque", level: "bad", title: `Falta material em estoque para ${new Set(d.opShort.map((r) => r.id)).size} ${new Set(d.opShort.map((r) => r.id)).size === 1 ? "ordem" : "ordens"}`, detail: names([...new Set(d.opShort.map((r) => `${opNumber(r.number)}: ${r.code}`))], 3), href: `/producao/${d.opShort[0].id}` });
  if (d.opLate.length) alerts.push({ area: "producao", level: "bad", title: `${d.opLate.length} ${d.opLate.length === 1 ? "ordem de produção atrasada" : "ordens de produção atrasadas"}`, detail: names(d.opLate.map((r) => `${opNumber(r.number)} ${r.item} (prazo ${fmtDay(r.due)})`), 2), href: "/producao?ver=lista" });
  const byStatus = new Map<string, number[]>();
  for (const r of d.opFlag) byStatus.set(r.status, [...(byStatus.get(r.status) ?? []), r.number]);
  for (const [st, ns] of byStatus) alerts.push({ area: "producao", level: "warn", title: `${ns.length} ${ns.length === 1 ? "ordem" : "ordens"} com situação “${st}”`, detail: names(ns.map(opNumber)), href: "/producao" });
  if (d.opNoResp[0].n) alerts.push({ area: "producao", level: "warn", title: `${d.opNoResp[0].n} ${d.opNoResp[0].n === 1 ? "ordem sem responsável" : "ordens sem responsável"}`, href: "/producao?ver=lista" });
  if (d.mtLate.length) alerts.push({ area: "montagens", level: "bad", title: `${d.mtLate.length} ${d.mtLate.length === 1 ? "montagem com prazo vencido" : "montagens com prazo vencido"}`, detail: names(d.mtLate.map((r) => `${mtNumber(r.number)} ${r.name}`), 3), href: `/montagens/${d.mtLate[0].id}` });
  if (d.mtSoon.length) alerts.push({ area: "montagens", level: "warn", title: `${d.mtSoon.length} ${d.mtSoon.length === 1 ? "montagem vence" : "montagens vencem"} nos próximos 7 dias`, detail: names(d.mtSoon.map((r) => `${r.name} (${fmtDay(r.due)})`), 3), href: "/montagens" });
  if (d.mtNoAssembler.length) alerts.push({ area: "montagens", level: "warn", title: `${d.mtNoAssembler.reduce((a, r) => a + r.n, 0)} ambientes sem montador definido`, detail: names(d.mtNoAssembler.map((r) => mtNumber(r.number))), href: `/montagens/${d.mtNoAssembler[0].id}` });
  if (d.pvLate.length) alerts.push({ area: "comercial", level: "bad", title: `${d.pvLate.length} ${d.pvLate.length === 1 ? "pedido com entrega atrasada" : "pedidos com entrega atrasada"}`, detail: names(d.pvLate.map((r) => `${pvNumber(r.number)} ${r.customer}`), 3), href: "/comercial?situacao=abertos" });
  if (d.pvNoOp.length) alerts.push({ area: "comercial", level: "warn", title: `${d.pvNoOp.length} ${d.pvNoOp.length === 1 ? "pedido aprovado ainda sem ordem" : "pedidos aprovados ainda sem ordem"} de produção`, detail: names(d.pvNoOp.map((r) => `${pvNumber(r.number)} ${r.customer}`), 3), href: `/comercial/pedidos/${d.pvNoOp[0].id}` });
  if (d.pvOld[0].n) alerts.push({ area: "comercial", level: "warn", title: `${d.pvOld[0].n} ${d.pvOld[0].n === 1 ? "orçamento parado" : "orçamentos parados"} há mais de 15 dias`, href: "/comercial?situacao=ORCAMENTO" });
  if (d.rcLate[0].n) alerts.push({ area: "financeiro", level: "bad", title: `${d.rcLate[0].n} ${d.rcLate[0].n === 1 ? "parcela vencida" : "parcelas vencidas"}: ${fmtMoney(d.rcLate[0].v)}`, href: "/financeiro?ver=vencidas" });
  if (d.rcWeek[0].n) alerts.push({ area: "financeiro", level: "warn", title: `${fmtMoney(d.rcWeek[0].v)} a receber nos próximos 7 dias`, detail: `${d.rcWeek[0].n} parcelas`, href: "/financeiro?ver=semana" });

  const shown = AREAS.filter(([k]) => !filtro || k === filtro);
  const count = (a: Area) => alerts.filter((x) => x.area === a).length;
  return (
    <>
      {searchParams["sem-permissao"] && <div className="alert warn">Essa área é exclusiva dos administradores da empresa.</div>}
      <div className="ph"><div><h1>Olá, {s.user.name.split(" ")[0]}.</h1><p>{s.tenant.name} · principais indicadores e o que precisa de atenção hoje.</p></div>
        <div className="acts"><Link className="btn" href="/dashboards">Dashboards</Link><Link className="btn btn-primary" href="/comercial/pedidos/novo">Novo pedido</Link></div></div>
      <div className="kpis">
        <Link className="kpi" href="/producao"><b>{d.kpi.ops}</b><span>Ordens de produção em aberto</span></Link>
        <Link className={`kpi${d.opLate.length ? " kpi-bad" : ""}`} href="/producao?ver=lista"><b>{d.opLate.length}</b><span>Ordens atrasadas</span></Link>
        <Link className="kpi" href="/comercial?situacao=abertos"><b>{fmtMoney(d.kpi.pv)}</b><span>Pedidos a entregar</span></Link>
        <Link className="kpi" href="/montagens"><b>{d.kpi.mt}</b><span>Montagens em andamento</span></Link>
        <Link className={`kpi${d.low.length ? " kpi-warn" : ""}`} href="/estoque?sit=baixo"><b>{d.low.length}</b><span>Itens abaixo do mínimo</span></Link>
        <Link className="kpi" href="/financeiro"><b>{fmtMoney(d.kpi.rc)}</b><span>A receber</span></Link>
      </div>

      <section className="panel" aria-labelledby="alertas-h">
        <h2 id="alertas-h" className="panel-h-row">Alertas
          <nav className="chips in-panel" aria-label="Filtrar alertas por módulo">
            <Link href="/" aria-current={!filtro ? "true" : undefined} scroll={false}>Todos <span className="n">{alerts.length}</span></Link>
            {AREAS.map(([k, l]) => <Link key={k} href={`/?alertas=${k}`} aria-current={filtro === k ? "true" : undefined} scroll={false}>{l} <span className="n">{count(k)}</span></Link>)}
          </nav>
        </h2>
        <div className="alert-groups">
          {shown.map(([k, l]) => {
            const list = alerts.filter((x) => x.area === k);
            return (
              <div key={k} className="alert-group">
                <h3>{l}</h3>
                {list.length ? <ul className="alerts">{list.map((a, i) => (
                  <li key={i} className={a.level}><Link href={a.href}><b>{a.title}</b>{a.detail && <small>{a.detail}</small>}</Link></li>))}</ul>
                  : <p className="ok-line">Tudo em dia.</p>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel" style={{ marginTop: 18 }}>
        <h2 className="panel-h-row">Fluxo do sistema <Link className="btn btn-sm" href="/fluxo">Abrir em tela cheia</Link></h2>
        <div className="pb"><FlowDiagram /></div>
      </section>
    </>
  );
}
