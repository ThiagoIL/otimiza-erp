import Link from "next/link";
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { withTenant } from "@/lib/db";
import { assemblies, assemblyAreas, assemblyPieces, partners, salesOrders } from "@/db/schema";
import { requireTenantUser } from "@/lib/context";
import { ASSEMBLY_STATUS, ASSEMBLY_STATUS_BADGE, assemblyStatusLabel, fmtDay, fmtPct, mtNumber, pvNumber, today } from "@/lib/format";
import { progress } from "@/lib/assembly";
import { col } from "@/lib/sql";

type Status = (typeof ASSEMBLY_STATUS)[number][0];

export async function Assemblies({ searchParams }: { searchParams: Promise<{ q?: string; situacao?: string; msg?: string }> }) {
  const s = await requireTenantUser();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const conds: SQL[] = [eq(assemblies.tenantId, s.tenant.id)];
  if (q) conds.push(or(ilike(assemblies.name, `%${q}%`), ilike(partners.name, `%${q}%`), ilike(assemblies.address, `%${q}%`))!);
  if (!sp.situacao) conds.push(sql`${assemblies.status} in ('PLANEJADA', 'EM_ANDAMENTO')`);
  else if (ASSEMBLY_STATUS.some(([k]) => k === sp.situacao)) conds.push(eq(assemblies.status, sp.situacao as Status));
  const pieces = (filter: SQL) => sql<number>`(select count(*)::int from ${assemblyPieces} join ${assemblyAreas} on ${col(assemblyAreas.id)} = ${col(assemblyPieces.areaId)} where ${col(assemblyAreas.assemblyId)} = ${col(assemblies.id)} and ${filter})`;
  const rows = await withTenant(s.tenant.id, (tx) => tx.select({
    a: assemblies, customer: partners.name, pv: salesOrders.number,
    areas: sql<number>`(select count(*)::int from ${assemblyAreas} where ${col(assemblyAreas.assemblyId)} = ${col(assemblies.id)})`,
    total: pieces(sql`true`), done: pieces(sql`${assemblyPieces.doneAt} is not null`),
  }).from(assemblies).leftJoin(partners, eq(partners.id, assemblies.customerId)).leftJoin(salesOrders, eq(salesOrders.id, assemblies.salesOrderId))
    .where(and(...conds)).orderBy(sql`${assemblies.dueDate} asc nulls last`, desc(assemblies.number)).limit(200));
  const hoje = today();
  return (
    <>
      <div className="ph"><div><h1>Obras e montagens</h1><p>Cada montagem acompanha um cliente ou uma obra, dividida em ambientes (ou andar e apartamento), com montador, auxiliar e as peças a montar.</p></div>
        <div className="acts"><Link className="btn btn-primary" href="/montagens/nova">Nova montagem</Link></div></div>
      {sp.msg && <div className="alert ok" role="status">{sp.msg.slice(0, 200)}</div>}
      <nav className="chips" aria-label="Situação">
        <Link href="?" aria-current={!sp.situacao ? "true" : undefined}>Em aberto</Link>
        {ASSEMBLY_STATUS.map(([k, l]) => <Link key={k} href={`?situacao=${k}`} aria-current={sp.situacao === k ? "true" : undefined}>{l}</Link>)}
      </nav>
      <form className="bar" role="search">
        {sp.situacao && <input type="hidden" name="situacao" value={sp.situacao} />}
        <input type="search" name="q" defaultValue={q} placeholder="Obra, cliente ou endereço" aria-label="Buscar montagem" />
        <button className="btn" type="submit">Buscar</button><span className="grow" /><span className="muted">{rows.length} montagens</span>
      </form>
      {rows.length ? (
        <div className="cards">
          {rows.map(({ a, customer, pv, areas, total, done }) => {
            const late = a.dueDate && a.dueDate < hoje && (a.status === "PLANEJADA" || a.status === "EM_ANDAMENTO");
            const pr = progress(done, total);
            return (
              <Link key={a.id} href={`/montagens/${a.id}`} className="card">
                <div className="card-top"><span className="muted">{mtNumber(a.number)}</span><span className={`badge ${ASSEMBLY_STATUS_BADGE[a.status]}`}>{assemblyStatusLabel(a.status)}</span></div>
                <b className="card-title">{a.name}</b>
                <span className="muted">{customer ?? "Sem cliente"}{pv != null && ` · ${pvNumber(pv)}`}</span>
                <div className="progress big"><span style={{ width: `${pr * 100}%` }} /></div>
                <div className="card-foot"><span>{fmtPct(pr)} · {done}/{total} peças · {areas} {areas === 1 ? "ambiente" : "ambientes"}</span><span className={late ? "late" : undefined}>{a.dueDate ? `Prazo ${fmtDay(a.dueDate)}` : ""}</span></div>
              </Link>
            );
          })}
        </div>
      ) : <div className="tbl"><div className="empty"><strong>Nenhuma montagem {sp.situacao ? "nesta situação" : "em aberto"}</strong>Crie uma montagem para acompanhar uma obra ou um cliente.</div></div>}
    </>
  );
}
