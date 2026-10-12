"use client";
import { useState } from "react";
import Link from "next/link";
import { Icon } from "./Icon";
import { ActionButton, useRun } from "./client";
import { deleteItemSupplierAction, saveItemSupplierAction } from "@/server/item-actions";

export type SupRow = { id: string; partnerId: string; name: string; supplierCode: string | null; lastPrice: number; leadDays: number | null };

/** Fornecedores que vendem o item, com o código no fornecedor, último preço e prazo. */
export function ItemSuppliers({ itemId, rows, suppliers, canEdit }: { itemId: string; rows: SupRow[]; suppliers: [string, string][]; canEdit: boolean }) {
  const [f, setF] = useState({ partnerId: "", supplierCode: "", lastPrice: "", leadDays: "" });
  const { run, pending } = useRun();
  return (
    <section className="panel sec-panel" id="fornecedores">
      <h2>Fornecedores do item <span className="muted h-sub">{rows.length}</span></h2>
      {rows.length ? (
        <div className="tbl solo" style={{ border: 0, borderRadius: 0, maxHeight: "none" }}>
          <table>
            <thead><tr><th>Fornecedor</th><th>Código no fornecedor</th><th className="num">Último preço</th><th className="num">Prazo</th><th /></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td><Link className="row-link" href={`/clientes/${r.partnerId}`}>{r.name}</Link></td><td className="code">{r.supplierCode || "—"}</td>
                <td className="num">{r.lastPrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td><td className="num">{r.leadDays != null ? `${r.leadDays} dias` : "—"}</td>
                <td className="acts show">{canEdit && <ActionButton className="btn btn-ghost btn-sm" title="Remover fornecedor" confirm="Remover este fornecedor do item?" action={() => deleteItemSupplierAction(r.id)}><Icon name="trash" size={15} /></ActionButton>}</td>
              </tr>))}</tbody>
          </table>
        </div>
      ) : <div className="pb muted" style={{ fontSize: 13 }}>Nenhum fornecedor ligado ao item.</div>}
      {canEdit && (
        <div className="pb" style={{ borderTop: "1px solid var(--line-2)" }}>
          <div className="form f4">
            <div className="fld span2"><label htmlFor="sp_p">Fornecedor</label><select id="sp_p" value={f.partnerId} onChange={(e) => setF({ ...f, partnerId: e.target.value })}><option value="">Selecione…</option>{suppliers.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div className="fld"><label htmlFor="sp_c">Código no fornecedor</label><input id="sp_c" value={f.supplierCode} onChange={(e) => setF({ ...f, supplierCode: e.target.value })} /></div>
            <div className="fld"><label htmlFor="sp_v">Último preço (R$)</label><input id="sp_v" inputMode="decimal" value={f.lastPrice} onChange={(e) => setF({ ...f, lastPrice: e.target.value })} /></div>
            <div className="fld"><label htmlFor="sp_d">Prazo (dias)</label><input id="sp_d" inputMode="numeric" value={f.leadDays} onChange={(e) => setF({ ...f, leadDays: e.target.value })} /></div>
            <div className="fld" style={{ alignSelf: "end" }}>
              <button type="button" className="btn" disabled={!f.partnerId || pending}
                onClick={() => run(() => saveItemSupplierAction({ itemId, partnerId: f.partnerId, supplierCode: f.supplierCode, lastPrice: Number(f.lastPrice.replace(/\./g, "").replace(",", ".")) || 0, leadDays: f.leadDays ? Number(f.leadDays) : null }), () => setF({ partnerId: "", supplierCode: "", lastPrice: "", leadDays: "" }))}>
                <Icon name="plus" size={15} /> Adicionar fornecedor</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
