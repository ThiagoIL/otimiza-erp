import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { tenantSession } from "@/lib/context";
import { accessOf } from "@/lib/access";
import { withTenant } from "@/lib/db";
import { attachments } from "@/db/erp";
import { ATTACH_ENTITIES } from "@/server/attachments";
import type { Tenant } from "@/db/schema";

export const dynamic = "force-dynamic";

/** Baixa um anexo. Imagens e PDF abrem no navegador; o resto é baixado. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await tenantSession();
  if (!s || !s.tenant) return new NextResponse("Sessão expirada.", { status: 401 });
  const [a] = await withTenant(s.tenant.id, (tx) => tx.select().from(attachments).where(eq(attachments.id, id)).limit(1));
  if (!a) return new NextResponse("Anexo não encontrado.", { status: 404 });
  const access = await accessOf({ ...s, tenant: s.tenant as Tenant });
  if (!(ATTACH_ENTITIES[a.entity] ?? []).some((m) => access.mods[m] !== "nenhum")) return new NextResponse("Sem acesso.", { status: 403 });
  const inline = /^(image\/(png|jpeg|gif|webp)|application\/pdf)$/.test(a.mime);
  return new NextResponse(Buffer.from(a.data, "base64"), {
    headers: {
      "Content-Type": inline ? a.mime : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(a.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
