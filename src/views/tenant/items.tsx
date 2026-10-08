import Link from "next/link";
import { and, asc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { withTenant } from "@/lib/db";
import { itemGroups, items } from "@/db/schema";
import { requireTenantUser } from "@/lib/context";
import { fmtMoney, fmtQty, itemTypeLabel, ITEM_TYPES } from "@/lib/format";
import { Field, Form, Hidden, Submit } from "@/components/Form";
import { createGroupAction, deleteGroupAction } from "@/server/item-actions";

const PAGE = 50;
type ItemType = (typeof ITEM_TYPES)[number][0];

export async function TenantItems({ searchParams }: { searchParams: Promise<{ q?: string; tipo?: string; grupo?: string; p?: string; salvo?: string; excluido?: string }> }) {
  const s = await requireTenantUser();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const page = Math.max(1, Math.min(1000, Number(sp.p) || 1));
  const conds: SQL[] = [eq(items.tenantId, s.tenant.id)];
  if (q) conds.push(or(ilike(items.code, `%${q}%`), ilike(items.name, `%${q}%`))!);
  if (ITEM_TYPES.some(([k]) => k === sp.tipo)) conds.push(eq(items.type, sp.tipo as ItemType));
  if (sp.grupo) conds.push(eq(items.groupId, sp.grupo.slice(0, 64)));
  const where = and(...conds);
  const [rows, [{ total }], groups] = await withTenant(s.tenant.id, async (tx) => [
    await tx.select({ i: items, g: itemGroups.name }).from(items).leftJoin(itemGroups, eq(itemGroups.id, items.groupId))
      .where(where).orderBy(asc(items.name)).limit(PAGE).offset((page - 1) * PAGE),
    await tx.select({ total: sql<number>`count(*)::int` }).from(items).where(where),
    await tx.select({ id: itemGroups.id, name: itemGroups.name, n: sql<number>`(select count(*)::int from ${items} where ${items.groupId} = ${itemGroups.id})` }).from(itemGroups).orderBy(asc(itemGroups.name)),
  ] as const);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (p: number) => `?${new URLSearchParams({ ...(q && { q }), ...(sp.tipo && { tipo: sp.tipo }), ...(sp.grupo && { grupo: sp.grupo }), p: String(p) })}`;
  const admin = s.user.role === "TENANT_ADMIN";
  const filtered = !!(q || sp.tipo || sp.grupo);
  return (
    <>
      <div className="ph"><div><h1>Itens</h1><p>Matérias-primas, componentes e produtos da fábrica.</p></div>
        <div className="acts"><Link className="btn btn-primary" href="/itens/novo">Novo item</Link></div></div>
      {sp.salvo && <div className="alert ok" role="status">Item {sp.salvo} salvo.</div>}
      {sp.excluido && <div className="alert ok" role="status">Item excluído.</div>}
      <form className="bar" role="search">
        <input type="search" name="q" defaultValue={q} placeholder="Código ou descrição" aria-label="Buscar item" />
        <select name="tipo" defaultValue={sp.tipo ?? ""} aria-label="Tipo" style={{ maxWidth: 200 }}><option value="">Todos os tipos</option>{ITEM_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select name="grupo" defaultValue={sp.grupo ?? ""} aria-label="Grupo" style={{ maxWidth: 200 }}><option value="">Todos os grupos</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
        <button className="btn" type="submit">Filtrar</button><span className="grow" /><span className="muted">{total} itens</span>
      </form>
      <div className="tbl">
        {rows.length ? (
          <table><thead><tr><th>Código</th><th>Descrição</th><th>Tipo</th><th>Grupo</th><th>Un.</th><th className="num">Est. mínimo</th><th className="num">Custo</th><th className="num">Preço</th><th>Situação</th></tr></thead>
            <tbody>{rows.map(({ i, g }) => (
              <tr key={i.id}>
                <td>{i.code}</td><td><Link className="row-link" href={`/itens/${i.id}`}>{i.name}</Link></td><td>{itemTypeLabel(i.type)}</td><td>{g ?? "—"}</td><td>{i.unit}</td>
                <td className="num">{fmtQty(i.minStock)}</td><td className="num">{fmtMoney(i.cost)}</td><td className="num">{fmtMoney(i.salePrice)}</td>
                <td>{i.active ? <span className="badge ok">Ativo</span> : <span className="badge">Inativo</span>}</td>
              </tr>))}</tbody></table>
        ) : <div className="empty"><strong>{filtered ? "Nenhum item neste filtro" : "Nenhum item cadastrado"}</strong>{filtered ? "Ajuste a busca ou os filtros." : "Cadastre o primeiro item."}</div>}
        {pages > 1 && <div className="pager">{page > 1 && <Link className="btn btn-sm" href={qs(page - 1)}>Anterior</Link>}<span>Página {page} de {pages}</span>{page < pages && <Link className="btn btn-sm" href={qs(page + 1)}>Próxima</Link>}</div>}
      </div>
      <section className="panel" style={{ marginTop: 18, maxWidth: 640 }}><h2>Grupos de itens</h2><div className="pb stack">
        {groups.length ? <div className="tbl solo"><table><tbody>{groups.map((g) => (
          <tr key={g.id}><td>{g.name}</td><td className="num muted">{g.n} itens</td>
            <td className="num">{admin && <Form action={deleteGroupAction} className="inline-form"><Hidden name="id" value={g.id} /><Submit variant="danger" pending="…" confirm={`Excluir o grupo ${g.name}?`}>Excluir</Submit></Form>}</td></tr>))}
        </tbody></table></div> : <p className="muted" style={{ margin: 0 }}>Nenhum grupo cadastrado.</p>}
        <Form action={createGroupAction}>
          <Field name="nome" label="Novo grupo" placeholder="Ex.: Chapas e perfis" required />
          <div className="fld" style={{ alignSelf: "end" }}><Submit pending="Criando…">Adicionar grupo</Submit></div>
        </Form>
      </div></section>
    </>
  );
}
