import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { withTenant } from "@/lib/db";
import { partners, salesOrders } from "@/db/schema";
import { requireTenantUser } from "@/lib/context";
import { fmtDoc, fmtMoney } from "@/lib/format";
import { PartnerForm } from "@/components/PartnerForm";
import { Form, Hidden, Submit } from "@/components/Form";
import { deletePartnerAction } from "@/server/sales-actions";
import { col } from "@/lib/sql";

const PAGE = 50;
const KINDS = [["cliente", "Clientes"], ["fornecedor", "Fornecedores"], ["transportadora", "Transportadoras"]] as const;

export async function Partners({ searchParams }: { searchParams: Promise<{ q?: string; tipo?: string; p?: string; salvo?: string; excluido?: string; inativos?: string }> }) {
  const s = await requireTenantUser();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const page = Math.max(1, Math.min(1000, Number(sp.p) || 1));
  const conds: SQL[] = [eq(partners.tenantId, s.tenant.id)];
  if (q) conds.push(or(ilike(partners.name, `%${q}%`), ilike(partners.tradeName, `%${q}%`), ilike(partners.document, `%${q.replace(/\D/g, "") || q}%`), ilike(partners.city, `%${q}%`))!);
  if (sp.tipo === "cliente") conds.push(eq(partners.isCustomer, true));
  if (sp.tipo === "fornecedor") conds.push(eq(partners.isSupplier, true));
  if (sp.tipo === "transportadora") conds.push(eq(partners.isCarrier, true));
  if (!sp.inativos) conds.push(eq(partners.active, true));
  const where = and(...conds);
  const [rows, [tot], [cnt]] = await withTenant(s.tenant.id, async (tx) => [
    await tx.select({
      p: partners,
      vendas: sql<string>`(select coalesce(sum(${col(salesOrders.total)}), 0) from ${salesOrders} where ${col(salesOrders.customerId)} = ${col(partners.id)} and ${col(salesOrders.status)} <> 'CANCELADO')`,
    }).from(partners).where(where).orderBy(asc(partners.name)).limit(PAGE).offset((page - 1) * PAGE),
    await tx.select({ total: sql<number>`count(*)::int` }).from(partners).where(where),
    await tx.select({
      c: sql<number>`(count(*) filter (where ${partners.isCustomer}))::int`, f: sql<number>`(count(*) filter (where ${partners.isSupplier}))::int`,
      t: sql<number>`(count(*) filter (where ${partners.isCarrier}))::int`,
    }).from(partners).where(eq(partners.active, true)),
  ] as const);
  const pages = Math.max(1, Math.ceil(tot.total / PAGE));
  const qs = (p: number) => `?${new URLSearchParams({ ...(q && { q }), ...(sp.tipo && { tipo: sp.tipo }), ...(sp.inativos && { inativos: "1" }), p: String(p) })}`;
  const counts: Record<string, number> = { cliente: cnt.c, fornecedor: cnt.f, transportadora: cnt.t };
  return (
    <>
      <div className="ph"><div><h1>Clientes e fornecedores</h1><p>Um cadastro só para quem compra, vende ou transporta. Um mesmo cadastro pode ser cliente e fornecedor.</p></div>
        <div className="acts"><Link className="btn btn-primary" href={`/comercial/cadastros/novo${sp.tipo ? `?tipo=${sp.tipo}` : ""}`}>Novo cadastro</Link></div></div>
      {sp.salvo && <div className="alert ok" role="status">Cadastro “{sp.salvo.slice(0, 120)}” salvo.</div>}
      {sp.excluido && <div className="alert ok" role="status">Cadastro excluído.</div>}
      <nav className="chips" aria-label="Tipo de cadastro">
        <Link href="?" aria-current={!sp.tipo ? "true" : undefined}>Todos</Link>
        {KINDS.map(([k, l]) => <Link key={k} href={`?tipo=${k}`} aria-current={sp.tipo === k ? "true" : undefined}>{l} <span className="n">{counts[k]}</span></Link>)}
      </nav>
      <form className="bar" role="search">
        {sp.tipo && <input type="hidden" name="tipo" value={sp.tipo} />}
        <input type="search" name="q" defaultValue={q} placeholder="Nome, CNPJ/CPF ou cidade" aria-label="Buscar cadastro" />
        <label className="chk inline-lbl"><input type="checkbox" name="inativos" value="1" defaultChecked={!!sp.inativos} /> Mostrar inativos</label>
        <button className="btn" type="submit">Filtrar</button><span className="grow" /><span className="muted">{tot.total} cadastros</span>
      </form>
      <div className="tbl">
        {rows.length ? (
          <table><thead><tr><th>Nome</th><th>CNPJ / CPF</th><th>Tipo</th><th>Cidade</th><th>Contato</th><th className="num">Vendas</th></tr></thead>
            <tbody>{rows.map(({ p, vendas }) => (
              <tr key={p.id}>
                <td><Link className="row-link" href={`/comercial/cadastros/${p.id}`}>{p.name}</Link>{p.tradeName && <small className="sub">{p.tradeName}</small>}{!p.active && <> <span className="badge">Inativo</span></>}</td>
                <td className="nowrap">{fmtDoc(p.document)}</td>
                <td><span className="tags">{p.isCustomer && <span className="badge brand">Cliente</span>}{p.isSupplier && <span className="badge">Fornecedor</span>}{p.isCarrier && <span className="badge">Transportadora</span>}</span></td>
                <td>{p.city ? `${p.city}${p.state ? `/${p.state}` : ""}` : "—"}</td>
                <td>{p.phone ?? p.email ?? "—"}{p.contact && <small className="sub">{p.contact}</small>}</td>
                <td className="num">{p.isCustomer ? fmtMoney(vendas) : "—"}</td>
              </tr>))}</tbody></table>
        ) : <div className="empty"><strong>Nenhum cadastro encontrado</strong>{q || sp.tipo ? "Ajuste a busca ou o tipo." : "Cadastre o primeiro cliente ou fornecedor."}</div>}
        {pages > 1 && <div className="pager">{page > 1 && <Link className="btn btn-sm" href={qs(page - 1)}>Anterior</Link>}<span>Página {page} de {pages}</span>{page < pages && <Link className="btn btn-sm" href={qs(page + 1)}>Próxima</Link>}</div>}
      </div>
    </>
  );
}

export async function PartnerNew({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  await requireTenantUser();
  const sp = await searchParams;
  return (
    <>
      <div className="ph"><div><Link className="back" href="/comercial/cadastros">‹ Clientes e fornecedores</Link><h1>Novo cadastro</h1></div></div>
      <section className="panel" style={{ maxWidth: 860 }}><div className="pb"><PartnerForm preset={sp.tipo} /></div></section>
    </>
  );
}

export async function PartnerEdit({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireTenantUser();
  const { id } = await params;
  const [p] = await withTenant(s.tenant.id, (tx) => tx.select().from(partners).where(and(eq(partners.id, id), eq(partners.tenantId, s.tenant.id))).limit(1));
  if (!p) notFound();
  return (
    <>
      <div className="ph"><div><Link className="back" href="/comercial/cadastros">‹ Clientes e fornecedores</Link><h1>{p.name}</h1><p>{fmtDoc(p.document)}</p></div>
        {p.isCustomer && <div className="acts"><Link className="btn" href={`/comercial?q=${encodeURIComponent(p.name)}`}>Pedidos do cliente</Link><Link className="btn btn-primary" href={`/comercial/pedidos/novo?cliente=${p.id}`}>Novo pedido</Link></div>}</div>
      <section className="panel" style={{ maxWidth: 860 }}><div className="pb"><PartnerForm partner={p} /></div></section>
      {s.user.role === "TENANT_ADMIN" && (
        <section className="panel danger-zone" style={{ maxWidth: 860, marginTop: 16 }}><h2>Excluir cadastro</h2><div className="pb">
          <Form action={deletePartnerAction} className="">
            <Hidden name="id" value={p.id} />
            <p style={{ marginTop: 0 }}>Só é possível excluir cadastros sem pedidos ou lançamentos. Se deixou de ser usado, desmarque “Cadastro ativo”.</p>
            <Submit variant="danger" pending="Excluindo…" confirm={`Excluir ${p.name}?`}>Excluir cadastro</Submit>
          </Form>
        </div></section>
      )}
    </>
  );
}
