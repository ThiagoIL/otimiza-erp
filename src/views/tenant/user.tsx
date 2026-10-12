import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db, withTenant } from "@/lib/db";
import { users } from "@/db/schema";
import { accessProfiles } from "@/db/erp";
import { requireTenantUser, toActor } from "@/lib/context";
import { UserEditor } from "@/components/UserEditor";
import { UserProfileSelect } from "@/components/AdminUI";
import { PageHead } from "@/components/ui";
import { ROLE_LABEL } from "@/lib/rules";

export async function TenantUser({ id }: { id: string }) {
  const s = await requireTenantUser({ admin: true });
  const [u] = await db.select().from(users).where(and(eq(users.id, id), eq(users.tenantId, s.tenant.id))).limit(1);
  if (!u) notFound();
  const profiles = await withTenant(s.tenant.id, (tx) => tx.select({ id: accessProfiles.id, n: accessProfiles.name }).from(accessProfiles).orderBy(asc(accessProfiles.name)));
  return (
    <>
      <PageHead title={u.name} sub={`${u.email} · ${ROLE_LABEL[u.role]}`} back={{ href: "/usuarios", label: "Usuários" }} />
      <div style={{ maxWidth: 760 }} className="stack">
        <section className="panel"><h2>Perfil de acesso</h2><div className="pb">
          {u.role === "TENANT_ADMIN"
            ? <p className="muted" style={{ margin: 0 }}>Administradores da empresa têm acesso total, inclusive aos custos de produção e à Administração.</p>
            : <><UserProfileSelect userId={u.id} value={u.profileId} profiles={profiles.map((p) => [p.id, p.n])} />
              <p className="muted" style={{ fontSize: 12.5, margin: "10px 0 0" }}>Os perfis definem os módulos que o usuário consulta ou edita e se ele vê os custos. Crie e ajuste perfis em Administração › Perfis de acesso.</p></>}
        </div></section>
        <UserEditor user={u} actor={toActor(s)} back="/usuarios" />
      </div>
    </>
  );
}
