import { asc, eq } from "drizzle-orm";
import { db, withTenant } from "@/lib/db";
import { users } from "@/db/schema";
import { accessProfiles } from "@/db/erp";
import { requireTenantUser } from "@/lib/context";
import { Field, Form, Submit } from "@/components/Form";
import { ClickRow } from "@/components/client";
import { PageHead } from "@/components/ui";
import { createUserAction } from "@/server/user-actions";
import { ROLE_LABEL } from "@/lib/rules";
import { fmtDateTime } from "@/lib/format";
import { onlineSessions, usageOf } from "@/lib/limits";
import { OnlineTable, PlanBars } from "@/components/PlanUsage";

export async function TenantUsers() {
  const s = await requireTenantUser({ admin: true });
  const us = await db.select().from(users).where(eq(users.tenantId, s.tenant.id)).orderBy(asc(users.name));
  const profiles = await withTenant(s.tenant.id, (tx) => tx.select({ id: accessProfiles.id, n: accessProfiles.name }).from(accessProfiles).orderBy(asc(accessProfiles.name)));
  const pn = new Map(profiles.map((p) => [p.id, p.n]));
  const [usage, online] = await Promise.all([usageOf(s.tenant.id), onlineSessions(s.tenant.id)]);
  const onIds = new Set(online.map((o) => o.userId));
  const cheio = usage.maxUsers != null && usage.users >= usage.maxUsers;
  const now = new Date();
  return (
    <>
      <PageHead title="Usuários" sub={`Quem acessa o sistema da ${s.tenant.name}. Administradores gerenciam usuários, perfis e dados da empresa; os demais usam os módulos conforme o perfil de acesso.`} />
      <section className="panel" style={{ marginBottom: 16 }}><h2>Plano de usuários</h2>
        <div className="pb"><PlanBars u={usage} />
          {(usage.maxUsers != null || usage.maxSessions != null) && <p className="muted" style={{ fontSize: 12.5, margin: "10px 0 0" }}>Para aumentar os limites, fale com o suporte do Otimiza+.</p>}</div>
        {usage.online > 0 && <><h3 className="sec" style={{ margin: "0 18px 8px" }}>Conectados agora</h3><OnlineTable rows={online} selfSession={s.sessionId} /></>}
      </section>
      <div className="tbl solo">
        <table>
          <thead><tr><th>Nome</th><th>E-mail</th><th>Nível</th><th>Perfil de acesso</th><th>Situação</th><th>Último acesso</th></tr></thead>
          <tbody>{us.map((u) => (
            <ClickRow key={u.id} href={`/usuarios/${u.id}`}>
              <td className="desc"><span style={{ display: "flex", alignItems: "center", gap: 8 }}><span className="avatar sm">{u.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}</span>{u.name}{u.id === s.user.id && <span className="badge">você</span>}{onIds.has(u.id) && <span className="live" title="Conectado agora"><span className="live-dot" /></span>}</span></td>
              <td className="code">{u.email}</td><td>{ROLE_LABEL[u.role]}</td>
              <td>{u.role === "TENANT_ADMIN" ? <span className="muted">Acesso total</span> : u.profileId ? pn.get(u.profileId) ?? "—" : <span className="muted">Sem perfil</span>}</td>
              <td>{u.status !== "ACTIVE" ? <span className="badge bad">Inativo</span> : u.lockedUntil && u.lockedUntil > now ? <span className="badge warn">Bloqueado</span> : <span className="badge ok">Ativo</span>}</td>
              <td>{fmtDateTime(u.lastLoginAt)}</td>
            </ClickRow>))}</tbody>
        </table>
      </div>
      <section className="panel" style={{ maxWidth: 720, marginTop: 18 }}><h2>Novo usuário</h2><div className="pb">
        {cheio && <div className="warnline" style={{ marginTop: 0, marginBottom: 12 }}>O plano permite {usage.maxUsers} usuários ativos e todos estão em uso. Inative alguém ou fale com o suporte para aumentar.</div>}
        <Form action={createUserAction}>
          <Field name="nome" label="Nome" required full />
          <Field name="email" label="E-mail" type="email" required />
          <Field name="papel" label="Nível de acesso" options={[["TENANT_USER", "Usuário"], ["TENANT_ADMIN", "Administrador da empresa"]]} defaultValue="TENANT_USER" />
          <Field name="perfil" label="Perfil de acesso (para usuários)" options={profiles.map((p) => [p.id, p.n] as const)} emptyOption="Sem perfil" full />
          <div className="full form-foot"><Submit pending="Criando…">Criar usuário</Submit></div>
        </Form>
      </div></section>
    </>
  );
}
