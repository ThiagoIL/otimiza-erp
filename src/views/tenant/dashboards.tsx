import Link from "next/link";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { withTenant, type Tx } from "@/lib/db";
import {
  assemblies, assemblyAreas, assemblyPieces, itemGroups, items, partners, productionOrders, productionStages, receivables,
  salesOrders, stockBalances, stockMovements, teamMembers, workCenters,
} from "@/db/schema";
import { requireTenantUser } from "@/lib/context";
import { addDays, fmtDay, fmtMoney, fmtMoneyShort, fmtPct, fmtQty, monthKeys, movementOriginLabel, mtNumber, opNumber, salesStatusLabel, today } from "@/lib/format";
import { BarList, Columns } from "@/components/Charts";
import { progress } from "@/lib/assembly";
import { ensureSetup } from "@/server/stock";
import { leafArea } from "@/lib/sql";
import { col } from "@/lib/sql";

export const PANELS = [
  ["estoque", "Estoque"], ["producao", "Produção"], ["montagens", "Montagens"], ["comercial", "Comercial"], ["financeiro", "Financeiro"],
] as const;
type Panel = (typeof PANELS)[number][0];

const Card = ({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) => (
  <section className={`panel${wide ? " span2" : ""}`}><h2>{title}</h2><div className="pb">{children}</div></section>
);

export async function Dashboards({ searchParams }: { searchParams: Promise<{ painel?: string }> }) {
  const s = await requireTenantUser();
  const sp = await searchParams;
  const panel: Panel = PANELS.some(([k]) => k === sp.painel) ? (sp.painel as Panel) : "producao";
  const tid = s.tenant.id;
  const body = await withTenant(tid, async (tx) => {
    await ensureSetup(tx, tid);
    switch (panel) {
      case "estoque": return StockDash({ tx });
      case "producao": return ProductionDash({ tx });
      case "montagens": return AssemblyDash({ tx });
      case "comercial": return SalesDash({ tx });
      case "financeiro": return FinanceDash({ tx });
    }
  });
  return (
    <>
      <div className="ph"><div><h1>Dashboards</h1><p>Escolha qual painel quer acompanhar.</p></div></div>
      <nav className="chips" aria-label="Dashboards">{PANELS.map(([k, l]) => <Link key={k} href={`?painel=${k}`} aria-current={panel === k ? "true" : undefined}>{l}</Link>)}</nav>
      {body}
    </>
  );
}

// Os painéis abaixo são chamados como funções dentro da transação da empresa (withTenant) aberta acima:
// as consultas precisam terminar antes de a transação fechar.

async function StockDash({ tx }: { tx: Tx }) {
  const bal = sql<string>`coalesce((select sum(${col(stockBalances.quantity)}) from ${stockBalances} where ${col(stockBalances.itemId)} = ${col(items.id)}), 0)`;
  const [[k], byGroup, top, low, out] = [
    await tx.select({
      valor: sql<string>`coalesce(sum(${bal} * ${items.cost}), 0)`,
      itens: sql<number>`(count(*) filter (where ${bal} > 0))::int`,
      baixo: sql<number>`(count(*) filter (where ${items.minStock} > 0 and ${bal} < ${items.minStock}))::int`,
    }).from(items).where(eq(items.active, true)),
    await tx.select({ g: sql<string>`coalesce(${itemGroups.name}, 'Sem grupo')`, v: sql<string>`sum(${bal} * ${items.cost})` }).from(items)
      .leftJoin(itemGroups, eq(itemGroups.id, items.groupId)).where(eq(items.active, true)).groupBy(sql`1`).orderBy(desc(sql`2`)).limit(8),
    await tx.select({ id: items.id, code: items.code, name: items.name, v: sql<string>`${bal} * ${items.cost}` }).from(items).where(eq(items.active, true)).orderBy(desc(sql`${bal} * ${items.cost}`)).limit(8),
    await tx.select({ id: items.id, code: items.code, name: items.name, unit: items.unit, min: items.minStock, b: bal }).from(items)
      .where(and(eq(items.active, true), sql`${items.minStock} > 0 and ${bal} < ${items.minStock}`)).orderBy(asc(items.name)).limit(10),
    await tx.select({ o: stockMovements.origin, kind: stockMovements.kind, n: sql<number>`count(*)::int`, v: sql<string>`coalesce(sum(${stockMovements.quantity} * coalesce(${stockMovements.unitCost}, 0)), 0)` })
      .from(stockMovements).where(sql`${stockMovements.createdAt} >= now() - interval '30 days'`).groupBy(stockMovements.origin, stockMovements.kind),
  ];
  return (
    <>
      <div className="kpis">
        <div className="kpi"><b>{fmtMoney(k.valor)}</b><span>Valor em estoque</span></div>
        <div className="kpi"><b>{k.itens}</b><span>Itens com saldo</span></div>
        <Link className={`kpi${k.baixo ? " kpi-warn" : ""}`} href="/estoque?sit=baixo"><b>{k.baixo}</b><span>Abaixo do mínimo</span></Link>
        <div className="kpi"><b>{out.reduce((a, r) => a + r.n, 0)}</b><span>Movimentações em 30 dias</span></div>
      </div>
      <div className="dash">
        <Card title="Valor em estoque por grupo"><BarList data={byGroup.filter((r) => Number(r.v) > 0).map((r) => ({ label: r.g, value: Number(r.v), display: fmtMoneyShort(Number(r.v)) }))} /></Card>
        <Card title="Itens de maior valor em estoque"><BarList data={top.filter((r) => Number(r.v) > 0).map((r) => ({ label: r.code, value: Number(r.v), display: fmtMoneyShort(Number(r.v)), href: `/estoque/itens/${r.id}` }))} /></Card>
        <Card title="Movimentações dos últimos 30 dias (valor a custo)"><BarList data={out.map((r) => ({ label: `${r.kind === "ENTRADA" ? "Entrada" : "Saída"} · ${movementOriginLabel(r.o)}`, value: Number(r.v), display: `${fmtMoneyShort(Number(r.v))} · ${r.n}` }))} /></Card>
        <Card title="Abaixo do estoque mínimo">{low.length ? <div className="tbl solo"><table><thead><tr><th>Item</th><th className="num">Saldo</th><th className="num">Mínimo</th></tr></thead>
          <tbody>{low.map((r) => <tr key={r.id}><td><Link className="row-link" href={`/estoque/movimentar?tipo=ENTRADA&item=${r.id}`}>{r.code}</Link><small className="sub">{r.name}</small></td><td className="num late">{fmtQty(r.b)}</td><td className="num">{fmtQty(r.min)} {r.unit}</td></tr>)}</tbody></table></div>
          : <p className="muted chart-empty">Nenhum item abaixo do mínimo.</p>}</Card>
      </div>
    </>
  );
}

async function ProductionDash({ tx }: { tx: Tx }) {
  const hoje = today();
  const open = sql`${productionOrders.finishedAt} is null`;
  const [byStage, byCenter, byResp, weekly, late] = [
    await tx.select({ name: productionStages.name, n: sql<number>`count(${productionOrders.id})::int` }).from(productionStages)
      .leftJoin(productionOrders, eq(productionOrders.stageId, productionStages.id)).where(eq(productionStages.isFinal, false))
      .groupBy(productionStages.id, productionStages.name, productionStages.position).orderBy(asc(productionStages.position)),
    await tx.select({ name: sql<string>`coalesce(${workCenters.name}, 'Sem centro')`, n: sql<number>`count(*)::int` }).from(productionOrders)
      .leftJoin(workCenters, eq(workCenters.id, productionOrders.workCenterId)).where(open).groupBy(sql`1`).orderBy(desc(sql`2`)).limit(8),
    await tx.select({ name: sql<string>`coalesce(${teamMembers.name}, 'Sem responsável')`, n: sql<number>`count(*)::int` }).from(productionOrders)
      .leftJoin(teamMembers, eq(teamMembers.id, productionOrders.responsibleId)).where(open).groupBy(sql`1`).orderBy(desc(sql`2`)).limit(8),
    await tx.select({ w: sql<string>`to_char(date_trunc('week', ${productionOrders.finishedAt}), 'YYYY-MM-DD')`, n: sql<number>`count(*)::int` }).from(productionOrders)
      .where(sql`${productionOrders.finishedAt} >= date_trunc('week', now()) - interval '7 weeks'`).groupBy(sql`1`),
    await tx.select({ id: productionOrders.id, number: productionOrders.number, item: items.name, due: productionOrders.dueDate }).from(productionOrders)
      .innerJoin(items, eq(items.id, productionOrders.itemId)).where(and(open, sql`${productionOrders.dueDate} < ${hoje}::date`)).orderBy(asc(productionOrders.dueDate)).limit(10),
  ];
  // últimas 8 semanas, começando na segunda-feira
  const monday = (() => { const d = new Date(`${hoje}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); })();
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(monday, (i - 7) * 7));
  const total = byStage.reduce((a, r) => a + r.n, 0);
  return (
    <>
      <div className="kpis">
        <Link className="kpi" href="/producao"><b>{total}</b><span>Ordens em aberto</span></Link>
        <Link className={`kpi${late.length ? " kpi-bad" : ""}`} href="/producao?ver=lista"><b>{late.length}</b><span>Atrasadas</span></Link>
        <div className="kpi"><b>{weekly.find((w) => w.w === monday)?.n ?? 0}</b><span>Concluídas nesta semana</span></div>
        <div className="kpi"><b>{byResp.find((r) => r.name === "Sem responsável")?.n ?? 0}</b><span>Sem responsável</span></div>
      </div>
      <div className="dash">
        <Card title="Ordens em aberto por etapa"><BarList data={byStage.map((r) => ({ label: r.name, value: r.n }))} empty="Nenhuma ordem em aberto." /></Card>
        <Card title="Ordens concluídas por semana"><Columns label="Ordens concluídas por semana" data={weeks.map((w) => ({ label: fmtDay(w).slice(0, 5), value: weekly.find((x) => x.w === w)?.n ?? 0 }))} /></Card>
        <Card title="Carga por centro de trabalho"><BarList data={byCenter.map((r) => ({ label: r.name, value: r.n }))} empty="Nenhuma ordem em aberto." /></Card>
        <Card title="Carga por responsável"><BarList data={byResp.map((r) => ({ label: r.name, value: r.n }))} empty="Nenhuma ordem em aberto." /></Card>
        <Card title="Ordens atrasadas" wide>{late.length ? <div className="tbl solo"><table><thead><tr><th>OP</th><th>Produto</th><th>Prazo</th></tr></thead>
          <tbody>{late.map((r) => <tr key={r.id}><td><Link className="row-link" href={`/producao/${r.id}`}>{opNumber(r.number)}</Link></td><td>{r.item}</td><td className="late">{fmtDay(r.due)}</td></tr>)}</tbody></table></div>
          : <p className="muted chart-empty">Nenhuma ordem atrasada.</p>}</Card>
      </div>
    </>
  );
}

async function AssemblyDash({ tx }: { tx: Tx }) {
  const noChildren = leafArea();
  const pieces = (f: ReturnType<typeof sql>) => sql<number>`(select count(*)::int from ${assemblyPieces} join ${assemblyAreas} on ${col(assemblyAreas.id)} = ${col(assemblyPieces.areaId)} where ${col(assemblyAreas.assemblyId)} = ${col(assemblies.id)} and ${f})`;
  const [open, byAssembler, weekly, noAssembler] = [
    await tx.select({ id: assemblies.id, number: assemblies.number, name: assemblies.name, due: assemblies.dueDate, total: pieces(sql`true`), done: pieces(sql`${assemblyPieces.doneAt} is not null`) })
      .from(assemblies).where(sql`${assemblies.status} in ('PLANEJADA', 'EM_ANDAMENTO')`).orderBy(sql`${assemblies.dueDate} asc nulls last`).limit(12),
    await tx.select({ name: teamMembers.name, n: sql<number>`count(*)::int` }).from(assemblyPieces).innerJoin(assemblyAreas, eq(assemblyAreas.id, assemblyPieces.areaId))
      .innerJoin(teamMembers, eq(teamMembers.id, assemblyAreas.assemblerId)).where(sql`${assemblyPieces.doneAt} >= now() - interval '30 days'`).groupBy(teamMembers.name).orderBy(desc(sql`2`)).limit(8),
    await tx.select({ m: sql<string>`to_char(${assemblyPieces.doneAt}, 'YYYY-MM')`, n: sql<number>`count(*)::int` }).from(assemblyPieces).where(sql`${assemblyPieces.doneAt} is not null`).groupBy(sql`1`),
    await tx.select({ n: sql<number>`count(*)::int` }).from(assemblyAreas).innerJoin(assemblies, eq(assemblies.id, assemblyAreas.assemblyId))
      .where(sql`${assemblyAreas.assemblerId} is null and ${assemblies.status} in ('PLANEJADA', 'EM_ANDAMENTO') and ${noChildren}`),
  ];
  const hoje = today();
  return (
    <>
      <div className="kpis">
        <Link className="kpi" href="/montagens"><b>{open.length}</b><span>Montagens em aberto</span></Link>
        <div className={`kpi${open.some((a) => a.due && a.due < hoje) ? " kpi-bad" : ""}`}><b>{open.filter((a) => a.due && a.due < hoje).length}</b><span>Com prazo vencido</span></div>
        <div className="kpi"><b>{byAssembler.reduce((a, r) => a + r.n, 0)}</b><span>Peças montadas em 30 dias</span></div>
        <div className={`kpi${noAssembler[0].n ? " kpi-warn" : ""}`}><b>{noAssembler[0].n}</b><span>Ambientes sem montador</span></div>
      </div>
      <div className="dash">
        <Card title="Andamento das montagens em aberto" wide><BarList data={open.map((a) => ({ label: `${mtNumber(a.number)} ${a.name}`, value: progress(a.done, a.total) * 100, display: `${fmtPct(progress(a.done, a.total))} · ${a.done}/${a.total}`, href: `/montagens/${a.id}` }))} empty="Nenhuma montagem em aberto." /></Card>
        <Card title="Peças montadas por mês"><Columns label="Peças montadas por mês" data={monthKeys(-5, 0).map((m) => ({ label: m.label, value: weekly.find((w) => w.m === m.key)?.n ?? 0 }))} /></Card>
        <Card title="Peças montadas por montador (30 dias)"><BarList data={byAssembler.map((r) => ({ label: r.name, value: r.n }))} /></Card>
      </div>
    </>
  );
}

async function SalesDash({ tx }: { tx: Tx }) {
  const valid = sql`${salesOrders.status} not in ('ORCAMENTO', 'CANCELADO')`;
  const months = monthKeys(-5, 0);
  const [monthly, topCustomers, byStatus, [k]] = [
    await tx.select({ m: sql<string>`to_char(${salesOrders.issueDate}, 'YYYY-MM')`, v: sql<string>`sum(${salesOrders.total})` }).from(salesOrders)
      .where(and(valid, sql`${salesOrders.issueDate} >= ${months[0].key + "-01"}::date`)).groupBy(sql`1`),
    await tx.select({ id: partners.id, name: partners.name, v: sql<string>`sum(${salesOrders.total})` }).from(salesOrders).innerJoin(partners, eq(partners.id, salesOrders.customerId))
      .where(and(valid, sql`${salesOrders.issueDate} >= current_date - interval '12 months'`)).groupBy(partners.id, partners.name).orderBy(desc(sql`3`)).limit(8),
    await tx.select({ st: salesOrders.status, n: sql<number>`count(*)::int`, v: sql<string>`sum(${salesOrders.total})` }).from(salesOrders).groupBy(salesOrders.status),
    await tx.select({
      ticket: sql<string>`coalesce(avg(${salesOrders.total}) filter (where ${valid}), 0)`,
      conv: sql<string>`coalesce((count(*) filter (where ${valid}))::numeric / nullif(count(*) filter (where ${salesOrders.status} <> 'CANCELADO'), 0), 0)`,
    }).from(salesOrders).where(sql`${salesOrders.issueDate} >= current_date - interval '90 days'`),
  ];
  const mes = Number(monthly.find((r) => r.m === months[5].key)?.v ?? 0);
  return (
    <>
      <div className="kpis">
        <div className="kpi"><b>{fmtMoney(mes)}</b><span>Vendido no mês</span></div>
        <div className="kpi"><b>{fmtMoney(k.ticket)}</b><span>Ticket médio (90 dias)</span></div>
        <div className="kpi"><b>{fmtPct(Number(k.conv))}</b><span>Orçamentos aprovados (90 dias)</span></div>
        <Link className="kpi" href="/comercial?situacao=ORCAMENTO"><b>{byStatus.find((r) => r.st === "ORCAMENTO")?.n ?? 0}</b><span>Orçamentos em aberto</span></Link>
      </div>
      <div className="dash">
        <Card title="Vendas por mês"><Columns label="Vendas por mês" data={months.map((m) => { const v = Number(monthly.find((r) => r.m === m.key)?.v ?? 0); return { label: m.label, value: v, display: fmtMoneyShort(v) }; })} /></Card>
        <Card title="Maiores clientes (12 meses)"><BarList data={topCustomers.map((r) => ({ label: r.name, value: Number(r.v), display: fmtMoneyShort(Number(r.v)), href: `/comercial/cadastros/${r.id}` }))} /></Card>
        <Card title="Pedidos por situação" wide><BarList data={byStatus.map((r) => ({ label: salesStatusLabel(r.st), value: Number(r.v), display: `${fmtMoneyShort(Number(r.v))} · ${r.n} ${r.n === 1 ? "pedido" : "pedidos"}`, href: `/comercial?situacao=${r.st}` }))} /></Card>
      </div>
    </>
  );
}

async function FinanceDash({ tx }: { tx: Tx }) {
  const hoje = today();
  const next = monthKeys(0, 5), past = monthKeys(-5, 0);
  const [due, paid, overdue] = [
    await tx.select({ m: sql<string>`to_char(${receivables.dueDate}, 'YYYY-MM')`, v: sql<string>`sum(${receivables.amount})` }).from(receivables)
      .where(sql`${receivables.paidAt} is null and ${receivables.dueDate} >= ${hoje}::date`).groupBy(sql`1`),
    await tx.select({ m: sql<string>`to_char(${receivables.paidAt}, 'YYYY-MM')`, v: sql<string>`sum(${receivables.amount})` }).from(receivables)
      .where(sql`${receivables.paidAt} >= ${past[0].key + "-01"}::date`).groupBy(sql`1`),
    await tx.select({ id: partners.id, name: partners.name, v: sql<string>`sum(${receivables.amount})` }).from(receivables).innerJoin(partners, eq(partners.id, receivables.customerId))
      .where(sql`${receivables.paidAt} is null and ${receivables.dueDate} < ${hoje}::date`).groupBy(partners.id, partners.name).orderBy(desc(sql`3`)).limit(8),
  ];
  const sum = (rows: { v: string }[]) => rows.reduce((a, r) => a + Number(r.v), 0);
  return (
    <>
      <div className="kpis">
        <Link className="kpi" href="/financeiro"><b>{fmtMoney(sum(due) + sum(overdue))}</b><span>Total a receber</span></Link>
        <Link className={`kpi${overdue.length ? " kpi-bad" : ""}`} href="/financeiro?ver=vencidas"><b>{fmtMoney(sum(overdue))}</b><span>Vencido</span></Link>
        <div className="kpi"><b>{fmtMoney(Number(paid.find((r) => r.m === past[5].key)?.v ?? 0))}</b><span>Recebido no mês</span></div>
        <Link className="kpi" href="/financeiro/escopo"><b>Em breve</b><span>Contas a pagar e fluxo de caixa</span></Link>
      </div>
      <div className="dash">
        <Card title="A receber nos próximos meses"><Columns label="A receber por mês" data={next.map((m) => { const v = Number(due.find((r) => r.m === m.key)?.v ?? 0); return { label: m.label, value: v, display: fmtMoneyShort(v) }; })} /></Card>
        <Card title="Recebido por mês"><Columns label="Recebido por mês" data={past.map((m) => { const v = Number(paid.find((r) => r.m === m.key)?.v ?? 0); return { label: m.label, value: v, display: fmtMoneyShort(v) }; })} /></Card>
        <Card title="Clientes com parcelas vencidas" wide><BarList tone="bad" data={overdue.map((r) => ({ label: r.name, value: Number(r.v), display: fmtMoney(r.v), href: `/financeiro?ver=vencidas&q=${encodeURIComponent(r.name)}` }))} empty="Nenhuma parcela vencida." /></Card>
      </div>
    </>
  );
}
