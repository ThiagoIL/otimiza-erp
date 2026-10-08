import type { User } from "@/db/schema";
import { Field, Form, Hidden, Submit } from "./Form";
import { ROLE_LABEL, assignableTenantRoles, canChangeRole, canChangeStatus, canDelete, canResetPassword, type Actor, type Target } from "@/lib/rules";
import { deleteUserAction, resetPasswordAction, unlockUserAction, updateUserAction } from "@/server/user-actions";
import { fmtDateTime } from "@/lib/format";

/** Edição de um usuário. Campos que o ator não pode mudar aparecem travados (e o servidor confere de novo). */
export function UserEditor({ user, actor, back }: { user: User; actor: Actor; back: string }) {
  const t: Target = { id: user.id, role: user.role, tenantId: user.tenantId, isMaster: user.isMaster, status: user.status };
  const self = actor.id === user.id;
  const roleLocked = user.role === "SUPER_ADMIN" || !canChangeRole(actor, t, user.role === "TENANT_ADMIN" ? "TENANT_USER" : "TENANT_ADMIN").ok;
  const statusLocked = !canChangeStatus(actor, t, "INACTIVE").ok;
  const roleOpts = assignableTenantRoles(actor).map((r) => [r, ROLE_LABEL[r]] as const);
  const reset = canResetPassword(actor, t);
  const del = canDelete(actor, t);
  const locked = !!user.lockedUntil && user.lockedUntil.getTime() > Date.now();
  return (
    <div className="stack">
      {(self || user.isMaster) && (
        <div className="alert info">
          {user.isMaster
            ? "Conta master do sistema: não pode ser excluída, desativada nem perder o nível de administrador. Só o próprio dono troca a senha dela, em Minha conta."
            : "Esta é a sua conta: você não pode mudar o seu nível de acesso, desativá-la nem excluí-la."}
        </div>
      )}
      <section className="panel">
        <h2>Dados de acesso</h2>
        <div className="pb">
          <Form action={updateUserAction}>
            <Hidden name="id" value={user.id} />
            <Field name="nome" label="Nome" defaultValue={user.name} required full />
            <div className="fld full"><label htmlFor="f_email_ro">E-mail de acesso</label><input id="f_email_ro" value={user.email} disabled readOnly /></div>
            {roleLocked
              ? <><Hidden name="papel" value={user.role} /><div className="fld"><label htmlFor="f_papel_ro">Nível de acesso</label><input id="f_papel_ro" value={ROLE_LABEL[user.role]} disabled readOnly /></div></>
              : <Field name="papel" label="Nível de acesso" options={roleOpts} defaultValue={user.role} />}
            {statusLocked
              ? <><Hidden name="situacao" value={user.status} /><div className="fld"><label htmlFor="f_sit_ro">Situação</label><input id="f_sit_ro" value={user.status === "ACTIVE" ? "Ativo" : "Inativo"} disabled readOnly /></div></>
              : <Field name="situacao" label="Situação" options={[["ACTIVE", "Ativo"], ["INACTIVE", "Inativo"]]} defaultValue={user.status} />}
            <div className="full form-foot"><Submit>Salvar alterações</Submit></div>
          </Form>
        </div>
      </section>
      <section className="panel">
        <h2>Segurança</h2>
        <div className="pb stack">
          <p className="muted" style={{ margin: 0 }}>Último acesso: {fmtDateTime(user.lastLoginAt)} · senha alterada em {fmtDateTime(user.passwordChangedAt)}{user.mustChangePassword ? " · troca de senha pendente" : ""}</p>
          {locked && (
            <Form action={unlockUserAction} className="">
              <Hidden name="id" value={user.id} />
              <div className="alert warn">Conta bloqueada por tentativas erradas até {fmtDateTime(user.lockedUntil)}.</div>
              <Submit variant="default" pending="Desbloqueando…">Desbloquear agora</Submit>
            </Form>
          )}
          {reset.ok ? (
            <Form action={resetPasswordAction} className="">
              <Hidden name="id" value={user.id} />
              <p style={{ marginTop: 0 }}>Gera uma senha provisória e desconecta o usuário. Ele precisará trocá-la no próximo acesso.</p>
              <Submit variant="default" pending="Gerando…" confirm="Gerar uma nova senha provisória para este usuário?">Redefinir senha</Submit>
            </Form>
          ) : <p className="muted" style={{ margin: 0 }}>{reset.reason}</p>}
        </div>
      </section>
      {del.ok && (
        <section className="panel danger-zone">
          <h2>Excluir usuário</h2>
          <div className="pb">
            <Form action={deleteUserAction} className="">
              <Hidden name="id" value={user.id} /><Hidden name="voltar" value={back} />
              <p style={{ marginTop: 0 }}>A exclusão é definitiva. Se a pessoa apenas saiu da empresa, prefira deixá-la inativa.</p>
              <Submit variant="danger" pending="Excluindo…" confirm={`Excluir definitivamente ${user.email}?`}>Excluir usuário</Submit>
            </Form>
          </div>
        </section>
      )}
    </div>
  );
}
