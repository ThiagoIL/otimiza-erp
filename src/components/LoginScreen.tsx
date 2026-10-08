import { BrandPanel } from "./Brand";
import { Field, Form, Submit } from "./Form";
import { loginAction } from "@/server/auth-actions";

export function LoginScreen({ title, subtitle, tag, blocked }: { title: string; subtitle: string; tag: string; blocked?: string }) {
  return (
    <main className="login">
      <BrandPanel tag={tag} />
      <section className="login-side">
        <div className="login-form">
          <h1>{title}</h1>
          <p className="lead">{subtitle}</p>
          {blocked ? <div className="alert warn">{blocked}</div> : (
            <Form action={loginAction} className="stack">
              <Field name="email" label="E-mail" type="email" autoComplete="username" required />
              <Field name="senha" label="Senha" type="password" autoComplete="current-password" required />
              <Submit block pending="Entrando…">Entrar</Submit>
            </Form>
          )}
        </div>
      </section>
    </main>
  );
}
