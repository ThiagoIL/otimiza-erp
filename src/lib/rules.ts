/**
 * Regras de permissão sobre usuários. Funções puras (sem banco) para poderem ser testadas.
 * As regras críticas também são garantidas por gatilhos no banco (migração 0001).
 */
export type Role = "SUPER_ADMIN" | "TENANT_ADMIN" | "TENANT_USER";
export type Status = "ACTIVE" | "INACTIVE";

export interface Actor { id: string; role: Role; tenantId: string | null }
export interface Target { id: string; role: Role; tenantId: string | null; isMaster: boolean; status: Status }

export type Verdict = { ok: true } | { ok: false; reason: string };
const ok: Verdict = { ok: true };
const no = (reason: string): Verdict => ({ ok: false, reason });

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Administrador do sistema",
  TENANT_ADMIN: "Administrador da empresa",
  TENANT_USER: "Usuário",
};

/** O ator pode administrar (ver e editar) este usuário? */
export function canManage(actor: Actor, target: Target): Verdict {
  if (actor.role === "SUPER_ADMIN") return ok; // administrador do sistema gerencia todos
  if (actor.role === "TENANT_ADMIN") {
    if (target.role === "SUPER_ADMIN" || target.tenantId !== actor.tenantId) return no("Usuário não encontrado.");
    return ok;
  }
  return no("Você não tem permissão para gerenciar usuários.");
}

/** Níveis que o ator pode atribuir a usuários de uma empresa. */
export function assignableTenantRoles(actor: Actor): Role[] {
  return actor.role === "SUPER_ADMIN" || actor.role === "TENANT_ADMIN" ? ["TENANT_ADMIN", "TENANT_USER"] : [];
}

export function canChangeRole(actor: Actor, target: Target, newRole: Role): Verdict {
  const m = canManage(actor, target); if (!m.ok) return m;
  if (newRole === target.role) return ok;
  if (actor.id === target.id) return no("Você não pode alterar o seu próprio nível de acesso.");
  if (target.isMaster) return no("O nível de acesso da conta master não pode ser alterado.");
  // usuários do sistema e das empresas são escopos diferentes: não se troca de um para o outro
  if ((target.role === "SUPER_ADMIN") !== (newRole === "SUPER_ADMIN")) return no("Não é possível mover um usuário entre o sistema e uma empresa.");
  if (!assignableTenantRoles(actor).includes(newRole)) return no("Nível de acesso não permitido.");
  return ok;
}

export function canChangeStatus(actor: Actor, target: Target, newStatus: Status): Verdict {
  const m = canManage(actor, target); if (!m.ok) return m;
  if (newStatus === target.status) return ok;
  if (newStatus === "INACTIVE" && actor.id === target.id) return no("Você não pode desativar a sua própria conta.");
  if (newStatus === "INACTIVE" && target.isMaster) return no("A conta master não pode ser desativada.");
  return ok;
}

/** Redefinir a senha de outro usuário (gera senha provisória). A própria senha só muda em "Minha conta". */
export function canResetPassword(actor: Actor, target: Target): Verdict {
  const m = canManage(actor, target); if (!m.ok) return m;
  if (actor.id === target.id) return no("Para trocar a sua senha, use Minha conta, informando a senha atual.");
  if (target.isMaster) return no("Somente o próprio dono da conta master pode trocar a senha dela.");
  return ok;
}

export function canDelete(actor: Actor, target: Target): Verdict {
  const m = canManage(actor, target); if (!m.ok) return m;
  if (actor.id === target.id) return no("Você não pode excluir a sua própria conta.");
  if (target.isMaster) return no("A conta master do sistema não pode ser excluída.");
  return ok;
}
