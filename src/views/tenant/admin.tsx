import { asc, eq, sql } from "drizzle-orm";
import { requireTenantUser } from "@/lib/context";
import { db, withTenant } from "@/lib/db";
import { users } from "@/db/schema";
import * as E from "@/db/erp";
import { PageHead } from "@/components/ui";
import { ProfilesTable } from "@/components/AdminUI";
import { Field, Form, Submit } from "@/components/Form";
import { LogoUpload } from "@/components/LogoUpload";
import { saveCompanyAction } from "@/server/admin-tenant-actions";
import { UFS } from "@/components/ui";
import { REGIMES } from "@/lib/consts";

export async function ProfilesPage() {
  const s = await requireTenantUser({ admin: true });
  const rows = await withTenant(s.tenant.id, (tx) => tx.select().from(E.accessProfiles).orderBy(asc(E.accessProfiles.name)));
  const counts = await db.select({ p: users.profileId, n: sql<number>`count(*)::int` }).from(users).where(eq(users.tenantId, s.tenant.id)).groupBy(users.profileId);
  return (
    <>
      <PageHead title="Perfis de acesso" sub="O que cada perfil pode ver e alterar em cada módulo, e quem pode ver os custos de produção. Ligue o perfil ao usuário na tela do usuário." />
      <ProfilesTable rows={rows.map((p) => ({ id: p.id, name: p.name, description: p.description ?? "", permissions: p.permissions, users: counts.find((c) => c.p === p.id)?.n ?? 0 }))} />
    </>
  );
}

export async function CompanyPage() {
  const s = await requireTenantUser({ admin: true });
  const [c] = await withTenant(s.tenant.id, (tx) => tx.select().from(E.companySettings).limit(1));
  return (
    <>
      <PageHead title="Empresa" sub="Dados da empresa usados no cabeçalho das propostas, pedidos e documentos impressos." />
      <section className="panel sec-panel" style={{ marginBottom: 16 }}><h2>Logo da empresa</h2><div className="pb">
        <LogoUpload src={c?.logo ? `/api/logo?v=${c.logoAt?.getTime() ?? 0}` : null} />
      </div></section>
      <Form action={saveCompanyAction} className="sheet">
        <section className="panel sec-panel"><h2>Empresa</h2><div className="pb"><div className="form f4">
          <Field name="razao" label="Razão social" defaultValue={c?.legalName ?? s.tenant.name} full />
          <Field name="fantasia" label="Nome fantasia" defaultValue={c?.tradeName} />
          <Field name="cnpj" label="CNPJ" defaultValue={c?.document ?? s.tenant.document} />
          <Field name="ie" label="Inscrição estadual" defaultValue={c?.stateReg} />
          <Field name="im" label="Inscrição municipal" defaultValue={c?.cityReg} />
          <Field name="regime" label="Regime tributário" options={REGIMES.map((r) => [r, r] as const)} emptyOption="Não informado" defaultValue={c?.taxRegime} />
          <Field name="telefone" label="Telefone" defaultValue={c?.phone} />
          <Field name="email" label="E-mail" defaultValue={c?.email} />
          <Field name="site" label="Site" defaultValue={c?.website} />
        </div></div></section>
        <section className="panel sec-panel"><h2>Endereço</h2><div className="pb"><div className="form f4">
          <Field name="cep" label="CEP" defaultValue={c?.zip} />
          <Field name="logradouro" label="Logradouro" defaultValue={c?.street} full />
          <Field name="numero" label="Número" defaultValue={c?.number} />
          <Field name="complemento" label="Complemento" defaultValue={c?.complement} />
          <Field name="bairro" label="Bairro" defaultValue={c?.district} />
          <Field name="cidade" label="Cidade" defaultValue={c?.city} />
          <Field name="uf" label="UF" options={UFS.map((u) => [u, u] as const)} emptyOption="—" defaultValue={c?.uf} />
          <Field name="cod_mun" label="Código IBGE do município" defaultValue={c?.cityCode} />
        </div></div></section>
        <div className="sticky-foot"><Submit>Salvar dados da empresa</Submit></div>
      </Form>
    </>
  );
}

