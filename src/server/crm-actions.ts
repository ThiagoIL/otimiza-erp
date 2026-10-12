"use server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { act, NO_ACCESS } from "@/lib/access";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import * as E from "@/db/erp";
import { nextNumber, ruleMsg, RuleError } from "./common";
import { isDate, today } from "@/lib/dates";
import type { ActionState } from "@/lib/action";

const s0 = (max = 200) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);
const dealSchema = z.object({
  id: z.string().max(64).optional(),
  title: z.string().trim().min(2, "Informe o título da oportunidade.").max(160),
  partnerId: s0(64), leadName: s0(), leadCompany: s0(), leadPhone: s0(30), leadEmail: s0(160),
  stageId: z.string().min(1).max(64), value: z.number().min(0).max(1e12),
  expectedClose: z.string().optional().nullable().refine((v) => !v || isDate(v), "Data inválida.").transform((v) => v || null),
  ownerId: s0(64), source: s0(60), notes: s0(4000), lostReason: s0(300),
});

export async function saveDealAction(input: z.input<typeof dealSchema>): Promise<ActionState & { id?: string }> {
  const s = await act("comercial");
  if (!s) return NO_ACCESS;
  const p = dealSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Confira os dados." };
  const d = p.data;
  if (!d.partnerId && !d.leadName && !d.leadCompany) return { error: "Escolha um cliente ou informe o nome do contato ou da empresa." };
  if (d.ownerId) {
    const [u] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, d.ownerId), eq(users.tenantId, s.tenant.id))).limit(1);
    if (!u) return { error: "Responsável inválido." };
  }
  let id = d.id ?? "";
  try {
    await s.tx(async (tx) => {
      const [st] = await tx.select().from(E.crmStages).where(eq(E.crmStages.id, d.stageId)).limit(1);
      if (!st) throw new RuleError("Etapa inválida.");
      const closedAt = st.kind === "aberta" ? null : today();
      const { id: _x, ...v } = d;
      if (id) {
        const [cur] = await tx.select({ closedAt: E.crmDeals.closedAt }).from(E.crmDeals).where(eq(E.crmDeals.id, id)).limit(1);
        if (!cur) throw new RuleError("Oportunidade não encontrada.");
        await tx.update(E.crmDeals).set({ ...v, value: String(d.value), closedAt: st.kind === "aberta" ? null : (cur.closedAt ?? closedAt) }).where(eq(E.crmDeals.id, id));
      } else {
        const number = await nextNumber(tx, s.tenant.id, "crm_deal", E.crmDeals, E.crmDeals.number);
        const [r] = await tx.insert(E.crmDeals).values({ ...v, value: String(d.value), number, closedAt, tenantId: s.tenant.id }).returning({ id: E.crmDeals.id });
        id = r.id;
      }
    });
  } catch (err) {
    return { error: ruleMsg(err) };
  }
  return { ok: true, id, message: "Oportunidade salva." };
}

export async function moveDealAction(id: string, stageId: string): Promise<ActionState> {
  const s = await act("comercial");
  if (!s) return NO_ACCESS;
  try {
    const name = await s.tx(async (tx) => {
      const [st] = await tx.select().from(E.crmStages).where(eq(E.crmStages.id, stageId)).limit(1);
      if (!st) throw new RuleError("Etapa inválida.");
      const r = await tx.update(E.crmDeals).set({ stageId, closedAt: st.kind === "aberta" ? null : today() }).where(eq(E.crmDeals.id, id)).returning({ id: E.crmDeals.id });
      if (!r.length) throw new RuleError("Oportunidade não encontrada.");
      return st.name;
    });
    return { ok: true, message: `Oportunidade movida para “${name}”.` };
  } catch (err) {
    return { error: ruleMsg(err) };
  }
}

export async function deleteDealAction(id: string): Promise<ActionState> {
  const s = await act("comercial");
  if (!s) return NO_ACCESS;
  await s.tx((tx) => tx.delete(E.crmDeals).where(eq(E.crmDeals.id, id)));
  await audit({ action: "crm.oportunidade.excluida", tenantId: s.tenant.id, userId: s.user.id, userEmail: s.user.email, entity: "crm", entityId: id });
  return { ok: true, redirectTo: "/crm?msg=Oportunidade%20exclu%C3%ADda." };
}

const actSchema = z.object({
  id: z.string().max(64).optional(), dealId: s0(64), partnerId: s0(64), type: z.string().max(30), subject: z.string().trim().min(2, "Descreva a atividade.").max(200),
  dueDate: z.string().optional().nullable().refine((v) => !v || isDate(v)).transform((v) => v || null), notes: s0(2000), done: z.boolean().default(false),
});
export async function saveActivityAction(input: z.input<typeof actSchema>): Promise<ActionState> {
  const s = await act("comercial");
  if (!s) return NO_ACCESS;
  const p = actSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Confira a atividade." };
  const { id, ...v } = p.data;
  await s.tx(async (tx) => {
    if (id) await tx.update(E.crmActivities).set({ ...v, doneAt: v.done ? new Date() : null }).where(eq(E.crmActivities.id, id));
    else await tx.insert(E.crmActivities).values({ ...v, doneAt: v.done ? new Date() : null, ownerName: s.user.name, tenantId: s.tenant.id });
  });
  return { ok: true, message: "Atividade salva." };
}
export async function toggleActivityAction(id: string, done: boolean): Promise<ActionState> {
  const s = await act("comercial");
  if (!s) return NO_ACCESS;
  await s.tx((tx) => tx.update(E.crmActivities).set({ done, doneAt: done ? new Date() : null }).where(eq(E.crmActivities.id, id)));
  return { ok: true, message: done ? "Atividade concluída." : "Atividade reaberta." };
}
export async function deleteActivityAction(id: string): Promise<ActionState> {
  const s = await act("comercial");
  if (!s) return NO_ACCESS;
  await s.tx((tx) => tx.delete(E.crmActivities).where(eq(E.crmActivities.id, id)));
  return { ok: true, message: "Atividade excluída." };
}

/** Gera a proposta de venda da oportunidade. Se for um contato novo, cadastra o cliente antes. */
export async function proposalFromDealAction(id: string): Promise<ActionState> {
  const s = await act("comercial");
  if (!s) return NO_ACCESS;
  try {
    const soId = await s.tx(async (tx) => {
      const [d] = await tx.select().from(E.crmDeals).where(eq(E.crmDeals.id, id)).limit(1).for("update");
      if (!d) throw new RuleError("Oportunidade não encontrada.");
      if (d.salesOrderId) return d.salesOrderId;
      let partnerId = d.partnerId;
      if (!partnerId) {
        const [p] = await tx.insert(E.partners).values({ tenantId: s.tenant.id, kinds: ["Cliente"], personType: d.leadCompany ? "PJ" : "PF", name: d.leadCompany || d.leadName || d.title,
          tradeName: d.leadCompany && d.leadName ? null : null, phone: d.leadPhone, email: d.leadEmail }).returning({ id: E.partners.id });
        partnerId = p.id;
        if (d.leadName && d.leadCompany) await tx.insert(E.partnerContacts).values({ tenantId: s.tenant.id, partnerId, name: d.leadName, phone: d.leadPhone, email: d.leadEmail, isPrimary: true });
      }
      const number = await nextNumber(tx, s.tenant.id, "sales_order", E.salesOrders, E.salesOrders.number);
      const [so] = await tx.insert(E.salesOrders).values({ tenantId: s.tenant.id, number, status: "PROPOSTA", partnerId, salespersonId: d.ownerId ?? s.user.id, salespersonName: s.user.name,
        issueDate: today(), internalNotes: `Gerada da oportunidade ${d.number} do CRM: ${d.title}`, crmDealId: d.id }).returning({ id: E.salesOrders.id });
      await tx.update(E.crmDeals).set({ salesOrderId: so.id, partnerId }).where(eq(E.crmDeals.id, id));
      return so.id;
    });
    return { ok: true, message: "Proposta criada. Inclua os itens.", redirectTo: `/pedidos/${soId}#itens` };
  } catch (err) {
    return { error: ruleMsg(err) };
  }
}
