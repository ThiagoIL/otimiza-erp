"use client";
import { Children, Fragment, isValidElement, useEffect, useMemo, useRef, useState, type ReactNode, type SelectHTMLAttributes } from "react";
import { Modal } from "./client";
import { Icon } from "./Icon";
import { savePlaceAction, searchPlacesAction, type SearchResult, type SearchRow } from "@/server/search-actions";
import { toast } from "./Toast";

type Fetch = (a: { q: string; filter: string; page: number }) => Promise<SearchResult>;

/**
 * Janela de pesquisa para escolher um registro (cliente, fornecedor, grupo, OP…).
 * Mesmo comportamento da pesquisa de itens: busca enquanto digita, filtro opcional e páginas.
 */
export function SearchPicker({ title, fetcher, columns, placeholder, filters, filter: f0 = "", lockFilter, onPick, onClose }: {
  title: string; fetcher: Fetch; columns: string[]; placeholder: string; filters?: [string, string][]; filter?: string; lockFilter?: boolean;
  onPick: (row: SearchRow) => void; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState(f0);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ rows: SearchRow[]; total: number } | null>(null);
  const [err, setErr] = useState("");
  const inp = useRef<HTMLInputElement>(null);
  useEffect(() => { inp.current?.focus(); }, []);
  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      const r = await fetcher({ q, filter, page });
      if (!live) return;
      if ("error" in r) setErr(r.error); else { setErr(""); setData(r); }
    }, 220);
    return () => { live = false; clearTimeout(t); };
  }, [q, filter, page, fetcher]);
  const pages = data ? Math.max(1, Math.ceil(data.total / 30)) : 1;
  return (
    <Modal title={title} size="xl" onClose={onClose} foot={<button type="button" className="btn" onClick={onClose}>Cancelar</button>}>
      <div className="bar" style={{ borderRadius: "var(--r-lg) var(--r-lg) 0 0" }}>
        <div className="search"><Icon name="search" size={16} /><input ref={inp} type="search" placeholder={placeholder} value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Pesquisar" /></div>
        {filters && !lockFilter && <select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }} aria-label="Filtro">{filters.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}
        <span className="grow" /><span className="count">{data ? `${data.total} ${data.total === 1 ? "registro" : "registros"}` : "Carregando…"}</span>
      </div>
      <div className="tbl picker-t">
        {err ? <div className="empty"><strong>Não foi possível pesquisar</strong>{err}</div> : data && data.rows.length ? (
          <table>
            <thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>{data.rows.map((r) => (
              <tr key={r.id} className="click" tabIndex={0} onClick={() => onPick(r)} onKeyDown={(e) => { if (e.key === "Enter") onPick(r); }}>
                {r.cells.map((c, i) => <td key={i} className={i === 0 ? "desc" : undefined}>{c}</td>)}
              </tr>))}</tbody>
          </table>
        ) : data ? <div className="empty"><strong>Nada encontrado</strong>Ajuste a pesquisa{filters ? " ou o filtro" : ""}.</div> : <div className="empty">Carregando…</div>}
      </div>
      {pages > 1 && (
        <div className="pager" style={{ border: "1px solid var(--line)", borderTop: 0, borderRadius: "0 0 var(--r-lg) var(--r-lg)" }}>
          <button type="button" className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>
          <span>Página {page} de {pages}</span>
          <button type="button" className="btn btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Próxima</button>
        </div>
      )}
    </Modal>
  );
}

/**
 * Campo de formulário que escolhe um registro pela janela de pesquisa: mostra o escolhido,
 * o botão "Pesquisar" e um "x" para limpar. Grava o id num campo oculto (name) para formulários comuns.
 */
export function PickField({ id, name, label, value, onChange, req, disabled, hint, picker, emptyText = "Nenhum selecionado", className = "fld" }: {
  id: string; name?: string; label: string; value: { id: string; label: string } | null; onChange: (v: SearchRow | null) => void;
  req?: boolean; disabled?: boolean; hint?: string; emptyText?: string; className?: string;
  picker: Omit<Parameters<typeof SearchPicker>[0], "onPick" | "onClose">;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={className}>
      <label htmlFor={id}>{label}{req && <span className="req"> *</span>}</label>
      <div className="pick-in">
        <input id={id} readOnly value={value?.label ?? ""} placeholder={emptyText} disabled={disabled} onClick={() => !disabled && setOpen(true)} onKeyDown={(e) => { if (!disabled && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setOpen(true); } }} />
        {name && <input type="hidden" name={name} value={value?.id ?? ""} />}
        {value && !disabled && !req && <button type="button" className="btn btn-ghost btn-icon" aria-label={`Limpar ${label}`} onClick={() => onChange(null)}><Icon name="x" size={14} /></button>}
        <button type="button" className="btn btn-icon pick-btn" disabled={disabled} onClick={() => setOpen(true)} title={`Pesquisar ${label.toLowerCase()}`} aria-label={`Pesquisar ${label.toLowerCase()}`}><Icon name="search" size={15} /></button>
      </div>
      {hint && <small>{hint}</small>}
      {open && <SearchPicker {...picker} onClose={() => setOpen(false)} onPick={(r) => { onChange(r); setOpen(false); }} />}
    </div>
  );
}

// ------------------------------------------------------------------------------------
// Sel: troca a lista suspensa de cadastros por um campo que abre a janela de pesquisa
// ------------------------------------------------------------------------------------
type SelOpt = { v: string; label: string; disabled?: boolean };
const textOf = (n: ReactNode): string => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(n)) return textOf(n.props.children);
  return "";
};
function optionsOf(children: ReactNode, out: SelOpt[] = []): SelOpt[] {
  Children.forEach(children, (c) => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>(c)) return;
    if (c.type === "option") { const label = textOf(c.props.children); out.push({ v: c.props.value != null ? String(c.props.value) : label, label, disabled: c.props.disabled }); }
    else if (c.type === "optgroup" || c.type === Fragment) optionsOf(c.props.children, out);
  });
  return out;
}
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Janela com as opções e um campo de busca (filtra enquanto digita). */
function OptionPicker({ title, opts, cur, onPick, onClose }: { title: string; opts: SelOpt[]; cur: string; onPick: (v: string) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const inp = useRef<HTMLInputElement>(null);
  useEffect(() => { inp.current?.focus(); }, []);
  const list = useMemo(() => { const n = norm(q.trim()); return opts.filter((o) => !o.disabled && (!n || norm(o.label).includes(n))); }, [q, opts]);
  return (
    <Modal title={title} size="wide" onClose={onClose} foot={<button type="button" className="btn" onClick={onClose}>Cancelar</button>}>
      <div className="bar" style={{ borderRadius: "var(--r-lg) var(--r-lg) 0 0" }}>
        <div className="search"><Icon name="search" size={16} /><input ref={inp} type="search" placeholder="Digite para pesquisar" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Pesquisar"
          onKeyDown={(e) => { if (e.key === "Enter" && list.length) { e.preventDefault(); onPick(list[0].v); } }} /></div>
        <span className="grow" /><span className="count">{list.filter((o) => o.v !== "").length} {list.length === 1 ? "registro" : "registros"}</span>
      </div>
      <div className="tbl picker-t opt-list">
        {list.length ? <table><tbody>{list.map((o) => (
          <tr key={o.v} className={`click${o.v === cur ? " sel-on" : ""}`} tabIndex={0} onClick={() => onPick(o.v)} onKeyDown={(e) => { if (e.key === "Enter") onPick(o.v); }}>
            <td className={o.v === "" ? "muted" : "desc"}>{o.label}</td><td style={{ width: 30 }}>{o.v === cur && <Icon name="check" size={15} />}</td></tr>))}</tbody></table>
          : <div className="empty"><strong>Nada encontrado</strong>Ajuste a pesquisa.</div>}
      </div>
    </Modal>
  );
}

/**
 * Substitui um <select> de cadastro: mostra o escolhido e um botão de pesquisa que abre a janela com busca.
 * Mantém um <select> escondido com o mesmo name/id/onChange, então funciona em formulários e na barra de filtros.
 */
export function Sel({ children, className, style, title, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  const ref = useRef<HTMLSelectElement>(null);
  const opts = useMemo(() => optionsOf(children), [children]);
  const init = String(p.value ?? p.defaultValue ?? opts[0]?.v ?? "");
  const [cur, setCur] = useState(init);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (p.value !== undefined) setCur(String(p.value)); }, [p.value]);
  useEffect(() => { if (p.value === undefined) setCur(String(p.defaultValue ?? opts[0]?.v ?? "")); }, [p.defaultValue]); // eslint-disable-line react-hooks/exhaustive-deps
  // a barra de filtros limpa os campos direto no elemento: acompanha o select escondido
  useEffect(() => { const el = ref.current; if (!el) return; const f = () => setCur(el.value); el.form?.addEventListener("reset", () => setTimeout(f)); }, []);
  const label = opts.find((o) => o.v === cur)?.label ?? "";
  const [name, setName] = useState(String(p["aria-label"] ?? title ?? ""));
  // sem aria-label: usa o texto do <label for=id> do formulário
  useEffect(() => { if (!name && p.id) setName(document.querySelector(`label[for="${p.id}"]`)?.textContent?.replace("*", "").trim() || "registro"); }, [name, p.id]);
  const pick = (v: string) => {
    setOpen(false);
    const el = ref.current;
    if (!el) return;
    setCur(v);
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, v);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  return (
    <span className={`sel${p.disabled ? " dis" : ""}${className ? " " + className : ""}`} style={style}>
      <select ref={ref} {...p} hidden tabIndex={-1} aria-hidden="true">{children}</select>
      <button type="button" className="sel-v" disabled={p.disabled} onClick={() => setOpen(true)} title={label} aria-label={`${name || "Registro"}: ${label || "nenhum"}. Abrir pesquisa`}>
        <span className={cur === "" ? "muted" : undefined}>{label || "Selecione…"}</span><Icon name="search" size={14} />
      </button>
      {open && <OptionPicker title={`Pesquisar ${(name || "registro").toLowerCase()}`} opts={opts} cur={cur} onPick={pick} onClose={() => setOpen(false)} />}
    </span>
  );
}

/**
 * Local de entrega ou de montagem: pode digitar ou pesquisar (fábrica, endereço do cliente e locais cadastrados).
 * O botão de guardar salva o que foi digitado na lista de locais.
 */
export function PlaceField({ id, label, value, onChange, partnerId, disabled, className = "fld", placeholder }: {
  id: string; label: string; value: string; onChange: (v: string) => void; partnerId?: string | null; disabled?: boolean; className?: string; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  return (
    <div className={className}>
      <label htmlFor={id}>{label}</label>
      <div className="pick-in">
        <input id={id} type="text" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? "Digite ou pesquise o local"} />
        {!disabled && value.trim().length > 2 && <button type="button" className="btn btn-ghost btn-icon" title="Guardar este local para as próximas vezes" aria-label="Guardar este local" disabled={saving}
          onClick={async () => { setSaving(true); const r = await savePlaceAction({ name: value, partnerId }); setSaving(false); toast(r.error ?? r.message ?? "", !!r.error); }}><Icon name="pin" size={15} /></button>}
        <button type="button" className="btn btn-icon pick-btn" disabled={disabled} onClick={() => setOpen(true)} title="Pesquisar local" aria-label="Pesquisar local"><Icon name="search" size={15} /></button>
      </div>
      {open && <SearchPicker title="Pesquisar local" fetcher={searchPlacesAction} filter={partnerId ?? ""} lockFilter placeholder="Nome ou endereço do local" columns={["Local", "Endereço", "Cliente"]}
        onClose={() => setOpen(false)} onPick={(r) => { onChange(r.label); setOpen(false); }} />}
    </div>
  );
}
