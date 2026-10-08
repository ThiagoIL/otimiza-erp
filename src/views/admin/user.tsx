import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants, users } from "@/db/schema";
import { requireAdmin, toActor } from "@/lib/context";
import { UserEditor } from "@/components/UserEditor";
import { ROLE_LABEL } from "@/lib/rules";

export async function AdminUser({ id }: { id: string }) {
  const s = await requireAdmin();
  const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!u) notFound();
  const [t] = u.tenantId ? await db.select().from(tenants).where(eq(tenants.id, u.tenantId)).limit(1) : [];
  const back = t ? `/empresas/${t.id}` : "/administradores";
  return (
    <>
      <div className="ph"><div><Link className="back" href={back}>‹ {t ? t.name : "Administradores"}</Link><h1>{u.name}</h1><p>{u.email} · {ROLE_LABEL[u.role]}{t ? ` · ${t.name}` : ""}</p></div></div>
      <div style={{ maxWidth: 720 }}><UserEditor user={u} actor={toActor(s)} back={back} /></div>
    </>
  );
}
