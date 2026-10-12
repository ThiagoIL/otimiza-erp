"use client";
import { useState } from "react";
import { Icon } from "./Icon";
import { ActionButton, useRun } from "./client";
import { deleteMovementAction, updateMovementQtyAction } from "@/server/stock-actions";

/** Botões bem pequenos ao lado da quantidade: editar a quantidade e excluir a movimentação. */
export function MovementQty({ id, qty, label, cls, editable, lockReason }: { id: string; qty: number; label: string; cls: string; editable: boolean; lockReason?: string }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(String(qty));
  const { run, pending } = useRun();
  if (edit) {
    return (
      <span className="qty-edit">
        <input value={v} inputMode="decimal" autoFocus onChange={(e) => setV(e.target.value)} aria-label="Nova quantidade"
          onKeyDown={(e) => { if (e.key === "Enter") run(() => updateMovementQtyAction(id, Number(v.replace(",", "."))), () => setEdit(false)); if (e.key === "Escape") setEdit(false); }} />
        <button type="button" className="mini-btn" title="Salvar" disabled={pending} onClick={() => run(() => updateMovementQtyAction(id, Number(v.replace(",", "."))), () => setEdit(false))}><Icon name="check" size={13} /></button>
        <button type="button" className="mini-btn" title="Cancelar" onClick={() => setEdit(false)}><Icon name="x" size={13} /></button>
      </span>
    );
  }
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      <span className={cls}>{label}</span>
      <span className="mini-acts">
        {editable ? <>
          <button type="button" className="mini-btn" title="Editar quantidade" aria-label="Editar quantidade" onClick={() => { setV(String(qty)); setEdit(true); }}><Icon name="edit" size={12} /></button>
          <ActionButton className="mini-btn danger" title="Excluir movimentação" confirm="Excluir esta movimentação? O saldo será recalculado." action={() => deleteMovementAction(id)}><Icon name="trash" size={12} /></ActionButton>
        </> : <span className="mini-btn" title={lockReason} style={{ cursor: "help" }}><Icon name="lock" size={12} /></span>}
      </span>
    </span>
  );
}
