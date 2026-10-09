"use server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@/lib/db";
import { items, productionOrders, stockBalances, stockLocations, stockMovements } from "@/db/schema";
import { SESSION_EXPIRED, tenantUserForAction } from "@/lib/context";
import { audit } from "@/lib/audit";
import { friendlyDbError } from "@/lib/errors";
import { formObject, keepValues, zDecimal, zodFail } from "@/lib/forms";
import type { ActionState } from "@/lib/action";
import { moveStock, StockError } from "./stock";

const zId = z.string().trim().max(64);
const zQty = (label: string) => zDecimal(label).refine((v) => Number(v) > 0, `${label}: informe uma quantidade maior que zero.`);
/** Endereço interno para voltar depois de salvar (nunca outro domínio). */
const zBack = z.string().max(200).optional().transform((s) => (s && /^\/[a-z0-9/_?=&%-]*$/i.test(s) && !s.startsWith("//") ? s : undefined));

const moveSchema = z.object({
  tipo: z.enum(["ENTRADA", "SAIDA"], { message: "Escolha entrada ou saída." }),
  item: zId.min(1, "Escolha o item."),
  local: zId.min(1, "Escolha o local de estoque."),
  quantidade: zQty("Quantidade"),
  custo: zDecimal("Custo unitário"),
  op: zId.optional(),
  documento: z.string().trim().max(60).optional(),
  observacao: z.string().trim().max(300).optional(),
  voltar: zBack,
});

export async function moveStockAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await tenantUserForAction();
  if (!s) return SESSION_EXPIRED;
  const raw = formObject(fd);
  const p = moveSchema.safeParse(raw);
  if (!p.success) return zodFail(p.error, raw);
  const d = p.data;
  let label = "";
  try {
    await withTenant(s.tenant.id, async (tx) => {
      const [it] = await tx.select({ code: items.code, cost: items.cost }).from(items).where(and(eq(items.id, d.item), eq(items.tenantId, s.tenant.id))).limit(1);
      if (!it) throw new StockError("Item não encontrado.");
      if (d.op) {
        const [op] = await tx.select({ id: productionOrders.id }).from(productionOrders).where(and(eq(productionOrders.id, d.op), eq(productionOrders.tenantId, s.tenant.id))).limit(1);
        if (!op) throw new StockError("Ordem de produção não encontrada.");
      }
      // com ordem de produção: saída é retirada de material, entrada é o produto fabricado
      const origin = d.op ? (d.tipo === "SAIDA" ? "CONSUMO_OP" : "PRODUCAO_OP") : "MANUAL";
      await moveStock(tx, {
        tenantId: s.tenant.id, kind: d.tipo, origin, itemId: d.item, locationId: d.local, quantity: Number(d.quantidade),
        unitCost: d.tipo === "ENTRADA" ? (Number(d.custo) ? d.custo : it.cost) : it.cost, productionOrderId: d.op || null,
        document: d.documento || null, notes: d.observacao || null, user: { id: s.user.id, name: s.user.name },
      });
      label = it.code;
    });
  } catch (err) {
    if (err instanceof StockError) return { error: err.message, values: keepValues(raw) };
    return { error: friendlyDbError(err), values: keepValues(raw) };
  }
  await audit({ action: d.tipo === "ENTRADA" ? "estoque.entrada" : "estoque.saida", tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "item", entityId: d.item, data: { codigo: label, quantidade: d.quantidade, op: d.op || undefined } });
  const msg = `${d.tipo === "ENTRADA" ? "Entrada" : "Saída"} de ${d.quantidade.replace(".", ",")} registrada para ${label}.`;
  if (d.voltar) return { ok: true, redirectTo: `${d.voltar}${d.voltar.includes("?") ? "&" : "?"}msg=${encodeURIComponent(msg)}` };
  return { ok: true, message: msg, values: { tipo: d.tipo, local: d.local } };
}

const locationSchema = z.object({
  id: zId.optional(),
  nome: z.string().trim().min(2, "Informe o nome do local.").max(60, "Use até 60 caracteres."),
  descricao: z.string().trim().max(160).optional(),
  padrao: z.string().optional(),
  ativo: z.string().optional(),
});

export async function saveLocationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await tenantUserForAction();
  if (!s) return SESSION_EXPIRED;
  const raw = formObject(fd);
  const p = locationSchema.safeParse(raw);
  if (!p.success) return zodFail(p.error, raw);
  const d = p.data;
  const values = { name: d.nome, description: d.descricao || null, isDefault: d.padrao === "on", active: d.id ? d.ativo === "on" : true };
  try {
    await withTenant(s.tenant.id, async (tx) => {
      if (values.isDefault) await tx.update(stockLocations).set({ isDefault: false }).where(eq(stockLocations.tenantId, s.tenant.id));
      if (d.id) await tx.update(stockLocations).set(values).where(and(eq(stockLocations.id, d.id), eq(stockLocations.tenantId, s.tenant.id)));
      else await tx.insert(stockLocations).values({ ...values, tenantId: s.tenant.id });
    });
  } catch (err) {
    return { fields: { nome: friendlyDbError(err) }, error: "Confira os campos destacados.", values: keepValues(raw) };
  }
  await audit({ action: d.id ? "local.alterado" : "local.criado", tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "local_estoque", entityId: d.id, data: { nome: d.nome } });
  return { ok: true, message: d.id ? "Local salvo." : `Local "${d.nome}" criado.`, values: d.id ? undefined : {} };
}

export async function deleteLocationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await tenantUserForAction();
  if (!s) return SESSION_EXPIRED;
  if (s.user.role !== "TENANT_ADMIN") return { error: "Apenas administradores da empresa podem excluir locais. Você pode desativá-lo." };
  const id = String(fd.get("id") ?? "");
  const r = await withTenant(s.tenant.id, async (tx) => {
    const [used] = await tx.select({ n: sql<number>`count(*)::int` }).from(stockMovements).where(and(eq(stockMovements.locationId, id), eq(stockMovements.tenantId, s.tenant.id)));
    if (used.n) return -1;
    await tx.delete(stockBalances).where(and(eq(stockBalances.locationId, id), eq(stockBalances.tenantId, s.tenant.id)));
    return (await tx.delete(stockLocations).where(and(eq(stockLocations.id, id), eq(stockLocations.tenantId, s.tenant.id))).returning({ id: stockLocations.id })).length;
  });
  if (r === -1) return { error: "Este local já tem movimentações. Desative-o em vez de excluir." };
  if (!r) return { error: "Local não encontrado." };
  await audit({ action: "local.excluido", tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "local_estoque", entityId: id });
  return { ok: true, message: "Local excluído." };
}
