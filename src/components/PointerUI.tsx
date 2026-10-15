"use client";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "./Icon";
import { useRun } from "./client";
import { Sel } from "./SearchPicker";
import { toast } from "./Toast";
import { deleteReportAction, myReportsAction, reportLinesAction, reportTargetsAction, saveReportAction, type Line, type MyReport, type Target } from "@/server/report-actions";
import { fmtD, today } from "@/lib/dates";

type Kind = "FABRICA" | "MONTAGEM";
const qf = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

/**
 * Tela de apontar (boa para celular e tablet): escolhe fábrica ou montagem, pesquisa a OP ou a montagem,
 * toca no que ficou pronto e informa a quantidade. Embaixo, os apontamentos de hoje, que dá para desfazer.
 */
export function PointerScreen({ kinds, team, locations }: { kinds: Kind[]; team: [string, string][]; locations: [string, string][] }) {
  const [kind, setKind] = useState<Kind>(kinds[0] ?? "FABRICA");
  const [q, setQ] = useState("");
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [lines, setLines] = useState<Line[] | null>(null);
  const [line, setLine] = useState<Line | null>(null);
  const [f, setF] = useState({ qty: "", memberId: "", date: today(), notes: "", loc: "" });
  const [mine, setMine] = useState<MyReport[]>([]);
  const { run, pending } = useRun();

  const loadMine = useCallback(async () => { const r = await myReportsAction(); if (!("error" in r)) setMine(r.rows); }, []);
  useEffect(() => { loadMine(); }, [loadMine]);
  useEffect(() => {
    let live = true;
    setTargets(null);
    const t = setTimeout(async () => { const r = await reportTargetsAction(kind, q); if (!live) return; if ("error" in r) toast(r.error, true); else setTargets(r.rows); }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [kind, q]);
  const openTarget = async (t: Target) => {
    setTarget(t); setLines(null); setLine(null);
    const r = await reportLinesAction(kind, t.id);
    if ("error" in r) toast(r.error, true); else setLines(r.lines);
  };
  const reload = async () => {
    if (!target) return;
    const r = await reportLinesAction(kind, target.id);
    if (!("error" in r)) setLines(r.lines);
    loadMine();
  };
  const left = line ? Math.max(0, line.required - line.done) : 0;
  const save = () => {
    if (!target || !line) return;
    const qty = Number(f.qty.replace(",", "."));
    run(() => saveReportAction({ kind, targetId: target.id, line: line.key, qty, date: f.date, memberId: f.memberId || null, notes: f.notes, locationId: f.loc || null }),
      () => { setLine(null); setF({ ...f, qty: "", notes: "" }); reload(); });
  };

  return (
    <div className="pointer">
      {kinds.length > 1 && (
        <div className="seg big" role="group" aria-label="Onde">
          {kinds.map((k) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => { setKind(k); setTarget(null); setLines(null); setLine(null); }}>
            <Icon name={k === "FABRICA" ? "factory" : "tool"} size={18} /> {k === "FABRICA" ? "Fábrica" : "Montagem"}</button>)}
        </div>
      )}

      {!target ? (
        <section className="panel">
          <h2>{kind === "FABRICA" ? "Escolha a ordem de produção" : "Escolha a montagem"}</h2>
          <div className="pb">
            <div className="search big"><Icon name="search" size={18} /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={kind === "FABRICA" ? "Nº da OP, produto ou cliente" : "Nº da montagem, nome, cliente ou endereço"} aria-label="Pesquisar" /></div>
            <div className="pt-list">
              {targets == null ? <p className="muted">Carregando…</p> : targets.length ? targets.map((t) => (
                <button key={t.id} type="button" className="pt-card" onClick={() => openTarget(t)}>
                  <b>{t.title}</b><small>{t.sub}</small>
                  <span className="pt-prog"><span className="prog"><i style={{ width: `${t.progress}%` }} /></span><span className="prog-t">{t.progress}%</span>{t.due && <span className={`badge${t.due < today() ? " bad" : ""}`}>{fmtD(t.due)}</span>}</span>
                </button>
              )) : <p className="muted">Nada em aberto {q ? "nesta pesquisa" : "agora"}.</p>}
            </div>
          </div>
        </section>
      ) : (
        <section className="panel">
          <h2><button type="button" className="btn btn-ghost btn-sm" onClick={() => { setTarget(null); setLines(null); setLine(null); }}>‹ Voltar</button> {target.title}</h2>
          <div className="pb">
            <p className="muted" style={{ marginTop: 0 }}>{kind === "FABRICA" ? "Toque no que ficou pronto: o produto final entra no estoque; as peças e estruturas avançam a OP." : "Toque na peça que foi montada."}</p>
            <div className="pt-list">
              {lines == null ? <p className="muted">Carregando…</p> : lines.length ? lines.map((l) => {
                const ok = l.done >= l.required - 1e-9;
                return (
                  <button key={l.key} type="button" className={`pt-card line${ok ? " done" : ""}${line?.key === l.key ? " on" : ""}`} disabled={ok}
                    onClick={() => { setLine(l); setF({ ...f, qty: String(Math.max(0, l.required - l.done)) }); }}>
                    <span className="pt-kind">{l.kind}</span><b>{l.label}</b>{l.code && <small>{l.code}</small>}
                    <span className="pt-prog"><span className="prog"><i style={{ width: `${l.required ? Math.min(100, (l.done / l.required) * 100) : 0}%` }} /></span><span className="prog-t">{qf(l.done)} de {qf(l.required)} {l.unit}</span></span>
                  </button>
                );
              }) : <p className="muted">Nada para apontar aqui.</p>}
            </div>
          </div>
        </section>
      )}

      {line && target && (
        <section className="panel pt-form">
          <h2>Apontar: {line.label}</h2>
          <div className="pb">
            <div className="form f4">
              <div className="fld"><label htmlFor="pt_q">Quantidade pronta ({line.unit || "un."})</label>
                <div className="qty-big">
                  <button type="button" className="btn" onClick={() => setF({ ...f, qty: String(Math.max(0, (Number(f.qty.replace(",", ".")) || 0) - 1)) })} aria-label="Menos um">−</button>
                  <input id="pt_q" inputMode="decimal" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} />
                  <button type="button" className="btn" onClick={() => setF({ ...f, qty: String((Number(f.qty.replace(",", ".")) || 0) + 1) })} aria-label="Mais um">+</button>
                </div><small>Faltam {qf(left)}.</small></div>
              <div className="fld"><label htmlFor="pt_m">Quem fez</label><Sel id="pt_m" value={f.memberId} onChange={(e) => setF({ ...f, memberId: e.target.value })} aria-label="Pessoa"><option value="">Não informar</option>{team.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel></div>
              <div className="fld"><label htmlFor="pt_d">Data</label><input id="pt_d" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
              {kind === "FABRICA" && line.key === "final" && <div className="fld"><label htmlFor="pt_l">Entra no estoque em</label><Sel id="pt_l" value={f.loc} onChange={(e) => setF({ ...f, loc: e.target.value })} aria-label="Local de estoque"><option value="">Local padrão do produto</option>{locations.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel></div>}
              <div className="fld full"><label htmlFor="pt_n">Observação</label><input id="pt_n" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
            </div>
            <div className="pt-acts">
              <button type="button" className="btn" onClick={() => setLine(null)}>Cancelar</button>
              <button type="button" className="btn btn-primary big" disabled={pending || !(Number(f.qty.replace(",", ".")) > 0)} onClick={save}><Icon name="check" size={18} /> Apontar</button>
            </div>
          </div>
        </section>
      )}

      <section className="panel">
        <h2>Meus apontamentos de hoje <span className="n">{mine.length}</span></h2>
        {mine.length ? <div className="tbl solo" style={{ border: 0, borderRadius: 0 }}><table className="no-cols">
          <tbody>{mine.map((m) => (
            <tr key={m.id}><td className="code">{new Date(m.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</td><td className="desc">{m.label}<div className="t-sub">{m.target}</div></td>
              <td className="num"><b>{qf(m.qty)}</b></td>
              <td className="acts show"><button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => { if (confirm("Desfazer este apontamento?")) run(() => deleteReportAction(m.id), () => { loadMine(); reload(); }); }}>Desfazer</button></td></tr>))}</tbody>
        </table></div> : <div className="pb muted">Nenhum apontamento hoje.</div>}
      </section>
    </div>
  );
}
