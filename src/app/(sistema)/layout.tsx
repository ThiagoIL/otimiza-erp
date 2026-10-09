import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { NavLink } from "@/components/NavLink";
import { adminSession, currentTenant, requestArea, tenantSession } from "@/lib/context";
import { ROLE_LABEL } from "@/lib/rules";
import { Icon } from "@/components/Icon";
import { MODULES } from "@/lib/modules";

export const dynamic = "force-dynamic";

/** Moldura do sistema: escolhe o menu conforme o domínio (painel do sistema ou empresa). */
export default async function SistemaLayout({ children }: { children: React.ReactNode }) {
  const info = await requestArea();

  if (info.area === "admin") {
    const s = await adminSession();
    if (!s) redirect("/login");
    return (
      <Shell user={s.user} roleLabel={s.user.isMaster ? "Administrador do sistema · master" : "Administrador do sistema"}
        context={<><span>Área</span><b>Administração do sistema</b></>}
        nav={<>
          <NavLink href="/" exact>Painel</NavLink>
          <NavLink href="/empresas">Empresas</NavLink>
          <NavLink href="/administradores">Administradores</NavLink>
          <NavLink href="/auditoria">Auditoria</NavLink>
          <span className="nav-sec">Conta</span>
          <NavLink href="/conta">Minha conta</NavLink>
        </>}>
        {children}
      </Shell>
    );
  }

  if (info.area === "tenant") {
    const t = await currentTenant();
    const s = await tenantSession();
    if (!s || t.status !== "ACTIVE") redirect("/login");
    const admin = s.user.role === "TENANT_ADMIN";
    return (
      <Shell user={s.user} roleLabel={ROLE_LABEL[s.user.role]} context={<><span>Empresa</span><b>{t.name}</b></>}
        nav={<>
          <NavLink href="/" exact><Icon name="home" />Início</NavLink>
          <NavLink href="/dashboards"><Icon name="chart" />Dashboards</NavLink>
          <NavLink href="/fluxo"><Icon name="flow" />Fluxo do sistema</NavLink>
          <span className="nav-sec">Módulos</span>
          {MODULES.filter((m) => !m.soon).map((m) => <NavLink key={m.key} href={m.href}><Icon name={m.icon} />{m.label}</NavLink>)}
          <span className="nav-sec">Em breve</span>
          {MODULES.filter((m) => m.soon).map((m) => <NavLink key={m.key} href={m.href}><Icon name={m.icon} />{m.label}</NavLink>)}
          <span className="nav-sec">Conta</span>
          {admin && <NavLink href="/usuarios"><Icon name="users" />Usuários</NavLink>}
          <NavLink href="/conta"><Icon name="user" />Minha conta</NavLink>
        </>}>
        {children}
      </Shell>
    );
  }

  // domínio principal: só a página de apresentação
  return <>{children}</>;
}
