"use client";
import { useState } from "react";
import { Icon } from "./Icon";
import { useRun } from "./client";
import { closeStockAction, createInventoryAction, saveCountsAction } from "@/server/stock-actions";
import { today } from "@/lib/dates";

type Opt = [string, string];
const q = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function NewInventory({ locations, groups }: { locations: Opt[]; groups: Opt[] }) {
  const [f, setF] = useState({ locationId: locations[0]?.[0] ?? "", groupId: "", date: today(), description: "", withZero: false });
  const { run, pending } = useRun();
  return (
    <section className="panel" style={{ marginBottom: 16 }}>
      <h2>Abrir novo inventário</h2>
      <div className="pb"><div className="form f4">
        <div className="fld"><label htmlFor="iv_l">Local</label><select id="iv_l" value={f.locationId} onChange={(e) => setF({ ...f, locationId: e.target.value })}>{locations.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="fld"><label htmlFor="iv_g">Grupo de itens</label><select id="iv_g" value={f.groupId} onChange={(e) => setF({ ...f, groupId: e.target.value })}><option value="">Todos os grupos</option>{groups.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="fld"><label htmlFor="iv_d">Data da contagem</label><input id="iv_d" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        <div className="fld"><label htmlFor="iv_x">Descrição</label><input id="iv_x" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Ex.: Inventário de fim de mês" /></div>
        <div className="fld span2"><label className="chk"><input type="checkbox" checked={f.withZero} onChange={(e) => setF({ ...f, withZero: e.target.checked })} /> Incluir itens sem saldo no local</label></div>
        <div className="fld span2" style={{ alignItems: "flex-end", display: "flex", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-primary" disabled={pending || !f.locationId} onClick={() => run(() => createInventoryAction({ ...f, groupId: f.groupId || null }))}><Icon name="plus" size={16} /> Abrir inventário</button>
        </div>
      </div></div>
    </section>
  );
}

export function InventoryCount({ inventoryId, rows, editable }: { inventoryId: string; editable: boolean; rows: { id: string; code: string; name: string; unit: string; address: string | null; system: number; counted: number | null; cost: number }[] }) {
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.id, r.counted == null ? "" : String(r.counted)])));
  const [dirty, setDirty] = useState(false);
  const [qf, setQf] = useState("");
  const [only, setOnly] = useState<"" | "pend" | "dif">("");
  const { run, pending } = useRun();
  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
  const list = rows.filter((r) => {
    if (qf && !(r.code + " " + r.name).toLowerCase().includes(qf.toLowerCase())) return false;
    const c = num(vals[r.id] ?? "");
    if (only === "pend") return c == null;
    if (only === "dif") return c != null && c !== r.system;
    return true;
  });
  return (
    <>
      <div className="bar">
        <div className="search"><Icon name="search" size={16} /><input type="search" value={qf} onChange={(e) => setQf(e.target.value)} placeholder="Código ou descrição" aria-label="Buscar item" /></div>
        <select value={only} onChange={(e) => setOnly(e.target.value as "" | "pend" | "dif")} aria-label="Mostrar"><option value="">Todos os itens</option><option value="pend">Ainda não contados</option><option value="dif">Com diferença</option></select>
        <span className="grow" /><span className="count">{list.length} itens</span>
        {editable && <button type="button" className="btn btn-primary" disabled={!dirty || pending} onClick={() => run(() => saveCountsAction(inventoryId, rows.map((r) => ({ id: r.id, counted: num(vals[r.id] ?? "") }))), () => setDirty(false))}>{pending ? "Salvando…" : "Salvar contagem"}</button>}
      </div>
      <div className="tbl">
        <table>
          <thead><tr><th>Código</th><th>Descrição</th><th>Endereço</th><th className="num">Saldo no sistema</th><th className="num" style={{ width: 150 }}>Quantidade contada</th><th className="num">Diferença</th><th className="num">Valor da diferença</th></tr></thead>
          <tbody>{list.map((r) => {
            const c = num(vals[r.id] ?? "");
            const dif = c == null ? null : c - r.system;
            return (
              <tr key={r.id} className={dif ? "flag" : ""}>
                <td className="code">{r.code}</td><td className="desc">{r.name}</td><td style={{ fontSize: 12.5 }}>{r.address ?? "—"}</td>
                <td className="num">{q(r.system)} {r.unit}</td>
                <td className="num">{editable ? <input inputMode="decimal" value={vals[r.id] ?? ""} onChange={(e) => { setVals({ ...vals, [r.id]: e.target.value }); setDirty(true); }} style={{ width: 120, height: 30, textAlign: "right" }} aria-label={`Contado de ${r.name}`} /> : c == null ? "—" : q(c)}</td>
                <td className={`num${dif ? (dif > 0 ? " t-ok" : " t-bad") : ""}`}>{dif == null ? "—" : `${dif > 0 ? "+" : ""}${q(dif)}`}</td>
                <td className="num">{dif ? brl(dif * r.cost) : "—"}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      {editable && dirty && <div className="sticky-foot"><span className="left muted">Há contagens não salvas.</span><button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(() => saveCountsAction(inventoryId, rows.map((r) => ({ id: r.id, counted: num(vals[r.id] ?? "") }))), () => setDirty(false))}>Salvar contagem</button></div>}
    </>
  );
}

export function CloseStock({ lastDate }: { lastDate: string | null }) {
  const lastOfPrev = (() => { const d = new Date(); d.setDate(0); return d.toISOString().slice(0, 10); })();
  const [date, setDate] = useState(lastOfPrev > (lastDate ?? "") ? lastOfPrev : today());
  const [notes, setNotes] = useState("");
  const { run, pending } = useRun();
  return (
    <section className="panel" style={{ marginBottom: 16 }}>
      <h2>Fechar estoque {lastDate && <span className="muted h-sub">último fechamento: {lastDate.split("-").reverse().join("/")}</span>}</h2>
      <div className="pb"><div className="form f4">
        <div className="fld"><label htmlFor="fc_d">Fechar até a data</label><input id="fc_d" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="fld span2"><label htmlFor="fc_n">Observação</label><input id="fc_n" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: Fechamento mensal" /></div>
        <div className="fld" style={{ alignSelf: "end" }}>
          <button type="button" className="btn btn-primary" disabled={pending} onClick={() => { if (confirm(`Fechar o estoque até ${date.split("-").reverse().join("/")}? Lançamentos até essa data ficarão travados.`)) run(() => closeStockAction(date, notes)); }}><Icon name="lock" size={16} /> Fechar estoque</button>
        </div>
      </div></div>
    </section>
  );
}
