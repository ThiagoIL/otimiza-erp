"use server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { sessions, tenants, users } from "@/db/schema";
import { SESSION_EXPIRED, adminForAction } from "@/lib/context";
import { validateSlug } from "@/lib/host";
import { generateTempPassword, hashPassword } from "@/lib/password";
import { audit } from "@/lib/audit";
import { friendlyDbError } from "@/lib/errors";
import { formObject, keepValues, zEmail, zName, zodFail } from "@/lib/forms";
import type { ActionState } from "@/lib/action";

const zDoc = z.string().trim().max(20).transform((s) => s.replace(/[^\d./-]/g, "")).optional();

const newTenant = z.object({
  slug: z.string().trim().toLowerCase().superRefine((s, ctx) => { const e = validateSlug(s); if (e) ctx.addIssue({ code: "custom", message: e }); }),
  nome: zName,
  documento: zDoc,
  admin_nome: zName,
  admin_email: zEmail,
});

/** Cria a base da empresa e o primeiro administrador dela, com senha provisória. */
export async function createTenantAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await adminForAction();
  if (!s) return SESSION_EXPIRED;
  const raw = formObject(fd);
  const p = newTenant.safeParse(raw);
  if (!p.success) return zodFail(p.error, raw);
  const d = p.data;
  const [exists] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, d.slug)).limit(1);
  if (exists) return { fields: { slug: "Este endereço já está em uso." }, error: "Confira os campos destacados.", values: keepValues(raw) };

  const temp = generateTempPassword();
  const hash = await hashPassword(temp);
  let tenantId = "";
  try {
    await db.transaction(async (tx) => {
      const [t] = await tx.insert(tenants).values({ slug: d.slug, name: d.nome, document: d.documento || null }).returning({ id: tenants.id });
      tenantId = t.id;
      await tx.insert(users).values({ tenantId: t.id, name: d.admin_nome, email: d.admin_email, role: "TENANT_ADMIN", passwordHash: hash, mustChangePassword: true });
    });
  } catch (err) {
    return { error: friendlyDbError(err), values: keepValues(raw) };
  }
  await audit({ action: "empresa.criada", tenantId, userId: s.user.id, userEmail: s.user.email, entity: "empresa", entityId: tenantId, data: { slug: d.slug, admin: d.admin_email } });
  return { ok: true, message: `Empresa criada. Endereço de acesso: ${d.slug}.${process.env.ROOT_DOMAIN}. Administrador: ${d.admin_email}.`, secret: temp, values: {} };
}

const editTenant = z.object({
  id: z.string().min(1).max(64),
  nome: zName,
  documento: zDoc,
  situacao: z.enum(["ACTIVE", "SUSPENDED"]),
  observacoes: z.string().trim().max(1000).optional(),
});

export async function updateTenantAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await adminForAction();
  if (!s) return SESSION_EXPIRED;
  const raw = formObject(fd);
  const p = editTenant.safeParse(raw);
  if (!p.success) return zodFail(p.error, raw);
  const [before] = await db.select().from(tenants).where(eq(tenants.id, p.data.id)).limit(1);
  if (!before) return { error: "Empresa não encontrada." };
  try {
    await db.update(tenants).set({ name: p.data.nome, document: p.data.documento || null, status: p.data.situacao, notes: p.data.observacoes || null })
      .where(eq(tenants.id, before.id));
  } catch (err) {
    return { error: friendlyDbError(err), values: keepValues(raw) };
  }
  const suspendeu = p.data.situacao === "SUSPENDED" && before.status !== "SUSPENDED";
  if (suspendeu) await db.delete(sessions).where(eq(sessions.tenantId, before.id));
  await audit({ action: "empresa.alterada", tenantId: before.id, userId: s.user.id, userEmail: s.user.email, entity: "empresa", entityId: before.id,
    data: { situacao: { antes: before.status, depois: p.data.situacao }, nome: p.data.nome } });
  return { ok: true, message: suspendeu ? "Empresa suspensa. Todos os usuários dela foram desconectados." : "Alterações salvas." };
}

