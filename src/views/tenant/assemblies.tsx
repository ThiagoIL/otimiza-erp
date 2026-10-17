import Link from "next/link";
import { Sel } from "@/components/SearchPicker";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { page } from "@/lib/access";
import * as E from "@/db/erp";
import { BtnLink, Empty, PageHead, Panel } from "@/components/ui";
import { ActionButton, ClickRow, FilterBar, FilterTabs } from "@/components/client";
import { DeleteShipment, ShipLineApontar, ShipmentButton } from "@/components/ShipmentUI";
import { PrintButton } from "@/components/PrintButton";
import { companyHeader } from "@/server/common";
import { customNum, weightFieldId } from "@/server/production-common";
import { Icon } from "@/components/Icon";
import { AssemblyHeaderEdit, AssemblyTree } from "@/components/AssemblyTree";
import { NotifyButton } from "@/components/Comm";
import { concludeAssemblyAction, deleteAssemblyAction } from "@/server/assembly-actions";
import { fmtQty } from "@/lib/format";
import { fmtD, today } from "@/lib/dates";

type SP = Record<string, string | undefined>;
const ST = { "A iniciar": "#6B7785", "Em andamento": "#1E3A5F", "Concluída": "#2E7D4F" } as Record<string, string>;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export async function AssembliesList({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await page("producao");
  const sp = await searchParams;
  const d = await s.tx(async (tx) => ({
    rows: await tx.select({ a: E.assemblies, op: E.productionOrders.number, opId: E.productionOrders.id, cli: sql<string | null>`coalesce(${E.partners.tradeName}, ${E.partners.name})`, resp: E.teamMembers.name,
      tot: sql<string>`(select coalesce(sum(qty),0)::text from assembly_parts p where p.assembly_id = "assemblies"."id")`,
      done: sql<string>`(select coalesce(sum(least(qty_done, qty)),0)::text from assembly_parts p where p.assembly_id = "assemblies"."id")`,
      pend: sql<number>`(select count(*)::int from assembly_locations l join assembly_stages st on st.id = l.stage_id where l.assembly_id = "assemblies"."id" and st.kind = 'pendencia')`,
      locs: sql<number>`(select count(*)::int from assembly_locations l where l.assembly_id = "assemblies"."id" and not exists (select 1 from assembly_locations c where c.parent_id = l.id))`,
      team: sql<string[]>`(select coalesce(array_agg(distinct m.name), '{}') from assembly_locations l join team_members m on m.id in (l.installer_id, l.helper_id) where l.assembly_id = "assemblies"."id")`,
    }).from(E.assemblies).innerJoin(E.productionOrders, eq(E.productionOrders.id, E.assemblies.productionOrderId)).leftJoin(E.partners, eq(E.partners.id, E.assemblies.partnerId))
      .leftJoin(E.teamMembers, eq(E.teamMembers.id, E.assemblies.responsibleId)).orderBy(desc(E.assemblies.number)),
    team: await tx.select({ id: E.teamMembers.id, n: E.teamMembers.name }).from(E.teamMembers).orderBy(asc(E.teamMembers.name)),
  }));
  const hoje = today();
  let rows = d.rows.map((r) => {
    const tot = Number(r.tot), done = Number(r.done);
    const status = r.a.completedAt ? "Concluída" : done === 0 && !r.pend ? "A iniciar" : "Em andamento";
    return { ...r, totN: tot, doneN: done, pct: tot ? (done / tot) * 100 : 0, status, late: !!(r.a.dueDate && !r.a.completedAt && r.a.dueDate < hoje) };
  });
  const all = rows.length;
  const cnt = { ativas: rows.filter((r) => r.status !== "Concluída").length, late: rows.filter((r) => r.late).length, conc: rows.filter((r) => r.status === "Concluída").length };
  const st = sp.st ?? "ativas";
  if (st === "ativas") rows = rows.filter((r) => r.status !== "Concluída"); else if (st === "late") rows = rows.filter((r) => r.late); else if (st === "conc") rows = rows.filter((r) => r.status === "Concluída");
  if (sp.resp) { const n = d.team.find((t) => t.id === sp.resp)?.n; rows = rows.filter((r) => r.a.responsibleId === sp.resp || (n && r.team.includes(n))); }
  if (sp.q) { const q = norm(sp.q); rows = rows.filter((r) => norm(`${r.a.number} ${r.a.name} ${r.cli ?? ""} ${r.a.address ?? ""} OP ${r.op}`).includes(q)); }
  rows.sort((a, b) => Number(b.late) - Number(a.late) || Number(a.status === "Concluída") - Number(b.status === "Concluída") || (a.a.dueDate ?? "").localeCompare(b.a.dueDate ?? ""));
  return (
    <>
      <PageHead title="Montagens" sub="Montagens geradas a partir das ordens de produção: o que foi produzido segue para montar no cliente, na obra ou no veículo. Crie uma montagem pela OP, em “Enviar para montagem”." />
      <FilterBar right={<span className="count">{rows.length} {rows.length === 1 ? "montagem" : "montagens"}</span>}
        tabs={<FilterTabs name="st" value={st === "ativas" ? "" : st} options={[{ v: "", label: "Em andamento", n: cnt.ativas }, { v: "late", label: "Atrasadas", n: cnt.late }, { v: "conc", label: "Concluídas", n: cnt.conc }, { v: "todas", label: "Todas", n: all }]} />}>
        <div className="search"><Icon name="search" size={16} /><input type="search" name="q" defaultValue={sp.q ?? ""} placeholder="Montagem, cliente, local ou OP" aria-label="Buscar montagem" /></div>
        <Sel name="resp" defaultValue={sp.resp ?? ""} aria-label="Pessoa"><option value="">Toda a equipe</option>{d.team.map((t) => <option key={t.id} value={t.id}>{t.n}</option>)}</Sel>
      </FilterBar>
      {rows.length ? (
        <div className="ob-list" style={{ marginTop: 12 }}>
          {rows.map((r) => (
            <Link key={r.a.id} className={`ob${r.late ? " late" : ""}`} href={`/montagens/${r.a.id}`}>
              <div className="ob-main"><span className="muted ob-n">Montagem {r.a.number} · OP {r.op} · {fmtQty(r.a.qty)} un.</span><b>{r.a.name}</b><small>{r.cli ?? "—"}{r.a.address ? ` · ${r.a.address}` : ""}</small></div>
              <div className="ob-prog"><div className="cell-prog" style={{ ["--c" as string]: r.late ? "#B3261E" : ST[r.status] }}><div className="prog"><i style={{ width: `${Math.min(100, r.pct)}%` }} /></div><span className="prog-t">{Math.round(r.pct)}%</span></div>
                <small>{fmtQty(r.doneN)} de {fmtQty(r.totN)} peças · {r.locs} {r.locs === 1 ? "local" : "locais"}{r.pend ? <> · <span className="t-bad">{r.pend} com pendência</span></> : null}</small></div>
              <span className="avs">{r.team.slice(0, 5).map((n) => <span key={n} className="avatar sm" title={n}>{n.split(/\s+/).slice(0, 2).map((w) => w[0]).join("")}</span>)}</span>
              <dl className="mt-meta"><div><dt>{r.a.completedAt ? "Concluída em" : "Previsão"}</dt><dd className={r.late ? "t-bad" : ""}>{fmtD(r.a.completedAt ?? r.a.dueDate)}</dd></div></dl>
              <span className="badge stat-badge" style={{ ["--c" as string]: ST[r.status] }}>{r.status}</span>
            </Link>
          ))}
        </div>
      ) : <div className="panel"><Empty title={all ? "Nenhuma montagem neste filtro" : "Nenhuma montagem ainda"}>{all ? "Ajuste a busca ou os filtros." : "Aponte a produção numa OP e use “Enviar para montagem”."}</Empty></div>}
    </>
  );
}

export async function AssemblyPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await page("producao");
  const { id } = await params;
  const d = await s.tx(async (tx) => {
    const [a] = await tx.select().from(E.assemblies).where(eq(E.assemblies.id, id)).limit(1);
    if (!a) return null;
    const [op] = await tx.select({ op: E.productionOrders, it: E.items.name }).from(E.productionOrders).innerJoin(E.items, eq(E.items.id, E.productionOrders.itemId)).where(eq(E.productionOrders.id, a.productionOrderId));
    const [cli] = a.partnerId ? await tx.select().from(E.partners).where(eq(E.partners.id, a.partnerId)) : [];
    const locs = await tx.select().from(E.assemblyLocations).where(eq(E.assemblyLocations.assemblyId, id)).orderBy(asc(E.assemblyLocations.position), asc(E.assemblyLocations.createdAt));
    const parts = await tx.select({ p: E.assemblyParts, i: E.items }).from(E.assemblyParts).leftJoin(E.items, eq(E.items.id, E.assemblyParts.itemId)).where(eq(E.assemblyParts.assemblyId, id)).orderBy(asc(E.assemblyParts.createdAt));
    const stages = await tx.select().from(E.assemblyStages).orderBy(asc(E.assemblyStages.position));
    const team = await tx.select().from(E.teamMembers).where(eq(E.teamMembers.active, true)).orderBy(asc(E.teamMembers.name));
    const ships = await tx.select({ s: E.shipments, n: sql<number>`(select count(*)::int from shipment_items x where x.shipment_id = "shipments"."id")`, q: sql<string>`(select coalesce(sum(x.qty),0)::text from shipment_items x where x.shipment_id = "shipments"."id")` })
      .from(E.shipments).where(eq(E.shipments.assemblyId, id)).orderBy(desc(E.shipments.number));
    const shipped = await tx.select({ p: E.shipmentItems.partId, q: sql<string>`sum(${E.shipmentItems.qty})::text` }).from(E.shipmentItems).innerJoin(E.shipments, eq(E.shipments.id, E.shipmentItems.shipmentId))
      .where(eq(E.shipments.assemblyId, id)).groupBy(E.shipmentItems.partId);
    return { a, op, cli, locs, parts, stages, team, ships, shipped };
  });
  if (!d) notFound();
  const { a } = d;
  const tot = d.parts.reduce((x, p) => x + Number(p.p.qty), 0);
  const done = d.parts.reduce((x, p) => x + Math.min(Number(p.p.qtyDone), Number(p.p.qty)), 0);
  const late = a.dueDate && !a.completedAt && a.dueDate < today();
  const leaves = d.locs.filter((l) => !d.locs.some((c) => c.parentId === l.id)).length;
  const resp = d.team.find((t) => t.id === a.responsibleId);
  const locName = (id: string) => { const l = d.locs.find((x) => x.id === id); const p = l?.parentId ? d.locs.find((x) => x.id === l.parentId) : null; return [p?.name, l?.name].filter(Boolean).join(" › "); };
  const shipParts = d.parts.map(({ p, i }) => ({ id: p.id, where: locName(p.locationId), label: i?.name ?? p.description ?? "—", unit: i?.unit ?? "", qty: Number(p.qty), shipped: Number(d.shipped.find((x) => x.p === p.id)?.q ?? 0), done: Number(p.qtyDone) }));
  const toShip = shipParts.reduce((x, p) => x + Math.max(0, p.qty - p.shipped), 0);
  return (
    <>
      <PageHead title={a.name} back={{ href: "/montagens", label: "Montagens" }}
        sub={<>Montagem {a.number} · <Link href={`/ops/${d.op.op.id}`}>OP {d.op.op.number}</Link> ({fmtQty(a.qty)} de {fmtQty(d.op.op.qty)} · {d.op.it}){d.cli ? ` · ${d.cli.tradeName || d.cli.name}` : ""}{a.address ? ` · ${a.address}` : ""}</>}
        actions={<>
          <NotifyButton link={`/montagens/${a.id}`} label={`Montagem ${a.number}`} suggest={`Conferir a montagem ${a.number} · ${a.name}`} />
          {!a.completedAt && <BtnLink href={`/apontar?tipo=MONTAGEM&alvo=${a.id}`} icon="check">Apontar</BtnLink>}
          {s.edit && <ShipmentButton assemblyId={a.id} parts={shipParts} />}
          {s.edit && <>
          <AssemblyHeaderEdit a={a} team={d.team.map((t) => [t.id, t.name])} />
          {a.completedAt ? <ActionButton className="btn" action={concludeAssemblyAction.bind(null, a.id, false)}>Reabrir</ActionButton>
            : <ActionButton className="btn btn-primary" confirm={done < tot ? `Ainda faltam ${fmtQty(tot - done)} peças. Concluir a montagem mesmo assim?` : undefined} action={concludeAssemblyAction.bind(null, a.id, true)}><Icon name="check" size={16} /> Concluir montagem</ActionButton>}
          <ActionButton className="btn btn-danger" confirm="Excluir esta montagem com todos os locais e peças?" action={deleteAssemblyAction.bind(null, a.id)}><Icon name="trash" size={16} /></ActionButton>
        </>}</>} />
      <div className="kpis k5" style={{ marginBottom: 16 }}>
        <div className="kpi"><b>{tot ? Math.round((done / tot) * 100) : 0}%</b><span>Montado</span></div>
        <div className="kpi"><b>{fmtQty(done)}<small className="muted" style={{ fontSize: 15 }}> / {fmtQty(tot)}</small></b><span>Peças montadas</span></div>
        <div className="kpi"><b>{leaves}</b><span>Locais de montagem</span></div>
        <div className={`kpi${late ? " alert" : ""}`}><b style={{ fontSize: 22 }}>{fmtD(a.completedAt ?? a.dueDate)}</b><span>{a.completedAt ? "Concluída em" : "Previsão de término"}</span></div>
        <div className="kpi"><b style={{ fontSize: 18 }}>{resp?.name ?? "—"}</b><span>Responsável</span></div>
      </div>
      <AssemblyTree assemblyId={a.id} canEdit={s.edit} stages={d.stages.map((x) => ({ id: x.id, name: x.name, color: x.color }))} team={d.team.map((t) => [t.id, t.name])}
        locs={d.locs.map((l) => ({ id: l.id, parentId: l.parentId, name: l.name, type: l.type, stageId: l.stageId, installerId: l.installerId, helperId: l.helperId }))}
        parts={d.parts.map(({ p, i }) => ({ id: p.id, locationId: p.locationId, itemId: p.itemId, label: i?.name ?? p.description ?? "—", code: i?.code ?? null, unit: i?.unit ?? "", qty: Number(p.qty), done: Number(p.qtyDone) }))} />
      {a.notes && <p className="muted" style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{a.notes}</p>}
      <Panel id="romaneios" className="sec-panel" title="Romaneios" sub={toShip > 0 ? `${fmtQty(toShip)} peças ainda sem romaneio` : d.ships.length ? "todas as peças enviadas" : undefined}>
        {d.ships.length ? <div className="tbl solo" style={{ border: 0, borderRadius: 0, maxHeight: "none" }}><table>
          <thead><tr><th className="num">Nº</th><th>Saída</th><th>Veículo / motorista</th><th className="num">Peças</th><th>Gerado por</th><th /></tr></thead>
          <tbody>{d.ships.map(({ s: sh, n, q }) => <ClickRow key={sh.id} href={`/montagens/${a.id}/romaneio/${sh.id}`}><td className="num"><b>{sh.number}</b></td><td className="code">{fmtD(sh.date)}</td>
            <td>{[sh.vehicle, sh.driver].filter(Boolean).join(" · ") || "—"}</td><td className="num">{fmtQty(q)} <span className="muted">({n} {n === 1 ? "linha" : "linhas"})</span></td><td style={{ fontSize: 12.5 }}>{sh.userName}</td>
            <td className="acts show"><span className="btn btn-ghost btn-sm"><Icon name="print" size={14} /> Abrir</span>{s.edit && <DeleteShipment id={sh.id} number={sh.number} />}</td></ClickRow>)}</tbody></table></div>
          : <div className="pb muted" style={{ fontSize: 13 }}>Nenhum romaneio. Use “Gerar romaneio” quando as peças saírem da fábrica: dá para imprimir em PDF e conferir/apontar na tela.</div>}
      </Panel>
    </>
  );
}

/** Romaneio: impresso (PDF pelo navegador) e, na tela, conferência com apontamento da montagem. */
export async function ShipmentPage({ params }: { params: Promise<{ id: string; rid: string }> }) {
  const s = await page("producao");
  const { id, rid } = await params;
  const d = await s.tx(async (tx) => {
    const [sh] = await tx.select().from(E.shipments).where(and(eq(E.shipments.id, rid), eq(E.shipments.assemblyId, id))).limit(1);
    if (!sh) return null;
    const [a] = await tx.select().from(E.assemblies).where(eq(E.assemblies.id, id));
    const [op] = await tx.select({ n: E.productionOrders.number, m: E.productionOrders.measurementId }).from(E.productionOrders).where(eq(E.productionOrders.id, a.productionOrderId));
    const [cli] = a.partnerId ? await tx.select().from(E.partners).where(eq(E.partners.id, a.partnerId)) : [];
    const lines = await tx.select({ x: E.shipmentItems, p: E.assemblyParts, i: E.items, mi: E.measurementItems }).from(E.shipmentItems).innerJoin(E.assemblyParts, eq(E.assemblyParts.id, E.shipmentItems.partId))
      .leftJoin(E.items, eq(E.items.id, E.assemblyParts.itemId)).leftJoin(E.measurementItems, eq(E.measurementItems.id, E.assemblyParts.measurementItemId))
      .where(eq(E.shipmentItems.shipmentId, rid));
    const locs = await tx.select().from(E.assemblyLocations).where(eq(E.assemblyLocations.assemblyId, id)).orderBy(asc(E.assemblyLocations.position), asc(E.assemblyLocations.createdAt));
    const mf = await tx.select().from(E.customFields).where(and(eq(E.customFields.entity, "measurement"), eq(E.customFields.active, true))).orderBy(asc(E.customFields.position));
    const team = await tx.select({ id: E.teamMembers.id, n: E.teamMembers.name }).from(E.teamMembers).where(eq(E.teamMembers.active, true)).orderBy(asc(E.teamMembers.name));
    const opW = await tx.select({ w: sql<string | null>`coalesce(${E.items.netWeight}, ${E.items.grossWeight})::text` }).from(E.productionOrders).innerJoin(E.items, eq(E.items.id, E.productionOrders.itemId)).where(eq(E.productionOrders.id, a.productionOrderId));
    return { sh, a, op, cli, lines, locs, mf, team, wf: await weightFieldId(tx), itemW: customNum(opW[0]?.w), company: await companyHeader(tx, s.tenant.name) };
  });
  if (!d) notFound();
  const { sh, a } = d;
  const order = new Map(d.locs.map((l, k) => [l.id, k]));
  const locName = (lid: string) => { const l = d.locs.find((x) => x.id === lid); const p = l?.parentId ? d.locs.find((x) => x.id === l.parentId) : null; return [p?.name, l?.name].filter(Boolean).join(" › "); };
  const rows = d.lines.map((r) => ({ ...r, where: locName(r.p.locationId), ord: order.get(r.p.locationId) ?? 0 })).sort((x, y) => x.ord - y.ord);
  // medidas que vão no romaneio: os campos da medição, menos o peso (que tem coluna própria)
  const cols = d.mf.filter((f) => f.id !== d.wf);
  const wOf = (r: (typeof rows)[number]) => (d.wf && r.mi ? customNum(r.mi.custom[d.wf]) : 0) || d.itemW;
  const totQ = rows.reduce((x, r) => x + Number(r.x.qty), 0);
  const totW = rows.reduce((x, r) => x + Number(r.x.qty) * wOf(r), 0);
  const montadas = rows.filter((r) => Number(r.p.qtyDone) >= Number(r.p.qty) - 1e-9).length;
  return (
    <>
      <Link className="back no-print" href={`/montagens/${a.id}#romaneios`}>Montagem {a.number}</Link>
      <div className="ph no-print"><div><h1>Romaneio {sh.number}</h1><p>Imprima ou salve em PDF para acompanhar a carga. Na tela, aponte cada peça montada direto na linha ({montadas} de {rows.length} linhas montadas).</p></div>
        <div className="acts">{!a.completedAt && <BtnLink href={`/apontar?tipo=MONTAGEM&alvo=${a.id}`} icon="check">Abrir no Apontar</BtnLink>}<PrintButton /></div></div>
      <div className="paper">
        <div className="rep">
          <header className="rep-h">
            <div className="rep-co">{d.company.logo && <img className="rep-logo" src={d.company.logo} alt="" />}<div><div className="rep-brand">{d.company.name}</div><small>{d.company.line} · gerado em {fmtD(today())}</small></div></div>
            <div className="rep-t"><h2>Romaneio nº {sh.number}</h2><span>Montagem {a.number} · OP {d.op.n}</span></div>
          </header>
          <section className="rep-grid">
            <div><h4>Obra / cliente</h4><b>{a.name}</b><br />{d.cli ? d.cli.tradeName || d.cli.name : ""}<br />{a.address}</div>
            <div><h4>Transporte</h4>Saída: <b>{fmtD(sh.date)}</b><br />Veículo: {sh.vehicle || "—"}<br />Motorista: {sh.driver || "—"}</div>
            <div><h4>Carga</h4>{fmtQty(totQ)} peças em {rows.length} {rows.length === 1 ? "linha" : "linhas"}<br />{totW > 0 && <>Peso total: <b>{totW.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg</b></>}</div>
          </section>
          <table className="rep-t2">
            <thead><tr><th>Local</th><th>Peça</th>{cols.map((f) => <th key={f.id}>{f.label}</th>)}<th className="num">Qtd.</th>{totW > 0 && <th className="num">Peso (kg)</th>}<th className="print-only">Conferido</th><th className="no-print">Montagem</th></tr></thead>
            <tbody>{rows.map((r) => {
              const left = Number(r.p.qty) - Number(r.p.qtyDone);
              return (
                <tr key={r.x.id}><td>{r.where}</td><td>{r.i?.name ?? r.p.description ?? "—"}{r.mi?.description && r.i && <div style={{ fontSize: 11.5, color: "#6B7885" }}>{r.mi.description}</div>}</td>
                  {cols.map((f) => <td key={f.id}>{r.mi?.custom[f.id] ?? ""}</td>)}<td className="num">{fmtQty(r.x.qty)}</td>{totW > 0 && <td className="num">{(Number(r.x.qty) * wOf(r)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</td>}
                  <td className="print-only">☐</td>
                  <td className="no-print">{a.completedAt ? <span className="badge ok">Concluída</span> : <ShipLineApontar assemblyId={a.id} partId={r.p.id} left={left} unit={r.i?.unit ?? ""} label={r.i?.name ?? r.p.description ?? "Peça"} team={d.team.map((t) => [t.id, t.n])} />}
                    {Number(r.p.qtyDone) > 0 && left > 1e-9 && <div className="t-sub">{fmtQty(r.p.qtyDone)} de {fmtQty(r.p.qty)} montadas</div>}</td></tr>
              );
            })}</tbody>
            <tfoot><tr><td colSpan={2 + cols.length}>Total</td><td className="num">{fmtQty(totQ)}</td>{totW > 0 && <td className="num">{totW.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</td>}<td className="print-only" /><td className="no-print" /></tr></tfoot>
          </table>
          {sh.notes && <p style={{ marginTop: 12 }}><b>Observação:</b> {sh.notes}</p>}
          <section className="rep-sign rep-sign3"><div>Expedição (fábrica)</div><div>Motorista</div><div>Recebido na obra</div></section>
        </div>
      </div>
    </>
  );
}
