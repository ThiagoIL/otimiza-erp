"use server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { act, NO_ACCESS } from "@/lib/access";
import { audit } from "@/lib/audit";
import * as E from "@/db/erp";
import { nextNumber, ruleMsg, RuleError, stageIdFor } from "./common";
import type { Tx } from "@/lib/db";
import { docTotals, isDate, today } from "@/lib/dates";
import type { ActionState } from "@/lib/action";
import { db } from "@/lib/db";
import { users } from "@/db/schema";

const num = z.number().finite();
const soSchema = z.object({
  id: z.string().max(64).optional(),
  partnerId: z.string().min(1, "Escolha o cliente.").max(64),
  salespersonId: z.string().max(64).optional().nullable(),
  issueDate: z.string().refine(isDate, "Data de emissão inválida."),
  deliveryDate: z.string().refine((v) => !v || isDate(v), "Data de entrega inválida.").optional().nullable(),
  deliveryPlace: z.string().max(200).optional().nullable(),
  status: z.enum(["PROPOSTA", "APROVADO", "CANCELADO"]),
  stageId: z.string().max(64).optional().nullable(),
  hasAssembly: z.boolean().default(false),
  paymentMethodId: z.string().max(64).optional().nullable(),
  paymentTermId: z.string().max(64).optional().nullable(),
  installments: z.array(z.object({ n: z.number().int(), due: z.string().refine(isDate), value: num })).max(120),
  discount: num.min(0), freight: num.min(0),
  notes: z.string().max(4000).optional().nullable(),
  internalNotes: z.string().max(4000).optional().nullable(),
  custom: z.record(z.string().max(64), z.string().max(500)).default({}),
  items: z.array(z.object({ itemId: z.string().max(64), qty: num.positive("Quantidade deve ser maior que zero."), price: num.min(0), discountPct: num.min(0).max(100), notes: z.string().max(300).optional().nullable() })).max(500),
});
export type SOInput = z.input<typeof soSchema>;

export async function saveSalesOrderAction(input: SOInput): Promise<ActionState & { id?: string }> {
  const s = await act("comercial");
  if (!s) return NO_ACCESS;
  const p = soSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Confira os dados do pedido." };
  const d = p.data;
  if (!d.items.length) return { error: "Inclua pelo menos um item no pedido." };
  const t = docTotals(d.items, d.discount, d.freight);
  if (t.total < 0) return { error: "O desconto é maior que o valor do pedido." };
  let id = d.id ?? "";
  let number = 0;
  try {
    await s.tx(async (tx) => {
      // vendedor vem do cadastro de vendedores (Comercial › Configurações › Vendedores)
      const salespersonName = d.salespersonId
        ? (await tx.select({ n: E.salespeople.name }).from(E.salespeople).where(eq(E.salespeople.id, d.salespersonId)).limit(1))[0]?.n ?? null
        : null;
      // campos personalizados obrigatórios
      const cf = await tx.select().from(E.customFields).where(and(eq(E.customFields.entity, "sales_order"), eq(E.customFields.active, true)));
      const miss = cf.find((f) => f.required && !(d.custom[f.id] ?? "").trim());
      if (miss && d.status !== "CANCELADO") throw new RuleError(`Preencha o campo “${miss.label}”.`);
      const custom = Object.fromEntries(cf.filter((f) => d.custom[f.id] != null && d.custom[f.id] !== "").map((f) => [f.id, d.custom[f.id]]));
      const [cli] = await tx.select({ id: E.partners.id }).from(E.partners).where(eq(E.partners.id, d.partnerId)).limit(1);
      if (!cli) throw new RuleError("Cliente não encontrado.");
      const its = await tx.select({ id: E.items.id }).from(E.items).where(inArray(E.items.id, d.items.map((i) => i.itemId)));
      if (its.length !== new Set(d.items.map((i) => i.itemId)).size) throw new RuleError("Algum item do pedido não existe mais.");
      // etapa escolhida: precisa ter o mesmo comportamento da situação
      if (d.stageId) {
        const [st] = await tx.select({ kind: E.salesStages.kind }).from(E.salesStages).where(eq(E.salesStages.id, d.stageId)).limit(1);
        if (!st || st.kind !== d.status) throw new RuleError("Etapa inválida para este pedido.");
      }
      const values = {
        partnerId: d.partnerId, hasAssembly: d.hasAssembly, salespersonId: d.salespersonId || null, salespersonName, issueDate: d.issueDate, deliveryDate: d.deliveryDate || null,
        deliveryPlace: d.deliveryPlace?.trim() || null, paymentMethodId: d.paymentMethodId || null, paymentTermId: d.paymentTermId || null,
        installments: d.installments, discount: String(d.discount), freight: String(d.freight), total: String(t.total),
        notes: d.notes?.trim() || null, internalNotes: d.internalNotes?.trim() || null, custom,
      };
      if (id) {
        const [cur] = await tx.select().from(E.salesOrders).where(eq(E.salesOrders.id, id)).limit(1).for("update");
        if (!cur) throw new RuleError("Pedido não encontrado.");
        if (cur.status === "FATURADO") throw new RuleError("Pedido já faturado: para alterar, cancele a nota em Faturamento.");
        const hasOp = (await tx.select({ id: E.productionOrders.id }).from(E.productionOrders).where(eq(E.productionOrders.salesOrderId, id)).limit(1)).length > 0;
        if (d.status === "PROPOSTA" && hasOp) throw new RuleError("Este pedido já tem ordem de produção. Ele não pode voltar para proposta.");
        const prod = d.status === "APROVADO" ? (cur.productionStatus ?? "PENDENTE") : d.status === "PROPOSTA" ? null : cur.productionStatus;
        await tx.update(E.salesOrders).set({ ...values, status: d.status, stageId: d.stageId || await stageIdFor(tx, d.status, cur.stageId), productionStatus: prod, approvedAt: d.status === "APROVADO" ? (cur.approvedAt ?? today()) : cur.approvedAt })
          .where(eq(E.salesOrders.id, id));
        await tx.delete(E.salesOrderItems).where(eq(E.salesOrderItems.orderId, id));
        number = cur.number;
      } else {
        number = await nextNumber(tx, s.tenant.id, "sales_order", E.salesOrders, E.salesOrders.number);
        const [r] = await tx.insert(E.salesOrders).values({ ...values, tenantId: s.tenant.id, number, status: d.status, stageId: d.stageId || await stageIdFor(tx, d.status),
          productionStatus: d.status === "APROVADO" ? "PENDENTE" : null, approvedAt: d.status === "APROVADO" ? today() : null }).returning({ id: E.salesOrders.id });
        id = r.id;
      }
      await tx.insert(E.salesOrderItems).values(d.items.map((i, k) => ({ tenantId: s.tenant.id, orderId: id, itemId: i.itemId, qty: String(i.qty), price: String(i.price), discountPct: String(i.discountPct), notes: i.notes?.trim() || null, position: k })));
    });
  } catch (err) {
    return { error: ruleMsg(err) };
  }
  await audit({ action: d.id ? "pedido.alterado" : "pedido.criado", tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "pedido", entityId: id, data: { numero: number, status: d.status } });
  return { ok: true, id, message: `${d.status === "PROPOSTA" ? "Proposta" : "Pedido"} ${number} salvo.`, redirectTo: d.id ? undefined : `/pedidos/${id}` };
}

type Status = "APROVADO" | "PROPOSTA" | "CANCELADO";
/** Troca a situação com as regras de cada uma (e a etapa: a escolhida ou a padrão da situação). */
async function changeStatus(tx: Tx, id: string, status: Status, stageId?: string) {
      const [cur] = await tx.select().from(E.salesOrders).where(eq(E.salesOrders.id, id)).limit(1).for("update");
      if (!cur) throw new RuleError("Pedido não encontrado.");
      if (cur.status === "FATURADO") throw new RuleError("Pedido já faturado. Cancele a nota em Faturamento para reabrir.");
      const ops = await tx.select({ id: E.productionOrders.id }).from(E.productionOrders).where(eq(E.productionOrders.salesOrderId, id)).limit(1);
      if (status === "PROPOSTA" && ops.length) throw new RuleError("Este pedido já tem ordem de produção e não pode voltar para proposta.");
      if (status === "APROVADO") {
        const cf = await tx.select().from(E.customFields).where(and(eq(E.customFields.entity, "sales_order"), eq(E.customFields.active, true), eq(E.customFields.required, true)));
        const miss = cf.find((f) => !(cur.custom[f.id] ?? "").trim());
        if (miss) throw new RuleError(`Preencha o campo “${miss.label}” antes de aprovar.`);
      }
      await tx.update(E.salesOrders).set({
        status, stageId: stageId ?? await stageIdFor(tx, status, cur.stageId),
        productionStatus: status === "APROVADO" ? (cur.productionStatus ?? "PENDENTE") : status === "PROPOSTA" ? null : cur.productionStatus,
        approvedAt: status === "APROVADO" ? (cur.approvedAt ?? today()) : cur.approvedAt,
      }).where(eq(E.salesOrders.id, id));
      return cur.number;
}

/** Aprovar: a proposta vira pedido e entra na fila da produção (que decide se gera OP). */
export async function setSalesStatusAction(id: string, status: Status): Promise<ActionState> {
  const s = await act("comercial");
  if (!s) return NO_ACCESS;
  try {
    const n = await s.tx((tx) => changeStatus(tx, id, status));
    await audit({ action: `pedido.${status.toLowerCase()}`, tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "pedido", entityId: id });
    return { ok: true, message: status === "APROVADO" ? `Pedido ${n} aprovado e enviado para a produção.` : status === "CANCELADO" ? `Pedido ${n} cancelado.` : `Pedido ${n} voltou para proposta.` };
  } catch (err) {
    return { error: ruleMsg(err) };
  }
}

/** Muda a etapa do pedido. Se a etapa tem outro comportamento, troca também a situação (com as mesmas regras). */
export async function setSalesStageAction(id: string, stageId: string): Promise<ActionState> {
  const s = await act("comercial");
  if (!s) return NO_ACCESS;
  try {
    const msg = await s.tx(async (tx) => {
      const [st] = await tx.select().from(E.salesStages).where(eq(E.salesStages.id, stageId)).limit(1);
      const [cur] = await tx.select().from(E.salesOrders).where(eq(E.salesOrders.id, id)).limit(1);
      if (!st || !cur) throw new RuleError("Pedido ou etapa não encontrada.");
      if (st.kind === cur.status) {
        await tx.update(E.salesOrders).set({ stageId }).where(eq(E.salesOrders.id, id));
      } else {
        if (st.kind === "FATURADO") throw new RuleError("Para faturar o pedido, use o botão Faturar.");
        await changeStatus(tx, id, st.kind as Status, stageId);
      }
      return `Pedido ${cur.number} em “${st.name}”.`;
    });
    await audit({ action: "pedido.etapa", tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "pedido", entityId: id, data: { etapa: stageId } });
    return { ok: true, message: msg };
  } catch (err) {
    return { error: ruleMsg(err) };
  }
}

export async function deleteSalesOrderAction(id: string): Promise<ActionState> {
  const s = await act("comercial");
  if (!s) return NO_ACCESS;
  try {
    await s.tx(async (tx) => {
      const [cur] = await tx.select().from(E.salesOrders).where(eq(E.salesOrders.id, id)).limit(1);
      if (!cur) throw new RuleError("Pedido não encontrado.");
      if (cur.status !== "PROPOSTA" && cur.status !== "CANCELADO") throw new RuleError("Só propostas ou pedidos cancelados podem ser excluídos. Cancele o pedido primeiro.");
      const [{ c }] = await tx.select({ c: sql<number>`count(*)::int` }).from(E.productionOrders).where(eq(E.productionOrders.salesOrderId, id));
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(E.invoices).where(eq(E.invoices.salesOrderId, id));
      if (c || n) throw new RuleError("Este pedido tem OP ou nota ligada. Mantenha-o como cancelado.");
      await tx.update(E.crmDeals).set({ salesOrderId: null }).where(eq(E.crmDeals.salesOrderId, id));
      await tx.delete(E.salesOrders).where(eq(E.salesOrders.id, id));
    });
  } catch (err) {
    return { error: ruleMsg(err) };
  }
  await audit({ action: "pedido.excluido", tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "pedido", entityId: id });
  return { ok: true, redirectTo: "/pedidos?msg=Pedido%20exclu%C3%ADdo." };
}

/** Duplicar um pedido como nova proposta (mesmo cliente e itens, datas de hoje). */
export async function duplicateSalesOrderAction(id: string): Promise<ActionState> {
  const s = await act("comercial");
  if (!s) return NO_ACCESS;
  try {
    const newId = await s.tx(async (tx) => {
      const [cur] = await tx.select().from(E.salesOrders).where(eq(E.salesOrders.id, id)).limit(1);
      if (!cur) throw new RuleError("Pedido não encontrado.");
      const its = await tx.select().from(E.salesOrderItems).where(eq(E.salesOrderItems.orderId, id));
      const number = await nextNumber(tx, s.tenant.id, "sales_order", E.salesOrders, E.salesOrders.number);
      const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = cur;
      const [r] = await tx.insert(E.salesOrders).values({ ...rest, number, status: "PROPOSTA", stageId: await stageIdFor(tx, "PROPOSTA"), productionStatus: null, approvedAt: null, issueDate: today(), deliveryDate: null, installments: [], crmDealId: null }).returning({ id: E.salesOrders.id });
      if (its.length) await tx.insert(E.salesOrderItems).values(its.map(({ id: _x, createdAt: _y, updatedAt: _z, ...i }) => ({ ...i, orderId: r.id })));
      return r.id;
    });
    return { ok: true, message: "Proposta duplicada.", redirectTo: `/pedidos/${newId}` };
  } catch (err) {
    return { error: ruleMsg(err) };
  }
}
