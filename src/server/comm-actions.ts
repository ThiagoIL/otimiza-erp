"use server";
import { and, asc, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, withTenant, type Tx } from "@/lib/db";
import { users } from "@/db/schema";
import * as E from "@/db/erp";
import { tenantUserForAction, SESSION_EXPIRED } from "@/lib/context";
import { isDate } from "@/lib/dates";
import type { ActionState } from "@/lib/action";

/**
 * Comunicação dentro da empresa: chat geral e conversas entre duas pessoas, tarefas e avisos (sininho).
 * Todo usuário da empresa usa, inclusive o de apontamento.
 */
async function ctx() {
  const s = await tenantUserForAction();
  if (!s) return null;
  return { ...s, tx: <T>(fn: (tx: Tx) => Promise<T>) => withTenant(s.tenant.id, fn) };
}

export type CommUser = { id: string; name: string };
async function people(tenantId: string): Promise<CommUser[]> {
  return db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.tenantId, tenantId), eq(users.status, "ACTIVE"))).orderBy(asc(users.name));
}

const dm = (a: string, b: string) => `dm:${[a, b].sort().join(":")}`;
/** A pessoa só lê e escreve no geral e nas conversas em que participa. */
const canUse = (channel: string, me: string) => channel === "geral" || (channel.startsWith("dm:") && channel.split(":").slice(1).includes(me));
const safeLink = (v?: string | null) => (v && /^\/[\w\-/?=&%.]*$/.test(v) ? v.slice(0, 300) : null);

export async function commUsersAction(): Promise<{ users: CommUser[]; me: string } | { error: string }> {
  const s = await ctx();
  if (!s) return SESSION_EXPIRED;
  return { users: await people(s.tenant.id), me: s.user.id };
}

// ------------------------------------------------------------------ sininho
export type Notice = { id: string; kind: string; title: string; body: string | null; link: string | null; from: string | null; at: string; read: boolean };
export async function pollAction(): Promise<{ unread: number; chat: number; tasks: number; items: Notice[] } | { error: string }> {
  const s = await ctx();
  if (!s) return SESSION_EXPIRED;
  const me = s.user.id;
  return s.tx(async (tx) => {
    const items = await tx.select().from(E.notifications).where(eq(E.notifications.userId, me)).orderBy(desc(E.notifications.createdAt)).limit(12);
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(E.notifications).where(and(eq(E.notifications.userId, me), isNull(E.notifications.readAt)));
    const [{ c }] = await tx.select({ c: sql<number>`count(*)::int` }).from(E.messages)
      .where(and(sql`(${E.messages.channel} = 'geral' or ${E.messages.channel} like ${"dm:%" + me + "%"})`, sql`${E.messages.userId} <> ${me}`,
        sql`${E.messages.createdAt} > coalesce((select r.read_at from chat_reads r where r.user_id = ${me} and r.channel = ${E.messages.channel}), '-infinity')`));
    const [{ t }] = await tx.select({ t: sql<number>`count(*)::int` }).from(E.tasks).where(and(eq(E.tasks.assigneeId, me), isNull(E.tasks.doneAt)));
    return {
      unread: n, chat: c, tasks: t,
      items: items.map((x) => ({ id: x.id, kind: x.kind, title: x.title, body: x.body, link: x.link, from: x.fromName, at: x.createdAt.toISOString(), read: !!x.readAt })),
    };
  });
}

export async function readNoticesAction(ids?: string[]): Promise<ActionState> {
  const s = await ctx();
  if (!s) return SESSION_EXPIRED;
  await s.tx((tx) => tx.update(E.notifications).set({ readAt: new Date() })
    .where(and(eq(E.notifications.userId, s.user.id), isNull(E.notifications.readAt), ...(ids?.length ? [inArray(E.notifications.id, ids.slice(0, 200))] : []))));
  return { ok: true };
}

async function notify(tx: Tx, tenantId: string, to: string[], n: { kind: string; title: string; body?: string | null; link?: string | null; fromName: string }) {
  const list = [...new Set(to)].filter(Boolean);
  if (list.length) await tx.insert(E.notifications).values(list.map((userId) => ({ tenantId, userId, kind: n.kind, title: n.title.slice(0, 200), body: n.body?.slice(0, 500) ?? null, link: n.link ?? null, fromName: n.fromName })));
}

// ------------------------------------------------------------------ chat
export type ChatMsg = { id: string; user: string; userId: string; body: string; link: string | null; linkLabel: string | null; at: string };
export async function chatAction(channel: string): Promise<{ messages: ChatMsg[]; unread: Record<string, number> } | { error: string }> {
  const s = await ctx();
  if (!s) return SESSION_EXPIRED;
  const me = s.user.id;
  if (!canUse(channel, me)) return { error: "Conversa não encontrada." };
  return s.tx(async (tx) => {
    const rows = await tx.select().from(E.messages).where(eq(E.messages.channel, channel)).orderBy(desc(E.messages.createdAt)).limit(150);
    await tx.insert(E.chatReads).values({ tenantId: s.tenant.id, userId: me, channel, readAt: new Date() })
      .onConflictDoUpdate({ target: [E.chatReads.tenantId, E.chatReads.userId, E.chatReads.channel], set: { readAt: new Date() } });
    const un = await tx.select({ ch: E.messages.channel, n: sql<number>`count(*)::int` }).from(E.messages)
      .where(and(sql`(${E.messages.channel} = 'geral' or ${E.messages.channel} like ${"dm:%" + me + "%"})`, sql`${E.messages.userId} <> ${me}`,
        sql`${E.messages.createdAt} > coalesce((select r.read_at from chat_reads r where r.user_id = ${me} and r.channel = ${E.messages.channel}), '-infinity')`))
      .groupBy(E.messages.channel);
    return {
      messages: rows.reverse().map((m) => ({ id: m.id, user: m.userName, userId: m.userId, body: m.body, link: m.link, linkLabel: m.linkLabel, at: m.createdAt.toISOString() })),
      unread: Object.fromEntries(un.map((u) => [u.ch, u.n])),
    };
  });
}

const msgSchema = z.object({ channel: z.string().max(200).optional(), to: z.string().max(64).optional(), body: z.string().trim().min(1, "Escreva a mensagem.").max(4000),
  link: z.string().max(300).optional().nullable(), linkLabel: z.string().max(120).optional().nullable() });
export async function sendMessageAction(input: z.input<typeof msgSchema>): Promise<ActionState & { channel?: string }> {
  const s = await ctx();
  if (!s) return SESSION_EXPIRED;
  const p = msgSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Confira a mensagem." };
  const d = p.data;
  const me = s.user.id;
  const channel = d.to ? dm(me, d.to) : d.channel ?? "geral";
  if (!canUse(channel, me)) return { error: "Conversa não encontrada." };
  const others = channel === "geral" ? [] : channel.split(":").slice(1).filter((x) => x !== me);
  if (others.length) {
    const ok = await people(s.tenant.id);
    if (!others.every((o) => ok.some((u) => u.id === o))) return { error: "Pessoa não encontrada." };
  }
  await s.tx(async (tx) => {
    await tx.insert(E.messages).values({ tenantId: s.tenant.id, channel, userId: me, userName: s.user.name, body: d.body, link: safeLink(d.link), linkLabel: d.linkLabel?.trim() || null });
    // conversa direta: avisa no sininho (um aviso por vez, sem repetir enquanto não for lido)
    for (const o of others) {
      const [pend] = await tx.select({ id: E.notifications.id }).from(E.notifications)
        .where(and(eq(E.notifications.userId, o), eq(E.notifications.kind, "mensagem"), eq(E.notifications.link, `/comunicacao?c=${encodeURIComponent(channel)}`), isNull(E.notifications.readAt))).limit(1);
      if (!pend) await notify(tx, s.tenant.id, [o], { kind: "mensagem", title: `Mensagem de ${s.user.name}`, body: d.body, link: `/comunicacao?c=${encodeURIComponent(channel)}`, fromName: s.user.name });
    }
  });
  return { ok: true, channel };
}

// ------------------------------------------------------------------ tarefas
const taskSchema = z.object({
  id: z.string().max(64).optional(), title: z.string().trim().min(2, "Descreva a tarefa.").max(200), notes: z.string().max(4000).optional().nullable(),
  assigneeId: z.string().min(1, "Escolha para quem é a tarefa.").max(64), dueDate: z.string().optional().nullable(),
  priority: z.enum(["Baixa", "Normal", "Alta", "Urgente"]).default("Normal"), link: z.string().max(300).optional().nullable(), linkLabel: z.string().max(120).optional().nullable(),
});
export async function saveTaskAction(input: z.input<typeof taskSchema>): Promise<ActionState> {
  const s = await ctx();
  if (!s) return SESSION_EXPIRED;
  const p = taskSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Confira a tarefa." };
  const d = p.data;
  const who = (await people(s.tenant.id)).find((u) => u.id === d.assigneeId);
  if (!who) return { error: "Pessoa não encontrada." };
  const values = { title: d.title, notes: d.notes?.trim() || null, assigneeId: who.id, assigneeName: who.name, dueDate: d.dueDate && isDate(d.dueDate) ? d.dueDate : null,
    priority: d.priority, link: safeLink(d.link), linkLabel: d.linkLabel?.trim() || null };
  const err = await s.tx(async (tx) => {
    if (d.id) {
      const [cur] = await tx.select().from(E.tasks).where(eq(E.tasks.id, d.id)).limit(1);
      if (!cur) return "Tarefa não encontrada.";
      if (cur.creatorId !== s.user.id && s.user.role !== "TENANT_ADMIN") return "Só quem criou a tarefa pode alterá-la.";
      await tx.update(E.tasks).set(values).where(eq(E.tasks.id, d.id));
      if (cur.assigneeId !== who.id && who.id !== s.user.id) await notify(tx, s.tenant.id, [who.id], { kind: "tarefa", title: `Nova tarefa: ${d.title}`, body: d.notes, link: "/comunicacao?aba=tarefas", fromName: s.user.name });
      return null;
    }
    await tx.insert(E.tasks).values({ ...values, tenantId: s.tenant.id, creatorId: s.user.id, creatorName: s.user.name });
    if (who.id !== s.user.id) await notify(tx, s.tenant.id, [who.id], { kind: "tarefa", title: `Nova tarefa: ${d.title}`, body: d.notes, link: values.link ?? "/comunicacao?aba=tarefas", fromName: s.user.name });
    return null;
  });
  if (err) return { error: err };
  return { ok: true, message: d.id ? "Tarefa atualizada." : who.id === s.user.id ? "Tarefa criada." : `Tarefa enviada para ${who.name}.` };
}

export async function toggleTaskAction(id: string, done: boolean): Promise<ActionState> {
  const s = await ctx();
  if (!s) return SESSION_EXPIRED;
  const err = await s.tx(async (tx) => {
    const [t] = await tx.select().from(E.tasks).where(eq(E.tasks.id, id)).limit(1);
    if (!t) return "Tarefa não encontrada.";
    if (t.assigneeId !== s.user.id && t.creatorId !== s.user.id && s.user.role !== "TENANT_ADMIN") return "Esta tarefa não é sua.";
    await tx.update(E.tasks).set({ doneAt: done ? new Date() : null }).where(eq(E.tasks.id, id));
    if (done && t.creatorId !== s.user.id) await notify(tx, s.tenant.id, [t.creatorId], { kind: "tarefa", title: `Tarefa concluída: ${t.title}`, body: `Concluída por ${s.user.name}.`, link: "/comunicacao?aba=tarefas&ver=enviadas", fromName: s.user.name });
    return null;
  });
  return err ? { error: err } : { ok: true, message: done ? "Tarefa concluída." : "Tarefa reaberta." };
}

export async function deleteTaskAction(id: string): Promise<ActionState> {
  const s = await ctx();
  if (!s) return SESSION_EXPIRED;
  const r = await s.tx((tx) => tx.delete(E.tasks).where(and(eq(E.tasks.id, id), or(eq(E.tasks.creatorId, s.user.id), sql`${s.user.role === "TENANT_ADMIN"}`))).returning({ id: E.tasks.id }));
  return r.length ? { ok: true, message: "Tarefa excluída." } : { error: "Só quem criou a tarefa pode excluí-la." };
}

// ------------------------------------------------------------------ avisos
const noticeSchema = z.object({ to: z.array(z.string().max(64)).max(500), all: z.boolean().default(false), title: z.string().trim().min(2, "Escreva o aviso.").max(200),
  body: z.string().max(2000).optional().nullable(), link: z.string().max(300).optional().nullable() });
/** Aviso para algumas pessoas ou para todos: aparece no sininho. */
export async function sendNoticeAction(input: z.input<typeof noticeSchema>): Promise<ActionState> {
  const s = await ctx();
  if (!s) return SESSION_EXPIRED;
  const p = noticeSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Confira o aviso." };
  const d = p.data;
  const all = await people(s.tenant.id);
  const to = (d.all ? all.map((u) => u.id) : d.to.filter((x) => all.some((u) => u.id === x))).filter((x) => x !== s.user.id);
  if (!to.length) return { error: "Escolha quem vai receber o aviso." };
  await s.tx((tx) => notify(tx, s.tenant.id, to, { kind: "aviso", title: d.title, body: d.body, link: safeLink(d.link), fromName: s.user.name }));
  return { ok: true, message: to.length === 1 ? "Aviso enviado." : `Aviso enviado para ${to.length} pessoas.` };
}

/** Avisos recebidos (página Comunicação › Avisos). */
export async function noticesAction(after?: string): Promise<{ items: Notice[] } | { error: string }> {
  const s = await ctx();
  if (!s) return SESSION_EXPIRED;
  const rows = await s.tx((tx) => tx.select().from(E.notifications).where(and(eq(E.notifications.userId, s.user.id), ...(after ? [gt(E.notifications.createdAt, new Date(after))] : [])))
    .orderBy(desc(E.notifications.createdAt)).limit(100));
  return { items: rows.map((x) => ({ id: x.id, kind: x.kind, title: x.title, body: x.body, link: x.link, from: x.fromName, at: x.createdAt.toISOString(), read: !!x.readAt })) };
}
