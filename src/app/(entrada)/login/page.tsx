import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { LoginScreen } from "@/components/LoginScreen";
import { adminSession, findTenant, requestArea, tenantSession } from "@/lib/context";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Entrar" };

export default async function Login() {
  const info = await requestArea();
  if (info.area === "admin") {
    if (await adminSession()) redirect("/");
    return <LoginScreen tag="Administração do sistema" title="Entrar" subtitle="Acesso restrito aos administradores do Otimiza+ ERP." />;
  }
  if (info.area === "tenant") {
    const t = await findTenant(info.slug);
    if (!t) notFound();
    if (t.status === "ACTIVE" && (await tenantSession())) redirect("/");
    return (
      <LoginScreen tag={t.name} title="Entrar" subtitle={`Use o e-mail e a senha de acesso da ${t.name}.`}
        blocked={t.status !== "ACTIVE" ? "O acesso desta empresa está suspenso. Fale com o suporte do Otimiza+ ERP." : undefined} />
    );
  }
  redirect("/");
}
