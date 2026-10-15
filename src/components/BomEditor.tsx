"use client";
import { useState } from "react";
import { Sel } from "./SearchPicker";
import { Icon } from "./Icon";
import { ItemPicker } from "./ItemPicker";
import { useRun } from "./client";
import { saveBomAction } from "@/server/item-actions";

export type BomLine = { itemId: string; code: string; name: string; unit: string; qty: number; lossPct: number; cost: number; supply: string };
export type RouteLine = { workCenterId: string; hours: number };
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Estrutura do produto (materiais por unidade) e roteiro (horas por centro de trabalho). */
export function BomEditor({ itemId, unit, initial, routing, centers, showCost, canEdit, salePrice }: {
  itemId: string; unit: string; initial: BomLine[]; routing: RouteLine[]; centers: { id: string; name: string; costPerHour: number }[];
  showCost: boolean; canEdit: boolean; salePrice: number;
}) {
  const [lines, setLines] = useState(initial);
  const [rot, setRot] = useState(routing);
  const [pick, setPick] = useState(false);
  const [dirty, setDirty] = useState(false);
  const { run, pending } = useRun();
  const upd = <T,>(set: React.Dispatch<React.SetStateAction<T[]>>, i: number, patch: Partial<T>) => { set((a) => a.map((x, k) => (k === i ? { ...x, ...patch } : x))); setDirty(true); };
  const mat = lines.reduce((t, l) => t + l.qty * (1 + l.lossPct / 100) * l.cost, 0);
  const horas = rot.reduce((t, r) => t + r.hours, 0);
  const mo = rot.reduce((t, r) => t + r.hours * (centers.find((c) => c.id === r.workCenterId)?.costPerHour ?? 0), 0);
  return (
    <section className="panel sec-panel" id="estrutura">
      <h2>Estrutura do produto <span className="muted h-sub">quantidades para fabricar 1 {unit}</span></h2>
      <div className="pb">
        <p className="muted" style={{ margin: "0 0 10px", fontSize: 13 }}>Ao criar uma ordem de produção, estes itens são copiados para a OP já multiplicados pela quantidade. A perda (%) cobre sobras de corte e refugo.
          Em <b>Operação</b>, diga se o item é <b>fabricado</b> na OP (a fábrica aponta quando a peça fica pronta) ou <b>retirado do estoque</b> (entra na requisição de material da OP).</p>
        <div className="tbl solo items-t">
          <table>
            <thead><tr><th>Código</th><th>Material</th><th style={{ width: 190 }}>Operação</th><th className="num" style={{ width: 120 }}>Qtd.</th><th style={{ width: 50 }}>Un.</th><th className="num" style={{ width: 100 }}>Perda %</th>{showCost && <th className="num" style={{ width: 120 }}>Custo</th>}<th style={{ width: 40 }} /></tr></thead>
            <tbody>
              {lines.length ? lines.map((l, i) => (
                <tr key={l.itemId + i}>
                  <td className="code">{l.code}</td><td className="desc">{l.name}</td>
                  <td><select value={l.supply} disabled={!canEdit} onChange={(e) => upd(setLines, i, { supply: e.target.value })} aria-label="Operação" className={l.supply === "FABRICADO" ? "sup-fab" : "sup-est"}>
                    <option value="FABRICADO">Fabricado na OP</option><option value="ESTOQUE">Retirada do estoque</option></select></td>
                  <td><input type="number" step="any" min={0} value={l.qty} disabled={!canEdit} onChange={(e) => upd(setLines, i, { qty: Number(e.target.value) || 0 })} aria-label="Quantidade" /></td>
                  <td>{l.unit}</td>
                  <td><input type="number" step="any" min={0} value={l.lossPct} disabled={!canEdit} onChange={(e) => upd(setLines, i, { lossPct: Number(e.target.value) || 0 })} aria-label="Perda" /></td>
                  {showCost && <td className="num">{brl(l.qty * (1 + l.lossPct / 100) * l.cost)}</td>}
                  <td>{canEdit && <button type="button" className="btn btn-ghost btn-sm" aria-label="Remover" onClick={() => { setLines(lines.filter((_, k) => k !== i)); setDirty(true); }}><Icon name="x" size={14} /></button>}</td>
                </tr>
              )) : <tr><td colSpan={8} className="muted">Nenhum material. Adicione os componentes que formam o produto.</td></tr>}
            </tbody>
          </table>
        </div>
        {canEdit && <button type="button" className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => setPick(true)}><Icon name="search" size={14} /> Pesquisar materiais</button>}

        <h3 className="sec">Roteiro · horas por centro de trabalho</h3>
        <div className="tbl solo items-t">
          <table>
            <thead><tr><th>Centro de trabalho</th><th className="num" style={{ width: 120 }}>Horas</th>{showCost && <th className="num" style={{ width: 130 }}>Custo</th>}<th style={{ width: 40 }} /></tr></thead>
            <tbody>
              {rot.length ? rot.map((r, i) => (
                <tr key={i}>
                  <td><Sel value={r.workCenterId} disabled={!canEdit} onChange={(e) => upd(setRot, i, { workCenterId: e.target.value })} aria-label="Centro"><option value="">Centro…</option>{centers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Sel></td>
                  <td><input type="number" step="any" min={0} value={r.hours} disabled={!canEdit} onChange={(e) => upd(setRot, i, { hours: Number(e.target.value) || 0 })} aria-label="Horas" /></td>
                  {showCost && <td className="num">{brl(r.hours * (centers.find((c) => c.id === r.workCenterId)?.costPerHour ?? 0))}</td>}
                  <td>{canEdit && <button type="button" className="btn btn-ghost btn-sm" aria-label="Remover" onClick={() => { setRot(rot.filter((_, k) => k !== i)); setDirty(true); }}><Icon name="x" size={14} /></button>}</td>
                </tr>
              )) : <tr><td colSpan={4} className="muted">Sem roteiro. As horas entram no custo padrão e na comparação com os apontamentos.</td></tr>}
            </tbody>
          </table>
        </div>
        {canEdit && <button type="button" className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => { setRot([...rot, { workCenterId: "", hours: 1 }]); setDirty(true); }}><Icon name="plus" size={14} /> Adicionar centro</button>}

        <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap", marginTop: 14 }}>
          {showCost && (
            <div className="totals" style={{ minWidth: 300, marginTop: 0 }}>
              <dl>
                <div><dt>Materiais</dt><dd>{brl(mat)}</dd></div>
                <div><dt>Mão de obra ({horas.toLocaleString("pt-BR")} h)</dt><dd>{brl(mo)}</dd></div>
                <div className="big"><dt>Custo padrão</dt><dd>{brl(mat + mo)}</dd></div>
                {salePrice > 0 && <div><dt>Margem sobre o preço de venda</dt><dd>{(((salePrice - mat - mo) / salePrice) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</dd></div>}
              </dl>
            </div>
          )}
          <span style={{ flex: 1 }} />
          {canEdit && <button type="button" className="btn btn-primary" disabled={!dirty || pending}
            onClick={() => run(() => saveBomAction({ itemId, components: lines.filter((l) => l.qty > 0).map((l) => ({ itemId: l.itemId, qty: l.qty, lossPct: l.lossPct, supply: l.supply as "ESTOQUE" })), routing: rot.filter((r) => r.workCenterId && r.hours > 0) }), () => setDirty(false))}>
            {pending ? "Salvando…" : "Salvar estrutura"}</button>}
        </div>
      </div>
      {pick && <ItemPicker title="Adicionar materiais à estrutura" priceLabel="Custo" priceOf={(r) => r.cost} exclude={itemId} onClose={() => setPick(false)}
        onPick={(rows) => { setLines([...lines, ...rows.filter((r) => !lines.some((l) => l.itemId === r.id)).map((r) => ({ itemId: r.id, code: r.code, name: r.name, unit: r.unit, qty: r.qty || 1, lossPct: 0, cost: r.cost, supply: r.type === "PRODUTO_ACABADO" || r.type === "SEMIACABADO" ? "FABRICADO" : "ESTOQUE" }))]); setDirty(true); setPick(false); }} />}
    </section>
  );
}
