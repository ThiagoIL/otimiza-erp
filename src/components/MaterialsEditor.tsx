"use client";
import { useState } from "react";
import { useFormResult } from "./Form";

type Opt = { id: string; label: string; unit: string };
type Line = { item: string; qtd: string };

/** Lista de materiais previstos da ordem de produção. Enviada ao servidor em JSON no campo "materiais". */
export function MaterialsEditor({ options, initial }: { options: Opt[]; initial?: Line[] }) {
  const st = useFormResult();
  const [lines, setLines] = useState<Line[]>(() => {
    // depois de um erro, volta com o que foi digitado
    try { if (st.values?.materiais) return JSON.parse(st.values.materiais) as Line[]; } catch { /* usa o inicial */ }
    return initial ?? [];
  });
  const set = (i: number, k: keyof Line, v: string) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const filled = lines.filter((l) => l.item || l.qtd);
  return (
    <div className="full lines">
      <input type="hidden" name="materiais" value={JSON.stringify(filled)} />
      <div className="lines-head"><b>Materiais previstos</b><small>O que deve sair do estoque para esta ordem. A retirada é feita depois, pela própria ordem.</small></div>
      {lines.length > 0 && (
        <table className="lines-tbl"><thead><tr><th>Material</th><th className="num" style={{ width: 150 }}>Quantidade</th><th style={{ width: 40 }} /></tr></thead>
          <tbody>{lines.map((l, i) => {
            const o = options.find((x) => x.id === l.item);
            return (
              <tr key={i}>
                <td><select aria-label={`Material da linha ${i + 1}`} value={l.item} onChange={(e) => set(i, "item", e.target.value)}>
                  <option value="">Escolha o material</option>{options.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></td>
                <td><div className="with-unit"><input aria-label={`Quantidade da linha ${i + 1}`} inputMode="decimal" value={l.qtd} onChange={(e) => set(i, "qtd", e.target.value)} placeholder="0" className="num" /><span>{o?.unit ?? ""}</span></div></td>
                <td><button type="button" className="btn btn-sm btn-ghost" aria-label={`Remover linha ${i + 1}`} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>✕</button></td>
              </tr>
            );
          })}</tbody></table>
      )}
      <button type="button" className="btn btn-sm" onClick={() => setLines((ls) => [...ls, { item: "", qtd: "" }])}>+ Adicionar material</button>
    </div>
  );
}
