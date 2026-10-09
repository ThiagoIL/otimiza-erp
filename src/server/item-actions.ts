"use server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@/lib/db";
import { itemGroups, items } from "@/db/schema";
import { SESSION_EXPIRED, tenantUserForAction } from "@/lib/context";
import { audit } from "@/lib/audit";
import { friendlyDbError } from "@/lib/errors";
import { formObject, keepValues, zDecimal, zodFail } from "@/lib/forms";
import type { ActionState } from "@/lib/action";

const itemSchema = z.object({
  id: z.string().max(64).optional(),
  codigo: z.string().trim().min(1, "Informe o código.").max(30, "Use até 30 caracteres."),
  descricao: z.string().trim().min(2, "Informe a descrição.").max(160, "Descrição muito longa."),
  unidade: z.string().trim().toUpperCase().min(1, "Informe a unidade.").max(6, "Use até 6 letras."),
  tipo: z.enum(["MATERIA_PRIMA", "SEMIACABADO", "PRODUTO_ACABADO", "CONSUMO", "REVENDA"]),
  grupo: z.string().max(64).optional(),
  estoque_minimo: zDecimal("Estoque mínimo"),
  custo: zDecimal("Custo"),
  preco_venda: zDecimal("Preço de venda"),
  ncm: z.string().trim().transform((s) => s.replace(/\D/g, "")).refine((s) => s === "" || s.length === 8, "O NCM tem 8 dígitos.").optional(),
  ativo: z.string().optional(),
});

class NotFound extends Error {}

export async function saveItemAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await tenantUserForAction();
  if (!s) return SESSION_EXPIRED;
  const raw = formObject(fd);
  const p = itemSchema.safeParse(raw);
  if (!p.success) return zodFail(p.error, raw);
  const d = p.data;
  const values = {
    code: d.codigo, name: d.descricao, unit: d.unidade, type: d.tipo, groupId: d.grupo || null,
    minStock: d.estoque_minimo, cost: d.custo, salePrice: d.preco_venda, ncm: d.ncm || null, active: d.ativo === "on",
  };
  let id = d.id ?? "";
  try {
    await withTenant(s.tenant.id, async (tx) => {
      if (id) {
        const r = await tx.update(items).set(values).where(and(eq(items.id, id), eq(items.tenantId, s.tenant.id))).returning({ id: items.id });
        if (!r.length) throw new NotFound();
      } else {
        const [r] = await tx.insert(items).values({ ...values, tenantId: s.tenant.id }).returning({ id: items.id });
        id = r.id;
      }
    });
  } catch (err) {
    if (err instanceof NotFound) return { error: "Item não encontrado." };
    const msg = friendlyDbError(err);
    return msg.includes("código") ? { fields: { codigo: msg }, error: "Confira os campos destacados.", values: keepValues(raw) } : { error: msg, values: keepValues(raw) };
  }
  await audit({ action: d.id ? "item.alterado" : "item.criado", tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "item", entityId: id, data: { codigo: d.codigo } });
  return { ok: true, redirectTo: `/estoque/itens?salvo=${encodeURIComponent(d.codigo)}` };
}

export async function deleteItemAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await tenantUserForAction();
  if (!s) return SESSION_EXPIRED;
  if (s.user.role !== "TENANT_ADMIN") return { error: "Apenas administradores da empresa podem excluir itens. Você pode desativá-lo." };
  const id = String(fd.get("id") ?? "");
  try {
    const n = await withTenant(s.tenant.id, (tx) => tx.delete(items).where(and(eq(items.id, id), eq(items.tenantId, s.tenant.id))).returning({ code: items.code }));
    if (!n.length) return { error: "Item não encontrado." };
    await audit({ action: "item.excluido", tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "item", entityId: id, data: { codigo: n[0].code } });
  } catch (err) {
    return { error: friendlyDbError(err, "Não foi possível excluir o item.") };
  }
  return { ok: true, redirectTo: "/estoque/itens?excluido=1" };
}

const groupSchema = z.object({ nome: z.string().trim().min(2, "Informe o nome do grupo.").max(60) });

export async function createGroupAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await tenantUserForAction();
  if (!s) return SESSION_EXPIRED;
  const raw = formObject(fd);
  const p = groupSchema.safeParse(raw);
  if (!p.success) return zodFail(p.error, raw);
  try {
    await withTenant(s.tenant.id, (tx) => tx.insert(itemGroups).values({ tenantId: s.tenant.id, name: p.data.nome }));
  } catch (err) {
    return { fields: { nome: friendlyDbError(err) }, error: "Confira os campos destacados.", values: keepValues(raw) };
  }
  await audit({ action: "grupo.criado", tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "grupo", data: { nome: p.data.nome } });
  return { ok: true, message: `Grupo "${p.data.nome}" criado.`, values: {} };
}

export async function deleteGroupAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await tenantUserForAction();
  if (!s) return SESSION_EXPIRED;
  if (s.user.role !== "TENANT_ADMIN") return { error: "Apenas administradores da empresa podem excluir grupos." };
  const id = String(fd.get("id") ?? "");
  const n = await withTenant(s.tenant.id, async (tx) => {
    const inUse = await tx.select({ id: items.id }).from(items).where(and(eq(items.groupId, id), eq(items.tenantId, s.tenant.id))).limit(1);
    if (inUse.length) return -1;
    return (await tx.delete(itemGroups).where(and(eq(itemGroups.id, id), eq(itemGroups.tenantId, s.tenant.id))).returning({ id: itemGroups.id })).length;
  });
  if (n === -1) return { error: "Há itens neste grupo. Mude o grupo deles antes de excluir." };
  if (!n) return { error: "Grupo não encontrado." };
  await audit({ action: "grupo.excluido", tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "grupo", entityId: id });
  return { ok: true, message: "Grupo excluído." };
}
