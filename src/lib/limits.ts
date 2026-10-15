import "server-only";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "./db";
import { env } from "./env";
import { sessions, tenants, users } from "@/db/schema";

/**
 * Limites do plano de cada empresa (definidos no painel do sistema, em Empresas):
 *  - usuários cadastrados: quantos usuários ativos a empresa pode ter;
 *  - usuários simultâneos: quantas pessoas diferentes podem estar conectadas ao mesmo tempo.
 * Conectado = sessão da empresa ainda válida e usada dentro do tempo de inatividade (SESSION_IDLE_MINUTES).
 */
const liveSession = () => and(eq(sessions.area, "TENANT"), gt(sessions.expiresAt, sql`now()`),
  gt(sessions.lastSeenAt, sql`now() - make_interval(mins => ${env.SESSION_IDLE_MINUTES})`));

export async function activeUsers(tenantId: string): Promise<number> {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(and(eq(users.tenantId, tenantId), eq(users.status, "ACTIVE")));
  return n;
}

/** Pessoas conectadas agora (cada pessoa conta uma vez, mesmo em vários aparelhos). */
export async function onlineUserIds(tenantId: string): Promise<string[]> {
  const rows = await db.selectDistinct({ id: sessions.userId }).from(sessions).where(and(eq(sessions.tenantId, tenantId), liveSession()));
  return rows.map((r) => r.id);
}

export type Online = { sessionId: string; userId: string; name: string; email: string; since: Date; lastSeen: Date; ip: string | null; device: string | null };
export async function onlineSessions(tenantId: string): Promise<Online[]> {
  const rows = await db.select({ s: sessions, u: users }).from(sessions).innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tenantId, tenantId), liveSession())).orderBy(sql`${sessions.lastSeenAt} desc`);
  return rows.map(({ s, u }) => ({ sessionId: s.id, userId: u.id, name: u.name, email: u.email, since: s.createdAt, lastSeen: s.lastSeenAt, ip: s.ip, device: deviceOf(s.userAgent) }));
}

const deviceOf = (ua: string | null) => {
  if (!ua) return null;
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iPhone/iPad" : /Windows/i.test(ua) ? "Windows" : /Mac OS/i.test(ua) ? "Mac" : /Linux/i.test(ua) ? "Linux" : "";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  return [br, os].filter(Boolean).join(" · ") || null;
};

export type Usage = { maxUsers: number | null; maxSessions: number | null; users: number; online: number };
export async function usageOf(tenantId: string): Promise<Usage> {
  const [t] = await db.select({ mu: tenants.maxUsers, ms: tenants.maxSessions }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  return { maxUsers: t?.mu ?? null, maxSessions: t?.ms ?? null, users: await activeUsers(tenantId), online: (await onlineUserIds(tenantId)).length };
}

/** Mensagem de erro se cadastrar (ou reativar) mais um usuário passar do limite do plano. */
export async function userLimitError(tenantId: string): Promise<string | null> {
  const [t] = await db.select({ mu: tenants.maxUsers }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (t?.mu == null) return null;
  const n = await activeUsers(tenantId);
  return n >= t.mu ? `O plano desta empresa permite ${t.mu} ${t.mu === 1 ? "usuário ativo" : "usuários ativos"} e já há ${n}. Inative um usuário ou contrate um plano maior.` : null;
}

/** Mensagem de erro se esta pessoa entrar e passar do limite de conectados ao mesmo tempo. */
export async function sessionLimitError(tenantId: string, userId: string): Promise<string | null> {
  const [t] = await db.select({ ms: tenants.maxSessions }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (t?.ms == null) return null;
  const ids = await onlineUserIds(tenantId);
  if (ids.includes(userId) || ids.length < t.ms) return null; // quem já está conectado (outro aparelho) não ocupa outra vaga
  return `Limite de ${t.ms} ${t.ms === 1 ? "pessoa conectada" : "pessoas conectadas"} ao mesmo tempo atingido. Peça para alguém sair do sistema ou aguarde e tente de novo.`;
}
