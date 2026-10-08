import { notFound } from "next/navigation";
import { requestArea, requireAdmin, requireTenantUser } from "@/lib/context";
import { AccountPage } from "@/components/AccountPage";
import { ROLE_LABEL } from "@/lib/rules";

export default async function Conta() {
  const info = await requestArea();
  if (info.area === "admin") {
    const s = await requireAdmin({ allowPasswordChange: true });
    return <AccountPage user={s.user} mustChange={s.user.mustChangePassword} roleLabel={s.user.isMaster ? "Administrador do sistema · conta master" : "Administrador do sistema"} />;
  }
  if (info.area === "tenant") {
    const s = await requireTenantUser({ allowPasswordChange: true });
    return <AccountPage user={s.user} mustChange={s.user.mustChangePassword} roleLabel={`${ROLE_LABEL[s.user.role]} · ${s.tenant.name}`} />;
  }
  notFound();
}
