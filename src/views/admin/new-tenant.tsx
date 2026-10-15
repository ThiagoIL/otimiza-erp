import Link from "next/link";
import { requireAdmin } from "@/lib/context";
import { Field, Form, Submit } from "@/components/Form";
import { createTenantAction } from "@/server/admin-actions";

export async function AdminNewTenant() {
  await requireAdmin();
  return (
    <>
      <div className="ph"><div><Link className="back" href="/empresas">‹ Empresas</Link><h1>Nova empresa</h1><p>Cria a base da empresa e o primeiro administrador dela, com uma senha provisória.</p></div></div>
      <section className="panel" style={{ maxWidth: 760 }}>
        <div className="pb">
          <Form action={createTenantAction}>
            <Field name="nome" label="Nome da empresa" required full />
            <Field name="slug" label="Subdomínio" required placeholder="msuassuna" hint={`Endereço de acesso: subdominio.${process.env.ROOT_DOMAIN}. Letras minúsculas, números e hífen.`} />
            <Field name="documento" label="CNPJ" placeholder="00.000.000/0000-00" />
            <div className="full"><h2 style={{ margin: "8px 0 0" }}>Plano de usuários</h2></div>
            <Field name="max_usuarios" label="Usuários cadastrados (máximo)" type="number" placeholder="Sem limite" hint="Vazio = sem limite. Conta o administrador." />
            <Field name="max_simultaneos" label="Usuários simultâneos (máximo)" type="number" placeholder="Sem limite" hint="Conectados ao mesmo tempo. Vazio = sem limite." />
            <div className="full"><h2 style={{ margin: "8px 0 0" }}>Primeiro administrador da empresa</h2></div>
            <Field name="admin_nome" label="Nome" required />
            <Field name="admin_email" label="E-mail" type="email" required />
            <div className="full form-foot"><Link className="btn" href="/empresas">Voltar</Link><Submit pending="Criando…">Criar empresa</Submit></div>
          </Form>
        </div>
      </section>
    </>
  );
}
