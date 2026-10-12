import { NextResponse, type NextRequest } from "next/server";
import { tenantSession } from "@/lib/context";
import { accessOf } from "@/lib/access";
import { withTenant } from "@/lib/db";
import { attachments } from "@/db/erp";
import { ATTACH_ENTITIES, MAX_ATTACH_BYTES } from "@/server/attachments";
import type { Tenant } from "@/db/schema";

export const dynamic = "force-dynamic";

/** Envio de anexo (multipart). Só aceita chamadas do próprio sistema e de quem pode editar o módulo. */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  const s = await tenantSession();
  if (!s || !s.tenant || s.user.mustChangePassword) return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
  const fd = await req.formData().catch(() => null);
  if (!fd) return NextResponse.json({ error: "Envio inválido." }, { status: 400 });
  const entity = String(fd.get("entity") ?? "");
  const entityId = String(fd.get("entityId") ?? "").slice(0, 64);
  const file = fd.get("file");
  const mods = ATTACH_ENTITIES[entity];
  if (!mods || !entityId || !(file instanceof File)) return NextResponse.json({ error: "Envio inválido." }, { status: 400 });
  const access = await accessOf({ ...s, tenant: s.tenant as Tenant });
  if (!mods.some((m) => access.mods[m] === "editar")) return NextResponse.json({ error: "Você não tem permissão para anexar aqui." }, { status: 403 });
  if (file.size > MAX_ATTACH_BYTES) return NextResponse.json({ error: "O arquivo passa de 8 MB." }, { status: 413 });
  if (!file.size) return NextResponse.json({ error: "Arquivo vazio." }, { status: 400 });
  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  const name = file.name.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 160) || "arquivo";
  await withTenant(s.tenant.id, (tx) => tx.insert(attachments).values({
    tenantId: s.tenant!.id, entity, entityId, fileName: name, mime: (file.type || "application/octet-stream").slice(0, 120), size: file.size, data, userName: s.user.name,
  }));
  return NextResponse.json({ ok: true });
}
