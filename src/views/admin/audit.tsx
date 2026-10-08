import { and, desc, eq, ilike, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLogs, tenants } from "@/db/schema";
import { requireAdmin } from "@/lib/context";
import { fmtDateTime } from "@/lib/format";

export async function AdminAudit({ searchParams }: { searchParams: Promise<{ acao?: string; empresa?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const conds: SQL[] = [];
  if (sp.acao) conds.push(ilike(auditLogs.action, `%${sp.acao.slice(0, 40)}%`));
  if (sp.empresa) conds.push(eq(auditLogs.tenantId, sp.empresa.slice(0, 64)));
  const [rows, ts] = await Promise.all([
    db.select({ a: auditLogs, t: tenants.name }).from(auditLogs).leftJoin(tenants, eq(tenants.id, auditLogs.tenantId))
      .where(conds.length ? and(...conds) : undefined).orderBy(desc(auditLogs.createdAt)).limit(300),
    db.select({ id: tenants.id, name: tenants.name }).from(tenants).orderBy(tenants.name),
  ]);
  return (
    <>
      <div className="ph"><div><h1>Auditoria</h1><p>Acessos e alterações feitos no sistema (últimos 300 registros do filtro).</p></div></div>
      <form className="bar" role="search">
        <input type="search" name="acao" defaultValue={sp.acao ?? ""} placeholder="Ação (ex.: login, usuario, empresa)" aria-label="Filtrar por ação" />
        <select name="empresa" defaultValue={sp.empresa ?? ""} aria-label="Empresa" style={{ maxWidth: 260 }}>
          <option value="">Todas as empresas e o sistema</option>{ts.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button className="btn" type="submit">Filtrar</button>
      </form>
      <div className="tbl">
        {rows.length ? <table><thead><tr><th>Quando</th><th>Ação</th><th>Empresa</th><th>Quem</th><th>Detalhes</th><th>IP</th></tr></thead>
          <tbody>{rows.map(({ a, t }) => (
            <tr key={a.id}><td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(a.createdAt)}</td><td>{a.action}</td><td>{t ?? "Sistema"}</td><td>{a.userEmail ?? "—"}</td>
              <td style={{ fontSize: 12, maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.data ? JSON.stringify(a.data) : ""}>{a.data ? JSON.stringify(a.data) : ""}</td><td>{a.ip}</td></tr>))}
          </tbody></table> : <div className="empty">Nenhum registro.</div>}
      </div>
    </>
  );
}
