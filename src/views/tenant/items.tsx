import { and, asc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { page } from "@/lib/access";
import * as E from "@/db/erp";
import { fmtMoney, fmtQty } from "@/lib/format";
import { avgCosts, balances, balanceOf } from "@/server/common";
import { Active, BtnLink, Empty, PageHead, Pager, pageLink } from "@/components/ui";
import { ClickRow, FilterBar } from "@/components/client";
import { Icon } from "@/components/Icon";

const PAGE = 60;
type SP = Record<string, string | undefined>;

export async function TenantItems({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await page("itens");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const pg = Math.max(1, Math.min(1000, Number(sp.p) || 1));
  const conds: SQL[] = [eq(E.items.tenantId, s.tenant.id)];
  if (q) conds.push(or(ilike(E.items.code, `%${q}%`), ilike(E.items.name, `%${q}%`), ilike(E.items.complement, `%${q}%`))!);
  if (sp.grupo) conds.push(eq(E.items.groupId, sp.grupo));
  if (sp.tipo) conds.push(eq(E.items.typeId, sp.tipo));
  if (sp.un) conds.push(eq(E.items.unit, sp.un));
  if (sp.forn) conds.push(eq(E.items.defaultSupplierId, sp.forn));
  if (sp.local) conds.push(eq(E.items.defaultLocationId, sp.local));
  if (sp.sit === "inativos") conds.push(eq(E.items.active, false)); else if (sp.sit !== "todos") conds.push(eq(E.items.active, true));
  if (sp.ncm === "sem") conds.push(or(isNull(E.items.ncm), eq(E.items.ncm, ""))!);
  if (sp.estr === "sem") conds.push(sql`"items"."type" in ('PRODUTO_ACABADO','SEMIACABADO') and not exists (select 1 from item_bom b where b.item_id = "items"."id")`);
  if (sp.estr === "com") conds.push(sql`exists (select 1 from item_bom b where b.item_id = "items"."id")`);
  if (sp.cod) conds.push(ilike(E.items.code, `${sp.cod.trim()}%`));
  const where = and(...conds);

  const data = await s.tx(async (tx) => {
    const rows = await tx.select({ i: E.items, g: E.itemGroups.name, t: E.itemTypes.name, nb: sql<number>`(select count(*)::int from item_bom b where b.item_id = "items"."id")` })
      .from(E.items).leftJoin(E.itemGroups, eq(E.itemGroups.id, E.items.groupId)).leftJoin(E.itemTypes, eq(E.itemTypes.id, E.items.typeId))
      .where(where).orderBy(asc(E.items.name)).limit(PAGE).offset((pg - 1) * PAGE);
    const [{ total }] = await tx.select({ total: sql<number>`count(*)::int` }).from(E.items).where(where);
    const ids = rows.map((r) => r.i.id);
    const [bal, cost] = await Promise.all([balances(tx, { itemIds: ids }), avgCosts(tx, ids)]);
    const groups = await tx.select({ id: E.itemGroups.id, n: E.itemGroups.name }).from(E.itemGroups).orderBy(asc(E.itemGroups.name));
    const types = await tx.select({ id: E.itemTypes.id, n: E.itemTypes.name }).from(E.itemTypes).orderBy(asc(E.itemTypes.name));
    const units = await tx.select({ c: E.units.code }).from(E.units).orderBy(asc(E.units.code));
    const sups = await tx.select({ id: E.partners.id, n: sql<string>`coalesce(${E.partners.tradeName}, ${E.partners.name})` }).from(E.partners).where(sql`'Fornecedor' = any(${E.partners.kinds})`).orderBy(asc(E.partners.name));
    const locs = await tx.select({ id: E.stockLocations.id, n: E.stockLocations.name }).from(E.stockLocations).orderBy(asc(E.stockLocations.code));
    return { rows, total, bal, cost, groups, types, units, sups, locs };
  });
  const pages = Math.max(1, Math.ceil(data.total / PAGE));
  const moreActive = ["un", "forn", "local", "ncm", "estr", "cod"].filter((k) => sp[k]).length;
  const filtered = !!(q || sp.grupo || sp.tipo || moreActive);

  return (
    <>
      <PageHead title="Itens" sub="Matérias-primas, componentes, produtos acabados e materiais de consumo."
        actions={s.edit && <BtnLink href="/itens/novo" primary icon="plus">Novo item</BtnLink>} />
      <FilterBar moreActive={moreActive} right={<span className="count">{data.total} itens</span>}
        more={<>
          <label className="fl">Código começa com <input type="text" name="cod" defaultValue={sp.cod ?? ""} style={{ width: 130 }} /></label>
          <select name="un" defaultValue={sp.un ?? ""} aria-label="Unidade"><option value="">Todas as unidades</option>{data.units.map((u) => <option key={u.c}>{u.c}</option>)}</select>
          <select name="forn" defaultValue={sp.forn ?? ""} aria-label="Fornecedor"><option value="">Qualquer fornecedor</option>{data.sups.map((f) => <option key={f.id} value={f.id}>{f.n}</option>)}</select>
          <select name="local" defaultValue={sp.local ?? ""} aria-label="Local padrão"><option value="">Qualquer local padrão</option>{data.locs.map((l) => <option key={l.id} value={l.id}>{l.n}</option>)}</select>
          <select name="estr" defaultValue={sp.estr ?? ""} aria-label="Estrutura"><option value="">Estrutura: todos</option><option value="com">Com estrutura</option><option value="sem">Fabricados sem estrutura</option></select>
          <select name="ncm" defaultValue={sp.ncm ?? ""} aria-label="NCM"><option value="">NCM: todos</option><option value="sem">Sem NCM</option></select>
        </>}>
        <div className="search"><Icon name="search" size={16} /><input type="search" name="q" defaultValue={q} placeholder="Código, descrição ou complemento" aria-label="Buscar item" /></div>
        <select name="grupo" defaultValue={sp.grupo ?? ""} aria-label="Grupo"><option value="">Todos os grupos</option>{data.groups.map((g) => <option key={g.id} value={g.id}>{g.n}</option>)}</select>
        <select name="tipo" defaultValue={sp.tipo ?? ""} aria-label="Tipo"><option value="">Todos os tipos</option>{data.types.map((g) => <option key={g.id} value={g.id}>{g.n}</option>)}</select>
        <select name="sit" defaultValue={sp.sit ?? ""} aria-label="Situação"><option value="">Ativos</option><option value="inativos">Inativos</option><option value="todos">Ativos e inativos</option></select>
      </FilterBar>
      <div className="tbl">
        {data.rows.length ? (
          <table>
            <thead><tr><th>Código</th><th>Descrição</th><th>Grupo</th><th>Tipo</th><th>Un.</th><th className="num">Est. mínimo</th><th className="num">Saldo</th><th className="num">Custo médio</th><th>Situação</th></tr></thead>
            <tbody>{data.rows.map(({ i, g, t, nb }) => {
              const bal = balanceOf(data.bal, i.id);
              const below = Number(i.minStock) > 0 && bal < Number(i.minStock);
              return (
                <ClickRow key={i.id} href={`/itens/${i.id}`} className={below ? "flag" : ""} style={!i.active ? { opacity: 0.6 } : undefined}>
                  <td className="code">{i.code}</td>
                  <td className="desc">{i.name}{i.complement && <div className="muted" style={{ fontSize: 12, fontWeight: 400 }}>{i.complement}</div>}
                    {(i.type === "PRODUTO_ACABADO" || i.type === "SEMIACABADO") && !nb && <div><span className="badge warn" style={{ marginTop: 3 }}>Sem estrutura</span></div>}</td>
                  <td>{g ?? "—"}</td><td>{t ?? "—"}</td><td>{i.unit}</td>
                  <td className="num">{fmtQty(i.minStock)}</td><td className="num"><b className={below ? "t-bad" : ""}>{fmtQty(bal)}</b></td>
                  <td className="num">{fmtMoney(data.cost.get(i.id))}</td>
                  <td><Active on={i.active} /></td>
                </ClickRow>
              );
            })}</tbody>
          </table>
        ) : <Empty title={filtered ? "Nenhum item neste filtro" : "Nenhum item cadastrado"}>{filtered ? "Ajuste a busca ou os filtros." : "Cadastre o primeiro item."}</Empty>}
        <Pager page={pg} pages={pages} qs={pageLink(sp)} />
      </div>
    </>
  );
}
