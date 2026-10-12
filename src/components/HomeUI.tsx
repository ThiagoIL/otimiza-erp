"use client";
import Link from "next/link";
import { useState } from "react";
import { Icon, type IconName } from "./Icon";

export type Alert = { mod: string; sev: 0 | 1 | 2; icon: IconName; t: string; s: string; href: string };
const SEV = ["ok", "warn", "bad"] as const;

/** Alertas por módulo, com abas e rolagem interna (a página inicial cabe na tela). */
export function HomeAlerts({ alerts, mods }: { alerts: Alert[]; mods: [string, string][] }) {
  const [m, setM] = useState("");
  const list = m ? alerts.filter((a) => a.mod === m) : alerts;
  return (
    <section className="panel" aria-label="Alertas">
      <h2>Alertas</h2>
      <div className="al-tabs" role="tablist" aria-label="Filtrar alertas por módulo">
        <button role="tab" type="button" aria-selected={!m} onClick={() => setM("")}>Todos <b>{alerts.length}</b></button>
        {mods.map(([k, l]) => { const n = alerts.filter((a) => a.mod === k).length; return <button key={k} role="tab" type="button" aria-selected={m === k} className={n ? "" : "zero"} onClick={() => setM(k)}>{l} <b>{n}</b></button>; })}
      </div>
      <div className="al-scroll">
        {list.length ? (
          <div className="al-grid">
            {list.map((a, i) => (
              <Link key={i} className="al" href={a.href}>
                <span className={`al-i ${SEV[a.sev]}`}><Icon name={a.sev === 0 ? "check" : a.icon} size={16} /></span>
                <span className="t"><b>{a.t}</b><small>{a.s}</small></span>
              </Link>
            ))}
          </div>
        ) : <div className="pb muted">Nenhum alerta{m ? " neste módulo" : ""}. Tudo em dia.</div>}
      </div>
    </section>
  );
}
