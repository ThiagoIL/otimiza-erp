"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { ActionButton, useRun } from "./client";
import { toast } from "./Toast";
import { DealModal, type Deal, type Stage } from "./CrmBoard";
import { deleteActivityAction, saveActivityAction, toggleActivityAction } from "@/server/crm-actions";
import { CRM_ACTIVITY_TYPES } from "@/lib/consts";
import { fmtD, today } from "@/lib/dates";

export type Activity = { id: string; type: string; subject: string; dueDate: string | null; done: boolean; ownerName: string | null; notes: string | null };

export function DealEditButton({ deal, stages, clients, owners }: { deal: Deal; stages: Stage[]; clients: [string, string][]; owners: [string, string][] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}><Icon name="edit" size={16} /> Editar</button>
      {open && <DealModal deal={deal} stages={stages} clients={clients} owners={owners} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); toast("Oportunidade salva."); router.refresh(); }} />}
    </>
  );
}

export function Activities({ dealId, partnerId, rows, canEdit }: { dealId: string; partnerId: string | null; rows: Activity[]; canEdit: boolean }) {
  const [f, setF] = useState({ type: "Ligação", subject: "", dueDate: today(), notes: "" });
  const { run, pending } = useRun();
  const hoje = today();
  const pend = rows.filter((a) => !a.done);
  const done = rows.filter((a) => a.done);
  return (
    <section className="panel sec-panel">
      <h2>Atividades <span className="n">{pend.length} pendentes</span></h2>
      <div className="pb stack">
        {canEdit && (
          <div className="form f4">
            <div className="fld"><label htmlFor="a_t">Tipo</label><select id="a_t" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{CRM_ACTIVITY_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
            <div className="fld span2"><label htmlFor="a_s">O que fazer ou o que foi feito</label><input id="a_s" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} placeholder="Ex.: Ligar para confirmar medidas do baú" /></div>
            <div className="fld"><label htmlFor="a_d">Data</label><input id="a_d" type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></div>
            <div className="fld span3"><label htmlFor="a_n">Detalhes</label><input id="a_n" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
            <div className="fld" style={{ alignSelf: "end", display: "flex", gap: 6 }}>
              <button type="button" className="btn btn-sm" disabled={pending || f.subject.trim().length < 2} onClick={() => run(() => saveActivityAction({ ...f, dealId, partnerId, done: true }), () => setF({ ...f, subject: "", notes: "" }))}>Registrar feita</button>
              <button type="button" className="btn btn-sm btn-primary" disabled={pending || f.subject.trim().length < 2} onClick={() => run(() => saveActivityAction({ ...f, dealId, partnerId, done: false }), () => setF({ ...f, subject: "", notes: "" }))}>Agendar</button>
            </div>
          </div>
        )}
        {rows.length ? (
          <ul className="note-list">
            {[...pend, ...done].map((a) => (
              <li key={a.id} style={a.done ? { opacity: 0.7 } : undefined}>
                <div className="meta">
                  {canEdit ? <ActionButton className={`ck${a.done ? " on" : ""}`} title={a.done ? "Reabrir" : "Marcar como feita"} action={() => toggleActivityAction(a.id, !a.done)}><Icon name="check" size={13} /></ActionButton> : null}
                  <b>{a.type}</b><span className={!a.done && a.dueDate && a.dueDate < hoje ? "t-bad" : ""}>{fmtD(a.dueDate)}</span><span>· {a.ownerName}</span>
                  {canEdit && <ActionButton className="mini-btn danger" title="Excluir atividade" confirm="Excluir esta atividade?" action={() => deleteActivityAction(a.id)}><Icon name="trash" size={13} /></ActionButton>}
                </div>
                <p style={a.done ? { textDecoration: "line-through" } : undefined}>{a.subject}</p>
                {a.notes && <p className="muted" style={{ fontSize: 12.5 }}>{a.notes}</p>}
              </li>
            ))}
          </ul>
        ) : <p className="muted" style={{ margin: 0, fontSize: 13 }}>Nenhuma atividade. Registre ligações, visitas e próximos passos.</p>}
      </div>
    </section>
  );
}
