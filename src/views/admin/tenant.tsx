import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants, users } from "@/db/schema";
import { requireAdmin } from "@/lib/context";
import { Field, Form, Hidden, Submit } from "@/components/Form";
import { UserTable } from "@/components/UserTable";
import { updateTenantAction } from "@/server/admin-actions";
import { createUserAction } from "@/server/user-actions";
import { fmtDateTime, tenantUrl } from "@/lib/format";

export async function AdminTenant({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const [t] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
  if (!t) notFound();
  const us = await db.select().from(users).where(eq(users.tenantId, t.id)).orderBy(asc(users.name));
  return (
    <>
      <div className="ph"><div><Link className="back" href="/empresas">‹ Empresas</Link><h1>{t.name}</h1>
        <p><a href={tenantUrl(t.slug)} target="_blank" rel="noopener noreferrer">{t.slug}.{process.env.ROOT_DOMAIN}</a> · criada em {fmtDateTime(t.createdAt)}</p></div></div>
      <div className="grid2">
        <section className="panel"><h2>Dados da empresa</h2><div className="pb">
          <Form action={updateTenantAction}>
            <Hidden name="id" value={t.id} />
            <Field name="nome" label="Nome" defaultValue={t.name} required full />
            <div className="fld"><label htmlFor="f_slug_ro">Subdomínio</label><input id="f_slug_ro" value={t.slug} disabled readOnly /><small>Não muda depois de criado.</small></div>
            <Field name="documento" label="CNPJ" defaultValue={t.document} />
            <Field name="situacao" label="Situação" options={[["ACTIVE", "Ativa"], ["SUSPENDED", "Suspensa (bloqueia o acesso)"]]} defaultValue={t.status} full />
            <Field name="observacoes" label="Observações internas" type="textarea" defaultValue={t.notes} full maxLength={1000} />
            <div className="full form-foot"><Submit>Salvar</Submit></div>
          </Form>
        </div></section>
        <section className="panel"><h2>Adicionar usuário</h2><div className="pb">
          <Form action={createUserAction}>
            <Hidden name="empresa" value={t.id} />
            <Field name="nome" label="Nome" required full />
            <Field name="email" label="E-mail" type="email" required />
            <Field name="papel" label="Nível de acesso" options={[["TENANT_USER", "Usuário"], ["TENANT_ADMIN", "Administrador da empresa"]]} defaultValue="TENANT_USER" />
            <div className="full form-foot"><Submit pending="Criando…">Criar usuário</Submit></div>
          </Form>
        </div></section>
      </div>
      <h2 style={{ margin: "22px 0 10px" }}>Usuários da empresa</h2>
      <UserTable users={us} hrefBase="/usuarios" />
    </>
  );
}
