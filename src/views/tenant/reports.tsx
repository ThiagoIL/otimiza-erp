import { redirect } from "next/navigation";
import { and, asc, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { page } from "@/lib/access";
import * as E from "@/db/erp";
import { Empty, Kpi, PageHead } from "@/components/ui";
import { ActionButton, FilterBar, FilterTabs } from "@/components/client";
import { Sel } from "@/components/SearchPicker";
import { PointerScreen } from "@/components/PointerUI";
import { BtnLink } from "@/components/ui";
import { deleteReportAction } from "@/server/report-actions";
import { fmtQty } from "@/lib/format";
import { addDays, fmtD, isDate, today } from "@/lib/dates";
import { POINTER_LABEL } from "@/lib/modules";

type SP = Record<string, string | undefined>;

/** Tela de apontar: usuário só de apontamento ou quem edita a Produção. */
export async function PointerPage({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await page(null);
  const sp = await searchParams;
  const prod = s.access.mods.producao === "editar";
  if (!s.access.pointer && !prod) redirect(`/?erro=${encodeURIComponent("Seu perfil não aponta produção.")}`);
  const kinds = (["FABRICA", "MONTAGEM"] as const).filter((k) => prod || s.access.pointer === "ambos" || s.access.pointer === (k === "FABRICA" ? "fabrica" : "montagem"));
  const d = await s.tx(async (tx) => ({
    team: await tx.select({ id: E.teamMembers.id, n: E.teamMembers.name }).from(E.teamMembers).where(eq(E.teamMembers.active, true)).orderBy(asc(E.teamMembers.name)),
    locs: await tx.select({ id: E.stockLocations.id, c: E.stockLocations.code, n: E.stockLocations.name }).from(E.stockLocations).where(eq(E.stockLocations.active, true)).orderBy(asc(E.stockLocations.code)),
  }));
  return (
    <>
      <PageHead title="Apontar" sub={s.access.pointer ? `Apontamento de ${POINTER_LABEL[s.access.pointer].toLowerCase()}: registre o que ficou pronto.` : "Registre o que ficou pronto na fábrica (produto final, peça ou estrutura da OP) ou na montagem. As abas Finalizações e Horas trabalhadas mostram o que já foi apontado."} />
      <PointerScreen kinds={[...kinds]} team={d.team.map((t) => [t.id, t.n])} locations={d.locs.map((l) => [l.id, `${l.c} · ${l.n}`])}
        initial={sp.alvo && (sp.tipo === "FABRICA" || sp.tipo === "MONTAGEM") ? { kind: sp.tipo, id: sp.alvo } : undefined} />
    </>
  );
}

/** Lista dos apontamentos de finalização (Produção › Apontamentos). */
export async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await page("producao");
  const sp = await searchParams;
  const de = sp.de && isDate(sp.de) ? sp.de : addDays(today(), -13);
  const ate = sp.ate && isDate(sp.ate) ? sp.ate : today();
  const c: SQL[] = [gte(E.productionReports.date, de), lte(E.productionReports.date, ate)];
  if (sp.tipo === "FABRICA" || sp.tipo === "MONTAGEM") c.push(eq(E.productionReports.kind, sp.tipo));
  if (sp.pes) c.push(eq(E.productionReports.memberId, sp.pes));
  const d = await s.tx(async (tx) => ({
    rows: await tx.select({ r: E.productionReports, op: E.productionOrders.number, an: E.assemblies.number, who: E.teamMembers.name, unit: E.items.unit }).from(E.productionReports)
      .innerJoin(E.productionOrders, eq(E.productionOrders.id, E.productionReports.productionOrderId)).leftJoin(E.assemblies, eq(E.assemblies.id, E.productionReports.assemblyId))
      .leftJoin(E.teamMembers, eq(E.teamMembers.id, E.productionReports.memberId)).leftJoin(E.items, eq(E.items.id, E.productionReports.itemId))
      .where(and(...c)).orderBy(desc(E.productionReports.date), desc(E.productionReports.createdAt)).limit(500),
    team: await tx.select({ id: E.teamMembers.id, n: E.teamMembers.name }).from(E.teamMembers).orderBy(asc(E.teamMembers.name)),
  }));
  const tipo = (r: typeof E.productionReports.$inferSelect) => (r.kind === "MONTAGEM" ? "Peça montada" : r.componentId ? "Peça / estrutura" : "Produto final");
  const cnt = (k: string) => d.rows.filter((x) => x.r.kind === k).length;
  return (
    <>
      <PageHead title="Apontamentos de finalização" sub="O que ficou pronto na fábrica e na montagem. O produto final entra no estoque; peças e estruturas avançam a OP; peças montadas avançam a montagem."
        actions={s.edit && <BtnLink href="/apontar" primary icon="check">Apontar</BtnLink>} />
      <div className="kpis k4">
        <Kpi value={d.rows.length} label="Apontamentos no período" />
        <Kpi value={d.rows.filter((x) => x.r.kind === "FABRICA" && !x.r.componentId).length} label="Produtos finalizados" />
        <Kpi value={d.rows.filter((x) => x.r.componentId).length} label="Peças e estruturas" />
        <Kpi value={cnt("MONTAGEM")} label="Peças montadas" />
      </div>
      <FilterBar right={<span className="count">{d.rows.length} registros</span>}
        tabs={<FilterTabs name="tipo" value={sp.tipo ?? ""} options={[{ v: "", label: "Todos" }, { v: "FABRICA", label: "Fábrica", n: cnt("FABRICA") }, { v: "MONTAGEM", label: "Montagem", n: cnt("MONTAGEM") }]} />}>
        <label className="fl">De <input type="date" name="de" defaultValue={de} /></label>
        <label className="fl">até <input type="date" name="ate" defaultValue={ate} /></label>
        <Sel name="pes" defaultValue={sp.pes ?? ""} aria-label="Pessoa"><option value="">Toda a equipe</option>{d.team.map((t) => <option key={t.id} value={t.id}>{t.n}</option>)}</Sel>
      </FilterBar>
      <div className="tbl">
        {d.rows.length ? (
          <table><thead><tr><th>Data</th><th>Onde</th><th>O que ficou pronto</th><th>Tipo</th><th className="num">Quantidade</th><th>Quem fez</th><th>Apontado por</th><th data-hide="">Observação</th><th /></tr></thead>
            <tbody>{d.rows.map(({ r, op, an, who, unit }) => (
              <tr key={r.id}><td className="code">{fmtD(r.date)}</td>
                <td>{r.assemblyId ? <a href={`/montagens/${r.assemblyId}`}><b>Montagem {an}</b></a> : <a href={`/ops/${r.productionOrderId}`}><b>OP {op}</b></a>}</td>
                <td className="desc">{r.description}</td><td><span className={`badge${r.kind === "MONTAGEM" ? "" : r.componentId ? "" : " ok"}`}>{tipo(r)}</span></td>
                <td className="num"><b>{fmtQty(r.qty)}</b> {unit ?? ""}</td><td>{who ?? "—"}</td><td style={{ fontSize: 12.5 }}>{r.userName}<div className="t-sub">{r.createdAt.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div></td>
                <td className="wrap" style={{ fontSize: 12.5 }}>{r.notes ?? "—"}</td>
                <td className="acts show">{s.edit && <ActionButton className="btn btn-ghost btn-sm" confirm="Desfazer este apontamento? A quantidade volta na OP ou na montagem e, se for o produto final, a entrada no estoque é estornada." action={deleteReportAction.bind(null, r.id)}>Desfazer</ActionButton>}</td></tr>))}</tbody></table>
        ) : <Empty title="Nenhum apontamento no período">Use “Apontar” para registrar o que ficou pronto.</Empty>}
      </div>
    </>
  );
}
