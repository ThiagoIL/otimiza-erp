import Link from "next/link";
import { and, asc, desc, eq, gte, ilike, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { withTenant } from "@/lib/db";
import { items, partners, productionOrders, productionStages, productionStatuses, salesOrders, teamMembers, workCenters } from "@/db/schema";
import { requireTenantUser } from "@/lib/context";
import { fmtDay, fmtQty, opNumber, priorityLabel, pvNumber, today } from "@/lib/format";
import { ensureSetup, stagesOf } from "@/server/stock";
import { KanbanBoard, type KanbanColumn } from "@/components/KanbanBoard";

type SP = { ver?: string; q?: string; centro?: string; resp?: string; etapa?: string; msg?: string; concluidas?: string };

export async function ProductionBoard({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await requireTenantUser();
  const sp = await searchParams;
  const tid = s.tenant.id;
  const lista = sp.ver === "lista";
  const q = (sp.q ?? "").trim().slice(0, 80);
  const conds: SQL[] = [eq(productionOrders.tenantId, tid)];
  if (q) {
    const n = Number(q.replace(/\D/g, ""));
    conds.push(or(ilike(items.name, `%${q}%`), ilike(items.code, `%${q}%`), ilike(partners.name, `%${q}%`), ...(n ? [eq(productionOrders.number, n)] : []))!);
  }
  if (sp.centro) conds.push(eq(productionOrders.workCenterId, sp.centro.slice(0, 64)));
  if (sp.resp) conds.push(eq(productionOrders.responsibleId, sp.resp.slice(0, 64)));
  if (lista && sp.etapa) conds.push(eq(productionOrders.stageId, sp.etapa.slice(0, 64)));
  // concluídas há mais de 30 dias saem do quadro (continuam na lista com o filtro)
  if (!sp.concluidas) conds.push(or(sql`${productionOrders.finishedAt} is null`, gte(productionOrders.finishedAt, sql`now() - interval '30 days'`))!);
  const hoje = today();

  const [orders, stages, centers, members] = await withTenant(tid, async (tx) => {
    await ensureSetup(tx, tid);
    const st = alias(productionStatuses, "st");
    return [
      await tx.select({
        o: productionOrders, item: items.name, unit: items.unit, stage: productionStages.name, isFinal: productionStages.isFinal,
        statusName: st.name, statusColor: st.color, center: workCenters.name, resp: teamMembers.name, pv: salesOrders.number, customer: partners.name,
      }).from(productionOrders)
        .innerJoin(items, eq(items.id, productionOrders.itemId))
        .innerJoin(productionStages, eq(productionStages.id, productionOrders.stageId))
        .leftJoin(st, eq(st.id, productionOrders.statusId))
        .leftJoin(workCenters, eq(workCenters.id, productionOrders.workCenterId))
        .leftJoin(teamMembers, eq(teamMembers.id, productionOrders.responsibleId))
        .leftJoin(salesOrders, eq(salesOrders.id, productionOrders.salesOrderId))
        .leftJoin(partners, eq(partners.id, salesOrders.customerId))
        .where(and(...conds))
        .orderBy(asc(productionOrders.priority), sql`${productionOrders.dueDate} asc nulls last`, desc(productionOrders.number)).limit(500),
      await stagesOf(tx, tid),
      await tx.select({ id: workCenters.id, name: workCenters.name }).from(workCenters).orderBy(asc(workCenters.name)),
      await tx.select({ id: teamMembers.id, name: teamMembers.name }).from(teamMembers).where(eq(teamMembers.active, true)).orderBy(asc(teamMembers.name)),
    ] as const;
  });

  const late = (o: (typeof orders)[number]) => !o.isFinal && !!o.o.dueDate && o.o.dueDate < hoje;
  const columns: KanbanColumn[] = stages.map((st) => ({
    id: st.id, name: st.name, color: st.color, isFinal: st.isFinal,
    cards: orders.filter((o) => o.o.stageId === st.id).map((o) => ({
      id: o.o.id, number: opNumber(o.o.number), item: o.item, qty: `${fmtQty(o.o.quantity)} ${o.unit}`,
      produced: Number(o.o.producedQty), total: Number(o.o.quantity),
      status: o.statusName ? { name: o.statusName, color: o.statusColor ?? "#5F6B78" } : null,
      due: o.o.dueDate ? fmtDay(o.o.dueDate) : null, late: late(o), center: o.center, responsible: o.resp, customer: o.customer, priority: o.o.priority,
    })),
  }));
  const abertas = orders.filter((o) => !o.isFinal);
  const view = (v: string) => `?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([k, x]) => x && k !== "ver" && k !== "msg")) as Record<string, string>, ver: v })}`;

  return (
    <>
      <div className="ph"><div><h1>Ordens de produção</h1><p>Acompanhe as ordens por etapa. Arraste os cartões entre as colunas para mudar a etapa.</p></div>
        <div className="acts">
          <div className="seg" role="group" aria-label="Visualização">
            <Link className={`btn btn-sm${!lista ? " on" : ""}`} href={view("kanban")} aria-current={!lista ? "true" : undefined}>Kanban</Link>
            <Link className={`btn btn-sm${lista ? " on" : ""}`} href={view("lista")} aria-current={lista ? "true" : undefined}>Lista</Link>
          </div>
          <Link className="btn btn-primary" href="/producao/nova">Nova ordem</Link>
        </div></div>
      {sp.msg && <div className="alert ok" role="status">{sp.msg.slice(0, 200)}</div>}
      <div className="kpis">
        <div className="kpi"><b>{abertas.length}</b><span>Ordens em aberto</span></div>
        <div className={`kpi${abertas.filter(late).length ? " kpi-bad" : ""}`}><b>{abertas.filter(late).length}</b><span>Atrasadas</span></div>
        <div className="kpi"><b>{abertas.filter((o) => o.o.priority === 1).length}</b><span>Prioridade alta</span></div>
        <div className="kpi"><b>{orders.filter((o) => o.isFinal).length}</b><span>Concluídas (30 dias)</span></div>
      </div>
      <form className="bar" role="search">
        <input type="hidden" name="ver" value={lista ? "lista" : "kanban"} />
        <input type="search" name="q" defaultValue={q} placeholder="Nº da OP, produto ou cliente" aria-label="Buscar ordem" />
        <select name="centro" defaultValue={sp.centro ?? ""} aria-label="Centro de trabalho" style={{ maxWidth: 190 }}><option value="">Todos os centros</option>{centers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select name="resp" defaultValue={sp.resp ?? ""} aria-label="Responsável" style={{ maxWidth: 190 }}><option value="">Todos os responsáveis</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        {lista && <select name="etapa" defaultValue={sp.etapa ?? ""} aria-label="Etapa" style={{ maxWidth: 170 }}><option value="">Todas as etapas</option>{stages.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}</select>}
        <label className="chk inline-lbl"><input type="checkbox" name="concluidas" value="1" defaultChecked={!!sp.concluidas} /> Incluir concluídas antigas</label>
        <button className="btn" type="submit">Filtrar</button>
      </form>
      {!lista ? (
        <div className="board-wrap"><KanbanBoard columns={columns} /></div>
      ) : (
        <div className="tbl">
          {orders.length ? (
            <table><thead><tr><th>OP</th><th>Produto</th><th className="num">Qtd.</th><th>Produzido</th><th>Etapa</th><th>Situação</th><th>Pedido / cliente</th><th>Responsável</th><th>Prioridade</th><th>Prazo</th></tr></thead>
              <tbody>{orders.map((o) => (
                <tr key={o.o.id}>
                  <td className="nowrap"><Link className="row-link" href={`/producao/${o.o.id}`}>{opNumber(o.o.number)}</Link></td>
                  <td>{o.item}{o.center && <small className="sub">{o.center}</small>}</td>
                  <td className="num">{fmtQty(o.o.quantity)} {o.unit}</td>
                  <td style={{ minWidth: 110 }}><div className="progress"><span style={{ width: `${Math.min(100, (Number(o.o.producedQty) / Number(o.o.quantity)) * 100)}%` }} /></div><small className="sub">{fmtQty(o.o.producedQty)} de {fmtQty(o.o.quantity)}</small></td>
                  <td>{o.isFinal ? <span className="badge ok">{o.stage}</span> : o.stage}</td>
                  <td>{o.statusName ? <span className="badge dot" style={{ ["--dot" as string]: o.statusColor ?? "" }}>{o.statusName}</span> : "—"}</td>
                  <td>{o.pv != null ? <><Link href={`/comercial/pedidos/${o.o.salesOrderId}`}>{pvNumber(o.pv)}</Link><small className="sub">{o.customer}</small></> : <span className="muted">Estoque</span>}</td>
                  <td>{o.resp ?? "—"}</td>
                  <td>{o.o.priority === 1 ? <span className="badge bad">Alta</span> : priorityLabel(o.o.priority)}</td>
                  <td className={late(o) ? "late nowrap" : "nowrap"}>{fmtDay(o.o.dueDate)}</td>
                </tr>))}</tbody></table>
          ) : <div className="empty"><strong>Nenhuma ordem de produção</strong>Crie a primeira em <Link href="/producao/nova">Nova ordem</Link>, ou a partir de um pedido de venda.</div>}
        </div>
      )}
    </>
  );
}
