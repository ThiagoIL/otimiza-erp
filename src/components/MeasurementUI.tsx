"use client";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "./Icon";
import { Modal, useRun } from "./client";
import { ItemPicker } from "./ItemPicker";
import { PickField, PlaceField, Sel } from "./SearchPicker";
import { searchPartnersAction } from "@/server/search-actions";
import {
  generateOpsFromMeasurementAction, importMeasurementAction, markMeasuredAction, saveMeasurementAction, saveMeasurementLinesAction,
} from "@/server/measurement-actions";
import { readSpreadsheet, sheetObjects } from "@/lib/sheet";
import { PRIORITIES } from "@/lib/consts";

type Opt = [string, string];
export type CField = { id: string; label: string; type: string; options: string[]; required: boolean; onCard?: boolean };
const qf = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

/** Campo personalizado (texto, número, data, lista ou sim/não). */
export function CustomInput({ f, value, onChange, disabled, id, compact }: { f: CField; value: string; onChange: (v: string) => void; disabled?: boolean; id: string; compact?: boolean }) {
  const st = compact ? { minWidth: 90 } : undefined;
  if (f.type === "lista") return <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-label={f.label} style={st}><option value="">—</option>{f.options.map((o) => <option key={o}>{o}</option>)}{value && !f.options.includes(value) && <option>{value}</option>}</select>;
  if (f.type === "sim_nao") return <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-label={f.label} style={st}><option value="">—</option><option>Sim</option><option>Não</option></select>;
  return <input id={id} type={f.type === "data" ? "date" : "text"} inputMode={f.type === "numero" ? "decimal" : undefined} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-label={f.label} style={st} />;
}

/** Campos personalizados num painel de formulário (OP, pedido…). */
export function CustomFieldsForm({ fields, value, onChange, disabled, prefix }: { fields: CField[]; value: Record<string, string>; onChange: (v: Record<string, string>) => void; disabled?: boolean; prefix: string }) {
  if (!fields.length) return null;
  return (
    <>{fields.map((f) => (
      <div key={f.id} className="fld"><label htmlFor={`${prefix}_${f.id}`}>{f.label}{f.required && <span className="req"> *</span>}</label>
        <CustomInput id={`${prefix}_${f.id}`} f={f} value={value[f.id] ?? ""} disabled={disabled} onChange={(v) => onChange({ ...value, [f.id]: v })} /></div>
    ))}</>
  );
}

// ------------------------------------------------------------------ cabeçalho
export type MeasHeader = { id?: string; work: string; address: string; partnerId: string; partnerLabel: string; salesOrderId: string; measurerId: string; date: string; dueDate: string; notes: string };
export function MeasurementHeader({ m, orders, team, canEdit }: { m: MeasHeader; orders: Opt[]; team: Opt[]; canEdit: boolean }) {
  const [d, setD] = useState(m);
  const [dirty, setDirty] = useState(!m.id);
  const { run, pending } = useRun();
  const set = (p: Partial<MeasHeader>) => { setD({ ...d, ...p }); setDirty(true); };
  const ro = !canEdit;
  return (
    <div className="sheet-top">
      <div className="form f4">
        <PlaceField id="me_w" className="fld span2" label="Obra *" value={d.work} disabled={ro} partnerId={d.partnerId} onChange={(v) => set({ work: v })} placeholder="Ex.: Residencial Atlântico · Torre A" />
        <div className="fld span2"><label htmlFor="me_a">Endereço</label><input id="me_a" value={d.address} disabled={ro} onChange={(e) => set({ address: e.target.value })} /></div>
        <PickField id="me_c" className="fld span2" label="Cliente" disabled={ro} emptyText="Nenhum" value={d.partnerId ? { id: d.partnerId, label: d.partnerLabel } : null}
          onChange={(r) => set({ partnerId: r?.id ?? "", partnerLabel: r?.label ?? "" })}
          picker={{ title: "Pesquisar cliente", fetcher: searchPartnersAction, filter: "Cliente", lockFilter: true, placeholder: "Nome, fantasia, CNPJ/CPF ou cidade", columns: ["Nome", "Razão social", "CNPJ/CPF", "Cidade", "Telefone"] }} />
        <div className="fld span2"><label htmlFor="me_o">Pedido de venda</label><Sel id="me_o" value={d.salesOrderId} disabled={ro} onChange={(e) => set({ salesOrderId: e.target.value })}><option value="">Sem pedido</option>{orders.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel></div>
        <div className="fld"><label htmlFor="me_m">Medidor</label><Sel id="me_m" value={d.measurerId} disabled={ro} onChange={(e) => set({ measurerId: e.target.value })}><option value="">Não informado</option>{team.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel></div>
        <div className="fld"><label htmlFor="me_d">Data da medição *</label><input id="me_d" type="date" value={d.date} disabled={ro} onChange={(e) => set({ date: e.target.value })} /></div>
        <div className="fld"><label htmlFor="me_p">Previsão de entrega da obra</label><input id="me_p" type="date" value={d.dueDate} disabled={ro} onChange={(e) => set({ dueDate: e.target.value })} /></div>
        <div className="fld full"><label htmlFor="me_n">Observações</label><textarea id="me_n" rows={2} value={d.notes} disabled={ro} onChange={(e) => set({ notes: e.target.value })} /></div>
      </div>
      {canEdit && <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <button type="button" className="btn btn-primary" disabled={!dirty || pending || d.work.trim().length < 2} onClick={() => run(() => saveMeasurementAction({
          id: d.id, work: d.work, address: d.address, partnerId: d.partnerId || null, salesOrderId: d.salesOrderId || null, measurerId: d.measurerId || null, date: d.date, dueDate: d.dueDate || null, notes: d.notes,
        }), () => setDirty(false))}>{pending ? "Salvando…" : d.id ? "Salvar dados da medição" : "Criar medição"}</button>
      </div>}
    </div>
  );
}

// ------------------------------------------------------------------ grade dos locais
export type MeasLine = { key: string; id: string | null; floor: string; location: string; itemId: string | null; itemLabel: string; unit: string; description: string; qty: number; custom: Record<string, string>; measured: boolean; notes: string; op: { id: string; number: number } | null };
let seq = 0;
const blank = (floor = "", location = ""): MeasLine => ({ key: `n${++seq}`, id: null, floor, location, itemId: null, itemLabel: "", unit: "", description: "", qty: 1, custom: {}, measured: false, notes: "", op: null });

export function MeasurementGrid({ measurementId, lines: initial, fields, canEdit, open }: { measurementId: string; lines: MeasLine[]; fields: CField[]; canEdit: boolean; open: boolean }) {
  const [lines, setLines] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [pickFor, setPickFor] = useState<string | null>(null);
  const [bulk, setBulk] = useState(false);
  const [imp, setImp] = useState(false);
  const [floorF, setFloorF] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const { run, pending } = useRun();
  const ro = !canEdit;
  const set = (key: string, p: Partial<MeasLine>) => { setLines(lines.map((l) => (l.key === key ? { ...l, ...p } : l))); setDirty(true); };
  const floors = useMemo(() => [...new Set(lines.map((l) => l.floor).filter(Boolean))], [lines]);
  const shown = floorF ? lines.filter((l) => l.floor === floorF) : lines;
  const done = lines.filter((l) => l.measured).length;
  const save = () => run(() => saveMeasurementLinesAction({
    measurementId, lines: lines.map((l) => ({ id: l.id, floor: l.floor, location: l.location, itemId: l.itemId, description: l.description, qty: l.qty, custom: l.custom, measured: l.measured, notes: l.notes })),
  }), () => setDirty(false));
  const savedIds = [...sel].map((k) => lines.find((l) => l.key === k)?.id).filter(Boolean) as string[];
  const template = () => {
    const head = ["Andar", "Local", "Item", "Descrição", "Quantidade", ...fields.map((f) => f.label), "Medido", "Observação"];
    const ex = ["1º andar", "Janela 1", "", "Janela de correr 2 folhas", "1", ...fields.map(() => ""), "", ""];
    const csv = "﻿" + [head, ex].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = "modelo-medicao.csv"; a.click();
  };
  return (
    <section className="panel sec-panel" id="locais">
      <h2>Locais medidos <span className="n">{done} de {lines.length}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {floors.length > 1 && <select value={floorF} onChange={(e) => setFloorF(e.target.value)} aria-label="Andar" style={{ height: 30, width: "auto" }}><option value="">Todos os andares</option>{floors.map((f) => <option key={f}>{f}</option>)}</select>}
          {canEdit && open && <>
            <button type="button" className="btn btn-sm" onClick={() => setImp(true)}><Icon name="upload" size={14} /> Importar planilha</button>
            <button type="button" className="btn btn-sm" onClick={() => setBulk(true)}><Icon name="plus" size={14} /> Vários locais</button>
            <button type="button" className="btn btn-sm" onClick={() => { setLines([...lines, blank(floorF || lines[lines.length - 1]?.floor || "", "")]); setDirty(true); }}><Icon name="plus" size={14} /> Local</button>
          </>}
        </span>
      </h2>
      {sel.size > 0 && canEdit && (
        <div className="pb" style={{ display: "flex", gap: 8, alignItems: "center", borderBottom: "1px solid var(--line-2)", paddingBlock: 8 }}>
          <b>{sel.size} {sel.size === 1 ? "local marcado" : "locais marcados"}</b>
          <button type="button" className="btn btn-sm" disabled={pending || dirty || !savedIds.length} title={dirty ? "Salve antes" : undefined} onClick={() => run(() => markMeasuredAction(savedIds, true), () => { setLines(lines.map((l) => (sel.has(l.key) && l.id ? { ...l, measured: true } : l))); setSel(new Set()); })}><Icon name="check" size={14} /> Marcar como medidos</button>
          <button type="button" className="btn btn-sm" disabled={pending || dirty || !savedIds.length} onClick={() => run(() => markMeasuredAction(savedIds, false), () => { setLines(lines.map((l) => (sel.has(l.key) && l.id ? { ...l, measured: false } : l))); setSel(new Set()); })}>Desmarcar</button>
          {open && <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setLines(lines.filter((l) => !sel.has(l.key) || l.op)); setSel(new Set()); setDirty(true); }}><Icon name="trash" size={14} /> Excluir da grade</button>}
          <button type="button" className="btn btn-sm btn-ghost" style={{ marginLeft: "auto" }} onClick={() => setSel(new Set())}>Limpar seleção</button>
        </div>
      )}
      <div className="tbl solo meas-t" style={{ border: 0, borderRadius: 0, maxHeight: "none" }}>
        <table>
          <thead><tr>
            {canEdit && <th className="chk-cell"><input type="checkbox" aria-label="Marcar todos" checked={shown.length > 0 && shown.every((l) => sel.has(l.key))} onChange={(e) => setSel(e.target.checked ? new Set(shown.map((l) => l.key)) : new Set())} /></th>}
            <th>Andar</th><th>Local</th><th>Item</th><th className="num">Qtd.</th>{fields.map((f) => <th key={f.id}>{f.label}{f.required && <span className="req"> *</span>}</th>)}<th>Medido</th><th>OP</th>{canEdit && <th />}
          </tr></thead>
          <tbody>{shown.length ? shown.map((l) => {
            const lock = ro || !open;
            return (
              <tr key={l.key} className={l.measured ? "row-ok" : undefined}>
                {canEdit && <td><input type="checkbox" aria-label="Marcar" checked={sel.has(l.key)} onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(l.key); else n.delete(l.key); setSel(n); }} /></td>}
                <td><input value={l.floor} disabled={lock} onChange={(e) => set(l.key, { floor: e.target.value })} aria-label="Andar" list="me-floors" style={{ minWidth: 90 }} /></td>
                <td><input value={l.location} disabled={lock} onChange={(e) => set(l.key, { location: e.target.value })} aria-label="Local" style={{ minWidth: 110 }} /></td>
                <td style={{ minWidth: 220 }}>
                  {l.itemId ? <div className="me-item"><span className="ell" title={l.itemLabel}>{l.itemLabel}</span>{!lock && !l.op && <button type="button" className="btn btn-ghost btn-sm" aria-label="Trocar item" onClick={() => setPickFor(l.key)}><Icon name="search" size={13} /></button>}</div>
                    : <div className="me-item"><input value={l.description} disabled={lock} placeholder="Descrição ou escolha o item" onChange={(e) => set(l.key, { description: e.target.value })} aria-label="Descrição" />{!lock && <button type="button" className="btn btn-icon pick-btn" aria-label="Pesquisar item" onClick={() => setPickFor(l.key)}><Icon name="search" size={14} /></button>}</div>}
                </td>
                <td><input type="number" min={0} step="any" value={l.qty} disabled={lock || !!l.op} onChange={(e) => set(l.key, { qty: Number(e.target.value) || 0 })} aria-label="Quantidade" style={{ width: 70 }} /></td>
                {fields.map((f) => <td key={f.id}><CustomInput compact id={`mc_${l.key}_${f.id}`} f={f} value={l.custom[f.id] ?? ""} disabled={ro} onChange={(v) => set(l.key, { custom: { ...l.custom, [f.id]: v } })} /></td>)}
                <td><label className="chk"><input type="checkbox" checked={l.measured} disabled={ro} onChange={(e) => set(l.key, { measured: e.target.checked })} /> {l.measured ? "Sim" : "Não"}</label></td>
                <td>{l.op ? <Link href={`/ops/${l.op.id}`}><b>OP {l.op.number}</b></Link> : <span className="muted">—</span>}</td>
                {canEdit && <td>{!l.op && open && <button type="button" className="btn btn-ghost btn-sm" aria-label="Remover" onClick={() => { setLines(lines.filter((x) => x.key !== l.key)); setDirty(true); }}><Icon name="x" size={14} /></button>}</td>}
              </tr>
            );
          }) : <tr><td colSpan={7 + fields.length}><div className="empty-inline">Nenhum local. Inclua os locais da obra (andar e identificação: Janela 1, Porta da sala…) ou importe uma planilha.</div></td></tr>}</tbody>
        </table>
        <datalist id="me-floors">{floors.map((f) => <option key={f} value={f} />)}</datalist>
      </div>
      {canEdit && (
        <div className="pb" style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center", borderTop: "1px solid var(--line-2)" }}>
          {dirty && <span className="muted" style={{ fontSize: 12.5 }}>Alterações não salvas</span>}
          <button type="button" className="btn btn-primary" disabled={!dirty || pending} onClick={save}>{pending ? "Salvando…" : "Salvar locais"}</button>
        </div>
      )}
      {pickFor && <ItemPicker single title="Escolher o item do local" onClose={() => setPickFor(null)} onPick={(rows) => { const r = rows[0]; if (r) set(pickFor, { itemId: r.id, itemLabel: `${r.name} · ${r.code}`, unit: r.unit }); setPickFor(null); }} />}
      {bulk && <BulkLines onClose={() => setBulk(false)} onAdd={(add) => { setLines([...lines, ...add]); setDirty(true); setBulk(false); }} />}
      {imp && <ImportSheet title="Importar locais da medição" onClose={() => setImp(false)} template={template} replaceable={!lines.some((l) => l.op)}
        cols={["Andar", "Local *", "Item (código)", "Descrição", "Quantidade", ...fields.map((f) => f.label), "Medido (Sim/Não)", "Observação"]}
        onRows={(rows, replace) => importMeasurementAction({ measurementId, rows, replace })} />}
    </section>
  );
}

/** Inclui vários locais de uma vez: andar(es) × Janela 1 a N. */
function BulkLines({ onClose, onAdd }: { onClose: () => void; onAdd: (l: MeasLine[]) => void }) {
  const [f, setF] = useState({ floors: "", prefix: "Janela", from: 1, to: 4, qty: 1 });
  const [item, setItem] = useState<{ id: string; label: string; unit: string } | null>(null);
  const [pick, setPick] = useState(false);
  const floors = f.floors.split(/[;\n]/).map((x) => x.trim()).filter(Boolean);
  const nums = f.to >= f.from ? Array.from({ length: Math.min(500, f.to - f.from + 1) }, (_, i) => f.from + i) : [];
  const total = (floors.length || 1) * nums.length;
  return (
    <Modal title="Incluir vários locais" onClose={onClose}
      foot={<><button type="button" className="btn" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn btn-primary" disabled={!total || total > 2000} onClick={() => onAdd((floors.length ? floors : [""]).flatMap((fl) => nums.map((n) => ({ ...blank(fl, `${f.prefix.trim()} ${n}`.trim()), qty: f.qty, itemId: item?.id ?? null, itemLabel: item?.label ?? "", unit: item?.unit ?? "" }))))}>Incluir {total} {total === 1 ? "local" : "locais"}</button></>}>
      <div className="form f2">
        <div className="fld full"><label htmlFor="bl_f">Andares</label><textarea id="bl_f" rows={2} value={f.floors} onChange={(e) => setF({ ...f, floors: e.target.value })} placeholder="Ex.: Térreo; 1º andar; 2º andar" /><small>Separe com ponto e vírgula. Deixe vazio se a obra não tem andares.</small></div>
        <div className="fld full"><span className="flabel">Produto (opcional)</span>
          <div style={{ display: "flex", gap: 8 }}><input readOnly value={item?.label ?? ""} placeholder="Escolha o item de todos os locais" onClick={() => setPick(true)} aria-label="Produto" style={{ cursor: "pointer" }} />
            <button type="button" className="btn btn-icon pick-btn" onClick={() => setPick(true)} aria-label="Pesquisar item"><Icon name="search" size={15} /></button>
            {item && <button type="button" className="btn btn-ghost btn-icon" onClick={() => setItem(null)} aria-label="Limpar"><Icon name="x" size={15} /></button>}</div></div>
        <div className="fld"><label htmlFor="bl_p">Nome do local</label><input id="bl_p" value={f.prefix} onChange={(e) => setF({ ...f, prefix: e.target.value })} /></div>
        <div className="fld"><label htmlFor="bl_q">Quantidade em cada</label><input id="bl_q" type="number" min={1} value={f.qty} onChange={(e) => setF({ ...f, qty: Number(e.target.value) || 1 })} /></div>
        <div className="fld"><label htmlFor="bl_a">Numerar de</label><input id="bl_a" type="number" min={0} value={f.from} onChange={(e) => setF({ ...f, from: Number(e.target.value) || 0 })} /></div>
        <div className="fld"><label htmlFor="bl_b">até</label><input id="bl_b" type="number" min={0} value={f.to} onChange={(e) => setF({ ...f, to: Number(e.target.value) || 0 })} /></div>
      </div>
      {pick && <ItemPicker single title="Produto dos locais" onClose={() => setPick(false)} onPick={(rows) => { const r = rows[0]; if (r) setItem({ id: r.id, label: `${r.name} · ${r.code}`, unit: r.unit }); setPick(false); }} />}
      <p className="muted" style={{ marginBottom: 0 }}>Exemplo: {floors[0] ? `${floors[0]} · ` : ""}{f.prefix} {f.from}{nums.length > 1 ? `, ${f.prefix} ${f.from + 1}…` : ""}</p>
    </Modal>
  );
}

/** Janela de importação de planilha (Excel .xlsx ou CSV): lê no navegador e envia as linhas. */
export function ImportSheet({ title, cols, onRows, onClose, template, replaceable, intro }: {
  title: string; cols: string[]; onRows: (rows: Record<string, string>[], replace: boolean) => Promise<{ error?: string; message?: string; ok?: boolean }>;
  onClose: () => void; template?: () => void; replaceable?: boolean; intro?: string;
}) {
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [head, setHead] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [replace, setReplace] = useState(false);
  const [err, setErr] = useState("");
  const inp = useRef<HTMLInputElement>(null);
  const { run, pending } = useRun();
  const read = async (f: File) => {
    setErr(""); setRows(null); setName(f.name);
    if (f.size > 15 * 1024 * 1024) { setErr("Arquivo muito grande (até 15 MB)."); return; }
    try {
      const o = sheetObjects(await readSpreadsheet(new Uint8Array(await f.arrayBuffer()), f.name));
      if (!o.rows.length) { setErr("A planilha não tem linhas abaixo do cabeçalho."); return; }
      setHead(o.head); setRows(o.rows);
    } catch (e) { setErr(e instanceof Error ? e.message : "Não foi possível ler a planilha."); }
  };
  return (
    <Modal title={title} size="wide" onClose={onClose}
      foot={<><button type="button" className="btn" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn btn-primary" disabled={!rows || pending} onClick={() => rows && run(() => onRows(rows, replace), onClose)}>
          {pending ? "Importando…" : `Importar ${rows ? rows.length : ""} ${rows?.length === 1 ? "linha" : "linhas"}`}</button></>}>
      <p className="muted" style={{ marginTop: 0 }}>{intro ?? "A primeira linha da planilha deve ter os nomes das colunas. A ordem não importa."} Colunas: {cols.join(", ")}.</p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input ref={inp} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) read(f); e.target.value = ""; }} />
        <button type="button" className="btn btn-primary" onClick={() => inp.current?.click()}><Icon name="upload" size={15} /> Escolher planilha (.xlsx ou .csv)</button>
        {template && <button type="button" className="btn btn-ghost" onClick={template}><Icon name="download" size={15} /> Baixar modelo</button>}
        {name && <span className="muted">{name}</span>}
      </div>
      {err && <p className="t-bad" style={{ marginBottom: 0 }}>{err}</p>}
      {rows && (
        <>
          <div className="tbl solo" style={{ marginTop: 12, maxHeight: 280 }}><table>
            <thead><tr>{head.map((h, i) => <th key={i}>{h || "—"}</th>)}</tr></thead>
            <tbody>{rows.slice(0, 8).map((r, k) => <tr key={k}>{head.map((h, i) => <td key={i} className="ell" style={{ maxWidth: 160 }}>{r[h]}</td>)}</tr>)}</tbody>
          </table></div>
          {rows.length > 8 && <p className="muted" style={{ margin: "6px 0 0" }}>Mostrando 8 de {rows.length} linhas.</p>}
          {replaceable && <label className="chk" style={{ marginTop: 10 }}><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> Substituir os locais atuais pelos da planilha</label>}
        </>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------ gerar a produção
export function GenerateOpsButton({ measurementId, free, noItem, centers, team, due }: { measurementId: string; free: number; noItem: number; centers: Opt[]; team: Opt[]; due: string }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ workCenterId: "", responsibleId: "", priority: "Normal", needDate: due });
  const { run, pending } = useRun();
  return (
    <>
      <button type="button" className="btn btn-primary" disabled={!free} title={!free ? "Todos os locais já estão em OP" : undefined} onClick={() => setOpen(true)}><Icon name="factory" size={16} /> Gerar OPs ({qf(free)})</button>
      {open && (
        <Modal title="Gerar a produção desta medição" onClose={() => setOpen(false)}
          foot={<><button type="button" className="btn" onClick={() => setOpen(false)}>Cancelar</button>
            <button type="button" className="btn btn-primary" disabled={pending || noItem > 0} onClick={() => run(() => generateOpsFromMeasurementAction({ measurementId, workCenterId: f.workCenterId || null, responsibleId: f.responsibleId || null, priority: f.priority as "Normal", needDate: f.needDate || null }), () => setOpen(false))}>Gerar OPs</button></>}>
          <p className="muted" style={{ marginTop: 0 }}>Os locais medidos que ainda não estão em OP viram ordens de produção: uma OP por item (e por combinação dos campos da OP, como Pintura). Cada local fica ligado à OP e depois vira a estrutura da montagem (andar → local).</p>
          {noItem > 0 && <p className="t-bad">{noItem === 1 ? "1 local está" : `${noItem} locais estão`} sem item do cadastro. Escolha o item na grade antes de gerar.</p>}
          <div className="form f2">
            <div className="fld"><label htmlFor="go_c">Centro de trabalho</label><Sel id="go_c" value={f.workCenterId} onChange={(e) => setF({ ...f, workCenterId: e.target.value })}><option value="">Nenhum</option>{centers.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel></div>
            <div className="fld"><label htmlFor="go_r">Responsável</label><Sel id="go_r" value={f.responsibleId} onChange={(e) => setF({ ...f, responsibleId: e.target.value })}><option value="">Nenhum</option>{team.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel></div>
            <div className="fld"><label htmlFor="go_p">Prioridade</label><select id="go_p" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{Object.keys(PRIORITIES).map((p) => <option key={p}>{p}</option>)}</select></div>
            <div className="fld"><label htmlFor="go_n">Data de necessidade</label><input id="go_n" type="date" value={f.needDate} onChange={(e) => setF({ ...f, needDate: e.target.value })} /></div>
          </div>
        </Modal>
      )}
    </>
  );
}
