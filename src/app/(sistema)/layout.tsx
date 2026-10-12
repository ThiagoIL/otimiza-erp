import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { adminSession, currentTenant, requestArea, tenantSession } from "@/lib/context";
import { accessOf } from "@/lib/access";
import { ADMIN_NAV, TENANT_NAV } from "@/lib/modules";
import { ensureDefaults } from "@/server/common";
import { ROLE_LABEL } from "@/lib/rules";
import type { Tenant } from "@/db/schema";

export const dynamic = "force-dynamic";

/** Moldura do sistema: escolhe o menu conforme o domínio (painel do sistema ou empresa). */
export default async function SistemaLayout({ children }: { children: React.ReactNode }) {
  const info = await requestArea();

  if (info.area === "admin") {
    const s = await adminSession();
    if (!s) redirect("/login");
    return (
      <Suspense>
        <Shell nav={ADMIN_NAV} user={s.user} roleLabel={s.user.isMaster ? "Administrador do sistema · master" : "Administrador do sistema"}>
          {children}
        </Shell>
      </Suspense>
    );
  }

  if (info.area === "tenant") {
    const t = await currentTenant();
    const s = await tenantSession();
    if (!s || t.status !== "ACTIVE") redirect("/login");
    await ensureDefaults(t.id);
    const access = await accessOf({ ...s, tenant: s.tenant as Tenant });
    const nav = TENANT_NAV.filter((m) => !m.perm || (m.perm === "admin" ? access.isAdmin : access.mods[m.perm] !== "nenhum"));
    const readOnly = Object.entries(access.mods).filter(([, l]) => l === "ver").map(([k]) => k);
    return (
      <Suspense>
        <Shell nav={nav} context={t.name} user={s.user} readOnly={readOnly}
          roleLabel={access.profileName && !access.isAdmin ? access.profileName : ROLE_LABEL[s.user.role]}>
          {children}
        </Shell>
      </Suspense>
    );
  }

  // domínio principal: só a página de apresentação
  return <>{children}</>;
}
