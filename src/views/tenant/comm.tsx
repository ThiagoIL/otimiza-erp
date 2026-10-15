import Link from "next/link";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { page } from "@/lib/access";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import * as E from "@/db/erp";
import { PageHead } from "@/components/ui";
import { Chat, NewTaskButton, NoticeButton, NoticeList, TaskList, type TaskRow } from "@/components/Comm";

type SP = Record<string, string | undefined>;

/** Comunicação e avisos: chat (geral e entre duas pessoas), tarefas e avisos do sininho. */
export async function CommPage({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await page(null);
  const sp = await searchParams;
  const aba = sp.aba === "tarefas" || sp.aba === "avisos" ? sp.aba : "conversas";
  const me = s.user.id;
  const isAdmin = s.user.role === "TENANT_ADMIN";
  const people = await db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.tenantId, s.tenant.id), eq(users.status, "ACTIVE"))).orderBy(asc(users.name));
  const ver = sp.ver === "enviadas" || (sp.ver === "todas" && isAdmin) ? sp.ver : "minhas";
  const d = await s.tx(async (tx) => {
    const tw = ver === "minhas" ? eq(E.tasks.assigneeId, me) : ver === "enviadas" ? eq(E.tasks.creatorId, me) : undefined;
    const tasks = aba === "tarefas" ? await tx.select().from(E.tasks).where(and(tw, sp.feitas ? undefined : isNull(E.tasks.doneAt)))
      .orderBy(sql`${E.tasks.doneAt} is not null`, asc(sql`coalesce(${E.tasks.dueDate}, '9999-12-31')`), desc(E.tasks.createdAt)).limit(300) : [];
    const notices = aba === "avisos" ? await tx.select().from(E.notifications).where(eq(E.notifications.userId, me)).orderBy(desc(E.notifications.createdAt)).limit(150) : [];
    const [{ open }] = await tx.select({ open: sql<number>`count(*)::int` }).from(E.tasks).where(and(eq(E.tasks.assigneeId, me), isNull(E.tasks.doneAt)));
    const [{ nn }] = await tx.select({ nn: sql<number>`count(*)::int` }).from(E.notifications).where(and(eq(E.notifications.userId, me), isNull(E.notifications.readAt)));
    return { tasks, notices, open, nn };
  });
  const rows: TaskRow[] = d.tasks.map((t) => ({ id: t.id, title: t.title, notes: t.notes, assigneeId: t.assigneeId, assignee: t.assigneeName, creatorId: t.creatorId, creator: t.creatorName,
    due: t.dueDate, priority: t.priority, link: t.link, linkLabel: t.linkLabel, done: !!t.doneAt }));
  const tab = (k: string, label: string, n?: number) => <Link href={k === "conversas" ? "/comunicacao" : `/comunicacao?aba=${k}`} aria-current={aba === k ? "page" : undefined}>{label}{n ? <b className="tn">{n}</b> : null}</Link>;
  const q = (v: string, extra = "") => `/comunicacao?aba=tarefas&ver=${v}${extra}`;
  return (
    <>
      <PageHead title="Comunicação e avisos" sub="Converse com a equipe, envie tarefas (revisar uma produção, conferir um pedido, pagar uma conta) e avisos que aparecem no sininho."
        actions={aba === "tarefas" ? <NewTaskButton users={people} /> : aba === "avisos" ? <NoticeButton users={people} me={me} /> : null} />
      <nav className="subtabs" aria-label="Comunicação">{tab("conversas", "Conversas")}{tab("tarefas", "Tarefas", d.open)}{tab("avisos", "Avisos", d.nn)}</nav>
      {aba === "conversas" && <Chat users={people} me={me} start={sp.c && (sp.c === "geral" || sp.c.split(":").includes(me)) ? sp.c : "geral"} />}
      {aba === "tarefas" && (
        <section className="panel">
          <div className="bar solo" style={{ borderRadius: 0, borderWidth: "0 0 1px" }}>
            <div className="tabs" role="group" aria-label="Tarefas">
              <Link className="btn btn-ghost btn-sm" href={q("minhas")} aria-pressed={ver === "minhas"}>Para mim</Link>
              <Link className="btn btn-ghost btn-sm" href={q("enviadas")} aria-pressed={ver === "enviadas"}>Que eu enviei</Link>
              {isAdmin && <Link className="btn btn-ghost btn-sm" href={q("todas")} aria-pressed={ver === "todas"}>Todas</Link>}
            </div>
            <span className="grow" />
            <Link className="btn btn-sm btn-ghost" href={q(ver, sp.feitas ? "" : "&feitas=1")}>{sp.feitas ? "Esconder concluídas" : "Mostrar concluídas"}</Link>
          </div>
          <div className="pb"><TaskList rows={rows} users={people} me={me} isAdmin={isAdmin} /></div>
        </section>
      )}
      {aba === "avisos" && <section className="panel"><NoticeList items={d.notices.map((x) => ({ id: x.id, kind: x.kind, title: x.title, body: x.body, link: x.link, from: x.fromName, at: x.createdAt.toISOString(), read: !!x.readAt }))} /></section>}
    </>
  );
}
