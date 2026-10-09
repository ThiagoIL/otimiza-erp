import Link from "next/link";
import { and, asc, desc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { withTenant } from "@/lib/db";
import { items, productionOrders, stockLocations, stockMovements } from "@/db/schema";
import { requireTenantUser } from "@/lib/context";
import { fmtDateTime, fmtQty, movementOriginLabel, MOVEMENT_ORIGINS, opNumber } from "@/lib/format";

const PAGE = 50;
type Origin = (typeof MOVEMENT_ORIGINS)[number][0];
const isDay = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function StockMovements({ searchParams }: { searchParams: Promise<{ q?: string; tipo?: string; origem?: string; local?: string; de?: string; ate?: string; p?: string }> }) {
  const s = await requireTenantUser();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const page = Math.max(1, Math.min(1000, Number(sp.p) || 1));
  const conds: SQL[] = [eq(stockMovements.tenantId, s.tenant.id)];
  if (q) conds.push(or(ilike(items.code, `%${q}%`), ilike(items.name, `%${q}%`), ilike(stockMovements.document, `%${q}%`))!);
  if (sp.tipo === "ENTRADA" || sp.tipo === "SAIDA") conds.push(eq(stockMovements.kind, sp.tipo));
  if (MOVEMENT_ORIGINS.some(([k]) => k === sp.origem)) conds.push(eq(stockMovements.origin, sp.origem as Origin));
  if (sp.local) conds.push(eq(stockMovements.locationId, sp.local.slice(0, 64)));
  if (isDay(sp.de)) conds.push(gte(stockMovements.createdAt, new Date(`${sp.de}T00:00:00-03:00`)));
  if (isDay(sp.ate)) conds.push(lte(stockMovements.createdAt, new Date(`${sp.ate}T23:59:59-03:00`)));
  const where = and(...conds);
  const [rows, [tot], locations] = await withTenant(s.tenant.id, async (tx) => [
    await tx.select({ m: stockMovements, code: items.code, name: items.name, unit: items.unit, loc: stockLocations.name, op: productionOrders.number })
      .from(stockMovements).innerJoin(items, eq(items.id, stockMovements.itemId)).innerJoin(stockLocations, eq(stockLocations.id, stockMovements.locationId))
      .leftJoin(productionOrders, eq(productionOrders.id, stockMovements.productionOrderId))
      .where(where).orderBy(desc(stockMovements.createdAt)).limit(PAGE).offset((page - 1) * PAGE),
    await tx.select({
      total: sql<number>`count(*)::int`,
      ent: sql<number>`(count(*) filter (where ${stockMovements.kind} = 'ENTRADA'))::int`,
    }).from(stockMovements).innerJoin(items, eq(items.id, stockMovements.itemId)).where(where),
    await tx.select({ id: stockLocations.id, name: stockLocations.name }).from(stockLocations).orderBy(asc(stockLocations.name)),
  ] as const);
  const pages = Math.max(1, Math.ceil(tot.total / PAGE));
  const params = { ...(q && { q }), ...(sp.tipo && { tipo: sp.tipo }), ...(sp.origem && { origem: sp.origem }), ...(sp.local && { local: sp.local }), ...(sp.de && { de: sp.de }), ...(sp.ate && { ate: sp.ate }) };
  const qs = (p: number) => `?${new URLSearchParams({ ...params, p: String(p) })}`;
  const filtered = Object.keys(params).length > 0;
  return (
    <>
      <div className="ph"><div><h1>Movimentações de estoque</h1><p>Histórico de todas as entradas e saídas, com o saldo do local depois de cada uma.</p></div>
        <div className="acts"><Link className="btn" href="/estoque/movimentar?tipo=SAIDA">Registrar saída</Link><Link className="btn btn-primary" href="/estoque/movimentar?tipo=ENTRADA">Registrar entrada</Link></div></div>
      <form className="bar" role="search">
        <input type="search" name="q" defaultValue={q} placeholder="Item ou documento" aria-label="Buscar" />
        <select name="tipo" defaultValue={sp.tipo ?? ""} aria-label="Tipo" style={{ maxWidth: 140 }}><option value="">Entradas e saídas</option><option value="ENTRADA">Entradas</option><option value="SAIDA">Saídas</option></select>
        <select name="origem" defaultValue={sp.origem ?? ""} aria-label="Origem" style={{ maxWidth: 190 }}><option value="">Todas as origens</option>{MOVEMENT_ORIGINS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select name="local" defaultValue={sp.local ?? ""} aria-label="Local" style={{ maxWidth: 170 }}><option value="">Todos os locais</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
        <label className="inline-lbl">De <input type="date" name="de" defaultValue={isDay(sp.de) ? sp.de : ""} /></label>
        <label className="inline-lbl">Até <input type="date" name="ate" defaultValue={isDay(sp.ate) ? sp.ate : ""} /></label>
        <button className="btn" type="submit">Filtrar</button><span className="grow" /><span className="muted">{tot.ent} entradas · {tot.total - tot.ent} saídas</span>
      </form>
      <div className="tbl">
        {rows.length ? (
          <table><thead><tr><th>Quando</th><th>Tipo</th><th>Item</th><th>Local</th><th className="num">Quantidade</th><th className="num">Saldo após</th><th>Origem</th><th>Documento</th><th>Por</th></tr></thead>
            <tbody>{rows.map(({ m, code, name, unit, loc, op }) => (
              <tr key={m.id}>
                <td className="nowrap">{fmtDateTime(m.createdAt)}</td>
                <td>{m.kind === "ENTRADA" ? <span className="badge ok">Entrada</span> : <span className="badge bad">Saída</span>}</td>
                <td><Link className="row-link" href={`/estoque/itens/${m.itemId}`}>{code}</Link><small className="sub">{name}</small></td>
                <td>{loc}</td>
                <td className="num"><b>{m.kind === "ENTRADA" ? "+" : "−"}{fmtQty(m.quantity)}</b> {unit}</td>
                <td className="num muted">{fmtQty(m.balanceAfter)}</td>
                <td>{movementOriginLabel(m.origin)}{op != null && <> · <Link href={`/producao/${m.productionOrderId}`}>{opNumber(op)}</Link></>}</td>
                <td>{m.document ?? "—"}{m.notes && <small className="sub">{m.notes}</small>}</td>
                <td className="muted">{m.userName ?? "—"}</td>
              </tr>))}</tbody></table>
        ) : <div className="empty"><strong>{filtered ? "Nenhuma movimentação neste filtro" : "Nenhuma movimentação ainda"}</strong>{filtered ? "Ajuste os filtros." : "Registre a primeira entrada de estoque."}</div>}
        {pages > 1 && <div className="pager">{page > 1 && <Link className="btn btn-sm" href={qs(page - 1)}>Anterior</Link>}<span>Página {page} de {pages}</span>{page < pages && <Link className="btn btn-sm" href={qs(page + 1)}>Próxima</Link>}</div>}
      </div>
    </>
  );
}
