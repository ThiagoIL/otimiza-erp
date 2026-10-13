"use client";
import Link from "next/link";
import { useState } from "react";
import { Icon, type IconName } from "./Icon";

export type Alert = { mod: string; sev: 0 | 1 | 2; icon: IconName; t: string; s: string; href: string };
const SEV = ["ok", "warn", "bad"] as const;

/** Alertas por módulo, com abas; mostra os 8 primeiros e um "Ver mais" (igual ao protótipo). */
export function HomeAlerts({ alerts, mods }: { alerts: Alert[]; mods: [string, string][] }) {
  const [m, setM] = useState("");
  const [all, setAll] = useState(false);
  const list = m ? alerts.filter((a) => a.mod === m) : alerts;
  const LIM = 8;
  const shown = all ? list : list.slice(0, LIM);
  return (
    <section className="panel" aria-label="Alertas" style={{ marginBottom: 18 }}>
      <h2>Alertas</h2>
      <div className="al-tabs" role="tablist" aria-label="Filtrar alertas por módulo">
        <button role="tab" type="button" aria-selected={!m} onClick={() => { setM(""); setAll(false); }}>Todos <b>{alerts.length}</b></button>
        {mods.map(([k, l]) => { const n = alerts.filter((a) => a.mod === k).length; return <button key={k} role="tab" type="button" aria-selected={m === k} className={n ? "" : "zero"} onClick={() => { setM(k); setAll(false); }}>{l} <b>{n}</b></button>; })}
      </div>
      <div>
        {list.length ? (<>
          <div className="al-grid">
            {shown.map((a, i) => (
              <Link key={i} className="al" href={a.href}>
                <span className={`al-i ${SEV[a.sev]}`}><Icon name={a.sev === 0 ? "check" : a.icon} size={16} /></span>
                <span className="t"><b>{a.t}</b><small>{a.s}</small></span>
              </Link>
            ))}
          </div>
          {list.length > LIM && !all && <button type="button" className="al-more" onClick={() => setAll(true)}>Ver mais {list.length - LIM} {list.length - LIM === 1 ? "alerta" : "alertas"}</button>}
        </>) : <div className="pb muted">Nenhum alerta{m ? " neste módulo" : ""}. Tudo em dia.</div>}
      </div>
    </section>
  );
}
