"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { Modal, useRun } from "./client";
import { Sel } from "./SearchPicker";
import { toast } from "./Toast";
import {
  chatAction, commUsersAction, deleteTaskAction, pollAction, readNoticesAction, saveTaskAction, sendMessageAction, sendNoticeAction, toggleTaskAction,
  type ChatMsg, type CommUser, type Notice,
} from "@/server/comm-actions";
import { fmtD } from "@/lib/dates";

const ini = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
const when = (iso: string) => {
  const d = new Date(iso), now = new Date();
  const hm = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === now.toDateString() ? hm : `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${hm}`;
};
const KIND_ICON = { tarefa: "check", mensagem: "chat", aviso: "bell" } as const;

// ------------------------------------------------------------------ sininho na barra superior
export function Bell() {
  const router = useRouter();
  const path = usePathname();
  const [d, setD] = useState<{ unread: number; chat: number; tasks: number; items: Notice[] } | null>(null);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => { const r = await pollAction(); if (!("error" in r)) setD(r); }, []);
  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 20000);
    return () => clearInterval(t);
  }, [load, path]);
  useEffect(() => {
    if (!open) return;
    const c = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", c);
    return () => document.removeEventListener("mousedown", c);
  }, [open]);
  const total = (d?.unread ?? 0) + (d?.chat ?? 0);
  const go = async (n: Notice) => { setOpen(false); if (!n.read) await readNoticesAction([n.id]); load(); if (n.link) router.push(n.link); };
  return (
    <div className="bell" ref={box}>
      <button type="button" className="btn btn-ghost btn-icon" aria-label={`Avisos${total ? `: ${total} novos` : ""}`} title="Avisos, tarefas e mensagens" aria-expanded={open} onClick={() => { setOpen(!open); load(); }}>
        <Icon name="bell" />{total > 0 && <span className="bell-n">{total > 99 ? "99+" : total}</span>}
      </button>
      {open && (
        <div className="bell-pop" role="dialog" aria-label="Avisos">
          <div className="bell-h"><b>Avisos</b>
            {(d?.unread ?? 0) > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { await readNoticesAction(); load(); }}>Marcar todos como lidos</button>}</div>
          <div className="bell-q">
            <Link href="/comunicacao" onClick={() => setOpen(false)}><Icon name="chat" size={15} /> Mensagens{d?.chat ? <b className="tn">{d.chat}</b> : null}</Link>
            <Link href="/comunicacao?aba=tarefas" onClick={() => setOpen(false)}><Icon name="check" size={15} /> Minhas tarefas{d?.tasks ? <b className="tn">{d.tasks}</b> : null}</Link>
          </div>
          <div className="bell-list">
            {d?.items.length ? d.items.map((n) => (
              <button key={n.id} type="button" className={`bell-i${n.read ? "" : " new"}`} onClick={() => go(n)}>
                <span className={`al-i ${n.kind === "tarefa" ? "warn" : "ok"}`}><Icon name={KIND_ICON[n.kind as keyof typeof KIND_ICON] ?? "bell"} size={14} /></span>
                <span className="t"><b>{n.title}</b>{n.body && <small>{n.body}</small>}<small className="muted">{n.from ? `${n.from} · ` : ""}{when(n.at)}</small></span>
              </button>
            )) : <div className="muted" style={{ padding: 16, fontSize: 13 }}>Nenhum aviso por enquanto.</div>}
          </div>
          <Link className="bell-f" href="/comunicacao?aba=avisos" onClick={() => setOpen(false)}>Ver todos os avisos</Link>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ chat
export function Chat({ users, me, start }: { users: CommUser[]; me: string; start: string }) {
  const [ch, setCh] = useState(start);
  const [msgs, setMsgs] = useState<ChatMsg[] | null>(null);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const others = users.filter((u) => u.id !== me);
  const dm = (id: string) => `dm:${[me, id].sort().join(":")}`;
  const load = useCallback(async (c: string) => {
    const r = await chatAction(c);
    if ("error" in r) { toast(r.error, true); return; }
    setMsgs((old) => (old && old.length === r.messages.length && old.at(-1)?.id === r.messages.at(-1)?.id ? old : r.messages));
    setUnread(r.unread);
  }, []);
  useEffect(() => {
    setMsgs(null); load(ch);
    const t = setInterval(() => { if (document.visibilityState === "visible") load(ch); }, 4000);
    return () => clearInterval(t);
  }, [ch, load]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs]);
  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    const r = await sendMessageAction({ channel: ch, body: text });
    setSending(false);
    if (r.error) { toast(r.error, true); return; }
    setText(""); load(ch);
  };
  const title = ch === "geral" ? "Geral (toda a empresa)" : others.find((u) => dm(u.id) === ch)?.name ?? "Conversa";
  return (
    <div className="chat panel">
      <aside className="chat-side" aria-label="Conversas">
        <button type="button" className={`chat-ch${ch === "geral" ? " on" : ""}`} onClick={() => setCh("geral")}>
          <span className="avatar sm" style={{ background: "var(--steel)" }}>#</span><span>Geral</span>{unread.geral ? <b className="tn">{unread.geral}</b> : null}</button>
        <div className="chat-sep">Pessoas</div>
        {others.map((u) => (
          <button key={u.id} type="button" className={`chat-ch${ch === dm(u.id) ? " on" : ""}`} onClick={() => setCh(dm(u.id))}>
            <span className="avatar sm">{ini(u.name)}</span><span className="ell">{u.name}</span>{unread[dm(u.id)] ? <b className="tn">{unread[dm(u.id)]}</b> : null}</button>
        ))}
      </aside>
      <section className="chat-main">
        <h2 className="chat-t">{title}</h2>
        <div className="chat-msgs" aria-live="polite">
          {msgs == null ? <div className="muted chat-empty">Carregando…</div> : msgs.length ? msgs.map((m, i) => {
            const mine = m.userId === me;
            const head = i === 0 || msgs[i - 1].userId !== m.userId;
            return (
              <div key={m.id} className={`msg${mine ? " mine" : ""}`}>
                {head && !mine && <span className="msg-u">{m.user}</span>}
                <div className="msg-b">{m.body}{m.link && <Link className="msg-l" href={m.link}><Icon name="doc" size={13} /> {m.linkLabel ?? "Abrir"}</Link>}<small>{when(m.at)}</small></div>
              </div>
            );
          }) : <div className="muted chat-empty">Nenhuma mensagem ainda. Escreva a primeira.</div>}
          <div ref={end} />
        </div>
        <form className="chat-in" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Escreva uma mensagem (Enter envia, Shift+Enter quebra a linha)" aria-label="Mensagem"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <button type="submit" className="btn btn-primary" disabled={sending || !text.trim()}><Icon name="send" size={16} /> Enviar</button>
        </form>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ tarefas
export type TaskRow = { id: string; title: string; notes: string | null; assigneeId: string; assignee: string; creatorId: string; creator: string; due: string | null; priority: string; link: string | null; linkLabel: string | null; done: boolean };
type TaskForm = { id?: string; title: string; notes: string; assigneeId: string; dueDate: string; priority: string; link?: string | null; linkLabel?: string | null };

function TaskModal({ t, users, onClose }: { t: TaskForm; users: CommUser[]; onClose: () => void }) {
  const [d, setD] = useState(t);
  const { run, pending } = useRun();
  return (
    <Modal title={d.id ? "Editar tarefa" : "Nova tarefa"} onClose={onClose}
      foot={<><button type="button" className="btn" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(() => saveTaskAction({ ...d, priority: d.priority as "Normal", dueDate: d.dueDate || null }), onClose)}>{d.id ? "Salvar" : "Enviar tarefa"}</button></>}>
      <div className="form">
        <div className="fld full"><label htmlFor="tk_t">O que precisa ser feito <span className="req">*</span></label><input id="tk_t" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="Ex.: Revisar o pedido 1042 antes de aprovar" autoFocus /></div>
        <div className="fld"><label htmlFor="tk_a">Para quem <span className="req">*</span></label>
          <Sel id="tk_a" value={d.assigneeId} onChange={(e) => setD({ ...d, assigneeId: e.target.value })} aria-label="Pessoa"><option value="">Selecione…</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Sel></div>
        <div className="fld"><label htmlFor="tk_d">Prazo</label><input id="tk_d" type="date" value={d.dueDate} onChange={(e) => setD({ ...d, dueDate: e.target.value })} /></div>
        <div className="fld"><label htmlFor="tk_p">Prioridade</label><select id="tk_p" value={d.priority} onChange={(e) => setD({ ...d, priority: e.target.value })}>{["Baixa", "Normal", "Alta", "Urgente"].map((p) => <option key={p}>{p}</option>)}</select></div>
        {d.link && <div className="fld"><span className="flabel">Ligada a</span><div style={{ height: 36, display: "flex", alignItems: "center" }}><Link href={d.link}>{d.linkLabel ?? d.link}</Link></div></div>}
        <div className="fld full"><label htmlFor="tk_n">Detalhes</label><textarea id="tk_n" rows={3} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} /></div>
      </div>
    </Modal>
  );
}

export function NewTaskButton({ users }: { users: CommUser[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}><Icon name="plus" size={16} /> Nova tarefa</button>
      {open && <TaskModal t={{ title: "", notes: "", assigneeId: "", dueDate: "", priority: "Normal" }} users={users} onClose={() => setOpen(false)} />}
    </>
  );
}

export function TaskList({ rows, users, me, isAdmin }: { rows: TaskRow[]; users: CommUser[]; me: string; isAdmin: boolean }) {
  const [edit, setEdit] = useState<TaskRow | null>(null);
  const { run, pending } = useRun();
  const hoje = new Date().toISOString().slice(0, 10);
  if (!rows.length) return <div className="empty"><strong>Nenhuma tarefa aqui</strong>Crie uma tarefa para alguém da equipe, ou peça pelo botão “Avisar” no pedido ou na OP.</div>;
  return (
    <>
      <div className="task-list">
        {rows.map((t) => {
          const late = !t.done && t.due && t.due < hoje;
          return (
            <article key={t.id} className={`task${t.done ? " done" : ""}`}>
              <button type="button" className={`ck${t.done ? " on" : ""}`} disabled={pending || (t.assigneeId !== me && t.creatorId !== me && !isAdmin)} aria-label={t.done ? "Reabrir tarefa" : "Concluir tarefa"}
                onClick={() => run(() => toggleTaskAction(t.id, !t.done))}><Icon name="check" size={13} /></button>
              <div className="task-b">
                <b>{t.title}</b>{t.priority !== "Normal" && <span className={`badge${t.priority === "Urgente" || t.priority === "Alta" ? " bad" : ""}`} style={{ marginLeft: 8 }}>{t.priority}</span>}
                {t.notes && <p>{t.notes}</p>}
                <small className="muted">{t.creatorId === t.assigneeId ? t.assignee : `${t.creator} → ${t.assignee}`}{t.due && <> · <span className={late ? "t-bad" : undefined}>prazo {fmtD(t.due)}</span></>}</small>
                {t.link && <Link className="msg-l" href={t.link}><Icon name="doc" size={13} /> {t.linkLabel ?? "Abrir"}</Link>}
              </div>
              {(t.creatorId === me || isAdmin) && <div className="task-a">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit(t)}><Icon name="edit" size={14} /></button>
                <button type="button" className="btn btn-ghost btn-sm" aria-label="Excluir tarefa" onClick={() => { if (confirm("Excluir esta tarefa?")) run(() => deleteTaskAction(t.id)); }}><Icon name="trash" size={14} /></button>
              </div>}
            </article>
          );
        })}
      </div>
      {edit && <TaskModal t={{ id: edit.id, title: edit.title, notes: edit.notes ?? "", assigneeId: edit.assigneeId, dueDate: edit.due ?? "", priority: edit.priority, link: edit.link, linkLabel: edit.linkLabel }} users={users} onClose={() => setEdit(null)} />}
    </>
  );
}

// ------------------------------------------------------------------ avisos
export function NoticeButton({ users, me }: { users: CommUser[]; me: string }) {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState({ title: "", body: "", all: true, to: [] as string[] });
  const { run, pending } = useRun();
  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}><Icon name="bell" size={16} /> Enviar aviso</button>
      {open && (
        <Modal title="Enviar aviso" onClose={() => setOpen(false)}
          foot={<><button type="button" className="btn" onClick={() => setOpen(false)}>Cancelar</button>
            <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(() => sendNoticeAction(d), () => { setOpen(false); setD({ title: "", body: "", all: true, to: [] }); })}>Enviar</button></>}>
          <div className="form">
            <div className="fld full"><label htmlFor="av_t">Aviso <span className="req">*</span></label><input id="av_t" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="Ex.: Pagar a conta de energia até sexta" autoFocus /></div>
            <div className="fld full"><label htmlFor="av_b">Detalhes</label><textarea id="av_b" rows={3} value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} /></div>
            <div className="fld full"><span className="flabel">Para quem</span>
              <label className="chk"><input type="checkbox" checked={d.all} onChange={(e) => setD({ ...d, all: e.target.checked })} /> Toda a empresa</label>
              {!d.all && <div className="who-list">{users.filter((u) => u.id !== me).map((u) => (
                <label key={u.id} className="chk"><input type="checkbox" checked={d.to.includes(u.id)} onChange={(e) => setD({ ...d, to: e.target.checked ? [...d.to, u.id] : d.to.filter((x) => x !== u.id) })} /> {u.name}</label>))}</div>}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

export function NoticeList({ items }: { items: Notice[] }) {
  const router = useRouter();
  if (!items.length) return <div className="empty"><strong>Nenhum aviso</strong>Tarefas recebidas, mensagens diretas e avisos aparecem aqui e no sininho.</div>;
  return (
    <div className="bell-list page">
      {items.map((n) => (
        <button key={n.id} type="button" className={`bell-i${n.read ? "" : " new"}`} onClick={async () => { if (!n.read) await readNoticesAction([n.id]); if (n.link) router.push(n.link); else router.refresh(); }}>
          <span className={`al-i ${n.kind === "tarefa" ? "warn" : "ok"}`}><Icon name={KIND_ICON[n.kind as keyof typeof KIND_ICON] ?? "bell"} size={14} /></span>
          <span className="t"><b>{n.title}</b>{n.body && <small>{n.body}</small>}<small className="muted">{n.from ? `${n.from} · ` : ""}{when(n.at)}</small></span>
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ botão "Avisar" nos registros (pedido, OP, montagem…)
/** Cria uma tarefa ou manda uma mensagem já ligada ao registro aberto (ex.: "Revisar o pedido 1042"). */
export function NotifyButton({ link, label, suggest }: { link: string; label: string; suggest: string }) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<CommUser[] | null>(null);
  const [me, setMe] = useState("");
  const [d, setD] = useState({ mode: "tarefa", to: "", title: suggest, notes: "", due: "" });
  const { run, pending } = useRun();
  const openIt = async () => {
    setOpen(true);
    if (!users) { const r = await commUsersAction(); if ("error" in r) toast(r.error, true); else { setUsers(r.users); setMe(r.me); } }
  };
  const send = () => run(async () => d.mode === "tarefa"
    ? saveTaskAction({ title: d.title, notes: d.notes, assigneeId: d.to, dueDate: d.due || null, link, linkLabel: label })
    : sendMessageAction({ ...(d.to ? { to: d.to } : { channel: "geral" }), body: d.notes ? `${d.title}\n${d.notes}` : d.title, link, linkLabel: label }), () => setOpen(false));
  return (
    <>
      <button type="button" className="btn" onClick={openIt} title="Criar tarefa ou mandar mensagem sobre este registro"><Icon name="bell" size={16} /> Avisar</button>
      {open && (
        <Modal title={`Avisar sobre ${label}`} onClose={() => setOpen(false)}
          foot={<><button type="button" className="btn" onClick={() => setOpen(false)}>Cancelar</button>
            <button type="button" className="btn btn-primary" disabled={pending || !users || (d.mode === "tarefa" && !d.to)} onClick={send}>{d.mode === "tarefa" ? "Enviar tarefa" : "Enviar mensagem"}</button></>}>
          <div className="seg" role="group" aria-label="Tipo" style={{ marginBottom: 14 }}>
            <button type="button" aria-pressed={d.mode === "tarefa"} onClick={() => setD({ ...d, mode: "tarefa" })}>Tarefa</button>
            <button type="button" aria-pressed={d.mode === "mensagem"} onClick={() => setD({ ...d, mode: "mensagem" })}>Mensagem</button>
          </div>
          {!users ? <p className="muted">Carregando a equipe…</p> : (
            <div className="form">
              <div className="fld full"><label htmlFor="nt_t">{d.mode === "tarefa" ? "O que precisa ser feito" : "Mensagem"}</label><input id="nt_t" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} /></div>
              <div className="fld"><label htmlFor="nt_p">Para quem</label>
                <Sel id="nt_p" value={d.to} onChange={(e) => setD({ ...d, to: e.target.value })} aria-label="Pessoa">
                  <option value="">{d.mode === "tarefa" ? "Selecione…" : "Todos (chat geral)"}</option>{users.filter((u) => u.id !== me || d.mode === "tarefa").map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Sel></div>
              {d.mode === "tarefa" && <div className="fld"><label htmlFor="nt_d">Prazo</label><input id="nt_d" type="date" value={d.due} onChange={(e) => setD({ ...d, due: e.target.value })} /></div>}
              <div className="fld full"><label htmlFor="nt_n">Detalhes</label><textarea id="nt_n" rows={3} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} /></div>
              <p className="muted full" style={{ fontSize: 12.5, margin: 0 }}>Vai com o link para {label}.</p>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
