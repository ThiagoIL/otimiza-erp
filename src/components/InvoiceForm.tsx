"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useRun } from "./client";
import { createInvoiceAction } from "@/server/invoice-actions";
import { fmtD, installments, today, type Inst } from "@/lib/dates";

type Order = { id: string; number: number; client: string; total: number; days: number[]; term: string; method: string; manual: Inst[] | null; items: { itemId: string; name: string; unit: string; qty: number; bal: Record<string, number> }[] };
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const q = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

/** Faturar um pedido aprovado: número da nota, baixa no estoque e as contas a receber que serão geradas. */
export function InvoiceForm({ orders, selected, nextNumber, locations, defaultLocation }: { orders: Order[]; selected?: string; nextNumber: number; locations: [string, string][]; defaultLocation: string }) {
  const router = useRouter();
  const [orderId, setOrderId] = useState(selected ?? "");
  const [number, setNumber] = useState(nextNumber);
  const [series, setSeries] = useState("1");
  const [date, setDate] = useState(today());
  const [stockOut, setStockOut] = useState(true);
  const [loc, setLoc] = useState(defaultLocation);
  const [notes, setNotes] = useState("");
  const { run, pending } = useRun();
  const o = orders.find((x) => x.id === orderId);
  const parc = useMemo(() => (o ? o.manual ?? installments(o.total, o.days, date || today()) : []), [o, date]);
  const short = o && stockOut ? o.items.filter((i) => (i.bal[loc] ?? 0) + 1e-9 < i.qty) : [];
  return (
    <div className="sheet" style={{ maxWidth: 900 }}>
      <div className="sheet-top">
        <div className="form f4">
          <div className="fld span2">
            <label htmlFor="nf_o">Pedido a faturar <span className="req">*</span></label>
            <select id="nf_o" value={orderId} onChange={(e) => { setOrderId(e.target.value); router.replace(`?pedido=${e.target.value}`, { scroll: false }); }}>
              <option value="">Selecione…</option>{orders.map((x) => <option key={x.id} value={x.id}>Pedido {x.number} · {x.client} · {brl(x.total)}</option>)}
            </select>
            {!orders.length && <small>Nenhum pedido aprovado aguardando faturamento.</small>}
          </div>
          <div className="fld"><label htmlFor="nf_n">Número da nota</label><input id="nf_n" type="number" value={number} onChange={(e) => setNumber(Number(e.target.value) || 0)} /></div>
          <div className="fld"><label htmlFor="nf_s">Série</label><input id="nf_s" value={series} maxLength={3} onChange={(e) => setSeries(e.target.value)} /></div>
          <div className="fld"><label htmlFor="nf_d">Data de emissão</label><input id="nf_d" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="fld span2"><span className="flabel">&nbsp;</span><label className="chk" style={{ height: 36 }}><input type="checkbox" checked={stockOut} onChange={(e) => setStockOut(e.target.checked)} /> Dar baixa dos itens no estoque</label></div>
          {stockOut && <div className="fld"><label htmlFor="nf_l">Local de saída</label><select id="nf_l" value={loc} onChange={(e) => setLoc(e.target.value)}>{locations.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>}
          <div className="fld full"><label htmlFor="nf_ob">Observações da nota</label><input id="nf_ob" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
      </div>
      {o && (
        <>
          <section className="panel sec-panel"><h2>Itens da nota</h2>
            <div className="tbl solo" style={{ border: 0, borderRadius: 0, maxHeight: "none" }}>
              <table><thead><tr><th>Item</th><th className="num">Quantidade</th>{stockOut && <th className="num">Saldo no local</th>}</tr></thead>
                <tbody>{o.items.map((i) => {
                  const b = i.bal[loc] ?? 0;
                  return <tr key={i.itemId}><td className="desc">{i.name}</td><td className="num">{q(i.qty)} {i.unit}</td>{stockOut && <td className={`num${b + 1e-9 < i.qty ? " t-bad" : ""}`}>{q(b)}</td>}</tr>;
                })}</tbody></table>
            </div>
            {short.length > 0 && <div className="pb"><div className="warnline" style={{ marginTop: 0 }}>Saldo insuficiente neste local para {short.map((x) => x.name).join(", ")}. Escolha outro local ou fature sem baixar o estoque.</div></div>}
          </section>
          <section className="panel sec-panel"><h2>Contas a receber que serão geradas <span className="muted h-sub">{o.method} · {o.term || "À vista"}</span></h2>
            <div className="pb"><table className="parc"><thead><tr><th>Parcela</th><th>Vencimento</th><th className="num">Valor</th></tr></thead>
              <tbody>{parc.map((x) => <tr key={x.n}><td>{x.n}/{parc.length}</td><td>{fmtD(x.due)}</td><td className="num">{brl(x.value)}</td></tr>)}</tbody></table></div>
          </section>
        </>
      )}
      <div className="sticky-foot">
        <button type="button" className="btn btn-primary" disabled={!o || pending || short.length > 0}
          onClick={() => run(() => createInvoiceAction({ orderId, number, series, issueDate: date, stockOut, locationId: stockOut ? loc : null, notes }))}>
          {pending ? "Faturando…" : o ? `Faturar ${brl(o.total)}` : "Faturar"}
        </button>
      </div>
    </div>
  );
}
