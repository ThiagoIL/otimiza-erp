"use client";
import Link from "next/link";
import { Sel } from "./SearchPicker";
import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import { Modal, useRun } from "./client";
import { ItemPicker } from "./ItemPicker";
import { toast } from "./Toast";
import { concludeQuotationAction, createQuotationAction, receivePurchaseAction, savePurchaseOrderAction, saveQuotationAction, saveRequestAction } from "@/server/purchase-actions";
import { docTotals, installments, r2, today, type Inst } from "@/lib/dates";

type Opt = [string, string];
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const qf = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
let seq = 0;
const k = () => `n${++seq}`;

// ------------------------------------------------------------------ Solicitação
export type ReqLine = { key: string; itemId: string; code: string; name: string; unit: string; qty: number; notes: string; balance?: number };
export function RequestEditor({ data, editable }: { data: { id?: string; requester: string; department: string; needDate: string; notes: string; lines: ReqLine[] }; editable: boolean }) {
  const [d, setD] = useState(data);
  const [pick, setPick] = useState(false);
  const { run, pending } = useRun();
  const set = (p: Partial<typeof d>) => setD({ ...d, ...p });
  return (
    <div className="sheet">
      <div className="sheet-top"><div className="form f4">
        <div className="fld"><label htmlFor="r_r">Solicitante</label><input id="r_r" value={d.requester} disabled={!editable} onChange={(e) => set({ requester: e.target.value })} /></div>
        <div className="fld"><label htmlFor="r_s">Setor</label><input id="r_s" value={d.department} disabled={!editable} onChange={(e) => set({ department: e.target.value })} placeholder="Produção, manutenção…" /></div>
        <div className="fld"><label htmlFor="r_n">Necessário até</label><input id="r_n" type="date" value={d.needDate} disabled={!editable} onChange={(e) => set({ needDate: e.target.value })} /></div>
        <div className="fld full"><label htmlFor="r_o">Observações</label><textarea id="r_o" rows={2} value={d.notes} disabled={!editable} onChange={(e) => set({ notes: e.target.value })} /></div>
      </div></div>
      <section className="panel sec-panel">
        <h2>Itens solicitados <span className="n">{d.lines.length}</span>{editable && <span style={{ marginLeft: "auto" }}><button type="button" className="btn btn-sm btn-primary" onClick={() => setPick(true)}><Icon name="search" size={14} /> Pesquisar itens</button></span>}</h2>
        <div className="tbl solo items-t" style={{ border: 0, borderRadius: 0 }}><table>
          <thead><tr><th>Código</th><th>Item</th><th>Un.</th><th className="num">Saldo</th><th className="num" style={{ width: 120 }}>Quantidade</th><th>Observação</th><th style={{ width: 40 }} /></tr></thead>
          <tbody>{d.lines.length ? d.lines.map((l) => (
            <tr key={l.key}><td className="code">{l.code}</td><td className="desc">{l.name}</td><td>{l.unit}</td><td className="num">{l.balance != null ? qf(l.balance) : "—"}</td>
              <td><input type="number" min={0} step="any" value={l.qty} disabled={!editable} onChange={(e) => set({ lines: d.lines.map((x) => x.key === l.key ? { ...x, qty: Number(e.target.value) || 0 } : x) })} aria-label="Quantidade" /></td>
              <td><input value={l.notes} disabled={!editable} onChange={(e) => set({ lines: d.lines.map((x) => x.key === l.key ? { ...x, notes: e.target.value } : x) })} aria-label="Observação" /></td>
              <td>{editable && <button type="button" className="btn btn-ghost btn-sm" aria-label="Remover" onClick={() => set({ lines: d.lines.filter((x) => x.key !== l.key) })}><Icon name="x" size={14} /></button>}</td></tr>))
            : <tr><td colSpan={7}><div className="empty-inline">Nenhum item. Use “Pesquisar itens”.</div></td></tr>}</tbody>
        </table></div>
      </section>
      {editable && <div className="sticky-foot"><Link className="btn left" href="/compras/solicitacoes">Voltar</Link>
        <button type="button" className="btn btn-primary" disabled={pending || !d.lines.length} onClick={() => run(() => saveRequestAction({ id: d.id, requester: d.requester, department: d.department, needDate: d.needDate || null, notes: d.notes, items: d.lines.map((l) => ({ itemId: l.itemId, qty: l.qty, notes: l.notes })) }))}>{pending ? "Salvando…" : d.id ? "Salvar solicitação" : "Criar solicitação"}</button></div>}
      {pick && <ItemPicker title="Itens a comprar" priceLabel="Custo médio" priceOf={(r) => r.cost} onClose={() => setPick(false)}
        onPick={(rows) => { set({ lines: [...d.lines, ...rows.map((r) => ({ key: k(), itemId: r.id, code: r.code, name: r.name, unit: r.unit, qty: r.qty || 1, notes: "", balance: r.balance }))] }); setPick(false); }} />}
    </div>
  );
}

export function QuoteFromRequests({ requests }: { requests: { id: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const { run, pending } = useRun();
  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}><Icon name="list" size={16} /> Cotar solicitações</button>
      {open && <Modal title="Nova cotação" onClose={() => setOpen(false)}
        foot={<><button type="button" className="btn" onClick={() => setOpen(false)}>Cancelar</button>
          <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(() => createQuotationAction(sel), () => setOpen(false))}>{sel.length ? `Cotar ${sel.length} ${sel.length === 1 ? "solicitação" : "solicitações"}` : "Criar cotação em branco"}</button></>}>
        <p className="muted" style={{ marginTop: 0 }}>Os itens das solicitações marcadas entram juntos na cotação (somando as quantidades do mesmo item).</p>
        {requests.length ? <ul className="pick">{requests.map((r) => (
          <li key={r.id}><label className="chkbox" style={{ height: "auto", padding: "8px 12px", width: "100%" }}><input type="checkbox" checked={sel.includes(r.id)} onChange={(e) => setSel(e.target.checked ? [...sel, r.id] : sel.filter((x) => x !== r.id))} /> {r.label}</label></li>))}</ul>
          : <p className="muted">Nenhuma solicitação aberta ou aprovada.</p>}
      </Modal>}
    </>
  );
}

// ------------------------------------------------------------------ Cotação (mapa de preços)
type QItem = { key: string; itemId: string; code: string; name: string; unit: string; qty: number };
type QSup = { key: string; partnerId: string; freight: number; paymentTerms: string; deliveryDays: number | null };
type QPrice = { price: number | null; selected: boolean };
export function QuotationEditor({ id, open, dueDate, notes, items: i0, suppliers: s0, prices: p0, partners }: {
  id: string; open: boolean; dueDate: string; notes: string; items: QItem[]; suppliers: QSup[]; prices: Record<string, QPrice>; partners: Opt[];
}) {
  const [items, setItems] = useState(i0);
  const [sups, setSups] = useState(s0);
  const [prices, setPrices] = useState(p0);
  const [due, setDue] = useState(dueDate);
  const [obs, setObs] = useState(notes);
  const [add, setAdd] = useState("");
  const [pick, setPick] = useState(false);
  const [dirty, setDirty] = useState(false);
  const { run, pending } = useRun();
  const pk = (ik: string, sk: string) => `${ik}|${sk}`;
  const setP = (ik: string, sk: string, patch: Partial<QPrice>) => { setPrices({ ...prices, [pk(ik, sk)]: { price: prices[pk(ik, sk)]?.price ?? null, selected: prices[pk(ik, sk)]?.selected ?? false, ...patch } }); setDirty(true); };
  const choose = (ik: string, sk: string) => { const n = { ...prices }; for (const s of sups) n[pk(ik, s.key)] = { price: n[pk(ik, s.key)]?.price ?? null, selected: s.key === sk ? !n[pk(ik, sk)]?.selected : false }; setPrices(n); setDirty(true); };
  const best = (ik: string) => { let b: string | null = null, v = Infinity; for (const s of sups) { const p = prices[pk(ik, s.key)]?.price; if (p != null && p > 0 && p < v) { v = p; b = s.key; } } return b; };
  const pickBest = () => { const n = { ...prices }; for (const it of items) { const b = best(it.key); for (const s of sups) n[pk(it.key, s.key)] = { price: n[pk(it.key, s.key)]?.price ?? null, selected: s.key === b }; } setPrices(n); setDirty(true); };
  const supTotal = (sk: string, onlySel: boolean) => r2(items.reduce((a, it) => { const p = prices[pk(it.key, sk)]; return a + (p?.price != null && (!onlySel || p.selected) ? p.price * it.qty : 0); }, 0));
  const name = (pid: string) => partners.find(([v]) => v === pid)?.[1] ?? "?";
  const payload = () => ({ id, dueDate: due || null, notes: obs, items: items.map((i) => ({ id: i.key, itemId: i.itemId, qty: i.qty })), suppliers: sups.map((s) => ({ id: s.key, partnerId: s.partnerId, freight: s.freight, paymentTerms: s.paymentTerms, deliveryDays: s.deliveryDays })),
    prices: Object.entries(prices).map(([key, v]) => { const [itemKey, supKey] = key.split("|"); return { itemKey, supKey, price: v.price, selected: v.selected }; }).filter((x) => items.some((i) => i.key === x.itemKey) && sups.some((s) => s.key === x.supKey)) });
  const winners = useMemo(() => items.filter((it) => sups.some((s) => prices[pk(it.key, s.key)]?.selected)).length, [items, sups, prices]);
  return (
    <div className="sheet" style={{ maxWidth: "none" }}>
      <div className="sheet-top"><div className="form f4">
        <div className="fld"><label htmlFor="q_d">Responder até</label><input id="q_d" type="date" value={due} disabled={!open} onChange={(e) => { setDue(e.target.value); setDirty(true); }} /></div>
        <div className="fld span3"><label htmlFor="q_o">Observações</label><input id="q_o" value={obs} disabled={!open} onChange={(e) => { setObs(e.target.value); setDirty(true); }} /></div>
        {open && <div className="fld span2"><label htmlFor="q_s">Incluir fornecedor</label><div style={{ display: "flex", gap: 8 }}>
          <Sel id="q_s" value={add} onChange={(e) => setAdd(e.target.value)}><option value="">Selecione…</option>{partners.filter(([v]) => !sups.some((s) => s.partnerId === v)).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel>
          <button type="button" className="btn" disabled={!add} onClick={() => { setSups([...sups, { key: k(), partnerId: add, freight: 0, paymentTerms: "", deliveryDays: null }]); setAdd(""); setDirty(true); }}>Incluir</button></div></div>}
        {open && <div className="fld" style={{ alignSelf: "end" }}><button type="button" className="btn" onClick={() => setPick(true)}><Icon name="search" size={15} /> Incluir itens</button></div>}
      </div></div>
      <section className="panel sec-panel">
        <h2>Mapa de cotação <span className="n">{items.length} itens · {sups.length} fornecedores · {winners} com vencedor</span>
          {open && <span style={{ marginLeft: "auto" }}><button type="button" className="btn btn-sm" onClick={pickBest} disabled={!sups.length}>Marcar menores preços</button></span>}</h2>
        <div className="tbl solo cmp-t" style={{ border: 0, borderRadius: 0, maxHeight: "none" }}>
          {items.length && sups.length ? (
            <table>
              <thead>
                <tr><th>Item</th><th className="num">Qtd.</th>{sups.map((s) => <th key={s.key} className="num" style={{ minWidth: 170 }}>{name(s.partnerId)}{open && <button type="button" className="mini-btn danger" title="Tirar fornecedor" onClick={() => { setSups(sups.filter((x) => x.key !== s.key)); setDirty(true); }}><Icon name="x" size={12} /></button>}</th>)}</tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const b = best(it.key);
                  return (
                    <tr key={it.key}>
                      <td className="desc">{it.name}<div className="muted" style={{ fontSize: 12, fontWeight: 400 }}>{it.code}{open && <> · <button type="button" className="mini-btn danger" title="Tirar item" onClick={() => { setItems(items.filter((x) => x.key !== it.key)); setDirty(true); }}><Icon name="x" size={11} /></button></>}</div></td>
                      <td className="num">{open ? <input type="number" min={0} step="any" value={it.qty} onChange={(e) => { setItems(items.map((x) => x.key === it.key ? { ...x, qty: Number(e.target.value) || 0 } : x)); setDirty(true); }} style={{ width: 90 }} aria-label="Quantidade" /> : qf(it.qty)} {it.unit}</td>
                      {sups.map((s) => {
                        const p = prices[pk(it.key, s.key)];
                        return (
                          <td key={s.key} className={`num${b === s.key ? " best" : ""}`}>
                            <label>
                              <input type="checkbox" checked={!!p?.selected} disabled={!open || p?.price == null} onChange={() => choose(it.key, s.key)} title="Vencedor deste item" aria-label="Vencedor" />
                              {open ? <input type="number" min={0} step="any" value={p?.price ?? ""} placeholder="preço" onChange={(e) => setP(it.key, s.key, { price: e.target.value === "" ? null : Number(e.target.value) })} aria-label={`Preço de ${name(s.partnerId)}`} />
                                : <span>{p?.price != null ? brl(p.price) : "—"}</span>}
                            </label>
                            {p?.price != null && <div className="muted" style={{ fontSize: 11.5 }}>{brl(p.price * it.qty)}</div>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr><td>Frete</td><td />{sups.map((s) => <td key={s.key} className="num">{open ? <input type="number" min={0} step="any" value={s.freight} onChange={(e) => { setSups(sups.map((x) => x.key === s.key ? { ...x, freight: Number(e.target.value) || 0 } : x)); setDirty(true); }} style={{ width: 110, height: 28, textAlign: "right" }} aria-label="Frete" /> : brl(s.freight)}</td>)}</tr>
                <tr><td>Prazo de entrega (dias)</td><td />{sups.map((s) => <td key={s.key} className="num">{open ? <input type="number" min={0} value={s.deliveryDays ?? ""} onChange={(e) => { setSups(sups.map((x) => x.key === s.key ? { ...x, deliveryDays: e.target.value === "" ? null : Number(e.target.value) } : x)); setDirty(true); }} style={{ width: 80, height: 28, textAlign: "right" }} aria-label="Prazo" /> : s.deliveryDays ?? "—"}</td>)}</tr>
                <tr><td>Condição de pagamento</td><td />{sups.map((s) => <td key={s.key} className="num">{open ? <input value={s.paymentTerms} onChange={(e) => { setSups(sups.map((x) => x.key === s.key ? { ...x, paymentTerms: e.target.value } : x)); setDirty(true); }} style={{ width: 130, height: 28 }} aria-label="Condição" /> : s.paymentTerms || "—"}</td>)}</tr>
                <tr><td>Total cotado</td><td />{sups.map((s) => <td key={s.key} className="num">{brl(supTotal(s.key, false) + s.freight)}</td>)}</tr>
                <tr><td>Total dos vencedores</td><td />{sups.map((s) => <td key={s.key} className="num"><b>{brl(supTotal(s.key, true))}</b></td>)}</tr>
              </tfoot>
            </table>
          ) : <div className="empty-inline">{!items.length ? "Inclua os itens a cotar." : "Inclua pelo menos um fornecedor."}</div>}
        </div>
      </section>
      {open && <div className="sticky-foot">
        <Link className="btn left" href="/compras/cotacoes">Voltar</Link>
        <button type="button" className="btn" disabled={pending || !dirty} onClick={() => run(() => saveQuotationAction(payload()), () => setDirty(false))}>Salvar cotação</button>
        <button type="button" className="btn btn-primary" disabled={pending || !winners} onClick={async () => {
          if (!confirm("Concluir a cotação? Será criado um pedido de compra (rascunho) para cada fornecedor vencedor.")) return;
          const r = await saveQuotationAction(payload());
          if (r.error) { toast(r.error, true); return; }
          run(() => concludeQuotationAction(id));
        }}><Icon name="check" size={16} /> Concluir e gerar pedidos</button>
      </div>}
      {pick && <ItemPicker title="Itens a cotar" onClose={() => setPick(false)} priceLabel="Custo médio" priceOf={(r) => r.cost}
        onPick={(rows) => { setItems([...items, ...rows.filter((r) => !items.some((i) => i.itemId === r.id)).map((r) => ({ key: k(), itemId: r.id, code: r.code, name: r.name, unit: r.unit, qty: r.qty || 1 }))]); setDirty(true); setPick(false); }} />}
    </div>
  );
}

// ------------------------------------------------------------------ Pedido de compra
export type POLine = { key: string; itemId: string; code: string; name: string; unit: string; qty: number; price: number; discountPct: number; received: number };
export type POData = { id?: string; status: string; partnerId: string; issueDate: string; deliveryDate: string; buyer: string; paymentMethodId: string; paymentTermId: string; installments: Inst[]; discount: number; freight: number; notes: string; lines: POLine[] };
export function PurchaseOrderEditor({ data, suppliers, methods, terms, canEdit }: { data: POData; suppliers: Opt[]; methods: Opt[]; terms: { id: string; name: string; days: number[] }[]; canEdit: boolean }) {
  const [d, setD] = useState(data);
  const [manual, setManual] = useState(!!data.id && data.installments.length > 0);
  const [pick, setPick] = useState(false);
  const { run, pending } = useRun();
  const received = ["RECEBIDO", "RECEBIDO_PARCIAL"].includes(d.status);
  const ro = !canEdit || received || d.status === "CANCELADO";
  const set = (p: Partial<POData>) => setD({ ...d, ...p });
  const t = docTotals(d.lines, d.discount, d.freight);
  const term = terms.find((x) => x.id === d.paymentTermId);
  const auto = installments(t.total, term?.days ?? [28], d.deliveryDate || d.issueDate);
  const inst = manual ? d.installments : auto;
  const save = (status?: string) => run(() => savePurchaseOrderAction({ id: d.id, partnerId: d.partnerId, status: (status ?? (received ? "ENVIADO" : d.status)) as "ENVIADO", issueDate: d.issueDate, deliveryDate: d.deliveryDate || null, buyer: d.buyer,
    paymentMethodId: d.paymentMethodId || null, paymentTermId: d.paymentTermId || null, installments: inst, discount: d.discount, freight: d.freight, notes: d.notes,
    items: d.lines.map((l) => ({ itemId: l.itemId, qty: l.qty, price: l.price, discountPct: l.discountPct })) }), () => { if (status) set({ status }); });
  return (
    <div className="sheet">
      {received && <div className="infoline" style={{ margin: 0 }}>Pedido com recebimento registrado: itens e valores ficam travados. Você ainda pode receber o saldo.</div>}
      <div className="sheet-top"><div className="form f4">
        <div className="fld span2"><label htmlFor="po_p">Fornecedor <span className="req">*</span></label><Sel id="po_p" value={d.partnerId} disabled={ro} onChange={(e) => set({ partnerId: e.target.value })}><option value="">Selecione…</option>{suppliers.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel></div>
        <div className="fld span2"><span className="flabel">Situação</span>
          <div className="seg" role="group">{[["RASCUNHO", "Rascunho"], ["ENVIADO", "Enviado"], ["CANCELADO", "Cancelado"]].map(([v, l]) => <button key={v} type="button" aria-pressed={d.status === v} disabled={!canEdit || received} onClick={() => set({ status: v })}>{l}</button>)}
            {received && <button type="button" aria-pressed>{d.status === "RECEBIDO" ? "Recebido" : "Recebido parcial"}</button>}</div></div>
        <div className="fld"><label htmlFor="po_b">Comprador</label><input id="po_b" value={d.buyer} disabled={ro} onChange={(e) => set({ buyer: e.target.value })} /></div>
        <div className="fld"><label htmlFor="po_e">Emissão</label><input id="po_e" type="date" value={d.issueDate} disabled={ro} onChange={(e) => set({ issueDate: e.target.value })} /></div>
        <div className="fld"><label htmlFor="po_c">Previsão de chegada</label><input id="po_c" type="date" value={d.deliveryDate} disabled={!canEdit} onChange={(e) => set({ deliveryDate: e.target.value })} /></div>
      </div></div>
      <section className="panel sec-panel">
        <h2>Itens <span className="n">{d.lines.length}</span>{!ro && <span style={{ marginLeft: "auto" }}><button type="button" className="btn btn-sm btn-primary" onClick={() => setPick(true)}><Icon name="search" size={14} /> Pesquisar itens</button></span>}</h2>
        <div className="tbl solo items-t" style={{ border: 0, borderRadius: 0 }}><table>
          <thead><tr><th>Código</th><th>Item</th><th>Un.</th><th className="num" style={{ width: 110 }}>Qtd.</th><th className="num" style={{ width: 130 }}>Custo unit.</th><th className="num" style={{ width: 90 }}>Desc. %</th><th className="num">Total</th><th className="num">Recebido</th><th style={{ width: 40 }} /></tr></thead>
          <tbody>{d.lines.length ? d.lines.map((l) => (
            <tr key={l.key}><td className="code">{l.code}</td><td className="desc">{l.name}</td><td>{l.unit}</td>
              <td><input type="number" min={0} step="any" value={l.qty} disabled={ro} onChange={(e) => set({ lines: d.lines.map((x) => x.key === l.key ? { ...x, qty: Number(e.target.value) || 0 } : x) })} aria-label="Quantidade" /></td>
              <td><input type="number" min={0} step="any" value={l.price} disabled={ro} onChange={(e) => set({ lines: d.lines.map((x) => x.key === l.key ? { ...x, price: Number(e.target.value) || 0 } : x) })} aria-label="Custo" /></td>
              <td><input type="number" min={0} max={100} step="any" value={l.discountPct} disabled={ro} onChange={(e) => set({ lines: d.lines.map((x) => x.key === l.key ? { ...x, discountPct: Number(e.target.value) || 0 } : x) })} aria-label="Desconto" /></td>
              <td className="num"><b>{brl(l.qty * l.price * (1 - l.discountPct / 100))}</b></td>
              <td className="num">{qf(l.received)}</td>
              <td>{!ro && <button type="button" className="btn btn-ghost btn-sm" aria-label="Remover" onClick={() => set({ lines: d.lines.filter((x) => x.key !== l.key) })}><Icon name="x" size={14} /></button>}</td></tr>))
            : <tr><td colSpan={9}><div className="empty-inline">Nenhum item. Use “Pesquisar itens”.</div></td></tr>}</tbody>
        </table></div>
      </section>
      <section className="panel sec-panel"><h2>Financeiro</h2><div className="pb"><div className="doc-bottom" style={{ marginTop: 0 }}>
        <div>
          <div className="form">
            <div className="fld"><label htmlFor="po_f">Forma de pagamento</label><Sel id="po_f" value={d.paymentMethodId} disabled={ro} onChange={(e) => set({ paymentMethodId: e.target.value })}><option value="">Selecione…</option>{methods.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel></div>
            <div className="fld"><label htmlFor="po_t">Condição</label><Sel id="po_t" value={d.paymentTermId} disabled={ro} onChange={(e) => { set({ paymentTermId: e.target.value }); setManual(false); }}><option value="">28 dias</option>{terms.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Sel></div>
          </div>
          <div className="parc-h"><span className="flabel" style={{ margin: 0 }}>Parcelas previstas</span>{!ro && manual && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setManual(false)}>Recalcular</button>}</div>
          <table className="parc"><thead><tr><th>Nº</th><th>Vencimento</th><th className="num">Valor</th></tr></thead>
            <tbody>{inst.map((p, i) => <tr key={i}><td>{p.n}/{inst.length}</td><td><input type="date" value={p.due} disabled={ro} onChange={(e) => { const a = inst.map((x) => ({ ...x })); a[i].due = e.target.value; set({ installments: a }); setManual(true); }} /></td>
              <td><input type="number" step="any" value={p.value} disabled={ro} onChange={(e) => { const a = inst.map((x) => ({ ...x })); a[i].value = Number(e.target.value) || 0; set({ installments: a }); setManual(true); }} /></td></tr>)}</tbody></table>
          <small className="muted" style={{ display: "block", marginTop: 6 }}>As contas a pagar são criadas no primeiro recebimento, com vencimentos contados da data em que a mercadoria chegou.</small>
        </div>
        <div className="totals"><dl>
          <div><dt>Soma dos itens</dt><dd>{brl(t.gross)}</dd></div><div><dt>Descontos nos itens</dt><dd>− {brl(t.itemsDiscount)}</dd></div>
          <div><dt>Desconto geral (R$)</dt><dd><input type="number" step="any" min={0} value={d.discount} disabled={ro} onChange={(e) => set({ discount: Number(e.target.value) || 0 })} /></dd></div>
          <div><dt>Frete (R$)</dt><dd><input type="number" step="any" min={0} value={d.freight} disabled={ro} onChange={(e) => set({ freight: Number(e.target.value) || 0 })} /></dd></div>
          <div className="big"><dt>Total</dt><dd>{brl(t.total)}</dd></div>
        </dl></div>
      </div></div></section>
      <section className="panel sec-panel"><h2>Observações</h2><div className="pb"><textarea rows={3} value={d.notes} disabled={!canEdit} onChange={(e) => set({ notes: e.target.value })} aria-label="Observações" /></div></section>
      {canEdit && <div className="sticky-foot">
        <Link className="btn left" href="/compras/pedidos">Voltar</Link>
        {!received && d.status === "RASCUNHO" && d.id && <button type="button" className="btn" disabled={pending} onClick={() => save("ENVIADO")}>Salvar e marcar como enviado</button>}
        <button type="button" className="btn btn-primary" disabled={pending || !d.partnerId || !d.lines.length} onClick={() => save()}>{pending ? "Salvando…" : d.id ? "Salvar pedido" : "Criar pedido"}</button>
      </div>}
      {pick && <ItemPicker title="Itens do pedido de compra" priceLabel="Custo médio" priceOf={(r) => r.cost} onClose={() => setPick(false)}
        onPick={(rows) => { set({ lines: [...d.lines, ...rows.map((r) => ({ key: k(), itemId: r.id, code: r.code, name: r.name, unit: r.unit, qty: r.qty || 1, price: Math.round(r.cost * 100) / 100, discountPct: 0, received: 0 }))] }); setPick(false); }} />}
    </div>
  );
}

export function ReceiveButton({ poId, lines, locations, defaultLocation }: { poId: string; lines: { id: string; name: string; unit: string; qty: number; received: number; price: number }[]; locations: Opt[]; defaultLocation: string }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ invoice: "", date: today(), loc: defaultLocation });
  const [q, setQ] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((l) => [l.id, String(Math.max(0, l.qty - l.received))])));
  const { run, pending } = useRun();
  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}><Icon name="in" size={16} /> Receber</button>
      {open && <Modal title="Registrar recebimento" size="wide" onClose={() => setOpen(false)}
        foot={<><button type="button" className="btn" onClick={() => setOpen(false)}>Cancelar</button><button type="button" className="btn btn-primary" disabled={pending}
          onClick={() => run(() => receivePurchaseAction({ id: poId, invoice: f.invoice, date: f.date, locationId: f.loc, lines: lines.map((l) => ({ lineId: l.id, qty: Number((q[l.id] ?? "0").replace(",", ".")) || 0 })) }), () => setOpen(false))}>Registrar recebimento</button></>}>
        <div className="form">
          <div className="fld"><label htmlFor="rc_n">Nota fiscal do fornecedor</label><input id="rc_n" value={f.invoice} onChange={(e) => setF({ ...f, invoice: e.target.value })} placeholder="Ex.: 4582" /></div>
          <div className="fld"><label htmlFor="rc_d">Data do recebimento</label><input id="rc_d" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
          <div className="fld full"><label htmlFor="rc_l">Local de entrada</label><Sel id="rc_l" value={f.loc} onChange={(e) => setF({ ...f, loc: e.target.value })}>{locations.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel></div>
        </div>
        <div className="tbl solo" style={{ marginTop: 14 }}><table>
          <thead><tr><th>Item</th><th className="num">Pedido</th><th className="num">Já recebido</th><th className="num" style={{ width: 140 }}>Receber agora</th><th className="num">Custo unit.</th></tr></thead>
          <tbody>{lines.map((l) => <tr key={l.id}><td className="desc">{l.name}</td><td className="num">{qf(l.qty)} {l.unit}</td><td className="num">{qf(l.received)}</td>
            <td><input inputMode="decimal" value={q[l.id] ?? ""} onChange={(e) => setQ({ ...q, [l.id]: e.target.value })} aria-label="Quantidade recebida" /></td><td className="num">{brl(l.price)}</td></tr>)}</tbody>
        </table></div>
        <p className="muted" style={{ fontSize: 12.5 }}>Cada item recebido dá entrada no estoque pelo custo do pedido. No primeiro recebimento são criadas as contas a pagar.</p>
      </Modal>}
    </>
  );
}
