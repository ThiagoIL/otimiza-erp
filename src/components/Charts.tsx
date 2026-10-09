/**
 * Gráficos simples em HTML/CSS, sem biblioteca: uma série por gráfico, cor única (magnitude),
 * valor escrito ao lado da barra e dica ao passar o mouse (title).
 */
import Link from "next/link";

export type Bar = { label: string; value: number; display?: string; href?: string };

/** Barras horizontais: comparar quantidades entre categorias. */
export function BarList({ data, empty = "Sem dados no período.", tone }: { data: Bar[]; empty?: string; tone?: "warn" | "bad" | "ok" }) {
  if (!data.length) return <p className="muted chart-empty">{empty}</p>;
  const max = Math.max(...data.map((d) => d.value), 0) || 1;
  return (
    <ul className={`barlist${tone ? ` ${tone}` : ""}`}>
      {data.map((d) => {
        const label = d.href ? <Link href={d.href}>{d.label}</Link> : d.label;
        return (
          <li key={d.label} title={`${d.label}: ${d.display ?? d.value}`}>
            <span className="bl-l">{label}</span>
            <span className="bl-track"><span className="bl-bar" style={{ width: d.value > 0 ? `${Math.max(1.5, (d.value / max) * 100)}%` : 0 }} /></span>
            <span className="bl-v">{d.display ?? d.value}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Colunas por período (meses, semanas): mostra a evolução no tempo. */
export function Columns({ data, label }: { data: Bar[]; label: string }) {
  const max = Math.max(...data.map((d) => d.value), 0) || 1;
  const total = data.reduce((a, d) => a + d.value, 0);
  if (!total) return <p className="muted chart-empty">Sem dados no período.</p>;
  return (
    <div className="cols" role="img" aria-label={`${label}: ${data.map((d) => `${d.label} ${d.display ?? d.value}`).join("; ")}`}>
      {data.map((d) => (
        <div key={d.label} className="col" title={`${d.label}: ${d.display ?? d.value}`}>
          <span className="col-v">{d.value ? d.display ?? d.value : ""}</span>
          <span className="col-track">{d.value > 0 && <span className="col-bar" style={{ height: `${(d.value / max) * 100}%` }} />}</span>
          <span className="col-l">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
