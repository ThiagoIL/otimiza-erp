import { and, asc, desc, eq, gte, isNotNull, isNull, lte, sql, type SQL } from "drizzle-orm";
import { page } from "@/lib/access";
import * as E from "@/db/erp";
import { Empty, Kpi, PageHead, StatusBadge } from "@/components/ui";
import { FilterBar } from "@/components/client";
import { TimeButtons, TimeRowButton, type OpRef } from "@/components/TimeEntry";
import { fmtMoney } from "@/lib/format";
import { addDays, fmtD, isDate, today } from "@/lib/dates";

type SP = Record<string, string | undefined>;
const hm = (s: string) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s); return m ? +m[1] * 60 + +m[2] : 0; };
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

export async function Timesheets({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await page("producao");
  const sp = await searchParams;
  const de = sp.de && isDate(sp.de) ? sp.de : addDays(today(), -13);
  const ate = sp.ate && isDate(sp.ate) ? sp.ate : today();
  const c: SQL[] = [isNotNull(E.timeEntries.end), gte(E.timeEntries.date, de), lte(E.timeEntries.date, ate)];
  if (sp.pes) c.push(eq(E.timeEntries.memberId, sp.pes));
  if (sp.cen) c.push(eq(E.timeEntries.workCenterId, sp.cen));
  if (sp.opf) c.push(eq(E.timeEntries.productionOrderId, sp.opf));
  const d = await s.tx(async (tx) => {
    const sel = { t: E.timeEntries, p: E.teamMembers.name, opn: E.productionOrders.number, it: E.items.name, st: E.productionStages.name, sc: E.productionStages.color, wc: E.workCenters.name, cost: E.workCenters.costPerHour };
    const base = () => tx.select(sel).from(E.timeEntries).innerJoin(E.teamMembers, eq(E.teamMembers.id, E.timeEntries.memberId)).innerJoin(E.productionOrders, eq(E.productionOrders.id, E.timeEntries.productionOrderId))
      .innerJoin(E.items, eq(E.items.id, E.productionOrders.itemId)).leftJoin(E.productionStages, eq(E.productionStages.id, E.timeEntries.stageId)).leftJoin(E.workCenters, eq(E.workCenters.id, E.timeEntries.workCenterId));
    const rows = await base().where(and(...c)).orderBy(desc(E.timeEntries.date), desc(E.timeEntries.start));
    const live = await base().where(isNull(E.timeEntries.end)).orderBy(asc(E.timeEntries.start));
    const ops = await tx.select({ id: E.productionOrders.id, n: E.productionOrders.number, it: E.items.name, stageId: E.productionOrders.stageId, wc: E.productionOrders.workCenterId, resp: E.productionOrders.responsibleId })
      .from(E.productionOrders).innerJoin(E.items, eq(E.items.id, E.productionOrders.itemId)).innerJoin(E.productionStages, eq(E.productionStages.id, E.productionOrders.stageId))
      .where(sql`${E.productionStages.kind} not in ('finalizada','cancelada')`).orderBy(desc(E.productionOrders.number));
    const members = await tx.select().from(E.teamMembers).where(eq(E.teamMembers.active, true)).orderBy(asc(E.teamMembers.name));
    const stages = await tx.select().from(E.productionStages).where(sql`${E.productionStages.kind} not in ('finalizada','cancelada')`).orderBy(asc(E.productionStages.position));
    const centers = await tx.select().from(E.workCenters).orderBy(asc(E.workCenters.name));
    return { rows, live, ops, members, stages, centers };
  });
  const ops: OpRef[] = d.ops.map((o) => ({ id: o.id, label: `OP ${o.n} · ${o.it}`, stageId: o.stageId, workCenterId: o.wc, responsibleId: o.resp }));
  const members = d.members.map((m) => [m.id, `${m.name}${m.role ? " · " + m.role : ""}`] as [string, string]);
  const stages = d.stages.map((x) => [x.id, x.name] as [string, string]);
  const centers = d.centers.map((x) => [x.id, x.name] as [string, string]);
  const memberCenter = Object.fromEntries(d.members.map((m) => [m.id, m.workCenterId]));
  const common = { ops, members, stages, centers, memberCenter };
  const H = d.rows.reduce((a, r) => a + Number(r.t.hours), 0);
  const C = d.rows.reduce((a, r) => a + Number(r.t.hours) * Number(r.cost ?? 0), 0);
  const te = (t: typeof E.timeEntries.$inferSelect) => ({ id: t.id, productionOrderId: t.productionOrderId, memberId: t.memberId, stageId: t.stageId ?? "", workCenterId: t.workCenterId ?? "", date: t.date, start: t.start, end: t.end ?? "", breakMinutes: t.breakMinutes, notes: t.notes ?? "" });
  return (
    <>
      <PageHead title="Apontamentos de produção" sub="Quem trabalhou em cada OP, em qual etapa e por quanto tempo. As horas entram no custo da OP pelo custo por hora do centro de trabalho."
        actions={s.edit && <TimeButtons {...common} defaultOp={sp.op} />} />
      {d.live.length > 0 && (
        <section className="panel" style={{ marginBottom: 16 }}><h2>Em andamento agora <span className="muted h-sub">{d.live.length}</span></h2>
          <div className="ap-live">{d.live.map((r) => {
            const min = r.t.date === today() ? Math.max(0, nowMin() - hm(r.t.start)) : 0;
            return (
              <div key={r.t.id} className="apc"><span className="avatar">{r.p.split(/\s+/).slice(0, 2).map((w) => w[0]).join("")}</span>
                <div className="t"><b>{r.p}</b><small>OP {r.opn} · {r.it}</small><small><span className="live-dot" />{r.st ?? ""} · {r.t.date === today() ? `desde ${r.t.start} · ${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}` : `aberto desde ${fmtD(r.t.date)}`}</small></div>
                {s.edit && <TimeRowButton {...common} entry={te(r.t)} label="Encerrar" />}
              </div>
            );
          })}</div>
        </section>
      )}
      <div className="kpis k4">
        <Kpi value={`${H.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`} label="Horas no período" />
        {s.access.costs ? <Kpi value={fmtMoney(C)} label="Custo de mão de obra" /> : <Kpi value={new Set(d.rows.map((r) => r.t.productionOrderId)).size} label="OPs trabalhadas" />}
        <Kpi value={d.rows.length} label="Apontamentos" />
        <Kpi value={new Set(d.rows.map((r) => r.t.memberId)).size} label="Pessoas" />
      </div>
      <FilterBar right={<span className="count">{d.rows.length} registros</span>}>
        <label className="fl">De <input type="date" name="de" defaultValue={de} /></label>
        <label className="fl">até <input type="date" name="ate" defaultValue={ate} /></label>
        <select name="pes" defaultValue={sp.pes ?? ""} aria-label="Pessoa"><option value="">Todas as pessoas</option>{d.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        <select name="cen" defaultValue={sp.cen ?? ""} aria-label="Centro"><option value="">Todos os centros</option>{d.centers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <select name="opf" defaultValue={sp.opf ?? ""} aria-label="OP" style={{ maxWidth: 220 }}><option value="">Todas as OPs</option>{d.ops.map((o) => <option key={o.id} value={o.id}>OP {o.n}</option>)}</select>
      </FilterBar>
      <div className="tbl">
        {d.rows.length ? (
          <table><thead><tr><th>Data</th><th>Pessoa</th><th>OP</th><th>Produto</th><th>Etapa / centro</th><th>Início</th><th>Fim</th><th className="num">Horas</th>{s.access.costs && <th className="num">Custo</th>}<th /></tr></thead>
            <tbody>{d.rows.map((r) => (
              <tr key={r.t.id}><td className="code">{fmtD(r.t.date)}</td><td>{r.p}</td><td><a href={`/ops/${r.t.productionOrderId}`}><b>OP {r.opn}</b></a></td><td className="ell">{r.it}</td>
                <td>{r.st ? <StatusBadge color={r.sc ?? "#6B7785"} label={r.st} /> : "—"}{r.wc && <div className="t-sub">{r.wc}</div>}</td><td className="code">{r.t.start}</td><td className="code">{r.t.end}</td>
                <td className="num"><b>{Number(r.t.hours).toLocaleString("pt-BR")}</b></td>{s.access.costs && <td className="num">{fmtMoney(Number(r.t.hours) * Number(r.cost ?? 0))}</td>}
                <td className="acts">{s.edit && <TimeRowButton {...common} entry={te(r.t)} label="Editar" className="btn btn-ghost btn-sm" />}</td></tr>))}</tbody>
            <tfoot><tr><td colSpan={7}>Total</td><td className="num">{H.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</td>{s.access.costs && <td className="num">{fmtMoney(C)}</td>}<td /></tr></tfoot></table>
        ) : <Empty title="Nenhum apontamento no período">Ajuste as datas ou registre as horas trabalhadas.</Empty>}
      </div>
    </>
  );
}
