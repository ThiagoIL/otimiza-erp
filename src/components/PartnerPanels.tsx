"use client";
import { useState } from "react";
import { Icon } from "./Icon";
import { ActionButton, Modal, useRun } from "./client";
import { addNoteAction, deleteContactAction, deleteNoteAction, saveContactAction } from "@/server/partner-actions";
import { maskPhone } from "@/lib/doc";

export type ContactRow = { id: string; name: string; role: string | null; email: string | null; phone: string | null; mobile: string | null; notes: string | null; isPrimary: boolean };
export type NoteRow = { id: string; body: string; userName: string | null; createdAt: string };

export function Contacts({ partnerId, rows, canEdit }: { partnerId: string; rows: ContactRow[]; canEdit: boolean }) {
  const [edit, setEdit] = useState<Partial<ContactRow> | null>(null);
  const { run, pending } = useRun();
  return (
    <section className="panel sec-panel" id="contatos">
      <h2>Contatos <span className="n">{rows.length}</span>{canEdit && <span style={{ marginLeft: "auto" }}><button type="button" className="btn btn-sm" onClick={() => setEdit({ isPrimary: !rows.length })}><Icon name="plus" size={14} /> Novo contato</button></span>}</h2>
      {rows.length ? (
        <div className="tbl solo" style={{ border: 0, borderRadius: 0, maxHeight: "none" }}>
          <table>
            <thead><tr><th>Nome</th><th>Cargo ou setor</th><th>E-mail</th><th>Telefone</th><th>Celular</th><th /></tr></thead>
            <tbody>{rows.map((c) => (
              <tr key={c.id} className={canEdit ? "click" : ""} onClick={(e) => { if (canEdit && !(e.target as HTMLElement).closest("a,button")) setEdit(c); }}>
                <td><b>{c.name}</b>{c.isPrimary && <> <span className="badge ok">principal</span></>}{c.notes && <div className="muted" style={{ fontSize: 12 }}>{c.notes}</div>}</td>
                <td>{c.role || "—"}</td><td>{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : "—"}</td><td>{c.phone || "—"}</td><td>{c.mobile || "—"}</td>
                <td className="acts show">{canEdit && <ActionButton className="mini-btn danger" title="Remover contato" confirm={`Remover o contato ${c.name}?`} action={() => deleteContactAction(c.id)}><Icon name="trash" size={13} /></ActionButton>}</td>
              </tr>))}</tbody>
          </table>
        </div>
      ) : <div className="pb muted" style={{ fontSize: 13 }}>Nenhum contato. Cadastre compradores, financeiro, recebimento e outras pessoas da empresa.</div>}
      {edit && (
        <Modal title={edit.id ? "Editar contato" : "Novo contato"} onClose={() => setEdit(null)}
          foot={<><button type="button" className="btn" onClick={() => setEdit(null)}>Cancelar</button>
            <button type="button" className="btn btn-primary" disabled={pending || !edit.name?.trim()}
              onClick={() => run(() => saveContactAction({ id: edit.id, partnerId, name: edit.name ?? "", role: edit.role ?? "", email: edit.email ?? "", phone: edit.phone ?? "", mobile: edit.mobile ?? "", notes: edit.notes ?? "", isPrimary: !!edit.isPrimary }), () => setEdit(null))}>Salvar contato</button></>}>
          <div className="form">
            <div className="fld full"><label htmlFor="c_n">Nome <span className="req">*</span></label><input id="c_n" value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus /></div>
            <div className="fld"><label htmlFor="c_r">Cargo ou setor</label><input id="c_r" value={edit.role ?? ""} onChange={(e) => setEdit({ ...edit, role: e.target.value })} /></div>
            <div className="fld"><label htmlFor="c_e">E-mail</label><input id="c_e" type="email" value={edit.email ?? ""} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></div>
            <div className="fld"><label htmlFor="c_t">Telefone</label><input id="c_t" inputMode="numeric" value={edit.phone ?? ""} onChange={(e) => setEdit({ ...edit, phone: maskPhone(e.target.value) })} /></div>
            <div className="fld"><label htmlFor="c_m">Celular</label><input id="c_m" inputMode="numeric" value={edit.mobile ?? ""} onChange={(e) => setEdit({ ...edit, mobile: maskPhone(e.target.value) })} /></div>
            <div className="fld full"><label htmlFor="c_o">Observação</label><input id="c_o" value={edit.notes ?? ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></div>
            <div className="fld full"><label className="chk"><input type="checkbox" checked={!!edit.isPrimary} onChange={(e) => setEdit({ ...edit, isPrimary: e.target.checked })} /> Contato principal</label></div>
          </div>
        </Modal>
      )}
    </section>
  );
}

export function Notes({ partnerId, rows, canEdit }: { partnerId: string; rows: NoteRow[]; canEdit: boolean }) {
  const [txt, setTxt] = useState("");
  const { run, pending } = useRun();
  return (
    <section className="panel sec-panel" id="anotacoes">
      <h2>Anotações <span className="n">{rows.length}</span></h2>
      <div className="pb stack">
        {canEdit && (
          <div>
            <textarea rows={2} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Registre uma conversa, combinado ou observação sobre o cliente…" aria-label="Nova anotação" />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
              <button type="button" className="btn btn-sm btn-primary" disabled={!txt.trim() || pending} onClick={() => run(() => addNoteAction(partnerId, txt), () => setTxt(""))}>Adicionar anotação</button>
            </div>
          </div>
        )}
        {rows.length ? (
          <ul className="note-list">
            {rows.map((n) => (
              <li key={n.id}>
                <div className="meta"><b>{n.userName ?? "—"}</b><span>{new Date(n.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
                  {canEdit && <ActionButton className="mini-btn danger" title="Excluir anotação" confirm="Excluir esta anotação?" action={() => deleteNoteAction(n.id)}><Icon name="trash" size={13} /></ActionButton>}</div>
                <p>{n.body}</p>
              </li>
            ))}
          </ul>
        ) : <p className="muted" style={{ margin: 0, fontSize: 13 }}>Nenhuma anotação ainda.</p>}
      </div>
    </section>
  );
}
