import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { env } from "./env";
import { parseHost, type HostInfo } from "./host";
import { tenants, type Tenant } from "@/db/schema";
import { readSession, type SessionCtx } from "./session";
import type { Actor } from "./rules";

/**
 * Área da requisição, lida do domínio acessado (Host).
 * Não há reescrita de URL: as mesmas rotas atendem o painel do sistema e as empresas,
 * e cada página decide o que mostrar conforme a área.
 */
export const requestArea = cache(async (): Promise<HostInfo> => {
  const h = await headers();
  return parseHost(h.get("host"), env.ROOT_DOMAIN, env.ADMIN_SUBDOMAIN);
});

export const findTenant = cache(async (slug: string): Promise<Tenant | null> => {
  const [t] = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
  return t ?? null;
});

/** Empresa do subdomínio atual (404 se não for área de empresa ou se não existir). */
export async function currentTenant(): Promise<Tenant> {
  const info = await requestArea();
  if (info.area !== "tenant") notFound();
  const t = await findTenant(info.slug);
  if (!t) notFound();
  return t;
}

export const adminSession = cache(async (): Promise<SessionCtx | null> => {
  if ((await requestArea()).area !== "admin") return null;
  return readSession("ADMIN", null);
});

export const tenantSession = cache(async (): Promise<SessionCtx | null> => {
  const info = await requestArea();
  if (info.area !== "tenant") return null;
  const t = await findTenant(info.slug);
  if (!t || t.status !== "ACTIVE") return null;
  return readSession("TENANT", t.id);
});

export function toActor(s: SessionCtx): Actor {
  return { id: s.user.id, role: s.user.role, tenantId: s.user.tenantId };
}

/** Exige administrador do sistema logado (páginas e ações do painel). Fora do painel: 404. */
export async function requireAdmin(opts: { allowPasswordChange?: boolean } = {}): Promise<SessionCtx> {
  if ((await requestArea()).area !== "admin") notFound();
  const s = await adminSession();
  if (!s) redirect("/login");
  if (s.user.mustChangePassword && !opts.allowPasswordChange) redirect("/conta?trocar=1");
  return s;
}

/** Exige usuário da empresa logado; com admin, exige administrador da empresa. Fora de empresa: 404. */
export async function requireTenantUser(opts: { admin?: boolean; allowPasswordChange?: boolean } = {}): Promise<SessionCtx & { tenant: Tenant }> {
  await currentTenant();
  const s = await tenantSession();
  if (!s || !s.tenant) redirect("/login");
  if (s.user.mustChangePassword && !opts.allowPasswordChange) redirect("/conta?trocar=1");
  if (opts.admin && s.user.role !== "TENANT_ADMIN") redirect("/?sem-permissao=1");
  return s as SessionCtx & { tenant: Tenant };
}

/**
 * Versões para ações de formulário: em vez de redirecionar (o que dentro de uma ação
 * renderizaria a página de destino fora do subdomínio), devolvem null e a ação responde
 * com o endereço para onde o navegador deve ir.
 */
export async function adminForAction(): Promise<SessionCtx | null> {
  if ((await requestArea()).area !== "admin") return null;
  const s = await adminSession();
  return s && !s.user.mustChangePassword ? s : null;
}

export async function tenantUserForAction(opts: { admin?: boolean } = {}): Promise<(SessionCtx & { tenant: Tenant }) | null> {
  const s = await tenantSession();
  if (!s || !s.tenant || s.user.mustChangePassword) return null;
  if (opts.admin && s.user.role !== "TENANT_ADMIN") return null;
  return s as SessionCtx & { tenant: Tenant };
}

export const SESSION_EXPIRED = { error: "Sua sessão expirou ou você não tem permissão para esta ação. Entre novamente.", redirectTo: "/login" } as const;
