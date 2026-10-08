import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { requireTenantUser, toActor } from "@/lib/context";
import { UserEditor } from "@/components/UserEditor";
import { ROLE_LABEL } from "@/lib/rules";

export async function TenantUser({ id }: { id: string }) {
  const s = await requireTenantUser({ admin: true });
  const [u] = await db.select().from(users).where(and(eq(users.id, id), eq(users.tenantId, s.tenant.id))).limit(1);
  if (!u) notFound();
  return (
    <>
      <div className="ph"><div><Link className="back" href="/usuarios">‹ Usuários</Link><h1>{u.name}</h1><p>{u.email} · {ROLE_LABEL[u.role]}</p></div></div>
      <div style={{ maxWidth: 720 }}><UserEditor user={u} actor={toActor(s)} back="/usuarios" /></div>
    </>
  );
}
