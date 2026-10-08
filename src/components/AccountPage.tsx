import { Field, Form, Submit } from "./Form";
import { changePasswordAction } from "@/server/auth-actions";

export function AccountPage({ user, mustChange, roleLabel }: { user: { name: string; email: string }; mustChange: boolean; roleLabel: string }) {
  return (
    <>
      <div className="ph"><div><h1>Minha conta</h1><p>{user.name} · {user.email} · {roleLabel}</p></div></div>
      {mustChange && <div className="alert warn">Por segurança, troque a senha provisória antes de continuar.</div>}
      <section className="panel" style={{ maxWidth: 560 }}>
        <h2>Trocar senha</h2>
        <div className="pb">
          <Form action={changePasswordAction}>
            <Field name="senha_atual" label="Senha atual" type="password" autoComplete="current-password" required full />
            <Field name="senha_nova" label="Nova senha" type="password" required full hint="Mínimo de 10 caracteres, com letras maiúsculas, minúsculas e números." />
            <Field name="senha_confirma" label="Repita a nova senha" type="password" required full />
            <div className="full form-foot"><Submit>Trocar senha</Submit></div>
          </Form>
        </div>
      </section>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>A senha não pode ser removida, apenas trocada por outra que siga a política de segurança. Ao trocar, as outras sessões abertas com a sua conta são encerradas.</p>
    </>
  );
}
