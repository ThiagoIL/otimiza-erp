import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { page, type PageCtx } from "@/lib/access";
import * as E from "@/db/erp";
import { BtnLink, Empty, PageHead, Panel, StatusBadge } from "@/components/ui";
import { ActionButton, ClickRow, FilterBar, FilterTabs } from "@/components/client";
import { Icon } from "@/components/Icon";
import { AssemblyFromOp, OpBoard, OpHeader, OpStructure, OutputForm, QueueActions, RequisitionButton, StageSelect, type OpCard } from "@/components/ProductionUI";
import { StockMoveButtons } from "@/components/StockMove";
import { Attachments } from "@/components/Attachments";
import { deleteOpAction, noProductionAction, reloadBomAction } from "@/server/production-actions";
import { opCosts } from "@/server/production-costs";
import { balances, loadAttachments } from "@/server/common";
import { fmtMoney, fmtQty } from "@/lib/format";
import { fmtD, today } from "@/lib/dates";
import { PRIORITIES } from "@/lib/consts";

type SP = Record<string, string | undefined>;

async function lookups(s: PageCtx) {
  return s.tx(async (tx) => ({
    stages: await tx.select().from(E.productionStages).orderBy(asc(E.productionStages.position)),
    centers: await tx.select({ id: E.workCenters.id, n: E.workCenters.name }).from(E.workCenters).where(eq(E.workCenters.active, true)).orderBy(asc(E.workCenters.name)),
    team: await tx.select({ id: E.teamMembers.id, n: E.teamMembers.name, role: E.teamMembers.role }).from(E.teamMembers).where(eq(E.teamMembers.active, true)).orderBy(asc(E.teamMembers.name)),
  }));
}

// ---------------------------------------------------------------- Pedidos a produzir
export async function ProductionQueue({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await page("producao");
  const sp = await searchParams;
  const st = sp.st ?? "PENDENTE";
  const L = await lookups(s);
  const d = await s.tx(async (tx) => {
    const where = st === "PRODUZIDO"
      ? and(eq(E.salesOrders.productionStatus, "PRODUZIDO"), sql`${E.salesOrders.status} in ('APROVADO','FATURADO')`)
      : and(eq(E.salesOrders.status, "APROVADO"), eq(E.salesOrders.productionStatus, st));
    const orders = await tx.select({ o: E.salesOrders, cli: sql<string>`coalesce(${E.partners.tradeName}, ${E.partners.name})` }).from(E.salesOrders)
      .innerJoin(E.partners, eq(E.partners.id, E.salesOrders.partnerId)).where(where).orderBy(asc(E.salesOrders.deliveryDate), asc(E.salesOrders.number)).limit(200);
    const ids = orders.map((o) => o.o.id);
    const lines = ids.length ? await tx.select({ l: E.salesOrderItems, i: E.items }).from(E.salesOrderItems).innerJoin(E.items, eq(E.items.id, E.salesOrderItems.itemId)).where(inArray(E.salesOrderItems.orderId, ids)).orderBy(asc(E.salesOrderItems.position)) : [];
    const ops = ids.length ? await tx.select({ id: E.productionOrders.id, n: E.productionOrders.number, so: E.productionOrders.salesOrderId, st: E.productionStages.name, c: E.productionStages.color })
      .from(E.productionOrders).innerJoin(E.productionStages, eq(E.productionStages.id, E.productionOrders.stageId)).where(inArray(E.productionOrders.salesOrderId, ids)) : [];
    const counts = await tx.select({ st: E.salesOrders.productionStatus, n: sql<number>`count(*)::int` }).from(E.salesOrders).where(eq(E.salesOrders.status, "APROVADO")).groupBy(E.salesOrders.productionStatus);
    return { orders, lines, ops, counts };
  });
  const cnt = (k: string) => d.counts.find((c) => c.st === k)?.n ?? 0;
  const hoje = today();
  const centers = L.centers.map((c) => [c.id, c.n] as [string, string]);
  const team = L.team.map((c) => [c.id, `${c.n}${c.role ? " · " + c.role : ""}`] as [string, string]);
  return (
    <>
      <PageHead title="Pedidos a produzir" sub="Pedidos aprovados pelo comercial. A produção decide aqui se cada pedido gera ordem de produção ou se não precisa (ex.: venda de peça que já está no estoque)." />
      <FilterBar solo>
        <FilterTabs name="st" value={st === "PENDENTE" ? "" : st} options={[
          { v: "", label: "Aguardando decisão", n: cnt("PENDENTE") }, { v: "EM_PRODUCAO", label: "Em produção", n: cnt("EM_PRODUCAO") },
          { v: "NAO_NECESSITA", label: "Sem produção", n: cnt("NAO_NECESSITA") }, { v: "PRODUZIDO", label: "Produzidos" }]} />
      </FilterBar>
      {d.orders.length ? (
        <div className="ob-list">
          {d.orders.map(({ o, cli }) => {
            const lines = d.lines.filter((x) => x.l.orderId === o.id);
            const ops = d.ops.filter((x) => x.so === o.id);
            const late = o.deliveryDate && o.deliveryDate < hoje;
            return (
              <section key={o.id} className={`panel${late ? " " : ""}`} style={late ? { boxShadow: "inset 4px 0 0 var(--bad)" } : undefined}>
                <h2 style={{ flexWrap: "wrap" }}>
                  <Link href={`/pedidos/${o.id}`} style={{ textDecoration: "none", color: "inherit" }}>Pedido {o.number}</Link>
                  <span className="muted" style={{ fontWeight: 500 }}>· {cli}</span>
                  <span className={`badge${late ? " bad" : ""}`}>Entrega {fmtD(o.deliveryDate)}</span>
                  {o.deliveryPlace && <span className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}>{o.deliveryPlace}</span>}
                  <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                    {s.edit && st === "PENDENTE" && <QueueActions order={{ id: o.id, number: o.number, client: cli, delivery: o.deliveryDate, notes: o.internalNotes, lines: lines.map(({ l, i }) => ({ itemId: i.id, code: i.code, name: i.name, unit: i.unit, qty: Number(l.qty), fab: i.type === "PRODUTO_ACABADO" || i.type === "SEMIACABADO" })) }} centers={centers} team={team} />}
                    {s.edit && st === "NAO_NECESSITA" && <ActionButton className="btn btn-sm" action={noProductionAction.bind(null, o.id, true)}>Voltar para a fila</ActionButton>}
                    {s.edit && st === "EM_PRODUCAO" && <BtnLink small href={`/ops/nova?pedido=${o.id}`} icon="plus">Outra OP</BtnLink>}
                  </span>
                </h2>
                <div className="pb" style={{ paddingTop: 10 }}>
                  <table className="fl-tab"><tbody>{lines.map(({ l, i }) => (
                    <tr key={l.id}><td className="desc" style={{ minWidth: 0 }}>{i.name}<span className="muted"> · {i.code}</span>{l.notes && <div className="muted" style={{ fontSize: 12 }}>{l.notes}</div>}</td><td className="num" style={{ width: 140 }}>{fmtQty(l.qty)} {i.unit}</td></tr>))}</tbody></table>
                  {o.internalNotes && <p className="muted" style={{ fontSize: 12.5, margin: "8px 0 0" }}>{o.internalNotes}</p>}
                  {ops.length > 0 && <div className="tl" style={{ marginTop: 10 }}>{ops.map((op) => <Link key={op.id} href={`/ops/${op.id}`} style={{ textDecoration: "none" }}><StatusBadge color={op.c} label={`OP ${op.n} · ${op.st}`} /></Link>)}</div>}
                </div>
              </section>
            );
          })}
        </div>
      ) : <div className="panel"><Empty title={st === "PENDENTE" ? "Nenhum pedido aguardando a produção" : "Nada nesta situação"}>{st === "PENDENTE" ? "Quando o comercial aprovar um pedido, ele aparece aqui." : ""}</Empty></div>}
    </>
  );
}

// ---------------------------------------------------------------- Ordens de produção
export async function OpsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await page("producao");
  const sp = await searchParams;
  const mode = sp.modo === "lista" ? "lista" : "quadro";
  const L = await lookups(s);
  const c: SQL[] = [eq(E.productionOrders.tenantId, s.tenant.id)];
  if (sp.q) { const q = `%${sp.q.trim()}%`; c.push(or(ilike(E.items.code, q), ilike(E.items.name, q), ilike(E.partners.name, q), ilike(E.partners.tradeName, q), sql`${E.productionOrders.number}::text = ${sp.q.trim()}`)!); }
  if (sp.centro) c.push(eq(E.productionOrders.workCenterId, sp.centro));
  if (sp.resp) c.push(eq(E.productionOrders.responsibleId, sp.resp));
  if (sp.prio) c.push(eq(E.productionOrders.priority, sp.prio));
  if (sp.etapa) c.push(eq(E.productionOrders.stageId, sp.etapa));
  if (sp.atraso) c.push(sql`${E.productionOrders.needDate} < ${today()} and ${E.productionStages.kind} not in ('finalizada','cancelada')`);
  // por padrão só as OPs em aberto; concluídas e canceladas aparecem quando escolhidas
  const sit = sp.sit ?? "";
  if (sit === "concluidas") c.push(sql`${E.productionStages.kind} = 'finalizada'`);
  else if (sit === "canceladas") c.push(sql`${E.productionStages.kind} = 'cancelada'`);
  else if (sit !== "todas") c.push(sql`${E.productionStages.kind} not in ('finalizada', 'cancelada')`);
  const rows = await s.tx(async (tx) => tx.select({
    o: E.productionOrders, i: E.items, cli: sql<string | null>`coalesce(${E.partners.tradeName}, ${E.partners.name})`, pv: E.salesOrders.number, wc: E.workCenters.name, resp: E.teamMembers.name, kind: E.productionStages.kind,
    req: sql<string>`(select coalesce(sum(qty_required),0)::text from production_order_components c where c.production_order_id = "production_orders"."id")`,
    done: sql<string>`(select coalesce(sum(least(qty_done, qty_required)),0)::text from production_order_components c where c.production_order_id = "production_orders"."id")`,
    live: sql<boolean>`exists (select 1 from time_entries t where t.production_order_id = "production_orders"."id" and t."end" is null)`,
  }).from(E.productionOrders).innerJoin(E.items, eq(E.items.id, E.productionOrders.itemId)).innerJoin(E.productionStages, eq(E.productionStages.id, E.productionOrders.stageId))
    .leftJoin(E.partners, eq(E.partners.id, E.productionOrders.partnerId)).leftJoin(E.salesOrders, eq(E.salesOrders.id, E.productionOrders.salesOrderId))
    .leftJoin(E.workCenters, eq(E.workCenters.id, E.productionOrders.workCenterId)).leftJoin(E.teamMembers, eq(E.teamMembers.id, E.productionOrders.responsibleId))
    .where(and(...c)).orderBy(desc(E.productionOrders.number)));
  const cards: OpCard[] = rows.map((r) => {
    const req = Number(r.req), done = Number(r.done);
    const prog = r.kind === "finalizada" ? 100 : req > 0 ? Math.round((done / req) * 100) : Math.round((Number(r.o.qtyProduced) / Math.max(1e-9, Number(r.o.qty))) * 100);
    return { id: r.o.id, number: r.o.number, item: r.i.name, qty: Number(r.o.qty), produced: Number(r.o.qtyProduced), unit: r.i.unit, client: r.cli, order: r.pv, center: r.wc, resp: r.resp,
      priority: r.o.priority, needDate: r.o.needDate, stageId: r.o.stageId, progress: Math.min(100, prog), live: r.live };
  });
  const stages = L.stages.filter((x) => x.kind !== "cancelada" || sp.canceladas).map((x) => ({ id: x.id, name: x.name, color: x.color, kind: x.kind }));
  const hoje = today();
  const qs = (m: string) => `/ops?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([k, v]) => v && k !== "modo") as [string, string][]), ...(m === "lista" ? { modo: "lista" } : {}) })}`;
  return (
    <>
      <PageHead title="Ordens de produção" sub={`Acompanhe cada OP pelas etapas da fábrica. ${mode === "quadro" ? "Arraste um cartão para mudar a etapa." : "Clique numa linha para abrir a OP."}`}
        actions={<>
          <div className="tabs" role="group" aria-label="Modo de visualização">
            <Link className="btn btn-ghost btn-sm" href={qs("quadro")} style={mode === "quadro" ? { background: "var(--surface)", fontWeight: 700 } : undefined}><Icon name="board" size={15} /> Quadro</Link>
            <Link className="btn btn-ghost btn-sm" href={qs("lista")} style={mode === "lista" ? { background: "var(--surface)", fontWeight: 700 } : undefined}><Icon name="list" size={15} /> Lista</Link>
          </div>
          {s.edit && <BtnLink href="/ops/nova" primary icon="plus">Nova OP</BtnLink>}
        </>} />
      <FilterBar solo={mode === "quadro"} right={<span className="count">{cards.length} OPs</span>}>
        {mode === "lista" && <input type="hidden" name="modo" value="lista" />}
        <div className="search"><Icon name="search" size={16} /><input type="search" name="q" defaultValue={sp.q ?? ""} placeholder="Nº, item ou cliente" aria-label="Buscar OP" /></div>
        <select name="centro" defaultValue={sp.centro ?? ""} aria-label="Centro"><option value="">Todos os centros</option>{L.centers.map((x) => <option key={x.id} value={x.id}>{x.n}</option>)}</select>
        <select name="resp" defaultValue={sp.resp ?? ""} aria-label="Responsável"><option value="">Todos os responsáveis</option>{L.team.map((x) => <option key={x.id} value={x.id}>{x.n}</option>)}</select>
        <select name="prio" defaultValue={sp.prio ?? ""} aria-label="Prioridade"><option value="">Todas as prioridades</option>{Object.keys(PRIORITIES).map((p) => <option key={p}>{p}</option>)}</select>
        {mode === "lista" && <select name="etapa" defaultValue={sp.etapa ?? ""} aria-label="Etapa"><option value="">Todas as etapas</option>{L.stages.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}
        <label className="chk"><input type="checkbox" name="atraso" value="1" defaultChecked={!!sp.atraso} /> Só atrasadas</label>
        <select name="sit" defaultValue={sp.sit ?? ""} aria-label="Situação"><option value="">Em aberto</option><option value="concluidas">Concluídas</option><option value="canceladas">Canceladas</option><option value="todas">Todas</option></select>
      </FilterBar>
      {!L.stages.length ? <div className="panel"><Empty title="Cadastre as etapas da produção">O quadro usa as etapas como colunas.<br /><BtnLink href="/producao/configuracoes" primary>Cadastrar etapas</BtnLink></Empty></div>
        : mode === "quadro" ? <OpBoard stages={stages} ops={cards} canEdit={s.edit} /> : (
          <div className="tbl">
            {rows.length ? (
              <table><thead><tr><th className="num">Nº</th><th>Produto</th><th className="num">Produzido</th><th>Cliente / pedido</th><th>Necessidade</th><th>Etapa</th><th>Centro / responsável</th><th>Progresso</th></tr></thead>
                <tbody>{rows.map((r, k) => {
                  const st = L.stages.find((x) => x.id === r.o.stageId);
                  const late = r.o.needDate && r.o.needDate < hoje && r.kind !== "finalizada" && r.kind !== "cancelada";
                  return (
                    <ClickRow key={r.o.id} href={`/ops/${r.o.id}`}><td className="num"><b>{r.o.number}</b></td><td className="desc">{r.i.name}<div className="t-sub code">{r.i.code}</div></td>
                      <td className="num">{fmtQty(r.o.qtyProduced)} de {fmtQty(r.o.qty)}</td>
                      <td style={{ fontSize: 12.5 }}>{r.cli ?? "—"}{r.pv && <div className="muted">PV {r.pv}</div>}</td>
                      <td><span className={`badge${late ? " bad" : ""}`}>{fmtD(r.o.needDate)}</span></td>
                      <td>{st && <StatusBadge color={st.color} label={st.name} />}</td><td>{r.wc ?? "—"}{r.resp && <div className="t-sub">{r.resp}</div>}</td>
                      <td><div className="cell-prog" style={{ ["--c" as string]: st?.color ?? "#2E7D4F" }}><div className="prog"><i style={{ width: `${cards[k].progress}%` }} /></div><span className="prog-t">{cards[k].progress}%</span></div></td>
                    </ClickRow>
                  );
                })}</tbody></table>
            ) : <Empty title="Nenhuma OP neste filtro">Ajuste a busca ou crie uma ordem de produção.</Empty>}
          </div>
        )}
    </>
  );
}

async function opFormLookups(s: PageCtx) {
  return s.tx(async (tx) => ({
    orders: await tx.select({ id: E.salesOrders.id, n: E.salesOrders.number, cli: sql<string>`coalesce(${E.partners.tradeName}, ${E.partners.name})` }).from(E.salesOrders)
      .innerJoin(E.partners, eq(E.partners.id, E.salesOrders.partnerId)).where(eq(E.salesOrders.status, "APROVADO")).orderBy(desc(E.salesOrders.number)),
    clients: await tx.select({ id: E.partners.id, n: sql<string>`coalesce(${E.partners.tradeName}, ${E.partners.name})` }).from(E.partners).where(sql`'Cliente' = any(${E.partners.kinds})`).orderBy(sql`2`),
  }));
}

export async function OpNew({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await page("producao", { edit: true });
  const sp = await searchParams;
  const [L, F] = await Promise.all([lookups(s), opFormLookups(s)]);
  const first = L.stages.find((x) => x.kind === "aberta") ?? L.stages[0];
  return (
    <>
      <PageHead title="Nova ordem de produção" sub="Escolha o produto: a estrutura dele é copiada para a OP já multiplicada pela quantidade." back={{ href: "/ops", label: "Ordens de produção" }} />
      <div className="sheet">
        <OpHeader canEdit op={{ itemId: "", itemLabel: "", qty: 1, salesOrderId: sp.pedido ?? "", partnerId: "", workCenterId: "", responsibleId: "", priority: "Normal", startDate: today(), needDate: "", notes: "", stageId: first?.id }}
          orders={F.orders.map((o) => [o.id, `PV ${o.n} · ${o.cli}`])} clients={F.clients.map((c) => [c.id, c.n])} centers={L.centers.map((c) => [c.id, c.n])} team={L.team.map((c) => [c.id, c.n])}
          stages={L.stages.filter((x) => x.kind !== "cancelada").map((x) => [x.id, x.name])} />
      </div>
    </>
  );
}

export async function OpDetail({ params }: { params: Promise<{ id: string }> }) {
  const s = await page("producao");
  const { id } = await params;
  const [L, F] = await Promise.all([lookups(s), opFormLookups(s)]);
  const d = await s.tx(async (tx) => {
    const [op] = await tx.select().from(E.productionOrders).where(eq(E.productionOrders.id, id)).limit(1);
    if (!op) return null;
    const [item] = await tx.select().from(E.items).where(eq(E.items.id, op.itemId));
    const comps = await tx.select({ c: E.productionOrderComponents, i: E.items }).from(E.productionOrderComponents).leftJoin(E.items, eq(E.items.id, E.productionOrderComponents.itemId))
      .where(eq(E.productionOrderComponents.productionOrderId, id)).orderBy(asc(E.productionOrderComponents.position));
    const moves = await tx.select({ m: E.stockMovements, i: E.items, l: E.stockLocations.code }).from(E.stockMovements).innerJoin(E.items, eq(E.items.id, E.stockMovements.itemId))
      .innerJoin(E.stockLocations, eq(E.stockLocations.id, E.stockMovements.locationId)).where(eq(E.stockMovements.productionOrderId, id)).orderBy(desc(E.stockMovements.date));
    const outputs = await tx.select().from(E.productionOutputs).where(eq(E.productionOutputs.productionOrderId, id)).orderBy(desc(E.productionOutputs.date));
    const asms = await tx.select({ a: E.assemblies, done: sql<string>`(select coalesce(sum(least(qty_done, qty)),0)::text from assembly_parts p where p.assembly_id = "assemblies"."id")`, tot: sql<string>`(select coalesce(sum(qty),0)::text from assembly_parts p where p.assembly_id = "assemblies"."id")` })
      .from(E.assemblies).where(eq(E.assemblies.productionOrderId, id)).orderBy(asc(E.assemblies.number));
    const times = await tx.select({ t: E.timeEntries, p: E.teamMembers.name, st: E.productionStages.name }).from(E.timeEntries).innerJoin(E.teamMembers, eq(E.teamMembers.id, E.timeEntries.memberId))
      .leftJoin(E.productionStages, eq(E.productionStages.id, E.timeEntries.stageId)).where(eq(E.timeEntries.productionOrderId, id)).orderBy(desc(E.timeEntries.date));
    const [so] = op.salesOrderId ? await tx.select().from(E.salesOrders).where(eq(E.salesOrders.id, op.salesOrderId)) : [];
    const [cli] = op.partnerId ? await tx.select().from(E.partners).where(eq(E.partners.id, op.partnerId)) : [];
    const locs = await tx.select().from(E.stockLocations).where(eq(E.stockLocations.active, true)).orderBy(asc(E.stockLocations.code));
    const compIds = comps.map((c) => c.c.itemId).filter(Boolean) as string[];
    const bal = await balances(tx, { itemIds: compIds });
    const costs = s.access.costs ? await opCosts(tx, op) : null;
    const files = await loadAttachments(tx, "production_order", id);
    return { op, item, comps, moves, outputs, asms, times, so, cli, locs, bal, costs, files };
  });
  if (!d) notFound();
  const { op, item } = d;
  const stage = L.stages.find((x) => x.id === op.stageId);
  const withdrawn = new Map<string, number>();
  for (const { m } of d.moves) if (m.type === "SAIDA") withdrawn.set(m.itemId, (withdrawn.get(m.itemId) ?? 0) + Number(m.qty));
  const compRows = d.comps.map(({ c, i }) => ({ id: c.id, itemId: c.itemId, code: i?.code ?? null, name: i?.name ?? c.description ?? "—", unit: i?.unit ?? "", required: Number(c.qtyRequired), done: Number(c.qtyDone), withdrawn: c.itemId ? withdrawn.get(c.itemId) ?? 0 : 0, fromBom: c.fromBom }));
  const balMap: Record<string, Record<string, number>> = {};
  for (const [k, v] of d.bal) { const [it, lc] = k.split("|"); (balMap[it] ??= {})[lc] = v; }
  const locOpts = d.locs.map((l) => [l.id, `${l.code} · ${l.name}`] as [string, string]);
  const sent = d.asms.reduce((a, x) => a + Number(x.a.qty), 0);
  const free = Number(op.qtyProduced) - sent;
  const left = Math.max(0, Number(op.qty) - Number(op.qtyProduced));
  const defLoc = item.defaultLocationId ?? d.locs.find((l) => l.type === "Expedição")?.id ?? d.locs[0]?.id ?? "";
  const stages = L.stages.map((x) => ({ id: x.id, name: x.name, color: x.color, kind: x.kind }));
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  return (
    <>
      <PageHead title={`OP ${op.number} · ${item.name}`} back={{ href: "/ops", label: "Ordens de produção" }}
        sub={[`${fmtQty(op.qty)} ${item.unit}`, d.cli ? d.cli.tradeName || d.cli.name : null, d.so ? `Pedido ${d.so.number}` : null, op.needDate ? `necessidade ${fmtD(op.needDate)}` : null].filter(Boolean).join(" · ")}
        actions={<>
          {s.edit ? <StageSelect opId={op.id} stageId={op.stageId} stages={stages} /> : stage && <StatusBadge color={stage.color} label={stage.name} />}
          {s.edit && <ActionButton className="btn btn-danger" confirm={`Excluir a OP ${op.number}?`} action={deleteOpAction.bind(null, op.id)}><Icon name="trash" size={16} /></ActionButton>}
        </>} />
      <div className="kpis k5" style={{ marginBottom: 16 }}>
        <div className="kpi"><b>{fmtQty(op.qtyProduced)}<small className="muted" style={{ fontSize: 15 }}> / {fmtQty(op.qty)}</small></b><span>Produzido ({item.unit})</span></div>
        <div className="kpi"><b>{pct(compRows.reduce((a, r) => a + Math.min(r.done, r.required), 0), compRows.reduce((a, r) => a + r.required, 0))}</b><span>Estrutura apontada</span></div>
        <div className="kpi"><b>{fmtQty(sent)}</b><span>Enviado para montagem</span></div>
        <div className="kpi"><b>{d.moves.filter((x) => x.m.type === "SAIDA").length}</b><span>Retiradas de estoque</span></div>
        <div className="kpi"><b>{d.times.reduce((a, x) => a + Number(x.t.hours), 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h</b><span>Horas apontadas</span></div>
      </div>
      <div className="sheet">
        <nav className="sec-nav"><a href="#dados">Dados da OP</a><a href="#estrutura">Estrutura</a><a href="#producao">Produção apontada</a><a href="#retiradas">Retiradas de estoque</a><a href="#montagens">Montagens</a><a href="#horas">Horas</a>{d.costs && <a href="#custos">Custos</a>}<a href="#anexos">Anexos</a></nav>
        <div id="dados">
          <OpHeader canEdit={s.edit} op={{ id: op.id, itemId: op.itemId, itemLabel: `${item.name} · ${item.code}`, qty: Number(op.qty), salesOrderId: op.salesOrderId ?? "", partnerId: op.partnerId ?? "", workCenterId: op.workCenterId ?? "",
            responsibleId: op.responsibleId ?? "", priority: op.priority, startDate: op.startDate ?? "", needDate: op.needDate ?? "", notes: op.notes ?? "" }}
            orders={[...(d.so && d.so.status !== "APROVADO" ? [[d.so.id, `PV ${d.so.number}`] as [string, string]] : []), ...F.orders.map((o) => [o.id, `PV ${o.n} · ${o.cli}`] as [string, string])]}
            clients={F.clients.map((c) => [c.id, c.n])} centers={L.centers.map((c) => [c.id, c.n])} team={L.team.map((c) => [c.id, c.n])} />
        </div>
        <OpStructure opId={op.id} rows={compRows} canEdit={s.edit} />
        {s.edit && compRows.length === 0 && <div style={{ marginTop: -8 }}><ActionButton className="btn btn-sm" action={reloadBomAction.bind(null, op.id)}>Recarregar a estrutura do cadastro do item</ActionButton></div>}

        <Panel id="producao" className="sec-panel" title="Produção apontada" sub={`${fmtQty(op.qtyProduced)} de ${fmtQty(op.qty)} ${item.unit}`}>
          {d.outputs.length > 0 && <div className="tbl solo" style={{ border: 0, borderRadius: 0, maxHeight: "none" }}><table>
            <thead><tr><th>Data</th><th className="num">Quantidade</th><th>Entrada no estoque</th><th>Observação</th><th>Usuário</th></tr></thead>
            <tbody>{d.outputs.map((o) => <tr key={o.id}><td className="code">{fmtD(o.date)}</td><td className="num">{fmtQty(o.qty)} {item.unit}</td><td>{o.locationId ? d.locs.find((l) => l.id === o.locationId)?.name ?? "Sim" : "Não"}</td><td>{o.notes ?? "—"}</td><td>{o.userName}</td></tr>)}</tbody></table></div>}
          {s.edit && left > 0 && <div className="pb" style={{ borderTop: d.outputs.length ? "1px solid var(--line-2)" : 0 }}><OutputForm key={left} opId={op.id} left={left} unit={item.unit} locations={locOpts} defaultLocation={defLoc} /></div>}
          {!d.outputs.length && !(s.edit && left > 0) && <div className="pb muted">Nada apontado.</div>}
        </Panel>

        <Panel id="retiradas" className="sec-panel" title="Retiradas de estoque para esta OP" sub={`${d.moves.length} lançamentos`}
          actions={s.edit && <><RequisitionButton opId={op.id} rows={compRows} locations={locOpts} balances={balMap} /><StockMoveButtons locations={locOpts} only={["SAIDA"]} ops={[[op.id, `OP ${op.number}`]]} /></>}>
          {d.moves.length ? <div className="tbl solo" style={{ border: 0, borderRadius: 0, maxHeight: "none" }}><table>
            <thead><tr><th>Data</th><th>Tipo</th><th>Item</th><th>Local</th><th className="num">Quantidade</th>{s.access.costs && <th className="num">Valor</th>}<th>Usuário</th></tr></thead>
            <tbody>{d.moves.map(({ m, i, l }) => <tr key={m.id}><td className="code">{fmtD(m.date)}</td><td>{m.type === "SAIDA" ? <span className="mv-out">Retirada</span> : m.type === "PRODUCAO" ? <span className="mv-in">Entrada de produção</span> : m.type}</td>
              <td className="desc">{i.name}<div className="muted" style={{ fontSize: 12, fontWeight: 400 }}>{i.code}</div></td><td>{l}</td><td className="num">{fmtQty(m.qty)} {i.unit}</td>
              {s.access.costs && <td className="num">{fmtMoney(Number(m.qty) * Number(m.unitCost))}</td>}<td style={{ fontSize: 12.5 }}>{m.userName}</td></tr>)}</tbody></table></div>
            : <div className="pb muted" style={{ fontSize: 13 }}>Nenhuma retirada de estoque para esta OP ainda. Use “Requisitar pela estrutura” ou “Saída”.</div>}
        </Panel>

        <Panel id="montagens" className="sec-panel" title="Montagens desta OP" sub={`${fmtQty(sent)} de ${fmtQty(op.qtyProduced)} produzidas enviadas`}
          actions={s.edit && <AssemblyFromOp opId={op.id} free={free} unit={item.unit} defaultName={`${item.name}${d.cli ? " · " + (d.cli.tradeName || d.cli.name) : ""}`} team={L.team.map((c) => [c.id, c.n])} due={op.needDate} />}>
          {d.asms.length ? <div className="tbl solo" style={{ border: 0, borderRadius: 0, maxHeight: "none" }}><table>
            <thead><tr><th className="num">Nº</th><th>Montagem</th><th className="num">Quantidade</th><th>Previsão</th><th>Andamento</th><th>Situação</th></tr></thead>
            <tbody>{d.asms.map(({ a, done, tot }) => <ClickRow key={a.id} href={`/montagens/${a.id}`}><td className="num"><b>{a.number}</b></td><td className="desc">{a.name}</td><td className="num">{fmtQty(a.qty)}</td><td className="code">{fmtD(a.dueDate)}</td>
              <td><div className="cell-prog"><div className="prog"><i style={{ width: `${Number(tot) ? (Number(done) / Number(tot)) * 100 : 0}%` }} /></div><span className="prog-t">{pct(Number(done), Number(tot))}</span></div></td>
              <td>{a.completedAt ? <span className="badge ok">Concluída</span> : <span className="badge">Em andamento</span>}</td></ClickRow>)}</tbody></table></div>
            : <div className="pb muted" style={{ fontSize: 13 }}>Nenhuma montagem. Depois de apontar a produção, envie as peças prontas para a montagem.</div>}
        </Panel>

        <Panel id="horas" className="sec-panel" title="Horas apontadas" actions={<BtnLink small href={`/apontamentos?op=${op.id}`} icon="clock">Apontar horas</BtnLink>}>
          {d.times.length ? <div className="tbl solo" style={{ border: 0, borderRadius: 0, maxHeight: "none" }}><table>
            <thead><tr><th>Data</th><th>Pessoa</th><th>Etapa</th><th>Início</th><th>Fim</th><th className="num">Horas</th></tr></thead>
            <tbody>{d.times.map(({ t, p, st }) => <tr key={t.id}><td className="code">{fmtD(t.date)}</td><td>{p}</td><td>{st ?? "—"}</td><td className="code">{t.start}</td><td className="code">{t.end ?? <span className="live"><span className="live-dot" />agora</span>}</td><td className="num">{Number(t.hours).toLocaleString("pt-BR")}</td></tr>)}</tbody></table></div>
            : <div className="pb muted" style={{ fontSize: 13 }}>Nenhuma hora apontada.</div>}
        </Panel>

        {d.costs && (
          <Panel id="custos" className="sec-panel" title="Custos da OP" sub="visível só para perfis com acesso a custos">
            <div className="pb op-res"><table className="mini">
              <thead><tr><th /><th className="num">Previsto</th><th className="num">Realizado</th><th className="num">Diferença</th></tr></thead>
              <tbody>
                <tr><td>Materiais</td><td className="num">{fmtMoney(d.costs.prev.mat)}</td><td className="num">{fmtMoney(d.costs.real.mat)}</td><td className="num">{fmtMoney(d.costs.real.mat - d.costs.prev.mat)}</td></tr>
                <tr><td>Mão de obra</td><td className="num">{fmtMoney(d.costs.prev.mo)} <span className="muted">{d.costs.prev.hours.toLocaleString("pt-BR")} h</span></td><td className="num">{fmtMoney(d.costs.real.mo)} <span className="muted">{d.costs.real.hours.toLocaleString("pt-BR")} h</span></td><td className="num">{fmtMoney(d.costs.real.mo - d.costs.prev.mo)}</td></tr>
                <tr className="b"><td>Total</td><td className="num">{fmtMoney(d.costs.prev.total)}</td><td className="num">{fmtMoney(d.costs.real.total)}</td><td className={`num${d.costs.real.total > d.costs.prev.total * 1.05 ? " t-bad" : ""}`}>{fmtMoney(d.costs.real.total - d.costs.prev.total)}</td></tr>
                <tr><td>Custo por unidade</td><td className="num">{fmtMoney(d.costs.prev.total / Math.max(1e-9, Number(op.qty)))}</td><td className="num">{fmtMoney(d.costs.real.total / Math.max(1e-9, Number(op.qty)))}</td><td /></tr>
              </tbody></table></div>
          </Panel>
        )}
        <Attachments entity="production_order" entityId={op.id} rows={d.files} canEdit={s.edit} />
      </div>
    </>
  );
}
