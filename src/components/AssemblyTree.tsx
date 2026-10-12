"use client";
import { useState } from "react";
import { Icon } from "./Icon";
import { Modal, useRun } from "./client";
import { ItemPicker } from "./ItemPicker";
import { deleteLocationAction, deletePartAction, saveAssemblyAction, saveLocationAction, savePartAction, setLocationStageAction, setPartDoneAction } from "@/server/assembly-actions";

type Opt = [string, string];
export type Loc = { id: string; parentId: string | null; name: string; type: string | null; stageId: string | null; installerId: string | null; helperId: string | null };
export type Part = { id: string; locationId: string; itemId: string | null; label: string; code: string | null; unit: string; qty: number; done: number };
export type AStage = { id: string; name: string; color: string };
const TIPOS = ["Andar", "Bloco", "Apartamento", "Ambiente", "Veículo", "Setor", "Outro"];
const q = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

export function AssemblyTree({ assemblyId, locs, parts, stages, team, canEdit }: { assemblyId: string; locs: Loc[]; parts: Part[]; stages: AStage[]; team: Opt[]; canEdit: boolean }) {
  const [fold, setFold] = useState<Record<string, boolean>>({});
  const [editLoc, setEditLoc] = useState<Partial<Loc> | null>(null);
  const [editPart, setEditPart] = useState<{ locId: string; part?: Part } | null>(null);
  const { run } = useRun();
  const kids = (pid: string | null) => locs.filter((l) => (l.parentId ?? null) === pid);
  const sub = (l: Loc): { t: number; m: number } => {
    let t = 0, m = 0;
    for (const p of parts.filter((x) => x.locationId === l.id)) { t += p.qty; m += Math.min(p.done, p.qty); }
    for (const c of kids(l.id)) { const r = sub(c); t += r.t; m += r.m; }
    return { t, m };
  };
  const name = (id: string | null) => team.find(([v]) => v === id)?.[1];
  const node = (l: Loc, depth: number): React.ReactNode => {
    const ch = kids(l.id); const ps = parts.filter((p) => p.locationId === l.id);
    const open = !fold[l.id]; const st = sub(l); const pct = st.t ? (st.m / st.t) * 100 : 0;
    const et = stages.find((s) => s.id === l.stageId);
    return (
      <div key={l.id} className="tn" style={{ ["--d" as string]: depth }}>
        <div className="tn-row">
          <button type="button" className="tn-c" aria-expanded={open} onClick={() => setFold({ ...fold, [l.id]: open })} style={ch.length || ps.length ? undefined : { visibility: "hidden" }} aria-label={open ? "Recolher" : "Expandir"}><Icon name="chev" size={14} /></button>
          <span className="tn-tipo">{l.type ?? "Local"}</span><b className="tn-n">{l.name}</b>
          {(l.installerId || l.helperId) && <span className="tn-team">{name(l.installerId)}{l.helperId && <span className="muted"> + {name(l.helperId)}</span>}</span>}
          <span className="grow" />
          {(l.stageId || ps.length > 0) && (canEdit
            ? <select className="et-sel" value={l.stageId ?? ""} style={{ ["--c" as string]: et?.color ?? "#6B7785" }} aria-label={`Etapa de ${l.name}`} onChange={(e) => run(() => setLocationStageAction(l.id, e.target.value))}><option value="">Sem etapa</option>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            : et && <span className="badge stat-badge" style={{ ["--c" as string]: et.color }}>{et.name}</span>)}
          {st.t ? <div className="cell-prog" style={{ ["--c" as string]: et?.color ?? "#1E3A5F", width: 150 }}><div className="prog"><i style={{ width: `${Math.min(100, pct)}%` }} /></div><span className="prog-t">{Math.round(pct)}%</span></div> : <span className="muted" style={{ fontSize: 12, width: 150 }}>sem peças</span>}
          {canEdit && <span className="tn-acts">
            <button type="button" className="btn btn-ghost btn-sm" title="Adicionar sublocal" onClick={() => setEditLoc({ parentId: l.id, type: "Ambiente", stageId: stages[0]?.id ?? null })}><Icon name="plus" size={14} /></button>
            <button type="button" className="btn btn-ghost btn-sm" title="Adicionar peça" onClick={() => setEditPart({ locId: l.id })}><Icon name="box" size={14} /></button>
            <button type="button" className="btn btn-ghost btn-sm" title="Editar local" onClick={() => setEditLoc(l)}><Icon name="edit" size={14} /></button>
          </span>}
        </div>
        {open && <>
          {ps.length > 0 && <table className="pecas"><tbody>{ps.map((p) => {
            const done = p.done >= p.qty;
            return (
              <tr key={p.id} className={done ? "done" : ""}>
                <td>{canEdit ? <button type="button" className={`ck${done ? " on" : ""}`} aria-label={done ? "Desmarcar" : "Marcar como montada"} onClick={() => run(() => setPartDoneAction(p.id, done ? 0 : p.qty))}><Icon name="check" size={13} /></button> : <span className={`ck${done ? " on" : ""}`}><Icon name="check" size={13} /></span>}</td>
                <td className="pd">{p.label}{p.code && <span className="muted"> · {p.code}</span>}</td>
                <td className="num">{canEdit ? <input type="number" min={0} max={p.qty} step="any" defaultValue={p.done} key={p.done} onBlur={(e) => { const v = Number(e.target.value) || 0; if (v !== p.done) run(() => setPartDoneAction(p.id, v)); }} aria-label="Quantidade montada" /> : q(p.done)} <span className="muted">de {q(p.qty)} {p.unit}</span></td>
                <td className="acts show">{canEdit && <button type="button" className="btn btn-ghost btn-sm" aria-label="Editar peça" onClick={() => setEditPart({ locId: l.id, part: p })}><Icon name="edit" size={13} /></button>}</td>
              </tr>
            );
          })}</tbody></table>}
          {ch.map((c) => node(c, depth + 1))}
        </>}
      </div>
    );
  };
  const roots = kids(null);
  return (
    <>
      <div className="panel tree">
        {roots.length ? roots.map((l) => node(l, 0)) : <div className="empty"><strong>Nenhum local cadastrado</strong>Comece pelo primeiro nível: um andar, um apartamento, um ambiente ou um veículo.</div>}
        {canEdit && <div className="pb" style={{ borderTop: "1px solid var(--line-2)" }}><button type="button" className="btn btn-sm" onClick={() => setEditLoc({ parentId: null, type: "Andar", stageId: stages[0]?.id ?? null })}><Icon name="plus" size={14} /> Adicionar local</button></div>}
      </div>
      {editLoc && <LocModal loc={editLoc} assemblyId={assemblyId} locs={locs} stages={stages} team={team} onClose={() => setEditLoc(null)} />}
      {editPart && <PartModal assemblyId={assemblyId} locId={editPart.locId} part={editPart.part} onClose={() => setEditPart(null)} />}
    </>
  );
}

function LocModal({ loc, assemblyId, locs, stages, team, onClose }: { loc: Partial<Loc>; assemblyId: string; locs: Loc[]; stages: AStage[]; team: Opt[]; onClose: () => void }) {
  const [d, setD] = useState(loc);
  const { run, pending } = useRun();
  const path = (l: Loc) => { const n: string[] = []; let c: Loc | undefined = l; while (c) { n.unshift(c.name); c = locs.find((y) => y.id === c!.parentId); } return n.join(" › "); };
  return (
    <Modal title={d.id ? "Editar local" : "Novo local"} size="wide" onClose={onClose}
      foot={<>
        {d.id && <button type="button" className="btn btn-danger left" disabled={pending} onClick={() => { if (confirm(`Excluir “${d.name}”, os locais dentro dele e as peças?`)) run(() => deleteLocationAction(d.id!), onClose); }}><Icon name="trash" size={16} /> Excluir local</button>}
        <button type="button" className="btn" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn btn-primary" disabled={pending || !d.name?.trim()} onClick={() => run(() => saveLocationAction({ id: d.id, assemblyId, parentId: d.parentId ?? null, name: d.name ?? "", type: d.type ?? null, stageId: d.stageId ?? null, installerId: d.installerId ?? null, helperId: d.helperId ?? null }), onClose)}>{d.id ? "Salvar" : "Adicionar local"}</button>
      </>}>
      <div className="form">
        <div className="fld"><label htmlFor="l_n">Nome <span className="req">*</span></label><input id="l_n" value={d.name ?? ""} onChange={(e) => setD({ ...d, name: e.target.value })} autoFocus placeholder="Ex.: Apto 101, Cozinha, Veículo ABC1D23" /></div>
        <div className="fld"><label htmlFor="l_t">Tipo</label><select id="l_t" value={d.type ?? ""} onChange={(e) => setD({ ...d, type: e.target.value })}>{TIPOS.map((t) => <option key={t}>{t}</option>)}</select></div>
        <div className="fld full"><label htmlFor="l_p">Fica dentro de</label><select id="l_p" value={d.parentId ?? ""} onChange={(e) => setD({ ...d, parentId: e.target.value || null })}><option value="">Primeiro nível</option>{locs.filter((l) => l.id !== d.id).map((l) => <option key={l.id} value={l.id}>{path(l)}</option>)}</select></div>
        <div className="fld"><label htmlFor="l_i">Montador</label><select id="l_i" value={d.installerId ?? ""} onChange={(e) => setD({ ...d, installerId: e.target.value || null })}><option value="">Ninguém</option>{team.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="fld"><label htmlFor="l_h">Auxiliar</label><select id="l_h" value={d.helperId ?? ""} onChange={(e) => setD({ ...d, helperId: e.target.value || null })}><option value="">Ninguém</option>{team.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="fld"><label htmlFor="l_s">Etapa</label><select id="l_s" value={d.stageId ?? ""} onChange={(e) => setD({ ...d, stageId: e.target.value || null })}><option value="">Sem etapa</option>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
      </div>
    </Modal>
  );
}

function PartModal({ assemblyId, locId, part, onClose }: { assemblyId: string; locId: string; part?: Part; onClose: () => void }) {
  const [d, setD] = useState({ itemId: part?.itemId ?? "", label: part?.itemId ? part.label : "", description: part?.itemId ? "" : part?.label ?? "", qty: String(part?.qty ?? 1), done: String(part?.done ?? 0) });
  const [pick, setPick] = useState(false);
  const { run, pending } = useRun();
  return (
    <Modal title={part ? "Editar peça" : "Nova peça"} onClose={onClose}
      foot={<>
        {part && <button type="button" className="btn btn-danger left" disabled={pending} onClick={() => run(() => deletePartAction(part.id), onClose)}><Icon name="trash" size={16} /> Remover</button>}
        <button type="button" className="btn" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(() => savePartAction({ id: part?.id, assemblyId, locationId: locId, itemId: d.itemId || null, description: d.description, qty: Number(d.qty.replace(",", ".")) || 0, qtyDone: Number(d.done.replace(",", ".")) || 0 }), onClose)}>{part ? "Salvar" : "Adicionar peça"}</button>
      </>}>
      <div className="form">
        <div className="fld full"><span className="flabel">Item do cadastro</span><div style={{ display: "flex", gap: 8 }}><input readOnly value={d.label} placeholder="Nenhum" onClick={() => setPick(true)} aria-label="Item" /><button type="button" className="btn" onClick={() => setPick(true)}><Icon name="search" size={15} /></button>{d.itemId && <button type="button" className="btn" onClick={() => setD({ ...d, itemId: "", label: "" })}><Icon name="x" size={15} /></button>}</div></div>
        {!d.itemId && <div className="fld full"><label htmlFor="p_d">Ou descreva a peça</label><input id="p_d" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} /></div>}
        <div className="fld"><label htmlFor="p_q">Quantidade</label><input id="p_q" inputMode="decimal" value={d.qty} onChange={(e) => setD({ ...d, qty: e.target.value })} /></div>
        <div className="fld"><label htmlFor="p_m">Já montadas</label><input id="p_m" inputMode="decimal" value={d.done} onChange={(e) => setD({ ...d, done: e.target.value })} /></div>
      </div>
      {pick && <ItemPicker single onClose={() => setPick(false)} onPick={([r]) => { setD({ ...d, itemId: r.id, label: `${r.name} · ${r.code}` }); setPick(false); }} />}
    </Modal>
  );
}

export function AssemblyHeaderEdit({ a, team }: { a: { id: string; name: string; address: string | null; responsibleId: string | null; startDate: string | null; dueDate: string | null; notes: string | null }; team: Opt[] }) {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState(a);
  const { run, pending } = useRun();
  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}><Icon name="edit" size={16} /> Editar dados</button>
      {open && <Modal title="Editar montagem" size="wide" onClose={() => setOpen(false)}
        foot={<><button type="button" className="btn" onClick={() => setOpen(false)}>Cancelar</button><button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(() => saveAssemblyAction(d), () => setOpen(false))}>Salvar</button></>}>
        <div className="form">
          <div className="fld full"><label htmlFor="a_n">Nome</label><input id="a_n" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></div>
          <div className="fld full"><label htmlFor="a_e">Endereço ou local</label><input id="a_e" value={d.address ?? ""} onChange={(e) => setD({ ...d, address: e.target.value })} /></div>
          <div className="fld"><label htmlFor="a_r">Responsável</label><select id="a_r" value={d.responsibleId ?? ""} onChange={(e) => setD({ ...d, responsibleId: e.target.value || null })}><option value="">Ninguém</option>{team.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div className="fld"><label htmlFor="a_i">Início</label><input id="a_i" type="date" value={d.startDate ?? ""} onChange={(e) => setD({ ...d, startDate: e.target.value })} /></div>
          <div className="fld"><label htmlFor="a_p">Previsão de término</label><input id="a_p" type="date" value={d.dueDate ?? ""} onChange={(e) => setD({ ...d, dueDate: e.target.value })} /></div>
          <div className="fld full"><label htmlFor="a_o">Observações</label><textarea id="a_o" rows={3} value={d.notes ?? ""} onChange={(e) => setD({ ...d, notes: e.target.value })} /></div>
        </div>
      </Modal>}
    </>
  );
}
