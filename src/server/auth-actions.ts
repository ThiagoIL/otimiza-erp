"use server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { requestArea, adminSession, tenantSession, findTenant } from "@/lib/context";
import { createSession, destroySession, revokeUserSessions } from "@/lib/session";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/password";
import { hit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { audit } from "@/lib/audit";
import { sessionLimitError } from "@/lib/limits";
import { formObject, keepValues, zEmail } from "@/lib/forms";
import type { ActionState } from "@/lib/action";

const GENERIC = "E-mail ou senha inválidos.";
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  const parsed = z.object({ email: zEmail, senha: z.string().min(1).max(200) }).safeParse(raw);
  if (!parsed.success) return { error: "Informe o e-mail e a senha.", values: keepValues(raw) };
  const { email, senha } = parsed.data;
  const info = await requestArea();
  const ip = await clientIp();

  if (!(await hit(`login:ip:${ip}`, 30, 15 * 60))) {
    return { error: "Muitas tentativas a partir desta rede. Aguarde alguns minutos e tente de novo.", values: keepValues(raw) };
  }

  let tenantId: string | null = null;
  if (info.area === "tenant") {
    const t = await findTenant(info.slug);
    if (!t) return { error: GENERIC };
    if (t.status !== "ACTIVE") return { error: "O acesso desta empresa está suspenso. Fale com o suporte.", values: keepValues(raw) };
    tenantId = t.id;
  } else if (info.area !== "admin") {
    return { error: "Acesse pelo endereço da sua empresa." };
  }

  if (!(await hit(`login:conta:${tenantId ?? "sistema"}:${email}`, 10, 15 * 60))) {
    return { error: "Muitas tentativas para este e-mail. Aguarde alguns minutos.", values: keepValues(raw) };
  }

  const [user] = await db.select().from(users)
    .where(and(eq(users.email, email), tenantId ? eq(users.tenantId, tenantId) : isNull(users.tenantId)))
    .limit(1);
  const scopeOk = !!user && (info.area === "admin" ? user.role === "SUPER_ADMIN" : user.role !== "SUPER_ADMIN");

  if (user && scopeOk && user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    await verifyPassword(senha, null);
    return { error: `Conta bloqueada temporariamente por tentativas erradas. Tente de novo em até ${LOCK_MINUTES} minutos.`, values: keepValues(raw) };
  }
  const passOk = await verifyPassword(senha, scopeOk ? user.passwordHash : null);

  if (!user || !scopeOk || !passOk || user.status !== "ACTIVE") {
    if (user && scopeOk && !passOk) {
      const fails = user.failedLogins + 1;
      await db.update(users).set({
        failedLogins: fails,
        lockedUntil: fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : user.lockedUntil,
      }).where(eq(users.id, user.id));
    }
    await audit({ action: "login.falhou", tenantId, userId: user?.id, userEmail: email, data: { motivo: !user || !scopeOk ? "usuario_inexistente" : !passOk ? "senha" : "inativo" } });
    return { error: GENERIC, values: keepValues(raw) };
  }

  // limite do plano: pessoas conectadas ao mesmo tempo na empresa
  if (tenantId) {
    const full = await sessionLimitError(tenantId, user.id);
    if (full) {
      await audit({ action: "login.limite", tenantId, userId: user.id, userEmail: user.email });
      return { error: full, values: keepValues(raw) };
    }
  }
  await db.update(users).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: sql`now()` }).where(eq(users.id, user.id));
  await createSession(user, info.area === "admin" ? "ADMIN" : "TENANT");
  await audit({ action: "login", tenantId, userId: user.id, userEmail: user.email });
  return { ok: true, redirectTo: user.mustChangePassword ? "/conta?trocar=1" : "/" };
}

export async function logoutAction(): Promise<void> {
  await destroySession();
}

export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const info = await requestArea();
  const s = info.area === "admin" ? await adminSession() : info.area === "tenant" ? await tenantSession() : null;
  if (!s) return { error: "Sua sessão expirou. Entre novamente.", redirectTo: "/login" };
  const raw = formObject(fd);
  const atual = raw.senha_atual ?? "", nova = raw.senha_nova ?? "", conf = raw.senha_confirma ?? "";
  const bad = (k: string, m: string): ActionState => ({ fields: { [k]: m }, error: "Confira os campos destacados." });
  if (!(await hit(`senha:${s.user.id}`, 10, 15 * 60))) return { error: "Muitas tentativas. Aguarde alguns minutos." };
  if (!(await verifyPassword(atual, s.user.passwordHash))) return bad("senha_atual", "Senha atual incorreta.");
  const prob = passwordProblem(nova, s.user.email);
  if (prob) return bad("senha_nova", prob);
  if (nova !== conf) return bad("senha_confirma", "As senhas não conferem.");
  if (await verifyPassword(nova, s.user.passwordHash)) return bad("senha_nova", "A nova senha precisa ser diferente da atual.");

  const [updated] = await db.update(users)
    .set({ passwordHash: await hashPassword(nova), passwordChangedAt: sql`now()`, mustChangePassword: false, failedLogins: 0, lockedUntil: null })
    .where(eq(users.id, s.user.id)).returning();
  // encerra todas as sessões (inclusive em outros aparelhos) e abre uma nova aqui
  await revokeUserSessions(s.user.id);
  await createSession(updated, info.area === "admin" ? "ADMIN" : "TENANT");
  await audit({ action: "senha.alterada", tenantId: s.user.tenantId, userId: s.user.id, userEmail: s.user.email });
  if (s.user.mustChangePassword) return { ok: true, message: "Senha alterada.", redirectTo: "/" };
  return { ok: true, message: "Senha alterada. As outras sessões abertas com a sua conta foram encerradas." };
}
