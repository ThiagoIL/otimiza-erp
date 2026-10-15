import { ActionButton } from "./client";
import { disconnectSessionAction } from "@/server/admin-actions";
import { fmtDateTime } from "@/lib/format";
import type { Online, Usage } from "@/lib/limits";

const pct = (n: number, max: number | null) => (max ? Math.min(100, Math.round((n / max) * 100)) : 0);

/** Uso do plano: usuários cadastrados e conectados agora, com a barra de ocupação. */
export function PlanBars({ u }: { u: Usage }) {
  const bar = (label: string, n: number, max: number | null, hint: string) => {
    const full = max != null && n >= max;
    return (
      <div className="plan-b">
        <div className="plan-t"><b>{label}</b><span className={full ? "t-bad" : undefined}>{n}{max != null ? ` de ${max}` : ""}</span></div>
        {max != null ? <div className={`prog${full ? " full" : ""}`}><i style={{ width: `${pct(n, max)}%` }} /></div> : <small className="muted">Sem limite</small>}
        <small className="muted">{hint}</small>
      </div>
    );
  };
  return (
    <div className="plan">
      {bar("Usuários cadastrados", u.users, u.maxUsers, "Usuários ativos. Inativos não contam.")}
      {bar("Conectados agora", u.online, u.maxSessions, "Pessoas diferentes usando o sistema ao mesmo tempo.")}
    </div>
  );
}

/** Quem está conectado agora, com a opção de desconectar (libera a vaga de simultâneos). */
export function OnlineTable({ rows, selfSession }: { rows: Online[]; selfSession?: string }) {
  if (!rows.length) return <div className="pb muted">Ninguém conectado agora.</div>;
  return (
    <div className="tbl solo" style={{ border: 0, borderRadius: 0 }}>
      <table className="no-cols">
        <thead><tr><th>Pessoa</th><th>Aparelho</th><th>Entrou em</th><th>Último uso</th><th /></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.sessionId}>
            <td className="desc">{r.name}<div className="t-sub">{r.email}</div></td>
            <td style={{ fontSize: 12.5 }}>{r.device ?? "—"}{r.ip && <div className="t-sub">{r.ip}</div>}</td>
            <td className="code">{fmtDateTime(r.since)}</td><td className="code">{fmtDateTime(r.lastSeen)}</td>
            <td className="acts show">{r.sessionId === selfSession ? <span className="badge">você</span>
              : <ActionButton className="btn btn-ghost btn-sm" confirm={`Desconectar ${r.name} deste aparelho? A pessoa precisará entrar de novo.`} action={disconnectSessionAction.bind(null, r.sessionId)}>Desconectar</ActionButton>}</td>
          </tr>))}</tbody>
      </table>
    </div>
  );
}
