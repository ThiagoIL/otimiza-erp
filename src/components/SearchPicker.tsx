"use client";
import { useEffect, useRef, useState } from "react";
import { Modal } from "./client";
import { Icon } from "./Icon";
import type { SearchResult, SearchRow } from "@/server/search-actions";

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
        <button type="button" className="btn" disabled={disabled} onClick={() => setOpen(true)}><Icon name="search" size={15} /> Pesquisar</button>
      </div>
      {hint && <small>{hint}</small>}
      {open && <SearchPicker {...picker} onClose={() => setOpen(false)} onPick={(r) => { onChange(r); setOpen(false); }} />}
    </div>
  );
}
