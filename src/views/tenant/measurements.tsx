import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { page, type PageCtx } from "@/lib/access";
import * as E from "@/db/erp";
import { BtnLink, Empty, PageHead, Panel, StatusBadge } from "@/components/ui";
import { ActionButton, ClickRow, FilterBar, FilterTabs } from "@/components/client";
import { Icon } from "@/components/Icon";
import { GenerateOpsButton, MeasurementGrid, MeasurementHeader, type CField } from "@/components/MeasurementUI";
import { deleteMeasurementAction, setMeasurementStatusAction } from "@/server/measurement-actions";
import { customNum, weightFieldId } from "@/server/production-common";
import { fmtQty } from "@/lib/format";
import { fmtD, today } from "@/lib/dates";

type SP = Record<string, string | undefined>;
export const MEAS_ST: Record<string, { label: string; color: string }> = {
  MEDINDO: { label: "Em medição", color: "#E0601A" }, LIBERADA: { label: "Liberada para produção", color: "#1E3A5F" },
  PRODUCAO: { label: "Em produção", color: "#2E7D4F" }, CANCELADA: { label: "Cancelada", color: "#B3261E" },
};
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const cli = sql<string | null>`coalesce(${E.partners.tradeName}, ${E.partners.name})`;

export async function MeasurementsList({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await page("producao");
  const sp = await searchParams;
  const d = await s.tx(async (tx) => tx.select({
    m: E.measurements, cli, who: E.teamMembers.name,
    tot: sql<number>`(select count(*)::int from measurement_items i where i.measurement_id = "measurements"."id")`,
    done: sql<number>`(select count(*)::int from measurement_items i where i.measurement_id = "measurements"."id" and i.measured)`,
    inOp: sql<number>`(select count(*)::int from measurement_items i where i.measurement_id = "measurements"."id" and i.production_order_id is not null)`,
    ops: sql<number>`(select count(*)::int from production_orders o where o.measurement_id = "measurements"."id")`,
  }).from(E.measurements).leftJoin(E.partners, eq(E.partners.id, E.measurements.partnerId)).leftJoin(E.teamMembers, eq(E.teamMembers.id, E.measurements.measurerId))
    .orderBy(desc(E.measurements.number)));
  const all = d.map((r) => ({ ...r, st: r.m.status === "LIBERADA" && r.ops > 0 ? "PRODUCAO" : r.m.status }));
  const cnt = (k: string) => all.filter((r) => r.st === k).length;
  let rows = all;
  const st = sp.st ?? "MEDINDO";
  if (st !== "todas") rows = rows.filter((r) => r.st === st);
  if (sp.q) { const q = norm(sp.q); rows = rows.filter((r) => norm(`${r.m.number} ${r.m.work} ${r.m.address ?? ""} ${r.cli ?? ""}`).includes(q)); }
  const hoje = today();
  return (
    <>
      <PageHead title="Medições" sub="Antes da fabricação: meça cada produto em cada local da obra (andar, Janela 1, 2…). A medição liberada gera as OPs e vira a estrutura da montagem."
        actions={s.edit && <BtnLink href="/medicoes/nova" primary icon="plus">Nova medição</BtnLink>} />
      <FilterBar right={<span className="count">{rows.length} {rows.length === 1 ? "medição" : "medições"}</span>}
        tabs={<FilterTabs name="st" value={st === "MEDINDO" ? "" : st} options={[{ v: "", label: "Em medição", n: cnt("MEDINDO") }, { v: "LIBERADA", label: "Liberadas", n: cnt("LIBERADA") },
          { v: "PRODUCAO", label: "Em produção", n: cnt("PRODUCAO") }, { v: "CANCELADA", label: "Canceladas" }, { v: "todas", label: "Todas" }]} />}>
        <div className="search"><Icon name="search" size={16} /><input type="search" name="q" defaultValue={sp.q ?? ""} placeholder="Nº, obra, endereço ou cliente" aria-label="Buscar medição" /></div>
      </FilterBar>
      <div className="tbl">
        {rows.length ? (
          <table><thead><tr><th className="num">Nº</th><th>Obra</th><th>Cliente</th><th>Medição</th><th>Previsão</th><th>Medidor</th><th>Locais medidos</th><th className="num">Em OP</th><th>Situação</th></tr></thead>
            <tbody>{rows.map((r) => {
              const pct = r.tot ? Math.round((r.done / r.tot) * 100) : 0;
              const late = r.m.dueDate && r.m.dueDate < hoje && r.st === "MEDINDO";
              return (
                <ClickRow key={r.m.id} href={`/medicoes/${r.m.id}`}><td className="num"><b>{r.m.number}</b></td><td className="desc">{r.m.work}{r.m.address && <div className="t-sub">{r.m.address}</div>}</td>
                  <td>{r.cli ?? "—"}</td><td className="code">{fmtD(r.m.date)}</td><td><span className={`badge${late ? " bad" : ""}`}>{fmtD(r.m.dueDate)}</span></td><td>{r.who ?? "—"}</td>
                  <td><div className="cell-prog" style={{ ["--c" as string]: "#E0601A", minWidth: 110 }}><div className="prog"><i style={{ width: `${pct}%` }} /></div><span className="prog-t">{r.done}/{r.tot}</span></div></td>
                  <td className="num">{r.inOp}</td><td><StatusBadge color={MEAS_ST[r.st]?.color ?? "#6B7785"} label={MEAS_ST[r.st]?.label ?? r.st} /></td></ClickRow>
              );
            })}</tbody></table>
        ) : <Empty title="Nenhuma medição nesta situação">{s.edit ? "Crie uma medição para a obra e inclua os locais a medir." : ""}</Empty>}
      </div>
    </>
  );
}

async function lookups(s: PageCtx) {
  return s.tx(async (tx) => ({
    orders: await tx.select({ id: E.salesOrders.id, n: E.salesOrders.number, cli }).from(E.salesOrders).innerJoin(E.partners, eq(E.partners.id, E.salesOrders.partnerId))
      .where(sql`${E.salesOrders.status} in ('PROPOSTA', 'APROVADO')`).orderBy(desc(E.salesOrders.number)).limit(300),
    team: await tx.select({ id: E.teamMembers.id, n: E.teamMembers.name }).from(E.teamMembers).where(eq(E.teamMembers.active, true)).orderBy(asc(E.teamMembers.name)),
    centers: await tx.select({ id: E.workCenters.id, n: E.workCenters.name }).from(E.workCenters).where(eq(E.workCenters.active, true)).orderBy(asc(E.workCenters.name)),
    fields: await tx.select().from(E.customFields).where(and(eq(E.customFields.entity, "measurement"), eq(E.customFields.active, true))).orderBy(asc(E.customFields.position)),
  }));
}

export async function MeasurementNew() {
  const s = await page("producao", { edit: true });
  const L = await lookups(s);
  return (
    <>
      <PageHead title="Nova medição" sub="Informe a obra. Depois inclua os locais a medir (um por janela, porta…) ou importe uma planilha." back={{ href: "/medicoes", label: "Medições" }} />
      <div className="sheet">
        <MeasurementHeader canEdit m={{ work: "", address: "", partnerId: "", partnerLabel: "", salesOrderId: "", measurerId: "", date: today(), dueDate: "", notes: "" }}
          orders={L.orders.map((o) => [o.id, `PV ${o.n} · ${o.cli}`])} team={L.team.map((t) => [t.id, t.n])} />
      </div>
    </>
  );
}

export async function MeasurementPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await page("producao");
  const { id } = await params;
  const L = await lookups(s);
  const d = await s.tx(async (tx) => {
    const [m] = await tx.select().from(E.measurements).where(eq(E.measurements.id, id)).limit(1);
    if (!m) return null;
    const [p] = m.partnerId ? await tx.select({ n: cli }).from(E.partners).where(eq(E.partners.id, m.partnerId)) : [];
    const [so] = m.salesOrderId ? await tx.select({ n: E.salesOrders.number }).from(E.salesOrders).where(eq(E.salesOrders.id, m.salesOrderId)) : [];
    const lines = await tx.select({ l: E.measurementItems, i: E.items, op: E.productionOrders.number }).from(E.measurementItems).leftJoin(E.items, eq(E.items.id, E.measurementItems.itemId))
      .leftJoin(E.productionOrders, eq(E.productionOrders.id, E.measurementItems.productionOrderId)).where(eq(E.measurementItems.measurementId, id)).orderBy(asc(E.measurementItems.position), asc(E.measurementItems.createdAt));
    const ops = await tx.select({ o: E.productionOrders, it: E.items.name, unit: E.items.unit, st: E.productionStages.name, c: E.productionStages.color, kind: E.productionStages.kind,
      asm: sql<string>`(select coalesce(sum(qty),0)::text from assemblies a where a.production_order_id = "production_orders"."id")` })
      .from(E.productionOrders).innerJoin(E.items, eq(E.items.id, E.productionOrders.itemId)).innerJoin(E.productionStages, eq(E.productionStages.id, E.productionOrders.stageId))
      .where(eq(E.productionOrders.measurementId, id)).orderBy(asc(E.productionOrders.number));
    return { m, p, so, lines, ops, wf: await weightFieldId(tx) };
  });
  if (!d) notFound();
  const { m } = d;
  const fields: CField[] = L.fields.map((f) => ({ id: f.id, label: f.label, type: f.type, options: f.options, required: f.required }));
  const st = m.status === "LIBERADA" && d.ops.length ? "PRODUCAO" : m.status;
  const tot = d.lines.length, done = d.lines.filter((x) => x.l.measured).length;
  const free = d.lines.filter((x) => !x.l.productionOrderId);
  const freeQty = free.reduce((a, x) => a + Number(x.l.qty), 0);
  const kg = d.wf ? d.lines.reduce((a, x) => a + Number(x.l.qty) * customNum(x.l.custom[d.wf!]), 0) : 0;
  const pieces = d.lines.reduce((a, x) => a + Number(x.l.qty), 0);
  const floors = new Set(d.lines.map((x) => x.l.floor).filter(Boolean)).size;
  return (
    <>
      <PageHead title={`Medição ${m.number} · ${m.work}`} back={{ href: "/medicoes", label: "Medições" }}
        sub={[d.p?.n, d.so ? `Pedido ${d.so.n}` : null, m.address, `medida em ${fmtD(m.date)}`].filter(Boolean).join(" · ")}
        actions={<>
          <StatusBadge color={MEAS_ST[st].color} label={MEAS_ST[st].label} />
          <BtnLink href={`/producao/obras?q=${encodeURIComponent(m.work)}`} icon="chart">Acompanhamento</BtnLink>
          {s.edit && m.status === "MEDINDO" && <ActionButton className="btn btn-primary" confirm="Liberar a medição para a produção? Todos os locais precisam estar marcados como medidos." action={setMeasurementStatusAction.bind(null, m.id, "LIBERADA")}><Icon name="check" size={16} /> Liberar para produção</ActionButton>}
          {s.edit && m.status === "LIBERADA" && freeQty > 0 && <GenerateOpsButton measurementId={m.id} free={freeQty} noItem={free.filter((x) => !x.l.itemId).length} centers={L.centers.map((c) => [c.id, c.n])} team={L.team.map((t) => [t.id, t.n])} due={m.dueDate ?? ""} />}
          {s.edit && m.status !== "MEDINDO" && <ActionButton className="btn" action={setMeasurementStatusAction.bind(null, m.id, "MEDINDO")}>Reabrir medição</ActionButton>}
          {s.edit && m.status !== "CANCELADA" && !d.ops.length && <ActionButton className="btn btn-ghost" confirm="Cancelar esta medição?" action={setMeasurementStatusAction.bind(null, m.id, "CANCELADA")}>Cancelar</ActionButton>}
          {s.edit && !d.ops.length && <ActionButton className="btn btn-danger" confirm={`Excluir a medição ${m.number} com todos os locais?`} action={deleteMeasurementAction.bind(null, m.id)}><Icon name="trash" size={16} /></ActionButton>}
        </>} />
      <div className="kpis k5" style={{ marginBottom: 16 }}>
        <div className="kpi"><b>{tot ? Math.round((done / tot) * 100) : 0}%</b><span>Medido ({done} de {tot} locais)</span></div>
        <div className="kpi"><b>{floors || "—"}</b><span>Andares</span></div>
        <div className="kpi"><b>{fmtQty(pieces)}</b><span>Peças</span></div>
        <div className="kpi"><b>{d.wf ? `${kg.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg` : "—"}</b><span>{d.wf ? "Peso total" : "Peso (crie o campo Peso)"}</span></div>
        <div className="kpi"><b>{d.ops.length}</b><span>OPs geradas</span></div>
      </div>
      <div className="sheet">
        <MeasurementHeader canEdit={s.edit && m.status !== "CANCELADA"} m={{ id: m.id, work: m.work, address: m.address ?? "", partnerId: m.partnerId ?? "", partnerLabel: d.p?.n ?? "", salesOrderId: m.salesOrderId ?? "", measurerId: m.measurerId ?? "", date: m.date, dueDate: m.dueDate ?? "", notes: m.notes ?? "" }}
          orders={L.orders.map((o) => [o.id, `PV ${o.n} · ${o.cli}`])} team={L.team.map((t) => [t.id, t.n])} />
        {!fields.length && s.access.isAdmin && <p className="muted" style={{ fontSize: 13, margin: 0 }}>Dica: cadastre os campos medidos (Largura, Altura, Vidro, Peso, Tipo, Linha…) em <Link href="/producao/configuracoes/campos-medicao">Produção › Configurações › Campos da medição</Link>.</p>}
        <MeasurementGrid key={d.lines.map((x) => x.l.id + x.l.updatedAt.getTime()).join()} measurementId={m.id} fields={fields} canEdit={s.edit && m.status !== "CANCELADA"} open={m.status === "MEDINDO"}
          lines={d.lines.map(({ l, i, op }) => ({ key: l.id, id: l.id, floor: l.floor ?? "", location: l.location, itemId: l.itemId, itemLabel: i ? `${i.name} · ${i.code}` : "", unit: i?.unit ?? "", description: l.description ?? "", qty: Number(l.qty), custom: l.custom, measured: l.measured, notes: l.notes ?? "", op: l.productionOrderId ? { id: l.productionOrderId, number: op ?? 0 } : null }))} />
        {m.status === "MEDINDO" && tot > 0 && <p className="muted" style={{ fontSize: 13, margin: 0 }}>Quando todos os locais estiverem medidos, use “Liberar para produção” e depois “Gerar OPs”.</p>}
        <Panel id="ops" className="sec-panel" title="Ordens de produção desta medição" sub={`${d.ops.length} OPs`}>
          {d.ops.length ? <div className="tbl solo" style={{ border: 0, borderRadius: 0, maxHeight: "none" }}><table>
            <thead><tr><th className="num">OP</th><th>Produto</th><th className="num">Produzido</th><th className="num">Enviado p/ montagem</th><th>Necessidade</th><th>Etapa</th></tr></thead>
            <tbody>{d.ops.map(({ o, it, unit, st, c, asm }) => <ClickRow key={o.id} href={`/ops/${o.id}`}><td className="num"><b>{o.number}</b></td><td className="desc">{it}</td>
              <td className="num">{fmtQty(o.qtyProduced)} de {fmtQty(o.qty)} {unit}</td><td className="num">{fmtQty(asm)}</td><td className="code">{fmtD(o.needDate)}</td><td><StatusBadge color={c} label={st} /></td></ClickRow>)}</tbody></table></div>
            : <div className="pb muted" style={{ fontSize: 13 }}>Nenhuma OP ainda. Libere a medição e gere as OPs.</div>}
        </Panel>
      </div>
    </>
  );
}
