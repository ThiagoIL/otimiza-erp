import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

/** Cabeçalho de página: título, descrição e ações. */
export function PageHead({ title, sub, back, actions, children }: { title: ReactNode; sub?: ReactNode; back?: { href: string; label: string }; actions?: ReactNode; children?: ReactNode }) {
  return (
    <>
      {back && <Link className="back" href={back.href}>{back.label}</Link>}
      <div className="ph">
        <div><h1>{title}</h1>{sub && <p>{sub}</p>}{children}</div>
        {actions && <div className="acts">{actions}</div>}
      </div>
    </>
  );
}

export function BtnLink({ href, children, primary, icon, small, className = "" }: { href: string; children: ReactNode; primary?: boolean; icon?: IconName; small?: boolean; className?: string }) {
  return <Link className={`btn${primary ? " btn-primary" : ""}${small ? " btn-sm" : ""} ${className}`} href={href}>{icon && <Icon name={icon} size={16} />}{children}</Link>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><strong>{title}</strong>{children}</div>;
}

export function Badge({ children, tone }: { children: ReactNode; tone?: "ok" | "warn" | "bad" | "brand" }) {
  return <span className={`badge${tone ? " " + tone : ""}`}>{children}</span>;
}

export function StatusBadge({ color, label }: { color: string; label: string }) {
  return <span className="badge stat-badge" style={{ ["--c" as string]: color }}><span className="dot" style={{ background: color }} />{label}</span>;
}

export const Active = ({ on }: { on: boolean }) => on ? <span className="badge ok">Ativo</span> : <span className="badge">Inativo</span>;

export function Kpi({ value, label, alert, href }: { value: ReactNode; label: string; alert?: boolean; href?: string }) {
  const c = `kpi${alert ? " alert" : ""}`;
  return href ? <Link className={c} href={href}><b>{value}</b><span>{label}</span></Link> : <div className={c}><b>{value}</b><span>{label}</span></div>;
}

export function Panel({ title, sub, children, className = "", id, actions }: { title?: ReactNode; sub?: ReactNode; children: ReactNode; className?: string; id?: string; actions?: ReactNode }) {
  return (
    <section className={`panel ${className}`} id={id}>
      {title && <h2>{title}{sub && <span className="muted h-sub">{sub}</span>}{actions && <span style={{ marginLeft: sub ? 8 : "auto", display: "flex", gap: 6 }}>{actions}</span>}</h2>}
      {children}
    </section>
  );
}

export function Pager({ page, pages, qs }: { page: number; pages: number; qs: (p: number) => string }) {
  if (pages <= 1) return null;
  return (
    <div className="pager">
      {page > 1 && <Link className="btn btn-sm" href={qs(page - 1)}>Anterior</Link>}
      <span>Página {page} de {pages}</span>
      {page < pages && <Link className="btn btn-sm" href={qs(page + 1)}>Próxima</Link>}
    </div>
  );
}

/** Monta o link de paginação mantendo os filtros. */
export function pageLink(sp: Record<string, string | undefined>) {
  return (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== "p" && k !== "msg" && k !== "erro") q.set(k, v);
    q.set("p", String(p));
    return `?${q}`;
  };
}

export const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");
