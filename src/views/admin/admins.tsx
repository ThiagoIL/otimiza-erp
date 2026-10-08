import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/context";
import { Field, Form, Hidden, Submit } from "@/components/Form";
import { UserTable } from "@/components/UserTable";
import { createUserAction } from "@/server/user-actions";

export async function AdminAdmins() {
  const s = await requireAdmin();
  const us = await db.select().from(users).where(eq(users.role, "SUPER_ADMIN")).orderBy(asc(users.name));
  return (
    <>
      <div className="ph"><div><h1>Administradores do sistema</h1><p>Quem cria e gerencia as bases dos clientes. A conta master é protegida: não pode ser excluída, desativada nem rebaixada.</p></div></div>
      <UserTable users={us} hrefBase="/usuarios" selfId={s.user.id} />
      <section className="panel" style={{ maxWidth: 640, marginTop: 18 }}><h2>Novo administrador do sistema</h2><div className="pb">
        <Form action={createUserAction}>
          <Hidden name="papel" value="SUPER_ADMIN" />
          <Field name="nome" label="Nome" required full />
          <Field name="email" label="E-mail" type="email" required full />
          <div className="full form-foot"><Submit pending="Criando…">Criar administrador</Submit></div>
        </Form>
      </div></section>
    </>
  );
}
