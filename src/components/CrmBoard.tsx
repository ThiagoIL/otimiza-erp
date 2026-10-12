"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { Modal, useRun } from "./client";
import { toast } from "./Toast";
import { moveDealAction, saveDealAction } from "@/server/crm-actions";
import { CRM_SOURCES } from "@/lib/consts";
import { fmtD, today } from "@/lib/dates";

export type Stage = { id: string; name: string; color: string; kind: string };
export type Deal = {
  id: string; number: number; title: string; partnerId: string | null; partner: string | null; leadName: string | null; leadCompany: string | null; leadPhone: string | null; leadEmail: string | null;
  stageId: string; value: number; expectedClose: string | null; ownerId: string | null; owner: string | null; source: string | null; notes: string | null; lostReason: string | null; pending: number;
};
type Opt = [string, string];
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const ini = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

export function CrmBoard({ stages, deals, clients, owners, canEdit, openNew, newClient }: {
  stages: Stage[]; deals: Deal[]; clients: Opt[]; owners: Opt[]; canEdit: boolean; openNew?: boolean; newClient?: string;
}) {
  const router = useRouter();
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [edit, setEdit] = useState<Partial<Deal> | null>(null);
  const { run } = useRun();
  const firstOpen = stages.find((s) => s.kind === "aberta")?.id ?? stages[0]?.id ?? "";
  useEffect(() => { if (openNew && canEdit) setEdit({ stageId: firstOpen, partnerId: newClient ?? null, value: 0 }); }, [openNew, canEdit, firstOpen, newClient]);
  const hoje = today();
  return (
    <>
      <div className="kanban crm">
        {stages.map((st) => {
          const list = deals.filter((d) => d.stageId === st.id);
          const sum = list.reduce((a, d) => a + d.value, 0);
          return (
            <section key={st.id} className={`col${over === st.id ? " over" : ""}`} style={{ ["--c" as string]: st.color }} aria-label={st.name}
              onDragOver={(e) => { if (!canEdit) return; e.preventDefault(); setOver(st.id); }} onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); setOver(null); const id = drag; setDrag(null); const d = deals.find((x) => x.id === id); if (d && d.stageId !== st.id) run(() => moveDealAction(d.id, st.id)); }}>
              <div className="col-h"><span className="dot" style={{ background: st.color }} />{st.name}<span className="n">{list.length}</span></div>
              <div className="muted" style={{ fontSize: 12, padding: "6px 12px 0" }}>{brl(sum)}</div>
              <div className="col-b">
                {list.map((d) => {
                  const late = d.expectedClose && d.expectedClose < hoje && st.kind === "aberta";
                  return (
                    <article key={d.id} className="card" draggable={canEdit} tabIndex={0} onDragStart={() => setDrag(d.id)} onDragEnd={() => setDrag(null)}
                      onClick={() => router.push(`/crm/${d.id}`)} onKeyDown={(e) => { if (e.key === "Enter") router.push(`/crm/${d.id}`); }} aria-label={d.title}>
                      <div className="card-top"><b>#{d.number}</b>{d.source && <span>{d.source}</span>}{d.expectedClose && <span className={`late badge${late ? " bad" : ""}`}>{late && <Icon name="alert" size={12} />}{fmtD(d.expectedClose)}</span>}</div>
                      <h3>{d.title}</h3>
                      <div className="meta"><span>{d.partner ?? d.leadCompany ?? d.leadName ?? "—"}</span>{d.pending > 0 && <span><Icon name="clock" size={12} className="ic" /> {d.pending} {d.pending === 1 ? "atividade pendente" : "atividades pendentes"}</span>}</div>
                      <div className="foot">{d.owner && <span className="avatar sm" title={d.owner}>{ini(d.owner)}</span>}<span className="grow" style={{ flex: 1 }} /><span className="val">{brl(d.value)}</span></div>
                    </article>
                  );
                })}
                {!list.length && <div className="col-empty">{canEdit ? "Arraste uma oportunidade para cá" : "Vazio"}</div>}
              </div>
            </section>
          );
        })}
      </div>
      {edit && <DealModal deal={edit} stages={stages} clients={clients} owners={owners} onClose={() => { setEdit(null); if (openNew) router.replace("/crm", { scroll: false }); }}
        onSaved={(id) => { setEdit(null); toast("Oportunidade salva."); if (!edit.id) router.push(`/crm/${id}`); else router.refresh(); }} />}
    </>
  );
}

export function DealModal({ deal, stages, clients, owners, onClose, onSaved }: { deal: Partial<Deal>; stages: Stage[]; clients: Opt[]; owners: Opt[]; onClose: () => void; onSaved: (id: string) => void }) {
  const [d, setD] = useState<Partial<Deal>>(deal);
  const [lead, setLead] = useState(!deal.partnerId && !!(deal.leadName || deal.leadCompany));
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<Deal>) => setD({ ...d, ...p });
  const st = stages.find((x) => x.id === d.stageId);
  const save = async () => {
    setBusy(true);
    const r = await saveDealAction({
      id: d.id, title: d.title ?? "", partnerId: lead ? null : d.partnerId ?? null, leadName: lead ? d.leadName : null, leadCompany: lead ? d.leadCompany : null,
      leadPhone: lead ? d.leadPhone : null, leadEmail: lead ? d.leadEmail : null, stageId: d.stageId ?? "", value: Number(d.value) || 0, expectedClose: d.expectedClose ?? null,
      ownerId: d.ownerId ?? null, source: d.source ?? null, notes: d.notes ?? null, lostReason: st?.kind === "perdida" ? d.lostReason ?? null : null,
    });
    setBusy(false);
    if (r.error) toast(r.error, true); else onSaved(r.id!);
  };
  return (
    <Modal title={d.id ? `Oportunidade #${d.number}` : "Nova oportunidade"} size="wide" onClose={onClose}
      foot={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><button type="button" className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Salvando…" : "Salvar oportunidade"}</button></>}>
      <div className="form">
        <div className="fld full"><label htmlFor="d_t">Título <span className="req">*</span></label><input id="d_t" value={d.title ?? ""} onChange={(e) => set({ title: e.target.value })} placeholder="Ex.: 3 furgões 6200 para a frota" autoFocus /></div>
        <div className="fld full">
          <div className="radio-row" style={{ minHeight: 0, marginBottom: 6 }}>
            <label><input type="radio" checked={!lead} onChange={() => setLead(false)} /> Cliente já cadastrado</label>
            <label><input type="radio" checked={lead} onChange={() => setLead(true)} /> Contato novo (ainda não é cliente)</label>
          </div>
          {!lead
            ? <select value={d.partnerId ?? ""} onChange={(e) => set({ partnerId: e.target.value || null })} aria-label="Cliente"><option value="">Selecione o cliente…</option>{clients.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            : <div className="form" style={{ marginTop: 4 }}>
              <div className="fld"><label htmlFor="d_lc">Empresa</label><input id="d_lc" value={d.leadCompany ?? ""} onChange={(e) => set({ leadCompany: e.target.value })} /></div>
              <div className="fld"><label htmlFor="d_ln">Nome do contato</label><input id="d_ln" value={d.leadName ?? ""} onChange={(e) => set({ leadName: e.target.value })} /></div>
              <div className="fld"><label htmlFor="d_lp">Telefone</label><input id="d_lp" value={d.leadPhone ?? ""} onChange={(e) => set({ leadPhone: e.target.value })} /></div>
              <div className="fld"><label htmlFor="d_le">E-mail</label><input id="d_le" type="email" value={d.leadEmail ?? ""} onChange={(e) => set({ leadEmail: e.target.value })} /></div>
            </div>}
        </div>
        <div className="fld"><label htmlFor="d_s">Etapa</label><select id="d_s" value={d.stageId ?? ""} onChange={(e) => set({ stageId: e.target.value })}>{stages.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <div className="fld"><label htmlFor="d_v">Valor estimado (R$)</label><input id="d_v" type="number" step="any" min={0} value={d.value ?? 0} onChange={(e) => set({ value: Number(e.target.value) || 0 })} /></div>
        <div className="fld"><label htmlFor="d_c">Previsão de fechamento</label><input id="d_c" type="date" value={d.expectedClose ?? ""} onChange={(e) => set({ expectedClose: e.target.value || null })} /></div>
        <div className="fld"><label htmlFor="d_o">Responsável</label><select id="d_o" value={d.ownerId ?? ""} onChange={(e) => set({ ownerId: e.target.value || null })}><option value="">Ninguém</option>{owners.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="fld"><label htmlFor="d_src">Origem</label><select id="d_src" value={d.source ?? ""} onChange={(e) => set({ source: e.target.value || null })}><option value="">Não informada</option>{CRM_SOURCES.map((x) => <option key={x}>{x}</option>)}</select></div>
        {st?.kind === "perdida" && <div className="fld"><label htmlFor="d_lr">Motivo da perda</label><input id="d_lr" value={d.lostReason ?? ""} onChange={(e) => set({ lostReason: e.target.value })} placeholder="Preço, prazo, concorrente…" /></div>}
        <div className="fld full"><label htmlFor="d_n">Observações</label><textarea id="d_n" rows={3} value={d.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} /></div>
      </div>
    </Modal>
  );
}
