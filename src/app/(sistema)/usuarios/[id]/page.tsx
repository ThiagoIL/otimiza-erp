import { notFound } from "next/navigation";
import { requestArea } from "@/lib/context";
import { AdminUser } from "@/views/admin/user";
import { TenantUser } from "@/views/tenant/user";

export default async function Usuario({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const info = await requestArea();
  if (info.area === "admin") return <AdminUser id={id} />;
  if (info.area === "tenant") return <TenantUser id={id} />;
  notFound();
}
