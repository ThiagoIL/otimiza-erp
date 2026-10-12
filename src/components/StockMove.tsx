"use client";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { Modal, useRun } from "./client";
import { ItemPicker } from "./ItemPicker";
import { createMovementAction, itemStockInfoAction } from "@/server/stock-actions";
import { today } from "@/lib/dates";

type T = "ENTRADA" | "SAIDA" | "TRANSFERENCIA" | "AJUSTE";
type Opt = [string, string];
const q = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Janela de movimentação de estoque (entrada, saída, transferência ou ajuste por contagem). */
export function StockMoveModal({ type: t0, item, locations, suppliers, ops, opId, onClose, onlyOut }: {
  type: T; item?: { id: string; label: string }; locations: Opt[]; suppliers?: Opt[]; ops?: Opt[]; opId?: string; onClose: () => void; onlyOut?: boolean;
}) {
  const [type, setType] = useState<T>(t0);
  const [it, setIt] = useState(item);
  const [pick, setPick] = useState(false);
  const [info, setInfo] = useState<Awaited<ReturnType<typeof itemStockInfoAction>>>(null);
  const [f, setF] = useState({ locationId: locations[0]?.[0] ?? "", destLocationId: "", qty: "", unitCost: "", date: today(), document: opId ? "" : "", notes: "", partnerId: "", productionOrderId: opId ?? "" });
  const { run, pending } = useRun();
  useEffect(() => {
    if (!it) { setInfo(null); return; }
    itemStockInfoAction(it.id).then((r) => {
      setInfo(r);
      if (r) setF((x) => ({ ...x, unitCost: x.unitCost || String(Math.round(r.cost * 10000) / 10000), locationId: r.defaultLocationId && locations.some(([v]) => v === r.defaultLocationId) ? r.defaultLocationId : x.locationId }));
    });
  }, [it, locations]);
  const bal = info ? info.byLoc[f.locationId] ?? 0 : 0;
  const total = info ? Object.values(info.byLoc).reduce((a, b) => a + b, 0) : 0;
  const n = Number(f.qty.replace(",", "."));
  const types: [T, string, "in" | "out" | "swap" | "adjust"][] = onlyOut ? [["SAIDA", "Saída", "out"]] : [["ENTRADA", "Entrada", "in"], ["SAIDA", "Saída", "out"], ["TRANSFERENCIA", "Transferência", "swap"], ["AJUSTE", "Ajuste", "adjust"]];
  return (
    <Modal title={onlyOut ? "Requisitar material" : "Movimentar estoque"} onClose={onClose}
      foot={<><button type="button" className="btn" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn btn-primary" disabled={pending || !it || !(n >= 0) || f.qty === ""}
          onClick={() => run(() => createMovementAction({ type, itemId: it!.id, locationId: f.locationId, destLocationId: f.destLocationId || null, qty: n, unitCost: Number(f.unitCost.replace(",", ".")) || null,
            date: f.date, document: f.document, notes: f.notes, partnerId: f.partnerId || null, productionOrderId: f.productionOrderId || null }), onClose)}>Registrar movimentação</button></>}>
      <div className="form">
        {types.length > 1 && <div className="full"><div className="seg" role="group" aria-label="Tipo de movimentação">
          {types.map(([k, l, ic]) => <button key={k} type="button" aria-pressed={type === k} onClick={() => setType(k)}><Icon name={ic} size={15} /> {l}</button>)}
        </div></div>}
        <div className="fld full"><span className="flabel">Item <span className="req">*</span></span>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={it?.label ?? ""} readOnly placeholder="Nenhum item escolhido" onClick={() => setPick(true)} style={{ cursor: "pointer" }} aria-label="Item" />
            <button type="button" className="btn" onClick={() => setPick(true)}><Icon name="search" size={15} /> Pesquisar</button>
          </div>
        </div>
        <div className="fld"><label htmlFor="m_l">{type === "ENTRADA" ? "Local de entrada" : type === "TRANSFERENCIA" ? "Local de origem" : "Local"}</label>
          <select id="m_l" value={f.locationId} onChange={(e) => setF({ ...f, locationId: e.target.value })}>{locations.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        {type === "TRANSFERENCIA" && <div className="fld"><label htmlFor="m_d">Local de destino</label><select id="m_d" value={f.destLocationId} onChange={(e) => setF({ ...f, destLocationId: e.target.value })}><option value="">Selecione…</option>{locations.filter(([v]) => v !== f.locationId).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>}
        {info && <div className="saldo-box"><span>Saldo neste local<br /><b>{q(bal)} {info.unit}</b></span><span>Saldo total<br /><b>{q(total)} {info.unit}</b></span><span>Custo médio<br /><b>{brl(info.cost)}</b></span>
          {type === "AJUSTE" && f.qty !== "" && <span>Diferença<br /><b>{n - bal > 0 ? "+" : ""}{q(n - bal)}</b></span>}</div>}
        <div className="fld"><label htmlFor="m_q">{type === "AJUSTE" ? "Quantidade contada" : "Quantidade"} <span className="req">*</span></label><input id="m_q" inputMode="decimal" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></div>
        {type === "ENTRADA" && <div className="fld"><label htmlFor="m_c">Custo unitário (R$)</label><input id="m_c" inputMode="decimal" value={f.unitCost} onChange={(e) => setF({ ...f, unitCost: e.target.value })} /></div>}
        <div className="fld"><label htmlFor="m_dt">Data</label><input id="m_dt" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        <div className="fld"><label htmlFor="m_doc">Documento</label><input id="m_doc" value={f.document} onChange={(e) => setF({ ...f, document: e.target.value })} placeholder="NF, requisição…" /></div>
        {type === "ENTRADA" && suppliers && <div className="fld full"><label htmlFor="m_p">Fornecedor</label><select id="m_p" value={f.partnerId} onChange={(e) => setF({ ...f, partnerId: e.target.value })}><option value="">Não informado</option>{suppliers.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>}
        {(type === "SAIDA" || type === "TRANSFERENCIA") && ops && <div className="fld full"><label htmlFor="m_op">Para qual ordem de produção</label><select id="m_op" value={f.productionOrderId} disabled={!!opId} onChange={(e) => setF({ ...f, productionOrderId: e.target.value })}><option value="">Nenhuma (consumo geral)</option>{ops.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select><small>A saída fica registrada como material retirado para a OP.</small></div>}
        <div className="fld full"><label htmlFor="m_o">Observação</label><textarea id="m_o" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
      </div>
      {pick && <ItemPicker single title="Escolher item" onClose={() => setPick(false)} priceLabel="Custo médio" priceOf={(r) => r.cost} onPick={([r]) => { setIt({ id: r.id, label: `${r.name} · ${r.code}` }); setF((x) => ({ ...x, unitCost: "" })); setPick(false); }} />}
    </Modal>
  );
}

/** Botões que abrem a janela de movimentação. */
export function StockMoveButtons({ locations, suppliers, ops, item, compact, only }: { locations: Opt[]; suppliers?: Opt[]; ops?: Opt[]; item?: { id: string; label: string }; compact?: boolean; only?: T[] }) {
  const [open, setOpen] = useState<T | null>(null);
  const list: [T, string, "in" | "out" | "swap" | "adjust"][] = ([["TRANSFERENCIA", "Transferir", "swap"], ["SAIDA", "Saída", "out"], ["ENTRADA", "Entrada", "in"], ["AJUSTE", "Ajuste de inventário", "adjust"]] as [T, string, "in" | "out" | "swap" | "adjust"][]).filter(([k]) => !only || only.includes(k));
  return (
    <>
      {list.map(([k, l, ic]) => compact
        ? <button key={k} type="button" className="btn btn-ghost btn-sm" title={l} aria-label={l} onClick={() => setOpen(k)}><Icon name={ic} size={15} /></button>
        : <button key={k} type="button" className={`btn${k === "ENTRADA" ? " btn-primary" : ""}`} onClick={() => setOpen(k)}><Icon name={ic} size={16} /> {l}</button>)}
      {open && <StockMoveModal type={open} item={item} locations={locations} suppliers={suppliers} ops={ops} onClose={() => setOpen(null)} />}
    </>
  );
}
