import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { requireTenantUser } from "@/lib/context";
import { Field, Form, Submit } from "@/components/Form";
import { UserTable } from "@/components/UserTable";
import { createUserAction } from "@/server/user-actions";

export async function TenantUsers() {
  const s = await requireTenantUser({ admin: true });
  const us = await db.select().from(users).where(eq(users.tenantId, s.tenant.id)).orderBy(asc(users.name));
  return (
    <>
      <div className="ph"><div><h1>Usuários</h1><p>Quem acessa o sistema da {s.tenant.name}. Administradores gerenciam usuários; usuários comuns usam os módulos.</p></div></div>
      <UserTable users={us} hrefBase="/usuarios" selfId={s.user.id} />
      <section className="panel" style={{ maxWidth: 640, marginTop: 18 }}><h2>Novo usuário</h2><div className="pb">
        <Form action={createUserAction}>
          <Field name="nome" label="Nome" required full />
          <Field name="email" label="E-mail" type="email" required />
          <Field name="papel" label="Nível de acesso" options={[["TENANT_USER", "Usuário"], ["TENANT_ADMIN", "Administrador da empresa"]]} defaultValue="TENANT_USER" />
          <div className="full form-foot"><Submit pending="Criando…">Criar usuário</Submit></div>
        </Form>
      </div></section>
    </>
  );
}
