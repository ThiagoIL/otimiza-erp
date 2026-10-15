"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { LogoLockup } from "./Logo";
import { Icon } from "./Icon";
import { Toaster, Flash } from "./Toast";
import { logoutAction } from "@/server/auth-actions";
import { matchNav, type NavModule } from "@/lib/modules";
import { ColumnMenu } from "./ColumnMenu";
import { Bell } from "./Comm";

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

/**
 * Logo da empresa no menu. O fundo do quadro pega a cor do canto da imagem, então uma logo
 * com fundo próprio (cinza, colorido) fica emendada no quadro em vez de parecer uma figura pequena no meio.
 */
function CtxLogo({ src }: { src: string }) {
  const [bg, setBg] = useState<string | undefined>();
  return (
    <span className="ctx-logo" style={bg ? { background: bg } : undefined}>
      <img src={src} alt="" onLoad={(e) => {
        try {
          const img = e.currentTarget, c = document.createElement("canvas");
          c.width = c.height = 1;
          const ctx = c.getContext("2d");
          if (!ctx) return;
          ctx.drawImage(img, 0, 0, 1, 1, 0, 0, 1, 1); // pixel do canto superior esquerdo
          const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
          setBg(a > 200 ? `rgb(${r},${g},${b})` : undefined);
        } catch { /* mantém o fundo branco */ }
      }} />
    </span>
  );
}

/** Moldura do sistema: menu lateral por módulo (como no protótipo), barra superior e avisos. */
export function Shell({ nav, context, logo, user, roleLabel, readOnly, bell, children }: {
  nav: NavModule[]; context?: string; /** endereço da logo da empresa */ logo?: string | null; user: { name: string; email: string }; roleLabel: string;
  /** sininho de avisos (só nas empresas) */
  bell?: boolean;
  /** módulos em que o usuário só consulta */
  readOnly?: string[]; children: ReactNode;
}) {
  const path = usePathname() ?? "/";
  const cur = matchNav(nav, path);
  const [open, setOpen] = useState(false); // menu no celular
  const [fold, setFold] = useState<string | null>(null); // módulo atual recolhido
  const [peek, setPeek] = useState<string | null>(null); // outro módulo aberto
  useEffect(() => { setOpen(false); setFold(null); setPeek(null); }, [path]);
  const ro = !!cur && readOnly?.includes(cur.mod.perm ?? "");

  return (
    <div className={`app${open ? " open" : ""}`}>
      <aside className="rail" aria-label="Menu principal">
        <div className="brand"><Link href="/" aria-label="Início"><LogoLockup height={18} dark /></Link></div>
        {context && <div className={`ctx${logo ? " has-logo" : ""}`}>{logo && <CtxLogo src={logo} />}<span>Empresa</span><b>{context}</b></div>}
        <nav className="nav">
          {nav.map((m) => {
            const active = cur?.mod.id === m.id;
            if (m.href) {
              return <Link key={m.id} className="nav-m" href={m.href} aria-current={active ? "page" : undefined}><Icon name={m.icon} /><span>{m.label}</span></Link>;
            }
            const expanded = active ? fold !== m.id : peek === m.id;
            return (
              <div className="nav-grp" key={m.id}>
                <button type="button" className={`nav-m${active ? " on" : ""}`} aria-expanded={expanded}
                  onClick={() => active ? setFold(fold === m.id ? null : m.id) : setPeek(peek === m.id ? null : m.id)}>
                  <Icon name={m.icon} /><span>{m.label}</span><Icon name="chev" size={14} />
                </button>
                {expanded && (
                  <div className="nav-sub">
                    {m.items!.map((it) => <Link key={it.href} href={it.href} aria-current={cur?.item === it ? "page" : undefined}>{it.label}</Link>)}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <div className="rail-foot">Otimiza+ ERP</div>
      </aside>
      <div className="scrim" onClick={() => setOpen(false)} />
      <div className="main">
        <header className="top">
          <button className="btn btn-ghost btn-icon menu-btn" type="button" aria-label="Abrir menu" onClick={() => setOpen(!open)}><Icon name="menu" /></button>
          <div className="crumb">
            {cur?.item ? <>{cur.mod.label} <span aria-hidden="true">›</span> <b>{cur.item.label}</b></> : <b>{cur?.mod.label ?? (path.startsWith("/conta") ? "Minha conta" : "")}</b>}
            {ro && <span className="ro-chip">Somente consulta</span>}
          </div>
          <div className="top-right">
            {bell && <Bell />}
            <Link className="user" href="/conta" title={`${user.email} · ${roleLabel}`} style={{ textDecoration: "none", color: "inherit" }}>
              <span className="avatar">{initials(user.name)}</span>
              <span className="uname">{user.name}<small>{roleLabel}</small></span>
            </Link>
            <button className="btn btn-ghost btn-icon" type="button" aria-label="Sair" title="Sair"
              onClick={async () => { if (confirm("Sair do sistema?")) { await logoutAction(); window.location.assign("/login"); } }}>
              <Icon name="logout" />
            </button>
          </div>
        </header>
        <main className={`view${ro ? " ro" : ""}`} id="conteudo">
          {cur?.item?.tabs && (
            <nav className="subtabs" aria-label={cur.item.label}>
              {cur.item.tabs.map((t) => <Link key={t.href} href={t.href} aria-current={cur.tab === t ? "page" : undefined}>{t.label}</Link>)}
            </nav>
          )}
          {children}
        </main>
      </div>
      <ColumnMenu />
      <Toaster />
      <Flash />
    </div>
  );
}
