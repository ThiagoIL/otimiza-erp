import Link from "next/link";
import { and, asc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { withTenant } from "@/lib/db";
import { itemGroups, items, stockBalances, stockLocations } from "@/db/schema";
import { requireTenantUser } from "@/lib/context";
import { fmtMoney, fmtQty } from "@/lib/format";
import { ensureSetup } from "@/server/stock";
import { col } from "@/lib/sql";

const PAGE = 50;

export async function StockPosition({ searchParams }: { searchParams: Promise<{ q?: string; grupo?: string; local?: string; sit?: string; p?: string; msg?: string }> }) {
  const s = await requireTenantUser();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const page = Math.max(1, Math.min(1000, Number(sp.p) || 1));
  const local = (sp.local ?? "").slice(0, 64);
  const tid = s.tenant.id;

  // saldo do item: soma de todos os locais, ou só do local filtrado
  const bal = sql<string>`coalesce((select sum(${col(stockBalances.quantity)}) from ${stockBalances} where ${col(stockBalances.itemId)} = ${col(items.id)}${local ? sql` and ${col(stockBalances.locationId)} = ${local}` : sql``}), 0)`;
  const conds: SQL[] = [eq(items.tenantId, tid), eq(items.active, true)];
  if (q) conds.push(or(ilike(items.code, `%${q}%`), ilike(items.name, `%${q}%`))!);
  if (sp.grupo) conds.push(eq(items.groupId, sp.grupo.slice(0, 64)));
  if (sp.sit === "baixo") conds.push(sql`${items.minStock} > 0 and ${bal} < ${items.minStock}`);
  if (sp.sit === "com") conds.push(sql`${bal} > 0`);
  if (sp.sit === "sem") conds.push(sql`${bal} = 0`);
  const where = and(...conds);

  const [rows, [tot], groups, locations, [kpi]] = await withTenant(tid, async (tx) => {
    await ensureSetup(tx, tid);
    return [
      await tx.select({ id: items.id, code: items.code, name: items.name, unit: items.unit, min: items.minStock, cost: items.cost, g: itemGroups.name, bal })
        .from(items).leftJoin(itemGroups, eq(itemGroups.id, items.groupId)).where(where).orderBy(asc(items.name)).limit(PAGE).offset((page - 1) * PAGE),
      await tx.select({ total: sql<number>`count(*)::int` }).from(items).where(where),
      await tx.select({ id: itemGroups.id, name: itemGroups.name }).from(itemGroups).orderBy(asc(itemGroups.name)),
      await tx.select({ id: stockLocations.id, name: stockLocations.name }).from(stockLocations).where(eq(stockLocations.active, true)).orderBy(asc(stockLocations.name)),
      await tx.select({
        valor: sql<string>`coalesce(sum(${bal} * ${items.cost}), 0)`,
        comSaldo: sql<number>`(count(*) filter (where ${bal} > 0))::int`,
        baixo: sql<number>`(count(*) filter (where ${items.minStock} > 0 and ${bal} < ${items.minStock}))::int`,
      }).from(items).where(and(eq(items.tenantId, tid), eq(items.active, true))),
    ] as const;
  });
  const pages = Math.max(1, Math.ceil(tot.total / PAGE));
  const qs = (p: number) => `?${new URLSearchParams({ ...(q && { q }), ...(sp.grupo && { grupo: sp.grupo }), ...(local && { local }), ...(sp.sit && { sit: sp.sit }), p: String(p) })}`;
  const filtered = !!(q || sp.grupo || local || sp.sit);
  return (
    <>
      <div className="ph"><div><h1>Posição de estoque</h1><p>Saldo atual de cada item{local ? " no local selecionado" : " somando todos os locais"}. Dê entrada ou saída direto pela linha do item.</p></div>
        <div className="acts"><Link className="btn" href="/estoque/movimentar?tipo=SAIDA">Registrar saída</Link><Link className="btn btn-primary" href="/estoque/movimentar?tipo=ENTRADA">Registrar entrada</Link></div></div>
      {sp.msg && <div className="alert ok" role="status">{sp.msg.slice(0, 200)}</div>}
      <div className="kpis">
        <div className="kpi"><b>{fmtMoney(kpi.valor)}</b><span>Valor em estoque (custo)</span></div>
        <Link className="kpi" href="?sit=com"><b>{kpi.comSaldo}</b><span>Itens com saldo</span></Link>
        <Link className={`kpi${kpi.baixo ? " kpi-warn" : ""}`} href="?sit=baixo"><b>{kpi.baixo}</b><span>Abaixo do estoque mínimo</span></Link>
        <Link className="kpi" href="/estoque/locais"><b>{locations.length}</b><span>Locais de estoque</span></Link>
      </div>
      <form className="bar" role="search">
        <input type="search" name="q" defaultValue={q} placeholder="Código ou descrição" aria-label="Buscar item" />
        <select name="grupo" defaultValue={sp.grupo ?? ""} aria-label="Grupo" style={{ maxWidth: 190 }}><option value="">Todos os grupos</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
        <select name="local" defaultValue={local} aria-label="Local" style={{ maxWidth: 190 }}><option value="">Todos os locais</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
        <select name="sit" defaultValue={sp.sit ?? ""} aria-label="Situação" style={{ maxWidth: 190 }}><option value="">Todas as situações</option><option value="baixo">Abaixo do mínimo</option><option value="com">Com saldo</option><option value="sem">Sem saldo</option></select>
        <button className="btn" type="submit">Filtrar</button><span className="grow" /><span className="muted">{tot.total} itens</span>
      </form>
      <div className="tbl">
        {rows.length ? (
          <table><thead><tr><th>Código</th><th>Descrição</th><th>Grupo</th><th>Un.</th><th className="num">Saldo</th><th className="num">Mínimo</th><th className="num">Valor</th><th>Situação</th><th className="num">Movimentar</th></tr></thead>
            <tbody>{rows.map((r) => {
              const b = Number(r.bal), min = Number(r.min);
              const low = min > 0 && b < min;
              return (
                <tr key={r.id}>
                  <td>{r.code}</td><td><Link className="row-link" href={`/estoque/itens/${r.id}`}>{r.name}</Link></td><td>{r.g ?? "—"}</td><td>{r.unit}</td>
                  <td className="num"><b>{fmtQty(b)}</b></td><td className="num muted">{min ? fmtQty(min) : "—"}</td><td className="num">{fmtMoney(b * Number(r.cost))}</td>
                  <td>{low ? <span className="badge bad">Abaixo do mínimo</span> : b > 0 ? <span className="badge ok">Normal</span> : <span className="badge">Sem saldo</span>}</td>
                  <td className="num"><span className="row-acts">
                    <Link className="btn btn-sm" href={`/estoque/movimentar?tipo=ENTRADA&item=${r.id}${local ? `&local=${local}` : ""}`} aria-label={`Entrada de ${r.code}`}>+ Entrada</Link>
                    <Link className="btn btn-sm" href={`/estoque/movimentar?tipo=SAIDA&item=${r.id}${local ? `&local=${local}` : ""}`} aria-label={`Saída de ${r.code}`}>− Saída</Link>
                  </span></td>
                </tr>
              );
            })}</tbody></table>
        ) : <div className="empty"><strong>{filtered ? "Nenhum item neste filtro" : "Nenhum item cadastrado"}</strong>{filtered ? "Ajuste a busca ou os filtros." : <>Cadastre os itens em <Link href="/estoque/itens/novo">Itens e grupos</Link>.</>}</div>}
        {pages > 1 && <div className="pager">{page > 1 && <Link className="btn btn-sm" href={qs(page - 1)}>Anterior</Link>}<span>Página {page} de {pages}</span>{page < pages && <Link className="btn btn-sm" href={qs(page + 1)}>Próxima</Link>}</div>}
      </div>
    </>
  );
}
