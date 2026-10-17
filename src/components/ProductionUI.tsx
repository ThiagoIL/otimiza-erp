"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { ActionButton, Modal, useRun } from "./client";
import { ItemPicker } from "./ItemPicker";
import { PickField, PlaceField, Sel } from "./SearchPicker";
import { searchPartnersAction } from "@/server/search-actions";
import { toast } from "./Toast";
import {
  addComponentsAction, createAssemblyFromOpAction, generateOpsAction, importOpsAction, moveOpAction, noProductionAction, removeComponentAction, reportOutputAction,
  requisitionAction, saveOpAction, setComponentDoneAction, setComponentSupplyAction,
} from "@/server/production-actions";
import { PRIORITIES } from "@/lib/consts";
import { CustomFieldsForm, ImportSheet, type CField } from "./MeasurementUI";
import { fmtD, today } from "@/lib/dates";

type Opt = [string, string];
const qf = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const ini = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

// ------------------------------------------------------------------ Fila de pedidos aprovados
export type QueueOrder = { id: string; number: number; client: string; delivery: string | null; notes: string | null; lines: { itemId: string; code: string; name: string; unit: string; qty: number; fab: boolean }[] };

export function QueueActions({ order, centers, team }: { order: QueueOrder; centers: Opt[]; team: Opt[] }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(() => Object.fromEntries(order.lines.map((l, i) => [i, { on: l.fab, qty: l.qty }])));
  const [f, setF] = useState({ workCenterId: "", responsibleId: "", priority: "Normal", needDate: order.delivery ?? "" });
  const { run, pending } = useRun();
  return (
    <>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}><Icon name="factory" size={14} /> Gerar OP</button>
      <ActionButton className="btn btn-sm" confirm={`O pedido ${order.number} não precisa de produção (ex.: venda de peça do estoque)? Ele sai da fila e segue para faturamento.`} action={() => noProductionAction(order.id)}>Não precisa de produção</ActionButton>
      {open && (
        <Modal title={`Gerar ordens de produção · pedido ${order.number}`} size="wide" onClose={() => setOpen(false)}
          foot={<><button type="button" className="btn" onClick={() => setOpen(false)}>Cancelar</button>
            <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(() => generateOpsAction({
              orderId: order.id, lines: order.lines.map((l, i) => ({ itemId: l.itemId, qty: sel[i].qty, on: sel[i].on })).filter((x) => x.on && x.qty > 0).map(({ itemId, qty }) => ({ itemId, qty })),
              workCenterId: f.workCenterId || null, responsibleId: f.responsibleId || null, priority: f.priority as "Normal", needDate: f.needDate || null }), () => setOpen(false))}>Gerar ordens de produção</button></>}>
          <p className="muted" style={{ marginTop: 0 }}>Cada item marcado vira uma OP ligada ao pedido, com o cliente, a data de entrega e a estrutura do produto já preenchidos.</p>
          <div className="tbl solo"><table>
            <thead><tr><th className="chk-cell" /><th>Item</th><th className="num" style={{ width: 130 }}>Quantidade</th></tr></thead>
            <tbody>{order.lines.map((l, i) => (
              <tr key={i}><td><input type="checkbox" checked={sel[i].on} onChange={(e) => setSel({ ...sel, [i]: { ...sel[i], on: e.target.checked } })} aria-label="Gerar OP" /></td>
                <td className="desc">{l.name}<div className="muted" style={{ fontSize: 12, fontWeight: 400 }}>{l.code}{!l.fab && " · item comprado (normalmente não gera OP)"}</div></td>
                <td><input type="number" min={0} step="any" value={sel[i].qty} onChange={(e) => setSel({ ...sel, [i]: { ...sel[i], qty: Number(e.target.value) || 0 } })} aria-label="Quantidade" /></td></tr>))}</tbody>
          </table></div>
          <div className="form f4" style={{ marginTop: 14 }}>
            <div className="fld"><label htmlFor="g_c">Centro de trabalho</label><Sel id="g_c" value={f.workCenterId} onChange={(e) => setF({ ...f, workCenterId: e.target.value })}><option value="">Nenhum</option>{centers.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel></div>
            <div className="fld"><label htmlFor="g_r">Responsável</label><Sel id="g_r" value={f.responsibleId} onChange={(e) => setF({ ...f, responsibleId: e.target.value })}><option value="">Nenhum</option>{team.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel></div>
            <div className="fld"><label htmlFor="g_p">Prioridade</label><select id="g_p" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{Object.keys(PRIORITIES).map((p) => <option key={p}>{p}</option>)}</select></div>
            <div className="fld"><label htmlFor="g_n">Data de necessidade</label><input id="g_n" type="date" value={f.needDate} onChange={(e) => setF({ ...f, needDate: e.target.value })} /></div>
          </div>
        </Modal>
      )}
    </>
  );
}

// ------------------------------------------------------------------ Quadro de OPs
export type OpCard = { id: string; number: number; item: string; qty: number; produced: number; unit: string; client: string | null; order: number | null; center: string | null; resp: string | null;
  priority: string; needDate: string | null; stageId: string; progress: number; live: boolean; work: string | null; custom: Record<string, string> };
export type StageCol = { id: string; name: string; color: string; kind: string };
export type BoardField = { id: string; label: string; onCard: boolean };

/** Informações que podem aparecer no cartão (escolhidas em “Exibir”); os campos da OP entram no fim. */
const BASE_FIELDS: { id: string; label: string }[] = [
  { id: "prioridade", label: "Prioridade" }, { id: "necessidade", label: "Data de necessidade" }, { id: "cliente", label: "Cliente e pedido" }, { id: "obra", label: "Obra" },
  { id: "produzido", label: "Quantidade produzida" }, { id: "centro", label: "Centro de trabalho" }, { id: "responsavel", label: "Responsável" }, { id: "progresso", label: "Progresso" }, { id: "execucao", label: "Em execução agora" },
];
const TAG_COLORS = ["#1E3A5F", "#7A4FA0", "#1F8A8A", "#C2185B", "#2E7D4F", "#8A6D1F", "#2F6E9A", "#C77700", "#B3261E", "#4A5260"];
const tagColor = (v: string) => TAG_COLORS[[...v].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % TAG_COLORS.length];

/** Guarda no navegador o que mostrar no cartão (cada pessoa escolhe o seu). */
function useCardFields(key: string, fields: BoardField[]) {
  const def = useMemo(() => [...BASE_FIELDS.map((f) => f.id), ...fields.filter((f) => f.onCard).map((f) => f.id)], [fields]);
  const [on, setOn] = useState<string[]>(def);
  useEffect(() => {
    try { const v = JSON.parse(localStorage.getItem(`cards.${key}`) ?? "null"); if (Array.isArray(v)) setOn(v.filter((x) => typeof x === "string")); } catch { /* sem armazenamento */ }
  }, [key]);
  const save = (v: string[]) => { setOn(v); try { localStorage.setItem(`cards.${key}`, JSON.stringify(v)); } catch { /* sem armazenamento */ } };
  const reset = () => { setOn(def); try { localStorage.removeItem(`cards.${key}`); } catch { /* sem armazenamento */ } };
  return { on: new Set(on), save, reset };
}

export function CardFieldsMenu({ fields, on, save, reset }: { fields: BoardField[]; on: Set<string>; save: (v: string[]) => void; reset: () => void }) {
  const [open, setOpen] = useState(false);
  const all = [...BASE_FIELDS, ...fields.map((f) => ({ id: f.id, label: f.label }))];
  const toggle = (id: string) => save(on.has(id) ? [...on].filter((x) => x !== id) : [...on, id]);
  return (
    <div className="cf-menu">
      <button type="button" className="btn btn-sm" aria-expanded={open} onClick={() => setOpen(!open)}><Icon name="eye" size={14} /> Exibir no cartão</button>
      {open && (
        <>
          <div className="cf-scrim" onClick={() => setOpen(false)} />
          <div className="cf-pop" role="dialog" aria-label="Informações do cartão">
            <b>O que mostrar no cartão</b>
            {all.map((f, i) => (
              <label key={f.id} className="chk" style={i === BASE_FIELDS.length ? { borderTop: "1px solid var(--line-2)", paddingTop: 8, marginTop: 4 } : undefined}>
                <input type="checkbox" checked={on.has(f.id)} onChange={() => toggle(f.id)} /> {f.label}</label>
            ))}
            {!fields.length && <small className="muted">Campos como Tipo e Pintura: cadastre em Produção › Configurações › Campos da OP.</small>}
            <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>Voltar ao padrão</button>
          </div>
        </>
      )}
    </div>
  );
}

export function OpBoard({ stages, ops, canEdit, fields = [], storageKey = "ops", tv = false, toolbar }: {
  stages: StageCol[]; ops: OpCard[]; canEdit: boolean; fields?: BoardField[]; storageKey?: string; tv?: boolean; toolbar?: ReactNode;
}) {
  const router = useRouter();
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const { run } = useRun();
  const cf = useCardFields(storageKey, fields);
  const show = (k: string) => cf.on.has(k);
  const hoje = today();
  const edit = canEdit && !tv;
  return (
    <>
      <div className="board-bar">{toolbar}<span style={{ marginLeft: "auto" }} /><CardFieldsMenu fields={fields} {...cf} /></div>
      <div className={`kanban${tv ? " tv-kanban" : ""}`}>
        {stages.map((st) => {
          let list = ops.filter((o) => o.stageId === st.id);
          list = st.kind === "finalizada" ? list : list.sort((a, b) => (a.needDate ?? "9").localeCompare(b.needDate ?? "9"));
          return (
            <section key={st.id} className={`col${over === st.id ? " over" : ""}`} style={{ ["--c" as string]: st.color }} aria-label={st.name}
              onDragOver={(e) => { if (!edit) return; e.preventDefault(); setOver(st.id); }} onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); setOver(null); const o = ops.find((x) => x.id === drag); setDrag(null); if (o && o.stageId !== st.id) run(() => moveOpAction(o.id, st.id)); }}>
              <div className="col-h"><span className="dot" style={{ background: st.color }} />{st.name}<span className="n">{list.length}</span></div>
              <div className="col-b">
                {list.map((o) => {
                  const late = o.needDate && o.needDate < hoje && st.kind !== "finalizada" && st.kind !== "cancelada";
                  const tags = fields.filter((f) => show(f.id) && o.custom[f.id]);
                  return (
                    <article key={o.id} className="card" draggable={edit} tabIndex={0} style={{ ["--p" as string]: show("prioridade") ? PRIORITIES[o.priority] ?? "transparent" : "transparent", ["--c" as string]: st.color }}
                      onDragStart={() => setDrag(o.id)} onDragEnd={() => setDrag(null)} onClick={() => { if (!tv) router.push(`/ops/${o.id}`); }}
                      onKeyDown={(e) => { if (e.key === "Enter" && !tv) router.push(`/ops/${o.id}`); }} aria-label={`OP ${o.number}`}>
                      <div className="card-top"><b>OP {o.number}</b>{show("prioridade") && o.priority !== "Normal" && <span>{o.priority}</span>}
                        {show("necessidade") && <span className={`late badge${late ? " bad" : ""}`}>{late && <Icon name="alert" size={12} />}{fmtD(o.needDate)}</span>}</div>
                      <h3>{o.item}</h3>
                      <div className="meta">
                        {show("cliente") && o.client && <span>{o.client}{o.order ? ` · PV ${o.order}` : ""}</span>}
                        {show("obra") && o.work && <span><Icon name="pin" size={12} /> {o.work}</span>}
                        {show("produzido") && <span>{qf(o.produced)} de {qf(o.qty)} {o.unit} produzidas</span>}
                        {show("centro") && o.center && <span>{o.center}</span>}
                        {show("execucao") && o.live && <span className="live"><span className="live-dot" />Em execução</span>}
                      </div>
                      {tags.length > 0 && <div className="po-tags">{tags.map((t) => <span key={t.id} className="po-tag" title={t.label} style={{ ["--t" as string]: tagColor(o.custom[t.id]) }}>{o.custom[t.id]}</span>)}</div>}
                      {(show("responsavel") || show("progresso")) && (
                        <div className="foot">{show("responsavel") && o.resp && <span className="avatar sm" title={o.resp}>{ini(o.resp)}</span>}
                          {show("progresso") && <><div className="prog" aria-label={`Progresso ${o.progress}%`}><i style={{ width: `${Math.min(100, o.progress)}%` }} /></div><span className="prog-t">{o.progress}%</span></>}</div>
                      )}
                    </article>
                  );
                })}
                {!list.length && <div className="col-empty">{edit ? "Arraste uma OP para cá" : "Vazio"}</div>}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Cabeçalho da OP (dados principais)
export type OpForm = { id?: string; itemId: string; itemLabel: string; qty: number; salesOrderId: string; partnerId: string; partnerLabel?: string; workCenterId: string; responsibleId: string; priority: string; startDate: string; needDate: string; notes: string; stageId?: string; work?: string; custom?: Record<string, string> };
export function OpHeader({ op, orders, clients, centers, team, stages, canEdit, fields = [] }: { op: OpForm; orders: Opt[]; clients: Opt[]; centers: Opt[]; team: Opt[]; stages?: Opt[]; canEdit: boolean; fields?: CField[] }) {
  const [d, setD] = useState(op);
  const [pick, setPick] = useState(false);
  const [dirty, setDirty] = useState(!op.id);
  const { run, pending } = useRun();
  const set = (p: Partial<OpForm>) => { setD({ ...d, ...p }); setDirty(true); };
  const ro = !canEdit;
  return (
    <div className="sheet-top">
      <div className="form f4">
        <div className="fld span2"><span className="flabel">Produto a produzir <span className="req">*</span></span>
          <div style={{ display: "flex", gap: 8 }}><input value={d.itemLabel} readOnly placeholder="Escolha o produto" onClick={() => !ro && setPick(true)} aria-label="Produto" style={{ cursor: ro ? "default" : "pointer" }} />
            {!ro && <button type="button" className="btn btn-icon pick-btn" onClick={() => setPick(true)} title="Pesquisar produto" aria-label="Pesquisar produto"><Icon name="search" size={15} /></button>}</div>
          {op.id && <small>Trocar o produto refaz a estrutura da OP (só é possível antes de apontar).</small>}
        </div>
        <div className="fld"><label htmlFor="op_q">Quantidade <span className="req">*</span></label><input id="op_q" type="number" min={0} step="any" value={d.qty} disabled={ro} onChange={(e) => set({ qty: Number(e.target.value) || 0 })} /></div>
        <div className="fld"><label htmlFor="op_p">Prioridade</label><select id="op_p" value={d.priority} disabled={ro} onChange={(e) => set({ priority: e.target.value })}>{Object.keys(PRIORITIES).map((p) => <option key={p}>{p}</option>)}</select></div>
        <div className="fld span2"><label htmlFor="op_o">Pedido de venda</label><Sel id="op_o" value={d.salesOrderId} disabled={ro} onChange={(e) => set({ salesOrderId: e.target.value })}><option value="">Sem pedido (produção para estoque)</option>{orders.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel></div>
        <PickField id="op_c" className="fld span2" label="Cliente" disabled={ro || !!d.salesOrderId} emptyText={d.salesOrderId ? "O do pedido" : "Nenhum (produção para estoque)"}
          value={d.partnerId ? { id: d.partnerId, label: clients.find(([v]) => v === d.partnerId)?.[1] ?? d.partnerLabel ?? "" } : null}
          onChange={(r) => set({ partnerId: r?.id ?? "", partnerLabel: r?.label ?? "" })}
          picker={{ title: "Pesquisar cliente", fetcher: searchPartnersAction, filter: "Cliente", lockFilter: true, placeholder: "Nome, fantasia, CNPJ/CPF ou cidade", columns: ["Nome", "Razão social", "CNPJ/CPF", "Cidade", "Telefone"] }} />
        {stages && !op.id && <div className="fld"><label htmlFor="op_s">Etapa inicial</label><select id="op_s" value={d.stageId ?? ""} onChange={(e) => set({ stageId: e.target.value })}>{stages.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>}
        <div className="fld"><label htmlFor="op_wc">Centro de trabalho</label><Sel id="op_wc" value={d.workCenterId} disabled={ro} onChange={(e) => set({ workCenterId: e.target.value })}><option value="">Nenhum</option>{centers.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel></div>
        <div className="fld"><label htmlFor="op_r">Responsável</label><Sel id="op_r" value={d.responsibleId} disabled={ro} onChange={(e) => set({ responsibleId: e.target.value })}><option value="">Nenhum</option>{team.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel></div>
        <div className="fld"><label htmlFor="op_i">Início previsto</label><input id="op_i" type="date" value={d.startDate} disabled={ro} onChange={(e) => set({ startDate: e.target.value })} /></div>
        <div className="fld"><label htmlFor="op_n">Data de necessidade</label><input id="op_n" type="date" value={d.needDate} disabled={ro} onChange={(e) => set({ needDate: e.target.value })} /></div>
        <PlaceField id="op_w" className="fld span2" label="Obra / local" value={d.work ?? ""} disabled={ro} partnerId={d.partnerId} onChange={(v) => set({ work: v })} placeholder="Para o quadro e o acompanhamento de obras" />
        <CustomFieldsForm fields={fields} prefix="opcf" value={d.custom ?? {}} disabled={ro} onChange={(v) => set({ custom: v })} />
        <div className="fld full"><label htmlFor="op_obs">Observações</label><textarea id="op_obs" rows={2} value={d.notes} disabled={ro} onChange={(e) => set({ notes: e.target.value })} /></div>
      </div>
      {canEdit && <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <button type="button" className="btn btn-primary" disabled={!dirty || pending || !d.itemId || !(d.qty > 0)} onClick={() => run(() => saveOpAction({
          id: d.id, itemId: d.itemId, qty: d.qty, salesOrderId: d.salesOrderId || null, partnerId: d.partnerId || null, workCenterId: d.workCenterId || null, responsibleId: d.responsibleId || null,
          priority: d.priority as "Normal", startDate: d.startDate || null, needDate: d.needDate || null, notes: d.notes, stageId: d.stageId || null, work: d.work ?? null, custom: d.custom ?? {} }), () => setDirty(false))}>{pending ? "Salvando…" : d.id ? "Salvar dados da OP" : "Criar OP"}</button>
      </div>}
      {pick && <ItemPicker single title="Produto a produzir" priceLabel="Custo médio" priceOf={(r) => r.cost} onClose={() => setPick(false)}
        onPick={([r]) => { set({ itemId: r.id, itemLabel: `${r.name} · ${r.code}` }); setPick(false); }} />}
    </div>
  );
}

// ------------------------------------------------------------------ Estrutura da OP
export type CompRow = { id: string; itemId: string | null; code: string | null; name: string; unit: string; required: number; done: number; withdrawn: number; fromBom: boolean; supply: string };
export function OpStructure({ opId, rows, canEdit }: { opId: string; rows: CompRow[]; canEdit: boolean }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [pick, setPick] = useState(false);
  const [free, setFree] = useState({ d: "", q: "" });
  const { run, pending } = useRun();
  const save = (r: CompRow, v: number) => run(() => setComponentDoneAction(r.id, v), () => setVals((x) => { const y = { ...x }; delete y[r.id]; return y; }));
  const tot = rows.reduce((a, r) => a + r.required, 0);
  const done = rows.reduce((a, r) => a + Math.min(r.done, r.required), 0);
  return (
    <section className="panel sec-panel" id="estrutura">
      <h2>Estrutura da OP <span className="n">{rows.length} itens · {tot ? Math.round((done / tot) * 100) : 0}% apontado</span>
        {canEdit && <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}><button type="button" className="btn btn-sm" onClick={() => setPick(true)}><Icon name="plus" size={14} /> Incluir itens</button></span>}</h2>
      <div className="tbl solo" style={{ border: 0, borderRadius: 0, maxHeight: "none" }}>
        <table className="pecas" style={{ margin: 0, width: "100%" }}>
          <thead><tr><th className="chk-cell" /><th>Item</th><th style={{ width: 170 }}>Operação</th><th className="num">Necessário</th><th className="num">Retirado do estoque</th><th className="num" style={{ width: 210 }}>Pronto / apontado</th><th /></tr></thead>
          <tbody>{rows.length ? rows.map((r) => {
            const ok = r.done >= r.required - 1e-9;
            const v = vals[r.id];
            return (
              <tr key={r.id} className={ok ? "done" : ""}>
                <td>{canEdit ? <button type="button" className={`ck${ok ? " on" : ""}`} aria-label={ok ? "Desmarcar" : "Marcar como feito"} onClick={() => save(r, ok ? 0 : r.required)}><Icon name="check" size={13} /></button> : <span className={`ck${ok ? " on" : ""}`}><Icon name="check" size={13} /></span>}</td>
                <td className="pd">{r.name}{r.code && <span className="muted"> · {r.code}</span>}{!r.fromBom && <span className="badge" style={{ marginLeft: 6 }}>incluído</span>}</td>
                <td>{canEdit ? <select value={r.supply} className={r.supply === "FABRICADO" ? "sup-fab" : "sup-est"} aria-label="Operação" disabled={pending} onChange={(e) => run(() => setComponentSupplyAction(r.id, e.target.value as "ESTOQUE"))}>
                  <option value="FABRICADO">Fabricado na OP</option><option value="ESTOQUE">Retirada do estoque</option></select>
                  : <span className={`badge ${r.supply === "FABRICADO" ? "sup-fab" : "sup-est"}`}>{r.supply === "FABRICADO" ? "Fabricado" : "Do estoque"}</span>}</td>
                <td className="num">{qf(r.required)} {r.unit}</td>
                <td className={`num${r.supply === "ESTOQUE" && r.itemId && r.withdrawn + 1e-9 < r.required ? " t-warn" : ""}`}>{r.itemId && r.supply === "ESTOQUE" ? qf(r.withdrawn) : "—"}</td>
                <td className="num">{canEdit ? <span className="qty-edit"><input value={v ?? String(r.done)} inputMode="decimal" onChange={(e) => setVals({ ...vals, [r.id]: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") save(r, Number((v ?? "").replace(",", ".")) || 0); }} aria-label="Quantidade feita" />
                  {v != null && <button type="button" className="mini-btn" title="Salvar" disabled={pending} onClick={() => save(r, Number(v.replace(",", ".")) || 0)}><Icon name="check" size={13} /></button>}
                  <span className="muted">de {qf(r.required)}</span></span> : `${qf(r.done)} de ${qf(r.required)}`}</td>
                <td className="acts show">{canEdit && <ActionButton className="mini-btn danger" title="Remover da OP" confirm="Remover este item da estrutura da OP?" action={() => removeComponentAction(r.id)}><Icon name="trash" size={12} /></ActionButton>}</td>
              </tr>
            );
          }) : <tr><td colSpan={7}><div className="empty-inline">O produto não tem estrutura cadastrada. Inclua os itens aqui ou cadastre a estrutura no item.</div></td></tr>}</tbody>
        </table>
      </div>
      {canEdit && (
        <div className="pb" style={{ borderTop: "1px solid var(--line-2)", display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="fld" style={{ flex: 1, minWidth: 220 }}><label htmlFor="cf_d">Incluir item sem cadastro</label><input id="cf_d" value={free.d} onChange={(e) => setFree({ ...free, d: e.target.value })} placeholder="Ex.: Faixa refletiva (kit)" /></div>
          <div className="fld" style={{ width: 120 }}><label htmlFor="cf_q">Quantidade</label><input id="cf_q" inputMode="decimal" value={free.q} onChange={(e) => setFree({ ...free, q: e.target.value })} /></div>
          <button type="button" className="btn" disabled={!free.d.trim() || !(Number(free.q.replace(",", ".")) > 0) || pending} onClick={() => run(() => addComponentsAction(opId, [{ description: free.d, qty: Number(free.q.replace(",", ".")) }]), () => setFree({ d: "", q: "" }))}>Incluir</button>
        </div>
      )}
      {pick && <ItemPicker title="Incluir itens na estrutura da OP" priceLabel="Custo médio" priceOf={(r) => r.cost} onClose={() => setPick(false)}
        onPick={(sel) => { setPick(false); run(() => addComponentsAction(opId, sel.map((r) => ({ itemId: r.id, qty: r.qty || 1 })))); }} />}
    </section>
  );
}

// ------------------------------------------------------------------ Requisição pela estrutura
export function RequisitionButton({ opId, rows, locations, balances }: { opId: string; rows: CompRow[]; locations: Opt[]; balances: Record<string, Record<string, number>> }) {
  const [open, setOpen] = useState(false);
  // só os itens de retirada do estoque (os fabricados são feitos na própria OP)
  const mats = useMemo(() => rows.filter((r) => r.itemId && r.supply === "ESTOQUE"), [rows]);
  const [st, setSt] = useState<Record<string, { loc: string; qty: string }>>({});
  const { run, pending } = useRun();
  const init = () => {
    const o: Record<string, { loc: string; qty: string }> = {};
    for (const r of mats) {
      const b = balances[r.itemId!] ?? {};
      const loc = Object.entries(b).sort((x, y) => y[1] - x[1])[0]?.[0] ?? locations[0]?.[0] ?? "";
      const falta = Math.max(0, r.required - r.withdrawn);
      o[r.id] = { loc, qty: String(Math.max(0, Math.min(falta, b[loc] ?? 0))) };
    }
    setSt(o); setOpen(true);
  };
  return (
    <>
      <button type="button" className="btn btn-sm" onClick={init} disabled={!mats.length}><Icon name="out" size={14} /> Requisitar pela estrutura</button>
      {open && (
        <Modal title="Requisitar material pela estrutura" size="xl" onClose={() => setOpen(false)}
          foot={<><button type="button" className="btn" onClick={() => setOpen(false)}>Cancelar</button>
            <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(() => requisitionAction(opId, mats.map((r) => ({ itemId: r.itemId!, locationId: st[r.id].loc, qty: Number(st[r.id].qty.replace(",", ".")) || 0 }))), () => setOpen(false))}>Registrar retiradas</button></>}>
          <p className="muted" style={{ marginTop: 0 }}>A quantidade sugerida é o que falta retirar, limitada ao saldo do local.</p>
          <div className="tbl solo items-t"><table>
            <thead><tr><th>Material</th><th className="num">Necessário</th><th className="num">Já retirado</th><th style={{ width: 170 }}>Local</th><th className="num">Saldo no local</th><th className="num" style={{ width: 120 }}>Retirar agora</th></tr></thead>
            <tbody>{mats.map((r) => {
              const x = st[r.id]; const b = balances[r.itemId!]?.[x.loc] ?? 0;
              return (
                <tr key={r.id}><td className="desc">{r.name}</td><td className="num">{qf(r.required)} {r.unit}</td><td className="num">{qf(r.withdrawn)}</td>
                  <td><Sel value={x.loc} onChange={(e) => setSt({ ...st, [r.id]: { ...x, loc: e.target.value } })} aria-label="Local">{locations.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel></td>
                  <td className={`num${b < r.required - r.withdrawn ? " t-warn" : ""}`}>{qf(b)}</td>
                  <td><input inputMode="decimal" value={x.qty} onChange={(e) => setSt({ ...st, [r.id]: { ...x, qty: e.target.value } })} aria-label="Quantidade" /></td></tr>
              );
            })}</tbody>
          </table></div>
        </Modal>
      )}
    </>
  );
}

// ------------------------------------------------------------------ Apontar produção e enviar para montagem
export function OutputForm({ opId, left, unit, locations, defaultLocation }: { opId: string; left: number; unit: string; locations: Opt[]; defaultLocation: string }) {
  const [f, setF] = useState({ qty: left > 0 ? String(left) : "", date: today(), toStock: true, loc: defaultLocation, notes: "" });
  const { run, pending } = useRun();
  return (
    <div className="form f4">
      <div className="fld"><label htmlFor="o_q">Quantidade produzida ({unit})</label><input id="o_q" inputMode="decimal" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /><small>Faltam {qf(left)}.</small></div>
      <div className="fld"><label htmlFor="o_d">Data</label><input id="o_d" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
      <div className="fld"><span className="flabel">&nbsp;</span><label className="chk" style={{ height: 36 }}><input type="checkbox" checked={f.toStock} onChange={(e) => setF({ ...f, toStock: e.target.checked })} /> Dar entrada no estoque</label></div>
      {f.toStock && <div className="fld"><label htmlFor="o_l">Local</label><Sel id="o_l" value={f.loc} onChange={(e) => setF({ ...f, loc: e.target.value })}>{locations.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel></div>}
      <div className="fld span3"><label htmlFor="o_n">Observação</label><input id="o_n" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
      <div className="fld" style={{ alignSelf: "end" }}><button type="button" className="btn btn-primary" disabled={pending || !(Number(f.qty.replace(",", ".")) > 0)}
        onClick={() => run(() => reportOutputAction({ opId, qty: Number(f.qty.replace(",", ".")), date: f.date, toStock: f.toStock, locationId: f.toStock ? f.loc : null, notes: f.notes }))}>Apontar produção</button></div>
    </div>
  );
}

export function AssemblyFromOp({ opId, free, unit, defaultName, team, due, partnerId, place }: { opId: string; free: number; unit: string; defaultName: string; team: Opt[]; due: string | null; partnerId?: string | null; place?: string }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ qty: String(free), name: defaultName, address: place && place !== "Retira na fábrica" ? place : "", responsibleId: "", dueDate: due ?? "" });
  const { run, pending } = useRun();
  return (
    <>
      <button type="button" className="btn btn-sm btn-primary" disabled={free <= 0} title={free <= 0 ? "Aponte a produção antes de enviar para a montagem" : undefined}
        onClick={() => { if (free <= 0) toast("Aponte a quantidade produzida antes de enviar para a montagem.", true); else { setF((x) => ({ ...x, qty: String(free) })); setOpen(true); } }}><Icon name="truck" size={14} /> Enviar para montagem</button>
      {open && (
        <Modal title="Enviar para montagem" onClose={() => setOpen(false)}
          foot={<><button type="button" className="btn" onClick={() => setOpen(false)}>Cancelar</button><button type="button" className="btn btn-primary" disabled={pending}
            onClick={() => run(() => createAssemblyFromOpAction({ opId, qty: Number(f.qty.replace(",", ".")), name: f.name, address: f.address, responsibleId: f.responsibleId || null, dueDate: f.dueDate || null }), () => setOpen(false))}>Criar montagem</button></>}>
          <p className="muted" style={{ marginTop: 0 }}>A montagem fica ligada a esta OP. Você pode enviar parte do que já foi produzido (ex.: 50 de 100) e depois o restante.</p>
          <div className="form">
            <div className="fld"><label htmlFor="am_q">Quantidade ({unit})</label><input id="am_q" inputMode="decimal" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /><small>Disponível: {qf(free)}</small></div>
            <div className="fld"><label htmlFor="am_d">Previsão de término</label><input id="am_d" type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></div>
            <div className="fld full"><label htmlFor="am_n">Nome da montagem</label><input id="am_n" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <PlaceField id="am_a" className="fld full" label="Local da montagem" value={f.address} partnerId={partnerId} onChange={(v) => setF({ ...f, address: v })} placeholder="Pesquise: endereço do cliente, obra ou fábrica" />
            <div className="fld"><label htmlFor="am_r">Responsável</label><Sel id="am_r" value={f.responsibleId} onChange={(e) => setF({ ...f, responsibleId: e.target.value })} aria-label="Responsável"><option value="">Nenhum</option>{team.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel></div>
          </div>
        </Modal>
      )}
    </>
  );
}

export function StageSelect({ opId, stageId, stages }: { opId: string; stageId: string; stages: StageCol[] }) {
  const { run, pending } = useRun();
  const st = stages.find((s) => s.id === stageId);
  return (
    <select className="et-sel" style={{ ["--c" as string]: st?.color ?? "#6B7785" }} value={stageId} disabled={pending} aria-label="Etapa da OP" onChange={(e) => run(() => moveOpAction(opId, e.target.value))}>
      {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  );
}

// ------------------------------------------------------------------ importar OPs de planilha
export function ImportOpsButton({ fields }: { fields: string[] }) {
  const [open, setOpen] = useState(false);
  const cols = ["Item", "Quantidade", "Necessidade", "Prioridade", "Pedido", "Obra", "Observação", ...fields];
  const template = () => {
    const ex = ["(código do item)", "10", "31/12/2026", "Normal", "", "Residencial Atlântico", "", ...fields.map(() => "")];
    const csv = "﻿" + [cols, ex].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = "modelo-ops.csv"; a.click();
  };
  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}><Icon name="upload" size={16} /> Importar planilha</button>
      {open && <ImportSheet title="Importar ordens de produção" onClose={() => setOpen(false)} template={template}
        intro="Cada linha da planilha vira uma OP com a estrutura do produto. A primeira linha deve ter os nomes das colunas; a ordem não importa."
        cols={["Item (código) *", "Quantidade *", "Necessidade", "Prioridade (Baixa, Normal, Alta, Urgente)", "Pedido (nº do pedido de venda)", "Obra", "Observação", ...fields]}
        onRows={(rows) => importOpsAction({ rows })} />}
    </>
  );
}
