"use client";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionState } from "@/lib/action";
import { Icon } from "./Icon";
import { Modal } from "./client";
import { toast } from "./Toast";
import { PageHead } from "./ui";
import { PickField } from "./SearchPicker";
import { searchGroupsAction } from "@/server/search-actions";

export const COLORS = ["#6B7785", "#E0601A", "#1E3A5F", "#7A4FA0", "#1F8A8A", "#2E7D4F", "#B3261E", "#8A6D1F", "#2F6E9A", "#C77700"];

type Opt = [string, string];
export type CField = { k: string; label: string; t?: string; req?: boolean; full?: boolean; hint?: string; max?: number; def?: unknown; options?: Opt[] };
export type CCol = { k: string; label: string; f?: string };
type Row = Record<string, unknown> & { id: string };

const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const brl = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const numBR = (v: unknown) => { const n = Number(v ?? 0); return Number.isInteger(n) ? n.toLocaleString("pt-BR") : n.toLocaleString("pt-BR", { maximumFractionDigits: 4 }); };

/** Valor de um campo para preencher o formulário. */
function inputValue(f: CField, v: unknown): string {
  if (v == null) return "";
  // registro novo chega com "" nos campos de lista; só junta quando já é uma lista
  if (f.t === "days") return Array.isArray(v) ? v.join(", ") : String(v);
  if (f.t === "list") return Array.isArray(v) ? v.join("; ") : String(v);
  if ((f.t === "num" || f.t === "money") && Number(v) === 0) return "";
  return String(v);
}

/** Grupo escolhido pela janela de pesquisa (o próprio registro fica fora da lista). */
function GroupField({ f, value, rowId, err }: { f: CField; value: unknown; rowId: string; err?: string }) {
  const id0 = typeof value === "string" ? value : "";
  const [v, setV] = useState(id0 ? { id: id0, label: f.options?.find(([o]) => o === id0)?.[1] ?? "" } : null);
  return (
    <>
      <PickField id={`f_${f.k}`} name={f.k} label={f.label} value={v} onChange={(r) => setV(r ? { id: r.id, label: r.label } : null)} className={`fld${f.full ? " full" : ""}${err ? " err" : ""}`}
        hint={err ? undefined : f.hint} emptyText="Nenhum (grupo principal)"
        picker={{ title: "Pesquisar grupo", fetcher: searchGroupsAction, filter: rowId, lockFilter: true, placeholder: "Nome, código ou prefixo do grupo", columns: ["Código", "Grupo", "Prefixo", "Itens"] }} />
      {err && <div className="errmsg">{err}</div>}
    </>
  );
}

export function FieldInput({ f, value, err, rowId = "" }: { f: CField; value: unknown; err?: string; rowId?: string }) {
  if (f.t === "group") return <GroupField f={f} value={value} rowId={rowId} err={err} />;
  const id = `f_${f.k}`;
  const label = <>{f.label}{f.req && <span className="req" aria-hidden="true"> *</span>}</>;
  if (f.t === "check") {
    return <div className="fld"><span className="flabel">&nbsp;</span><label className="chk" style={{ height: 36 }}><input type="checkbox" name={f.k} defaultChecked={value !== false && value !== "false"} /> {f.label}</label></div>;
  }
  if (f.t === "color") {
    const cur = String(value || f.def || COLORS[2]).toUpperCase();
    return (
      <div className={`fld${f.full ? " full" : ""}`}><span className="flabel">{f.label}</span>
        <div className="swatches" role="radiogroup" aria-label={f.label}>
          {COLORS.map((c) => <label key={c} style={{ background: c }} title={c}><input type="radio" name={f.k} value={c} defaultChecked={cur === c.toUpperCase()} /><span /></label>)}
        </div>
      </div>
    );
  }
  const v = inputValue(f, value);
  let input;
  if (f.t === "select") {
    input = <select id={id} name={f.k} defaultValue={v} aria-invalid={!!err}><option value="">{f.req ? "Selecione…" : "Nenhum"}</option>{(f.options ?? []).map(([o, l]) => <option key={o} value={o}>{l}</option>)}</select>;
  } else if (f.t === "textarea") {
    input = <textarea id={id} name={f.k} rows={3} defaultValue={v} aria-invalid={!!err} />;
  } else {
    const type = f.t === "date" ? "date" : "text";
    const mode = f.t === "int" ? "numeric" : f.t === "num" || f.t === "money" ? "decimal" : undefined;
    input = <input id={id} name={f.k} type={type} inputMode={mode} defaultValue={v} maxLength={f.max ?? 300} autoComplete="off" aria-invalid={!!err} />;
  }
  return (
    <div className={`fld${f.full ? " full" : ""}${err ? " err" : ""}`}>
      <label htmlFor={id}>{label}</label>{input}
      {err ? <div className="errmsg">{err}</div> : f.hint ? <small>{f.hint}</small> : null}
    </div>
  );
}

function Cell({ c, r, opts }: { c: CCol; r: Row; opts: Record<string, Opt[]> }) {
  const v = r[c.k];
  switch (c.f) {
    case "active": return <td>{v === false ? <span className="badge">Não</span> : <span className="badge ok">{c.label === "Situação" || c.label === "Ativa" ? "Ativo" : "Sim"}</span>}</td>;
    case "money": return <td className="num">{brl(v)}</td>;
    case "num": return <td className="num">{numBR(v)}</td>;
    case "hours": return <td className="num">{numBR(v)} h/dia</td>;
    case "code": return <td className="code">{String(v ?? "")}</td>;
    case "desc": return <td className="desc">{String(v ?? "")}</td>;
    case "days": return <td>{((v as number[]) ?? []).join(" / ")}</td>;
    case "list": return <td className="wrap" style={{ fontSize: 12.5 }}>{((v as string[]) ?? []).join(", ") || "—"}</td>;
    case "opt": return <td>{opts[c.k]?.find(([o]) => o === v)?.[1] ?? (v ? String(v) : "—")}</td>;
    case "color": {
      const color = String(r.color ?? "#6B7785");
      return <td className="desc"><span className="badge stat-badge" style={{ ["--c" as string]: color }}><span className="dot" style={{ background: color }} />{String(v ?? "")}</span></td>;
    }
    default: return <td>{v == null || v === "" ? "—" : String(v)}</td>;
  }
}

export function SimpleCrud({ k, one, fem, fields, cols, rows, canEdit, nextPos, save, remove, title, sub }: {
  k: string; one: string; fem: boolean; fields: CField[]; cols: CCol[]; rows: Row[]; canEdit: boolean; nextPos?: number;
  save: (p: ActionState, fd: FormData) => Promise<ActionState>; remove: (id: string) => Promise<ActionState>; title?: string; sub?: string;
}) {
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Row | null>(null);
  const opts = useMemo(() => Object.fromEntries(fields.filter((f) => f.options).map((f) => [f.k, f.options!])), [fields]);
  const list = q ? rows.filter((r) => norm(cols.map((c) => r[c.k]).join(" ")).includes(norm(q))) : rows;
  const novo = `${fem ? "Nova" : "Novo"} ${one}`;
  const blank = (): Row => {
    const r: Row = { id: "" };
    for (const f of fields) r[f.k] = f.def ?? (f.t === "check" ? true : "");
    if (nextPos != null) r.position = nextPos;
    return r;
  };
  return (
    <>
      {title && <PageHead title={title} sub={sub} />}
      <div className="bar">
        <div className="search"><Icon name="search" size={16} /><input type="search" placeholder="Buscar…" aria-label="Buscar" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <span className="grow" />
        <span className="count">{list.length === rows.length ? `${rows.length} registros` : `${list.length} de ${rows.length} registros`}</span>
        {canEdit && <button type="button" className="btn btn-primary" data-act="new" onClick={() => setEdit(blank())}><Icon name="plus" size={16} /> {novo}</button>}
      </div>
      <div className="tbl">
        {list.length ? (
          <table>
            <thead><tr>{cols.map((c) => <th key={c.k} className={["num", "money", "hours"].includes(c.f ?? "") ? "num" : ""}>{c.label}</th>)}<th><span className="sr">Ações</span></th></tr></thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} className={canEdit ? "click" : ""} style={r.active === false ? { opacity: 0.6 } : undefined} onClick={() => canEdit && setEdit(r)}>
                  {cols.map((c) => <Cell key={c.k} c={c} r={r} opts={opts} />)}
                  <td className="acts">{canEdit && <button type="button" className="btn btn-ghost btn-sm" aria-label="Editar"><Icon name="edit" size={15} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : rows.length ? <div className="empty"><strong>Nada encontrado</strong>Ajuste a busca.</div>
          : <div className="empty"><strong>{fem ? "Nenhuma" : "Nenhum"} {one} {fem ? "cadastrada" : "cadastrado"}</strong>Cadastre o primeiro para começar.</div>}
      </div>
      {edit && <EditModal key={edit.id || "novo"} row={edit} fields={fields} title={edit.id ? `Editar ${one}` : novo} save={save} remove={remove} onClose={() => setEdit(null)} kKey={k} />}
    </>
  );
}

function EditModal({ row, fields, title, save, remove, onClose }: {
  row: Row; fields: CField[]; title: string; kKey: string;
  save: (p: ActionState, fd: FormData) => Promise<ActionState>; remove: (id: string) => Promise<ActionState>; onClose: () => void;
}) {
  const router = useRouter();
  const [st, action, pending] = useActionState(save, {});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (st.ok) { toast(st.message ?? "Salvo."); onClose(); router.refresh(); }
    else if (st.error && !st.fields) toast(st.error, true);
  }, [st, onClose, router]);
  const vals = (k: string) => (st.values ? (k in st.values ? st.values[k] : row[k]) : row[k]);
  const formId = `sc-${row.id || "novo"}`;
  return (
    <Modal title={title} onClose={onClose} size={fields.length > 6 ? "wide" : ""}
      foot={<>
        {row.id && <button type="button" className="btn btn-danger left" disabled={busy}
          onClick={async () => { if (!confirm("Excluir este registro? Esta ação não pode ser desfeita.")) return; setBusy(true); const r = await remove(row.id); setBusy(false); if (r.error) toast(r.error, true); else { toast(r.message ?? "Excluído."); onClose(); router.refresh(); } }}>
          <Icon name="trash" size={16} /> Excluir</button>}
        <button type="button" className="btn" onClick={onClose}>Cancelar</button>
        <button type="submit" form={formId} className="btn btn-primary" disabled={pending}>{pending ? "Salvando…" : row.id ? "Salvar alterações" : "Cadastrar"}</button>
      </>}>
      <form id={formId} action={action} className="form" noValidate>
        {row.id && <input type="hidden" name="id" value={row.id} />}
        {st.error && st.fields && <div className="full alert bad">{st.error}</div>}
        {fields.map((f) => <FieldInput key={f.k} f={f} value={vals(f.k)} err={st.fields?.[f.k]} rowId={row.id} />)}
      </form>
    </Modal>
  );
}
