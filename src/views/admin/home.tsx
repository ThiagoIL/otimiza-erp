import Link from "next/link";
import { desc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLogs, tenants, users } from "@/db/schema";
import { requireAdmin } from "@/lib/context";
import { fmtDateTime } from "@/lib/format";

export async function AdminHome() {
  const s = await requireAdmin();
  const [[t], [u], recent] = await Promise.all([
    db.select({ total: sql<number>`count(*)::int`, ativas: sql<number>`(count(*) filter (where status = 'ACTIVE'))::int` }).from(tenants),
    db.select({ total: sql<number>`(count(*) filter (where role <> 'SUPER_ADMIN'))::int`, admins: sql<number>`(count(*) filter (where role = 'SUPER_ADMIN'))::int` }).from(users),
    db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(10),
  ]);
  return (
    <>
      <div className="ph"><div><h1>Olá, {s.user.name.split(" ")[0]}.</h1><p>Gerencie as empresas clientes e os acessos, e acompanhe a auditoria.</p></div>
        <div className="acts"><Link className="btn btn-primary" href="/empresas/nova">Nova empresa</Link></div></div>
      <div className="kpis">
        <Link className="kpi" href="/empresas?situacao=ACTIVE"><b>{t.ativas}</b><span>Empresas ativas</span></Link>
        <Link className="kpi" href="/empresas?situacao=SUSPENDED"><b>{t.total - t.ativas}</b><span>Empresas suspensas</span></Link>
        <div className="kpi"><b>{u.total}</b><span>Usuários das empresas</span></div>
        <Link className="kpi" href="/administradores"><b>{u.admins}</b><span>Administradores do sistema</span></Link>
      </div>
      <section className="panel">
        <h2>Atividade recente</h2>
        {recent.length ? (
          <div className="tbl solo" style={{ border: 0 }}><table><thead><tr><th>Quando</th><th>Ação</th><th>Quem</th><th>IP</th></tr></thead>
            <tbody>{recent.map((a) => <tr key={a.id}><td>{fmtDateTime(a.createdAt)}</td><td>{a.action}</td><td>{a.userEmail ?? "—"}</td><td>{a.ip}</td></tr>)}</tbody></table></div>
        ) : <div className="empty">Nada registrado ainda.</div>}
      </section>
    </>
  );
}
