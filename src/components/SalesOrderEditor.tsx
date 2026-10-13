"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import { ItemPicker } from "./ItemPicker";
import { PickField } from "./SearchPicker";
import { searchPartnersAction } from "@/server/search-actions";
import { useRun } from "./client";
import { saveSalesOrderAction, type SOInput } from "@/server/sales-actions";
import { addDays, docTotals, installments, r2, type Inst } from "@/lib/dates";
import { PROD_STATUS } from "@/lib/consts";

export type Line = { key: string; itemId: string; code: string; name: string; unit: string; qty: number; price: number; discountPct: number; notes: string };
export type CustomField = { id: string; label: string; type: string; options: string[]; required: boolean };
export type SOData = {
  id?: string; number?: number; status: string; productionStatus: string | null; partnerId: string; partnerLabel: string; salespersonId: string; issueDate: string; deliveryDate: string;
  deliveryPlace: string; paymentMethodId: string; paymentTermId: string; installments: Inst[]; discount: number; freight: number;
  notes: string; internalNotes: string; custom: Record<string, string>; lines: Line[];
};
type Opt = [string, string];

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
let seq = 0;
const key = () => `l${++seq}`;

export function SalesOrderEditor({ data, sellers, methods, terms, fields, locked, canEdit }: {
  data: SOData; sellers: Opt[]; methods: Opt[]; terms: { id: string; name: string; days: number[] }[];
  fields: CustomField[]; locked: boolean; canEdit: boolean;
}) {
  const [d, setD] = useState<SOData>(data);
  const [manualInst, setManualInst] = useState(!!data.id && data.installments.length > 0);
  // condição "Manual": as parcelas são lançadas uma a uma (quantidade, datas e valores livres)
  const [manualTerm, setManualTerm] = useState(!!data.id && !data.paymentTermId && data.installments.length > 0);
  const [pick, setPick] = useState(false);
  const { run, pending } = useRun();
  const ro = locked || !canEdit;
  const set = (patch: Partial<SOData>) => setD((x) => ({ ...x, ...patch }));
  const t = useMemo(() => docTotals(d.lines, d.discount, d.freight), [d.lines, d.discount, d.freight]);
  const term = terms.find((x) => x.id === d.paymentTermId);
  const autoInst = useMemo(() => installments(t.total, term?.days ?? [0], d.deliveryDate || d.issueDate), [t.total, term, d.deliveryDate, d.issueDate]);
  const inst = manualInst || manualTerm ? d.installments : autoInst;
  const setInst = (a: Inst[]) => { set({ installments: a.map((x, i) => ({ ...x, n: i + 1 })) }); setManualInst(true); };
  const instSum = r2(inst.reduce((a, p) => a + p.value, 0));
  const setLine = (k: string, patch: Partial<Line>) => set({ lines: d.lines.map((l) => (l.key === k ? { ...l, ...patch } : l)) });

  const save = (status?: string) => {
    const payload: SOInput = {
      id: d.id, partnerId: d.partnerId, salespersonId: d.salespersonId || null, issueDate: d.issueDate, deliveryDate: d.deliveryDate || null,
      deliveryPlace: d.deliveryPlace, status: (status ?? d.status) as SOInput["status"], paymentMethodId: d.paymentMethodId || null, paymentTermId: d.paymentTermId || null,
      installments: inst, discount: d.discount, freight: d.freight, notes: d.notes, internalNotes: d.internalNotes, custom: d.custom,
      items: d.lines.map((l) => ({ itemId: l.itemId, qty: l.qty, price: l.price, discountPct: l.discountPct, notes: l.notes })),
    };
    run(() => saveSalesOrderAction(payload), () => { if (status) set({ status }); });
  };

  return (
    <div className="sheet">
      <nav className="sec-nav" aria-label="Sessões do pedido">
        <a href="#itens">Itens</a><a href="#financeiro">Financeiro</a><a href="#observacoes">Observações</a>{fields.length > 0 && <a href="#campos">Campos personalizados</a>}{d.id && <a href="#anexos">Anexos</a>}
      </nav>
      {locked && <div className="infoline" style={{ margin: 0 }}>{d.status === "FATURADO" ? "Pedido faturado: os dados ficam travados. Para alterar, cancele a nota em Faturamento." : "Pedido cancelado. Para reabrir, mude a situação para Proposta."}</div>}

      <div className="sheet-top">
        <div className="form f4">
          <PickField id="so_p" className="fld span2" label="Cliente" req disabled={ro} emptyText="Pesquise o cliente…"
            value={d.partnerId ? { id: d.partnerId, label: d.partnerLabel } : null}
            onChange={(r) => r && set({ partnerId: r.id, partnerLabel: r.label, deliveryPlace: d.deliveryPlace || r.data?.place || "", salespersonId: d.salespersonId || r.data?.salespersonId || "" })}
            picker={{ title: "Pesquisar cliente", fetcher: searchPartnersAction, filter: "Cliente", lockFilter: true, placeholder: "Nome, fantasia, CNPJ/CPF ou cidade",
              columns: ["Nome", "Razão social", "CNPJ/CPF", "Cidade", "Telefone"] }} />
          <div className="fld span2">
            <span className="flabel">Situação</span>
            <div className="seg" role="group" aria-label="Situação">
              {[["PROPOSTA", "Proposta"], ["APROVADO", "Aprovado"], ["CANCELADO", "Cancelado"]].map(([v, l]) => (
                <button key={v} type="button" aria-pressed={d.status === v} disabled={!canEdit || d.status === "FATURADO"} onClick={() => set({ status: v })}>{l}</button>
              ))}
              {d.status === "FATURADO" && <button type="button" aria-pressed>Faturado</button>}
            </div>
          </div>
          <div className="fld"><label htmlFor="so_v">Vendedor</label><select id="so_v" value={d.salespersonId} disabled={ro} onChange={(e) => set({ salespersonId: e.target.value })}><option value="">Nenhum</option>{sellers.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div className="fld"><label htmlFor="so_e">Emissão</label><input id="so_e" type="date" value={d.issueDate} disabled={ro} onChange={(e) => set({ issueDate: e.target.value })} /></div>
          <div className="fld"><label htmlFor="so_en">Entrega prevista</label><input id="so_en" type="date" value={d.deliveryDate} disabled={ro} onChange={(e) => set({ deliveryDate: e.target.value })} /></div>
          <div className="fld"><span className="flabel">Produção</span>
            <div style={{ height: 36, display: "flex", alignItems: "center" }}>{d.productionStatus ? <span className="badge stat-badge" style={{ ["--c" as string]: PROD_STATUS[d.productionStatus]?.color }}>{PROD_STATUS[d.productionStatus]?.label}</span> : <span className="muted" style={{ fontSize: 13 }}>Entra na fila ao aprovar</span>}</div>
          </div>
          <div className="fld full"><label htmlFor="so_l">Local de entrega</label><input id="so_l" value={d.deliveryPlace} disabled={ro} onChange={(e) => set({ deliveryPlace: e.target.value })} placeholder="Endereço, cidade ou “Retira na fábrica”" /></div>
        </div>
      </div>

      <section className="panel sec-panel" id="itens">
        <h2>Itens <span className="n">{d.lines.length}</span>{!ro && <span style={{ marginLeft: "auto" }}><button type="button" className="btn btn-sm btn-primary" onClick={() => setPick(true)}><Icon name="search" size={14} /> Pesquisar itens</button></span>}</h2>
        <div className="tbl solo items-t" style={{ border: 0, borderRadius: 0 }}>
          <table>
            <thead><tr><th>Código</th><th>Descrição</th><th>Un.</th><th className="num" style={{ width: 110 }}>Qtd.</th><th className="num" style={{ width: 130 }}>Preço unit.</th><th className="num" style={{ width: 90 }}>Desc. %</th><th className="num" style={{ width: 130 }}>Total</th><th style={{ width: 40 }} /></tr></thead>
            <tbody>
              {d.lines.length ? d.lines.map((l) => (
                <tr key={l.key}>
                  <td className="code">{l.code}</td>
                  <td className="desc">{l.name}{!ro ? <input value={l.notes} onChange={(e) => setLine(l.key, { notes: e.target.value })} placeholder="Observação do item (opcional)" style={{ height: 26, marginTop: 4, fontSize: 12 }} aria-label="Observação do item" /> : l.notes && <div className="muted" style={{ fontSize: 12, fontWeight: 400 }}>{l.notes}</div>}</td>
                  <td>{l.unit}</td>
                  <td><input type="number" step="any" min={0} value={l.qty} disabled={ro} onChange={(e) => setLine(l.key, { qty: Number(e.target.value) || 0 })} aria-label="Quantidade" /></td>
                  <td><input type="number" step="any" min={0} value={l.price} disabled={ro} onChange={(e) => setLine(l.key, { price: Number(e.target.value) || 0 })} aria-label="Preço" /></td>
                  <td><input type="number" step="any" min={0} max={100} value={l.discountPct} disabled={ro} onChange={(e) => setLine(l.key, { discountPct: Number(e.target.value) || 0 })} aria-label="Desconto" /></td>
                  <td className="num"><b>{brl(l.qty * l.price * (1 - l.discountPct / 100))}</b></td>
                  <td>{!ro && <button type="button" className="btn btn-ghost btn-sm" aria-label="Remover item" onClick={() => set({ lines: d.lines.filter((x) => x.key !== l.key) })}><Icon name="x" size={14} /></button>}</td>
                </tr>
              )) : <tr><td colSpan={8}><div className="empty-inline">Nenhum item. Use “Pesquisar itens” para abrir a tela de itens e selecionar o que vai no pedido.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel sec-panel" id="financeiro">
        <h2>Financeiro</h2>
        <div className="pb">
          <div className="doc-bottom" style={{ marginTop: 0 }}>
            <div>
              <div className="form">
                <div className="fld"><label htmlFor="so_f">Forma de pagamento</label><select id="so_f" value={d.paymentMethodId} disabled={ro} onChange={(e) => set({ paymentMethodId: e.target.value })}><option value="">Selecione…</option>{methods.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                <div className="fld"><label htmlFor="so_c">Condição</label>
                  <select id="so_c" value={manualTerm ? "__manual" : d.paymentTermId} disabled={ro} onChange={(e) => {
                    if (e.target.value === "__manual") { set({ paymentTermId: "", installments: inst.map((x) => ({ ...x })) }); setManualTerm(true); setManualInst(true); return; }
                    set({ paymentTermId: e.target.value }); setManualTerm(false); setManualInst(false);
                  }}>
                    {!d.paymentTermId && !manualTerm && <option value="">Selecione…</option>}
                    {terms.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    <option value="__manual">Manual (lançar as parcelas)</option>
                  </select></div>
              </div>
              <div className="parc-h"><span className="flabel" style={{ margin: 0 }}>Parcelas</span>
                {!ro && manualTerm && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { const last = inst[inst.length - 1]; const rest = r2(t.total - instSum); setInst([...inst, { n: inst.length + 1, due: last ? addDays(last.due, 30) : (d.deliveryDate || d.issueDate), value: rest > 0 ? rest : 0 }]); }}><Icon name="plus" size={14} /> Adicionar parcela</button>}
                {!ro && manualInst && !manualTerm && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setManualInst(false)}>Recalcular</button>}</div>
              <table className="parc">
                <thead><tr><th>Nº</th><th>Vencimento</th><th className="num">Valor (R$)</th>{manualTerm && !ro && <th />}</tr></thead>
                <tbody>{inst.map((p, i) => (
                  <tr key={i}><td>{p.n}/{inst.length}</td>
                    <td><input type="date" value={p.due} disabled={ro} onChange={(e) => { const a = inst.map((x) => ({ ...x })); a[i].due = e.target.value; set({ installments: a }); setManualInst(true); }} aria-label="Vencimento" /></td>
                    <td><input type="number" step="any" value={p.value} disabled={ro} onChange={(e) => { const a = inst.map((x) => ({ ...x })); a[i].value = Number(e.target.value) || 0; set({ installments: a }); setManualInst(true); }} aria-label="Valor" /></td>
                    {manualTerm && !ro && <td><button type="button" className="btn btn-ghost btn-sm" aria-label={`Remover parcela ${p.n}`} onClick={() => setInst(inst.filter((_, j) => j !== i))}><Icon name="x" size={14} /></button></td>}</tr>))}
                  {!inst.length && <tr><td colSpan={4} className="muted" style={{ fontSize: 12.5 }}>Nenhuma parcela. Use “Adicionar parcela”.</td></tr>}</tbody>
              </table>
              {Math.abs(instSum - t.total) > 0.01 && <div className="warnline">A soma das parcelas ({brl(instSum)}) difere do total ({brl(t.total)}).</div>}
              <small className="muted" style={{ display: "block", marginTop: 6 }}>{manualTerm ? "Parcelas lançadas à mão: ajuste as datas e os valores até a soma bater com o total." : "Vencimentos contados da entrega prevista. Ao faturar, são recalculados pela data da nota."}</small>
            </div>
            <div className="totals">
              <dl>
                <div><dt>Soma dos itens</dt><dd>{brl(t.gross)}</dd></div>
                <div><dt>Descontos nos itens</dt><dd>− {brl(t.itemsDiscount)}</dd></div>
                <div><dt><label htmlFor="so_dg">Desconto geral (R$)</label></dt><dd><input id="so_dg" type="number" step="any" min={0} value={d.discount} disabled={ro} onChange={(e) => set({ discount: Number(e.target.value) || 0 })} /></dd></div>
                <div><dt><label htmlFor="so_fr">Frete (R$)</label></dt><dd><input id="so_fr" type="number" step="any" min={0} value={d.freight} disabled={ro} onChange={(e) => set({ freight: Number(e.target.value) || 0 })} /></dd></div>
                <div className="big"><dt>Total</dt><dd>{brl(t.total)}</dd></div>
              </dl>
            </div>
          </div>
        </div>
      </section>

      <section className="panel sec-panel" id="observacoes">
        <h2>Observações</h2>
        <div className="pb"><div className="form">
          <div className="fld"><label htmlFor="so_o">Observações para o cliente</label><textarea id="so_o" rows={3} value={d.notes} disabled={ro} onChange={(e) => set({ notes: e.target.value })} /><small>Saem na impressão da proposta e do pedido.</small></div>
          <div className="fld"><label htmlFor="so_oi">Observações internas</label><textarea id="so_oi" rows={3} value={d.internalNotes} disabled={ro} onChange={(e) => set({ internalNotes: e.target.value })} /><small>Só aparecem aqui e para a produção.</small></div>
        </div></div>
      </section>

      {fields.length > 0 && (
        <section className="panel sec-panel" id="campos">
          <h2>Campos personalizados</h2>
          <div className="pb"><div className="form f3">
            {fields.map((f) => {
              const v = d.custom[f.id] ?? "";
              const on = (x: string) => set({ custom: { ...d.custom, [f.id]: x } });
              const lab = <label htmlFor={`cf_${f.id}`}>{f.label}{f.required && <span className="req"> *</span>}</label>;
              if (f.type === "lista") return <div key={f.id} className="fld">{lab}<select id={`cf_${f.id}`} value={v} disabled={ro} onChange={(e) => on(e.target.value)}><option value="">Selecione…</option>{f.options.map((o) => <option key={o}>{o}</option>)}</select></div>;
              if (f.type === "sim_nao") return <div key={f.id} className="fld">{lab}<select id={`cf_${f.id}`} value={v} disabled={ro} onChange={(e) => on(e.target.value)}><option value="">—</option><option>Sim</option><option>Não</option></select></div>;
              return <div key={f.id} className="fld">{lab}<input id={`cf_${f.id}`} type={f.type === "data" ? "date" : "text"} inputMode={f.type === "numero" ? "decimal" : undefined} value={v} disabled={ro} onChange={(e) => on(e.target.value)} /></div>;
            })}
          </div></div>
        </section>
      )}

      {canEdit && (
        <div className="sticky-foot">
          <Link className="btn left" href="/pedidos">Voltar</Link>
          {!locked && d.status === "PROPOSTA" && d.id && <button type="button" className="btn" disabled={pending} onClick={() => save("APROVADO")}><Icon name="check" size={16} /> Salvar e aprovar</button>}
          {!locked && <button type="button" className="btn btn-primary" disabled={pending || !d.partnerId} onClick={() => save()}>{pending ? "Salvando…" : d.id ? "Salvar" : d.status === "PROPOSTA" ? "Criar proposta" : "Criar pedido"}</button>}
        </div>
      )}

      {pick && <ItemPicker title="Selecionar itens do pedido" onClose={() => setPick(false)} priceLabel="Preço de venda"
        onPick={(rows) => { set({ lines: [...d.lines, ...rows.map((r) => ({ key: key(), itemId: r.id, code: r.code, name: r.name, unit: r.unit, qty: r.qty || 1, price: r.price, discountPct: 0, notes: "" }))] }); setPick(false); }} />}
    </div>
  );
}
