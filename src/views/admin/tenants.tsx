import Link from "next/link";
import { and, asc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants, users } from "@/db/schema";
import { requireAdmin } from "@/lib/context";
import { fmtDate, tenantUrl } from "@/lib/format";
import { col } from "@/lib/sql";

export async function AdminTenants({ searchParams }: { searchParams: Promise<{ q?: string; situacao?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const conds: SQL[] = [];
  if (q) conds.push(or(ilike(tenants.name, `%${q}%`), ilike(tenants.slug, `%${q}%`), ilike(tenants.document, `%${q}%`))!);
  if (sp.situacao === "ACTIVE" || sp.situacao === "SUSPENDED") conds.push(eq(tenants.status, sp.situacao));
  const rows = await db.select({ t: tenants, n: sql<number>`(select count(*)::int from ${users} where ${col(users.tenantId)} = ${col(tenants.id)})` })
    .from(tenants).where(conds.length ? and(...conds) : undefined).orderBy(asc(tenants.name)).limit(500);
  return (
    <>
      <div className="ph"><div><h1>Empresas</h1><p>Cada empresa tem os dados isolados das demais e é acessada pelo próprio subdomínio.</p></div>
        <div className="acts"><Link className="btn btn-primary" href="/empresas/nova">Nova empresa</Link></div></div>
      <form className="bar" role="search">
        <input type="search" name="q" defaultValue={q} placeholder="Nome, subdomínio ou CNPJ" aria-label="Buscar empresa" />
        <select name="situacao" defaultValue={sp.situacao ?? ""} aria-label="Situação" style={{ maxWidth: 200 }}>
          <option value="">Todas as situações</option><option value="ACTIVE">Ativas</option><option value="SUSPENDED">Suspensas</option>
        </select>
        <button className="btn" type="submit">Filtrar</button><span className="grow" /><span className="muted">{rows.length} empresas</span>
      </form>
      <div className="tbl">
        {rows.length ? (
          <table><thead><tr><th>Empresa</th><th>Endereço de acesso</th><th>CNPJ</th><th className="num">Usuários</th><th>Situação</th><th>Criada em</th></tr></thead>
            <tbody>{rows.map(({ t, n }) => (
              <tr key={t.id}>
                <td><Link className="row-link" href={`/empresas/${t.id}`}>{t.name}</Link></td>
                <td><a href={tenantUrl(t.slug)} target="_blank" rel="noopener noreferrer">{t.slug}.{process.env.ROOT_DOMAIN}</a></td>
                <td>{t.document || "—"}</td><td className="num">{n}</td>
                <td>{t.status === "ACTIVE" ? <span className="badge ok">Ativa</span> : <span className="badge bad">Suspensa</span>}</td>
                <td>{fmtDate(t.createdAt)}</td>
              </tr>))}</tbody></table>
        ) : <div className="empty"><strong>Nenhuma empresa encontrada</strong>Cadastre a primeira empresa cliente.</div>}
      </div>
    </>
  );
}
