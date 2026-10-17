"use client";
import { useState } from "react";
import { Icon } from "./Icon";
import { ActionButton, Modal, useRun } from "./client";
import { Sel } from "./SearchPicker";
import { createShipmentAction, deleteShipmentAction } from "@/server/assembly-actions";
import { saveReportAction } from "@/server/report-actions";
import { today } from "@/lib/dates";

const qf = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
export type ShipPart = { id: string; where: string; label: string; unit: string; qty: number; shipped: number; done: number };

/** Gera o romaneio: escolhe as peças (e quantidades) que saem da fábrica para a montagem. */
export function ShipmentButton({ assemblyId, parts }: { assemblyId: string; parts: ShipPart[] }) {
  const [open, setOpen] = useState(false);
  const free = parts.filter((p) => p.qty - p.shipped > 1e-9);
  const [sel, setSel] = useState<Record<string, number>>({});
  const [f, setF] = useState({ date: today(), vehicle: "", driver: "", notes: "" });
  const { run, pending } = useRun();
  const start = () => { setSel(Object.fromEntries(free.map((p) => [p.id, p.qty - p.shipped]))); setOpen(true); };
  const lines = Object.entries(sel).filter(([, q]) => q > 0).map(([partId, qty]) => ({ partId, qty }));
  return (
    <>
      <button type="button" className="btn" disabled={!free.length} title={!free.length ? "Todas as peças já estão em romaneio" : undefined} onClick={start}><Icon name="truck" size={16} /> Gerar romaneio</button>
      {open && (
        <Modal title="Gerar romaneio" size="wide" onClose={() => setOpen(false)}
          foot={<><button type="button" className="btn" onClick={() => setOpen(false)}>Cancelar</button>
            <button type="button" className="btn btn-primary" disabled={pending || !lines.length} onClick={() => run(() => createShipmentAction({ assemblyId, ...f, lines }), () => setOpen(false))}>Gerar romaneio ({lines.length} {lines.length === 1 ? "peça" : "peças"})</button></>}>
          <p className="muted" style={{ marginTop: 0 }}>O romaneio lista o que sai da fábrica para esta montagem. Depois de gerar, imprima (PDF) ou use a tela do romaneio para conferir e apontar o que foi montado.</p>
          <div className="form f4" style={{ marginBottom: 12 }}>
            <div className="fld"><label htmlFor="sh_d">Data de saída</label><input id="sh_d" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
            <div className="fld"><label htmlFor="sh_v">Veículo / placa</label><input id="sh_v" value={f.vehicle} onChange={(e) => setF({ ...f, vehicle: e.target.value })} /></div>
            <div className="fld"><label htmlFor="sh_m">Motorista</label><input id="sh_m" value={f.driver} onChange={(e) => setF({ ...f, driver: e.target.value })} /></div>
            <div className="fld"><label htmlFor="sh_n">Observação</label><input id="sh_n" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
          </div>
          <div className="tbl solo" style={{ maxHeight: 360 }}><table>
            <thead><tr><th className="chk-cell"><input type="checkbox" aria-label="Marcar todas" checked={free.every((p) => (sel[p.id] ?? 0) > 0)} onChange={(e) => setSel(Object.fromEntries(free.map((p) => [p.id, e.target.checked ? p.qty - p.shipped : 0])))} /></th>
              <th>Local</th><th>Peça</th><th className="num">A enviar</th><th className="num" style={{ width: 110 }}>Neste romaneio</th></tr></thead>
            <tbody>{free.map((p) => {
              const left = p.qty - p.shipped;
              return (
                <tr key={p.id}><td><input type="checkbox" aria-label="Incluir" checked={(sel[p.id] ?? 0) > 0} onChange={(e) => setSel({ ...sel, [p.id]: e.target.checked ? left : 0 })} /></td>
                  <td style={{ fontSize: 12.5 }}>{p.where}</td><td className="desc">{p.label}</td><td className="num">{qf(left)} {p.unit}</td>
                  <td><input type="number" min={0} max={left} step="any" value={sel[p.id] ?? 0} onChange={(e) => setSel({ ...sel, [p.id]: Math.min(left, Math.max(0, Number(e.target.value) || 0)) })} aria-label="Quantidade" /></td></tr>
              );
            })}</tbody></table></div>
        </Modal>
      )}
    </>
  );
}

export function DeleteShipment({ id, number }: { id: string; number: number }) {
  return <ActionButton className="btn btn-ghost btn-sm" confirm={`Excluir o romaneio ${number}? As peças voltam a ficar livres para outro romaneio (o que já foi apontado como montado continua).`} action={deleteShipmentAction.bind(null, id)}><Icon name="trash" size={14} /></ActionButton>;
}

/** Na tela do romaneio: apontar a peça como montada sem sair da tela (abre o mesmo apontamento da tela Apontar). */
export function ShipLineApontar({ assemblyId, partId, left, unit, label, team }: { assemblyId: string; partId: string; left: number; unit: string; label: string; team: [string, string][] }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ qty: String(left), memberId: "", date: today(), notes: "" });
  const { run, pending } = useRun();
  if (left <= 1e-9) return <span className="badge ok"><Icon name="check" size={12} /> Montada</span>;
  return (
    <>
      <button type="button" className="btn btn-sm btn-primary" onClick={() => { setF({ ...f, qty: String(left) }); setOpen(true); }}><Icon name="check" size={13} /> Apontar</button>
      {open && (
        <Modal title={`Apontar montagem: ${label}`} size="narrow" onClose={() => setOpen(false)}
          foot={<><button type="button" className="btn" onClick={() => setOpen(false)}>Cancelar</button>
            <button type="button" className="btn btn-primary" disabled={pending || !(Number(f.qty.replace(",", ".")) > 0)} onClick={() => run(() => saveReportAction({ kind: "MONTAGEM", targetId: assemblyId, line: partId, qty: Number(f.qty.replace(",", ".")), date: f.date, memberId: f.memberId || null, notes: f.notes }), () => setOpen(false))}>Apontar</button></>}>
          <div className="form f2">
            <div className="fld"><label htmlFor="sl_q">Quantidade montada ({unit || "un."})</label><input id="sl_q" inputMode="decimal" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /><small>Faltam {qf(left)}.</small></div>
            <div className="fld"><label htmlFor="sl_d">Data</label><input id="sl_d" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
            <div className="fld full"><label htmlFor="sl_m">Quem montou</label><Sel id="sl_m" value={f.memberId} onChange={(e) => setF({ ...f, memberId: e.target.value })}><option value="">Não informar</option>{team.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel></div>
            <div className="fld full"><label htmlFor="sl_n">Observação</label><input id="sl_n" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
          </div>
        </Modal>
      )}
    </>
  );
}
