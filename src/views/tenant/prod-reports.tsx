import Link from "next/link";
import { asc, eq, gte, lte, sql, and } from "drizzle-orm";
import { page } from "@/lib/access";
import * as E from "@/db/erp";
import { Empty, Kpi, PageHead, Panel } from "@/components/ui";
import { FilterBar, FilterTabs } from "@/components/client";
import { Sel } from "@/components/SearchPicker";
import { Icon } from "@/components/Icon";
import { HBars, VBars } from "@/components/Charts";
import { PrintButton } from "@/components/PrintButton";
import { opUnitWeights } from "@/server/production-common";
import { fmtMoney, fmtQty } from "@/lib/format";
import { addDays, diffDays, fmtD, fmtDM, isDate, today } from "@/lib/dates";

type SP = Record<string, string | undefined>;
const N = (v: unknown) => Number(v ?? 0);
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const kg = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: v >= 100 ? 0 : 1 })} kg`;
const h1 = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
const pctOf = (a: number, b: number) => (b > 0 ? Math.min(100, (a / b) * 100) : 0);

// =====================================================================================
// Acompanhamento de obras: medição → produção → montagem, por obra e cliente
// =====================================================================================
type Work = {
  key: string; href: string; title: string; client: string | null; kind: string; due: string | null;
  meas: { done: number; tot: number } | null; prod: { done: number; tot: number }; asm: { done: number; tot: number } | null; ops: number; late: boolean;
};

export async function WorksPage({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await page("producao");
  const sp = await searchParams;
  const d = await s.tx(async (tx) => {
    const cliOf = sql<string | null>`(select coalesce(p.trade_name, p.name) from partners p where p.id = `;
    const meas = await tx.select({ m: E.measurements, cli: sql<string | null>`${cliOf}"measurements"."partner_id")`,
      tot: sql<number>`(select count(*)::int from measurement_items i where i.measurement_id = "measurements"."id")`,
      done: sql<number>`(select count(*)::int from measurement_items i where i.measurement_id = "measurements"."id" and i.measured)` })
      .from(E.measurements).where(sql`${E.measurements.status} <> 'CANCELADA'`);
    const ops = await tx.select({ o: E.productionOrders, kind: E.productionStages.kind, cli: sql<string | null>`${cliOf}"production_orders"."partner_id")`,
      aTot: sql<string>`(select coalesce(sum(p.qty),0)::text from assembly_parts p join assemblies a on a.id = p.assembly_id where a.production_order_id = "production_orders"."id")`,
      aDone: sql<string>`(select coalesce(sum(least(p.qty_done, p.qty)),0)::text from assembly_parts p join assemblies a on a.id = p.assembly_id where a.production_order_id = "production_orders"."id")` })
      .from(E.productionOrders).innerJoin(E.productionStages, eq(E.productionStages.id, E.productionOrders.stageId)).where(sql`${E.productionStages.kind} <> 'cancelada'`);
    const soIds = [...new Set(ops.map((x) => x.o.salesOrderId).filter(Boolean) as string[])];
    const sos = soIds.length ? await tx.select({ o: E.salesOrders, cli: sql<string | null>`${cliOf}"sales_orders"."partner_id")` }).from(E.salesOrders).where(sql`${E.salesOrders.id} in (${sql.join(soIds.map((i) => sql`${i}`), sql`, `)})`) : [];
    return { meas, ops, sos };
  });
  const hoje = today();
  const works: Work[] = [];
  const prodOf = (list: typeof d.ops) => ({ done: list.reduce((a, x) => a + Math.min(N(x.o.qtyProduced), N(x.o.qty)), 0), tot: list.reduce((a, x) => a + N(x.o.qty), 0) });
  const asmOf = (list: typeof d.ops) => ({ done: list.reduce((a, x) => a + N(x.aDone), 0), tot: list.reduce((a, x) => a + N(x.o.qty), 0) });
  const used = new Set<string>();
  for (const { m, cli, tot, done } of d.meas) {
    const ops = d.ops.filter((x) => x.o.measurementId === m.id);
    ops.forEach((x) => used.add(x.o.id));
    works.push({ key: `m${m.id}`, href: `/medicoes/${m.id}`, title: m.work, client: cli, kind: `Medição ${m.number}`, due: m.dueDate, meas: { done, tot }, prod: prodOf(ops), asm: asmOf(ops), ops: ops.length, late: false });
  }
  for (const { o, cli } of d.sos) {
    const ops = d.ops.filter((x) => x.o.salesOrderId === o.id && !used.has(x.o.id));
    if (!ops.length) continue;
    ops.forEach((x) => used.add(x.o.id));
    const hasAsm = o.hasAssembly || ops.some((x) => N(x.aTot) > 0);
    works.push({ key: `s${o.id}`, href: `/pedidos/${o.id}`, title: ops.find((x) => x.o.work)?.o.work ?? `Pedido ${o.number}`, client: cli, kind: `Pedido ${o.number}${o.deliveryPlace ? ` · ${o.deliveryPlace}` : ""}`, due: o.deliveryDate,
      meas: null, prod: prodOf(ops), asm: hasAsm ? asmOf(ops) : null, ops: ops.length, late: false });
  }
  // OPs com obra informada, sem medição e sem pedido
  const byWork = new Map<string, typeof d.ops>();
  for (const x of d.ops) if (!used.has(x.o.id) && x.o.work) byWork.set(x.o.work, [...(byWork.get(x.o.work) ?? []), x]);
  for (const [w, ops] of byWork) {
    const hasAsm = ops.some((x) => N(x.aTot) > 0);
    works.push({ key: `w${w}`, href: `/ops?q=${encodeURIComponent(w)}&sit=todas&modo=lista`, title: w, client: ops[0].cli, kind: `${ops.length} ${ops.length === 1 ? "OP" : "OPs"}`,
      due: ops.map((x) => x.o.needDate).filter(Boolean).sort().pop() ?? null, meas: null, prod: prodOf(ops), asm: hasAsm ? asmOf(ops) : null, ops: ops.length, late: false });
  }
  const overall = (w: Work) => {
    const parts = [w.meas && pctOf(w.meas.done, w.meas.tot), pctOf(w.prod.done, w.prod.tot), w.asm && pctOf(w.asm.done, w.asm.tot)].filter((x): x is number => typeof x === "number");
    // medição sem OP ainda: produção e montagem contam como 0
    return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0;
  };
  let rows = works.map((w) => { const p = overall(w); return { ...w, pct: p, late: !!(w.due && w.due < hoje && p < 100) }; });
  const clients = [...new Set(rows.map((r) => r.client).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const cnt = { and: rows.filter((r) => r.pct < 100).length, late: rows.filter((r) => r.late).length, done: rows.filter((r) => r.pct >= 100).length };
  const st = sp.st ?? "";
  if (st === "") rows = rows.filter((r) => r.pct < 100); else if (st === "late") rows = rows.filter((r) => r.late); else if (st === "done") rows = rows.filter((r) => r.pct >= 100);
  if (sp.cli) rows = rows.filter((r) => r.client === sp.cli);
  if (sp.q) { const q = norm(sp.q); rows = rows.filter((r) => norm(`${r.title} ${r.client ?? ""} ${r.kind}`).includes(q)); }
  rows.sort((a, b) => Number(b.late) - Number(a.late) || (a.due ?? "9").localeCompare(b.due ?? "9"));
  const Stage = ({ label, v, color }: { label: string; v: { done: number; tot: number } | null; color: string }) => (
    <div className="wk-st">{v ? <>
      <span className="wk-l">{label}<b>{Math.round(pctOf(v.done, v.tot))}%</b></span>
      <div className="prog" style={{ ["--c" as string]: color }}><i style={{ width: `${pctOf(v.done, v.tot)}%`, background: color }} /></div>
      <small>{fmtQty(v.done)} de {fmtQty(v.tot)}</small></> : <><span className="wk-l">{label}<b className="muted">—</b></span><small className="muted">não se aplica</small></>}</div>
  );
  return (
    <>
      <PageHead title="Acompanhamento de obras" sub="Em que ponto está cada obra e cliente: medição (locais medidos), produção (peças produzidas) e montagem (peças montadas). O total é a média das etapas."
        actions={<PrintButton />} />
      <div className="kpis k4">
        <Kpi value={cnt.and} label="Obras em andamento" />
        <Kpi value={cnt.late} label="Atrasadas" alert={cnt.late > 0} />
        <Kpi value={cnt.done} label="Concluídas" />
        <Kpi value={`${Math.round(works.length ? rows.reduce((a, r) => a + r.pct, 0) / Math.max(1, rows.length) : 0)}%`} label="Média do filtro" />
      </div>
      <FilterBar right={<span className="count">{rows.length} obras</span>}
        tabs={<FilterTabs name="st" value={st} options={[{ v: "", label: "Em andamento", n: cnt.and }, { v: "late", label: "Atrasadas", n: cnt.late }, { v: "done", label: "Concluídas", n: cnt.done }, { v: "todas", label: "Todas" }]} />}>
        <div className="search"><Icon name="search" size={16} /><input type="search" name="q" defaultValue={sp.q ?? ""} placeholder="Obra, cliente, pedido ou medição" aria-label="Buscar obra" /></div>
        <Sel name="cli" defaultValue={sp.cli ?? ""} aria-label="Cliente" style={{ maxWidth: 240 }}><option value="">Todos os clientes</option>{clients.map((c) => <option key={c} value={c}>{c}</option>)}</Sel>
      </FilterBar>
      {rows.length ? (
        <div className="ob-list" style={{ marginTop: 12 }}>
          {rows.map((r) => (
            <Link key={r.key} href={r.href} className={`ob wk${r.late ? " late" : ""}`}>
              <div className="ob-main"><span className="muted ob-n">{r.kind}{r.ops ? ` · ${r.ops} ${r.ops === 1 ? "OP" : "OPs"}` : ""}</span><b>{r.title}</b><small>{r.client ?? "Sem cliente"}</small></div>
              <Stage label="Medição" v={r.meas} color="#E0601A" />
              <Stage label="Produção" v={r.prod.tot ? r.prod : r.meas ? { done: 0, tot: 0 } : r.prod} color="#1E3A5F" />
              <Stage label="Montagem" v={r.asm} color="#2E7D4F" />
              <div className="wk-tot"><b>{Math.round(r.pct)}%</b><small className={r.late ? "t-bad" : "muted"}>{r.due ? `${r.late ? "atrasada · " : "previsão "}${fmtD(r.due)}` : "sem previsão"}</small></div>
            </Link>
          ))}
        </div>
      ) : <div className="panel"><Empty title="Nenhuma obra neste filtro">As obras aparecem quando há medição, ou OPs ligadas a pedido ou com obra informada.</Empty></div>}
    </>
  );
}

// =====================================================================================
// Relatórios da produção: por funcionário, serviço, peso e obra
// =====================================================================================
const TITLES: Record<string, [string, string]> = {
  funcionario: ["Relatório por funcionário", "Horas trabalhadas, o que cada pessoa apontou como pronto e o peso correspondente."],
  servico: ["Relatório por serviço", "Horas por etapa (serviço) e por centro de trabalho, e o que foi apontado em cada tipo de serviço."],
  peso: ["Relatório por peso", "Quilos produzidos e montados no período, por semana, produto e obra. O peso vem do campo “Peso” da medição ou do peso do item."],
  obra: ["Relatório por obra", "Produção, montagem, peso e horas de cada obra no período."],
};

export async function ProdReport({ by, searchParams }: { by: "funcionario" | "servico" | "peso" | "obra"; searchParams: Promise<SP> }) {
  const s = await page("producao");
  const sp = await searchParams;
  const de = sp.de && isDate(sp.de) ? sp.de : addDays(today(), -29);
  const ate = sp.ate && isDate(sp.ate) ? sp.ate : today();
  const d = await s.tx(async (tx) => ({
    times: await tx.select({ t: E.timeEntries, p: E.teamMembers.name, st: E.productionStages.name, sc: E.productionStages.color, wc: E.workCenters.name, cost: E.workCenters.costPerHour })
      .from(E.timeEntries).innerJoin(E.teamMembers, eq(E.teamMembers.id, E.timeEntries.memberId)).leftJoin(E.productionStages, eq(E.productionStages.id, E.timeEntries.stageId))
      .leftJoin(E.workCenters, eq(E.workCenters.id, E.timeEntries.workCenterId)).where(and(gte(E.timeEntries.date, de), lte(E.timeEntries.date, ate), sql`${E.timeEntries.end} is not null`)),
    reps: await tx.select({ r: E.productionReports, who: E.teamMembers.name }).from(E.productionReports).leftJoin(E.teamMembers, eq(E.teamMembers.id, E.productionReports.memberId))
      .where(and(gte(E.productionReports.date, de), lte(E.productionReports.date, ate))),
    ops: await tx.select({ id: E.productionOrders.id, n: E.productionOrders.number, work: E.productionOrders.work, it: E.items.name, place: E.salesOrders.deliveryPlace, cli: sql<string | null>`coalesce(${E.partners.tradeName}, ${E.partners.name})` })
      .from(E.productionOrders).innerJoin(E.items, eq(E.items.id, E.productionOrders.itemId)).leftJoin(E.salesOrders, eq(E.salesOrders.id, E.productionOrders.salesOrderId)).leftJoin(E.partners, eq(E.partners.id, E.productionOrders.partnerId)),
    team: await tx.select({ id: E.teamMembers.id, n: E.teamMembers.name }).from(E.teamMembers).orderBy(asc(E.teamMembers.name)),
    w: await opUnitWeights(tx),
  }));
  const op = new Map(d.ops.map((o) => [o.id, o]));
  const obraOf = (id: string) => { const o = op.get(id); return o?.work ?? o?.place ?? (o?.cli ? `${o.cli} (sem obra)` : "Estoque"); };
  // peso de cada apontamento: produto final e peça montada (as peças intermediárias não somam peso, para não contar duas vezes)
  const wOf = (r: typeof E.productionReports.$inferSelect) => (r.componentId ? 0 : N(r.qty) * (d.w.get(r.productionOrderId) ?? 0));
  const reps = sp.pes ? d.reps.filter((x) => x.r.memberId === sp.pes) : d.reps;
  const times = sp.pes ? d.times.filter((x) => x.t.memberId === sp.pes) : d.times;
  const H = times.reduce((a, x) => a + N(x.t.hours), 0);
  const C = times.reduce((a, x) => a + N(x.t.hours) * N(x.cost), 0);
  const fab = reps.filter((x) => x.r.kind === "FABRICA" && !x.r.componentId), mon = reps.filter((x) => x.r.kind === "MONTAGEM");
  const KF = fab.reduce((a, x) => a + wOf(x.r), 0), KM = mon.reduce((a, x) => a + wOf(x.r), 0);
  const [title, sub] = TITLES[by];
  const group = <T,>(list: T[], key: (x: T) => string) => { const m = new Map<string, T[]>(); for (const x of list) { const k = key(x); m.set(k, [...(m.get(k) ?? []), x]); } return m; };

  let body: React.ReactNode = null;
  if (by === "funcionario") {
    const names = new Set([...times.map((x) => x.p), ...reps.map((x) => x.who ?? "Não informado")]);
    const rows = [...names].map((n) => {
      const t = times.filter((x) => x.p === n), r = reps.filter((x) => (x.who ?? "Não informado") === n);
      return { n, h: t.reduce((a, x) => a + N(x.t.hours), 0), c: t.reduce((a, x) => a + N(x.t.hours) * N(x.cost), 0), ops: new Set([...t.map((x) => x.t.productionOrderId), ...r.map((x) => x.r.productionOrderId)]).size,
        fin: r.filter((x) => x.r.kind === "FABRICA" && !x.r.componentId).reduce((a, x) => a + N(x.r.qty), 0), pec: r.filter((x) => x.r.componentId).reduce((a, x) => a + N(x.r.qty), 0),
        mon: r.filter((x) => x.r.kind === "MONTAGEM").reduce((a, x) => a + N(x.r.qty), 0), kg: r.reduce((a, x) => a + wOf(x.r), 0), days: new Set(t.map((x) => x.t.date)).size };
    }).sort((a, b) => b.h - a.h || b.kg - a.kg);
    body = (
      <>
        <div className="grid2">
          <Panel title="Horas por pessoa"><div className="pb"><HBars rows={rows.filter((r) => r.h).slice(0, 12).map((r) => ({ l: r.n, v: Math.round(r.h * 10) / 10, c: "#1E3A5F" }))} fmt={h1} /></div></Panel>
          <Panel title="Peso apontado por pessoa"><div className="pb"><HBars rows={rows.filter((r) => r.kg).slice(0, 12).map((r) => ({ l: r.n, v: Math.round(r.kg), c: "#E0601A" }))} fmt={kg} /></div></Panel>
        </div>
        <div className="tbl" style={{ marginTop: 16 }}>{rows.length ? <table>
          <thead><tr><th>Funcionário</th><th className="num">Dias</th><th className="num">Horas</th>{s.access.costs && <th className="num">Custo</th>}<th className="num">OPs</th><th className="num">Produtos finalizados</th><th className="num">Peças / estruturas</th><th className="num">Peças montadas</th><th className="num">Peso</th><th className="num">kg por hora</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.n}><td className="desc">{r.n}</td><td className="num">{r.days}</td><td className="num"><b>{h1(r.h)}</b></td>{s.access.costs && <td className="num">{fmtMoney(r.c)}</td>}<td className="num">{r.ops}</td>
            <td className="num">{fmtQty(r.fin)}</td><td className="num">{fmtQty(r.pec)}</td><td className="num">{fmtQty(r.mon)}</td><td className="num">{kg(r.kg)}</td><td className="num">{r.h ? (r.kg / r.h).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "—"}</td></tr>)}</tbody>
          <tfoot><tr><td>Total</td><td /><td className="num">{h1(H)}</td>{s.access.costs && <td className="num">{fmtMoney(C)}</td>}<td /><td className="num">{fmtQty(fab.reduce((a, x) => a + N(x.r.qty), 0))}</td><td className="num">{fmtQty(reps.filter((x) => x.r.componentId).reduce((a, x) => a + N(x.r.qty), 0))}</td><td className="num">{fmtQty(mon.reduce((a, x) => a + N(x.r.qty), 0))}</td><td className="num">{kg(KF + KM)}</td><td /></tr></tfoot>
        </table> : <Empty title="Nada apontado no período" />}</div>
      </>
    );
  } else if (by === "servico") {
    const st = [...group(times, (x) => x.st ?? "Sem etapa")].map(([n, l]) => ({ n, c: l[0].sc ?? "#6B7785", h: l.reduce((a, x) => a + N(x.t.hours), 0), cost: l.reduce((a, x) => a + N(x.t.hours) * N(x.cost), 0), p: new Set(l.map((x) => x.t.memberId)).size, ops: new Set(l.map((x) => x.t.productionOrderId)).size })).sort((a, b) => b.h - a.h);
    const wc = [...group(times, (x) => x.wc ?? "Sem centro")].map(([n, l]) => ({ n, h: l.reduce((a, x) => a + N(x.t.hours), 0), cost: l.reduce((a, x) => a + N(x.t.hours) * N(x.cost), 0), p: new Set(l.map((x) => x.t.memberId)).size, ops: new Set(l.map((x) => x.t.productionOrderId)).size })).sort((a, b) => b.h - a.h);
    const kinds = [["Produto final (fábrica)", fab], ["Peças e estruturas (fábrica)", reps.filter((x) => x.r.componentId)], ["Peças montadas (montagem)", mon]] as const;
    const T = (rows: { n: string; h: number; cost: number; p: number; ops: number }[], label: string) => (
      <div className="tbl solo" style={{ border: 0, borderRadius: 0, maxHeight: "none" }}><table>
        <thead><tr><th>{label}</th><th className="num">Horas</th><th className="num">% das horas</th>{s.access.costs && <th className="num">Custo</th>}<th className="num">Pessoas</th><th className="num">OPs</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.n}><td className="desc">{r.n}</td><td className="num"><b>{h1(r.h)}</b></td><td className="num">{H ? Math.round((r.h / H) * 100) : 0}%</td>{s.access.costs && <td className="num">{fmtMoney(r.cost)}</td>}<td className="num">{r.p}</td><td className="num">{r.ops}</td></tr>)}</tbody></table></div>
    );
    body = (
      <>
        <div className="grid2">
          <Panel title="Horas por etapa (serviço)"><div className="pb"><HBars rows={st.map((r) => ({ l: r.n, v: Math.round(r.h * 10) / 10, c: r.c }))} fmt={h1} /></div></Panel>
          <Panel title="Apontamentos por tipo de serviço"><div className="tbl solo" style={{ border: 0, borderRadius: 0, maxHeight: "none" }}><table>
            <thead><tr><th>Serviço</th><th className="num">Apontamentos</th><th className="num">Quantidade</th><th className="num">Peso</th></tr></thead>
            <tbody>{kinds.map(([n, l]) => <tr key={n}><td className="desc">{n}</td><td className="num">{l.length}</td><td className="num">{fmtQty(l.reduce((a, x) => a + N(x.r.qty), 0))}</td><td className="num">{kg(l.reduce((a, x) => a + wOf(x.r), 0))}</td></tr>)}</tbody></table></div></Panel>
        </div>
        <Panel className="sec-panel" title="Por etapa" sub={h1(H)}>{st.length ? T(st, "Etapa") : <div className="pb muted">Nenhuma hora no período.</div>}</Panel>
        <Panel className="sec-panel" title="Por centro de trabalho">{wc.length ? T(wc, "Centro") : <div className="pb muted">Nenhuma hora no período.</div>}</Panel>
      </>
    );
  } else if (by === "peso") {
    const NW = Math.max(1, Math.ceil((diffDays(de, ate) + 1) / 7));
    const labels: string[] = []; for (let k = NW - 1; k >= 0; k--) labels.push(fmtDM(addDays(ate, -7 * k - 6)));
    const wk = (list: typeof reps) => { const a = new Array(NW).fill(0); for (const x of list) { const k = Math.floor(diffDays(x.r.date, ate) / 7); if (k >= 0 && k < NW) a[NW - 1 - k] += wOf(x.r); } return a.map((v) => Math.round(v)); };
    const byItem = [...group([...fab, ...mon], (x) => op.get(x.r.productionOrderId)?.it ?? x.r.description)].map(([n, l]) => ({ n, f: l.filter((x) => x.r.kind === "FABRICA").reduce((a, x) => a + wOf(x.r), 0), m: l.filter((x) => x.r.kind === "MONTAGEM").reduce((a, x) => a + wOf(x.r), 0), q: l.filter((x) => x.r.kind === "FABRICA").reduce((a, x) => a + N(x.r.qty), 0) })).sort((a, b) => b.f + b.m - a.f - a.m);
    const byObra = [...group([...fab, ...mon], (x) => obraOf(x.r.productionOrderId))].map(([n, l]) => ({ l: n, v: Math.round(l.reduce((a, x) => a + wOf(x.r), 0)), c: "#E0601A" })).sort((a, b) => b.v - a.v).slice(0, 12);
    body = (
      <>
        <div className="grid2">
          <Panel title="Peso por semana"><div className="pb"><VBars labels={labels} sets={[{ n: "Produzido", c: "#1E3A5F", v: wk(fab) }, { n: "Montado", c: "#2E7D4F", v: wk(mon) }]} fmt={(v) => kg(v)} label="Peso por semana" /></div></Panel>
          <Panel title="Peso por obra"><div className="pb"><HBars rows={byObra} fmt={kg} /></div></Panel>
        </div>
        <div className="tbl" style={{ marginTop: 16 }}>{byItem.length ? <table>
          <thead><tr><th>Produto</th><th className="num">Quantidade produzida</th><th className="num">Peso produzido</th><th className="num">Peso montado</th></tr></thead>
          <tbody>{byItem.map((r) => <tr key={r.n}><td className="desc">{r.n}</td><td className="num">{fmtQty(r.q)}</td><td className="num"><b>{kg(r.f)}</b></td><td className="num">{kg(r.m)}</td></tr>)}</tbody>
          <tfoot><tr><td>Total</td><td /><td className="num">{kg(KF)}</td><td className="num">{kg(KM)}</td></tr></tfoot></table> : <Empty title="Nada produzido no período" />}</div>
        {!KF && !KM && (fab.length > 0 || mon.length > 0) && <p className="muted" style={{ fontSize: 13 }}>Os apontamentos não têm peso: crie o campo “Peso” em Produção › Configurações › Campos da medição, ou preencha o peso líquido no cadastro do item.</p>}
      </>
    );
  } else {
    const keys = new Set([...reps.map((x) => obraOf(x.r.productionOrderId)), ...times.map((x) => obraOf(x.t.productionOrderId))]);
    const rows = [...keys].map((n) => {
      const r = reps.filter((x) => obraOf(x.r.productionOrderId) === n), t = times.filter((x) => obraOf(x.t.productionOrderId) === n);
      const f = r.filter((x) => x.r.kind === "FABRICA" && !x.r.componentId), m = r.filter((x) => x.r.kind === "MONTAGEM");
      return { n, ops: new Set([...r.map((x) => x.r.productionOrderId), ...t.map((x) => x.t.productionOrderId)]).size, qf: f.reduce((a, x) => a + N(x.r.qty), 0), qm: m.reduce((a, x) => a + N(x.r.qty), 0),
        kf: f.reduce((a, x) => a + wOf(x.r), 0), km: m.reduce((a, x) => a + wOf(x.r), 0), h: t.reduce((a, x) => a + N(x.t.hours), 0), c: t.reduce((a, x) => a + N(x.t.hours) * N(x.cost), 0), p: new Set([...t.map((x) => x.t.memberId), ...r.map((x) => x.r.memberId).filter(Boolean)]).size };
    }).sort((a, b) => b.kf + b.km - a.kf - a.km || b.h - a.h);
    body = (
      <>
        <div className="grid2">
          <Panel title="Horas por obra"><div className="pb"><HBars rows={rows.filter((r) => r.h).slice(0, 12).map((r) => ({ l: r.n, v: Math.round(r.h * 10) / 10, c: "#1E3A5F" }))} fmt={h1} /></div></Panel>
          <Panel title="Peso produzido por obra"><div className="pb"><HBars rows={rows.filter((r) => r.kf).slice(0, 12).map((r) => ({ l: r.n, v: Math.round(r.kf), c: "#E0601A" }))} fmt={kg} /></div></Panel>
        </div>
        <div className="tbl" style={{ marginTop: 16 }}>{rows.length ? <table>
          <thead><tr><th>Obra</th><th className="num">OPs</th><th className="num">Produzido</th><th className="num">Peso produzido</th><th className="num">Montado</th><th className="num">Peso montado</th><th className="num">Horas</th>{s.access.costs && <th className="num">Custo M.O.</th>}<th className="num">Pessoas</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.n}><td className="desc">{r.n}</td><td className="num">{r.ops}</td><td className="num">{fmtQty(r.qf)}</td><td className="num"><b>{kg(r.kf)}</b></td><td className="num">{fmtQty(r.qm)}</td><td className="num">{kg(r.km)}</td><td className="num">{h1(r.h)}</td>{s.access.costs && <td className="num">{fmtMoney(r.c)}</td>}<td className="num">{r.p}</td></tr>)}</tbody>
          <tfoot><tr><td>Total</td><td /><td className="num">{fmtQty(rows.reduce((a, r) => a + r.qf, 0))}</td><td className="num">{kg(KF)}</td><td className="num">{fmtQty(rows.reduce((a, r) => a + r.qm, 0))}</td><td className="num">{kg(KM)}</td><td className="num">{h1(H)}</td>{s.access.costs && <td className="num">{fmtMoney(C)}</td>}<td /></tr></tfoot></table> : <Empty title="Nada apontado no período" />}</div>
      </>
    );
  }
  return (
    <>
      <PageHead title={title} sub={`${sub} Período de ${fmtD(de)} a ${fmtD(ate)}.`} actions={<PrintButton />} />
      <div className="kpis k4">
        <Kpi value={h1(H)} label="Horas trabalhadas" />
        <Kpi value={kg(KF)} label="Peso produzido" />
        <Kpi value={kg(KM)} label="Peso montado" />
        {s.access.costs ? <Kpi value={fmtMoney(C)} label="Custo de mão de obra" /> : <Kpi value={reps.length} label="Apontamentos" />}
      </div>
      <FilterBar>
        <label className="fl">De <input type="date" name="de" defaultValue={de} /></label>
        <label className="fl">até <input type="date" name="ate" defaultValue={ate} /></label>
        <Sel name="pes" defaultValue={sp.pes ?? ""} aria-label="Funcionário"><option value="">Toda a equipe</option>{d.team.map((t) => <option key={t.id} value={t.id}>{t.n}</option>)}</Sel>
      </FilterBar>
      {body}
    </>
  );
}
