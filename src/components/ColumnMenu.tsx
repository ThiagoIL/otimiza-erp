"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";

/**
 * Colunas das tabelas escolhidas pelo usuário: botão direito numa tabela abre a lista de colunas
 * para mostrar ou esconder. Vale para todas as telas (tabelas dentro de .tbl). A escolha fica
 * guardada no navegador, por tela e por tabela. Colunas com data-hide no <th> começam escondidas.
 */
const TABLES = ".view .tbl table:not(.no-cols)";
const keyOf = (path: string, i: number) => `cols:${path.replace(/\/[A-Za-z0-9_-]{15,}(?=\/|$)/g, "/:id")}:${i}`;

type Col = { i: number; label: string };
function headers(t: HTMLTableElement): Col[] {
  const row = t.tHead?.rows[0];
  if (!row) return [];
  const out: Col[] = [];
  let i = 0;
  for (const c of Array.from(row.cells)) {
    const span = Number(c.dataset.cs ?? c.colSpan) || 1;
    out.push({ i, label: (c.dataset.label ?? c.textContent ?? "").trim() });
    i += span;
  }
  return out;
}
function load(key: string, t: HTMLTableElement): Set<number> {
  try {
    const v = localStorage.getItem(key);
    if (v) return new Set(JSON.parse(v) as number[]);
  } catch { /* sem armazenamento: usa o padrão */ }
  const row = t.tHead?.rows[0];
  const out = new Set<number>();
  let i = 0;
  for (const c of Array.from(row?.cells ?? [])) { if (c.hasAttribute("data-hide")) out.add(i); i += Number(c.dataset.cs ?? c.colSpan) || 1; }
  return out;
}
/** Esconde as colunas, ajustando as células que ocupam várias colunas (rodapé de totais). */
function paint(t: HTMLTableElement, hidden: Set<number>) {
  for (const row of Array.from(t.rows)) {
    let i = 0;
    for (const c of Array.from(row.cells)) {
      const span = Number(c.dataset.cs ?? c.colSpan) || 1;
      if (span > 1 && !c.dataset.cs) c.dataset.cs = String(span);
      let vis = 0;
      for (let k = i; k < i + span; k++) if (!hidden.has(k)) vis++;
      c.style.display = vis ? "" : "none";
      if (span > 1 && vis) c.colSpan = vis;
      i += span;
    }
  }
}

export function ColumnMenu() {
  const path = usePathname() ?? "/";
  const [menu, setMenu] = useState<{ x: number; y: number; key: string; cols: Col[]; hidden: Set<number>; t: HTMLTableElement } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const applyAll = useCallback(() => {
    document.querySelectorAll<HTMLTableElement>(TABLES).forEach((t, i) => { if (t.tHead) paint(t, load(keyOf(path, i), t)); });
  }, [path]);

  useEffect(() => {
    applyAll();
    const root = document.querySelector(".view");
    if (!root) return;
    let raf = 0;
    const mo = new MutationObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(applyAll); });
    mo.observe(root, { childList: true, subtree: true });
    return () => { mo.disconnect(); cancelAnimationFrame(raf); };
  }, [applyAll]);

  useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      const t = (e.target as HTMLElement).closest<HTMLTableElement>("table");
      if (!t || !t.matches(TABLES) || !t.tHead || (e.target as HTMLElement).closest("input,textarea,select")) return;
      const all = Array.from(document.querySelectorAll<HTMLTableElement>(TABLES));
      const key = keyOf(path, all.indexOf(t));
      const cols = headers(t).filter((c) => c.label);
      if (!cols.length) return;
      e.preventDefault();
      setMenu({ x: Math.min(e.clientX, window.innerWidth - 260), y: Math.min(e.clientY, window.innerHeight - 40 - cols.length * 34), key, cols, hidden: load(key, t), t });
    };
    document.addEventListener("contextmenu", onCtx);
    return () => document.removeEventListener("contextmenu", onCtx);
  }, [path]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setMenu(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [menu]);
  useEffect(() => setMenu(null), [path]);

  if (!menu) return null;
  const save = (h: Set<number>) => {
    try { localStorage.setItem(menu.key, JSON.stringify([...h])); } catch { /* sem armazenamento */ }
    paint(menu.t, h);
    setMenu({ ...menu, hidden: h });
  };
  const shown = menu.cols.filter((c) => !menu.hidden.has(c.i)).length;
  return (
    <div ref={box} className="col-menu" role="menu" style={{ left: menu.x, top: Math.max(8, menu.y) }}>
      <div className="col-menu-h"><Icon name="columns" size={15} /> Colunas desta tabela</div>
      {menu.cols.map((c) => (
        <label key={c.i} className="chk" role="menuitemcheckbox" aria-checked={!menu.hidden.has(c.i)}>
          <input type="checkbox" checked={!menu.hidden.has(c.i)} disabled={!menu.hidden.has(c.i) && shown <= 1}
            onChange={(e) => { const h = new Set(menu.hidden); if (e.target.checked) h.delete(c.i); else h.add(c.i); save(h); }} /> {c.label}
        </label>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => { try { localStorage.removeItem(menu.key); } catch { /* */ } const h = load(menu.key, menu.t); paint(menu.t, h); setMenu({ ...menu, hidden: h }); }}>Voltar ao padrão</button>
    </div>
  );
}
