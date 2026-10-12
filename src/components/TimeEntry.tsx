"use client";
import { useState } from "react";
import { Icon } from "./Icon";
import { Modal, useRun } from "./client";
import { deleteTimeEntryAction, saveTimeEntryAction } from "@/server/production-actions";
import { today } from "@/lib/dates";

type Opt = [string, string];
export type TE = { id?: string; productionOrderId: string; memberId: string; stageId: string; workCenterId: string; date: string; start: string; end: string; breakMinutes: number; notes: string };
export type OpRef = { id: string; label: string; stageId: string; workCenterId: string | null; responsibleId: string | null };
const now = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

export function TimeEntryModal({ entry, mode, ops, members, stages, centers, memberCenter, onClose }: {
  entry: TE; mode: "iniciar" | "encerrar" | "registrar"; ops: OpRef[]; members: Opt[]; stages: Opt[]; centers: Opt[]; memberCenter: Record<string, string | null>; onClose: () => void;
}) {
  const [d, setD] = useState<TE>(() => mode === "encerrar" ? { ...entry, end: entry.date === today() ? now() : "17:00", breakMinutes: entry.breakMinutes || 0 } : entry);
  const [adv, setAdv] = useState(false);
  const { run, pending } = useRun();
  const set = (p: Partial<TE>) => setD({ ...d, ...p });
  return (
    <Modal title={mode === "iniciar" ? "Iniciar trabalho" : mode === "encerrar" ? "Encerrar trabalho" : d.id ? "Editar apontamento" : "Registrar horas"} size="wide" onClose={onClose}
      foot={<>
        {d.id && <button type="button" className="btn btn-danger left" disabled={pending} onClick={() => { if (confirm("Excluir este apontamento?")) run(() => deleteTimeEntryAction(d.id!), onClose); }}><Icon name="trash" size={16} /> Excluir</button>}
        <button type="button" className="btn" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(() => saveTimeEntryAction({ ...d, end: mode === "iniciar" ? null : d.end || null, stageId: d.stageId || null, workCenterId: d.workCenterId || null, advance: adv }), onClose)}>
          {mode === "iniciar" ? "Iniciar agora" : mode === "encerrar" ? "Encerrar" : "Salvar"}</button>
      </>}>
      <div className="form">
        <div className="fld full"><label htmlFor="t_op">Ordem de produção <span className="req">*</span></label>
          <select id="t_op" value={d.productionOrderId} onChange={(e) => { const o = ops.find((x) => x.id === e.target.value); set({ productionOrderId: e.target.value, stageId: o?.stageId ?? d.stageId, workCenterId: o?.workCenterId ?? d.workCenterId, memberId: d.memberId || o?.responsibleId || "" }); }}>
            <option value="">Selecione…</option>{ops.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></div>
        <div className="fld"><label htmlFor="t_m">Quem trabalhou <span className="req">*</span></label><select id="t_m" value={d.memberId} onChange={(e) => set({ memberId: e.target.value, workCenterId: d.workCenterId || memberCenter[e.target.value] || "" })}><option value="">Selecione…</option>{members.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="fld"><label htmlFor="t_s">Etapa</label><select id="t_s" value={d.stageId} onChange={(e) => set({ stageId: e.target.value })}><option value="">—</option>{stages.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="fld"><label htmlFor="t_c">Centro de trabalho</label><select id="t_c" value={d.workCenterId} onChange={(e) => set({ workCenterId: e.target.value })}><option value="">—</option>{centers.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="fld"><label htmlFor="t_d">Data</label><input id="t_d" type="date" value={d.date} onChange={(e) => set({ date: e.target.value })} /></div>
        <div className="fld"><label htmlFor="t_i">Início</label><input id="t_i" type="time" value={d.start} onChange={(e) => set({ start: e.target.value })} /></div>
        {mode !== "iniciar" && <>
          <div className="fld"><label htmlFor="t_f">Fim</label><input id="t_f" type="time" value={d.end} onChange={(e) => set({ end: e.target.value })} /></div>
          <div className="fld"><label htmlFor="t_b">Intervalo (min)</label><input id="t_b" type="number" min={0} value={d.breakMinutes} onChange={(e) => set({ breakMinutes: Number(e.target.value) || 0 })} /><small>Almoço ou pausas.</small></div>
        </>}
        <div className="fld full"><label htmlFor="t_n">Observação</label><input id="t_n" value={d.notes} onChange={(e) => set({ notes: e.target.value })} /></div>
        {mode !== "iniciar" && <div className="fld full"><label className="chk"><input type="checkbox" checked={adv} onChange={(e) => setAdv(e.target.checked)} /> A etapa terminou: mover a OP para a próxima etapa</label></div>}
      </div>
      {mode === "iniciar" && <p className="muted" style={{ fontSize: 12.5 }}>O trabalho fica “em andamento” e aparece no topo dos apontamentos até ser encerrado.</p>}
    </Modal>
  );
}

export function TimeButtons({ ops, members, stages, centers, memberCenter, defaultOp }: { ops: OpRef[]; members: Opt[]; stages: Opt[]; centers: Opt[]; memberCenter: Record<string, string | null>; defaultOp?: string }) {
  const [open, setOpen] = useState<"iniciar" | "registrar" | null>(defaultOp ? "registrar" : null);
  const o = ops.find((x) => x.id === defaultOp);
  const blank = (m: "iniciar" | "registrar"): TE => ({ productionOrderId: o?.id ?? "", memberId: o?.responsibleId ?? "", stageId: o?.stageId ?? "", workCenterId: o?.workCenterId ?? "", date: today(), start: m === "iniciar" ? now() : "07:00", end: "", breakMinutes: 0, notes: "" });
  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen("iniciar")}><Icon name="clock" size={16} /> Iniciar trabalho</button>
      <button type="button" className="btn btn-primary" onClick={() => setOpen("registrar")}><Icon name="plus" size={16} /> Registrar horas</button>
      {open && <TimeEntryModal entry={blank(open)} mode={open} ops={ops} members={members} stages={stages} centers={centers} memberCenter={memberCenter} onClose={() => setOpen(null)} />}
    </>
  );
}

export function TimeRowButton({ entry, ops, members, stages, centers, memberCenter, label, className = "btn btn-sm" }: { entry: TE; ops: OpRef[]; members: Opt[]; stages: Opt[]; centers: Opt[]; memberCenter: Record<string, string | null>; label: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{label}</button>
      {open && <TimeEntryModal entry={entry} mode={entry.end ? "registrar" : "encerrar"} ops={ops} members={members} stages={stages} centers={centers} memberCenter={memberCenter} onClose={() => setOpen(false)} />}
    </>
  );
}
