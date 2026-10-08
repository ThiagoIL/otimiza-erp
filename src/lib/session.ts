import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "./db";
import { env } from "./env";
import { sessions, tenants, users, type Tenant, type User } from "@/db/schema";
import { clientIp, userAgent } from "./request";

export type Area = "ADMIN" | "TENANT";
// "__Host-" faz o navegador recusar o cookie se ele não for seguro e preso a este subdomínio exato
const COOKIE = env.cookieSecure ? "__Host-oerp_sess" : "oerp_sess";
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export async function createSession(user: User, area: Area): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + env.SESSION_HOURS * 3600_000);
  await db.insert(sessions).values({
    tokenHash: sha256(token), userId: user.id, tenantId: user.tenantId, area,
    ip: await clientIp(), userAgent: await userAgent(), expiresAt,
  });
  await db.delete(sessions).where(and(eq(sessions.userId, user.id), lt(sessions.expiresAt, new Date())));
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, secure: env.cookieSecure, sameSite: "lax", path: "/", expires: expiresAt,
  });
}

export type SessionCtx = { sessionId: string; user: User; tenant: Tenant | null };

/**
 * Lê e valida a sessão do cookie para a área atual.
 * Uma sessão aberta numa empresa nunca vale em outra empresa nem no painel do sistema.
 */
export async function readSession(area: Area, tenantId: string | null): Promise<SessionCtx | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || token.length < 20 || token.length > 100) return null;
  const rows = await db
    .select({ s: sessions, u: users, t: tenants })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(tenants, eq(tenants.id, users.tenantId))
    .where(eq(sessions.tokenHash, sha256(token)))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  const now = Date.now();
  const valid =
    r.s.area === area &&
    r.s.expiresAt.getTime() > now &&
    now - r.s.lastSeenAt.getTime() < env.SESSION_IDLE_MINUTES * 60_000 &&
    r.u.status === "ACTIVE" &&
    (r.s.tenantId ?? null) === (tenantId ?? null) &&
    (r.u.tenantId ?? null) === (tenantId ?? null) &&
    // sessões abertas antes da última troca de senha deixam de valer
    r.s.createdAt.getTime() >= r.u.passwordChangedAt.getTime() - 1000 &&
    (area === "ADMIN" ? r.u.role === "SUPER_ADMIN" : r.u.role !== "SUPER_ADMIN" && r.t?.status === "ACTIVE");
  if (!valid) return null;
  if (now - r.s.lastSeenAt.getTime() > 5 * 60_000) {
    await db.update(sessions).set({ lastSeenAt: sql`now()` }).where(eq(sessions.id, r.s.id));
  }
  return { sessionId: r.s.id, user: r.u, tenant: r.t };
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  jar.delete(COOKIE);
}

/** Encerra todas as sessões do usuário (troca de senha, desativação, redefinição). */
export async function revokeUserSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}
