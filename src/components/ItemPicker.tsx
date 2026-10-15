"use client";
import { useEffect, useRef, useState } from "react";
import { Sel } from "./SearchPicker";
import { Modal } from "./client";
import { Icon } from "./Icon";
import { searchItemsAction, type PickRow } from "@/server/item-actions";

export type Picked = PickRow & { qty: number };
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const qf = (v: number) => (Number.isInteger(v) ? v.toLocaleString("pt-BR") : v.toLocaleString("pt-BR", { maximumFractionDigits: 3 }));

/**
 * Tela de pesquisa de itens: abre por cima do documento, com busca, filtros de grupo e tipo,
 * e permite marcar vários itens com a quantidade de cada um.
 */
export function ItemPicker({ onPick, onClose, title = "Selecionar itens", priceLabel = "Preço", priceOf = (r) => r.price, kinds, exclude, single }: {
  onPick: (rows: Picked[]) => void; onClose: () => void; title?: string; priceLabel?: string; priceOf?: (r: PickRow) => number;
  kinds?: string[]; exclude?: string; single?: boolean;
}) {
  const [q, setQ] = useState("");
  const [groupId, setGroup] = useState("");
  const [typeId, setType] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ rows: PickRow[]; total: number; groups: [string, string][]; types: [string, string][] } | null>(null);
  const [err, setErr] = useState("");
  const [sel, setSel] = useState<Map<string, Picked>>(new Map());
  const inp = useRef<HTMLInputElement>(null);
  useEffect(() => { inp.current?.focus(); }, []);
  const kk = kinds?.join(",") ?? "";
  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      const r = await searchItemsAction({ q, groupId, typeId, page, kinds: kk ? kk.split(",") : undefined, exclude });
      if (!live) return;
      if ("error" in r) setErr(r.error); else { setErr(""); setData(r); }
    }, 220);
    return () => { live = false; clearTimeout(t); };
  }, [q, groupId, typeId, page, kk, exclude]);
  const toggle = (r: PickRow) => {
    if (single) { onPick([{ ...r, qty: 1 }]); return; }
    const m = new Map(sel);
    if (m.has(r.id)) m.delete(r.id); else m.set(r.id, { ...r, qty: 1 });
    setSel(m);
  };
  const setQty = (id: string, v: number) => { const m = new Map(sel); const x = m.get(id); if (x) { m.set(id, { ...x, qty: v }); setSel(m); } };
  const pages = data ? Math.max(1, Math.ceil(data.total / 40)) : 1;
  return (
    <Modal title={title} size="xl" onClose={onClose}
      foot={single ? <button type="button" className="btn" onClick={onClose}>Cancelar</button> : <>
        <span className="left muted" style={{ fontSize: 13 }}>{sel.size ? `${sel.size} ${sel.size === 1 ? "item selecionado" : "itens selecionados"}` : "Marque os itens e informe a quantidade"}</span>
        <button type="button" className="btn" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn btn-primary" disabled={!sel.size} onClick={() => onPick([...sel.values()].filter((x) => x.qty > 0))}>Adicionar {sel.size || ""} {sel.size === 1 ? "item" : "itens"}</button>
      </>}>
      <div className="bar" style={{ borderRadius: "var(--r-lg) var(--r-lg) 0 0" }}>
        <div className="search"><Icon name="search" size={16} /><input ref={inp} type="search" placeholder="Código, descrição ou complemento" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Buscar item" /></div>
        <Sel value={groupId} onChange={(e) => { setGroup(e.target.value); setPage(1); }} aria-label="Grupo"><option value="">Todos os grupos</option>{data?.groups.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel>
        <Sel value={typeId} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label="Tipo"><option value="">Todos os tipos</option>{data?.types.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel>
        <span className="grow" /><span className="count">{data ? `${data.total} itens` : "Carregando…"}</span>
      </div>
      <div className="tbl picker-t">
        {err ? <div className="empty"><strong>Não foi possível pesquisar</strong>{err}</div> : data && data.rows.length ? (
          <table>
            <thead><tr>{!single && <th className="chk-cell" />}<th>Código</th><th>Descrição</th><th>Grupo</th><th>Un.</th><th className="num">Saldo</th><th className="num">{priceLabel}</th>{!single && <th className="num">Quantidade</th>}</tr></thead>
            <tbody>
              {data.rows.map((r) => {
                const on = sel.get(r.id);
                return (
                  <tr key={r.id} className={`click${on ? " sel" : ""}`} onClick={(e) => { if ((e.target as HTMLElement).closest("input")) return; toggle(r); }}>
                    {!single && <td><input type="checkbox" checked={!!on} onChange={() => toggle(r)} aria-label={`Selecionar ${r.name}`} /></td>}
                    <td className="code">{r.code}</td>
                    <td className="desc">{r.name}<div className="muted" style={{ fontSize: 12, fontWeight: 400 }}>{r.typeName}</div></td>
                    <td style={{ fontSize: 12.5 }}>{r.group || "—"}</td><td>{r.unit}</td>
                    <td className="num">{qf(r.balance)}</td><td className="num">{brl(priceOf(r))}</td>
                    {!single && <td className="num">{on ? <input type="number" min={0} step="any" value={on.qty} onChange={(e) => setQty(r.id, Number(e.target.value) || 0)} aria-label="Quantidade" /> : ""}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : data ? <div className="empty"><strong>Nenhum item encontrado</strong>Ajuste a busca ou os filtros.</div> : <div className="empty">Carregando…</div>}
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
