"use server";
import { eq } from "drizzle-orm";
import { tenantUserForAction } from "@/lib/context";
import { accessOf } from "@/lib/access";
import { withTenant } from "@/lib/db";
import { attachments } from "@/db/erp";
import { ATTACH_ENTITIES } from "./attachments";
import type { ActionState } from "@/lib/action";

export async function deleteAttachmentAction(id: string): Promise<ActionState> {
  const s = await tenantUserForAction();
  if (!s) return { error: "Sessão expirada. Entre novamente." };
  const access = await accessOf(s);
  return withTenant(s.tenant.id, async (tx) => {
    const [a] = await tx.select({ entity: attachments.entity }).from(attachments).where(eq(attachments.id, id)).limit(1);
    if (!a) return { error: "Anexo não encontrado." };
    if (!(ATTACH_ENTITIES[a.entity] ?? []).some((m) => access.mods[m] === "editar")) return { error: "Você não tem permissão para excluir este anexo." };
    await tx.delete(attachments).where(eq(attachments.id, id));
    return { ok: true, message: "Anexo excluído." };
  });
}
