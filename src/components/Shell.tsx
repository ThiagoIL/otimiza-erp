import type { ReactNode } from "react";
import { LogoLockup } from "./Logo";
import { LogoutButton } from "./LogoutButton";

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

export function Shell({ nav, context, user, roleLabel, children }: {
  nav: ReactNode; context?: ReactNode; user: { name: string; email: string }; roleLabel: string; children: ReactNode;
}) {
  return (
    <div className="app">
      <aside className="rail" aria-label="Menu principal">
        <div className="brand"><LogoLockup height={18} dark /></div>
        {context && <div className="ctx">{context}</div>}
        <nav className="nav">{nav}</nav>
        <div className="rail-foot">Otimiza+ ERP</div>
      </aside>
      <div className="main">
        <header className="top">
          <span className="grow" />
          <div className="who">
            <span className="avatar" aria-hidden="true">{initials(user.name)}</span>
            <div>{user.name}<small>{roleLabel}</small></div>
          </div>
          <LogoutButton />
        </header>
        <main className="view" id="conteudo">{children}</main>
      </div>
    </div>
  );
}
