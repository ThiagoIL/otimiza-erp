import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { withTenant, type Tx } from "./db";
import { requireTenantUser, tenantUserForAction, SESSION_EXPIRED } from "./context";
import { accessProfiles } from "@/db/erp";
import { MODULES, type Access, type Level, type ModuleKey } from "./modules";
import type { SessionCtx } from "./session";
import type { Tenant } from "@/db/schema";

type TenantCtx = SessionCtx & { tenant: Tenant };

const ALL = (l: Level) => Object.fromEntries([...MODULES.map(([k]) => k), "admin"].map((k) => [k, l])) as Record<ModuleKey, Level>;

/**
 * Acesso do usuário aos módulos:
 *  - administrador da empresa: tudo, inclusive custos e Administração;
 *  - usuário com perfil: o que o perfil define (Administração nunca, ela é só dos administradores);
 *  - usuário sem perfil: edita todos os módulos de negócio, mas não vê custos de produção.
 */
export const accessOf = cache(async (s: TenantCtx): Promise<Access> => {
  if (s.user.role === "TENANT_ADMIN") return { mods: ALL("editar"), costs: true, isAdmin: true, profileName: "Administrador da empresa" };
  const mods = { ...ALL("editar"), admin: "nenhum" as Level };
  if (!s.user.profileId) return { mods, costs: false, isAdmin: false, profileName: null };
  const [p] = await withTenant(s.tenant.id, (tx) => tx.select().from(accessProfiles).where(eq(accessProfiles.id, s.user.profileId!)).limit(1));
  if (!p) return { mods, costs: false, isAdmin: false, profileName: null };
  for (const [k] of MODULES) {
    const v = p.permissions[k];
    mods[k] = v === "editar" || v === "ver" ? v : "nenhum";
  }
  return { mods, costs: p.permissions.custos === true, isAdmin: false, profileName: p.name };
});

export type PageCtx = TenantCtx & {
  access: Access;
  /** pode alterar o módulo da página */
  edit: boolean;
  tx: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
};

/** Para páginas: exige login e acesso de consulta ao módulo (sem acesso, volta ao início com aviso). */
export async function page(mod: ModuleKey | null, opts: { edit?: boolean } = {}): Promise<PageCtx> {
  const s = await requireTenantUser();
  const access = await accessOf(s);
  if (mod) {
    const l = access.mods[mod];
    if (l === "nenhum" || (opts.edit && l !== "editar")) redirect(`/?erro=${encodeURIComponent("Seu perfil não tem acesso a essa área.")}`);
  }
  return { ...s, access, edit: mod ? access.mods[mod] === "editar" : true, tx: (fn) => withTenant(s.tenant.id, fn) };
}

export type ActCtx = TenantCtx & { access: Access; tx: PageCtx["tx"]; userName: string };

/** Para ações: exige permissão de edição no módulo. Devolve null quando não pode. */
export async function act(mod: ModuleKey | ModuleKey[]): Promise<ActCtx | null> {
  const s = await tenantUserForAction();
  if (!s) return null;
  const access = await accessOf(s);
  const mods = Array.isArray(mod) ? mod : [mod];
  if (!mods.some((m) => access.mods[m] === "editar")) return null;
  return { ...s, access, tx: (fn) => withTenant(s.tenant.id, fn), userName: s.user.name };
}

export const NO_ACCESS = { error: "Você não tem permissão para alterar esta área, ou a sua sessão expirou. Entre novamente se for o caso." } as const;
export { SESSION_EXPIRED };
