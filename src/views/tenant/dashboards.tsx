import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { page, type PageCtx } from "@/lib/access";
import * as E from "@/db/erp";
import { Kpi, PageHead, Panel } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { Donut, HBars, kfmt, PAL, VBars } from "@/components/Charts";
import { avgCosts, balances, balanceOf } from "@/server/common";
import { accountBalances, weeklyFlow } from "@/server/finance-queries";
import { addDays, diffDays, fmtD, fmtDM, today } from "@/lib/dates";
import { fmtMoney } from "@/lib/format";
import { SO_STATUS } from "@/lib/consts";
import type { ModuleKey } from "@/lib/modules";

type SP = Record<string, string | undefined>;
type Ctx = { P: number; ini: string; hoje: string; labels: string[]; NW: number; put: (a: number[], d: string | null | undefined, v: number) => void; arr: () => number[] };
const N = (v: unknown) => Number(v ?? 0);
const fmt0 = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

export async function DashboardsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await page("dash");
  const sp = await searchParams;
  const P = [30, 90, 180].includes(Number(sp.p)) ? Number(sp.p) : 90;
  const tabs = ([["producao", "Produção", "factory"], ["estoque", "Estoque", "box"], ["comercial", "Comercial", "partner"], ["financeiro", "Financeiro", "money"]] as const)
    .filter(([k]) => s.access.mods[k as ModuleKey] !== "nenhum");
  const tab = tabs.find(([k]) => k === sp.t)?.[0] ?? tabs[0]?.[0] ?? "producao";
  const hoje = today(), ini = addDays(hoje, -P + 1), NW = Math.ceil(P / 7);
  const labels: string[] = []; for (let k = NW - 1; k >= 0; k--) labels.push(fmtDM(addDays(hoje, -7 * k - 6)));
  const ctx: Ctx = { P, ini, hoje, labels, NW, arr: () => new Array(NW).fill(0), put: (a, d, v) => { if (!d) return; const k = Math.floor(diffDays(d, hoje) / 7); if (k >= 0 && k < NW) a[NW - 1 - k] += v; } };
  const link = (o: Partial<{ p: number; t: string }>) => `/dashboards?${new URLSearchParams({ p: String(o.p ?? P), t: o.t ?? tab })}`;
  return (
    <>
      <PageHead title="Dashboards" sub="Escolha a área e o período. Os números são calculados a partir dos lançamentos do sistema."
        actions={<div className="tabs" role="group" aria-label="Período">{[30, 90, 180].map((p) => <Link key={p} className="btn btn-ghost btn-sm" href={link({ p })} style={P === p ? { background: "var(--surface)", fontWeight: 700 } : undefined}>{p} dias</Link>)}</div>} />
      <nav className="dash-pick" aria-label="Escolher dashboard">
        {tabs.map(([k, l, ic]) => <Link key={k} href={link({ t: k })} aria-pressed={tab === k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", border: "1px solid var(--line)", borderRadius: "var(--r-lg)", background: tab === k ? "var(--steel)" : "var(--surface)", color: tab === k ? "#fff" : "var(--ink-2)", fontWeight: 700, fontSize: 14.5, textDecoration: "none" }}><Icon name={ic} size={17} />{l}</Link>)}
      </nav>
      {tab === "producao" ? await dashProd(s, ctx) : tab === "estoque" ? await dashEst(s, ctx) : tab === "comercial" ? await dashCom(s, ctx) : await dashFin(s, ctx)}
    </>
  );
}

async function dashProd(s: PageCtx, c: Ctx) {
  const d = await s.tx(async (tx) => ({
    ops: await tx.select({ o: E.productionOrders, kind: E.productionStages.kind, st: E.productionStages.name, color: E.productionStages.color, stageId: E.productionStages.id, wc: E.workCenters.name, wcap: E.workCenters.capacityHours, resp: E.teamMembers.name })
      .from(E.productionOrders).innerJoin(E.productionStages, eq(E.productionStages.id, E.productionOrders.stageId)).leftJoin(E.workCenters, eq(E.workCenters.id, E.productionOrders.workCenterId)).leftJoin(E.teamMembers, eq(E.teamMembers.id, E.productionOrders.responsibleId)),
    stages: await tx.select().from(E.productionStages).orderBy(E.productionStages.position),
    times: await tx.select({ t: E.timeEntries, wc: E.workCenters.name, cost: E.workCenters.costPerHour, p: E.teamMembers.name }).from(E.timeEntries).leftJoin(E.workCenters, eq(E.workCenters.id, E.timeEntries.workCenterId))
      .innerJoin(E.teamMembers, eq(E.teamMembers.id, E.timeEntries.memberId)).where(sql`${E.timeEntries.date} >= ${c.ini} and ${E.timeEntries.end} is not null`),
    asm: await tx.select({ a: E.assemblies, tot: sql<string>`(select coalesce(sum(qty),0)::text from assembly_parts p where p.assembly_id = "assemblies"."id")`, done: sql<string>`(select coalesce(sum(least(qty_done, qty)),0)::text from assembly_parts p where p.assembly_id = "assemblies"."id")` })
      .from(E.assemblies).where(sql`${E.assemblies.completedAt} is null`),
  }));
  const open = d.ops.filter((o) => o.kind !== "finalizada" && o.kind !== "cancelada");
  const done = d.ops.filter((o) => o.kind === "finalizada" && o.o.completedAt && o.o.completedAt >= c.ini);
  const onTime = (o: (typeof done)[number]) => !o.o.needDate || o.o.completedAt! <= o.o.needDate;
  const pont = done.length ? (done.filter(onTime).length / done.length) * 100 : null;
  const leads = done.map((o) => diffDays(o.o.createdAt.toISOString().slice(0, 10), o.o.completedAt!));
  const lead = leads.length ? leads.reduce((a, b) => a + b, 0) / leads.length : null;
  const okA = c.arr(), lateA = c.arr(); done.forEach((o) => c.put(onTime(o) ? okA : lateA, o.o.completedAt, 1));
  const byStage = d.stages.filter((x) => x.kind !== "finalizada" && x.kind !== "cancelada").map((x) => ({ l: x.name, v: open.filter((o) => o.stageId === x.id).length, c: x.color }));
  const group = <T,>(arr: T[], key: (x: T) => string | null, val: (x: T) => number) => { const m = new Map<string, number>(); for (const x of arr) { const k = key(x); if (k) m.set(k, (m.get(k) ?? 0) + val(x)); } return [...m].sort((a, b) => b[1] - a[1]); };
  const H = d.times.reduce((a, x) => a + N(x.t.hours), 0);
  return (
    <>
      <div className="kpis k6"><Kpi value={done.length} label="OPs concluídas" /><Kpi value={pont == null ? "—" : `${fmt0(pont)}%`} label="Entregues no prazo" alert={pont != null && pont < 80} /><Kpi value={lead == null ? "—" : `${fmt0(lead)} dias`} label="Tempo médio de uma OP" />
        <Kpi value={open.length} label="OPs em aberto" /><Kpi value={d.asm.length} label="Montagens em andamento" /><Kpi value={`${fmt0(H)} h`} label="Horas apontadas" /></div>
      <div className="dgrid">
        <Panel title="OPs concluídas por semana"><div className="pb"><VBars labels={c.labels} sets={[{ n: "No prazo", c: "#3F7D57", v: okA }, { n: "Com atraso", c: "#B3261E", v: lateA }]} stack int fmt={fmt0} /></div></Panel>
        <Panel title="OPs em aberto por etapa" sub={`${open.length} OPs`}><div className="pb"><HBars rows={byStage} /></div></Panel>
        <Panel title="Carga por centro de trabalho" sub="OPs em aberto"><div className="pb"><HBars rows={group(open, (o) => o.wc, () => 1).map(([l, v]) => ({ l, v, c: "#3F7D57" }))} /></div></Panel>
        <Panel title="OPs em aberto por responsável"><div className="pb"><HBars rows={group(open, (o) => o.resp, () => 1).map(([l, v]) => ({ l, v, c: "#1E3A5F" }))} /></div></Panel>
        <Panel title="Horas apontadas por centro" sub="no período"><div className="pb"><HBars fmt={(v) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`} rows={group(d.times, (x) => x.wc, (x) => N(x.t.hours)).map(([l, v]) => ({ l, v, c: "#3F7D57", sub: s.access.costs ? fmtMoney(d.times.filter((x) => x.wc === l).reduce((a, x) => a + N(x.t.hours) * N(x.cost), 0)) : undefined }))} /></div></Panel>
        <Panel title="Horas apontadas por pessoa" sub="no período"><div className="pb"><HBars fmt={(v) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`} rows={group(d.times, (x) => x.p, (x) => N(x.t.hours)).map(([l, v]) => ({ l, v, c: "#1E3A5F" }))} /></div></Panel>
        <Panel className="span2" title="Andamento das montagens" sub="% de peças montadas"><div className="pb"><HBars fmt={(v) => `${v}%`} rows={d.asm.map((x) => { const t = N(x.tot), m = N(x.done); const late = !!x.a.dueDate && x.a.dueDate < c.hoje; return { l: x.a.name, v: t ? Math.round((m / t) * 100) : 0, c: late ? "#B3261E" : "#1E3A5F", sub: `${fmt0(m)} de ${fmt0(t)} peças · previsão ${fmtD(x.a.dueDate)}` }; }).sort((a, b) => b.v - a.v)} /></div></Panel>
      </div>
    </>
  );
}

async function dashEst(s: PageCtx, c: Ctx) {
  const d = await s.tx(async (tx) => {
    const items = await tx.select({ i: E.items, g: E.itemGroups.name }).from(E.items).leftJoin(E.itemGroups, eq(E.itemGroups.id, E.items.groupId)).where(eq(E.items.active, true));
    const ids = items.map((x) => x.i.id);
    const [bal, cost] = await Promise.all([balances(tx, { itemIds: ids }), avgCosts(tx, ids)]);
    const mv = await tx.select().from(E.stockMovements).where(sql`${E.stockMovements.date} >= ${c.ini}`);
    const buys = await tx.select({ f: sql<string>`coalesce(${E.partners.tradeName}, ${E.partners.name})`, v: sql<string>`sum(${E.purchaseOrders.total})::text` }).from(E.purchaseOrders).innerJoin(E.partners, eq(E.partners.id, E.purchaseOrders.partnerId))
      .where(sql`${E.purchaseOrders.status} <> 'CANCELADO' and ${E.purchaseOrders.issueDate} >= ${c.ini}`).groupBy(sql`1`);
    const [{ open }] = await tx.select({ open: sql<number>`count(*)::int` }).from(E.purchaseOrders).where(sql`${E.purchaseOrders.status} in ('ENVIADO','RECEBIDO_PARCIAL')`);
    return { items, bal, cost, mv, buys, open };
  });
  const val = (m: typeof d.mv[number]) => Math.abs(N(m.qty) * N(m.unitCost));
  const ent = d.mv.filter((m) => m.type === "ENTRADA").reduce((a, m) => a + val(m), 0);
  const sai = d.mv.filter((m) => m.type === "SAIDA").reduce((a, m) => a + val(m), 0);
  const cons = d.mv.filter((m) => m.type === "SAIDA" && m.productionOrderId).reduce((a, m) => a + val(m), 0);
  const eA = c.arr(), sA = c.arr(); d.mv.forEach((m) => { if (m.type === "ENTRADA") c.put(eA, m.date, val(m)); else if (m.type === "SAIDA") c.put(sA, m.date, val(m)); });
  const byG = new Map<string, number>(); let total = 0; let below = 0;
  const top = d.items.map(({ i, g }) => { const q = balanceOf(d.bal, i.id); const v = Math.max(0, q) * (d.cost.get(i.id) ?? 0); total += v; byG.set(g ?? "Sem grupo", (byG.get(g ?? "Sem grupo") ?? 0) + v); if (N(i.minStock) > 0 && q < N(i.minStock)) below++; return { i, q, v }; }).filter((x) => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 8);
  return (
    <>
      <div className="kpis k6"><Kpi value={kfmt(total)} label="Valor em estoque (R$)" /><Kpi value={below} label="Itens abaixo do mínimo" alert={below > 0} /><Kpi value={kfmt(ent)} label="Entradas (R$)" /><Kpi value={kfmt(sai)} label="Saídas (R$)" /><Kpi value={kfmt(cons)} label="Consumo em OPs (R$)" /><Kpi value={d.open} label="Compras a receber" /></div>
      <div className="dgrid">
        <Panel title="Entradas e saídas por semana" sub="em R$"><div className="pb"><VBars labels={c.labels} sets={[{ n: "Entradas", c: "#1F7A8C", v: eA }, { n: "Saídas", c: "#E0601A", v: sA }]} /></div></Panel>
        <Panel title="Valor em estoque por grupo"><div className="pb"><Donut fmt={fmtMoney} rows={[...byG].sort((a, b) => b[1] - a[1]).map(([l, v], i) => ({ l, v, c: PAL[i % PAL.length] }))} /></div></Panel>
        <Panel title="Compras por fornecedor" sub="em R$ no período"><div className="pb"><HBars fmt={kfmt} rows={d.buys.map((b) => ({ l: b.f, v: N(b.v), c: "#9A3B32" })).sort((a, b) => b.v - a.v)} /></div></Panel>
        <Panel title="Itens com maior valor em estoque"><div className="tbl solo" style={{ border: 0, borderRadius: 0, maxHeight: "none" }}>{top.length ? <table><thead><tr><th>Descrição</th><th className="num">Quantidade</th><th className="num">Valor</th></tr></thead>
          <tbody>{top.map((x) => <tr key={x.i.id}><td className="desc" style={{ minWidth: 200 }}>{x.i.name}</td><td className="num">{x.q.toLocaleString("pt-BR")} {x.i.unit}</td><td className="num"><b>{fmtMoney(x.v)}</b></td></tr>)}</tbody></table> : <div className="chart-empty">Sem saldo em estoque.</div>}</div></Panel>
      </div>
    </>
  );
}

async function dashCom(s: PageCtx, c: Ctx) {
  const d = await s.tx(async (tx) => ({
    so: await tx.select({ o: E.salesOrders, cli: sql<string>`coalesce(${E.partners.tradeName}, ${E.partners.name})` }).from(E.salesOrders).innerJoin(E.partners, eq(E.partners.id, E.salesOrders.partnerId)),
    nf: await tx.select().from(E.invoices).where(sql`${E.invoices.status} = 'EMITIDA' and ${E.invoices.issueDate} >= ${c.ini}`),
    prod: await tx.select({ n: E.items.name, q: sql<string>`sum(${E.salesOrderItems.qty})::text` }).from(E.salesOrderItems).innerJoin(E.salesOrders, eq(E.salesOrders.id, E.salesOrderItems.orderId)).innerJoin(E.items, eq(E.items.id, E.salesOrderItems.itemId))
      .where(sql`${E.salesOrders.status} in ('APROVADO','FATURADO') and ${E.salesOrders.issueDate} >= ${c.ini}`).groupBy(E.items.name),
    deals: await tx.select({ v: E.crmDeals.value, k: E.crmStages.kind, st: E.crmStages.name, col: E.crmStages.color }).from(E.crmDeals).innerJoin(E.crmStages, eq(E.crmStages.id, E.crmDeals.stageId)),
  }));
  const fechado = (s0: string) => s0 === "APROVADO" || s0 === "FATURADO";
  const vend = d.so.filter((x) => fechado(x.o.status) && x.o.issueDate >= c.ini);
  const tot = vend.reduce((a, x) => a + N(x.o.total), 0);
  const fatT = d.nf.reduce((a, n) => a + N(n.total), 0);
  const props = d.so.filter((x) => x.o.status === "PROPOSTA");
  const emP = d.so.filter((x) => x.o.issueDate >= c.ini && x.o.status !== "CANCELADO");
  const conv = emP.length ? (emP.filter((x) => fechado(x.o.status)).length / emP.length) * 100 : null;
  const vA = c.arr(), fA = c.arr(); vend.forEach((x) => c.put(vA, x.o.issueDate, N(x.o.total))); d.nf.forEach((n) => c.put(fA, n.issueDate, N(n.total)));
  const byCli = new Map<string, number>(); vend.forEach((x) => byCli.set(x.cli, (byCli.get(x.cli) ?? 0) + N(x.o.total)));
  const funnel = new Map<string, { v: number; c: string }>(); d.deals.filter((x) => x.k === "aberta").forEach((x) => { const f = funnel.get(x.st) ?? { v: 0, c: x.col }; f.v += N(x.v); funnel.set(x.st, f); });
  return (
    <>
      <div className="kpis k6"><Kpi value={kfmt(tot)} label="Vendas no período (R$)" /><Kpi value={vend.length} label="Pedidos fechados" /><Kpi value={vend.length ? kfmt(tot / vend.length) : "—"} label="Ticket médio (R$)" />
        <Kpi value={kfmt(fatT)} label="Faturado (R$)" /><Kpi value={kfmt(props.reduce((a, x) => a + N(x.o.total), 0))} label="Propostas em aberto (R$)" /><Kpi value={conv == null ? "—" : `${fmt0(conv)}%`} label="Propostas convertidas" /></div>
      <div className="dgrid">
        <Panel title="Vendas e faturamento por semana" sub="em R$"><div className="pb"><VBars labels={c.labels} sets={[{ n: "Pedidos fechados", c: "#1E3A5F", v: vA }, { n: "Faturado", c: "#2E7D4F", v: fA }]} /></div></Panel>
        <Panel title="Pedidos por situação" sub="todos os pedidos"><div className="pb"><HBars rows={Object.entries(SO_STATUS).map(([k, x]) => ({ l: x.label, v: d.so.filter((y) => y.o.status === k).length, c: x.color }))} /></div></Panel>
        <Panel title="Clientes que mais compraram" sub="em R$ no período"><div className="pb"><HBars fmt={kfmt} rows={[...byCli].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([l, v]) => ({ l, v, c: "#1E3A5F" }))} /></div></Panel>
        <Panel title="Produtos mais vendidos" sub="quantidade no período"><div className="pb"><HBars rows={d.prod.map((p) => ({ l: p.n, v: N(p.q), c: "#3F7D57" })).sort((a, b) => b.v - a.v).slice(0, 7)} /></div></Panel>
        <Panel className="span2" title="Funil do CRM" sub="valor das oportunidades em aberto por etapa"><div className="pb"><HBars fmt={kfmt} rows={[...funnel].map(([l, x]) => ({ l, v: x.v, c: x.c }))} /></div></Panel>
      </div>
    </>
  );
}

async function dashFin(s: PageCtx, c: Ctx) {
  const d = await s.tx(async (tx) => ({
    paid: await tx.select({ t: E.finTitles, cat: E.finCategories.name }).from(E.finTitles).leftJoin(E.finCategories, eq(E.finCategories.id, E.finTitles.categoryId)).where(sql`${E.finTitles.status} = 'PAGO' and ${E.finTitles.paidAt} >= ${c.ini}`),
    open: await tx.select({ t: E.finTitles, p: sql<string | null>`coalesce(${E.partners.tradeName}, ${E.partners.name})` }).from(E.finTitles).leftJoin(E.partners, eq(E.partners.id, E.finTitles.partnerId)).where(eq(E.finTitles.status, "ABERTO")),
    accs: await accountBalances(tx), flow: await weeklyFlow(tx, 8),
  }));
  const amt = (t: { paidAmount: string | null; amount: string }) => N(t.paidAmount ?? t.amount);
  const rec = d.paid.filter((x) => x.t.kind === "RECEBER").reduce((a, x) => a + amt(x.t), 0);
  const pag = d.paid.filter((x) => x.t.kind === "PAGAR").reduce((a, x) => a + amt(x.t), 0);
  const vencR = d.open.filter((x) => x.t.kind === "RECEBER" && x.t.dueDate < c.hoje).reduce((a, x) => a + N(x.t.amount), 0);
  const p30 = d.open.filter((x) => x.t.kind === "PAGAR" && x.t.dueDate <= addDays(c.hoje, 30)).reduce((a, x) => a + N(x.t.amount), 0);
  const rA = c.arr(), pA = c.arr(); d.paid.forEach((x) => c.put(x.t.kind === "RECEBER" ? rA : pA, x.t.paidAt, amt(x.t)));
  const cats = new Map<string, number>(); d.paid.filter((x) => x.t.kind === "PAGAR").forEach((x) => cats.set(x.cat ?? "Sem categoria", (cats.get(x.cat ?? "Sem categoria") ?? 0) + amt(x.t)));
  const abR = new Map<string, number>(); d.open.filter((x) => x.t.kind === "RECEBER").forEach((x) => abR.set(x.p ?? "Sem cliente", (abR.get(x.p ?? "Sem cliente") ?? 0) + N(x.t.amount)));
  const saldo = d.accs.filter((a) => a.active).reduce((a, x) => a + x.balance, 0);
  return (
    <>
      <div className="kpis k6"><Kpi value={kfmt(saldo)} label="Saldo em contas (R$)" /><Kpi value={kfmt(rec)} label="Recebido (R$)" /><Kpi value={kfmt(pag)} label="Pago (R$)" /><Kpi value={kfmt(rec - pag)} label="Resultado do período (R$)" alert={rec - pag < 0} />
        <Kpi value={kfmt(vencR)} label="A receber vencido (R$)" alert={vencR > 0} /><Kpi value={kfmt(p30)} label="A pagar em 30 dias (R$)" /></div>
      <div className="dgrid">
        <Panel title="Recebimentos e pagamentos por semana" sub="realizado, em R$"><div className="pb"><VBars labels={c.labels} sets={[{ n: "Recebido", c: "#2E7D4F", v: rA }, { n: "Pago", c: "#B3261E", v: pA }]} /></div></Panel>
        <Panel title="Despesas pagas por categoria"><div className="pb"><Donut fmt={fmtMoney} rows={[...cats].sort((a, b) => b[1] - a[1]).map(([l, v], i) => ({ l, v, c: PAL[i % PAL.length] }))} /></div></Panel>
        <Panel title="Maiores saldos a receber" sub="em aberto, R$"><div className="pb"><HBars fmt={kfmt} rows={[...abR].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([l, v]) => ({ l, v, c: "#1F7A8C" }))} /></div></Panel>
        <Panel title="Próximas 8 semanas" sub="previsto"><div className="pb"><table className="fl-tab"><thead><tr><th>Semana</th><th className="num">Entradas</th><th className="num">Saídas</th><th className="num">Saldo projetado</th></tr></thead>
          <tbody>{d.flow.weeks.map((w, i) => <tr key={i}><td>{fmtDM(w.ini)} a {fmtDM(w.fim)}</td><td className="num t-ok">{fmtMoney(w.e)}</td><td className="num t-bad">{fmtMoney(w.s)}</td><td className="num"><b className={w.saldo < 0 ? "t-bad" : ""}>{fmtMoney(w.saldo)}</b></td></tr>)}</tbody></table></div></Panel>
      </div>
    </>
  );
}
