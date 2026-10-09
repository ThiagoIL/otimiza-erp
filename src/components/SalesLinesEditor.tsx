"use client";
import { useState } from "react";
import { FieldError, useFormResult } from "./Form";
import { lineTotal, orderTotals } from "@/lib/sales";

type Opt = { id: string; label: string; unit: string; price: number };
type Line = { item: string; qtd: string; preco: string; desc: string };

const num = (s: string) => { const t = s.trim(); const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t); return Number.isFinite(n) ? n : 0; };
const money = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
const br = (n: number) => (n ? String(n).replace(".", ",") : "");

/** Itens do pedido com preço, desconto por linha, desconto geral e frete; os totais se atualizam ao digitar. */
export function SalesLinesEditor({ options, initial, discount = "", freight = "" }: { options: Opt[]; initial?: Line[]; discount?: string; freight?: string }) {
  const st = useFormResult();
  const [lines, setLines] = useState<Line[]>(() => {
    try { if (st.values?.linhas) return JSON.parse(st.values.linhas) as Line[]; } catch { /* usa o inicial */ }
    return initial?.length ? initial : [{ item: "", qtd: "1", preco: "", desc: "" }];
  });
  const [desc, setDesc] = useState(st.values?.desconto ?? discount);
  const [frete, setFrete] = useState(st.values?.frete ?? freight);
  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const filled = lines.filter((l) => l.item);
  const t = orderTotals(filled.map((l) => ({ qty: num(l.qtd), price: num(l.preco), disc: num(l.desc) })), num(desc), num(frete));
  return (
    <div className="full lines">
      <input type="hidden" name="linhas" value={JSON.stringify(filled)} />
      <div className="lines-head"><b>Itens do pedido</b><small>O preço vem do cadastro do item e pode ser alterado.</small></div>
      <div className="tbl solo">
        <table className="lines-tbl"><thead><tr><th>Item</th><th className="num" style={{ width: 110 }}>Qtd.</th><th className="num" style={{ width: 130 }}>Preço unit.</th><th className="num" style={{ width: 90 }}>Desc. %</th><th className="num" style={{ width: 120 }}>Total</th><th style={{ width: 40 }} /></tr></thead>
          <tbody>{lines.map((l, i) => {
            const o = options.find((x) => x.id === l.item);
            return (
              <tr key={i}>
                <td><select aria-label={`Item da linha ${i + 1}`} value={l.item} onChange={(e) => {
                  const it = options.find((x) => x.id === e.target.value);
                  set(i, { item: e.target.value, preco: it && !l.preco ? br(it.price) : l.preco });
                }}><option value="">Escolha o item</option>{options.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></td>
                <td><div className="with-unit"><input aria-label={`Quantidade da linha ${i + 1}`} inputMode="decimal" value={l.qtd} onChange={(e) => set(i, { qtd: e.target.value })} className="num" /><span>{o?.unit ?? ""}</span></div></td>
                <td><input aria-label={`Preço da linha ${i + 1}`} inputMode="decimal" value={l.preco} onChange={(e) => set(i, { preco: e.target.value })} placeholder="0,00" className="num" /></td>
                <td><input aria-label={`Desconto da linha ${i + 1}`} inputMode="decimal" value={l.desc} onChange={(e) => set(i, { desc: e.target.value })} placeholder="0" className="num" /></td>
                <td className="num">{money(lineTotal(num(l.qtd), num(l.preco), num(l.desc)))}</td>
                <td><button type="button" className="btn btn-sm btn-ghost" aria-label={`Remover linha ${i + 1}`} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} disabled={lines.length === 1}>✕</button></td>
              </tr>
            );
          })}</tbody></table>
      </div>
      <div className="lines-foot">
        <button type="button" className="btn btn-sm" onClick={() => setLines((ls) => [...ls, { item: "", qtd: "1", preco: "", desc: "" }])}>+ Adicionar item</button>
        <dl className="totals">
          <div><dt>Subtotal</dt><dd>{money(t.subtotal)}</dd></div>
          <div><dt><label htmlFor="f_desconto">Desconto (R$)</label></dt><dd><input id="f_desconto" name="desconto" inputMode="decimal" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="0,00" className="num" /><FieldError name="desconto" /></dd></div>
          <div><dt><label htmlFor="f_frete">Frete (R$)</label></dt><dd><input id="f_frete" name="frete" inputMode="decimal" value={frete} onChange={(e) => setFrete(e.target.value)} placeholder="0,00" className="num" /><FieldError name="frete" /></dd></div>
          <div className="grand"><dt>Total do pedido</dt><dd>{money(t.total)}</dd></div>
        </dl>
      </div>
    </div>
  );
}
